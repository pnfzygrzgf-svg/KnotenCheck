import { describe, test, expect } from 'vitest'
import { kreuz, neg } from '../knotenkern/geo'
import { knotenVorschlag, moeglicheRechner, rechnerVorschlag, vermutlichRechtsvortritt, type KartenArm, type KnotenVorschlag } from './knotenVorschlag'
import { armStreifen, spurenLesen } from './fahrstreifen'
import { bernLesen, lokalLinieZuordnen, modellZuordnen, npvmLesen, type ArmBelastung, type ModellStrecke } from './belastung'
import { neigungsklasse, NEIGUNG_LINIE_M } from './neigung'
import { abweichung, querschnitteKnoten, querschnitteKreisel, lokalTitel } from './vergleich'
import {
  belegtFuer, eigenerLinks, eigenerRechts, intersectionAus, kartenBezugAus, kartenBezugLesen, kombination, type ArmStreifen,
} from './rechner'
import { ALLES, anfangsPaar, armeOrdnen, hauptKnickt, hauptPaare, kreiselOrdnen, kreiselTyp, tempoQuelle, uebernahmeAus } from './uebernahme'

// ── Künstliche Overpass-Antworten ─────────────────────────────────────────────

const LAT0 = 46.95, LON0 = 7.44
const M_LAT = 1 / 111200, M_LON = 1 / (111200 * Math.cos(LAT0 * Math.PI / 180))
const punkt = (az: number, m: number) => ({
  lat: LAT0 + Math.cos(az * Math.PI / 180) * m * M_LAT, lon: LON0 + Math.sin(az * Math.PI / 180) * m * M_LON,
})

interface ArmDef { az: number; name?: string; hw?: string; tags?: Record<string, string> }
const MITTE = 1

/** Knoten MITTE mit je einem Weg pro Arm, 120 m lang */
function knotenRoh(arme: ArmDef[], weitere: object[] = []) {
  const elements: object[] = arme.map((a, i) => {
    const aussen = 100 + i
    return { type: 'way', id: 10 + i, nodes: [MITTE, aussen], geometry: [punkt(0, 0), punkt(a.az, 120)],
      tags: { highway: a.hw ?? 'secondary', ...(a.name ? { name: a.name } : {}), ...a.tags } }
  })
  return { elements: [...elements, ...weitere] }
}

const vorschlag = (roh: object, id = MITTE): KnotenVorschlag => {
  const v = knotenVorschlag(roh, id)
  if (!v) throw new Error('kein Vorschlag')
  return v
}
const haupt = (name: string, az: number): ArmDef => ({ az, name })

// Fährt man von x zum Knoten, liegt y rechts?
const rechtsVon = (x: KartenArm, y: KartenArm) => kreuz(neg(x.richtung), y.richtung) < 0

describe('Reihenfolge der Arme in jeder Drehlage', () => {
  for (let d = 0; d < 360; d += 30) {
    test(`Einmündung, Drehung ${d}°: A und C Hauptstrasse, B rechts von A`, () => {
      const v = vorschlag(knotenRoh([haupt('Hauptweg', d + 90), haupt('Hauptweg', d + 270), { az: d + 180, name: 'Nebenweg' }]))
      const [a, c, b] = armeOrdnen(v, anfangsPaar(v)!)
      expect(a.name).toBe('Hauptweg')
      expect(c.name).toBe('Hauptweg')
      expect(b.name).toBe('Nebenweg')
      expect(rechtsVon(a, b)).toBe(true)
      expect(rechtsVon(c, b)).toBe(false)
    })

    test(`Kreuzung, Drehung ${d}°: B rechts und D links von A, C gegenüber`, () => {
      const v = vorschlag(knotenRoh([haupt('Hauptweg', d + 90), haupt('Hauptweg', d + 270), { az: d + 180, name: 'Süd' }, { az: d, name: 'Nord' }]))
      const [a, c, b, dd] = armeOrdnen(v, anfangsPaar(v)!)
      expect([a.name, c.name]).toEqual(['Hauptweg', 'Hauptweg'])
      expect(rechtsVon(a, b)).toBe(true)
      expect(rechtsVon(a, dd)).toBe(false)
      expect(rechtsVon(c, dd)).toBe(true)
      expect(rechtsVon(b, c)).toBe(true)
    })
  }

  test('andere Hauptstrasse gewählt: Rollen wechseln, B bleibt rechts von A', () => {
    const v = vorschlag(knotenRoh([haupt('Hauptweg', 90), haupt('Hauptweg', 270), { az: 180, name: 'Süd' }, { az: 0, name: 'Nord' }]))
    const andere = hauptPaare(v).find(p => !p.every(k => anfangsPaar(v)!.includes(k)))!
    const [a, c, b] = armeOrdnen(v, andere)
    expect(new Set([a.name, c.name])).toEqual(new Set(['Süd', 'Nord']))
    expect(rechtsVon(a, b)).toBe(true)
  })
})

describe('Hauptstrasse', () => {
  test('Kreuzung: nur gegenüberliegende Paare wählbar', () => {
    const v = vorschlag(knotenRoh([{ az: 0, name: 'N' }, { az: 90, name: 'O' }, { az: 180, name: 'S' }, { az: 270, name: 'W' }]))
    expect(hauptPaare(v)).toHaveLength(2)
  })
  test('Einmündung: alle drei Paare wählbar', () => {
    const v = vorschlag(knotenRoh([{ az: 0, name: 'N' }, { az: 120, name: 'O' }, { az: 240, name: 'W' }]))
    expect(hauptPaare(v)).toHaveLength(3)
  })
  test('abknickende Hauptstrasse: gemeldet, gegenüberliegendes Paar vorbelegt', () => {
    const v = vorschlag(knotenRoh([haupt('Hauptweg', 0), haupt('Hauptweg', 90), { az: 180, name: 'S' }, { az: 270, name: 'W' }]))
    expect(hauptKnickt(v)).toBe(true)
    expect(hauptPaare(v).some(p => p.join() === anfangsPaar(v)!.join())).toBe(true)
    expect(uebernahmeAus(v, anfangsPaar(v))!.hinweise.join(' ')).toContain('knickt')
  })
})

