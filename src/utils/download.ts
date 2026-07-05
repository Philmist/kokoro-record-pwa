// ファイル書き出しの共通導線。バックアップ(JSON)と YAML 書き出しで共有する。
// 「共有シート優先 → 不可なら download」の二段構えは iPhone PWA を本命に据えた判断
// （バックアップ設計メモ 判断7）。

/** Blob を `<a download>` で保存する（share 不可時のフォールバック）。 */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // 直後に revoke するとダウンロードが取りこぼされる端末があるため少し遅らせる。
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * ファイルを配布する。共有シート（iPhone PWA 本命）→ 不可なら download の二段構え。
 * 共有のキャンセル（AbortError）はエラー扱いしない（黙って戻る）。
 */
export async function shareOrDownload(blob: Blob, file: File, fileName: string): Promise<void> {
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return; // 成功（または共有先に渡せた）。
    } catch (err) {
      // キャンセル（AbortError）はエラー扱いしない。
      if (err instanceof Error && err.name === 'AbortError') return;
      // それ以外（共有不可・権限失効など）は download にフォールバック。
    }
  }
  downloadBlob(blob, fileName);
}
