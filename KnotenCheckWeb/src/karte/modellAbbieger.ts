// Abbiegeströme aus dem Modell NPVM als Vorschlag für einen Knoten. Es sind Modellwerte, nicht gezählt. Sie kommen nur auf ausdrückliche Wahl
// in die Rechner.
//
// Die Kacheln in public/modellabbieger entstehen offline aus den Visum-Dateien des NPVM (Morgenspitze 7–8 Uhr, Abendspitze 17–18 Uhr).
// Eine Kreuzung besteht im Modell oft aus mehreren Knoten: Der Verkehr eines Arms wird darum nach den Abbiegeranteilen durch
// die Knoten in der Nähe verfolgt, bis er auf einen anderen Arm kommt.

import { holeJson } from '../knotenkern/daten/holen'
import { abstandStrecke, dist, einheit, sub, wdiff, type P } from '../knotenkern/geo'
import { npvmLesen, npvmUrl, type ModellStrecke } from './belastung'
import type { Spitze } from './uebernahme'

export const MODELL_ABBIEGER_QUELLE = '© ARE, Nationales Personenverkehrsmodell (NPVM) 2023, Abbieger aus den Visum-Dateien gelesen'
const KACHEL_M = 5000
/** Annahme: So weit vom Knoten wird der Arm mit dem Modell verglichen, wie bei den Belastungen */
const PROBE_M = 30
/** Annahme: Modellstrecken bis zu diesem Abstand und dieser Richtungsabweichung gehören zum Arm, auch beide Fahrbahnen */
const ARM_ABSTAND_M = 15
const ARM_WINKEL_GRAD = 30
/** Annahme: Modellknoten bis zu diesem Abstand gehören zur selben Kreuzung */
const KNOTEN_UMKREIS_M = 80
const MAX_SCHRITTE = 8
const ABRUF_MS = 15000

/** von, über, nach, Strecke von, Strecke nach, Morgen Fz/h, davon Schwerverkehr, Abend Fz/h, davon Schwerverkehr */
export type AbbiegerZeile = [number, number, number, number, number, number, number, number, number]
export interface Kachel { k: Record<string, P>; a: AbbiegerZeile[] }
export interface ArmEingabe { key: string; profil: P[] }
export interface ArmStroeme { left: number; straight: number; right: number }
export type AbbiegerMatrix = Record<string, Record<string, number>>
export interface AbbiegerStand { spitze: Spitze; matrix: AbbiegerMatrix; offen: string[] }

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

/** Modellstrecken eines Arms; parallele Fahrbahnen gehören beide dazu */
export function armNummern(strecken: ModellStrecke[], profil: P[]): number[] {
  if (profil.length < 2) return []
  const { p, r } = aufLinie(profil, PROBE_M)
  const passt = (s: ModellStrecke) => s.teile.some(t => t.slice(1).some((q, i) => {
    const u = einheit(sub(q, t[i]))
    return Math.min(wdiff(u, r), 180 - wdiff(u, r)) <= ARM_WINKEL_GRAD && abstandStrecke(p, t[i], q) <= ARM_ABSTAND_M
  }))
  return [...new Set(strecken.filter(passt).map(s => s.nr))]
}

/** Kachelnamen, die den Umkreis des Knotens abdecken */
export function kachelNamen(p: P, umkreis = 300): string[] {
  const x0 = Math.floor((p[0] - umkreis) / KACHEL_M), x1 = Math.floor((p[0] + umkreis) / KACHEL_M)
  const y0 = Math.floor((p[1] - umkreis) / KACHEL_M), y1 = Math.floor((p[1] + umkreis) / KACHEL_M)
  const aus: string[] = []
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) aus.push(`${x}_${y}`)
  return aus
}

