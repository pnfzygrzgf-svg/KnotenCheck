import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(() => ({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'node',
  },
  // Eigene Domain (knotencheck.ch) → die Site liegt an der Wurzel, nicht unter /<repo>/.
  base: '/',
  // Dev-Server: zugewiesenen Port aus der Umgebung respektieren (z.B. Preview-Tooling)
  server: process.env.PORT ? { port: Number(process.env.PORT), strictPort: true } : undefined,
  // Verhindert, dass Vite/esbuild Media-Queries in die Level-4-Range-Syntax
  // (width<=720px) umschreibt, die erst ab iOS 16.4 / Safari 16.4 unterstützt wird.
  build: {
    cssTarget: ['chrome80', 'safari13', 'firefox78', 'edge80'],
  },
}))
