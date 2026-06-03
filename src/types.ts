// アプリのコアなデータ型。詳細は SPEC.md を参照。

/** 記録1件。 */
export interface Entry {
  id: string;
  /** 出来事が起きた日時。'YYYY-MM-DDTHH:mm'（分単位・ローカル時刻）。 */
  date: string;
  /** 状況（必須・空不可）。 */
  situation: string;
  /** 考え。 */
  thought: string;
  /** 行動。 */
  action: string;
  /** 体（どこがどんな感じか）。 */
  body: string;
  /** 強さ 0–100。未設定は null（0 と区別する）。 */
  intensity: number | null;
  /** 感情の名前（プリセット＋自由入力、複数可）。 */
  emotions: string[];
  /** 備考（印刷対象外）。 */
  note: string;
  /** 印刷操作をした時刻(epoch ms)。null=未印刷。 */
  printedAt: number | null;
  /** 作成時刻(epoch ms)。 */
  createdAt: number;
  /** 更新時刻(epoch ms)。 */
  updatedAt: number;
}

/** ユーザー編集可能な感情プリセット。 */
export interface EmotionPreset {
  id: string;
  label: string;
  /** 表示順。小さいほど先。 */
  order: number;
}

/** 記入フォームが扱う、保存前の編集中データ。 */
export type EntryDraft = Omit<Entry, 'createdAt' | 'updatedAt' | 'printedAt'>;
