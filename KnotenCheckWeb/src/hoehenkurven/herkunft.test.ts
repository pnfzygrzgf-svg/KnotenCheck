import { expect, it } from 'vitest'
import manifest from './herkunft.json'
const dateien = import.meta.glob('./*.{ts,tsx}', { query: '?raw', import: 'default', eager: true })
it('verwendet die unveränderte gemeinsame Höhenkurven-Fassung', async () => {
  for (const [datei, sha] of Object.entries(manifest.sha256)) {
    const raw = dateien['./' + datei]
    expect(typeof raw, datei).toBe('string')
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw as string))
    expect(Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join(''), datei).toBe(sha)
  }
})
