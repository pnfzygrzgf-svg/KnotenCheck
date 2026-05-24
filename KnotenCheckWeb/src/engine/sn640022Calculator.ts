// SN 640 022 Hauptrechner
// Port von SN640022Calculator.swift — alle Formeln F1–F21

import { classifyLOS, worstLOS } from './levelOfService'
import type {
  SN640022Result, SN640022StreamResult, SN640022MixedResult,
  SN640022LaneFlags
} from './types'

// ── Grundleistungsfähigkeit G_i (Abb. 2, SN 640 022) ─────────────────────────
// Stückweise lineare Interpolation auf abgelesenen Stützpunkten.
// Ablesungen: Mai 2026, auf Gitterlinien qpi = 0–1800 Fz/h.
// Inkl. CH-Erhöhung +90 PWE/h (SN 640 022, Abschnitt 9).
// Jenseits qpi = 1800: letzte Steigung linear extrapoliert, Minimum 0.
// Dokumentation der Methode: siehe README.md, Abschnitt «Grundleistungsfähigkeit G_i».

type GTable = readonly [number, number][]

function interpG(table: GTable, qpi: number): number {
  const n = table.length
  if (qpi <= table[0][0]) return table[0][1]
  if (qpi >= table[n - 1][0]) {
    const [x1, y1] = table[n - 2]
    const [x2, y2] = table[n - 1]
    return Math.max(0, y2 + (qpi - x2) * (y2 - y1) / (x2 - x1))
  }
  let lo = 0, hi = n - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (table[mid][0] <= qpi) lo = mid; else hi = mid
  }
  const [x0, y0] = table[lo]
  const [x1, y1] = table[hi]
  return Math.max(0, y0 + (qpi - x0) * (y1 - y0) / (x1 - x0))
}

// Linksabbiegen von der Hauptstrasse (Ströme 1, 7)
const G_MAIN_LEFT: GTable = [
  [0, 1575], [200, 1200], [400, 950], [600, 775], [800, 600],
  [1000, 500], [1200, 400], [1400, 375], [1600, 300], [1800, 225],
]
// Rechtseinbiegen aus der Nebenstrasse (Ströme 6, 12)
const G_SIDE_RIGHT: GTable = [
  [0, 1250], [200, 975], [400, 750], [600, 600], [800, 475],
  [1000, 400], [1200, 325], [1400, 320], [1600, 250], [1800, 200],
]
// Kreuzen aus der Nebenstrasse (Ströme 5, 11)
const G_SIDE_CROSS: GTable = [
  [0, 1000], [200, 800], [400, 625], [600, 525], [800, 425],
  [1000, 375], [1200, 300], [1400, 300], [1600, 225], [1800, 200],
]
// Linkseinbiegen aus der Nebenstrasse (Ströme 4, 10)
const G_SIDE_LEFT: GTable = [
  [0, 1000], [200, 800], [400, 600], [600, 475], [800, 375],
  [1000, 300], [1200, 250], [1400, 225], [1600, 200], [1800, 175],
]

function gMainLeft(qpi: number):  number { return interpG(G_MAIN_LEFT,  qpi) }
function gSideRight(qpi: number): number { return interpG(G_SIDE_RIGHT, qpi) }
function gSideCross(qpi: number): number { return interpG(G_SIDE_CROSS, qpi) }
function gSideLeft(qpi: number):  number { return interpG(G_SIDE_LEFT,  qpi) }

// ── p₀ Wahrscheinlichkeit staufreier Zustand [F12] ───────────────────────────
function p0(q: number, L: number): number {
  if (L <= 0) return 0
  return Math.max(0, 1 - q / L)
}

// ── pz Korrekturwahrscheinlichkeit [F18] ──────────────────────────────────────
function pz(Py: number): number {
  if (Py <= 0) return 0
  return 0.65 * Py - Py / (Py + 3) + 0.6 * Math.sqrt(Py)
}

