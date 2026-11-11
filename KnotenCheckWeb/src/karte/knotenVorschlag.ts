// Aus den OSM-Daten um einen Knoten entsteht ein Vorschlag: Form, Arme, Namen, Haupt- und Nebenstrasse, dazu je Arm Fussgängerstreifen,
// Fahrstreifen und Tempo. Alles bleibt Vorschlag; die Person bestätigt es auf der Karte und im Rechner. Die Erkennung selbst stammt aus
// dem SichtweitenCheck (src/knotenkern/).

import { istFgs, markierung, osmParsen, type OsmDaten } from '../knotenkern/daten/osm'
import { abstandStrecke, add, dist, einheit, lv95, sub, wdiff, wgs, type P } from '../knotenkern/geo'
import {
  ampelPunkte, armInfo, GABELUNG_TEXT, fahrbahnteilungText, himmelsrichtung, HW_RANG, istLsaKnoten, knotenArt, knotenFinden, knotenInfo,
  signalArm, strassenArme, vortrittPaar, vortrittsSignale, ZUSAMMENFUEHRUNG_TEXT,
} from '../knotenkern/rechner/knoten'
import { OsmNetz, type Arm } from '../knotenkern/rechner/netz'
import type { ArmInfo } from '../knotenkern/rechner/typen'
import { armStreifen } from './fahrstreifen'
import { NEIGUNG_LINIE_M } from './neigung'
import type { ArmStreifen, RechnerKey } from './rechner'

/** Länge der Armlinie auf der Karte */
const ARM_LINIE_M = 40
/** Annahme wie im SichtweitenCheck: Fussgängerstreifen bis zu diesem Abstand gehören zum Knoten */
export const FGS_ABSTAND_M = 40
/** Annahme: So nah an der Armlinie gehört ein Fussgängerstreifen zu diesem Arm */
const FGS_ARM_M = 6
/** Annahme: Liegt ein weiterer Knoten so nah, kann es derselbe Knoten mit getrennten Richtungsfahrbahnen sein */
export const NACHBAR_M = 35
/** Annahme: Richtung eines zusammengefassten Arms in diesem Abstand ab dem Knoten; Ein- und Ausfahrt derselben Strasse liegen höchstens so weit auseinander */
const GRUPPE_ARM_M = 30
const GRUPPE_ARM_GRAD = 60
/** Annahme: So weit darf der Anschlussweg am Wegende von der Richtung abweichen */
const WEITER_GRAD = 45
const QUARTIER = new Set(['residential', 'living_street', 'unclassified'])

export type KnotenForm = 'knoten' | 'lsa' | 'kreisel'

export interface KartenArm {
  key: string
  name: string                 // Strassenname, leer ohne Namen in OSM
  klasse: string               // OSM highway
  himmel: string               // Himmelsrichtung vom Knoten weg
  richtung: P                  // Einheitsvektor vom Knoten weg (x Ost, y Nord)
  zufahrt: boolean             // Verkehr fährt auf diesem Arm zum Knoten
  einbahn: boolean
  stichM: number | null        // Stichstück: endet nach so vielen Metern
  signal: 'stop' | 'give_way' | null
  linie: [number, number][]    // WGS84 [lat, lon], für die Karte
  profil: P[]                  // LV95 vom Knoten weg, für die Längsneigung
  fgs: { anzahl: number; insel: boolean } | null
  streifen: ArmStreifen | null // zum Knoten hin
  tempo: number | null         // OSM maxspeed bzw. Zone [km/h]
}

export interface KnotenVorschlag {
  id: number
  lat: number
  lon: number
  name: string
  form: KnotenForm
  arme: KartenArm[]
  haupt: [string, string] | null   // Hauptstrasse nach OSM bzw. Annahme
  hauptGrund: string
  hauptSicher: boolean             // Signal oder priority_road belegen sie; sonst Annahme
  fgs: number                      // Fussgängerstreifen in OSM bis FGS_ABSTAND_M vom Knoten
  nachbarn: number                 // weitere OSM-Knoten, die zum selben Knoten gehören können
  zusammengefasst: number          // so viele OSM-Knoten bilden diesen Knoten; 1 ohne Zusammenfassung
  ringStreifen: number | null      // Kreisel: Fahrstreifen auf dem Ring nach OSM
  hinweise: string[]
  meldung: string | null           // statt einer Übernahme: dieser Punkt ist kein Knoten für die Rechner
}

