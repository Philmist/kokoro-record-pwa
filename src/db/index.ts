// IndexedDB アクセスの隔離層。アプリの他の場所はこのモジュール経由でのみ永続化に触れる。
// 将来 Dexie 等へ差し替える場合もここに閉じる。詳細は SPEC.md を参照。
import { openDB } from 'idb';
import type { DBSchema, IDBPDatabase } from 'idb';
import type { Entry, EmotionPreset, EntryDraft } from '../types';
import { DEFAULT_EMOTION_LABELS } from '../data/defaultPresets';
import { uuid } from '../utils/id';
import { buildEnvelope } from './backup';
import type { BackupEnvelope } from './backup';

const DB_NAME = 'kokoro-log';
const DB_VERSION = 1;

interface KokoroDB extends DBSchema {
  entries: {
    key: string;
    value: Entry;
    indexes: { 'by-date': string };
  };
  emotionPresets: {
    key: string;
    value: EmotionPreset;
  };
}

let dbPromise: Promise<IDBPDatabase<KokoroDB>> | null = null;

function getDB(): Promise<IDBPDatabase<KokoroDB>> {
  if (!dbPromise) {
    dbPromise = openDB<KokoroDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const entries = db.createObjectStore('entries', { keyPath: 'id' });
        entries.createIndex('by-date', 'date');

        const presets = db.createObjectStore('emotionPresets', { keyPath: 'id' });
        // 初期プリセットを投入。
        DEFAULT_EMOTION_LABELS.forEach((label, order) => {
          presets.add({ id: uuid(), label, order });
        });
      },
    });
  }
  return dbPromise;
}

// ---- Entry ----

/** 全件を出来事日時の降順（新しい順）で返す。 */
export async function getAllEntries(): Promise<Entry[]> {
  const db = await getDB();
  const all = await db.getAllFromIndex('entries', 'by-date');
  return all.reverse();
}

export async function getEntry(id: string): Promise<Entry | undefined> {
  const db = await getDB();
  return db.get('entries', id);
}

/** 新規作成。タイムスタンプと printedAt を補って保存する。 */
export async function createEntry(draft: EntryDraft): Promise<Entry> {
  const now = Date.now();
  const entry: Entry = { ...draft, printedAt: null, createdAt: now, updatedAt: now };
  const db = await getDB();
  await db.put('entries', entry);
  return entry;
}

/** 既存を更新。createdAt と printedAt は保持し、updatedAt のみ更新する。 */
export async function updateEntry(draft: EntryDraft): Promise<Entry> {
  const db = await getDB();
  const existing = await db.get('entries', draft.id);
  const now = Date.now();
  const entry: Entry = {
    ...draft,
    printedAt: existing?.printedAt ?? null,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  await db.put('entries', entry);
  return entry;
}

/** 印刷済みフラグを設定（printedAt に時刻、null で未印刷へ戻す）。 */
export async function setPrinted(id: string, printedAt: number | null): Promise<Entry | undefined> {
  const db = await getDB();
  const existing = await db.get('entries', id);
  if (!existing) return undefined;
  const entry: Entry = { ...existing, printedAt };
  await db.put('entries', entry);
  return entry;
}

export async function deleteEntry(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('entries', id);
}

/** 削除取り消し用：完全な Entry をそのまま書き戻す。 */
export async function restoreEntry(entry: Entry): Promise<void> {
  const db = await getDB();
  await db.put('entries', entry);
}

// ---- EmotionPreset ----

export async function getPresets(): Promise<EmotionPreset[]> {
  const db = await getDB();
  const all = await db.getAll('emotionPresets');
  return all.sort((a, b) => a.order - b.order);
}

export async function addPreset(label: string): Promise<EmotionPreset> {
  const db = await getDB();
  const all = await db.getAll('emotionPresets');
  const maxOrder = all.reduce((m, p) => Math.max(m, p.order), -1);
  const preset: EmotionPreset = { id: uuid(), label, order: maxOrder + 1 };
  await db.put('emotionPresets', preset);
  return preset;
}

export async function renamePreset(id: string, label: string): Promise<void> {
  const db = await getDB();
  const existing = await db.get('emotionPresets', id);
  if (!existing) return;
  await db.put('emotionPresets', { ...existing, label });
}

export async function deletePreset(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('emotionPresets', id);
}

// ---- バックアップ（エクスポート/インポート） ----
// 注意: idb のトランザクションは、途中で非 IDB の Promise を await すると
// 自動コミット/クローズされる。各関数は単一トランザクション内で IDB 操作のみを
// await し、最後に tx.done を待つ。確定仕様はメモリ backup-export-import-design.md。

/** 現在の全データをバックアップ封筒として書き出す（判断4,5）。 */
export async function exportSnapshot(): Promise<BackupEnvelope> {
  const db = await getDB();
  const entries = await db.getAll('entries');
  const presets = await db.getAll('emotionPresets');
  return buildEnvelope(entries, presets);
}

/**
 * 完全置換（判断3,14）。両ストアを clear → put×N を単一トランザクションで実行。
 * 途中で例外（QuotaExceededError 等）→ トランザクション abort で全ロールバック。
 * 例外は呼び出し側へ伝播（err.name を保つ）。置換 Undo の全復元にも再利用する。
 */
export async function replaceAll(entries: Entry[], presets: EmotionPreset[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(['entries', 'emotionPresets'], 'readwrite');
  const entryStore = tx.objectStore('entries');
  const presetStore = tx.objectStore('emotionPresets');
  await entryStore.clear();
  await presetStore.clear();
  for (const e of entries) entryStore.put(e);
  for (const p of presets) presetStore.put(p);
  await tx.done;
}

/** マージ結果の内訳（判断16）。 */
export interface MergeResult {
  /** 端末に無く新規追加した件数。 */
  added: number;
  /** ファイル側 updatedAt が新しく上書きした件数。 */
  overwritten: number;
  /** 端末側が新しいか同じでファイル側を捨てた件数。 */
  keptBack: number;
}

/**
 * マージ（判断2,3,16）。entries のみ id をキーに和集合、衝突は updatedAt 新優先。
 * emotionPresets は触らない。単一トランザクションで全成功/全失敗（判断14）。
 */
export async function mergeEntries(incoming: Entry[]): Promise<MergeResult> {
  const db = await getDB();
  const tx = db.transaction('entries', 'readwrite');
  const store = tx.objectStore('entries');
  const existing = await store.getAll();
  const byId = new Map<string, Entry>();
  for (const e of existing) byId.set(e.id, e);

  let added = 0;
  let overwritten = 0;
  let keptBack = 0;
  for (const inc of incoming) {
    const cur = byId.get(inc.id);
    if (!cur) {
      store.put(inc);
      added++;
    } else if (inc.updatedAt > cur.updatedAt) {
      store.put(inc);
      overwritten++;
    } else {
      keptBack++;
    }
  }
  await tx.done;
  return { added, overwritten, keptBack };
}