describe('Rechnervorschlag', () => {
  const stop = { type: 'node', id: 500, lat: punkt(180, 8).lat, lon: punkt(180, 8).lon, tags: { highway: 'stop' } }

  test('Stop an der Nebenstrasse: Einmündung & Kreuzung, Hauptstrasse belegt', () => {
    const roh = knotenRoh([haupt('Hauptweg', 90), haupt('Hauptweg', 270), { az: 180, name: 'Nebenweg' }], [stop])
    const v = vorschlag(roh)
    expect(v.hauptSicher).toBe(true)
    expect(v.arme.find(a => a.name === 'Nebenweg')!.signal).toBe('stop')
    expect(rechnerVorschlag(v).rechner).toBe('sn022')
  })
  test('Fussgängerstreifen bis 40 m: Knoten mit Fussgänger*innen', () => {
    const fgs = { type: 'node', id: 501, ...punkt(90, 20), tags: { highway: 'crossing', crossing: 'zebra' } }
    const v = vorschlag(knotenRoh([haupt('Hauptweg', 90), haupt('Hauptweg', 270), { az: 180, name: 'Nebenweg' }], [stop, fgs]))
    expect(v.fgs).toBe(1)
    expect(rechnerVorschlag(v).rechner).toBe('vss308')
  })
  test('weiter als 40 m zählt nicht', () => {
    const fgs = { type: 'node', id: 501, ...punkt(90, 60), tags: { highway: 'crossing', crossing: 'zebra' } }
    expect(vorschlag(knotenRoh([haupt('Hauptweg', 90), haupt('Hauptweg', 270), { az: 180, name: 'Nebenweg' }], [fgs])).fgs).toBe(0)
  })
  test('unmarkierte Querung zählt nicht als Fussgängerstreifen', () => {
    const q = { type: 'node', id: 501, ...punkt(90, 20), tags: { highway: 'crossing', crossing: 'unmarked' } }
    expect(vorschlag(knotenRoh([haupt('Hauptweg', 90), haupt('Hauptweg', 270), { az: 180, name: 'Nebenweg' }], [q])).fgs).toBe(0)
  })
  test('Lichtsignal: LSA-Knoten', () => {
    const lsa = { type: 'node', id: 502, lat: LAT0, lon: LON0, tags: { highway: 'traffic_signals' } }
    const v = vorschlag(knotenRoh([haupt('Hauptweg', 90), haupt('Hauptweg', 270), { az: 180, name: 'Nebenweg' }], [lsa]))
    expect(v.form).toBe('lsa')
    expect(rechnerVorschlag(v).rechner).toBe('lsa')
    expect(moeglicheRechner(v)).toContain('sn022')
  })
  test('nur Quartierstrassen ohne Signal: Hinweis auf Rechtsvortritt, den die Rechner nicht kennen', () => {
    const q = (az: number, name: string): ArmDef => ({ az, name, hw: 'residential' })
    const v = vorschlag(knotenRoh([q(0, 'N'), q(90, 'O'), q(180, 'S'), q(270, 'W')]))
    expect(vermutlichRechtsvortritt(v)).toBe(true)
    expect(uebernahmeAus(v, anfangsPaar(v))!.hinweise.join(' ')).toContain('Rechtsvortritt')
  })
  test('mit Stop an einer Quartierstrasse: kein Hinweis auf Rechtsvortritt', () => {
    const q = (az: number, name: string): ArmDef => ({ az, name, hw: 'residential' })
    const v = vorschlag(knotenRoh([q(90, 'Hauptweg'), q(270, 'Hauptweg'), q(180, 'Nebenweg')], [stop]))
    expect(vermutlichRechtsvortritt(v)).toBe(false)
  })
})

describe('Kreisel', () => {
  const RING = [0, 45, 90, 135, 180, 225, 270, 315]
  /** Ring gegen den Uhrzeigersinn; arme: Azimut je Arm, dessen Ringpunkt daran hängt */
  function kreiselRoh(arme: ArmDef[]) {
    const folge = [...RING].reverse()
    const id = (az: number) => 200 + az
    const ring = { type: 'way', id: 1000, nodes: [...folge.map(id), id(folge[0])], geometry: [...folge, folge[0]].map(az => punkt(az, 15)),
      tags: { highway: 'secondary', junction: 'roundabout', oneway: 'yes' } }
    const wege = arme.map((a, i) => ({ type: 'way', id: 10 + i, nodes: [id(a.az), 100 + i], geometry: [punkt(a.az, 15), punkt(a.az, 130)],
      tags: { highway: 'secondary', name: a.name, ...a.tags } }))
    return { elements: [ring, ...wege] }
  }

  test('vier Arme: Rechnervorschlag Kreisverkehr', () => {
    const v = vorschlag(kreiselRoh([{ az: 0, name: 'N' }, { az: 90, name: 'O' }, { az: 180, name: 'S' }, { az: 270, name: 'W' }]), 200)
    expect(v.form).toBe('kreisel')
    expect(v.arme).toHaveLength(4)
    expect(rechnerVorschlag(v).rechner).toBe('sn024a')
    expect(moeglicheRechner(v)).toEqual(['sn024a'])
  })
  test('Arme in Fahrtrichtung: rechts abbiegen führt zum nächsten Arm', () => {
    const v = vorschlag(kreiselRoh([{ az: 0, name: 'N' }, { az: 90, name: 'O' }, { az: 180, name: 'S' }, { az: 270, name: 'W' }]), 200)
    const f = kreiselOrdnen(v.arme)
    expect(f.map(a => a.name)).toEqual(['N', 'W', 'S', 'O'])
    for (let i = 0; i < 4; i++) expect(rechtsVon(f[i], f[(i + 1) % 4])).toBe(true)
  })
  test('Ein- und Ausfahrt derselben Strasse sind ein Arm', () => {
    const ein = { oneway: 'yes' }
    const v = vorschlag(kreiselRoh([{ az: 0, name: 'N' }, { az: 45, name: 'N', tags: ein }, { az: 135, name: 'O' }, { az: 225, name: 'S' }]), 200)
    expect(v.arme).toHaveLength(3)
  })
  test('Übernahme nummeriert die Arme', () => {
    const v = vorschlag(kreiselRoh([{ az: 0, name: 'N' }, { az: 120, name: 'O' }, { az: 240, name: 'W' }].map(a => ({ ...a, az: Math.round(a.az / 45) * 45 }))), 200)
    const u = uebernahmeAus(v, null)!
    expect(u.armCount).toBe(3)
    expect(u.arme.map(a => a.label)).toEqual(['1', '2', '3'])
  })
})

