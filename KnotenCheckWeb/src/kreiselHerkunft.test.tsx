// Kreisel-Rechner: Marken «Modell» und «Karte» bei den Eingabefeldern, deren Wert aus der Übernahme stammt
import { describe, test, expect } from 'vitest'
import { renderToString } from 'react-dom/server'
import type { KnotenUebernahme } from './karte/rechner'
import RoundaboutApp from './RoundaboutApp'

const knoten: KnotenUebernahme = {
  id: 1, lat: 46.95, lon: 7.44, name: 'Knoten', armCount: 4, belegt: [], vergleich: [], hinweise: [], osmStand: 'unbekannt', hoehenModelle: [],
  arme: ['A', 'C', 'B', 'D'].map(label => ({
    label, name: `Strasse ${label}`, himmel: 'N', neigung: '±0%' as const, kreiselTyp: '1/1' as const,
    stroeme: { left: 120, straight: 340, right: 90 }, schwerverkehr: { lw: 6, lz: 2 },
  })),
}

const marken = (html: string, text: 'Modell' | 'Karte') =>
  (html.match(new RegExp(`class="herkunft-marke herkunft-marke-[MK]"[^>]*>${text}<`, 'g')) ?? []).length

describe('Kreisel: Herkunftsmarken in der Armeingabe', () => {
  test('mit Übernahme: Ströme sowie LW und LZ aus dem Modell, Name, Typ und Neigung aus der Karte', () => {
    const html = renderToString(<RoundaboutApp uebernahme={knoten} />)
    expect(html).toContain('Modell')
    expect(marken(html, 'Modell')).toBe(4 * (3 + 2))   // je Arm drei Ströme und die Felder LW und LZ
    expect(marken(html, 'Karte')).toBe(4 * 3)          // je Arm Strassenname, Kreiseltyp und Neigung
  })
  test('ohne Übernahme: keine Marken', () => {
    const html = renderToString(<RoundaboutApp />)
    expect(html).not.toContain('herkunft-marke')
    expect(html).not.toContain('>Modell<')
  })
})
