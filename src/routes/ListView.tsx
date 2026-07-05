// 一覧画面。出来事日時の降順で記録を並べる。
// 「選択モード」では複数の記録にチェックを付け、YAML テキストとして書き出せる（PC で眺める用途）。
import { useEffect, useState } from 'preact/hooks';
import { getAllEntries } from '../db';
import { onEntriesChanged } from '../db/events';
import type { Entry } from '../types';
import { formatDateTime } from '../utils/datetime';
import { entriesToYaml, yamlFileName } from '../db/yamlExport';
import { shareOrDownload } from '../utils/download';
import { showToast } from '../ui/toast';

/** 1行分の中身（日時・状況・感情チップ）。通常モードと選択モードで共通。 */
function EntryRowBody({ entry }: { entry: Entry }) {
  return (
    <div class="entry-row-main">
      <div class="entry-row-date">
        {formatDateTime(entry.date)}
        {entry.printedAt != null && (
          <span class="printed-badge" title="印刷済み（担当医に見せた）" aria-label="印刷済み">
            ✓
          </span>
        )}
      </div>
      <div class="entry-row-situation">{entry.situation || '（状況の記載なし）'}</div>
      {(entry.emotions.length > 0 || entry.intensity != null) && (
        <div class="entry-row-meta">
          {entry.emotions.map((em) => (
            <span key={em} class="chip chip-sm">
              {em}
            </span>
          ))}
          {entry.intensity != null && <span class="intensity-sm">強さ {entry.intensity}</span>}
        </div>
      )}
    </div>
  );
}

export function ListView() {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    let alive = true;
    function load() {
      getAllEntries().then((list) => {
        if (alive) setEntries(list);
      });
    }
    load();
    // Undo 復元など、表示中に記録が変わったら再取得する。選択も破棄して不整合を避ける。
    const off = onEntriesChanged(() => {
      load();
      exitSelect();
    });
    return () => {
      alive = false;
      off();
    };
  }, []);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function exitSelect() {
    setSelectMode(false);
    setSelected(new Set());
  }

  async function handleExportYaml() {
    if (!entries || selected.size === 0) return;
    // 一覧の並び（日時降順）を保ったまま、選択されたものだけ抽出する。
    const subset = entries.filter((e) => selected.has(e.id));
    const yaml = entriesToYaml(subset);
    const fileName = yamlFileName();
    const blob = new Blob([yaml], { type: 'text/yaml;charset=utf-8' });
    const file = new File([blob], fileName, { type: 'text/yaml' });
    await shareOrDownload(blob, file, fileName);
    showToast(`${subset.length}件を書き出しました`);
    exitSelect();
  }

  return (
    <div class="page">
      <header class="app-header">
        <h1 class="app-title">こころの記録</h1>
        <nav class="header-actions">
          {selectMode ? (
            <button type="button" class="btn" onClick={exitSelect}>
              キャンセル
            </button>
          ) : (
            <>
              {entries && entries.length > 0 && (
                <button type="button" class="btn" onClick={() => setSelectMode(true)}>
                  選択
                </button>
              )}
              <a class="btn" href="/settings" aria-label="設定">
                設定
              </a>
              <a class="btn btn-primary" href="/entry/new">
                ＋ 新規
              </a>
            </>
          )}
        </nav>
      </header>

      {entries === null ? (
        <p class="muted">読み込み中…</p>
      ) : entries.length === 0 ? (
        <div class="empty">
          <p>まだ記録がありません。</p>
          <a class="btn btn-primary" href="/entry/new">
            最初の記録を書く
          </a>
        </div>
      ) : (
        <ul class="entry-list">
          {entries.map((e) => (
            <li key={e.id}>
              {selectMode ? (
                <label class={`entry-row entry-row-select${selected.has(e.id) ? ' is-selected' : ''}`}>
                  <input
                    type="checkbox"
                    class="entry-row-check"
                    checked={selected.has(e.id)}
                    onChange={() => toggle(e.id)}
                  />
                  <EntryRowBody entry={e} />
                </label>
              ) : (
                <a class="entry-row" href={`/entry/${e.id}`}>
                  <EntryRowBody entry={e} />
                  <span class="entry-row-arrow" aria-hidden="true">
                    ›
                  </span>
                </a>
              )}
            </li>
          ))}
        </ul>
      )}

      {selectMode && (
        <div class="selection-bar" role="toolbar" aria-label="選択した記録の操作">
          <span class="selection-count">{selected.size}件を選択</span>
          <button
            type="button"
            class="btn btn-primary"
            disabled={selected.size === 0}
            onClick={handleExportYaml}
          >
            YAMLで書き出す
          </button>
        </div>
      )}
    </div>
  );
}
