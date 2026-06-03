# こころの記録（仮）

> ⚠️ この README は仮置きです。名称・説明・スクリーンショット等は今後整備します。

出来事と、それに伴う **考え・行動・身体感覚・感情** を手早く記録するための個人向け PWA です。
認知行動療法（CBT）のコラム法に着想を得つつ、独自のフォーマットになっています。記録は1件ずつ
A4用紙に印刷でき、担当医に渡すといった使い方を想定しています。

## 特徴

- **完全ローカル**：データは端末内（IndexedDB）にのみ保存。サーバー送信・アカウント登録なし。
- **PWA**：ホーム画面に追加してアプリのように利用でき、オフラインでも記録できます。
- **1件ずつA4印刷**：ブラウザ標準の印刷機能で、必要な項目だけを綺麗に出力します。
- **感情プリセット**：よく使う感情語を候補から選べ、候補自体も編集できます。
- ダークモード対応（OS設定に追従）。

記録する項目や画面構成などの詳しい仕様は [`SPEC.md`](./SPEC.md) を参照してください。

## 技術スタック

- [Vite](https://vite.dev/) + [Preact](https://preactjs.com/) + TypeScript
- ルーティング：[`preact-iso`](https://github.com/preactjs/preact-iso)
- 永続化：[`idb`](https://github.com/jakearchibald/idb)（IndexedDB ラッパー）
- PWA：[`vite-plugin-pwa`](https://vite-pwa-org.netlify.app/)
- デプロイ：Cloudflare Pages（静的ホスティング）

## 開発

```bash
npm install      # 依存関係のインストール
npm run dev      # 開発サーバー
npm run build    # 本番ビルド（dist/ に出力）
npm run preview  # ビルド成果物のプレビュー
```

> 注意：`crypto.randomUUID` や Service Worker はセキュアコンテキスト（HTTPS / localhost）でのみ
> 有効です。LAN の平文 HTTP で動作確認する場合は UUID 生成にフォールバックが効きますが、
> PWA 機能（インストール・オフライン）は HTTPS 環境でお試しください。

## デプロイ

Cloudflare Pages を想定しています。`dist/` を配信し、`public/_redirects`（SPA フォールバック）と
`public/_headers`（Service Worker のキャッシュ制御）が一緒に出力されます。

```bash
npm run build
npx wrangler pages deploy dist --project-name <プロジェクト名>
```

## ライセンス

[MIT](./LICENSE) © 2026 Philmist
