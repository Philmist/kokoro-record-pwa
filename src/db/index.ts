// IndexedDB アクセスの隔離層。アプリの他の場所はこのモジュール経由でのみ永続化に触れる。
// 将来 Dexie 等へ差し替える場合もここに閉じる。詳細は SPEC.md を参照。
import { openDB } from 'idb';
import type { DBSchema, IDBPDatabase } from 'idb';
import type { Entry, EmotionPreset, EntryDraft } from '../types';
import { DEFAULT_EMOTION_LABELS } from '../data/defaultPresets';
import { uuid } from '../utils/id';

const DB_NAME = 'kokoro-log';
const DB_VERSION = 1;

interface KokoroDB extends DBSchema {
  entries: {
    key: string;
    value: Entry;
    indexes: { 'by-date': string };
  };
  emotionPresets: {
    key: string;
    value: EmotionPreset;
  };
}

let dbPromise: Promise<IDBPDatabase<KokoroDB>> | null = null;

function getDB(): Promise<IDBPDatabase<KokoroDB>> {
  if (!dbPromise) {
    dbPromise = openDB<KokoroDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const entries = db.createObjectStore('entries', { keyPath: 'id' });
        entries.createIndex('by-date', 'date');

        const presets = db.createObjectStore('emotionPresets', { keyPath: 'id' });
        // 初期プリセットを投入。
        DEFAULT_EMOTION_LABELS.forEach((label, order) => {
          presets.add({ id: uuid(), label, order });
        });
      },
    });
  }
  return dbPromise;
}

// ---- Entry ----

/** 全件を出来事日時の降順（新しい順）で返す。 */
export async function getAllEntries(): Promise<Entry[]> {
  const db = await getDB();
  const all = await db.getAllFromIndex('entries', 'by-date');
  return all.reverse();
}

export async function getEntry(id: string): Promise<Entry | undefined> {
  const db = await getDB();
  return db.get('entries', id);
}

/** 新規作成。タイムスタンプと printedAt を補って保存する。 */
export async function createEntry(draft: EntryDraft): Promise<Entry> {
  const now = Date.now();
  const entry: Entry = { ...draft, printedAt: null, createdAt: now, updatedAt: now };
  const db = await getDB();
  await db.put('entries', entry);
  return entry;
}

/** 既存を更新。createdAt と printedAt は保持し、updatedAt のみ更新する。 */
export async function updateEntry(draft: EntryDraft): Promise<Entry> {
  const db = await getDB();
  const existing = await db.get('entries', draft.id);
  const now = Date.now();
  const entry: Entry = {
    ...draft,
    printedAt: existing?.printedAt ?? null,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  await db.put('entries', entry);
  return entry;
}

/** 印刷済みフラグを設定（printedAt に時刻、null で未印刷へ戻す）。 */
export async function setPrinted(id: string, printedAt: number | null): Promise<Entry | undefined> {
  const db = await getDB();
  const existing = await db.get('entries', id);
  if (!existing) return undefined;
  const entry: Entry = { ...existing, printedAt };
  await db.put('entries', entry);
  return entry;
}

export async function deleteEntry(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('entries', id);
}

/** 削除取り消し用：完全な Entry をそのまま書き戻す。 */
export async function restoreEntry(entry: Entry): Promise<void> {
  const db = await getDB();
  await db.put('entries', entry);
}

// ---- EmotionPreset ----

export async function getPresets(): Promise<EmotionPreset[]> {
  const db = await getDB();
  const all = await db.getAll('emotionPresets');
  return all.sort((a, b) => a.order - b.order);
}

export async function addPreset(label: string): Promise<EmotionPreset> {
  const db = await getDB();
  const all = await db.getAll('emotionPresets');
  const maxOrder = all.reduce((m, p) => Math.max(m, p.order), -1);
  const preset: EmotionPreset = { id: uuid(), label, order: maxOrder + 1 };
  await db.put('emotionPresets', preset);
  return preset;
}

export async function renamePreset(id: string, label: string): Promise<void> {
  const db = await getDB();
  const existing = await db.get('emotionPresets', id);
  if (!existing) return;
  await db.put('emotionPresets', { ...existing, label });
}

export async function deletePreset(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('emotionPresets', id);
}
