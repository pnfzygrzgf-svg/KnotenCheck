// Was die Rechner von der Karte kennen: Namen der Rechner und die Übernahme eines Knotens. Bewusst ohne Knotenerkennung, damit Startseite
// und Rechner ohne sie geladen werden (die Karte kommt erst beim Öffnen nach).

import { defaultIntersection, type GradientCategory, type IntersectionConfiguration } from '../engine/armConfiguration'
import type { RoundaboutType } from '../engine/roundaboutCalculator'
import type { MixedLaneCombination } from '../engine/types'
import { BERN_DTM_KURZ } from '../knotenkern/daten/bernDtm'
import type { ArmVergleich } from './vergleich'

export type RechnerKey = 'sn022' | 'sn024a' | 'vss308' | 'lsa' | 'simulation'
export const RECHNER_NAME: Record<RechnerKey, string> = {
  sn022: 'Einmündung & Kreuzung', sn024a: 'Kreisverkehr', vss308: 'Ungesteuerter Knoten mit Fussgänger*innen', lsa: 'LSA-Knoten', simulation: 'Simulation',
}

/** Fahrbeziehung einer Spur, wie die Rechner sie nennen */
export type Spur = 'left' | 'straight' | 'right'

/** Fahrstreifen eines Arms zum Knoten hin; spuren von links nach rechts, null ohne Angabe in OSM */
export interface ArmStreifen { anzahl: number; spuren: Spur[][] | null }

const nurEine = (s: ArmStreifen, x: Spur) => s.spuren!.some(l => l.length === 1 && l[0] === x)

/** Eigener Linksabbiegestreifen? null: OSM sagt es nicht (mehrere Fahrstreifen ohne Abbiegeangabe) */
export function eigenerLinks(s: ArmStreifen): boolean | null {
  if (s.spuren) return nurEine(s, 'left')
  return s.anzahl === 1 ? false : null
}
export function eigenerRechts(s: ArmStreifen): boolean | null {
  if (s.spuren) return nurEine(s, 'right')
  return s.anzahl === 1 ? false : null
}

/** Mischstreifen einer Nebenstrasse (Kreuzung); null, wenn OSM es nicht eindeutig sagt */
export function kombination(s: ArmStreifen): MixedLaneCombination | null {
  if (s.anzahl === 1) return 'all'
  if (!s.spuren) return null
  if (nurEine(s, 'left') && s.spuren.some(l => l.includes('straight') && l.includes('right'))) return 'throughAndRight'
  if (nurEine(s, 'right') && s.spuren.some(l => l.includes('straight') && l.includes('left'))) return 'leftAndThrough'
  return null
}

export interface UebernahmeArm {
  label: string
  name: string
  himmel: string
  neigung?: GradientCategory
  fgs?: { insel: boolean }
  streifen?: ArmStreifen
  tempo?: number
  tempoQuelle?: string     // amtlicher Dienst, OSM oder von Hand
  kreiselTyp?: RoundaboutType
  schwerverkehr?: { lw: number; lz: number }   // Anteile an der gewählten Spitzenstunde [%], modelliert
  stroeme?: { left: number; straight: number; right: number }   // Abbiegeströme der gewählten Spitzenstunde [Fz/h], modelliert
  /** Der Modellvorschlag hat für diesen Arm keine Ströme (kein Modellwert oder Widerspruch zur Einbahn in OSM): Der Rechner lässt den Arm offen,
   *  bis Ströme eingegeben sind oder «kein Verkehr» bestätigt ist */
  stroemeOffen?: true
  linie?: [number, number][]   // Armlinie WGS84 [lat, lon], für den Kartenausschnitt im Bericht
}

export type BelegtArt = 'neigung' | 'fgs' | 'streifen' | 'tempo' | 'schwerverkehr' | 'abbieger'
export interface Belegt { art: BelegtArt; text: string }
/** Was jeder Rechner aus der Vorbelegung nutzt */
const NUTZT: Record<RechnerKey, BelegtArt[]> = {
  sn022: ['neigung', 'streifen', 'schwerverkehr', 'abbieger'], sn024a: ['neigung', 'fgs', 'streifen', 'schwerverkehr', 'abbieger'], vss308: ['fgs', 'abbieger'],
  lsa: ['fgs', 'streifen', 'tempo', 'schwerverkehr', 'abbieger'], simulation: ['neigung', 'fgs', 'streifen', 'schwerverkehr', 'abbieger'],
}