// ── Wartezeit [F25] nach Kimber & Hollis (1979) / Abb. 4, SN 640 022 ──────────
// w = 3600/L + 900·T · [(a−1) + √((a−1)² + (3600/L · a) / (450·T))]
// 3600/L = freie Wartezeit (Bedienzeit, Zeit zum Auffinden und Nutzen einer Lücke)
// Gibt auch bei q=0 (a=0) die Bedienzeit 3600/L zurück — nie 0.
function w(q: number, L: number): number {
  if (L <= 0) return 0
  const a   = q / L
  if (a >= 1) return Infinity
  const T   = 0.25
  const t0  = 3600 / L                                     // Bedienzeit [s]
  const inner = (a - 1) ** 2 + t0 * a / (450 * T)
  return t0 + 900 * T * ((a - 1) + Math.sqrt(inner))
}

// ── Stream-Ergebnis zusammenbauen ─────────────────────────────────────────────
let _idCounter = 0
function sid(): string { return `sn-${++_idCounter}` }

function makeStream(
  streamNumber: number, name: string, rang: number,
  q: number, qpi: number, G: number, L: number
): SN640022StreamResult {
  const a  = L > 0 ? q / L : Infinity
  const R  = L - q
  const wt = a < 1 ? w(q, L) : Infinity
  const los = classifyLOS(wt, a)
  return { id: sid(), streamNumber, name, rang, volumeFzh: q,
           qpi, basicCapacity: G, capacity: L, reserve: R,
           utilizationDegree: a, delay: wt, levelOfService: los }
}

// ── Mischstreifen [F21]: Lm = Σqi / Σai ──────────────────────────────────────
function mixed(
  name: string, nums: number[],
  parts: { q: number; L: number }[]
): SN640022MixedResult {
  const totalQ = parts.reduce((s, p) => s + p.q, 0)
  const sumA   = parts.reduce((s, p) => p.L > 0 ? s + p.q / p.L : s, 0)
  const Lm     = sumA > 0 ? totalQ / sumA : 0
  const Rm     = Lm - totalQ
  const wm     = sumA < 1 ? w(totalQ, Lm) : Infinity
  const los    = classifyLOS(wm, sumA)
  return { id: sid(), name, streamNumbers: nums, volumeFzh: totalQ,
           capacity: Lm, reserve: Rm, utilizationDegree: sumA,
           delay: wm, levelOfService: los }
}

// ── Einmündung (3-armig) ──────────────────────────────────────────────────────
// Arm 0 = SN A (HS), Arm 1 = SN C (HS), Arm 2 = SN B (NS)
// v   = PWE/h  → für Auslastungsgrad, Reserve, Wartezeit
// raw = Fz/h   → für qpi in G-Funktionen (Abb. 2, x-Achse = Fz/h)

function einmuendung(v: number[][], raw: number[][], flags: SN640022LaneFlags): SN640022Result {
  // PWE/h — analysierte Ströme (Auslastungsgrad, Reserve, Wartezeit)
  const q7 = v[1][2]               // C → B [Rang 2]
  const q4 = v[2][0], q6 = v[2][1] // B → A [Rang 3], B → C [Rang 2]
  // Fz/h — Konfliktvolumen für G-Funktionen (Abb. 2, x-Achse = Fz/h)
  const r2 = raw[0][1], r3 = raw[0][2]
  const r8 = raw[1][0], r7 = raw[1][2]

  const r3f = flags.armASeparateLane   ? 0 : r3
  const r2r = flags.armAQ2Override     ?? r2   // Override bereits in Fz/h
  const r3g = flags.armATriangleIsland ? 0 : r3

  // Rang 2
  const qp7 = r2 + r3g;           const G7 = gMainLeft(qp7);   const L7 = G7
  const qp6 = r2r + 0.5 * r3f;   const G6 = gSideRight(qp6);  const L6 = G6
  const s7 = makeStream(7, 'C → B', 2, q7, qp7, G7, L7)
  const s6 = makeStream(6, 'B → C', 2, q6, qp6, G6, L6)

  // Rang 3
  const p07 = p0(q7, L7)
  const qp4 = r2 + 0.5 * r3f + r8 + r7
  const G4  = gSideLeft(qp4)
  const L4  = p07 * G4
  const s4  = makeStream(4, 'B → A', 3, q4, qp4, G4, L4)

  const mixB = mixed('Arm B (4+6)', [4, 6], [{ q: q4, L: L4 }, { q: q6, L: L6 }])

  const streams = [s7, s6, s4]
  const los = worstLOS([...streams.map(s => s.levelOfService), mixB.levelOfService])
  return { streams, mixedLanes: [mixB], overallLevelOfService: los }
}