export interface VorschlagWahl { zusammenfassen?: boolean; ohne?: readonly string[] }

export const armName = (a: Pick<KartenArm, 'name' | 'himmel'>): string => a.name || `Arm ${a.himmel}`

/** Linie eines Arms über L Meter ab dem Knoten. Am Knoten sind OSM-Wege oft nur wenige Meter lang: Am Wegende läuft sie auf dem Weg mit
 *  gleichem Namen weiter, sonst auf dem geradesten bis 45° Abweichung */
export function armStrecke(netz: OsmNetz, a: Arm, L: number): P[] {
  let [wid, i, sd] = a
  const besucht = new Set([wid])
  const aus: P[] = [netz.p(netz.w(wid).nds[i])]
  let s = 0
  for (;;) {
    const nds = netz.w(wid).nds, j = i + sd, p = aus[aus.length - 1]
    if (j < 0 || j >= nds.length) {
      const fahrt = aus.length > 1 ? einheit(sub(p, aus[aus.length - 2])) : netz.armRichtung(a)
      const weiter = strassenArme(netz, nds[i]).filter(x => !besucht.has(x[0]) && wdiff(netz.armRichtung(x), fahrt) <= WEITER_GRAD)
        .sort((x, y) => wdiff(netz.armRichtung(x), fahrt) - wdiff(netz.armRichtung(y), fahrt))
      const name = netz.w(wid).t.name
      const w = weiter.find(x => name && netz.w(x[0]).t.name === name) ?? weiter[0]
      if (!w) return aus
      ;[wid, i, sd] = w
      besucht.add(wid)
      continue
    }
    const q = netz.p(nds[j]), d = dist(p, q)
    if (s + d >= L) { aus.push(add(p, einheit(sub(q, p)), L - s)); return aus }
    aus.push(q); s += d; i = j
  }
}

const armLinie = (netz: OsmNetz, a: Arm): [number, number][] =>
  armStrecke(netz, a, ARM_LINIE_M).map(p => { const [lat, lon] = wgs(p[0], p[1]); return [lat, lon] })

/** Fahrstreifen zum Knoten hin: Der Arm läuft vom Knoten weg, der Verkehr ihm entgegen */
const armFahrstreifen = (netz: OsmNetz, a: Arm) => armStreifen(netz.w(a[0]).t, a[2] < 0)

/** Tempo eines Wegs: maxspeed, sonst Zone (zone:maxspeed, maxspeed:type wie CH:30) */
function armTempo(netz: OsmNetz, a: Arm): number | null {
  const v = netz.maxspeed(a[0])
  if (v !== null) return v
  const t = netz.w(a[0]).t
  const m = /CH:(\d+)/.exec(`${t['zone:maxspeed'] ?? ''} ${t['maxspeed:type'] ?? ''}`)
  return m ? parseInt(m[1], 10) : null
}

/** Fussgängerstreifen der Arme: jeder Streifen zählt beim nächsten Arm bis FGS_ARM_M neben dessen Linie */
function fgsJeArm(osm: OsmDaten, netz: OsmNetz, arme: { key: string; arme: Arm[] }[]): Map<string, { anzahl: number; insel: boolean }> {
  const aus = new Map<string, { anzahl: number; insel: boolean }>()
  const linien = arme.flatMap(x => x.arme.map(a => ({ key: x.key, linie: armStrecke(netz, a, FGS_ABSTAND_M) })))
  for (const k of osm.uebergaenge) {
    if (!istFgs(markierung(k.tags))) continue
    const p = lv95(k.lat, k.lon)
    let best: string | null = null, bestM = FGS_ARM_M
    for (const { key, linie } of linien) for (let i = 0; i < linie.length - 1; i++) {
      const d = abstandStrecke(p, linie[i], linie[i + 1])
      if (d <= bestM) { bestM = d; best = key }
    }
    if (best === null) continue
    const alt = aus.get(best) ?? { anzahl: 0, insel: false }
    aus.set(best, { anzahl: alt.anzahl + 1, insel: alt.insel || k.tags['crossing:island'] === 'yes' || k.tags.traffic_calming === 'island' })
  }
  return aus
}

