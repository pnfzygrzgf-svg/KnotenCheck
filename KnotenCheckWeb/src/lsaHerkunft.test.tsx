// LSA-Rechner: Marken «Modell» und «Karte» an den Eingabefeldern, solange die Werte aus der Übernahme stammen
import { describe, test, expect } from 'vitest'
import { renderToString } from 'react-dom/server'
import type { KnotenUebernahme } from './karte/rechner'
import LSAApp from './LSAApp'

const knoten: KnotenUebernahme = {
  id: 1, lat: 46.95, lon: 7.44, name: 'Knoten', armCount: 4, belegt: [], vergleich: [], hinweise: [], osmStand: 'unbekannt', hoehenModelle: [],
  arme: ['A', 'C', 'B', 'D'].map((label, i) => ({
    label, name: `Strasse ${label}`, himmel: 'N', stroeme: { left: 40 + i, straight: 300 + i, right: 50 + i },
    ...(i === 0 ? { fgs: { insel: false }, streifen: { anzahl: 1, spuren: null } } : {}),
  })),
}

const marke = (art: 'M' | 'K') => new RegExp(`herkunft-marke-${art}"[^>]*>${art === 'M' ? 'Modell' : 'Karte'}<`)

describe('LSA: Herkunft an den Feldern', () => {
  test('mit Übernahme aus dem Modell: Marke «Modell» bei den Strömen, «Karte» bei Name, Fahrstreifen und FGS', () => {
    const html = renderToString(<LSAApp uebernahme={knoten} />)
    expect(html).toMatch(marke('M'))
    expect(html).toMatch(marke('K'))
    expect(html.match(new RegExp(marke('M').source, 'g'))?.length).toBe(12)   // je Strom eine Marke
  })
  test('ohne Übernahme: keine Marken', () => {
    const html = renderToString(<LSAApp />)
    expect(html).not.toMatch(marke('M'))
    expect(html).not.toMatch(marke('K'))
    expect(html).not.toContain('herkunft-marke')
  })
})