export interface KnotenUebernahme {
  id: number
  lat: number
  lon: number
  name: string
  armCount: 3 | 4
  arme: UebernahmeArm[]   // Rechner-Reihenfolge
  belegt: Belegt[]        // was vorbelegt ist, mit Herkunft
  vergleich: ArmVergleich[]   // Modell- und Zählwerte, ohne Wirkung auf die Rechnung
  hinweise: string[]
  osmStand: string           // Datenstand der OSM-Antwort
  hoehenModelle: string[]    // Modelle der übernommenen Neigung
}

/** Zeile der Quellentabelle im Druckblatt */
export interface BerichtQuelle { quelle: string; fuer: string; anbieter: string; stand: string; lizenz: string; url?: string }

const HOEHEN_QUELLEN: Record<string, Omit<BerichtQuelle, 'fuer'>> = {
  swissALTI3D: { quelle: 'Höhenmodell swissALTI3D', anbieter: 'swisstopo', stand: 'unbekannt', lizenz: 'frei, Quellenangabe «© swisstopo»',
    url: 'https://www.swisstopo.admin.ch/de/hoehenmodell-swissalti3d' },
  [BERN_DTM_KURZ]: { quelle: BERN_DTM_KURZ, anbieter: 'Geodaten Stadt Bern', stand: 'Befliegung 2. Juni 2023', lizenz: 'Open Data Stadt Bern: freie Nutzung, Quellenangabe Pflicht',
    url: 'https://map.bern.ch/' },
}
const OSM_FUER: Partial<Record<BelegtArt, string>> = { streifen: 'Fahrstreifen', tempo: 'Tempo', fgs: 'Fussgängerstreifen' }

/** Nur was dieser Rechner aus der Vorbelegung nutzt */
export function quellenFuer(u: KnotenUebernahme, r: RechnerKey): BerichtQuelle[] {
  const arten = new Set(u.belegt.map(b => b.art).filter(a => NUTZT[r].includes(a)))
  const osm = ['Armzahl, Reihenfolge und Namen der Arme', ...[...arten].flatMap(a => OSM_FUER[a] ?? [])].join(', ')
  return [
    { quelle: 'OpenStreetMap (Overpass)', fuer: osm, anbieter: 'OpenStreetMap', stand: u.osmStand, lizenz: 'ODbL, © OpenStreetMap-Mitwirkende', url: 'https://www.openstreetmap.org/' },
    ...(arten.has('tempo') ? [...new Set(u.arme.flatMap(a => (a.tempoQuelle && !['OSM', 'von Hand'].includes(a.tempoQuelle) ? [a.tempoQuelle] : [])))].map(q => ({ quelle: `Tempo ${q}`, fuer: 'Tempo', anbieter: q, stand: 'unbekannt', lizenz: 'siehe Anbieter' })) : []),
    ...(arten.has('neigung') ? u.hoehenModelle.flatMap(m => (HOEHEN_QUELLEN[m] ? [{ ...HOEHEN_QUELLEN[m], fuer: 'Längsneigung' }] : [])) : []),
    ...(arten.has('schwerverkehr') ? [{ quelle: 'Nationales Personenverkehrsmodell (NPVM) und Aggregierte Methode Güterverkehr (AMG)', fuer: 'Schwerverkehrsanteil, modelliert',
      anbieter: 'ARE', stand: 'unbekannt', lizenz: 'freie Nutzung mit Quellenangabe © ARE', url: 'https://map.geo.admin.ch/?layers=ch.are.belastung-personenverkehr-strasse' }] : []),
    // Die Kacheln stammen aus den Visum-Versionen der Spitzenstunden (Zenodo, über die DOI verlinkt), nicht aus dem Kartendienst des Bundes
    ...(arten.has('abbieger') ? [{ quelle: 'Nationales Personenverkehrsmodell (NPVM) 2023, Abbieger aus den Visum-Dateien', fuer: 'Abbiegeströme, modelliert', anbieter: 'ARE', stand: '2023', lizenz: 'CC BY 4.0, Quellenangabe © ARE',
      url: 'https://doi.org/10.5281/zenodo.23009742' }] : []),
  ]
}

/** Eingaben von Einmündung & Kreuzung und Simulation: Vorbelegung übernommen, Ströme leer, ausser sie wurden aus dem Modell gewählt */
export function intersectionAus(u: KnotenUebernahme): IntersectionConfiguration {
  const leer = defaultIntersection(u.armCount)
  return { name: u.name, arms: leer.arms.map((a, i) => {
    const v = u.arme[i], haupt = i < 2, s = v.streifen
    const links = s ? eigenerLinks(s) : null, rechts = s ? eigenerRechts(s) : null, mix = s ? kombination(s) : null
    return {
      ...a, streetName: v.name, leftVolume: v.stroeme?.left ?? 0, straightVolume: v.stroeme?.straight ?? 0, rightVolume: v.stroeme?.right ?? 0,
      gradient: v.neigung ?? a.gradient,
      fall: v.schwerverkehr ? 2 as const : null,
      ...(v.schwerverkehr ? { vehicleMix: { pctLW: v.schwerverkehr.lw, pctLZ: v.schwerverkehr.lz, pctMR: 0, pctFR: 0 } } : {}),
      ...(haupt && rechts !== null ? { hasSeparateTurnLane: rechts } : {}),
      ...(haupt && links !== null ? { hasLeftTurnLane: links } : {}),
      ...(!haupt && mix ? { mixedLaneCombination: mix } : {}),
    }
  }) }
}

