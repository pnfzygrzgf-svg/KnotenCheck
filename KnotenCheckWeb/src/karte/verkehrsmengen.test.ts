import { describe, expect, it } from 'vitest'
import { ebenenQuelleUrl } from '../kartenbaustein/quellenLink'
import { bernMengenLesen, mengenLinien, mengenPunkte, VERKEHRSMENGE_ORT } from './belastung'
import type { P } from '../kartenbaustein/modell'

const lage = (lat: number, lon: number): P => [lon * 100, lat * 100]

describe('Verkehrsmengen als Kartenebene', () => {
  it('zeigt die Abschnitte der Stadt Bern mit dem DTV', () => {
    const [o] = mengenLinien([{ dtv: 8400, teile: [[[2600000, 1200000], [2600010, 1200000]]], quelle: 'Stadt Bern, flächendeckende Verkehrsdaten' }])
    expect(o).toMatchObject({ klasse: 'd10', wert: '8 400', text: 'DTV ≈ 8 400 Fahrzeuge je Tag (Stadt Bern, flächendeckende Verkehrsdaten)' })
    expect(ebenenQuelleUrl('dtv', o.quelle!)).toBe('https://map.bern.ch/geoportal/#/produkt/Flaechendeckende_Verkehrsdaten')
  })
  it('zeigt nur Zählstellen im Ausschnitt und mit Wert', () => {
    const l = mengenPunkte([{ lat: 47, lon: 8, dtv: 12300 }, { lat: 47, lon: 9, dtv: 500 }, { lat: 47, lon: 8.1, dtv: 0 }], 'Kanton Zürich, Verkehrsmessstellen', lage, [700, 4600, 850, 4800])
    expect(l).toHaveLength(1)
    expect(l[0]).toMatchObject({ punkt: [800, 4700], klasse: 'd20', wert: '12 300', symbol: 'Z', text: 'Zählstelle: DTV 12 300 (Kanton Zürich, Verkehrsmessstellen)' })
  })
  it('wirft bei gekappter oder fehlerhafter Antwort, statt eine halbe Karte zu zeigen', () => {
    expect(() => bernMengenLesen({ exceededTransferLimit: true, features: [] })).toThrow('unvollständig')
    expect(() => bernMengenLesen({ properties: { exceededTransferLimit: true }, features: [] })).toThrow('unvollständig')
    expect(() => bernMengenLesen({ error: { message: 'x' } })).toThrow('ArcGIS x')
    expect(bernMengenLesen({ features: [{ geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] }, properties: { Nt: 100, Nn: 50 } }] })[0].dtv).toBe(2000)
  })
  it('hat für jede Klasse einen Eintrag in der Legende', () => {
    expect(VERKEHRSMENGE_ORT.legende.map(l => l[0])).toEqual(['d2', 'd5', 'd10', 'd20', 'd99', 'zaehlstelle'])
  })
})
