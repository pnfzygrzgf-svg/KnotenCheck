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
    ...(arten.has('abbieger') ? [{ quelle: 'Nationales Personenverkehrsmodell (NPVM) 2023, Abbieger aus den Visum-Dateien', fuer: 'Abbiegeströme, modelliert', anbieter: 'ARE', stand: '2023', lizenz: 'CC BY 4.0, Quellenangabe © ARE',
      url: 'https://map.geo.admin.ch/?layers=ch.are.belastung-personenverkehr-strasse' }] : []),
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

/** Bezug zur Karte in der Speicherdatei: Ort, OSM-Nummer und Herkunft der Vorbelegung */
export interface KartenBezug { osmKnoten: number; lat: number; lon: number; belegt: string[]; vergleich: ArmVergleich[]; quellen: BerichtQuelle[] }

export const kartenBezugAus = (u: KnotenUebernahme, r: RechnerKey): KartenBezug =>
  ({ osmKnoten: u.id, lat: u.lat, lon: u.lon, belegt: belegtFuer(u, r), vergleich: u.vergleich, quellen: quellenFuer(u, r) })

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
  return { osmKnoten: k.osmKnoten, lat: k.lat, lon: k.lon, belegt: Array.isArray(k.belegt) ? k.belegt.filter(b => typeof b === 'string') : [], vergleich, quellen }
}
