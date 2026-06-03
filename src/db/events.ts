// 記録の変更をビューに伝える極小イベントバス。
// 主に「Undo で復元したとき、表示中の一覧へ反映する」用途。
type Listener = () => void;
const listeners = new Set<Listener>();

export function emitEntriesChanged(): void {
  for (const l of listeners) l();
}

export function onEntriesChanged(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
