import { defineConfig } from 'vite';

// GitHub Pages 網址：https://kevin50057.github.io/pokemon-volleyball-adventure/
export default defineConfig({
  base: '/pokemon-volleyball-adventure/',
  build: {
    target: 'es2020',
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: true,
    // 三種語言各一頁（路徑相對於專案根目錄，build 要在這裡跑）
    //（en、ko 由 scripts/gen-lang-pages.mjs 從 index.html 產生）
    rollupOptions: {
      input: {
        zh: 'index.html',
        en: 'en/index.html',
        ko: 'ko/index.html',
      },
    },
  },
  server: { port: 8766, strictPort: true },
  preview: { port: 8766, strictPort: true },
});
