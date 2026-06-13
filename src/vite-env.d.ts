/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/preact" />

// vite.config.ts の define で注入されるアプリのバージョン（package.json 由来）。
// バックアップ封筒のデバッグ情報用。
declare const __APP_VERSION__: string;
