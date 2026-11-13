import { defineConfig } from 'vite'

export default defineConfig({
  // Relative paths so the built site works from any static host —
  // including an on-chain DeWEB site where every byte is served locally.
  base: './',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    chunkSizeWarningLimit: 1200
  }
})
