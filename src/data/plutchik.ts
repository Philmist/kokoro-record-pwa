// プルチックの感情の輪のデータと、輪を描くためのジオメトリ・選択解決ロジック。
// 感情ピッカー(EmotionWheelPicker)専用。記録のスキーマ(emotions: string[])は変えず、
// ここで解決した日本語1語を記録へ追記する。

export interface Basic {
  /** 安定した識別子（隣接判定は配列の index 基準）。 */
  key: string;
  /** 記録に書き込む日本語の語。 */
  label: string;
  /** 花びらの塗り色。中の濃い文字が読めるよう淡色にする。 */
  color: string;
}

// 時計回り順（先頭=喜びが真上12時）。隣接ダイアドはこの並びの隣同士で決まる。
export const BASICS: Basic[] = [
  { key: 'joy', label: '喜び', color: '#FFE45C' },
  { key: 'trust', label: '信頼', color: '#A8E05F' },
  { key: 'fear', label: '恐れ', color: '#5FBF77' },
  { key: 'surprise', label: '驚き', color: '#5FC9D6' },
  { key: 'sadness', label: '悲しみ', color: '#6FA8DC' },
  { key: 'disgust', label: '嫌悪', color: '#B98FD6' },
  { key: 'anger', label: '怒り', color: '#E57373' },
  { key: 'anticipation', label: '期待', color: '#F2A65A' },
];

// DYADS[i] = BASICS[i] と BASICS[(i+1)%8] の間の応用感情（隣接ダイアド）。
export const DYADS = ['愛', '服従', '畏怖', '失望', '後悔', '軽蔑', '攻撃性', '楽観'];

/** 8感情の円環で index i と j が隣り合うか（7=0と7のラップ）。 */
export function areAdjacent(i: number, j: number): boolean {
  const d = Math.abs(i - j);
  return d === 1 || d === BASICS.length - 1;
}

/** 隣接ペア (i, j) に対応する DYADS のインデックス。 */
function dyadIndex(i: number, j: number): number {
  const lo = Math.min(i, j);
  const hi = Math.max(i, j);
  // ラップ (0, 7) は末尾のダイアド。それ以外は小さい側の index。
  return lo === 0 && hi === BASICS.length - 1 ? BASICS.length - 1 : lo;
}

/**
 * 選択中の基本感情 key（0〜2件）から、記録に書き込む日本語の語を求める。
 * 1件→その基本語 / 2件かつ隣接→対応するダイアド語 / それ以外→null。
 */
export function resolveLabel(selectedKeys: string[]): string | null {
  if (selectedKeys.length === 1) {
    const b = BASICS.find((x) => x.key === selectedKeys[0]);
    return b ? b.label : null;
  }
  if (selectedKeys.length === 2) {
    const i = BASICS.findIndex((x) => x.key === selectedKeys[0]);
    const j = BASICS.findIndex((x) => x.key === selectedKeys[1]);
    if (i < 0 || j < 0 || !areAdjacent(i, j)) return null;
    return DYADS[dyadIndex(i, j)];
  }
  return null;
}

// ---- 輪のジオメトリ（viewBox 0 0 100 100, 中心(50,50)） ----
export const CX = 50;
export const CY = 50;
const R = 46; // 花びら外周
const R_HOLE = 14; // 中央リードアウト用のドーナツ穴
const R_LABEL = 30; // ラベルを置く半径

/** 角度(度) 0=真上(12時)、時計回り正。極座標→直交座標。 */
export function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const a = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

/** R_HOLE〜R のドーナツ扇形パス（start→end は時計回り）。 */
export function sectorPath(startDeg: number, endDeg: number): string {
  const oStart = polarToCartesian(CX, CY, R, startDeg);
  const oEnd = polarToCartesian(CX, CY, R, endDeg);
  const iEnd = polarToCartesian(CX, CY, R_HOLE, endDeg);
  const iStart = polarToCartesian(CX, CY, R_HOLE, startDeg);
  const largeArc = endDeg - startDeg > 180 ? 1 : 0; // 45度なので常に0
  return [
    `M ${oStart.x} ${oStart.y}`,
    `A ${R} ${R} 0 ${largeArc} 1 ${oEnd.x} ${oEnd.y}`,
    `L ${iEnd.x} ${iEnd.y}`,
    `A ${R_HOLE} ${R_HOLE} 0 ${largeArc} 0 ${iStart.x} ${iStart.y}`,
    'Z',
  ].join(' ');
}

/** BASICS[index] の扇形パスとラベル座標。 */
export function sectorFor(index: number) {
  const start = index * 45;
  const end = start + 45;
  const mid = start + 22.5;
  const labelPos = polarToCartesian(CX, CY, R_LABEL, mid);
  return { start, end, d: sectorPath(start, end), labelX: labelPos.x, labelY: labelPos.y };
}
