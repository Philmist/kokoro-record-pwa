// 極小のトースト用ストア。Undo 付きトーストを表示するために使う。
import { useEffect, useState } from 'preact/hooks';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastState {
  id: number;
  message: string;
  action?: ToastAction;
  /** 自動で閉じるまでのミリ秒。 */
  duration: number;
}

type Listener = (state: ToastState | null) => void;

let current: ToastState | null = null;
let nextId = 1;
const listeners = new Set<Listener>();

function emit(): void {
  for (const l of listeners) l(current);
}

/** トーストを表示する。Undo などの action を渡せる。 */
export function showToast(message: string, options?: { action?: ToastAction; duration?: number }): void {
  current = {
    id: nextId++,
    message,
    action: options?.action,
    duration: options?.duration ?? 6000,
  };
  emit();
}

export function dismissToast(): void {
  current = null;
  emit();
}

/** ToastHost 用フック。現在のトースト状態を購読する。 */
export function useToast(): ToastState | null {
  const [state, setState] = useState<ToastState | null>(current);
  useEffect(() => {
    listeners.add(setState);
    return () => {
      listeners.delete(setState);
    };
  }, []);
  return state;
}