/** Texte zur Vorbelegung, die dieser Rechner tatsächlich nutzt */
export const belegtFuer = (u: KnotenUebernahme, r: RechnerKey): string[] => u.belegt.filter(b => NUTZT[r].includes(b.art)).map(b => b.text)

/** Tempo als Eingabe des LSA-Rechners (Staffelung der Zwischenzeit) */
export const lsaTempo = (kmh: number): 30 | 50 | 60 => (kmh <= 30 ? 30 : kmh <= 50 ? 50 : 60)

/** Übernommene Werte je Arm, wie sie in der Speicherdatei stehen: Daran erkennen Bildschirm und Druckblatt nach dem Laden, welche Eingaben noch
 *  aus Karte oder Modell stammen (ohne Armlinie, die steht in arme) */
export interface HerkunftStand { name: string; armCount: 3 | 4; arme: UebernahmeArm[] }

/** Bezug zur Karte in der Speicherdatei: Ort, OSM-Nummer und Herkunft der Vorbelegung */
export interface KartenBezug { osmKnoten: number; lat: number; lon: number; belegt: string[]; vergleich: ArmVergleich[]; quellen: BerichtQuelle[]
  arme?: { label: string; linie: [number, number][] }[]   // Armlinien für den Kartenausschnitt im Bericht
  herkunft?: HerkunftStand   // fehlt in Dateien vor Version 0.3.2: Die Herkunft der Werte ist dort nicht gespeichert
}

export const kartenBezugAus = (u: KnotenUebernahme, r: RechnerKey): KartenBezug =>
  ({ osmKnoten: u.id, lat: u.lat, lon: u.lon, belegt: belegtFuer(u, r), vergleich: u.vergleich, quellen: quellenFuer(u, r),
     arme: u.arme.flatMap(a => (a.linie?.length ? [{ label: a.label, linie: a.linie }] : [])),
     herkunft: { name: u.name, armCount: u.armCount, arme: u.arme.map(a => { const ohne = { ...a }; delete ohne.linie; return ohne }) } })

const GRADIENTS: readonly GradientCategory[] = ['+4%', '+2%', '±0%', '-2%', '-4%']
const KREISEL_TYPEN: readonly RoundaboutType[] = ['1/1', '2/1+', '2/2']
const SPUREN: readonly Spur[] = ['left', 'straight', 'right']
const istZahl = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/** Arm der Herkunft aus einer Datei: nur Felder mit gültigem Wert */
function herkunftArmLesen(x: unknown): UebernahmeArm | null {
  const a = x as Partial<UebernahmeArm> | null | undefined
  if (typeof a?.label !== 'string') return null
  const s = a.streifen, sv = a.schwerverkehr, q = a.stroeme
  const spuren = Array.isArray(s?.spuren) && s.spuren.every(l => Array.isArray(l) && l.every(r => SPUREN.includes(r))) ? s.spuren.map(l => [...l]) : null
  return {
    label: a.label, name: typeof a.name === 'string' ? a.name : '', himmel: typeof a.himmel === 'string' ? a.himmel : '',
    ...(GRADIENTS.includes(a.neigung as GradientCategory) ? { neigung: a.neigung } : {}),
    ...(typeof a.fgs?.insel === 'boolean' ? { fgs: { insel: a.fgs.insel } } : {}),
    ...(istZahl(s?.anzahl) ? { streifen: { anzahl: s.anzahl, spuren } } : {}),
    ...(istZahl(a.tempo) ? { tempo: a.tempo } : {}),
    ...(typeof a.tempoQuelle === 'string' ? { tempoQuelle: a.tempoQuelle } : {}),
    ...(KREISEL_TYPEN.includes(a.kreiselTyp as RoundaboutType) ? { kreiselTyp: a.kreiselTyp } : {}),
    ...(istZahl(sv?.lw) && istZahl(sv.lz) ? { schwerverkehr: { lw: sv.lw, lz: sv.lz } } : {}),
    ...(istZahl(q?.left) && istZahl(q.straight) && istZahl(q.right) ? { stroeme: { left: q.left, straight: q.straight, right: q.right } } : {}),
    ...(a.stroemeOffen === true ? { stroemeOffen: true as const } : {}),
  }
}