const fgsAmKnoten = (osm: OsmDaten, p: P): number =>
  osm.uebergaenge.filter(k => istFgs(markierung(k.tags)) && dist(lv95(k.lat, k.lon), p) <= FGS_ABSTAND_M).length

interface RohArm { a: Arm; info: ArmInfo; r: P }

/** Arme mehrerer OSM-Punkte zusammenfassen: Einfahrt und Ausfahrt derselben Strasse gehören zusammen (Kreisel, Richtungsfahrbahnen) */
function zusammenfassen(roh: RohArm[]): RohArm[][] {
  const passen = (x: RohArm, y: RohArm) => wdiff(x.r, y.r) <= GRUPPE_ARM_GRAD && (x.info.name && y.info.name ? x.info.name === y.info.name :
    x.info.einbahn !== 0 && y.info.einbahn !== 0 && x.info.zufluss !== y.info.zufluss)
  const gruppen: RohArm[][] = []
  for (const x of roh) {
    const g = gruppen.find(k => k.every(y => passen(x, y)))
    if (g) g.push(x); else gruppen.push([x])
  }
  return gruppen
}

function kartenArm(netz: OsmNetz, g: RohArm[], fgs: Map<string, { anzahl: number; insel: boolean }>): KartenArm {
  const richtung = einheit(g.reduce<P>((s, y) => add(s, y.r), [0, 0]))
  const haupt = g.find(y => y.info.zufluss) ?? g[0]
  return {
    key: haupt.info.key, name: g.map(y => y.info.name).find(n => n) ?? '',
    klasse: g.map(y => y.info.hw).sort((a, b) => (HW_RANG[a] ?? 9) - (HW_RANG[b] ?? 9))[0],
    himmel: himmelsrichtung(richtung), richtung, zufahrt: g.some(y => y.info.zufluss),
    einbahn: g.length === 1 && g[0].info.einbahn !== 0, stichM: null, signal: null,
    linie: armLinie(netz, haupt.a), profil: armStrecke(netz, haupt.a, NEIGUNG_LINIE_M),
    fgs: fgs.get(haupt.info.key) ?? null, streifen: armFahrstreifen(netz, haupt.a), tempo: armTempo(netz, haupt.a),
  }
}

/** Punkte des Kreisels am Punkt n (alle zusammenhängenden Ringwege) und die Ringwege */
function ring(netz: OsmNetz, n: number): { punkte: number[]; wege: number[] } {
  const offen = (netz.an.get(n) ?? []).map(([w]) => w).filter(w => netz.w(w).ring)
  const wege = new Set(offen), punkte = new Set<number>()
  while (offen.length) {
    for (const m of netz.w(offen.pop()!).nds) {
      punkte.add(m)
      for (const [w] of netz.an.get(m) ?? []) if (!wege.has(w) && netz.w(w).ring) { wege.add(w); offen.push(w) }
    }
  }
  return { punkte: [...punkte], wege: [...wege] }
}

/** Läuft die Linie durch den Punkt p? */
const durch = (linie: P[], p: P) => linie.slice(0, -1).some((q, i) => abstandStrecke(p, q, linie[i + 1]) <= 1)

/** OSM-Knoten, die über kurze Wegstücke mit n verbunden sind (getrennte Richtungsfahrbahnen), n zuerst */
function knotenGruppe(netz: OsmNetz, n: number): number[] {
  const kandidaten = knotenFinden(netz)
  const gruppe = [n]
  for (let i = 0; i < gruppe.length; i++) {
    const m = gruppe[i], linien = strassenArme(netz, m).map(a => armStrecke(netz, a, NACHBAR_M + 5))
    for (const k of kandidaten) {
      if (gruppe.includes(k) || dist(netz.p(k), netz.p(m)) > NACHBAR_M) continue
      if (linien.some(l => durch(l, netz.p(k)))) gruppe.push(k)
    }
  }
  return gruppe
}

