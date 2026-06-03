// トーストの表示コンポーネント。アプリ最上部に1つ置く。
import { useEffect } from 'preact/hooks';
import { useToast, dismissToast } from './toast';

export function ToastHost() {
  const toast = useToast();

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(dismissToast, toast.duration);
    return () => clearTimeout(timer);
  }, [toast?.id]);

  if (!toast) return null;

  return (
    <div class="toast" role="status">
      <span class="toast-message">{toast.message}</span>
      {toast.action && (
        <button
          type="button"
          class="toast-action"
          onClick={() => {
            toast.action!.onClick();
            dismissToast();
          }}
        >
          {toast.action.label}
        </button>
      )}
      <button type="button" class="toast-close" aria-label="閉じる" onClick={dismissToast}>
        ×
      </button>
    </div>
  );
}