// ── Kreuzung (4-armig) ────────────────────────────────────────────────────────
// Arm 0 = SN A (HS), Arm 1 = SN C (HS), Arm 2 = SN B (NS), Arm 3 = SN D (NS)
// v   = PWE/h  → für Auslastungsgrad, Reserve, Wartezeit
// raw = Fz/h   → für qpi in G-Funktionen (Abb. 2, x-Achse = Fz/h)

function kreuzung(v: number[][], raw: number[][], flags: SN640022LaneFlags): SN640022Result {
  // PWE/h — analysierte Ströme (Auslastungsgrad, Reserve, Wartezeit)
  const q1  = v[0][3]
  const q7  = v[1][2]
  const q4  = v[2][0], q5  = v[2][3], q6  = v[2][1]
  const q10 = v[3][1], q11 = v[3][2], q12 = v[3][0]
  // Fz/h — Konfliktvolumen für G-Funktionen (Abb. 2, x-Achse = Fz/h)
  const r1 = raw[0][3], r2 = raw[0][1], r3 = raw[0][2]
  const r7 = raw[1][2], r8 = raw[1][0], r9 = raw[1][3]
  const r5 = raw[2][3], r6 = raw[2][1]
  const r11= raw[3][2], r12= raw[3][0]

  const r3f = flags.armASeparateLane   ? 0 : r3
  const r9f = flags.armCSeparateLane   ? 0 : r9
  const r2r = flags.armAQ2Override     ?? r2   // Override bereits in Fz/h
  const r8r = flags.armCQ8Override     ?? r8   // Override bereits in Fz/h
  const r3g = flags.armATriangleIsland ? 0 : r3
  const r9g = flags.armCTriangleIsland ? 0 : r9
  const r6g = flags.armBRightIsland    ? 0 : r6
  const r12g= flags.armDRightIsland    ? 0 : r12

  // Rang 2
  const qp1 = r8 + r9g;              const G1  = gMainLeft(qp1);   const L1  = G1
  const qp7 = r2 + r3g;              const G7  = gMainLeft(qp7);   const L7  = G7
  const qp6 = r2r + 0.5 * r3f;      const G6  = gSideRight(qp6);  const L6  = G6
  const qp12= r8r + 0.5 * r9f;      const G12 = gSideRight(qp12); const L12 = G12
  const s1  = makeStream(1,  'A → D', 2, q1,  qp1,  G1,  L1)
  const s7  = makeStream(7,  'C → B', 2, q7,  qp7,  G7,  L7)
  const s6  = makeStream(6,  'B → C', 2, q6,  qp6,  G6,  L6)
  const s12 = makeStream(12, 'D → A', 2, q12, qp12, G12, L12)

  // Rang 3
  const p01 = p0(q1, L1); const p07 = p0(q7, L7); const px = p01 * p07
  const qp5 = r2 + 0.5*r3f + r8 + r9g + r1 + r7
  const G5  = gSideCross(qp5); const L5  = px * G5
  const qp11= r8 + 0.5*r9f + r2 + r3g + r1 + r7
  const G11 = gSideCross(qp11); const L11 = px * G11
  const s5  = makeStream(5,  'B → D', 3, q5,  qp5,  G5,  L5)
  const s11 = makeStream(11, 'D → B', 3, q11, qp11, G11, L11)

  // Rang 4
  const Py11 = px * p0(q11, L11); const pz11 = pz(Py11)
  const p012 = p0(q12, L12)
  const qp4  = r2 + 0.5*r3f + r8 + r1 + r7 + r12g + r11
  const G4   = gSideLeft(qp4); const L4  = pz11 * p012 * G4

  const Py5  = px * p0(q5, L5);  const pz5 = pz(Py5)
  const p06  = p0(q6, L6)
  const qp10 = r8 + 0.5*r9f + r2 + r1 + r7 + r6g + r5
  const G10  = gSideLeft(qp10); const L10 = pz5 * p06 * G10

  const s4  = makeStream(4,  'B → A', 4, q4,  qp4,  G4,  L4)
  const s10 = makeStream(10, 'D → C', 4, q10, qp10, G10, L10)

  // Mischstreifen [F21]
  const mixBstreams = flags.mixedB === 'leftAndThrough'  ? [{ q: q4, L: L4 }, { q: q5, L: L5 }]
                    : flags.mixedB === 'throughAndRight' ? [{ q: q5, L: L5 }, { q: q6, L: L6 }]
                    : [{ q: q4, L: L4 }, { q: q5, L: L5 }, { q: q6, L: L6 }]
  const mixBnums    = flags.mixedB === 'leftAndThrough'  ? [4, 5]
                    : flags.mixedB === 'throughAndRight' ? [5, 6]
                    : [4, 5, 6]
  const mixDstreams = flags.mixedD === 'leftAndThrough'  ? [{ q: q10, L: L10 }, { q: q11, L: L11 }]
                    : flags.mixedD === 'throughAndRight' ? [{ q: q11, L: L11 }, { q: q12, L: L12 }]
                    : [{ q: q10, L: L10 }, { q: q11, L: L11 }, { q: q12, L: L12 }]
  const mixDnums    = flags.mixedD === 'leftAndThrough'  ? [10, 11]
                    : flags.mixedD === 'throughAndRight' ? [11, 12]
                    : [10, 11, 12]

  const mixB = mixed(`Arm B (${mixBnums.join('+')})`, mixBnums, mixBstreams)
  const mixD = mixed(`Arm D (${mixDnums.join('+')})`, mixDnums, mixDstreams)

  const streams = [s1, s7, s6, s12, s5, s11, s4, s10]
  const los = worstLOS([...streams.map(s => s.levelOfService), mixB.levelOfService, mixD.levelOfService])
  return { streams, mixedLanes: [mixB, mixD], overallLevelOfService: los }
}

