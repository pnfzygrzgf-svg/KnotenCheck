// SN 640 022 Hauptrechner
// Port von SN640022Calculator.swift — alle Formeln F1–F21

import { classifyLOS, worstLOS } from './levelOfService'
import { delay } from './calculators'
import type {
  SN640022Result, SN640022StreamResult, SN640022MixedResult,
  SN640022LaneFlags, LevelOfService
} from './types'

// ── Grundleistungsfähigkeit G_i (Abb. 2, SN 640 022) ─────────────────────────
// Exponentialfit an Normkurven inkl. CH-Erhöhung +90 PWE/h

function gMainLeft(qpi: number):  number { return Math.max(0, 1486 * Math.exp(-0.001104 * qpi)) }
function gSideRight(qpi: number): number { return Math.max(0, 1232 * Math.exp(-0.001205 * qpi)) }
function gSideCross(qpi: number): number { return Math.max(0,  791 * Math.exp(-0.000829 * qpi)) }
function gSideLeft(qpi: number):  number { return Math.max(0, 1019 * Math.exp(-0.001166 * qpi)) }

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

// ── Wartezeit ─────────────────────────────────────────────────────────────────
function w(q: number, L: number): number {
  if (L <= 0 || q <= 0) return 0
  const a = q / L
  if (a >= 1) return Infinity
  return delay(a, q)
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

function einmuendung(v: number[][], flags: SN640022LaneFlags): SN640022Result {
  const q2 = v[0][1], q3 = v[0][2]
  const q8 = v[1][0], q7 = v[1][2]
  const q4 = v[2][0], q6 = v[2][1]

  const q3f = flags.armASeparateLane   ? 0 : q3
  const q2r = flags.armAQ2Override     ?? q2
  const q3g = flags.armATriangleIsland ? 0 : q3

  // Rang 2
  const qp7 = q2 + q3g;           const G7 = gMainLeft(qp7);   const L7 = G7
  const qp6 = q2r + 0.5 * q3f;   const G6 = gSideRight(qp6);  const L6 = G6
  const s7 = makeStream(7, 'C → B', 2, q7, qp7, G7, L7)
  const s6 = makeStream(6, 'B → C', 2, q6, qp6, G6, L6)

  // Rang 3
  const p07 = p0(q7, L7)
  const qp4 = q2 + 0.5 * q3f + q8 + q7
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

function kreuzung(v: number[][], flags: SN640022LaneFlags): SN640022Result {
  const q1 = v[0][3], q2 = v[0][1], q3 = v[0][2]
  const q7 = v[1][2], q8 = v[1][0], q9 = v[1][3]
  const q4 = v[2][0], q5 = v[2][3], q6 = v[2][1]
  const q10= v[3][1], q11= v[3][2], q12= v[3][0]

  const q3f = flags.armASeparateLane   ? 0 : q3
  const q9f = flags.armCSeparateLane   ? 0 : q9
  const q2r = flags.armAQ2Override     ?? q2
  const q8r = flags.armCQ8Override     ?? q8
  const q3g = flags.armATriangleIsland ? 0 : q3
  const q9g = flags.armCTriangleIsland ? 0 : q9
  const q6g = flags.armBRightIsland    ? 0 : q6
  const q12g= flags.armDRightIsland    ? 0 : q12

  // Rang 2
  const qp1 = q8 + q9g;              const G1  = gMainLeft(qp1);   const L1  = G1
  const qp7 = q2 + q3g;              const G7  = gMainLeft(qp7);   const L7  = G7
  const qp6 = q2r + 0.5 * q3f;      const G6  = gSideRight(qp6);  const L6  = G6
  const qp12= q8r + 0.5 * q9f;      const G12 = gSideRight(qp12); const L12 = G12
  const s1  = makeStream(1,  'A → D', 2, q1,  qp1,  G1,  L1)
  const s7  = makeStream(7,  'C → B', 2, q7,  qp7,  G7,  L7)
  const s6  = makeStream(6,  'B → C', 2, q6,  qp6,  G6,  L6)
  const s12 = makeStream(12, 'D → A', 2, q12, qp12, G12, L12)

  // Rang 3
  const p01 = p0(q1, L1); const p07 = p0(q7, L7); const px = p01 * p07
  const qp5 = q2 + 0.5*q3f + q8 + q9g + q1 + q7
  const G5  = gSideCross(qp5); const L5  = px * G5
  const qp11= q8 + 0.5*q9f + q2 + q3g + q1 + q7
  const G11 = gSideCross(qp11); const L11 = px * G11
  const s5  = makeStream(5,  'B → D', 3, q5,  qp5,  G5,  L5)
  const s11 = makeStream(11, 'D → B', 3, q11, qp11, G11, L11)

  // Rang 4
  const Py11 = px * p0(q11, L11); const pz11 = pz(Py11)
  const p012 = p0(q12, L12)
  const qp4  = q2 + 0.5*q3f + q8 + q1 + q7 + q12g + q11
  const G4   = gSideLeft(qp4); const L4  = pz11 * p012 * G4

  const Py5  = px * p0(q5, L5);  const pz5 = pz(Py5)
  const p06  = p0(q6, L6)
  const qp10 = q8 + 0.5*q9f + q2 + q1 + q7 + q6g + q5
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
 * @param volumes volumes[i][j] = Verkehrsstärke von Arm i nach Arm j [Fz/h als PWE]
 *   Arm 0=SN A (HS links), 1=SN C (HS rechts), 2=SN B (NS unten), 3=SN D (NS oben)
 * @param flags   Geometrie-Flags (Fussnoten 1–4, Mischstreifen-Kombination)
 */
export function analyzeSN640022(
  volumes: number[][],
  flags: SN640022LaneFlags = {
    mixedB: 'all', mixedD: 'all',
    armASeparateLane: false, armCSeparateLane: false,
    armAQ2Override: undefined, armCQ8Override: undefined,
    armATriangleIsland: false, armCTriangleIsland: false,
    armBRightIsland: false, armDRightIsland: false,
  }
): SN640022Result | null {
  if (volumes.length === 3) return einmuendung(volumes, flags)
  if (volumes.length === 4) return kreuzung(volumes, flags)
  return null
}
