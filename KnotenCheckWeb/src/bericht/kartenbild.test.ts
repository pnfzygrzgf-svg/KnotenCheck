import { describe, expect, test } from 'vitest'
import { ausschnitt, bildPixel, kartenGeometrie, massstab, MIN_M, svgAbbildung, VERH_MAX, VERH_MIN, wmsBildUrl } from './kartenbild'

describe('Kartenausschnitt im Bericht', () => {
  test('Ausschnitt mit Mindestbreite und Seitenverhältnis', () => {
    const b = ausschnitt([[2600000, 1200000], [2600010, 1200005]])
    const w = b[2] - b[0], h = b[3] - b[1]
    expect(w).toBeGreaterThanOrEqual(MIN_M)
    expect(h / w).toBeGreaterThanOrEqual(VERH_MIN - 1e-9)
    expect(h / w).toBeLessThanOrEqual(VERH_MAX + 1e-9)
    expect(b[0]).toBeLessThan(2600000); expect(b[2]).toBeGreaterThan(2600010)
  })
  test('Bildgrösse und Abbildung', () => {
    const b: [number, number, number, number] = [0, 0, 100, 60]
    expect(bildPixel(b)).toEqual({ breite: 1000, hoehe: 600 })
    const { xy, vh } = svgAbbildung(b)
    expect(vh).toBeCloseTo(600)
    expect(xy([0, 60])).toEqual([0, 0])
    expect(xy([100, 0])).toEqual([1000, 600])
  })
  test('Massstab und Adresse', () => {
    expect(massstab(100)).toBe(20)
    expect(wmsBildUrl([1, 2, 3, 4], 10, 20)).toContain('CRS=EPSG:2056&BBOX=1.0,2.0,3.0,4.0&WIDTH=10&HEIGHT=20')
  })
  test('ohne Armlinien kein Bild', () => {
    expect(kartenGeometrie({ osmKnoten: 1, lat: 46.95, lon: 7.44, belegt: [], vergleich: [], quellen: [] })).toBeNull()
    const g = kartenGeometrie({ osmKnoten: 1, lat: 46.95, lon: 7.44, belegt: [], vergleich: [], quellen: [], arme: [{ label: 'A', linie: [[46.95, 7.44], [46.9504, 7.44]] }] })!
    expect(g.arme[0].linie[1][1] - g.arme[0].linie[0][1]).toBeGreaterThan(40)   // rund 44 m nach Norden
  })
})
