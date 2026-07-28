// 履歴まわりの面倒を1か所に集めたモジュール。扱うのは次の2つ。
//
// 1. 戻るボタンで閉じられる一時的な状態（選択モード・モーダル・離脱ガード）
//    これらは URL を持たないため、そのままだと Android の戻るボタンが
//    「モーダルを閉じる」ではなくブラウザ履歴を1つ消費してしまう。画面を飛び越え、
//    履歴の先頭まで抜けると真っ白な画面になる。開いているあいだだけ
//    「URL を変えないダミーの履歴エントリ」を積み、戻るでそれを消費させる。
//
//    URL を変えないのが肝。preact-iso の popstate ハンドラは
//    `location.pathname + location.search` を次の state として返すので、URL が同じなら
//    useReducer が同一値と判断して bail out し、ルートの再描画は起きない。
//
// 2. アプリ内の潜り込み深さ
//    「一覧へ戻る」を replace で行うと履歴は伸び続ける（潜るときの push が消えない）。
//    各エントリに深さを刻んでおき、戻るときは実際に history を巻き戻して
//    push を打ち消す。往復しても履歴が伸びない。
import { useEffect, useRef } from 'preact/hooks';

/** 戻るを受理したら void、踏みとどまるなら false を返す。 */
type OnBack = () => boolean | void;

interface Guard {
  onBack: OnBack;
}

interface HistoryState {
  __depth?: number;
  __backGuard?: true;
}

/** 積んだ順のガード。末尾＝最後に積んだもの＝最初に戻るで閉じられるもの。 */
const armed: Guard[] = [];

/** 自前の history 操作で発生する予定の popstate 回数。これは素通しする。 */
let expectedPops = 0;

/** UI 側で閉じられて片付け待ちのダミーエントリ数（マイクロタスクでまとめて戻す）。 */
let pendingPops = 0;
let flushScheduled = false;

let listening = false;

/** アプリの入口を 0 とした、現在の履歴エントリの深さ。 */
let depth = 0;

function currentState(): HistoryState | null {
  return history.state as HistoryState | null;
}

// ---- 深さの記録 ----------------------------------------------------------

/**
 * アプリ起動時に、いまの履歴エントリを入口（深さ 0）として刻む。
 * render の前に一度だけ呼ぶ。
 */
export function initHistoryDepth(): void {
  depth = 0;
  history.replaceState({ ...currentState(), __depth: 0 } satisfies HistoryState, '');
}

/**
 * ルート遷移のたびに現在のエントリへ深さを刻む。
 * preact-iso の push は state が null なので「刻まれていない＝新しい push」と判別できる。
 * 戻る/進むで既知のエントリに来た場合は、そこに刻まれた深さを読み直す。
 */
export function recordNavigation(): void {
  const state = currentState();
  if (state && typeof state.__depth === 'number') {
    depth = state.__depth;
    return;
  }
  depth += 1;
  history.replaceState({ ...state, __depth: depth } satisfies HistoryState, '');
}

// ---- 戻るボタンのガード --------------------------------------------------

function pushGuardEntry(): void {
  // URL は変えない（第3引数を渡さない）。深さは現在のエントリと同じものを引き継ぐ。
  history.pushState({ __backGuard: true, __depth: depth } satisfies HistoryState, '');
}

function onPopState(): void {
  if (expectedPops > 0) {
    expectedPops--;
    return;
  }
  const guard = armed.pop();
  if (!guard) return; // ガードが無いときの popstate は通常のルート遷移。
  if (guard.onBack() === false) {
    // 踏みとどまる：ダミーエントリを積み直す。
    armed.push(guard);
    pushGuardEntry();
  }
}

function ensureListening(): void {
  if (listening) return;
  listening = true;
  addEventListener('popstate', onPopState);
}

/** UI 側で閉じられたぶんのダミーエントリを、まとめて1回の go() で片付ける。 */
function schedulePop(): void {
  pendingPops++;
  if (flushScheduled) return;
  flushScheduled = true;
  queueMicrotask(() => {
    flushScheduled = false;
    const n = pendingPops;
    pendingPops = 0;
    if (n === 0) return;
    expectedPops++; // go() は何段戻っても popstate は1回。
    history.go(-n);
  });
}

/**
 * active のあいだ、戻るボタンで閉じられるダミーの履歴エントリを1つ積む。
 * 戻るが押されたら onBack() を呼び、false が返れば積み直して踏みとどまる。
 * active が false になったら、積んだエントリは自動で片付ける。
 */
export function useBackGuard(active: boolean, onBack: OnBack): void {
  // onBack は毎レンダー作り直される想定なので、ref 越しに最新を呼ぶ。
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;

  useEffect(() => {
    if (!active) return;
    const guard: Guard = { onBack: () => onBackRef.current() };
    armed.push(guard);
    pushGuardEntry();
    ensureListening();
    return () => {
      const i = armed.indexOf(guard);
      if (i === -1) return; // すでに戻るで消費済み。
      armed.splice(i, 1);
      schedulePop();
    };
  }, [active]);
}

// ---- 遷移 ----------------------------------------------------------------

/** history.go(-n) を発行し、popstate が来るまで待つ。 */
function goBack(n: number): Promise<void> {
  return new Promise((resolve) => {
    expectedPops++;
    function done() {
      removeEventListener('popstate', done);
      resolve();
    }
    // onPopState は先に登録済みなので、こちらより先に走って expectedPops を消費する。
    ensureListening();
    addEventListener('popstate', done);
    history.go(-n);
  });
}

/**
 * 積んであるダミーエントリをすべて取り除く。
 * これを挟まないと、ガードの片付け（非同期の go）と遷移が競合して
 * 意図しない履歴エントリに着地する。
 */
export function unwindBackGuards(): Promise<void> {
  const n = armed.length + pendingPops;
  armed.length = 0;
  pendingPops = 0;
  if (n === 0) return Promise.resolve();
  return goBack(n);
}

/**
 * 一覧へ「戻る」。潜るときに積んだ push を実際に巻き戻すので、往復しても履歴が伸びない。
 * 入口が一覧でない場合（記入画面へ直リンクした等）は replace で移動する。
 */
export async function returnToList(
  route: (url: string, replace?: boolean) => void,
): Promise<void> {
  await unwindBackGuards();
  if (depth > 0) {
    await goBack(depth);
    if (location.pathname === '/') return;
  }
  route('/', true);
}