function armzahlMeldung(n: number): string | null {
  if (n > 4) return `${n} Arme erkannt: Die Rechner kennen drei oder vier Arme. Überzählige Arme abwählen.`
  if (n < 3) return `${n} Arme erkannt: Die Rechner brauchen mindestens drei Arme.`
  return null
}

/** Arme abwählen; die Hauptstrasse gilt nur, solange beide Arme bleiben */
function ohneArme(v: KnotenVorschlag, ohne: readonly string[]): KnotenVorschlag {
  if (!ohne.length) return v
  const arme = v.arme.filter(a => !ohne.includes(a.key))
  const haupt = v.haupt && v.haupt.every(k => !ohne.includes(k)) ? v.haupt : null
  return { ...v, arme, haupt, hauptSicher: !!haupt && v.hauptSicher, meldung: armzahlMeldung(arme.length) }
}

/** Vorschlag zum Knoten id aus der Overpass-Antwort; null, wenn der Punkt nicht in den Daten liegt */
export function knotenVorschlag(roh: unknown, id: number, wahl: VorschlagWahl = {}): KnotenVorschlag | null {
  const osm = osmParsen(roh as Parameters<typeof osmParsen>[0])
  const netz = new OsmNetz(osm)
  if (!netz.P.has(id)) return null
  const art = knotenArt(netz, id)
  const p0 = netz.p(id)
  const [lat0, lon0] = wgs(p0[0], p0[1])
  const leer = { id, lat: lat0, lon: lon0, name: `OSM-Knoten ${id}`, form: 'knoten' as KnotenForm, arme: [] as KartenArm[], haupt: null, hauptGrund: '',
    hauptSicher: false, fgs: 0, nachbarn: 0, zusammengefasst: 1, ringStreifen: null, hinweise: [] as string[] }

  if (art === 'kreisel') {
    const { punkte, wege } = ring(netz, id)
    const mitte: P = [punkte.reduce((s, n) => s + netz.p(n)[0], 0) / punkte.length, punkte.reduce((s, n) => s + netz.p(n)[1], 0) / punkte.length]
    const [lat, lon] = wgs(mitte[0], mitte[1])
    const rohArme = punkte.flatMap(n => strassenArme(netz, n).filter(a => !netz.w(a[0]).ring).map(a => ({
      a, info: armInfo(netz, a), r: einheit(sub(netz.armPunkt(a, GRUPPE_ARM_M), mitte)) })))
    const gruppen = zusammenfassen(rohArme)
    const fgs = fgsJeArm(osm, netz, gruppen.map(g => ({ key: (g.find(y => y.info.zufluss) ?? g[0]).info.key, arme: g.map(y => y.a) })))
    const arme = gruppen.map(g => kartenArm(netz, g, fgs))
    const namen = [...new Set(arme.map(a => a.name).filter(n => n))]
    const ringN = wege.map(w => parseInt(netz.w(w).t.lanes ?? '', 10)).filter(n => n >= 1)
    return ohneArme({ ...leer, lat, lon, form: 'kreisel', arme, name: namen.length ? namen.join(' / ') : leer.name, fgs: fgsAmKnoten(osm, mitte),
      ringStreifen: ringN.length ? Math.max(...ringN) : null, hinweise: ['Bypässe sind nicht erkannt: bitte im Rechner prüfen.'],
      meldung: armzahlMeldung(arme.length) }, wahl.ohne ?? [])
  }
  if (art === 'gabelung') return { ...leer, meldung: `${GABELUNG_TEXT}.` }
  if (art === 'fahrbahnteilung') return { ...leer, meldung: `${fahrbahnteilungText(netz, id)}.` }
  if (art === 'zusammenfuehrung') return { ...leer, meldung: `${ZUSAMMENFUEHRUNG_TEXT}.` }

  const ampeln = ampelPunkte(osm, lv95)
  const infoVon = (n: number) => knotenInfo(netz, n, vortrittsSignale(osm, netz.p(n), lv95), istLsaKnoten(netz, n, ampeln))
  const info = art === 'knoten' ? infoVon(id) : null
  if (!info) return { ...leer, meldung: 'Dieser Punkt hat weniger als drei Strassenarme: kein Knoten für die Rechner.' }

  const gruppe = knotenGruppe(netz, id)
  const nachbarn = gruppe.length - 1
  if (wahl.zusammenfassen && nachbarn > 0) return ohneArme(gruppenVorschlag(osm, netz, gruppe, infoVon), wahl.ohne ?? [])

  const fgs = fgsJeArm(osm, netz, info.arme.map(a => ({ key: a.key, arme: [[a.wid, a.i, a.sd] as Arm] })))
  const arme: KartenArm[] = info.arme.map(a => {
    const arm: Arm = [a.wid, a.i, a.sd]
    return {
      key: a.key, name: a.name, klasse: a.hw, himmel: a.himmel, richtung: a.richtung, zufahrt: a.zufluss, einbahn: a.einbahn !== 0,
      stichM: a.stichM ?? null, signal: info.signale.find(s => signalArm(netz, info.arme, s) === a)?.art ?? null,
      linie: armLinie(netz, arm), profil: armStrecke(netz, arm, NEIGUNG_LINIE_M), fgs: fgs.get(a.key) ?? null,
      streifen: armFahrstreifen(netz, arm), tempo: armTempo(netz, arm),
    }
  })
  const hinweise = nachbarn > 0 ? [`${nachbarn === 1 ? 'Ein weiterer OSM-Knoten' : `${nachbarn} weitere OSM-Knoten`} bis ${NACHBAR_M} m entfernt. Bei getrennten ` +
    'Richtungsfahrbahnen besteht ein Knoten in OSM aus mehreren Punkten; die Arme stimmen dann nicht mit den Zufahrten überein.'] : []
  return ohneArme({ ...leer, name: info.name, form: info.lsa ? 'lsa' : 'knoten', arme, haupt: info.vortritt, hauptGrund: info.vortrittGrund,
    hauptSicher: !!info.vortrittSicher, fgs: fgsAmKnoten(osm, p0), nachbarn, hinweise, meldung: armzahlMeldung(arme.length) }, wahl.ohne ?? [])
}

