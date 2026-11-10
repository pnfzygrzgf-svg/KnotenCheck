// Belastung je Arm als Vergleichswert, ohne Wirkung auf die Rechnung. Abbiegeströme: modellAbbieger.ts.
//
// Bund: Nationales Personenverkehrsmodell NPVM (ARE) je Modellstrecke: DTV, Morgenspitze 7–8 Uhr, Abendspitze 17–18 Uhr, modelliert. Alle
// Werte sind die Summe beider Richtungen (am Originalexport geprüft), bei getrennten Fahrbahnen je Fahrbahn. Die Strecken werden
// nicht addiert: Passt nicht genau eine, bleibt der Arm offen. Der Schwerverkehrsanteil gilt je Spitze, weil die Rechner eine Spitzenstunde
// rechnen; das Modell nennt ganze Fahrzeuge, auf kleinen Strecken ergibt das oft 0 %.
// Lokal: Stadt Bern je Strassenabschnitt (DTV = 16 · Nt + 8 · Nn, wie fgsCheck und VeloroutenCheck), Kanton Zürich, Stadt Luzern und
// Basel-Stadt je Zählstelle.

import { ausschnittKreis, DTV_STUFEN, dtvStufe, dtvWert, type EigeneEbene } from '../kartenbaustein/ebenenAusschnitt'
import type { KartenObjekt } from '../kartenbaustein/modell'
import { holeJson } from '../knotenkern/daten/holen'
import { abstandStrecke, dist, einheit, lv95, sub, wdiff, wgs, type P } from '../knotenkern/geo'
import type { KartenArm } from './knotenVorschlag'

const NPVM_LAYER = 'ch.are.belastung-personenverkehr-strasse'
export const NPVM_QUELLE = '© ARE, Nationales Personenverkehrsmodell (NPVM) und Aggregierte Methode Güterverkehr (AMG)'
const NPVM_UMKREIS_M = 120
const ABRUF_MS = 15000
/** Annahme: Der Arm wird so weit vom Knoten mit dem Modell verglichen; näher am Knoten laufen die Strecken zusammen */
const PROBE_M = 30
/** Annahme: Eine Modellstrecke passt bis zu diesem Abstand und dieser Richtungsabweichung */
const MODELL_ABSTAND_M = 12
const MODELL_WINKEL_GRAD = 30
/** Annahme: Liegt eine zweite Strecke mit anderen Werten höchstens so viel weiter weg, bleibt der Arm offen */
const MODELL_MEHRDEUTIG_M = 4
/** Annahme wie im VeloroutenCheck: Eine Zählstelle gehört bis zu diesem Abstand zum Arm */
const ZAEHLSTELLE_M = 25
const BERN_ABSTAND_M = 10

/** Anteile von Lastwagen und Lastzügen an einer Spitzenstunde [%] */
export interface Schwerverkehr { lw: number; lz: number }
export interface ModellStrecke { nr: number; dtv: number; msp: number; asp: number; svMorgen: Schwerverkehr | null; svAbend: Schwerverkehr | null; teile: P[][] }
export interface ArmBelastung {
  dtv: number | null
  msp: number | null
  asp: number | null
  svMorgen: Schwerverkehr | null
  svAbend: Schwerverkehr | null
  modellHinweis: string | null // warum kein Modellwert
  lokalDtv: number | null
  lokalQuelle: string | null
}

interface RohFeature { geometry?: { type?: string; coordinates?: unknown }; properties?: Record<string, unknown>; attributes?: Record<string, unknown> }

const teileAus = (g: RohFeature['geometry']): P[][] => {
  const roh = g?.type === 'LineString' ? [g.coordinates] : g?.type === 'MultiLineString' && Array.isArray(g.coordinates) ? g.coordinates : []
  return (roh as number[][][]).map(z => z.map(c => [c[0], c[1]] as P)).filter(z => z.length >= 2)
}

const prozent = (teil: number, ganz: number) => Math.round(teil / ganz * 1000) / 10

/** Anteile einer Spitze; null ohne Verkehr oder ohne Angabe */
const spitzenAnteile = (lw: number | null, lz: number | null, fzg: number): Schwerverkehr | null =>
  (lw === null || lz === null || !(fzg > 0) ? null : { lw: prozent(lw, fzg), lz: prozent(lz, fzg) })

