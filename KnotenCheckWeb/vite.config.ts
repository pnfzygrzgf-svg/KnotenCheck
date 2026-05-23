import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ command }) => ({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'node',
  },
  base: command === 'build' ? '/KnotenCheck/' : '/',
  // Verhindert, dass Vite/esbuild Media-Queries in die Level-4-Range-Syntax
  // (width<=720px) umschreibt, die erst ab iOS 16.4 / Safari 16.4 unterstützt wird.
  build: {
    cssTarget: ['chrome80', 'safari13', 'firefox78', 'edge80'],
  },
}))