/** Mehrere OSM-Knoten als ein Knoten: Wegstücke zwischen ihnen fallen weg, die Richtungsfahrbahnen einer Strasse werden ein Arm */
function gruppenVorschlag(osm: OsmDaten, netz: OsmNetz, gruppe: number[], infoVon: (n: number) => ReturnType<typeof knotenInfo>): KnotenVorschlag {
  const mitte: P = [gruppe.reduce((s, n) => s + netz.p(n)[0], 0) / gruppe.length, gruppe.reduce((s, n) => s + netz.p(n)[1], 0) / gruppe.length]
  const [lat, lon] = wgs(mitte[0], mitte[1])
  const nachInnen = (n: number, a: Arm) => {
    const l = armStrecke(netz, a, NACHBAR_M + 5)
    return gruppe.some(k => k !== n && durch(l, netz.p(k)))
  }
  const rohArme = gruppe.flatMap(n => strassenArme(netz, n).filter(a => !nachInnen(n, a)).map(a => ({
    a, info: armInfo(netz, a), r: einheit(sub(netz.armPunkt(a, GRUPPE_ARM_M), mitte)) })))
  const gruppen = zusammenfassen(rohArme)
  const fgs = fgsJeArm(osm, netz, gruppen.map(g => ({ key: (g.find(y => y.info.zufluss) ?? g[0]).info.key, arme: g.map(y => y.a) })))

  // Signale der einzelnen Punkte auf die zusammengefassten Arme übertragen
  const infos = gruppe.map(infoVon).filter(i => i !== null)
  const signalVon = new Map<string, 'stop' | 'give_way'>()
  for (const i of infos) for (const s of i.signale) { const a = signalArm(netz, i.arme, s); if (a) signalVon.set(a.key, s.art) }
  const arme = gruppen.map(g => {
    const signal = g.map(y => signalVon.get(y.info.key)).find(s => s) ?? null
    return { ...kartenArm(netz, g, fgs), signal }
  })

  const alsInfo = (a: KartenArm): ArmInfo => ({ key: a.key, nr: '', wid: 0, i: 0, sd: 0, name: a.name, hw: a.klasse, richtung: a.richtung, himmel: a.himmel,
    zufluss: a.zufahrt, einbahn: a.einbahn ? 1 : 0, veloZufluss: false, veloZuflussQuelle: '' })
  const ohneSignal = arme.filter(a => !a.signal)
  const sicher = arme.length > ohneSignal.length && ohneSignal.length >= 2
  const paar = vortrittPaar((sicher ? ohneSignal : arme).map(alsInfo))
  const namen = [...new Set(arme.map(a => a.name).filter(n => n))]
  return { id: gruppe[0], lat, lon, name: namen.length ? namen.join(' / ') : `OSM-Knoten ${gruppe[0]}`, form: infos.some(i => i.lsa) ? 'lsa' : 'knoten', arme,
    haupt: paar ? [paar[0][0].key, paar[0][1].key] : null, hauptGrund: sicher ? 'Vortrittssignal an den übrigen Armen' : paar?.[1] ?? '', hauptSicher: sicher,
    fgs: fgsAmKnoten(osm, mitte), nachbarn: gruppe.length - 1, zusammengefasst: gruppe.length, ringStreifen: null,
    hinweise: [`Aus ${gruppe.length} OSM-Knoten zusammengefasst, Richtungsfahrbahnen einer Strasse als ein Arm (Annahme): bitte prüfen.`],
    meldung: armzahlMeldung(arme.length) }
}