describe('Grenzen', () => {
  test('fünf Arme: Meldung, keine Übernahme', () => {
    const v = vorschlag(knotenRoh([0, 72, 144, 216, 288].map((az, i) => ({ az, name: `S${i}` }))))
    expect(v.meldung).toContain('5 Arme')
    expect(uebernahmeAus(v, anfangsPaar(v))).toBeNull()
  })
  test('Punkt ausserhalb der Daten: kein Vorschlag', () => {
    expect(knotenVorschlag(knotenRoh([haupt('A', 90), haupt('A', 270), { az: 180, name: 'B' }]), 999)).toBeNull()
  })
  test('naher zweiter Knoten: Hinweis auf getrennte Richtungsfahrbahnen', () => {
    const roh = knotenRoh([haupt('Hauptweg', 90), haupt('Hauptweg', 270), { az: 180, name: 'Nebenweg' }], [
      { type: 'way', id: 40, nodes: [100, 300], geometry: [punkt(90, 120), punkt(90, 240)], tags: { highway: 'secondary', name: 'Hauptweg' } },
    ])
    // zweiter Knoten 20 m östlich: der Hauptweg wird dort geteilt und von einer Querstrasse berührt
    const elemente = roh.elements as { type: string; id: number; nodes?: number[]; geometry?: object[] }[]
    const ost = elemente.find(e => e.id === 10)!
    ost.nodes = [MITTE, 400, 100]
    ost.geometry = [punkt(0, 0), punkt(90, 20), punkt(90, 120)]
    elemente.push({ type: 'way', id: 41, nodes: [400, 401], geometry: [punkt(90, 20), { lat: LAT0 + 120 * M_LAT, lon: LON0 + 20 * M_LON }] })
    Object.assign(elemente[elemente.length - 1], { tags: { highway: 'secondary', name: 'Querweg' } })
    expect(vorschlag(roh).hinweise.join(' ')).toContain('Richtungsfahrbahnen')
  })
  test('Einbahn vom Knoten weg wird gemeldet', () => {
    const v = vorschlag(knotenRoh([haupt('Hauptweg', 90), haupt('Hauptweg', 270), { az: 180, name: 'Nebenweg', tags: { oneway: 'yes' } }]))
    expect(uebernahmeAus(v, anfangsPaar(v))!.hinweise.join(' ')).toContain('Einbahn vom Knoten weg')
  })
  test('unsichere Hauptstrasse wird gemeldet', () => {
    const v = vorschlag(knotenRoh([haupt('Hauptweg', 90), haupt('Hauptweg', 270), { az: 180, name: 'Nebenweg' }]))
    expect(uebernahmeAus(v, anfangsPaar(v))!.hinweise.join(' ')).toContain('Hauptstrasse angenommen')
  })
})

describe('Eingaben der Rechner', () => {
  test('Einmündung: Namen übernommen, Ströme leer', () => {
    const v = vorschlag(knotenRoh([haupt('Hauptweg', 90), haupt('Hauptweg', 270), { az: 180, name: 'Nebenweg' }]))
    const c = intersectionAus(uebernahmeAus(v, anfangsPaar(v))!)
    expect(c.arms).toHaveLength(3)
    expect(c.arms.map(a => a.streetName)).toEqual(['Hauptweg', 'Hauptweg', 'Nebenweg'])
    expect(c.arms.every(a => a.leftVolume + a.straightVolume + a.rightVolume === 0)).toBe(true)
  })
  test('Arm ohne Namen: Himmelsrichtung', () => {
    const v = vorschlag(knotenRoh([haupt('Hauptweg', 90), haupt('Hauptweg', 270), { az: 180 }]))
    expect(uebernahmeAus(v, anfangsPaar(v))!.arme[2].name).toBe('Arm Süd')
  })
})