/** Antwort von identify -> Modellstrecken; Strecken ohne Werte fallen weg */
export function npvmLesen(roh: unknown): ModellStrecke[] {
  const aus: ModellStrecke[] = []
  for (const f of (roh as { results?: RohFeature[] } | null)?.results ?? []) {
    const p = f.properties ?? f.attributes ?? {}
    const z = (k: string) => (typeof p[k] === 'number' && Number.isFinite(p[k]) ? p[k] : null)
    const dtv = z('dtv_fzg'), msp = z('msp_fzg'), asp = z('asp_fzg'), nr = z('nr')
    const teile = teileAus(f.geometry)
    if (dtv === null || msp === null || asp === null || nr === null || !teile.length) continue
    aus.push({ nr, dtv, msp, asp, svMorgen: spitzenAnteile(z('msp_lw'), z('msp_lz'), msp), svAbend: spitzenAnteile(z('asp_lw'), z('asp_lz'), asp), teile })
  }
  return aus
}

export function npvmUrl(p: P, umkreis = NPVM_UMKREIS_M): string {
  const box = [p[0] - umkreis, p[1] - umkreis, p[0] + umkreis, p[1] + umkreis].map(x => x.toFixed(1)).join(',')
  const q = new URLSearchParams({ geometry: box, geometryType: 'esriGeometryEnvelope', layers: `all:${NPVM_LAYER}`, mapExtent: box, imageDisplay: '1000,1000,96',
    tolerance: '0', sr: '2056', returnGeometry: 'true', geometryFormat: 'geojson', limit: '200', lang: 'de' })
  return `https://api3.geo.admin.ch/rest/services/ech/MapServer/identify?${q}`
}

/** Punkt und Richtung der Linie nach m Metern */
function aufLinie(l: P[], m: number): { p: P; r: P } {
  let s = 0
  for (let i = 0; i < l.length - 1; i++) {
    const d = dist(l[i], l[i + 1]), r = einheit(sub(l[i + 1], l[i]))
    if (s + d >= m) return { p: [l[i][0] + r[0] * (m - s), l[i][1] + r[1] * (m - s)], r }
    s += d
  }
  return { p: l[l.length - 1], r: einheit(sub(l[l.length - 1], l[Math.max(0, l.length - 2)])) }
}

/** Abstand einer Strecke zum Punkt, nur Stücke in Richtung des Arms (Fahrtrichtung spielt keine Rolle); null ohne passendes Stück */
function streckenAbstand(s: ModellStrecke, p: P, r: P): number | null {
  let best: number | null = null
  for (const t of s.teile) for (let i = 0; i < t.length - 1; i++) {
    const u = einheit(sub(t[i + 1], t[i]))
    if (Math.min(wdiff(u, r), 180 - wdiff(u, r)) > MODELL_WINKEL_GRAD) continue
    const d = abstandStrecke(p, t[i], t[i + 1])
    if (best === null || d < best) best = d
  }
  return best
}

const gleicherSv = (a: Schwerverkehr | null, b: Schwerverkehr | null) => (a === null || b === null ? a === b : a.lw === b.lw && a.lz === b.lz)
const gleicheWerte = (a: ModellStrecke, b: ModellStrecke) =>
  a.dtv === b.dtv && a.msp === b.msp && a.asp === b.asp && gleicherSv(a.svMorgen, b.svMorgen) && gleicherSv(a.svAbend, b.svAbend)

/** Modellstrecke des Arms: die nächste passende; zwei gleich nahe mit anderen Werten (parallele Fahrbahnen, Knoten) bleiben offen */
export function modellZuordnen(strecken: ModellStrecke[], profil: P[]): { strecke: ModellStrecke | null; hinweis: string | null } {
  if (profil.length < 2) return { strecke: null, hinweis: 'Arm zu kurz für den Vergleich.' }
  const { p, r } = aufLinie(profil, PROBE_M)
  const k = strecken.flatMap(s => { const d = streckenAbstand(s, p, r); return d !== null && d <= MODELL_ABSTAND_M ? [{ s, d }] : [] }).sort((a, b) => a.d - b.d)
  if (!k.length) return { strecke: null, hinweis: 'Keine passende Modellstrecke. Fehlt sie, heisst das nicht, dass kein Verkehr fährt.' }
  // Verglichen wird alles, was später gebraucht wird: Tageswert, beide Spitzen und der Schwerverkehr. Sonst entschiede die Reihenfolge der Antwort
  const zweite = k.find(x => x.s.nr !== k[0].s.nr && !gleicheWerte(x.s, k[0].s))
  if (zweite && zweite.d <= k[0].d + MODELL_MEHRDEUTIG_M) return { strecke: null, hinweis: 'Mehrere passende Modellstrecken (parallele Fahrbahnen oder Knoten): offen.' }
  return { strecke: k[0].s, hinweis: null }
}