/** Fahrzeuge von Arm zu Arm: Verkehr jeder Zufahrt nach den Abbiegeranteilen bis zum nächsten Arm verfolgt */
export function modellMatrix(kacheln: Kachel[], mitte: P, arme: { key: string; nummern: number[] }[], spitze: Spitze): AbbiegerMatrix {
  const lage = new Map<number, P>(), wege = new Map<string, AbbiegerZeile[]>()
  const spalte = spitze === 'morgen' ? 5 : 7
  for (const k of kacheln) {
    for (const [n, p] of Object.entries(k.k)) lage.set(Number(n), p)
    for (const z of k.a) { const s = `${z[3]}|${z[0]}|${z[1]}`; const l = wege.get(s); if (l) l.push(z); else wege.set(s, [z]) }
  }
  const abstand = (n: number) => { const p = lage.get(n); return p ? dist(p, mitte) : Infinity }
  const armVon = new Map<number, string>()
  for (const a of arme) for (const n of a.nummern) armVon.set(n, a.key)
  const m: AbbiegerMatrix = Object.fromEntries(arme.map(a => [a.key, {}]))

  const weiter = (schluessel: string, fluss: number, quelle: string, schritt: number) => {
    const z = wege.get(schluessel)
    if (!z || schritt > MAX_SCHRITTE) return
    const summe = z.reduce((s, x) => s + x[spalte], 0)
    if (summe <= 0) return
    for (const x of z) {
      const teil = fluss * x[spalte] / summe, ziel = armVon.get(x[4])
      if (ziel !== undefined) {
        // Zurück auf den eigenen Arm oder zum Knoten hin: zählt nicht, die Strecke näher am Knoten bringt ihren Verkehr selbst ein
        if (ziel !== quelle && abstand(x[2]) >= abstand(x[1])) m[quelle][ziel] = (m[quelle][ziel] ?? 0) + teil
      } else if (abstand(x[2]) <= KNOTEN_UMKREIS_M) weiter(`${x[4]}|${x[1]}|${x[2]}`, teil, quelle, schritt + 1)
    }
  }
  for (const [s, z] of wege) {
    const [von, ueber, , strecke] = z[0], arm = armVon.get(strecke)
    if (arm === undefined || abstand(ueber) > KNOTEN_UMKREIS_M || abstand(ueber) >= abstand(von)) continue
    weiter(s, z.reduce((t, x) => t + x[spalte], 0), arm, 0)
  }
  return m
}

/** Ziel je Fahrbeziehung nach der Reihenfolge der Rechner: A West, C Ost, B Süd, D Nord */
const ZIEL: Record<string, Record<keyof ArmStroeme, string>> = {
  A: { left: 'D', straight: 'C', right: 'B' }, C: { left: 'B', straight: 'A', right: 'D' },
  B: { left: 'A', straight: 'D', right: 'C' }, D: { left: 'C', straight: 'B', right: 'A' },
}

/** Matrix als Eingabe der Rechner, auf ganze Fahrzeuge gerundet. Am Kreisel führt rechts von Arm i zu Arm i + 1, die Nummern laufen in Fahrtrichtung */
export function armStroeme(m: AbbiegerMatrix, arme: { key: string; label: string }[], kreisel: boolean): Record<string, ArmStroeme> {
  const n = arme.length, aus: Record<string, ArmStroeme> = {}
  const ziel = (i: number, f: keyof ArmStroeme) => {
    if (!kreisel) return arme.find(a => a.label === ZIEL[arme[i].label]?.[f])
    if (n === 3 && f === 'straight') return undefined
    return arme[(i + (f === 'right' ? 1 : f === 'left' ? n - 1 : 2)) % n]
  }
  arme.forEach((a, i) => {
    const wert = (f: keyof ArmStroeme) => { const z = ziel(i, f); return z ? Math.round(m[a.key]?.[z.key] ?? 0) : 0 }
    aus[a.key] = { left: wert('left'), straight: wert('straight'), right: wert('right') }
  })
  return aus
}

/** Vorschlag für einen Knoten; offen nennt Arme ohne passende Modellstrecke. Ohne Kachel bleibt die Matrix leer */
export async function abbiegerHolen(mitte: P, arme: ArmEingabe[], spitze: Spitze, signal?: AbortSignal): Promise<AbbiegerStand> {
  const kachel = (n: string) => holeJson<Kachel>(new URL(`${import.meta.env.BASE_URL}modellabbieger/${n}.json`, location.origin).href, {}, ABRUF_MS, signal)
    .then(r => r.daten, e => { if (signal?.aborted) throw e; return null })
  const [roh, ...kacheln] = await Promise.all([holeJson<unknown>(npvmUrl(mitte), {}, ABRUF_MS, signal), ...kachelNamen(mitte).map(kachel)])
  const strecken = npvmLesen((roh as { daten: unknown }).daten)
  const zuordnung = arme.map(a => ({ key: a.key, nummern: armNummern(strecken, a.profil) }))
  const matrix = modellMatrix((kacheln as (Kachel | null)[]).filter((k): k is Kachel => !!k), mitte, zuordnung, spitze)
  return { spitze, matrix, offen: zuordnung.filter(a => !a.nummern.length || !Object.keys(matrix[a.key]).length).map(a => a.key) }
}
