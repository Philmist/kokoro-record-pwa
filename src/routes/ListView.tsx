// 一覧画面。出来事日時の降順で記録を並べる。
import { useEffect, useState } from 'preact/hooks';
import { getAllEntries } from '../db';
import { onEntriesChanged } from '../db/events';
import type { Entry } from '../types';
import { formatDateTime } from '../utils/datetime';

export function ListView() {
  const [entries, setEntries] = useState<Entry[] | null>(null);

  useEffect(() => {
    let alive = true;
    function load() {
      getAllEntries().then((list) => {
        if (alive) setEntries(list);
      });
    }
    load();
    // Undo 復元など、表示中に記録が変わったら再取得する。
    const off = onEntriesChanged(load);
    return () => {
      alive = false;
      off();
    };
  }, []);

  return (
    <div class="page">
      <header class="app-header">
        <h1 class="app-title">こころの記録</h1>
        <nav class="header-actions">
          <a class="btn" href="/settings" aria-label="設定">
            設定
          </a>
          <a class="btn btn-primary" href="/entry/new">
            ＋ 新規
          </a>
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
              <a class="entry-row" href={`/entry/${e.id}`}>
                <div class="entry-row-main">
                  <div class="entry-row-date">
                    {formatDateTime(e.date)}
                    {e.printedAt != null && (
                      <span class="printed-badge" title="印刷済み（担当医に見せた）" aria-label="印刷済み">
                        ✓
                      </span>
                    )}
                  </div>
                  <div class="entry-row-situation">{e.situation || '（状況の記載なし）'}</div>
                  {(e.emotions.length > 0 || e.intensity != null) && (
                    <div class="entry-row-meta">
                      {e.emotions.map((em) => (
                        <span key={em} class="chip chip-sm">
                          {em}
                        </span>
                      ))}
                      {e.intensity != null && <span class="intensity-sm">強さ {e.intensity}</span>}
                    </div>
                  )}
                </div>
                <span class="entry-row-arrow" aria-hidden="true">
                  ›
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
