// バックアップ取り込みの確認ダイアログ（判断9,10,18,19）。
// ファイルの中身（サマリ）を見せてからモードを選ばせる。既定はマージ（非破壊）。
// 既存 ConfirmModal は busy 無効化・背景クリック抑止・モード連動の危険表示に対応
// できないため、.modal 系 CSS を再利用した専用コンポーネントにする。
import { useEffect, useState } from 'preact/hooks';
import type { ImportMode } from '../db/backup';
import { formatEpoch } from '../utils/datetime';

/** 確認ダイアログに出すサマリ（判断9）。 */
export interface ImportSummary {
  /** ファイル内の記録件数。 */
  fileEntries: number;
  /** ファイル内のプリセット件数。 */
  filePresets: number;
  /** ファイルの exportedAt(epoch ms)。0 は不明。 */
  exportedAt: number;
  /** 現在の端末の記録件数。 */
  currentEntries: number;
}

interface ImportDialogProps {
  open: boolean;
  summary: ImportSummary | null;
  /** 取り込み処理中。実行/キャンセル/背景クリックを無効化する（判断19a）。 */
  busy: boolean;
  onConfirm: (mode: ImportMode) => void;
  onCancel: () => void;
}

export function ImportDialog({ open, summary, busy, onConfirm, onCancel }: ImportDialogProps) {
  const [mode, setMode] = useState<ImportMode>('merge');
  // 開くたび既定（マージ＝非破壊）へ戻す。前回 replace を選んだ状態を持ち越さない。
  useEffect(() => {
    if (open) setMode('merge');
  }, [open]);
  if (!open || !summary) return null;

  const replace = mode === 'replace';

  return (
    <div class="modal-backdrop" onClick={busy ? undefined : onCancel}>
      <div
        class="modal"
        role="dialog"
        aria-modal="true"
        aria-label="バックアップの取り込み"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 class="modal-title">バックアップから取り込む</h2>

        <div class="modal-body">
          <p>
            ファイル：記録 {summary.fileEntries} 件・感情プリセット {summary.filePresets} 件
            {summary.exportedAt > 0 && <>（{formatEpoch(summary.exportedAt)} に書き出し）</>}
            <br />
            この端末：記録 {summary.currentEntries} 件
          </p>

          <fieldset class="import-modes" disabled={busy}>
            <label class="import-mode">
              <input
                type="radio"
                name="import-mode"
                checked={mode === 'merge'}
                onChange={() => setMode('merge')}
              />
              <span>
                <strong>マージ（おすすめ）</strong>
                <br />
                この端末の記録を残したまま、ファイルの記録を加えます。
              </span>
            </label>
            <label class="import-mode">
              <input
                type="radio"
                name="import-mode"
                checked={replace}
                onChange={() => setMode('replace')}
              />
              <span>
                <strong>完全置換</strong>
                <br />
                この端末の記録を、ファイルの内容にすべて置き換えます。
              </span>
            </label>
          </fieldset>

          <p class="import-note">
            完全置換を選ぶと感情プリセットもファイルの状態に置き換わります。マージでは感情プリセットは変更されません。
          </p>
          {replace && (
            <p class="import-note import-warn">
              念のため、置き換える前に今のデータの書き出し（バックアップ）をおすすめします。
            </p>
          )}
        </div>

        <div class="modal-actions">
          <button type="button" class="btn" onClick={onCancel} disabled={busy}>
            キャンセル
          </button>
          <button
            type="button"
            class={replace ? 'btn btn-danger' : 'btn btn-primary'}
            onClick={() => onConfirm(mode)}
            disabled={busy}
          >
            {busy ? '取り込み中…' : replace ? '置き換えて取り込む' : '取り込む'}
          </button>
        </div>
      </div>
    </div>
  );
}