describe('Fahrstreifen aus OSM', () => {
  test('Abbiegeangaben von links nach rechts', () => {
    expect(spurenLesen('left|through;right')).toEqual([['left'], ['straight', 'right']])
    expect(spurenLesen('slight_left|')).toEqual([['left'], ['straight']])
  })
  test('Zweirichtungsstrasse: Richtung zum Knoten', () => {
    const t = { 'lanes:forward': '2', 'lanes:backward': '1', 'turn:lanes:forward': 'left|through;right' }
    expect(armStreifen(t, true)).toEqual({ anzahl: 2, spuren: [['left'], ['straight', 'right']] })
    expect(armStreifen(t, false)).toEqual({ anzahl: 1, spuren: null })
  })
  test('Einbahn gegen die Fahrtrichtung: keine Zufahrt, keine Angabe', () => {
    expect(armStreifen({ oneway: 'yes', lanes: '2' }, false)).toBeNull()
  })
  test('ohne lanes keine Angabe, lanes=2 heisst ein Streifen je Richtung', () => {
    expect(armStreifen({}, true)).toBeNull()
    expect(armStreifen({ lanes: '2' }, true)).toEqual({ anzahl: 1, spuren: null })
  })
  test('mehrere Streifen ohne Abbiegeangabe bleiben offen', () => {
    const s = { anzahl: 2, spuren: null }
    expect(eigenerLinks(s)).toBeNull()
    expect(kombination(s)).toBeNull()
  })
  test('Ableitungen für die Rechner', () => {
    const s: ArmStreifen = { anzahl: 2, spuren: [['left'], ['straight', 'right']] }
    expect(eigenerLinks(s)).toBe(true)
    expect(eigenerRechts(s)).toBe(false)
    expect(kombination(s)).toBe('throughAndRight')
    expect(kombination({ anzahl: 2, spuren: [['left', 'straight'], ['right']] })).toBe('leftAndThrough')
    expect(kombination({ anzahl: 1, spuren: null })).toBe('all')
    expect(eigenerLinks({ anzahl: 1, spuren: null })).toBe(false)
  })
  test('Kreiseltyp aus Einfahrt und Ring', () => {
    expect(kreiselTyp({ anzahl: 1, spuren: null }, null)).toBe('1/1')
    expect(kreiselTyp({ anzahl: 2, spuren: null }, 1)).toBe('2/1+')
    expect(kreiselTyp({ anzahl: 2, spuren: null }, 2)).toBe('2/2')
    expect(kreiselTyp({ anzahl: 1, spuren: null }, 2)).toBeUndefined()
    expect(kreiselTyp(null, 1)).toBeUndefined()
  })
})

describe('Neigungsklassen', () => {
  test.each([[0, '±0%'], [0.9, '±0%'], [-0.9, '±0%'], [1, '+2%'], [2.9, '+2%'], [3, '+4%'], [7, '+4%'], [-1, '-2%'], [-3, '-4%'], [-9, '-4%']] as const)(
    '%f %% → %s', (i, k) => expect(neigungsklasse(i)).toBe(k))
})

describe('Vorbelegung je Arm', () => {
  const arme = (): ArmDef[] => [
    { az: 90, name: 'Hauptweg', tags: { 'lanes:forward': '1', 'lanes:backward': '2', 'turn:lanes:backward': 'left|through', maxspeed: '50' } },
    { az: 270, name: 'Hauptweg', tags: { maxspeed: '30' } },
    { az: 180, name: 'Nebenweg', tags: { 'zone:maxspeed': 'CH:30' } },
  ]
  const fgs = { type: 'node', id: 501, ...punkt(180, 15), tags: { highway: 'crossing', crossing: 'zebra', 'crossing:island': 'yes' } }
  const v = () => vorschlag(knotenRoh(arme(), [fgs]))
  const arm = (x: KnotenVorschlag, name: string, az: number) => x.arme.find(a => a.name === name && Math.abs(a.richtung[0] - Math.sin(az * Math.PI / 180)) < 0.1)!

  test('Fussgängerstreifen gehört zum nächsten Arm, Insel erkannt', () => {
    const x = v()
    expect(arm(x, 'Nebenweg', 180).fgs).toEqual({ anzahl: 1, insel: true })
    expect(arm(x, 'Hauptweg', 90).fgs).toBeNull()
  })
  test('Fahrstreifen zum Knoten hin: Der Weg läuft vom Knoten weg, zählt also rückwärts', () => {
    expect(arm(v(), 'Hauptweg', 90).streifen).toEqual({ anzahl: 2, spuren: [['left'], ['straight']] })
  })
  test('Tempo aus maxspeed und Zone', () => {
    const x = v()
    expect(arm(x, 'Hauptweg', 90).tempo).toBe(50)
    expect(arm(x, 'Nebenweg', 180).tempo).toBe(30)
  })
  test('Profil läuft vom Knoten weg', () => {
    const p = arm(v(), 'Nebenweg', 180).profil
    expect(p[0][1]).toBeGreaterThan(p[p.length - 1][1])
    expect(Math.hypot(p[0][0] - p[p.length - 1][0], p[0][1] - p[p.length - 1][1])).toBeCloseTo(NEIGUNG_LINIE_M, 0)
  })
  test('Übernahme nimmt nur Gewähltes mit', () => {
    const x = v(), p = anfangsPaar(x)
    const n = { [x.arme[0].key]: { prozent: 2.4, klasse: '+2%' as const, modell: 'swissALTI3D', hinweis: null } }
    const voll = uebernahmeAus(x, p, n)!
    expect(voll.arme.some(a => a.neigung === '+2%')).toBe(true)
    expect(voll.arme.some(a => a.fgs)).toBe(true)
    const nichts = uebernahmeAus(x, p, n, { neigung: false, fgs: false, streifen: false, tempo: false, schwerverkehr: null, abbieger: null })!
    expect(nichts.arme.every(a => !a.neigung && !a.fgs && !a.streifen && !a.tempo)).toBe(true)
    expect(nichts.belegt).toEqual([])
  })
  test('Eingaben: Neigung, Abbiegestreifen, ohne Angabe bleibt das Feld leer', () => {
    const x = v(), p = anfangsPaar(x)
    const ost = arm(x, 'Hauptweg', 90)
    const u = uebernahmeAus(x, p, { [ost.key]: { prozent: -3.2, klasse: '-4%', modell: 'swissALTI3D', hinweis: null } })!
    const c = intersectionAus(u)
    const i = u.arme.findIndex(a => a.himmel === ost.himmel)
    expect(c.arms[i].gradient).toBe('-4%')
    expect(c.arms[i].hasLeftTurnLane).toBe(true)
    expect(c.arms[1 - i].hasLeftTurnLane).toBe(false)
    expect(c.arms[1 - i].gradient).toBeNull()
  })
  test('jeder Rechner nennt nur, was er nutzt', () => {
    const x = v(), p = anfangsPaar(x)
    const u = uebernahmeAus(x, p, { [x.arme[0].key]: { prozent: 2, klasse: '+2%', modell: 'swissALTI3D', hinweis: null } })!
    expect(belegtFuer(u, 'vss308').join(' ')).toContain('Fussgängerstreifen')
    expect(belegtFuer(u, 'vss308').join(' ')).not.toContain('Neigung')
    expect(belegtFuer(u, 'sn022').join(' ')).toContain('Neigung')
    expect(belegtFuer(u, 'sn022').join(' ')).not.toContain('Fussgängerstreifen')
  })
  test('Speicherdatei: Bezug schreiben und lesen, ältere Dateien ohne Bezug', () => {
    const u = uebernahmeAus(v(), anfangsPaar(v()))!
    const k = kartenBezugAus(u, 'lsa')
    expect(kartenBezugLesen(JSON.parse(JSON.stringify(k)))).toEqual(k)
    expect(kartenBezugLesen(undefined)).toBeNull()
    expect(kartenBezugLesen({ osmKnoten: 'x' })).toBeNull()
  })
})