export interface RechnerVorschlag { rechner: RechnerKey | null; grund: string }

/** Ohne Vortrittssignal in OSM und nur an Quartierstrassen (Annahme): vermutlich Rechtsvortritt. Gleichrangige Knoten rechnet KnotenCheck nicht */
export const vermutlichRechtsvortritt = (v: KnotenVorschlag): boolean =>
  v.form === 'knoten' && !v.hauptSicher && v.arme.every(a => QUARTIER.has(a.klasse))
export const RECHTSVORTRITT_TEXT = 'Kein Vortrittssignal in OSM und nur Quartierstrassen: vermutlich Rechtsvortritt (Annahme). ' +
  'Gleichrangige Knoten rechnet KnotenCheck nicht, die Rechner setzen eine Hauptstrasse voraus.'

/** Passender Rechner mit Begründung */
export function rechnerVorschlag(v: KnotenVorschlag): RechnerVorschlag {
  if (v.form === 'kreisel') return { rechner: 'sn024a', grund: 'Kreisel in OSM (junction=roundabout).' }
  // Der LSA-Rechner ist aus der Oberfläche genommen (11.11.2026); die Verfahren ohne Lichtsignal gelten hier nicht (SN 640 022, Ziffer 1, Seite 1)
  if (v.form === 'lsa') return { rechner: null, grund: 'Lichtsignal in OSM am Knoten oder auf einem Arm bis 30 m. Für Knoten mit Lichtsignalanlage gibt es zurzeit keinen Rechner; ' +
    'die Verfahren ohne Lichtsignal gelten dort nicht (SN 640 022, Ziffer 1, Seite 1).' }
  if (v.fgs > 0) return { rechner: 'vss308',
    grund: `${v.fgs === 1 ? 'Ein Fussgängerstreifen' : `${v.fgs} Fussgängerstreifen`} in OSM bis ${FGS_ABSTAND_M} m vom Knoten.` }
  return { rechner: 'sn022', grund: v.hauptSicher ? 'Vortritt in OSM belegt, kein Fussgängerstreifen in OSM am Knoten.' :
    'Kein Fussgängerstreifen in OSM am Knoten. Vortritt in OSM nicht belegt: bitte prüfen.' }
}

/** Rechner, die für diese Knotenform in Frage kommen, der Vorschlag zuerst */
export function moeglicheRechner(v: KnotenVorschlag): RechnerKey[] {
  if (v.form === 'kreisel') return ['sn024a']
  const erster = rechnerVorschlag(v).rechner
  if (erster === null) return []
  return [erster, ...(['sn022', 'vss308', 'simulation'] as RechnerKey[]).filter(r => r !== erster)]
}