// ── Lokale Quellen ──────────────────────────────────────────────────────────────

export interface LokalLinie { dtv: number; teile: P[][]; quelle: string }
export interface Zaehlstelle { lat: number; lon: number; dtv: number }

const imRechteck = (lat: number, lon: number, b: [number, number, number, number]) => lat >= b[0] && lat <= b[2] && lon >= b[1] && lon <= b[3]
const BERN: [number, number, number, number] = [46.90, 7.28, 47.00, 7.55]
const ZUERICH: [number, number, number, number] = [47.15, 8.35, 47.70, 8.99]
const LUZERN: [number, number, number, number] = [47.00, 8.20, 47.09, 8.40]
const BASEL: [number, number, number, number] = [47.51, 7.55, 47.61, 7.70]

/** Stadt Bern: Abschnitte mit DTV = 16 · Nt + 8 · Nn */
export function bernLesen(roh: unknown): LokalLinie[] {
  const aus: LokalLinie[] = []
  for (const f of (roh as { features?: RohFeature[] } | null)?.features ?? []) {
    const nt = f.properties?.Nt, nn = f.properties?.Nn
    const teile = teileAus(f.geometry)
    if (typeof nt !== 'number' || typeof nn !== 'number' || !teile.length) continue
    aus.push({ dtv: Math.round(16 * nt + 8 * nn), teile, quelle: 'Stadt Bern, flächendeckende Verkehrsdaten' })
  }
  return aus
}

export function bernUrl(p: P, umkreis = NPVM_UMKREIS_M): string {
  const q = new URLSearchParams({ where: '1=1', geometry: `${p[0] - umkreis},${p[1] - umkreis},${p[0] + umkreis},${p[1] + umkreis}`, geometryType: 'esriGeometryEnvelope',
    inSR: '2056', outSR: '2056', spatialRel: 'esriSpatialRelIntersects', outFields: 'Nt,Nn', f: 'geojson' })
  return `https://map.bern.ch/arcgis/rest/services/Geoportal/Flaechendeckende_Verkehrsdaten/MapServer/0/query?${q}`
}

type Punktantwort = { features?: { geometry?: { coordinates?: [number, number] }; properties?: Record<string, unknown> }[] }
const punkteAus = (r: Punktantwort, feld: string): Zaehlstelle[] => (r.features ?? []).flatMap(f => {
  const c = f.geometry?.coordinates, dtv = f.properties?.[feld]
  return c && typeof dtv === 'number' ? [{ lat: c[1], lon: c[0], dtv }] : []
})

interface Zaehlstellen { stellen: Zaehlstelle[]; quelle: string }
/** Die Dienste liefern alle Zählstellen auf einmal: Beim Verschieben der Karte reicht der erste Abruf */
const stellenGeholt = new Map<string, Zaehlstellen>()

async function zaehlstellen(lat: number, lon: number, signal?: AbortSignal): Promise<Zaehlstellen | null> {
  const r = await zaehlstellenHolen(lat, lon, signal)
  if (r) stellenGeholt.set(r.quelle, r)
  return r
}