describe('Getrennte Richtungsfahrbahnen', () => {
  // Hauptstrasse Ost–West mit zwei Richtungsfahrbahnen 12 m auseinander, Nebenstrasse von Süden über beide bis zum Norden
  const N = 12
  const ll = (x: number, y: number) => ({ lat: LAT0 + y * M_LAT, lon: LON0 + x * M_LON })
  const roh = () => ({ elements: [
    { type: 'way', id: 1, nodes: [11, 1, 2, 12], geometry: [ll(-120, N / 2), ll(0, N / 2), ll(0.1, N / 2), ll(120, N / 2)].slice(0, 2).concat([ll(4, N / 2), ll(120, N / 2)]),
      tags: { highway: 'primary', name: 'Hauptweg', oneway: 'yes' } },
    { type: 'way', id: 2, nodes: [13, 3, 4, 14], geometry: [ll(120, -N / 2), ll(4, -N / 2), ll(0, -N / 2), ll(-120, -N / 2)], tags: { highway: 'primary', name: 'Hauptweg', oneway: 'yes' } },
    { type: 'way', id: 3, nodes: [15, 4], geometry: [ll(0, -120), ll(0, -N / 2)], tags: { highway: 'secondary', name: 'Querweg' } },
    { type: 'way', id: 4, nodes: [4, 1], geometry: [ll(0, -N / 2), ll(0, N / 2)], tags: { highway: 'secondary', name: 'Querweg' } },
    { type: 'way', id: 5, nodes: [1, 16], geometry: [ll(0, N / 2), ll(0, 120)], tags: { highway: 'secondary', name: 'Querweg' } },
  ] })

  test('einzeln: Hinweis und Angebot zum Zusammenfassen', () => {
    const v = vorschlag(roh(), 1)
    expect(v.nachbarn).toBe(1)
    expect(v.hinweise.join(' ')).toContain('Richtungsfahrbahnen')
  })
  test('zusammengefasst: vier Arme, Richtungsfahrbahnen als ein Arm', () => {
    const v = knotenVorschlag(roh(), 1, { zusammenfassen: true })!
    expect(v.zusammengefasst).toBe(2)
    expect(v.arme).toHaveLength(4)
    expect(v.arme.filter(a => a.name === 'Hauptweg')).toHaveLength(2)
    expect(v.arme.every(a => !a.einbahn)).toBe(true)
    expect(v.meldung).toBeNull()
  })
  test('zusammengefasst: Hauptstrasse gegenüber, B rechts von A', () => {
    const v = knotenVorschlag(roh(), 1, { zusammenfassen: true })!
    const [a, c, b] = armeOrdnen(v, anfangsPaar(v)!)
    expect([a.name, c.name]).toEqual(['Hauptweg', 'Hauptweg'])
    expect(rechtsVon(a, b)).toBe(true)
  })
})

describe('Armlinie über kurze Wegstücke', () => {
  test('läuft am Wegende auf dem Weg gleichen Namens weiter', () => {
    const roh = knotenRoh([{ az: 270, name: 'West' }, { az: 180, name: 'Süd' }], [
      { type: 'way', id: 30, nodes: [MITTE, 31], geometry: [punkt(0, 0), punkt(90, 10)], tags: { highway: 'secondary', name: 'Ost' } },
      { type: 'way', id: 31, nodes: [31, 32], geometry: [punkt(90, 10), punkt(90, 120)], tags: { highway: 'secondary', name: 'Ost' } },
    ])
    const a = vorschlag(roh).arme.find(x => x.name === 'Ost')!
    expect(Math.hypot(a.profil[0][0] - a.profil[a.profil.length - 1][0], a.profil[0][1] - a.profil[a.profil.length - 1][1])).toBeCloseTo(NEIGUNG_LINIE_M, 0)
  })
})