function herkunftLesen(x: unknown): HerkunftStand | null {
  const h = x as Partial<HerkunftStand> | null | undefined
  if ((h?.armCount !== 3 && h?.armCount !== 4) || !Array.isArray(h.arme) || h.arme.length !== h.armCount) return null
  const arme = h.arme.map(herkunftArmLesen)
  if (arme.some(a => a === null)) return null
  return { name: typeof h.name === 'string' ? h.name : '', armCount: h.armCount, arme: arme as UebernahmeArm[] }
}

/** Übernahme, wie sie beim Speichern galt: für die Herkunft der Werte nach dem Laden. Nicht für den Hinweis «Aus der Karte übernommen» */
export function herkunftAus(k: KartenBezug | null): KnotenUebernahme | undefined {
  if (!k?.herkunft) return undefined
  const h = k.herkunft
  return { id: k.osmKnoten, lat: k.lat, lon: k.lon, name: h.name, armCount: h.armCount, arme: h.arme, belegt: [], vergleich: k.vergleich, hinweise: [], osmStand: '', hoehenModelle: [] }
}

/** Arme, deren Modellströme fehlen und die weder Ströme haben noch als «kein Verkehr» bestätigt sind (Index in Rechner-Reihenfolge) */
export function offeneModellArme(u: KnotenUebernahme | undefined, summen: readonly number[], bestaetigt: readonly number[]): number[] {
  return (u?.arme ?? []).flatMap((a, i) => (a.stroemeOffen && i < summen.length && !(summen[i] > 0) && !bestaetigt.includes(i) ? [i] : []))
}
/** Dieselben Arme als offene Angaben der Rechner */
export const offeneModellAngaben = (u: KnotenUebernahme | undefined, summen: readonly number[], bestaetigt: readonly number[]): string[] =>
  offeneModellArme(u, summen, bestaetigt).map(i => `Arm ${u!.arme[i].label}: Ströme (kein Modellwert; eingeben oder «kein Verkehr» bestätigen)`)
/** Bestätigte Arme aus einer Datei */
export const bestaetigtLesen = (x: unknown): number[] => (Array.isArray(x) ? x.filter((i): i is number => Number.isInteger(i) && i >= 0 && i < 4) : [])

/** Bezug aus einer Datei; ältere Dateien haben keinen */
export function kartenBezugLesen(x: unknown): KartenBezug | null {
  const k = x as Partial<KartenBezug> | null | undefined
  if (typeof k?.osmKnoten !== 'number' || typeof k.lat !== 'number' || typeof k.lon !== 'number') return null
  const zahl = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
  const vergleich = (Array.isArray(k.vergleich) ? k.vergleich : []).filter(v => typeof v?.label === 'string').map(v => ({
    label: v.label, name: typeof v.name === 'string' ? v.name : '', dtv: zahl(v.dtv), msp: zahl(v.msp), asp: zahl(v.asp), lokalDtv: zahl(v.lokalDtv),
    lokalQuelle: typeof v.lokalQuelle === 'string' ? v.lokalQuelle : null,
  }))
  const text = (v: unknown) => (typeof v === 'string' ? v : '')
  const quellen = (Array.isArray(k.quellen) ? k.quellen : []).filter(q => typeof q?.quelle === 'string').map(q => ({
    quelle: q.quelle, fuer: text(q.fuer), anbieter: text(q.anbieter), stand: text(q.stand), lizenz: text(q.lizenz), ...(/^https:\/\//.test(text(q.url)) ? { url: q.url } : {}),
  }))
  const punkt = (p: unknown): p is [number, number] => Array.isArray(p) && p.length === 2 && p.every(x => typeof x === 'number' && Number.isFinite(x))
  const arme = (Array.isArray(k.arme) ? k.arme : []).filter(a => typeof a?.label === 'string' && Array.isArray(a.linie) && a.linie.length >= 2 && a.linie.every(punkt))
    .map(a => ({ label: a.label, linie: a.linie.map(([x, y]) => [x, y] as [number, number]) }))
  return { osmKnoten: k.osmKnoten, lat: k.lat, lon: k.lon, belegt: Array.isArray(k.belegt) ? k.belegt.filter(b => typeof b === 'string') : [], vergleich, quellen,
    ...(arme.length ? { arme } : {}), ...(herkunftLesen(k.herkunft) ? { herkunft: herkunftLesen(k.herkunft)! } : {}) }
}
