// 選択したエントリを「PC で眺める」ための YAML テキストへ書き出す純ロジック。
// YAML ライブラリは入れない（依存最小方針）。対象データ型は
// 文字列 / 数値 / null / 文字列配列 に限定されるので、用途特化の小さなエミッタを自作する。
//
// 正しさの最終防波堤は「ダブルクォート + エスケープ」（任意の文字列を必ず表現できる）。
// その上で、読みやすさのために
//   - 複数行の本文 → リテラルブロック(| / |-)
//   - 安全な単一行  → プレーンスカラー
// を優先する。どれも使えない/危ういものはダブルクォートに落とす。
import type { Entry } from '../types';

/** 出力する項目と順序。id / printedAt / createdAt / updatedAt は「眺める」用途では出さない。 */
type OutKey = 'date' | 'situation' | 'thought' | 'action' | 'body' | 'note';

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** 端末ローカル壁時計を 'YYYY-MM-DD HH:mm' で返す。 */
function localStamp(date: Date): string {
  const y = date.getFullYear();
  const mo = pad2(date.getMonth() + 1);
  const d = pad2(date.getDate());
  const h = pad2(date.getHours());
  const mi = pad2(date.getMinutes());
  return `${y}-${mo}-${d} ${h}:${mi}`;
}

/** 書き出しファイル名。端末ローカル壁時計・秒なし・ゼロ埋め（backupFileName と同方針）。 */
export function yamlFileName(date: Date = new Date()): string {
  const y = date.getFullYear();
  const mo = pad2(date.getMonth() + 1);
  const d = pad2(date.getDate());
  const h = pad2(date.getHours());
  const mi = pad2(date.getMinutes());
  return `kokoro-log-${y}-${mo}-${d}-${h}${mi}.yaml`;
}

/** YAML 1.1 で文字列以外（数値/真偽/null/日付）に読まれてしまう字面か。 */
function looksLikeNonString(s: string): boolean {
  const lower = s.toLowerCase();
  if (['null', '~', 'true', 'false', 'yes', 'no', 'on', 'off', '.inf', '-.inf', '.nan'].includes(lower)) {
    return true;
  }
  if (/^[-+]?[0-9]+$/.test(s)) return true; // 整数
  if (/^0x[0-9a-f]+$/i.test(s)) return true; // 16進
  if (/^0o?[0-7]+$/i.test(s)) return true; // 8進
  if (/^[-+]?(\.[0-9]+|[0-9]+(\.[0-9]*)?)([eE][-+]?[0-9]+)?$/.test(s)) return true; // 浮動小数
  if (/^[0-9]{4}-[0-9]{1,2}-[0-9]{1,2}/.test(s)) return true; // 日付/タイムスタンプ
  if (/^[0-9]+:[0-9]+/.test(s)) return true; // 60進(HH:MM 等)
  return false;
}

const PLAIN_UNSAFE_FIRST = new Set('-?:,[]{}#&*!|>\'"%@`'.split(''));

/** 単一行文字列がプレーンスカラーとして安全に書けるか（すべて満たすときだけ true）。 */
function isPlainSafe(s: string): boolean {
  if (s.length === 0) return false;
  if (/^\s/.test(s) || /\s$/.test(s)) return false; // 先頭/末尾の空白
  if (/[\x00-\x1f]/.test(s)) return false; // 制御文字（タブ含む）
  if (PLAIN_UNSAFE_FIRST.has(s[0])) return false; // 先頭が指示子文字
  if (s.includes(': ') || s.endsWith(':')) return false; // マップ値と誤読
  if (s.includes(' #')) return false; // コメント開始と誤読
  if (looksLikeNonString(s)) return false; // 数値/真偽/null/日付に見える
  return true;
}

/** 任意の単一行文字列を安全に表現するダブルクォート表記。 */
function doubleQuote(s: string): string {
  let out = '"';
  for (const ch of s) {
    const code = ch.codePointAt(0)!;
    if (ch === '\\') out += '\\\\';
    else if (ch === '"') out += '\\"';
    else if (ch === '\n') out += '\\n';
    else if (ch === '\t') out += '\\t';
    else if (ch === '\r') out += '\\r';
    else if (code < 0x20) out += '\\x' + code.toString(16).padStart(2, '0').toUpperCase();
    else out += ch;
  }
  return out + '"';
}

