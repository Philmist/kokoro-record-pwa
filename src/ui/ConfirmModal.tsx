// 確認ダイアログ。削除など取り消しの効きにくい操作の前に出す。
import type { ComponentChildren } from 'preact';

interface ConfirmModalProps {
  open: boolean;
  title: string;
  body?: ComponentChildren;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({
  open,
  title,
  body,
  confirmLabel = 'OK',
  cancelLabel = 'キャンセル',
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  if (!open) return null;
  return (
    <div class="modal-backdrop" onClick={onCancel}>
      <div
        class="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 class="modal-title">{title}</h2>
        {body && <div class="modal-body">{body}</div>}
        <div class="modal-actions">
          <button type="button" class="btn" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            type="button"
            class={destructive ? 'btn btn-danger' : 'btn btn-primary'}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
