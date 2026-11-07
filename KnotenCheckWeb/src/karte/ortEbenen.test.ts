import { describe, expect, it } from 'vitest'
import { ebenenQuelleUrl, objektQuelleUrl } from '../kartenbaustein/quellenLink'
import type { RegionalObjekt } from '../knotenkern/daten/anbieter/gemeinsam/regional'
import type { ZhLinie } from '../knotenkern/daten/anbieter/gemeinsam/zuerich'
import type { OsmKnoten, OsmWeg } from '../knotenkern/daten/osm'
import { armTempoAmtlich, bernTempoLesen, bernTempoUrl, ebenenZusammen, inventarDienste, inventarObjekte, lsaAusOsm, ORT_EBENEN, punkteZusammen, streifenAusOsm, tempoAusOsm, tempoAusRegional, tempoAusZuerich, tempoDienste, tempoKlasse, tempoZusammen, vortrittAusOsm, wegTempo } from './ortEbenen'
import type { P } from '../kartenbaustein/modell'

const weg = (id: number, tags: Record<string, string>): OsmWeg => ({ id, tags, knoten: [1, 2, 3], geom: [[46.95, 7.44], [46.951, 7.441], [46.952, 7.442]] })
const stelle = { lat: 46.95, lon: 7.44, e: 2600000, n: 1200000 }
const lv = { type: 'name', properties: { name: 'urn:ogc:def:crs:EPSG::2056' } }

describe('Tempo aus OpenStreetMap', () => {
  it('liest maxspeed und sonst die Zone', () => {
    expect(wegTempo({ maxspeed: '50' })).toBe(50)
    expect(wegTempo({ 'zone:maxspeed': 'CH:30' })).toBe(30)
    expect(wegTempo({ 'maxspeed:type': 'CH:zone20' })).toBe(20)
    expect(wegTempo({ maxspeed: 'walk' })).toBeNull()
    expect(wegTempo({})).toBeNull()
  })

  it('zeichnet Wege gestrichelt und lässt Wege ohne Tempo weg', () => {
    const [o, ...rest] = tempoAusOsm([weg(7, { maxspeed: '30', name: 'Teststrasse' }), weg(8, {})])
    expect(rest).toEqual([])
    expect(o).toMatchObject({ id: 'osm:7', klasse: 't30', wert: '30', gestrichelt: true, text: 'Tempo 30 km/h, Teststrasse (OpenStreetMap maxspeed)' })
  })

  it('verweist für ein Objekt direkt auf den Weg in OpenStreetMap', () => {
    const [o] = tempoAusOsm([weg(7, { maxspeed: '30' })])
    expect(objektQuelleUrl(o, 'tempo', null, stelle)).toBe('https://www.openstreetmap.org/way/7')
  })
})

describe('Vortrittszeichen', () => {
  const zeichen = (id: number, tags: Record<string, string>): OsmKnoten => ({ id, tags, lat: 46.95, lon: 7.44 })
  it('unterscheidet Stop und Kein Vortritt und nennt die Richtung', () => {
    const [a, b] = vortrittAusOsm([zeichen(1, { highway: 'stop' }), zeichen(2, { highway: 'give_way', direction: 'forward' })])
    expect(a).toMatchObject({ id: 'vt:1', klasse: 'stop', text: 'Stop (OpenStreetMap)' })
    expect(b).toMatchObject({ id: 'vt:2', klasse: 'give_way', text: 'Kein Vortritt (Richtung forward) (OpenStreetMap)' })
    expect(objektQuelleUrl(a, 'vortritt', null, stelle)).toBe('https://www.openstreetmap.org/node/1')
  })

  it('hat für jede Klasse einen Eintrag in der Legende', () => {
    const legende = ORT_EBENEN.find(e => e.id === 'vortritt')!.legende.map(l => l[0])
    expect(legende).toEqual(['give_way', 'stop', 'hauptstrasse'])
  })
})

