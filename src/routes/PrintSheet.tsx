// 印刷専用シート（A4縦・1件）。画面では非表示、@media print 時のみ表示する。
// 印刷対象は (*) 項目のみ。未入力の任意項目は見出しごと省略。備考は印刷しない。
import type { Entry } from '../types';
import { formatDateTime } from '../utils/datetime';

function Block({ label, value }: { label: string; value: string }) {
  if (!value.trim()) return null;
  return (
    <div class="print-block">
      <div class="print-block-label">{label}</div>
      <div class="print-block-value">{value}</div>
    </div>
  );
}

export function PrintSheet({ entry }: { entry: Entry }) {
  return (
    <div class="print-sheet" aria-hidden="true">
      <h1 class="print-date">{formatDateTime(entry.date)}</h1>
      <Block label="状況" value={entry.situation} />
      <Block label="考え" value={entry.thought} />
      <Block label="行動" value={entry.action} />
      <Block label="体" value={entry.body} />
      {entry.intensity != null && (
        <div class="print-block">
          <div class="print-block-label">強さ</div>
          <div class="print-block-value">{entry.intensity} / 100</div>
        </div>
      )}
      {entry.emotions.length > 0 && (
        <div class="print-block">
          <div class="print-block-label">感情の名前</div>
          <div class="print-block-value">{entry.emotions.join('、')}</div>
        </div>
      )}
    </div>
  );
}