async function zaehlstellenHolen(lat: number, lon: number, signal?: AbortSignal): Promise<Zaehlstellen | null> {
  const schon = (quelle: string) => stellenGeholt.get(quelle)
  if (imRechteck(lat, lon, ZUERICH)) {
    const gemerkt = schon('Kanton Zürich, Verkehrsmessstellen')
    if (gemerkt) return gemerkt
    const r = await holeJson<Punktantwort>('https://maps.zh.ch/wfs/OGDZHWFS?service=WFS&version=2.0.0&request=GetFeature' +
      '&typeNames=ms:ogd-0223_giszhpub_tba_verkehrsmessstellen_p&outputFormat=geojson&srsName=EPSG:4326', {}, ABRUF_MS, signal)
    return { stellen: punkteAus(r.daten, 'dtv'), quelle: 'Kanton Zürich, Verkehrsmessstellen' }
  }
  if (imRechteck(lat, lon, LUZERN)) {
    const gemerkt = schon('Stadt Luzern, Verkehrszählung')
    if (gemerkt) return gemerkt
    const q = new URLSearchParams({ where: '1=1', outFields: 'DTV_ANZAHL', returnGeometry: 'true', outSR: '4326', f: 'geojson' })
    const r = await holeJson<Punktantwort>(`https://map.stadtluzern.ch/server/rest/services/OGD/verkehrszaehldaten/MapServer/0/query?${q}`, {}, ABRUF_MS, signal)
    return { stellen: punkteAus(r.daten, 'DTV_ANZAHL'), quelle: 'Stadt Luzern, Verkehrszählung' }
  }
  if (imRechteck(lat, lon, BASEL)) {
    const gemerkt = schon('Basel-Stadt, Zählstellen (Werktagsmittel)')
    if (gemerkt) return gemerkt
    // holeJson braucht eine ganze Adresse
    const r = await holeJson<Zaehlstelle[]>(new URL(`${import.meta.env.BASE_URL}dtv_basel.json`, location.origin).href, {}, ABRUF_MS, signal)
    return { stellen: r.daten, quelle: 'Basel-Stadt, Zählstellen (Werktagsmittel)' }
  }
  return null
}

/** Kartenebene: Abschnitte der Stadt Bern als Linien, Zählstellen als Punkte; die Zählstelle misst nur ihren Standort */
export function mengenLinien(linien: readonly LokalLinie[]): KartenObjekt[] {
  return linien.map((l, i) => ({ id: `dtv.bern:${i}`, quelle: l.quelle, linien: l.teile, klasse: dtvStufe(l.dtv), wert: dtvWert(l.dtv), text: `DTV ≈ ${dtvWert(l.dtv)} Fahrzeuge je Tag (${l.quelle})` }))
}
export function mengenPunkte(stellen: readonly Zaehlstelle[], quelle: string, lv: (lat: number, lon: number) => P, box: readonly number[]): KartenObjekt[] {
  return stellen.flatMap(s => {
    const punkt = lv(s.lat, s.lon)
    if (!(s.dtv > 0) || punkt[0] < box[0] || punkt[1] < box[1] || punkt[0] > box[2] || punkt[1] > box[3]) return []
    return [{ id: `dtv.stelle:${s.lat.toFixed(6)},${s.lon.toFixed(6)}`, quelle, punkt, klasse: dtvStufe(s.dtv), wert: dtvWert(s.dtv), symbol: 'Z', text: `Zählstelle: DTV ${dtvWert(s.dtv)} (${quelle})` }]
  })
}

/** Antwort der Stadt Bern, gekappt wirft: Eine halbe Karte fiele nicht auf */
export function bernMengenLesen(roh: unknown): LokalLinie[] {
  const a = roh as { error?: { message?: string }; exceededTransferLimit?: boolean; properties?: { exceededTransferLimit?: boolean } } | null
  if (a?.error) throw new Error(`ArcGIS ${a.error.message ?? ''}`.trim())
  if (a?.exceededTransferLimit || a?.properties?.exceededTransferLimit) throw new Error('Antwort unvollständig (Übertragungsgrenze des Dienstes)')
  return bernLesen(roh)
}

