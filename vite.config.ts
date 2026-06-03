import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [preact(), VitePWA({
    registerType: 'prompt',
    injectRegister: false,

    pwaAssets: {
      disabled: false,
      config: true,
    },

    manifest: {
      // 仮名（後で変更可）。id を固定しておくことで、将来 name 等を変えても
      // 同一アプリとして扱われる（IndexedDB はオリジン単位なのでデータも保持される）。
      id: '/',
      name: 'こころの記録',
      short_name: 'こころの記録',
      description: '出来事と、それに伴う考え・行動・感情を記録するアプリ',
      start_url: '/',
      scope: '/',
      display: 'standalone',
      lang: 'ja',
      theme_color: '#3b6cf0',
      background_color: '#f6f7f9',
    },

    workbox: {
      globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
      cleanupOutdatedCaches: true,
      clientsClaim: true,
      // History ルーティングのオフライン深いリンク用：未キャッシュのナビゲーションは
      // index.html を返す。_redirects は同等のことをオンライン時にサーバ側で行う。
      navigateFallback: 'index.html',
    },

    devOptions: {
      enabled: false,
      navigateFallback: 'index.html',
      suppressWarnings: true,
      type: 'module',
    },
  })],
})