describe('Tempo amtlich', () => {
  it('teilt die Klassen wie die anderen Rechner ein, jede Klasse steht in der Legende', () => {
    expect([20, 30, 40, 50, 60, 80].map(tempoKlasse)).toEqual(['t20', 't30', 't40', 't50', 't60', 't60'])
    const legende = ORT_EBENEN.find(e => e.id === 'tempo')!.legende.map(l => l[0])
    for (const k of ['t20', 't30', 't40', 't50', 't60', 'verbot']) expect(legende).toContain(k)
  })

  it('lässt OSM nur dort stehen, wo keine amtliche Linie liegt', () => {
    const [osmNah] = tempoAusOsm([weg(1, { maxspeed: '30' })]), mitte = osmNah.linien![0][1]
    const amtlich = { id: 'vs:1', klasse: 't30', text: 'amtlich', linien: [[[mitte[0] - 50, mitte[1] + 5], [mitte[0] + 50, mitte[1] + 5]] as P[]] }
    expect(tempoZusammen([amtlich], [osmNah]).map(o => o.id)).toEqual(['vs:1'])
    const fern = { ...amtlich, linien: [[[mitte[0] - 50, mitte[1] + 200], [mitte[0] + 50, mitte[1] + 200]] as P[]] }
    expect(tempoZusammen([fern], [osmNah]).map(o => o.id)).toEqual(['vs:1', 'osm:1'])
    expect(tempoZusammen([], [osmNah]).map(o => o.id)).toEqual(['osm:1'])
  })

  it('fragt in Bern ein Rechteck in LV95 ab', () => {
    const u = new URL(bernTempoUrl([2600000, 1200000], 500))
    expect(u.host).toBe('map.bern.ch')
    expect(u.searchParams.get('geometry')).toBe('2599500,1199500,2600500,1200500')
    expect(u.searchParams.get('outSR')).toBe('2056')
  })

  it('liest Linien der Stadt Bern und übergeht Linien ohne gültiges Tempo', () => {
    const linie = [[2600000, 1200000], [2600010, 1200000]]
    const o = bernTempoLesen({ crs: lv, features: [
      { geometry: { type: 'LineString', coordinates: linie }, properties: { Objectid: 1, V_sig: 30, Strassenname: 'Testgasse' } },
      { geometry: { type: 'MultiLineString', coordinates: [linie, linie] }, properties: { Objectid: 2, V_sig: 50 } },
      { geometry: { type: 'LineString', coordinates: linie }, properties: { Objectid: 3, V_sig: null } },
      { geometry: { type: 'LineString', coordinates: linie }, properties: { Objectid: 4, V_sig: 999 } },
    ] })
    expect(o.map(x => x.id)).toEqual(['vs:1', 'vs:2'])
    expect(o[0]).toMatchObject({ klasse: 't30', wert: '30', text: 'Tempo 30 km/h, Testgasse (Geoportal Stadt Bern)' })
    expect(o[1].linien).toHaveLength(2)
    expect(ebenenQuelleUrl('tempo', o[0].quelle!)).toContain('Signalisierte_Hoechstgeschwindigkeit')
  })

  it('nimmt eine fehlerhafte Berner Antwort nicht als leer', () => {
    expect(() => bernTempoLesen({ crs: lv, error: { code: 500, message: 'kaputt' } })).toThrow(/ArcGIS 500/)
    expect(() => bernTempoLesen({ crs: lv, exceededTransferLimit: true })).toThrow(/unvollständig/)
    expect(() => bernTempoLesen({ crs: lv, properties: { exceededTransferLimit: true } })).toThrow(/unvollständig/)
    expect(() => bernTempoLesen({ features: [] })).toThrow(/LV95/)
  })

  it('zeigt ein Fahrverbot in Zürich ohne Tempowert', () => {
    const zh = (x: Partial<ZhLinie>): ZhLinie => ({ id: '1', name: 'Rehgässchen', regime: 'Fahrverbot', code: 'T0', umgesetzt: null, rechtskraeftig: null, teile: [[[0, 0], [1, 1]]], tempo: null, verbot: true, ausnahmen: '', signal: '', ...x })
    const [a, b] = tempoAusZuerich([zh({}), zh({ id: '2', tempo: 30, regime: 'Tempo 30', code: 'T30', verbot: false })])
    expect(a).toMatchObject({ id: 'zh:1', klasse: 'verbot' }); expect(a.wert).toBeUndefined()
    expect(b).toMatchObject({ id: 'zh:2', klasse: 't30', wert: '30' })
  })

  it('nimmt von den kantonalen Diensten nur Linien mit Tempo', () => {
    const d = { id: 'so.tempo', name: 'Tempo Kantonsstrassen (Solothurn)', anbieter: 'Kanton Solothurn', url: 'https://geo.so.ch/api/data/v1/x/' }
    const o = (x: Partial<RegionalObjekt>) => ({ id: '1', name: '', hinweis: '', tempo: 50, zone: null, bestaetigen: false, stand: null, ...x }) as RegionalObjekt
    const liste = tempoAusRegional(d, [o({ id: '1', teile: [[[0, 0], [1, 1]]], name: 'Westtangente' }), o({ id: '2', teile: [[[0, 0], [1, 1]]], tempo: null }), o({ id: '3', punkte: [[0, 0]] })])
    expect(liste.map(x => x.id)).toEqual(['reg:so.tempo:1'])
    expect(liste[0]).toMatchObject({ klasse: 't50', dienstUrl: d.url, text: 'Tempo 50 km/h, Westtangente (Kanton Solothurn)' })
    expect(ebenenQuelleUrl('tempo', liste[0].quelle!, liste[0].dienstUrl)).toBe('https://geo.so.ch/')
  })

  it('wählt die Dienste nach den Gemeinden im Ausschnitt', () => {
    const ids = (o: Parameters<typeof tempoDienste>[0]) => tempoDienste(o).regional.map(d => d.id)
    expect(tempoDienste([{ bfs: 351, kanton: 'BE', name: 'Bern' }])).toMatchObject({ bern: true, zuerich: false, regional: [] })
    const stadtZh = { bfs: 261, kanton: 'ZH', name: 'Zürich' }
    expect(tempoDienste([stadtZh]).zuerich).toBe(true)
    expect(ids([stadtZh])).not.toContain('ktzh.tempo')
    expect(ids([{ bfs: 198, kanton: 'ZH', name: 'Uster' }])).toContain('ktzh.tempo')
    expect(ids([{ bfs: 1061, kanton: 'LU', name: 'Luzern' }])).toEqual([])
  })

  it('sagt bei jeder Ebene, dass sie nicht in die Rechnung wirkt', () => {
    expect(ORT_EBENEN.every(e => /keine Wirkung auf die Rechnung/.test(e.quelle))).toBe(true)
  })
})