// ── Öffentliche API ───────────────────────────────────────────────────────────

/**
 * Berechnet einen Knoten nach SN 640 022.
 * @param volumes    volumes[i][j] = Verkehrsstärke [PWE/h] — für Auslastung, Reserve, Wartezeit
 *   Arm 0=SN A (HS links), 1=SN C (HS rechts), 2=SN B (NS unten), 3=SN D (NS oben)
 * @param flags      Geometrie-Flags (Fussnoten 1–4, Mischstreifen-Kombination)
 * @param rawVolumes rawVolumes[i][j] = Verkehrsstärke [Fz/h] — für qpi in G-Funktionen (Abb. 2).
 *   Wenn nicht angegeben, wird volumes verwendet (Fallback: f=1,0, kein Unterschied).
 */
export function analyzeSN640022(
  volumes: number[][],
  flags: SN640022LaneFlags = {
    mixedB: 'all', mixedD: 'all',
    armASeparateLane: false, armCSeparateLane: false,
    armAQ2Override: undefined, armCQ8Override: undefined,
    armATriangleIsland: false, armCTriangleIsland: false,
    armBRightIsland: false, armDRightIsland: false,
  },
  rawVolumes?: number[][]
): SN640022Result | null {
  const raw = rawVolumes ?? volumes
  if (volumes.length === 3) return einmuendung(volumes, raw, flags)
  if (volumes.length === 4) return kreuzung(volumes, raw, flags)
  return null
}
