// 日時の整形ユーティリティ。内部保存は 'YYYY-MM-DDTHH:mm'（ローカル時刻）。

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** datetime-local の初期値用：現在時刻を 'YYYY-MM-DDTHH:mm' で返す。 */
export function nowLocalInput(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const dateTimeFormat = new Intl.DateTimeFormat('ja-JP', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

function formatDate(d: Date): string {
  // ja-JP の Intl.DateTimeFormat は weekday の前後に literal として
  // 既に "(" ")" を含めて返すため、ここで重ねて括弧を付けない。
  return dateTimeFormat.format(d);
}

/** 'YYYY-MM-DDTHH:mm' を「2026年6月3日(水) 14:30」のように整形する。 */
export function formatDateTime(value: string): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return formatDate(d);
}

/** epoch ms をローカル時刻で整形する。 */
export function formatEpoch(ms: number): string {
  return formatDate(new Date(ms));
}