/** Örtliche Verkehrsmengen im Ausschnitt; ohne örtliche Quelle bleibt die Ebene leer, das Modell ist eine eigene Ebene */
export const VERKEHRSMENGE_ORT: EigeneEbene = {
  id: 'dtv', titel: 'Verkehrsmenge (DTV)', legende: [...DTV_STUFEN, ['zaehlstelle', '#475569', 'Z: Zählstelle, Farbe nach dem DTV', 'Z']],
  quelle: 'Stadt Bern je Abschnitt (DTV ≈ 16 · Nt + 8 · Nn); Kanton Zürich, Stadt Luzern und Basel-Stadt je Zählstelle; nur Karte, keine Wirkung auf die Rechnung',
  async laden(box, signal) {
    const { mitte, r } = ausschnittKreis(box), [lat, lon] = wgs(mitte[0], mitte[1])
    const linien = imRechteck(lat, lon, BERN) ? bernMengenLesen((await holeJson<unknown>(bernUrl(mitte, r), {}, ABRUF_MS, signal)).daten) : []
    const punkte = await zaehlstellen(lat, lon, signal)
    return [...mengenLinien(linien), ...(punkte ? mengenPunkte(punkte.stellen, punkte.quelle, lv95, box.split(',').map(Number)) : [])]
  },
}

const linieAbstand = (p: P, l: P[]) => Math.min(...l.slice(0, -1).map((q, i) => abstandStrecke(p, q, l[i + 1])))

/** Abschnitt der Stadt Bern am Arm */
export function lokalLinieZuordnen(linien: LokalLinie[], profil: P[]): LokalLinie | null {
  if (profil.length < 2) return null
  const { p } = aufLinie(profil, PROBE_M)
  const k = linien.map(l => ({ l, d: Math.min(...l.teile.map(t => linieAbstand(p, t))) })).filter(x => x.d <= BERN_ABSTAND_M).sort((a, b) => a.d - b.d)
  return k[0]?.l ?? null
}

/** Nächste Zählstelle am Arm */
export function zaehlstelleZuordnen(stellen: Zaehlstelle[], profil: P[], lv: (lat: number, lon: number) => P): Zaehlstelle | null {
  if (profil.length < 2) return null
  const k = stellen.map(s => ({ s, d: linieAbstand(lv(s.lat, s.lon), profil) })).filter(x => x.d <= ZAEHLSTELLE_M).sort((a, b) => a.d - b.d)
  return k[0]?.s ?? null
}

export interface BelastungsStand { arme: Record<string, ArmBelastung>; fehler: string[] }

/** Belastung aller Arme. Fällt ein Dienst aus, bleiben seine Werte leer und der Fehler steht in fehler; ein Abbruch wird weitergereicht */
export async function ladeBelastung(arme: KartenArm[], mitte: P, lv: (lat: number, lon: number) => P, signal?: AbortSignal): Promise<BelastungsStand> {
  const [lat, lon] = wgs(mitte[0], mitte[1])
  const fehler: string[] = []
  const versuch = async <T,>(name: string, f: () => Promise<T>, leer: T): Promise<T> => {
    try { return await f() } catch (e) {
      if (signal?.aborted || (e as Error)?.name === 'AbortError') throw e
      fehler.push(`${name}: ${(e as Error).message}`)
      return leer
    }
  }
  const strecken = await versuch('NPVM', async () => npvmLesen((await holeJson<unknown>(npvmUrl(mitte), {}, ABRUF_MS, signal)).daten), [])
  const bern = imRechteck(lat, lon, BERN) ? await versuch('Stadt Bern', async () => bernLesen((await holeJson<unknown>(bernUrl(mitte), {}, ABRUF_MS, signal)).daten), []) : []
  const punkte = await versuch('Zählstellen', () => zaehlstellen(lat, lon, signal), null)

  const aus: Record<string, ArmBelastung> = {}
  for (const a of arme) {
    const { strecke: s, hinweis } = fehler.some(f => f.startsWith('NPVM')) ? { strecke: null, hinweis: 'Modell nicht erreichbar.' } : modellZuordnen(strecken, a.profil)
    const linie = lokalLinieZuordnen(bern, a.profil)
    const stelle = punkte ? zaehlstelleZuordnen(punkte.stellen, a.profil, lv) : null
    aus[a.key] = {
      dtv: s?.dtv ?? null, msp: s?.msp ?? null, asp: s?.asp ?? null,
      svMorgen: s?.svMorgen ?? null, svAbend: s?.svAbend ?? null,
      modellHinweis: hinweis, lokalDtv: linie?.dtv ?? stelle?.dtv ?? null, lokalQuelle: linie?.quelle ?? (stelle ? punkte?.quelle ?? null : null),
    }
  }
  return { arme: aus, fehler }
}
