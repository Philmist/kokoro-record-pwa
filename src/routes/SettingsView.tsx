// 設定画面。感情プリセットの追加・削除・改名。並べ替えは v1 では未対応。
import { useEffect, useState } from 'preact/hooks';
import { getPresets, addPreset, renamePreset, deletePreset } from '../db';
import type { EmotionPreset } from '../types';
import { showToast } from '../ui/toast';

export function SettingsView() {
  const [presets, setPresets] = useState<EmotionPreset[]>([]);
  const [newLabel, setNewLabel] = useState('');

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

  return (
    <div class="page">
      <header class="app-header">
        <a class="btn" href="/">
          ‹ 一覧
        </a>
        <h1 class="app-title">感情プリセットの編集</h1>
        <span class="header-spacer" />
      </header>

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
    </div>
  );
}
