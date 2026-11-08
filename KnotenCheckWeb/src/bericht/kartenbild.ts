// Kartenausschnitt des Berichts wie im SichtweitenCheck (berichtbild.ts): ein Luftbild per WMS in LV95, darüber eine SVG-Zeichnung
// der Arme. Bild und Zeichnung sind beide in LV95, die Zuordnung ist eine reine Verschiebung und Skalierung (Norden oben).

import { lv95 } from '../knotenkern/geo'
import type { KartenBezug } from '../karte/rechner'

export type Box = [number, number, number, number]   // [E0, N0, E1, N1] LV95
type P = [number, number]

export const RAND_M = 12        // Rand um Knoten und Arme
export const MIN_M = 60         // kleinste Breite des Ausschnitts
export const VERH_MIN = 0.55    // Höhe/Breite
export const VERH_MAX = 0.7
export const BILD_PX_MIN = 1000
export const BILD_PX_MAX = 1400
export const AUFLOESUNG_M = 0.1 // SWISSIMAGE 10 cm
export const VB = 1000          // Breite der SVG-Zeichnung

/** Ausschnitt um alle Punkte mit Rand, mindestens MIN_M breit, auf das Seitenverhältnis VERH_MIN … VERH_MAX geweitet */
export function ausschnitt(punkte: P[], rand = RAND_M): Box {
  if (!punkte.length) throw new Error('Ausschnitt ohne Punkte')
  let e0 = Infinity, e1 = -Infinity, n0 = Infinity, n1 = -Infinity
  for (const [e, n] of punkte) { e0 = Math.min(e0, e); e1 = Math.max(e1, e); n0 = Math.min(n0, n); n1 = Math.max(n1, n) }
  e0 -= rand; e1 += rand; n0 -= rand; n1 += rand
  const weiten = (a: number, b: number, l: number): [number, number] => { const m = (a + b) / 2; return [m - l / 2, m + l / 2] }
  if (e1 - e0 < MIN_M) [e0, e1] = weiten(e0, e1, MIN_M)
  if (n1 - n0 < MIN_M * VERH_MIN) [n0, n1] = weiten(n0, n1, MIN_M * VERH_MIN)
  const w = e1 - e0, h = n1 - n0
  if (h / w > VERH_MAX) [e0, e1] = weiten(e0, e1, h / VERH_MAX)
  else if (h / w < VERH_MIN) [n0, n1] = weiten(n0, n1, w * VERH_MIN)
  return [e0, n0, e1, n1]
}

/** Grösse des WMS-Bilds: Breite aus der Auflösung, begrenzt; Höhe aus derselben m/px */
export function bildPixel(box: Box): { breite: number; hoehe: number } {
  const wM = box[2] - box[0], hM = box[3] - box[1]
  const breite = Math.min(BILD_PX_MAX, Math.max(BILD_PX_MIN, Math.round(wM / AUFLOESUNG_M)))
  return { breite, hoehe: Math.round(hM * breite / wM) }
}

/** LV95 -> SVG (x nach rechts ab E0, y nach unten ab N1) */
export function svgAbbildung(box: Box, vb = VB): { vh: number; xy: (p: P) => [number, number]; s: number } {
  const [e0, n0, e1, n1] = box
  const s = vb / (e1 - e0)
  return { s, vh: (n1 - n0) * s, xy: p => [(p[0] - e0) * s, (n1 - p[1]) * s] }
}

/** Länge des Massstabsbalkens: runde Länge nahe einem Fünftel der Breite [m] */
export function massstab(breiteM: number): number {
  return [5, 10, 20, 25, 50, 100, 200].reduce((b, x) => (Math.abs(x - breiteM / 5) < Math.abs(b - breiteM / 5) ? x : b), 10)
}

export function wmsBildUrl(box: Box, breite: number, hoehe: number): string {
  return 'https://wms.geo.admin.ch/?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=ch.swisstopo.swissimage&STYLES=' +
    `&CRS=EPSG:2056&BBOX=${box.map(v => v.toFixed(1)).join(',')}&WIDTH=${breite}&HEIGHT=${hoehe}&FORMAT=image/jpeg`
}

/** Knoten und Armlinien in LV95; null ohne Armlinien (ältere Dateien, Rechner ohne Karte) */
export function kartenGeometrie(k: KartenBezug): { knoten: P; arme: { label: string; linie: P[] }[] } | null {
  if (!k.arme?.length) return null
  return { knoten: lv95(k.lat, k.lon), arme: k.arme.map(a => ({ label: a.label, linie: a.linie.map(([lat, lon]) => lv95(lat, lon)) })) }
}