describe('Inventare', () => {
  const d = { name: 'Lichtsignalanlagen (Basel-Stadt)', anbieter: 'Geodaten Basel-Stadt', url: 'https://data.bs.ch/api/explore/v2.1/catalog/datasets/100430/records', hinweis: 'Anlagenpunkte' }
  const objekt = (x: Partial<RegionalObjekt>): RegionalObjekt => ({ id: 'bs.lsa:1:a', name: 'Aeschenplatz', tempo: null, zone: null, bestaetigen: false, hinweis: '', stand: null, ...x })
  const knoten = (id: number, tags: Record<string, string>): OsmKnoten => ({ id, tags, lat: 46.95, lon: 7.44 })

  it('nimmt nur die Klassen der Ebene und nennt Herkunft und Hinweis', () => {
    const l = inventarObjekte(d, [objekt({ verkehr: 'lsa', punkte: [[2600000, 1200000]] }), objekt({ verkehr: 'stop', punkte: [[2600000, 1200000]] }), objekt({ punkte: [[2600000, 1200000]] })], ['lsa'])
    expect(l).toEqual([{ id: 'bs.lsa:1:a:0', punkt: [2600000, 1200000], klasse: 'lsa', quelle: 'Geodaten Basel-Stadt, Lichtsignalanlagen (Basel-Stadt)', dienstUrl: d.url,
      text: 'Lichtsignalanlage; Aeschenplatz; Anlagenpunkte; Geodaten Basel-Stadt' }])
  })
  it('zeichnet Markierungen als Linien', () => {
    const teile: P[][] = [[[2600000, 1200000], [2600004, 1200000]]]
    expect(inventarObjekte(d, [objekt({ verkehr: 'fgs', teile })], ['fgs'])[0]).toMatchObject({ linien: teile, klasse: 'fgs' })
  })
  it('zeigt OSM nur abseits der amtlichen Objekte', () => {
    const a = { id: 'a', punkt: [2600000, 1200000] as P, klasse: 'lsa', text: '' }, nah = { id: 'n', punkt: [2600030, 1200000] as P, klasse: 'lsa_osm', text: '' }, weit = { id: 'w', punkt: [2600050, 1200000] as P, klasse: 'lsa_osm', text: '' }
    expect(punkteZusammen([a], [nah, weit], 40).map(o => o.id)).toEqual(['a', 'w'])
  })
  it('misst auch zu amtlichen Linien', () => {
    const a = { id: 'a', linien: [[[2600000, 1200000], [2600004, 1200000]]] as P[][], klasse: 'fgs', text: '' }, nah = { id: 'n', punkt: [2600010, 1200000] as P, klasse: 'fgs_osm', text: '' }
    expect(punkteZusammen([a], [nah], 15).map(o => o.id)).toEqual(['a'])
  })
  it('verweist bei OSM-Objekten auf den Knoten', () => {
    expect(objektQuelleUrl(lsaAusOsm([knoten(5, {})])[0], 'lsa', null, stelle)).toBe('https://www.openstreetmap.org/node/5')
    expect(objektQuelleUrl(streifenAusOsm([knoten(6, { crossing: 'zebra' })])[0], 'streifen', null, stelle)).toBe('https://www.openstreetmap.org/node/6')
  })
  it('verweist bei amtlichen Objekten auf den Dienst', () => {
    const [o] = inventarObjekte(d, [objekt({ verkehr: 'lsa', punkte: [[2600000, 1200000]] })], ['lsa'])
    expect(objektQuelleUrl(o, 'lsa', ebenenQuelleUrl('lsa', o.quelle!, o.dienstUrl), stelle)).toBe('https://data.bs.ch/')
  })
  it('hat für jede Klasse einen Eintrag in der Legende', () => {
    expect(ORT_EBENEN.find(e => e.id === 'streifen')!.legende.map(l => l[0])).toEqual(['fgs', 'fgs_signal', 'fgs_osm'])
    expect(ORT_EBENEN.find(e => e.id === 'lsa')!.legende.map(l => l[0])).toEqual(['lsa', 'lsa_osm'])
  })
  it('fragt je Ort die richtigen Dienste, einen für zwei Ebenen nur einmal', () => {
    const ids = (kanton: string, bfs: number, an: Parameters<typeof inventarDienste>[1]) => inventarDienste([{ kanton, bfs, name: 'x' }], an).map(x => x.d.id).sort()
    expect(ids('ZH', 261, ['lsa', 'streifen'])).toEqual(['stadtzh.lsa'])
    expect(ids('ZH', 191, ['lsa', 'streifen'])).toEqual(['ktzh.fgs', 'ktzh.lsa'])
    expect(ids('BE', 351, ['lsa', 'streifen', 'vortritt'])).toEqual([])
    const ge = inventarDienste([{ kanton: 'GE', bfs: 6621, name: 'Genève' }], ['vortritt', 'streifen']).find(x => x.d.id === 'ge.signal')!
    expect(ge.ebenen).toEqual(['vortritt', 'streifen'])
  })
  it('führt je Ebene nur zusammen, was an ist', () => {
    const osm = { wege: [], tram: [], uebergaenge: [knoten(1, {})], ampeln: [knoten(2, {})], relationen: [], querungen: [], vortritt: [knoten(3, { highway: 'stop' })] }
    const leer = { tempo: [], vortritt: [], streifen: [], lsa: [] }
    const z = ebenenZusammen(['lsa'], leer, osm)
    expect(z.lsa.map(o => o.id)).toEqual(['lsa:2'])
    expect(z.vortritt).toEqual([])
  })
})

