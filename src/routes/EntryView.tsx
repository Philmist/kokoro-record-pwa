// 記入/詳細画面。新規(/entry/new)と編集(/entry/:id)を兼ねる。
// 保存・削除・印刷・印刷済みトグルをここで行う。
import { useEffect, useRef, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import {
  getEntry,
  createEntry,
  updateEntry,
  deleteEntry,
  restoreEntry,
  setPrinted,
  getPresets,
} from '../db';
import { emitEntriesChanged } from '../db/events';
import { uuid } from '../utils/id';
import type { Entry, EmotionPreset } from '../types';
import { nowLocalInput, formatEpoch } from '../utils/datetime';
import { ConfirmModal } from '../ui/ConfirmModal';
import { showToast } from '../ui/toast';
import { PrintSheet } from './PrintSheet';

interface EntryViewProps {
  /** 編集対象 ID。新規時は undefined。 */
  id?: string;
}

interface FormState {
  date: string;
  situation: string;
  thought: string;
  action: string;
  body: string;
  intensity: number | null;
  emotions: string[];
  note: string;
}

function emptyForm(): FormState {
  return {
    date: nowLocalInput(),
    situation: '',
    thought: '',
    action: '',
    body: '',
    intensity: null,
    emotions: [],
    note: '',
  };
}

function formFromEntry(e: Entry): FormState {
  return {
    date: e.date,
    situation: e.situation,
    thought: e.thought,
    action: e.action,
    body: e.body,
    intensity: e.intensity,
    emotions: [...e.emotions],
    note: e.note,
  };
}

export function EntryView({ id }: EntryViewProps) {
  const isNew = !id;
  const { route } = useLocation();

  const [entry, setEntry] = useState<Entry | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [presets, setPresets] = useState<EmotionPreset[]>([]);
  const [freeEmotion, setFreeEmotion] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [loaded, setLoaded] = useState(isNew);
  // 任意項目の折り畳み開閉。新規は閉じ、編集で値があれば開く。以後はユーザー操作に追従。
  const [optionalOpen, setOptionalOpen] = useState(false);

  // dirty 判定用の初期スナップショット。初回レンダーの form と同一インスタンスから取る。
  const initialSnapshot = useRef<string>(JSON.stringify(form));
  const dirty = JSON.stringify(form) !== initialSnapshot.current;

  // 初期ロード（プリセット＋編集対象）。
  useEffect(() => {
    let alive = true;
    getPresets().then((p) => alive && setPresets(p));
    if (isNew) return;
    getEntry(id!).then((e) => {
      if (!alive) return;
      if (!e) {
        setNotFound(true);
        return;
      }
      const f = formFromEntry(e);
      setEntry(e);
      setForm(f);
      initialSnapshot.current = JSON.stringify(f);
      // 既存の任意項目に値があれば折り畳みを開いておく。
      setOptionalOpen(!!e.body || e.intensity != null || e.emotions.length > 0 || !!e.note);
      setLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, [id]);

  // タブを閉じる/リロード時の離脱警告。
  useEffect(() => {
    function onBeforeUnload(ev: BeforeUnloadEvent) {
      if (!dirty) return;
      ev.preventDefault();
      ev.returnValue = '';
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  // 印刷操作の検知（編集時のみ）。afterprint はキャンセルでも発火するため
  // 「印刷操作をした」意味で printedAt を記録する。
  useEffect(() => {
    if (isNew || !id) return;
    function onAfterPrint() {
      setPrinted(id!, Date.now()).then((updated) => {
        if (updated) setEntry(updated);
      });
    }
    window.addEventListener('afterprint', onAfterPrint);
    return () => window.removeEventListener('afterprint', onAfterPrint);
  }, [id, isNew]);

  function patch(p: Partial<FormState>) {
    setForm((f) => ({ ...f, ...p }));
  }

  function toggleEmotion(label: string) {
    setForm((f) =>
      f.emotions.includes(label)
        ? { ...f, emotions: f.emotions.filter((e) => e !== label) }
        : { ...f, emotions: [...f.emotions, label] },
    );
  }

  function addFreeEmotion() {
    const label = freeEmotion.trim();
    if (!label) return;
    setForm((f) => (f.emotions.includes(label) ? f : { ...f, emotions: [...f.emotions, label] }));
    setFreeEmotion('');
  }

  // 離脱ガード付きナビゲーション。
  function navigateGuarded(to: string) {
    if (dirty && !window.confirm('保存していない変更があります。破棄して移動しますか？')) return;
    route(to);
  }

  const situationValid = form.situation.trim().length > 0;

  async function handleSave(ev: Event) {
    ev.preventDefault();
    if (!situationValid) return;
    const draft = {
      id: id ?? uuid(),
      date: form.date,
      situation: form.situation.trim(),
      thought: form.thought,
      action: form.action,
      body: form.body,
      intensity: form.intensity,
      emotions: form.emotions,
      note: form.note,
    };
    if (isNew) {
      await createEntry(draft);
    } else {
      await updateEntry(draft);
    }
    initialSnapshot.current = JSON.stringify(form); // dirty 解除
    showToast('保存しました');
    route('/');
  }

  function handleDelete() {
    setConfirmDelete(false);
    if (!entry) return;
    const snapshot = entry;
    deleteEntry(snapshot.id).then(() => {
      showToast('削除しました', {
        action: {
          label: '元に戻す',
          onClick: () => {
            restoreEntry(snapshot).then(emitEntriesChanged);
          },
        },
      });
      route('/');
    });
  }

  function togglePrinted() {
    if (!entry) return;
    setPrinted(entry.id, entry.printedAt == null ? Date.now() : null).then((updated) => {
      if (updated) setEntry(updated);
    });
  }

  if (notFound) {
    return (
      <div class="page">
        <p>記録が見つかりませんでした。</p>
        <a class="btn" href="/">
          一覧へ戻る
        </a>
      </div>
    );
  }

  if (!loaded) {
    return (
      <div class="page">
        <p class="muted">読み込み中…</p>
      </div>
    );
  }

  return (
    <div class="page">
      <header class="app-header">
        <button type="button" class="btn" onClick={() => navigateGuarded('/')}>
          ‹ 一覧
        </button>
        <h1 class="app-title">{isNew ? '新しい記録' : '記録'}</h1>
        <span class="header-spacer" />
      </header>

      <form class="entry-form" onSubmit={handleSave}>
        <label class="field">
          <span class="field-label">日時 <span class="req">必須</span></span>
          <input
            type="datetime-local"
            value={form.date}
            onInput={(e) => patch({ date: (e.target as HTMLInputElement).value })}
            required
          />
        </label>

        <label class="field">
          <span class="field-label">状況 <span class="req">必須</span></span>
          <textarea
            rows={2}
            placeholder="何が起きていたか"
            value={form.situation}
            onInput={(e) => patch({ situation: (e.target as HTMLTextAreaElement).value })}
          />
          {!situationValid && <span class="field-error">状況を入力してください</span>}
        </label>

        <label class="field">
          <span class="field-label">考え</span>
          <textarea
            rows={3}
            placeholder="頭によぎったこと"
            value={form.thought}
            onInput={(e) => patch({ thought: (e.target as HTMLTextAreaElement).value })}
          />
        </label>

        <label class="field">
          <span class="field-label">行動</span>
          <textarea
            rows={3}
            placeholder="したこと、避けたこと"
            value={form.action}
            onInput={(e) => patch({ action: (e.target as HTMLTextAreaElement).value })}
          />
        </label>

        <details
          class="optional"
          open={optionalOpen}
          onToggle={(e) => setOptionalOpen((e.target as HTMLDetailsElement).open)}
        >
          <summary>詳しく記録する（任意）</summary>

          <label class="field">
            <span class="field-label">体</span>
            <textarea
              rows={2}
              placeholder="体のどこが、どんな感じだったか"
              value={form.body}
              onInput={(e) => patch({ body: (e.target as HTMLTextAreaElement).value })}
            />
          </label>

          <div class="field">
            <span class="field-label">強さ</span>
            {form.intensity == null ? (
              <button type="button" class="btn" onClick={() => patch({ intensity: 50 })}>
                強さを記録する
              </button>
            ) : (
              <div class="intensity-row">
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={form.intensity}
                  onInput={(e) => patch({ intensity: Number((e.target as HTMLInputElement).value) })}
                />
                <span class="intensity-value">{form.intensity}</span>
                <button type="button" class="btn btn-sm" onClick={() => patch({ intensity: null })}>
                  未設定に戻す
                </button>
              </div>
            )}
          </div>

          <div class="field">
            <span class="field-label">感情の名前</span>
            <div class="chips">
              {presets.map((p) => (
                <button
                  type="button"
                  key={p.id}
                  class={form.emotions.includes(p.label) ? 'chip chip-on' : 'chip'}
                  onClick={() => toggleEmotion(p.label)}
                >
                  {p.label}
                </button>
              ))}
            </div>
            {/* プリセットにない自由入力ぶんは取り消せるチップで表示。 */}
            {form.emotions.filter((e) => !presets.some((p) => p.label === e)).length > 0 && (
              <div class="chips">
                {form.emotions
                  .filter((e) => !presets.some((p) => p.label === e))
                  .map((e) => (
                    <button
                      type="button"
                      key={e}
                      class="chip chip-on"
                      onClick={() => toggleEmotion(e)}
                    >
                      {e} ×
                    </button>
                  ))}
              </div>
            )}
            <div class="free-emotion">
              <input
                type="text"
                placeholder="自由入力で追加"
                value={freeEmotion}
                onInput={(e) => setFreeEmotion((e.target as HTMLInputElement).value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addFreeEmotion();
                  }
                }}
              />
              <button type="button" class="btn btn-sm" onClick={addFreeEmotion}>
                追加
              </button>
            </div>
          </div>

          <label class="field">
            <span class="field-label">備考</span>
            <textarea
              rows={2}
              placeholder="自由記述（印刷されません）"
              value={form.note}
              onInput={(e) => patch({ note: (e.target as HTMLTextAreaElement).value })}
            />
          </label>
        </details>

        <div class="form-actions">
          <button type="submit" class="btn btn-primary" disabled={!situationValid}>
            保存
          </button>
          <button type="button" class="btn" onClick={() => navigateGuarded('/')}>
            キャンセル
          </button>
        </div>
      </form>

      {!isNew && entry && (
        <section class="detail-actions">
          <div class="detail-actions-row">
            <button type="button" class="btn" onClick={() => window.print()}>
              印刷
            </button>
            <button type="button" class="btn" onClick={togglePrinted}>
              {entry.printedAt == null ? '印刷済みにする' : '未印刷に戻す'}
            </button>
            <button type="button" class="btn btn-danger" onClick={() => setConfirmDelete(true)}>
              削除
            </button>
          </div>
          {entry.printedAt != null && (
            <p class="muted printed-note">印刷済み：{formatEpoch(entry.printedAt)} 頃に印刷操作</p>
          )}
        </section>
      )}

      <ConfirmModal
        open={confirmDelete}
        title="この記録を削除しますか？"
        body="削除後しばらくは「元に戻す」で復元できます。"
        confirmLabel="削除"
        destructive
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
      />

      {/* 印刷専用シート（画面では非表示、印刷時のみ表示）。保存済みデータを反映。 */}
      {!isNew && entry && <PrintSheet entry={entry} />}
    </div>
  );
}