describe('Arme von Hand', () => {
  test('fünf Arme: einen abwählen gibt eine Übernahme', () => {
    const roh = knotenRoh([0, 72, 144, 216, 288].map((az, i) => ({ az, name: `S${i}` })))
    const alle = vorschlag(roh)
    const v = knotenVorschlag(roh, MITTE, { ohne: [alle.arme[0].key] })!
    expect(v.arme).toHaveLength(4)
    expect(v.meldung).toBeNull()
    expect(uebernahmeAus(v, anfangsPaar(v))!.armCount).toBe(4)
  })
  test('abgewählter Arm der Hauptstrasse: Hauptstrasse neu angenommen', () => {
    const roh = knotenRoh([haupt('Hauptweg', 90), haupt('Hauptweg', 270), { az: 180, name: 'Süd' }, { az: 0, name: 'Nord' }], [
      { type: 'node', id: 500, ...punkt(180, 8), tags: { highway: 'stop' } }])
    const alle = vorschlag(roh)
    const weg = alle.arme.find(a => a.name === 'Hauptweg')!.key
    const v = knotenVorschlag(roh, MITTE, { ohne: [weg] })!
    expect(v.haupt).toBeNull()
    expect(v.hauptSicher).toBe(false)
    expect(anfangsPaar(v)).not.toBeNull()
  })
})

describe('Querschnitte aus den Strömen', () => {
  const leer = { left: 0, straight: 0, right: 0 }
  test('Kreuzung: A rechts fährt nach B, A links nach D, A gerade nach C', () => {
    const q = querschnitteKnoten([{ left: 10, straight: 20, right: 30 }, leer, leer, leer])
    expect(q.map(x => x.zu)).toEqual([60, 0, 0, 0])
    expect(q.map(x => x.weg)).toEqual([0, 20, 30, 10])
  })
  test('B rechts nach C, D rechts nach A, C rechts nach D', () => {
    const q = querschnitteKnoten([leer, { left: 0, straight: 0, right: 5 }, { left: 0, straight: 0, right: 7 }, { left: 0, straight: 0, right: 9 }])
    expect(q.map(x => x.weg)).toEqual([9, 7, 0, 5])
  })
  test('Einmündung: Ströme zum fehlenden Arm D zählen nicht', () => {
    const q = querschnitteKnoten([{ left: 99, straight: 400, right: 100 }, { left: 50, straight: 300, right: 99 }, { left: 80, straight: 99, right: 60 }])
    expect(q.map(x => x.zu)).toEqual([500, 350, 140])
    expect(q.map(x => x.weg)).toEqual([380, 460, 150])
    expect(q[0].summe).toBe(880)
  })
  test('Kreisel: rechts zum nächsten Arm, links zum vorherigen', () => {
    const q = querschnitteKreisel([{ left: 10, straight: 20, right: 30 }, leer, leer, leer])
    expect(q.map(x => x.weg)).toEqual([0, 30, 20, 10])
  })
  test('Kreisel mit drei Armen: geradeaus zählt nicht', () => {
    const q = querschnitteKreisel([{ left: 10, straight: 99, right: 30 }, leer, leer])
    expect(q.map(x => x.weg)).toEqual([0, 30, 10])
  })
})

describe('Abweichung von den Modellspitzen', () => {
  const m = { msp: 400, asp: 600 }
  test('im Rahmen: kein Hinweis', () => { expect(abweichung(500, m)).toBeNull(); expect(abweichung(900, m)).toBeNull(); expect(abweichung(200, m)).toBeNull() })
  test('deutlich darüber', () => expect(abweichung(901, m)).toBe('hoch'))
  test('deutlich darunter', () => expect(abweichung(199, m)).toBe('tief'))
  test('ohne Eingabe oder Modell nichts', () => { expect(abweichung(0, m)).toBeNull(); expect(abweichung(500, { msp: null, asp: 600 })).toBeNull() })
})

describe('Zuordnung der Modellstrecken', () => {
  const strecke = (nr: number, dtv: number, teile: [number, number][][]): ModellStrecke => ({ nr, dtv, msp: dtv / 10, asp: dtv / 10, svMorgen: null, svAbend: null, teile })
  const arm: [number, number][] = [[0, 0], [50, 0]]
  test('nächste Strecke in Armrichtung', () => {
    expect(modellZuordnen([strecke(1, 8000, [[[-10, 3], [80, 3]]])], arm).strecke?.dtv).toBe(8000)
  })
  test('quer zum Arm passt nicht', () => {
    const r = modellZuordnen([strecke(1, 8000, [[[30, -40], [30, 40]]])], arm)
    expect(r.strecke).toBeNull()
    expect(r.hinweis).toContain('Keine passende')
  })
  test('zu weit weg passt nicht', () => expect(modellZuordnen([strecke(1, 8000, [[[0, 20], [80, 20]]])], arm).strecke).toBeNull())
  test('gegenläufige Strecke passt ebenfalls', () => expect(modellZuordnen([strecke(1, 8000, [[[80, 3], [-10, 3]]])], arm).strecke?.dtv).toBe(8000))
  test('zwei gleich nahe mit anderen Werten: offen, nichts addiert', () => {
    const r = modellZuordnen([strecke(1, 8000, [[[0, 3], [80, 3]]]), strecke(2, 3000, [[[0, -4], [80, -4]]])], arm)
    expect(r.strecke).toBeNull()
    expect(r.hinweis).toContain('Mehrere')
  })
  test('Teilstücke derselben Strecke sind kein Widerspruch', () => {
    expect(modellZuordnen([strecke(1, 8000, [[[0, 3], [80, 3]]]), strecke(1, 8000, [[[0, 3.5], [80, 3.5]]])], arm).strecke?.dtv).toBe(8000)
  })
  test('deutlich weitere zweite Strecke stört nicht', () => {
    expect(modellZuordnen([strecke(1, 8000, [[[0, 1], [80, 1]]]), strecke(2, 3000, [[[0, 10], [80, 10]]])], arm).strecke?.dtv).toBe(8000)
  })
  test('Antwort von identify lesen, unvollständige Strecken fallen weg', () => {
    const g = { type: 'LineString', coordinates: [[0, 0], [1, 1]] }
    const roh = { results: [
      { geometry: g, properties: { nr: 7, dtv_fzg: 100, msp_fzg: 10, asp_fzg: 12, msp_lw: 1, msp_lz: 0, asp_lw: 3, asp_lz: 1 } },
      { geometry: g, properties: { nr: 8, dtv_fzg: 100 } },
    ] }
    expect(npvmLesen(roh)).toEqual([{ nr: 7, dtv: 100, msp: 10, asp: 12, svMorgen: { lw: 10, lz: 0 }, svAbend: { lw: 25, lz: 8.3 }, teile: [[[0, 0], [1, 1]]] }])
  })
  test('Stadt Bern: DTV = 16 · Nt + 8 · Nn, Abschnitt am Arm', () => {
    const l = bernLesen({ features: [{ geometry: { type: 'LineString', coordinates: [[0, 2, 0], [80, 2, 0]] }, properties: { Nt: 500, Nn: 100 } }] })
    expect(l[0].dtv).toBe(8800)
    expect(lokalLinieZuordnen(l, arm)?.dtv).toBe(8800)
    expect(lokalLinieZuordnen(l, [[0, 40], [50, 40]])).toBeNull()
  })
})

