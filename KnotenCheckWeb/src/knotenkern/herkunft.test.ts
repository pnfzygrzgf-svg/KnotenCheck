// Die Kopien aus dem SichtweitenCheck bleiben wortgleich (scripts/knotenkern_holen.mjs). Der Vergleich mit der Quelle selbst läuft
// mit «node scripts/knotenkern_holen.mjs --pruefen»; dieser Test prüft die Kopie gegen ihr Manifest und läuft auch ohne die Quelle.

import { describe, test, expect } from 'vitest'
import herkunft from './herkunft.json'

const quellen = import.meta.glob('./**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>

async function sha256(text: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('')
}

describe('Knotenkern', () => {
  for (const [datei, erwartet] of Object.entries(herkunft.dateien as Record<string, string>)) {
    test(`${datei} ist unverändert`, async () => {
      expect(await sha256(quellen[`./${datei}`])).toBe(erwartet)
    })
  }

  test('nur die Typdatei ist nicht kopiert', () => {
    const kopiert = new Set(Object.keys(herkunft.dateien))
    const uebrige = Object.keys(quellen).map(f => f.slice(2)).filter(f => !kopiert.has(f)).sort()
    expect(uebrige).toEqual(['rechner/typen.ts'])
  })
})
