// プルチックの感情の輪から感情語を1つ選ぶピッカー（モーダル）。
// 既存の Chip / 自由入力とは別の入力手段。決定すると日本語1語を親へ渡す。
// 1枚選択→基本感情、隣接2枚選択→ダイアド（応用感情）。強度は扱わない。
import { useEffect, useState } from 'preact/hooks';
import { BASICS, areAdjacent, resolveLabel, sectorFor } from '../data/plutchik';

interface EmotionWheelPickerProps {
  open: boolean;
  /** 決定された日本語の語を渡す。 */
  onConfirm: (label: string) => void;
  onCancel: () => void;
}

export function EmotionWheelPicker({ open, onConfirm, onCancel }: EmotionWheelPickerProps) {
  // 選択中の基本感情 key（順序保持、最大2件）。
  const [selected, setSelected] = useState<string[]>([]);

  // 開くたびに選択をリセット。
  useEffect(() => {
    if (open) setSelected([]);
  }, [open]);

  if (!open) return null;

  function onPetalTap(key: string) {
    setSelected((prev) => {
      if (prev.includes(key)) return prev.filter((k) => k !== key); // 再タップで解除
      if (prev.length === 0) return [key];
      if (prev.length === 1) {
        const i = BASICS.findIndex((b) => b.key === prev[0]);
        const j = BASICS.findIndex((b) => b.key === key);
        return areAdjacent(i, j) ? [prev[0], key] : [key]; // 隣接ならダイアド、非隣接はやり直し
      }
      return [key]; // 既に2件→新たに1件から
    });
  }

  const resolved = resolveLabel(selected);
  const canConfirm = resolved !== null;

  // 中央リードアウトのサブ行（ダイアド時に「喜び + 信頼」を表示）。
  const subLabel =
    selected.length === 2
      ? selected
          .map((k) => BASICS.find((b) => b.key === k)?.label)
          .filter(Boolean)
          .join(' + ')
      : '';

  return (
    <div
      class="modal-backdrop"
      onClick={onCancel}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onCancel();
      }}
    >
      <div
        class="modal modal-wheel"
        role="dialog"
        aria-modal="true"
        aria-label="感情の輪から選ぶ"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 class="modal-title">感情の輪から選ぶ</h2>

        <div class="wheel-wrap">
          <svg class="wheel-svg" viewBox="0 0 100 100" aria-hidden="false">
            {BASICS.map((b, i) => {
              const s = sectorFor(i);
              const isSelected = selected.includes(b.key);
              return (
                <g key={b.key}>
                  <path
                    d={s.d}
                    fill={b.color}
                    class={isSelected ? 'wheel-petal selected' : 'wheel-petal'}
                    role="button"
                    tabIndex={0}
                    aria-pressed={isSelected}
                    aria-label={b.label}
                    onClick={() => onPetalTap(b.key)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onPetalTap(b.key);
                      }
                    }}
                  />
                  <text
                    x={s.labelX}
                    y={s.labelY}
                    class="wheel-petal-label"
                    text-anchor="middle"
                    dominant-baseline="central"
                    aria-hidden="true"
                  >
                    {b.label}
                  </text>
                </g>
              );
            })}
          </svg>

          <div class="wheel-readout" role="status" aria-live="polite">
            {resolved ? (
              <>
                <span class="word">{resolved}</span>
                {subLabel && <span class="sub">{subLabel}</span>}
              </>
            ) : (
              <span class="placeholder">感情を選んでください</span>
            )}
          </div>
        </div>

        <div class="modal-actions">
          <button type="button" class="btn" onClick={onCancel}>
            キャンセル
          </button>
          <button
            type="button"
            class="btn btn-primary"
            disabled={!canConfirm}
            onClick={() => resolved && onConfirm(resolved)}
          >
            決定
          </button>
        </div>
      </div>
    </div>
  );
}
