import { describe, expect, it } from 'vitest'
import { kartenBezugAus, kartenBezugLesen, quellenFuer, type KnotenUebernahme } from './rechner'

const u = (x: Partial<KnotenUebernahme> = {}): KnotenUebernahme => ({ id: 1, lat: 46.95, lon: 7.44, name: 'Test', armCount: 4, arme: [], vergleich: [], hinweise: [],
  osmStand: '07.11.2026', hoehenModelle: ['swissALTI3D'],
  belegt: [{ art: 'neigung', text: 'n' }, { art: 'streifen', text: 's' }, { art: 'tempo', text: 't' }, { art: 'fgs', text: 'f' }, { art: 'schwerverkehr', text: 'v' }], ...x })

describe('Quellen im Druckblatt', () => {
  it('nennt immer OpenStreetMap mit dem Stand der Antwort', () => {
    const [osm] = quellenFuer(u({ belegt: [], hoehenModelle: [] }), 'sn022')
    expect(osm).toMatchObject({ quelle: 'OpenStreetMap (Overpass)', stand: '07.11.2026', fuer: 'Armzahl, Reihenfolge und Namen der Arme' })
    expect(quellenFuer(u({ belegt: [], hoehenModelle: [] }), 'sn022')).toHaveLength(1)
  })

  it('nimmt nur, was der Rechner nutzt', () => {
    const lsa = quellenFuer(u(), 'lsa')
    expect(lsa.map(q => q.fuer)).not.toContain('Längsneigung')
    expect(lsa[0].fuer).toContain('Tempo')
    const einmuendung = quellenFuer(u(), 'sn022')
    expect(einmuendung.map(q => q.fuer)).toContain('Längsneigung')
    expect(einmuendung[0].fuer).not.toContain('Tempo')
    expect(einmuendung[0].fuer).toContain('Fahrstreifen')
    expect(einmuendung.at(-1)!.anbieter).toBe('ARE')
  })

  it('unterscheidet die Höhenmodelle und erfindet keines', () => {
    const q = (m: string[]) => quellenFuer(u({ hoehenModelle: m }), 'sn022').filter(z => z.fuer === 'Längsneigung')
    expect(q(['DTM 2023 Stadt Bern'])[0]).toMatchObject({ anbieter: 'Geodaten Stadt Bern', stand: 'Befliegung 2. Juni 2023' })
    expect(q(['swissALTI3D', 'DTM 2023 Stadt Bern'])).toHaveLength(2)
    expect(q(['unbekanntes Modell'])).toEqual([])
  })

  it('überlebt das Speichern in der Datei', () => {
    const bezug = kartenBezugAus(u(), 'sn022')
    expect(kartenBezugLesen(JSON.parse(JSON.stringify(bezug)))?.quellen).toEqual(bezug.quellen)
  })

  it('liest ältere Dateien ohne Quellen und übernimmt keine fremden Adressen', () => {
    const alt = { osmKnoten: 1, lat: 46.95, lon: 7.44, belegt: [], vergleich: [] }
    expect(kartenBezugLesen(alt)?.quellen).toEqual([])
    const fremd = kartenBezugLesen({ ...alt, quellen: [{ quelle: 'X', url: 'javascript:alert(1)' }, { keine: 'Quelle' }] })
    expect(fremd?.quellen).toEqual([{ quelle: 'X', fuer: '', anbieter: '', stand: '', lizenz: '' }])
  })
})
