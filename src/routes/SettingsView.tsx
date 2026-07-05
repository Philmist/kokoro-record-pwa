// 設定画面（ハブ）。感情プリセットの編集と、データのバックアップ（エクスポート/インポート）。
// バックアップの確定仕様はメモリ backup-export-import-design.md（判断1〜19）を参照。
import { useEffect, useRef, useState } from 'preact/hooks';
import {
  getPresets,
  addPreset,
  renamePreset,
  deletePreset,
  getAllEntries,
  exportSnapshot,
  replaceAll,
  mergeEntries,
} from '../db';
import { emitEntriesChanged } from '../db/events';
import { parseAndValidate, normalizeEntries, normalizePresets, backupFileName } from '../db/backup';
import type { BackupEnvelope, ImportMode } from '../db/backup';
import type { EmotionPreset, Entry } from '../types';
import { showToast } from '../ui/toast';
import { shareOrDownload } from '../utils/download';
import { ImportDialog } from '../ui/ImportDialog';
import type { ImportSummary } from '../ui/ImportDialog';

export function SettingsView() {
  const [presets, setPresets] = useState<EmotionPreset[]>([]);
  const [newLabel, setNewLabel] = useState('');

  // ---- インポート用 state ----
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null);
  const pendingEnvelope = useRef<BackupEnvelope | null>(null);
  // 結果格上げダイアログ（判断13,16）。複数行のメッセージを OK 1ボタンで見せる。
  const [resultLines, setResultLines] = useState<string[] | null>(null);

  function reload() {
    getPresets().then(setPresets);
  }

  useEffect(() => {
    reload();
  }, []);

  async function handleAdd() {
    const label = newLabel.trim();
    if (!label) return;
    if (presets.some((p) => p.label === label)) {
      showToast('同じ感情がすでにあります');
      return;
    }
    await addPreset(label);
    setNewLabel('');
    reload();
  }

  async function handleRename(p: EmotionPreset, value: string) {
    const label = value.trim();
    if (!label || label === p.label) return;
    await renamePreset(p.id, label);
    reload();
  }

  async function handleDelete(p: EmotionPreset) {
    await deletePreset(p.id);
    reload();
  }

  // ---- エクスポート（判断7,8） ----
  async function handleExport() {
    const env = await exportSnapshot();
    const fileName = backupFileName();
    const blob = new Blob([JSON.stringify(env)], { type: 'application/json' });
    const file = new File([blob], fileName, { type: 'application/json' });
    // 共有シート（iPhone PWA 本命）→ 不可なら download の二段構え。
    await shareOrDownload(blob, file, fileName);
  }

  // ---- インポート：ファイル選択 → 封筒検証 → 確認ダイアログ（判断9,11） ----
  function resetFileInput() {
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function closeImport() {
    setImportOpen(false);
    setImportSummary(null);
    pendingEnvelope.current = null;
    resetFileInput();
  }

  async function handleFileChange(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    let text: string;
    try {
      text = await file.text();
    } catch {
      showToast('このファイルは読み込めません。');
      resetFileInput();
      return;
    }

    const result = parseAndValidate(text);
    if (!result.ok) {
      showToast(
        result.reason === 'too-new'
          ? 'このバックアップは新しいバージョンで作られています。アプリを更新してください。'
          : 'このファイルは読み込めません。',
      );
      resetFileInput();
      return;
    }

    const current = await getAllEntries();
    pendingEnvelope.current = result.envelope;
    setImportSummary({
      fileEntries: result.envelope.entries.length,
      filePresets: result.envelope.emotionPresets.length,
      exportedAt: result.envelope.exportedAt,
      currentEntries: current.length,
    });
    setImportOpen(true);
  }

  // ---- インポート実行（判断10,12,13,14,15,16） ----
  async function handleImportConfirm(mode: ImportMode) {
    const env = pendingEnvelope.current;
    if (!env) return;
    setImportBusy(true);

    const now = Date.now();
    const norm = normalizeEntries(env.entries as unknown[], now);

    try {
      if (mode === 'replace') {
        // 置換直前に現在の全データを退避（Undo 用、判断10）。
        const snapEntries = await getAllEntries();
        const snapPresets = await getPresets();
        const presets = normalizePresets(env.emotionPresets as unknown[]);
        await replaceAll(norm.valid, presets);
        emitEntriesChanged();
        reload();
        reportResult(mode, { added: norm.valid.length, overwritten: 0, keptBack: 0 }, norm, {
          entries: snapEntries,
          presets: snapPresets,
        });
      } else {
        const merge = await mergeEntries(norm.valid);
        emitEntriesChanged();
        reportResult(mode, merge, norm, null);
      }
    } catch (err) {
      const quota = err instanceof Error && err.name === 'QuotaExceededError';
      showToast(
        quota
          ? '端末の空き容量が不足しています。取り込めませんでした。'
          : '取り込みに失敗しました。データは変更されていません。',
      );
    } finally {
      setImportBusy(false);
      closeImport();
    }
  }

  // 結果報告（判断13,16）。問題ゼロ→トースト1行／異常→ダイアログ格上げ。
  // 置換成功時は常に Undo トーストを出す（破壊的操作の安全網、判断10）。
  function reportResult(
    mode: ImportMode,
    counts: { added: number; overwritten: number; keptBack: number },
    norm: { skipped: number; situationEmpty: number },
    undoSnapshot: { entries: Entry[]; presets: EmotionPreset[] } | null,
  ) {
    const imported = counts.added + counts.overwritten;
    const abnormal = norm.skipped > 0 || norm.situationEmpty > 0 || counts.keptBack > 0;

    if (mode === 'replace' && undoSnapshot) {
      // 置換は破壊的なので、正常/異常にかかわらず Undo を提供する。
      showToast(`${imported}件を取り込みました`, {
        action: {
          label: '元に戻す',
          onClick: () => {
            replaceAll(undoSnapshot.entries, undoSnapshot.presets).then(() => {
              emitEntriesChanged();
              reload();
            });
          },
        },
      });
    } else if (!abnormal) {
      // 問題ゼロのマージ → トースト1行のみ。
      showToast(`${imported}件を取り込みました`);
    }

    if (abnormal) {
      const lines: string[] = [`${imported}件を取り込みました。`];
      if (counts.keptBack > 0) {
        lines.push(`${counts.keptBack}件は、この端末の記録の方が新しいため取り込みませんでした。`);
      }
      if (norm.skipped > 0) {
        lines.push(`${norm.skipped}件は内容に問題があり取り込めませんでした。`);
      }
      if (norm.situationEmpty > 0) {
        lines.push(`${norm.situationEmpty}件、状況が空の記録があります。一覧でご確認ください。`);
      }
      setResultLines(lines);
    }
  }

  return (
    <div class="page">
      <header class="app-header">
        <a class="btn" href="/">
          ‹ 一覧
        </a>
        <h1 class="app-title">設定</h1>
        <span class="header-spacer" />
      </header>

      <section class="settings-section">
        <h2 class="settings-heading">感情プリセット</h2>
        <p class="muted">
          記入画面で選べる感情の候補です。ここでの編集は今後の記録に反映されます（過去の記録の感情は変わりません）。
        </p>

        <div class="free-emotion">
          <input
            type="text"
            placeholder="新しい感情を追加"
            value={newLabel}
            onInput={(e) => setNewLabel((e.target as HTMLInputElement).value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAdd();
              }
            }}
          />
          <button type="button" class="btn btn-primary" onClick={handleAdd}>
            追加
          </button>
        </div>

        <ul class="preset-list">
          {presets.map((p) => (
            <li key={p.id} class="preset-row">
              <input
                type="text"
                class="preset-input"
                value={p.label}
                onBlur={(e) => handleRename(p, (e.target as HTMLInputElement).value)}
              />
              <button
                type="button"
                class="btn btn-sm btn-danger"
                aria-label={`${p.label} を削除`}
                onClick={() => handleDelete(p)}
              >
                削除
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section class="settings-section">
        <h2 class="settings-heading">データのバックアップ</h2>
        <p class="muted">
          記録をファイルに書き出して保存できます。別の端末や、機種変更のときの引き継ぎに使えます。
        </p>

        <div class="backup-actions">
          <button type="button" class="btn" onClick={handleExport}>
            バックアップを書き出す
          </button>
          <button type="button" class="btn" onClick={() => fileInputRef.current?.click()}>
            バックアップから取り込む
          </button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          class="visually-hidden"
          onChange={handleFileChange}
        />
      </section>

      <ImportDialog
        open={importOpen}
        summary={importSummary}
        busy={importBusy}
        onConfirm={handleImportConfirm}
        onCancel={closeImport}
      />

      {resultLines && (
        <div class="modal-backdrop" onClick={() => setResultLines(null)}>
          <div
            class="modal"
            role="dialog"
            aria-modal="true"
            aria-label="取り込みの結果"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 class="modal-title">取り込みの結果</h2>
            <div class="modal-body">
              {resultLines.map((line, i) => (
                <p key={i}>{line}</p>
              ))}
            </div>
            <div class="modal-actions">
              <button type="button" class="btn btn-primary" onClick={() => setResultLines(null)}>
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
