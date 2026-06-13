// バックアップ（エクスポート/インポート）の純ロジック。
// IndexedDB には依存しない（封筒の組立・検証・レコード補正のみ）。
// DB への書き込みは db/index.ts のトランザクション関数が担う。
// 確定仕様はメモリ backup-export-import-design.md（判断1〜19）を参照。
import type { Entry, EmotionPreset } from '../types';

/** バックアップファイルの識別固定文字列。無関係な JSON を弾く第一関門。 */
export const BACKUP_FORMAT = 'kokoro-log-backup';
/** ファイル形式の世代。DB_VERSION とは別概念（将来のマイグレーション判断用）。 */
export const BACKUP_SCHEMA_VERSION = 1;

/** エクスポート/インポートで受け渡す封筒。 */
export interface BackupEnvelope {
  format: typeof BACKUP_FORMAT;
  schemaVersion: number;
  /** エクスポート時刻(epoch ms)。情報・デバッグ用。 */
  exportedAt: number;
  /** エクスポート端末の IANA タイムゾーン名。情報メモのみ（date は無変換）。 */
  timezone: string;
  /** アプリのバージョン。情報・デバッグ用。 */
  appVersion: string;
  entries: Entry[];
  emotionPresets: EmotionPreset[];
}

/** インポートのモード。replace=完全置換、merge=和集合マージ（既定）。 */
export type ImportMode = 'replace' | 'merge';

/** 封筒検証の結果。 */
export type ParseResult =
  | { ok: true; envelope: BackupEnvelope }
  // unreadable: parse 失敗 / format 不一致 / 構造不正（別 JSON か破損かは区別しない）。
  // too-new: schemaVersion が現行より新しい（未来のアプリが書いたファイル）。
  | { ok: false; reason: 'unreadable' | 'too-new' };

/** レコード補正の結果（投入セット＋報告用カウント）。 */
export interface NormalizeResult {
  /** 投入対象の有効な Entry（致命キー欠落分は除外済み）。 */
  valid: Entry[];
  /** id か date 欠落でスキップした件数。 */
  skipped: number;
  /** situation 空で「要確認」として通した件数。 */
  situationEmpty: number;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** 現在のデータから封筒を組み立てる（判断4,5,6）。 */
export function buildEnvelope(entries: Entry[], emotionPresets: EmotionPreset[]): BackupEnvelope {
  return {
    format: BACKUP_FORMAT,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: Date.now(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    appVersion: __APP_VERSION__,
    entries,
    emotionPresets,
  };
}

/** エクスポートファイル名。端末ローカル壁時計時刻・秒なし・ゼロ埋め（判断8）。 */
export function backupFileName(date: Date = new Date()): string {
  const y = date.getFullYear();
  const mo = pad2(date.getMonth() + 1);
  const d = pad2(date.getDate());
  const h = pad2(date.getHours());
  const mi = pad2(date.getMinutes());
  return `${BACKUP_FORMAT}-${y}-${mo}-${d}-${h}${mi}.json`;
}

/**
 * テキストを JSON.parse し封筒として検証する（判断11）。
 * 弾く境界はメモリ判断11の通り。schemaVersion>現行 のみ 'too-new' で区別。
 */
export function parseAndValidate(text: string): ParseResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'unreadable' };
  }
  if (typeof data !== 'object' || data === null) {
    return { ok: false, reason: 'unreadable' };
  }
  const obj = data as Record<string, unknown>;
  if (obj.format !== BACKUP_FORMAT) {
    return { ok: false, reason: 'unreadable' };
  }
  if (typeof obj.schemaVersion !== 'number' || Number.isNaN(obj.schemaVersion)) {
    return { ok: false, reason: 'unreadable' };
  }
  if (obj.schemaVersion < 1) {
    return { ok: false, reason: 'unreadable' };
  }
  if (obj.schemaVersion > BACKUP_SCHEMA_VERSION) {
    // 未来のアプリが書いたファイルを旧アプリで開いた。黙ってデータ破壊しないため丁寧に弾く。
    return { ok: false, reason: 'too-new' };
  }
  if (!Array.isArray(obj.entries) || !Array.isArray(obj.emotionPresets)) {
    return { ok: false, reason: 'unreadable' };
  }
  // ここまで通れば封筒として受理。レコード単位の補正は normalizeEntries が行う。
  return {
    ok: true,
    envelope: {
      format: BACKUP_FORMAT,
      schemaVersion: obj.schemaVersion,
      exportedAt: typeof obj.exportedAt === 'number' ? obj.exportedAt : 0,
      timezone: typeof obj.timezone === 'string' ? obj.timezone : '',
      appVersion: typeof obj.appVersion === 'string' ? obj.appVersion : '',
      entries: obj.entries as Entry[],
      emotionPresets: obj.emotionPresets as EmotionPreset[],
    },
  };
}

/**
 * レコード単位の検証・補正（判断12, 案C＝最小・補正）。
 * 致命キー id/date 欠落のみスキップ。他フィールドは既定値で補完。
 * situation 空は通すが要確認としてカウント。
 * @param now タイムスタンプ補完に使う取り込み時刻(epoch ms)。
 */
export function normalizeEntries(rawEntries: unknown[], now: number = Date.now()): NormalizeResult {
  const valid: Entry[] = [];
  let skipped = 0;
  let situationEmpty = 0;

  for (const raw of rawEntries) {
    if (typeof raw !== 'object' || raw === null) {
      skipped++;
      continue;
    }
    const r = raw as Record<string, unknown>;
    // 致命キー：index/マージの土台なので救えない。
    if (typeof r.id !== 'string' || r.id === '' || typeof r.date !== 'string' || r.date === '') {
      skipped++;
      continue;
    }

    const situation = typeof r.situation === 'string' ? r.situation : '';
    if (situation.trim() === '') situationEmpty++;

    const entry: Entry = {
      id: r.id,
      date: r.date,
      situation,
      thought: typeof r.thought === 'string' ? r.thought : '',
      action: typeof r.action === 'string' ? r.action : '',
      body: typeof r.body === 'string' ? r.body : '',
      intensity: typeof r.intensity === 'number' ? r.intensity : null,
      emotions: Array.isArray(r.emotions) ? r.emotions.filter((e): e is string => typeof e === 'string') : [],
      note: typeof r.note === 'string' ? r.note : '',
      printedAt: typeof r.printedAt === 'number' ? r.printedAt : null,
      createdAt: typeof r.createdAt === 'number' ? r.createdAt : now,
      updatedAt: typeof r.updatedAt === 'number' ? r.updatedAt : now,
    };
    valid.push(entry);
  }

  return { valid, skipped, situationEmpty };
}

/**
 * プリセットの最小補正（完全置換のスナップショット復元用）。
 * 1件の不正で置換トランザクション全体が abort するのを避けるため、id を持たないものは
 * 捨て、欠けたフィールドは既定値で補う。プリセットはマージ対象外（判断3）。
 */
export function normalizePresets(raw: unknown[]): EmotionPreset[] {
  const out: EmotionPreset[] = [];
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;
    const p = item as Record<string, unknown>;
    if (typeof p.id !== 'string' || p.id === '') continue;
    out.push({
      id: p.id,
      label: typeof p.label === 'string' ? p.label : '',
      order: typeof p.order === 'number' ? p.order : 0,
    });
  }
  return out;
}