describe('Schwerverkehr und Vergleich in der Übernahme', () => {
  const b = (x: Partial<ArmBelastung>): ArmBelastung => ({ dtv: 8000, msp: 800, asp: 900, svMorgen: { lw: 3, lz: 1 }, svAbend: { lw: 2, lz: 0 }, modellHinweis: null, lokalDtv: null, lokalQuelle: null, ...x })
  const v = () => vorschlag(knotenRoh([haupt('Hauptweg', 90), haupt('Hauptweg', 270), { az: 180, name: 'Nebenweg' }]))
  test('Vorgabe: Schwerverkehr wirkt nicht, Vergleich kommt mit', () => {
    const x = v(), bel = Object.fromEntries(x.arme.map(a => [a.key, b({})]))
    const u = uebernahmeAus(x, anfangsPaar(x), {}, ALLES, bel)!
    expect(u.arme.every(a => !a.schwerverkehr)).toBe(true)
    expect(u.vergleich.map(z => z.msp)).toEqual([800, 800, 800])
    expect(intersectionAus(u).arms.every(a => a.vehicleMix === undefined)).toBe(true)
  })
  test('gewählt: Fall 2 mit den Modellanteilen', () => {
    const x = v(), bel = Object.fromEntries(x.arme.map(a => [a.key, b({})]))
    const u = uebernahmeAus(x, anfangsPaar(x), {}, { ...ALLES, schwerverkehr: 'morgen' }, bel)!
    expect(intersectionAus(u).arms[0].vehicleMix).toEqual({ pctLW: 3, pctLZ: 1, pctMR: 0, pctFR: 0 })
    expect(intersectionAus(u).arms[0].fall).toBe(2)
    expect(belegtFuer(u, 'sn022').join(' ')).toContain('Morgenspitze 7–8 Uhr, nicht gezählt')
    expect(belegtFuer(u, 'vss308').join(' ')).not.toContain('Schwerverkehr')
  })
  test('die gewählte Spitze zählt, fehlt ihr Wert, bleibt der Arm leer', () => {
    const x = v(), bel = Object.fromEntries(x.arme.map(a => [a.key, b({})]))
    const abend = uebernahmeAus(x, anfangsPaar(x), {}, { ...ALLES, schwerverkehr: 'abend' }, bel)!
    expect(intersectionAus(abend).arms[0].vehicleMix).toEqual({ pctLW: 2, pctLZ: 0, pctMR: 0, pctFR: 0 })
    const ohne = Object.fromEntries(x.arme.map(a => [a.key, b({ svAbend: null })]))
    const leer = uebernahmeAus(x, anfangsPaar(x), {}, { ...ALLES, schwerverkehr: 'abend' }, ohne)!
    expect(intersectionAus(leer).arms[0].vehicleMix).toBeUndefined()
    expect(intersectionAus(leer).arms[0].fall).toBeNull()
  })
  test('Modell-Abbieger wirken nur, wenn die Spitze gewählt ist', () => {
    const x = v(), p = anfangsPaar(x)!, [a, c, b] = armeOrdnen(x, p)
    const stand = { spitze: 'morgen' as const, matrix: { [a.key]: { [c.key]: 200, [b.key]: 30 }, [c.key]: { [a.key]: 180, [b.key]: 20 }, [b.key]: { [a.key]: 15, [c.key]: 25 } }, sv: {}, offen: [] }
    expect(intersectionAus(uebernahmeAus(x, p, {}, ALLES, {}, 'x', stand)!).arms[0].straightVolume).toBe(0)
    expect(intersectionAus(uebernahmeAus(x, p, {}, { ...ALLES, abbieger: 'abend' }, {}, 'x', stand)!).arms[0].straightVolume).toBe(0)
    const u = uebernahmeAus(x, p, {}, { ...ALLES, abbieger: 'morgen' }, {}, 'x', stand)!
    const [ka, kc, kb] = intersectionAus(u).arms
    expect([ka.leftVolume, ka.straightVolume, ka.rightVolume]).toEqual([0, 200, 30])
    expect([kc.leftVolume, kc.straightVolume, kc.rightVolume]).toEqual([20, 180, 0])
    expect([kb.leftVolume, kb.straightVolume, kb.rightVolume]).toEqual([15, 0, 25])
    expect(belegtFuer(u, 'vss308').join(' ')).toContain('nicht gezählt')
  })
  test('Herkunft des Tempos: amtlich vor OSM, ein gewählter Wert gehört zu seiner Quelle', () => {
    const amtlich = { tempo: 30, quelle: 'Stadt Bern' }
    expect(tempoQuelle(undefined, amtlich, 50)).toBe('Stadt Bern')
    expect(tempoQuelle(undefined, undefined, 50)).toBe('OSM')
    expect(tempoQuelle(50, amtlich, 50)).toBe('OSM')
    expect(tempoQuelle(30, amtlich, 50)).toBe('Stadt Bern')
    expect(tempoQuelle(40, amtlich, 50)).toBe('von Hand')
  })
  test('Tempo von Hand ersetzt den OSM-Wert und nennt die Herkunft', () => {
    const x = vorschlag(knotenRoh([haupt('Hauptweg', 90), haupt('Hauptweg', 270), { az: 180, name: 'Nebenweg', tags: { maxspeed: '30' } }]))
    const p = anfangsPaar(x)!, neben = armeOrdnen(x, p)[2], a = armeOrdnen(x, p)[0]
    const u = uebernahmeAus(x, p, {}, ALLES, {}, 'x', null, { [a.key]: 50 })!
    expect(u.arme[0]).toMatchObject({ tempo: 50, tempoQuelle: 'von Hand' })
    expect(u.arme[2].tempo).toBe(30)
    expect(u.arme[2].tempoQuelle).not.toBe('von Hand')
    expect(u.belegt.find(b => b.art === 'tempo')!.text).toBe('Tempo: A 50 km/h (von Hand), B 30 km/h (OSM).')
    expect(neben.tempo).toBe(30)
    expect(uebernahmeAus(x, p, {}, { ...ALLES, tempo: false }, {}, 'x', null, { [a.key]: 50 })!.arme[0].tempo).toBeUndefined()
  })
  test('Schwerverkehr aus den Abbiegern nur bei gleicher Spitze, Form { lw, lz } bleibt', () => {
    const x = v(), p = anfangsPaar(x)!, [a0] = armeOrdnen(x, p)
    const bel = Object.fromEntries(x.arme.map(q => [q.key, b({})]))
    const stand = { spitze: 'morgen' as const, matrix: {}, sv: { [a0.key]: { lw: 6.5, lz: 1.2 } }, offen: [] }
    const gleich = uebernahmeAus(x, p, {}, { ...ALLES, abbieger: 'morgen', schwerverkehr: 'morgen' }, bel, 'x', stand)!
    expect(gleich.arme[0].schwerverkehr).toEqual({ lw: 6.5, lz: 1.2 })
    expect(gleich.arme[1].schwerverkehr).toBeUndefined()
    expect(intersectionAus(gleich).arms[0]).toMatchObject({ fall: 2, vehicleMix: { pctLW: 6.5, pctLZ: 1.2, pctMR: 0, pctFR: 0 } })
    expect(belegtFuer(gleich, 'sn022').join(' ')).toContain('Schwerverkehrsanteil der Zufahrt aus den Modell-Abbiegern NPVM, Morgenspitze 7–8 Uhr, nicht gezählt')
    const anders = uebernahmeAus(x, p, {}, { ...ALLES, abbieger: 'morgen', schwerverkehr: 'abend' }, bel, 'x', stand)!
    expect(anders.arme[0].schwerverkehr).toEqual({ lw: 2, lz: 0 })
    expect(belegtFuer(anders, 'sn022').join(' ')).toContain('Schwerverkehrsanteil aus dem Modell NPVM, Abendspitze')
  })
  test('Arm ohne Modellwert wird genannt', () => {
    const x = v(), p = anfangsPaar(x)!, b0 = armeOrdnen(x, p)[2]
    const u = uebernahmeAus(x, p, {}, { ...ALLES, abbieger: 'abend' }, {}, 'x', { spitze: 'abend', matrix: {}, sv: {}, offen: [b0.key] })!
    expect(u.hinweise.join(' ')).toContain('Arm B: kein passender Modellwert')
  })
  test('Speicherdatei behält den Vergleich', () => {
    const x = v(), bel = Object.fromEntries(x.arme.map(a => [a.key, b({ lokalDtv: 7000, lokalQuelle: 'Stadt Bern' })]))
    const k = kartenBezugAus(uebernahmeAus(x, anfangsPaar(x), {}, ALLES, bel)!, 'sn022')
    expect(kartenBezugLesen(JSON.parse(JSON.stringify(k)))!.vergleich[0]).toMatchObject({ msp: 800, lokalDtv: 7000, lokalQuelle: 'Stadt Bern' })
  })
})

describe('lokalTitel', () => {
  const arm = (lokalQuelle: string | null) => ({ label: 'A', name: '', dtv: null, msp: null, asp: null, lokalDtv: null, lokalQuelle })
  test('nennt den Anbieter, wenn alle Arme dieselbe Quelle haben', () => {
    expect(lokalTitel([arm('Stadt Bern, flächendeckende Verkehrsdaten'), arm(null), arm('Stadt Bern, flächendeckende Verkehrsdaten')])).toBe('Stadt Bern')
  })
  test('bleibt allgemein bei mehreren oder keiner Quelle', () => {
    expect(lokalTitel([arm('Stadt Bern, a'), arm('Kanton Zürich, b')])).toBe('Lokale Daten')
    expect(lokalTitel([arm(null)])).toBe('Lokale Daten')
  })
})