describe('Amtliches Tempo je Arm', () => {
  const arm: P[] = [[2600000, 1200000], [2600100, 1200000]]
  const linie = (id: string, wert: string, n: number, von = 0, bis = 100) => ({ id, klasse: 't30', text: '', wert, quelle: 'Geoportal Stadt Bern, Signalisierte Höchstgeschwindigkeit', linien: [[[2600000 + von, 1200000 + n], [2600000 + bis, 1200000 + n]] as P[]] })
  it('nimmt die Linie auf dem Arm und kürzt die Quelle', () => {
    expect(armTempoAmtlich(arm, [linie('a', '30', 3)])).toEqual({ tempo: 30, quelle: 'Stadt Bern' })
  })
  it('lässt Linien neben dem Arm und quer dazu weg', () => {
    expect(armTempoAmtlich(arm, [linie('a', '30', 20)])).toBeNull()
    expect(armTempoAmtlich(arm, [{ ...linie('a', '30', 0), linien: [[[2600030, 1199950], [2600030, 1200050]] as P[]] }])).toBeNull()
  })
  it('nimmt keinen Wert ohne Mehrheit', () => {
    expect(armTempoAmtlich(arm, [linie('a', '30', 2, 0, 30), linie('b', '50', 2, 30, 100)])).toEqual({ tempo: 50, quelle: 'Stadt Bern' })
    expect(armTempoAmtlich(arm, [linie('a', '30', 2, 0, 20)])).toBeNull()
  })
  it('überspringt die Linien im Knoten selbst', () => {
    expect(armTempoAmtlich(arm, [linie('a', '30', 2, 0, 8)])).toBeNull()
  })
})