/** 単一行文字列のインライン表記（プレーン優先、危ういものはダブルクォート）。 */
function inlineScalar(s: string): string {
  if (s === '') return '""';
  return isPlainSafe(s) ? s : doubleQuote(s);
}

/**
 * 複数行文字列をリテラルブロックとして書けるなら { indicator, lines } を返す。
 * 書けない（行末空白・先頭行のインデント・\n 以外の制御文字・末尾改行2つ以上）→ null。
 * @param contentIndent 本文各行に付けるインデント幅。
 */
function tryBlock(s: string, contentIndent: number): { indicator: string; lines: string[] } | null {
  if (!s.includes('\n')) return null;
  // \n(0x0a) 以外の制御文字（\t, \r 等）が混ざるとブロックで壊れる → 却下。
  if (/[\x00-\x09\x0b-\x1f]/.test(s)) return null;

  let indicator: string;
  let body: string;
  if (s.endsWith('\n')) {
    if (s.endsWith('\n\n')) return null; // 末尾改行2つ以上はダブルクォートへ。
    indicator = '|'; // clip: 末尾に改行1つを残す。
    body = s.slice(0, -1);
  } else {
    indicator = '|-'; // strip: 末尾改行なし（本文の大半）。
    body = s;
  }

  const lines = body.split('\n');
  for (const l of lines) {
    if (/[ \t]$/.test(l)) return null; // 行末空白は見えず壊れやすい → 却下。
  }
  // ブロックのインデントは最初の非空行から自動検出される。先頭がスペース始まりだと崩れる。
  const firstNonEmpty = lines.find((l) => l.length > 0);
  if (firstNonEmpty !== undefined && /^\s/.test(firstNonEmpty)) return null;

  const pad = ' '.repeat(contentIndent);
  const out = lines.map((l) => (l.length === 0 ? '' : pad + l));
  return { indicator, lines: out };
}

/** 文字列フィールド1つを lines へ追記する。 */
function pushString(lines: string[], key: OutKey, value: string, indent: number): void {
  const pad = ' '.repeat(indent);
  if (value === '') {
    lines.push(`${pad}${key}: ""`);
    return;
  }
  if (value.includes('\n')) {
    const block = tryBlock(value, indent + 2);
    if (block) {
      lines.push(`${pad}${key}: ${block.indicator}`);
      lines.push(...block.lines);
    } else {
      lines.push(`${pad}${key}: ${doubleQuote(value)}`);
    }
    return;
  }
  lines.push(`${pad}${key}: ${inlineScalar(value)}`);
}

/** emotions（文字列配列）を lines へ追記する。 */
function pushEmotions(lines: string[], emotions: string[], indent: number): void {
  const pad = ' '.repeat(indent);
  if (emotions.length === 0) {
    lines.push(`${pad}emotions: []`);
    return;
  }
  lines.push(`${pad}emotions:`);
  const itemPad = ' '.repeat(indent + 2);
  for (const em of emotions) {
    // 感情名に改行が入るのは病的ケース。その場合はダブルクォートで安全に。
    const item = em.includes('\n') ? doubleQuote(em) : inlineScalar(em);
    lines.push(`${itemPad}- ${item}`);
  }
}

/** 選択された Entry 群を YAML 文字列（マッピングのシーケンス）へ変換する。 */
export function entriesToYaml(entries: Entry[]): string {
  const lines: string[] = [
    '# こころの記録 — 書き出し',
    `# ${localStamp(new Date())} 時点 / ${entries.length}件`,
  ];

  for (const e of entries) {
    const item: string[] = [];
    // date は日付/タイムスタンプ字面のため必ずダブルクォートされる（isPlainSafe が弾く）。
    pushString(item, 'date', e.date, 2);
    pushString(item, 'situation', e.situation, 2);
    pushString(item, 'thought', e.thought, 2);
    pushString(item, 'action', e.action, 2);
    pushString(item, 'body', e.body, 2);
    // intensity: 未設定は null（0 と区別する）。
    item.push(`  intensity: ${e.intensity === null ? 'null' : e.intensity}`);
    pushEmotions(item, e.emotions, 2);
    pushString(item, 'note', e.note, 2);

    // 先頭行の "  " を "- " に置き換えてシーケンス要素にする。
    item[0] = '- ' + item[0].slice(2);
    lines.push(...item);
  }

  return lines.join('\n') + '\n';
}
