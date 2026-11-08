// Marken an den Eingabefeldern: Werte aus Modell oder Karte sind beim Feld gekennzeichnet, ohne Übernahme gibt es keine
import { describe, test, expect } from 'vitest'
import { renderToString } from 'react-dom/server'
import type { KnotenUebernahme } from './karte/rechner'
import VSS308App from './VSS308App'

const knoten: KnotenUebernahme = {
  id: 1, lat: 46.95, lon: 7.44, name: 'Knoten', armCount: 4, belegt: [], vergleich: [], hinweise: [], osmStand: 'unbekannt', hoehenModelle: [],
  arme: ['A', 'C', 'B', 'D'].map((label, i) => ({
    label, name: `Strasse ${label}`, himmel: 'N',
    stroeme: { left: 40 + i, straight: 300 + i, right: 50 + i },
    ...(i === 0 ? { fgs: { insel: true } } : {}),
  })),
}

describe('VSS 2011/308: Herkunftsmarken', () => {
  test('mit Übernahme: Modell an den Strömen, Karte an Name, Querung und Mittelinsel', () => {
    const html = renderToString(<VSS308App uebernahme={knoten} />)
    expect(html).toContain('Modell')
    expect(html).toContain('herkunft-marke-M')
    expect(html.match(/herkunft-marke-M/g)?.length).toBe(12)   // 4 Arme × 3 Ströme
    expect(html.match(/herkunft-marke-K/g)?.length).toBe(4 + 2)   // 4 Strassennamen, Querung und Mittelinsel an Arm A
  })
  test('ohne Übernahme: keine Marken', () => {
    const html = renderToString(<VSS308App />)
    expect(html).not.toContain('Modell')
    expect(html).not.toContain('herkunft-marke')
  })
})
