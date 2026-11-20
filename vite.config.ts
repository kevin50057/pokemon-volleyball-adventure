import { defineConfig } from 'vite';

// GitHub Pages 網址：https://kevin50057.github.io/pokemon-volleyball-adventure/
export default defineConfig({
  base: '/pokemon-volleyball-adventure/',
  build: {
    target: 'es2020',
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: true,
  },
  server: { port: 8766, strictPort: true },
  preview: { port: 8766, strictPort: true },
});
