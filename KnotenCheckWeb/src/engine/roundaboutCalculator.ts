// VSS SN 640 024a — Knoten mit Kreisverkehr
// Typ 2/2: VSS-Forschungsauftrag 2005/301 (Ergänzung zu SN 640 024a)

import type { LevelOfService } from './types'
import { classifyDelayLOS, worstLOS } from './levelOfService'

export type RoundaboutType = '1/1' | '2/1+' | '2/2'

export type { LevelOfService }

// ── Tab. 2 (SN 640 024a, S. 9): PW-Äquivalente ────────────────────────────────
// Verkehrsmischung + Längsneigung. Zwei Betrachtungen:
//  • pauschal     → Spalte «Motorfahrzeuge» (RB_PCE_MOTOR)
//  • detailliert  → kategorienweise (RB_PCE_CAT), gewichtetes Mittel über die Anteile
// Ring (Kreiselfahrbahn) immer bei ±0 % Neigung.
export type GradientPCE = '+4%' | '+2%' | '±0%' | '-2%' | '-4%'

// Pauschalspalte «Motorfahrzeuge» (ohne Fahrrad/Mofa)
export const RB_PCE_MOTOR: Record<GradientPCE, number> = {
  '+4%': 1.7, '+2%': 1.4, '±0%': 1.1, '-2%': 1.0, '-4%': 0.9,
}

// Kategorienweise Faktoren je Neigung. Fahrrad/Mofa (fFR) nur bei ±0 % definiert.
export const RB_PCE_CAT: Record<GradientPCE, {
  fFR?: number; fMR: number; fPW: number; fLW: number; fLZ: number
}> = {
  '+4%': { fMR: 0.7, fPW: 1.4, fLW: 3.0, fLZ: 6.0 },
  '+2%': { fMR: 0.6, fPW: 1.2, fLW: 2.0, fLZ: 3.0 },
  '±0%': { fFR: 0.5, fMR: 0.5, fPW: 1.0, fLW: 1.5, fLZ: 2.0 },
  '-2%': { fMR: 0.4, fPW: 0.9, fLW: 1.2, fLZ: 1.5 },
  '-4%': { fMR: 0.3, fPW: 0.8, fLW: 1.0, fLZ: 1.2 },
}

// Detaillierte Verkehrsmischung [%]; PW = Rest (100 − übrige)
export interface RbVehicleMix {
  pctFR: number  // Fahrrad/Mofa (nur ±0 %)
  pctMR: number  // Motorrad
  pctLW: number  // Lastwagen/Bus
  pctLZ: number  // Lastzüge
}

// PW-Äquivalentfaktor f der Einfahrt: ohne mix → pauschal (Motorfahrzeuge),
// mit mix → gewichtetes Mittel der Kategorienfaktoren bei gegebener Neigung.
export function entryFactor(gradient: GradientPCE, mix?: RbVehicleMix): number {
  if (!mix) return RB_PCE_MOTOR[gradient]
  const c = RB_PCE_CAT[gradient]
  const fFR = c.fFR ?? 0
  const pctPW = Math.max(0, 100 - mix.pctFR - mix.pctMR - mix.pctLW - mix.pctLZ)
  const tot = pctPW + mix.pctFR + mix.pctMR + mix.pctLW + mix.pctLZ
  if (tot <= 0) return RB_PCE_MOTOR[gradient]
  return (c.fPW * pctPW + fFR * mix.pctFR + c.fMR * mix.pctMR
          + c.fLW * mix.pctLW + c.fLZ * mix.pctLZ) / tot
}

// PW-Äquivalentfaktor der Kreiselfahrbahn — immer bei ±0 % Neigung (Norm S. 9).
export function ringFactor(mix?: RbVehicleMix): number {
  return entryFactor('±0%', mix)
}

// ── f_F Lookup-Tabellen (Abb. 3 und Abb. 4) ──────────────────────────────────
// Abb. 3, SN 640 024a — abgelesen aus Diagramm
// FG=0 → f_F=1.0 (kein Einfluss) wird vor der Interpolation abgefangen

const FF_1_1: Record<number, [number, number][]> = {
  100: [[0, 0.99], [800, 0.99], [900, 1.00]],
  200: [[0, 0.93], [100, 0.935], [200, 0.94], [300, 0.945], [400, 0.95],
        [500, 0.955], [600, 0.96], [700, 0.965], [800, 0.97], [900, 1.00]],
  300: [[0, 0.87], [100, 0.875], [200, 0.88], [300, 0.89], [400, 0.90],
        [500, 0.92], [600, 0.93], [700, 0.95], [800, 0.97], [900, 1.00]],
  400: [[0, 0.81], [100, 0.82], [200, 0.83], [300, 0.84], [400, 0.86],
        [500, 0.88], [600, 0.90], [700, 0.95], [800, 0.96], [900, 1.00]],
}

const FF_2_1PLUS: Record<number, [number, number][]> = {
  100: [[0, 0.89], [200, 0.90], [400, 0.93], [600, 0.95], [800, 0.97], [900, 1.00]],
  200: [[0, 0.86], [200, 0.87], [400, 0.89], [600, 0.91], [800, 0.94], [900, 0.95], [1000, 0.96], [1200, 1.00]],
  300: [[0, 0.83], [200, 0.84], [400, 0.86], [600, 0.87], [800, 0.90], [900, 0.92], [1000, 0.93], [1200, 0.96], [1400, 1.00]],
  400: [[0, 0.80], [200, 0.81], [400, 0.82], [600, 0.84], [800, 0.86], [900, 0.87], [1000, 0.88], [1200, 0.92], [1400, 0.95]],
}

// Stückweise lineare Interpolation einer [x, y]-Tabelle
function lerpPoints(pts: [number, number][], x: number): number {
  if (x <= pts[0][0]) return pts[0][1]
  if (x >= pts[pts.length - 1][0]) return pts[pts.length - 1][1]
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i]
    const [x1, y1] = pts[i + 1]
    if (x <= x1) return y0 + (x - x0) / (x1 - x0) * (y1 - y0)
  }
  return pts[pts.length - 1][1]
}

// Bilineare Interpolation in der FG-Dimension (Abb. 3 / Abb. 4)
// Typ 2/2: f_F konnte in der Forschungsarbeit 2005/301 nicht ermittelt werden
// (zu wenig Fussgänger an Untersuchungsstandorten) → Abb.-4-Kurven der Norm
// für 2-streifige Einfahrten (FF_2_1PLUS) werden analog verwendet.
export function correctionFactorFF(type: RoundaboutType, fg: number, qk: number): number {
  if (fg <= 0) return 1.0
  const table = type === '1/1' ? FF_1_1 : FF_2_1PLUS
  const keys = Object.keys(table).map(Number).sort((a, b) => a - b)

  if (fg <= keys[0]) return lerpPoints(table[keys[0]], qk)
  if (fg >= keys[keys.length - 1]) return lerpPoints(table[keys[keys.length - 1]], qk)

  for (let i = 0; i < keys.length - 1; i++) {
    const k0 = keys[i], k1 = keys[i + 1]
    if (fg <= k1) {
      const v0 = lerpPoints(table[k0], qk)
      const v1 = lerpPoints(table[k1], qk)
      return v0 + (fg - k0) / (k1 - k0) * (v1 - v0)
    }
  }
  return lerpPoints(table[keys[keys.length - 1]], qk)
}

// ── Grenzleistungsfähigkeit L_E ───────────────────────────────────────────────
// 1/1, 2/1+: linear nach SN 640 024a Abb. 6 (gültig Q_K ≤ 1400 bzw. ≤ 2000)
// 2/2:       exponentiell nach VSS 2005/301 Abb. 4.25: Q_E = 1639.9·e^(−0.0006·Q_K)
//            (Q_K > 1800 datenarm; setzt gleichmässige Fahrstreifenbelastung ±10 % voraus)
export function basicCapacity(type: RoundaboutType, qk: number): number {
  if (type === '1/1')  return Math.max(0, 1141 - 0.578 * qk)
  if (type === '2/1+') return Math.max(0, 1455 - 0.537 * qk)
  return Math.max(0, 1639.9 * Math.exp(-0.0006 * qk))
}

// ── Ausfahrtsleistungsfähigkeit L_A — Abb. 5, SN 640 024a (Ziffer 10) ────────
// L_A,MAX = 1400 PWE/h (ohne Fussgänger); querende Fussgänger reduzieren sie,
// abhängig von der Ausfahrtsbreite B (3.5 m bzw. 4.5 m, Fussgängerstreifenlänge).
// Stützpunkte aus Abb. 5 abgelesen (Schritt 50 FG/h). Die 3.5-m-Kurve deckt sich mit
// Tab. 5 des Anwendungsbeispiels (FG 100→1310, 300→1160, 0→1400; FG 250→1195 ggü.
// gedruckt 1190, innerhalb Ablesetoleranz).
const LA_TABLE_3_5: [number, number][] = [
  [0, 1400], [50, 1355], [100, 1310], [150, 1270], [200, 1230],
  [250, 1195], [300, 1160], [350, 1130], [400, 1095],
]
const LA_TABLE_4_5: [number, number][] = [
  [0, 1400], [50, 1340], [100, 1280], [150, 1240], [200, 1190],
  [250, 1140], [300, 1100], [350, 1055], [400, 1020],
]
export function exitCapacity(fg: number, wide = false): number {
  return lerpPoints(wide ? LA_TABLE_4_5 : LA_TABLE_3_5, Math.max(0, fg))
}

// ── Ausfahrtsvolumen Q_A aus Abbiegeströmen (Umkehrung von Abb. 10) ──────────
// Q_A[j] = Summe aller Bewegungen, die an Arm j ausfahren. Erhält die Einheit
// der Eingabe-Arrays (Fz/h oder PWE/h, falls bereits gewichtet übergeben).
//   right[i]    → fährt an Arm (i+1) aus
//   straight[i] → fährt an Arm (i+2) aus   (nur 4-Arm)
//   left[i]     → fährt an Arm (i+3) bzw. (i+2) aus   (4-/3-Arm)
export function computeQAfromTurnings(
  rights: number[], straights: number[], lefts: number[], armCount: 3 | 4
): number[] {
  const n = armCount
  return Array.from({ length: n }, (_, j) =>
    n === 4
      ? rights[(j - 1 + n) % n] + straights[(j - 2 + n) % n] + lefts[(j - 3 + n) % n]
      : rights[(j - 1 + n) % n] + lefts[(j - 2 + n) % n]
  )
}

// ── Wartezeit — Abb. 7 (Ref. [10] = Kimber & Hollis 1979) ────────────────────
// Formel: Brilon (2008), TRR 2071, Gl. 9 (Fall D2+A2) + Bedienzeit 3600/L,
// T = 1.0 h — wie beim SN-640-022-Rechner (dort per Abb.-4-Ablesung verifiziert)
export function entryDelay(qe: number, capacity: number): number {
  if (capacity <= 0) return Infinity
  const a = qe / capacity
  if (a >= 1) return Infinity
  const T  = 1.0
  const t0 = 3600 / capacity
  const inner = (a - 1) ** 2 + t0 * a / (450 * T)
  return t0 + 900 * T * ((a - 1) + Math.sqrt(inner))
}

// ── LOS-Klassierung (Tab. 3, SN 640 024a) ─────────────────────────────────────
// F = Overflow (x ≥ 1, Zufluss > Kapazität), sonst nach Delay-Schwellen
export const levelOfService = classifyDelayLOS

// ── Ergebnistypen ─────────────────────────────────────────────────────────────

export interface EntryResult {
  armIndex: number
  qe: number               // Einfahrtsbelastung [PWE/h]
  qk: number               // Kreisfahrbahnbelastung [PWE/h]
  fg: number               // Fussgängerbelastung [FG/h]
  fF: number               // Korrekturfaktor
  leBase: number           // L_E ohne f_F [PWE/h]
  capacity: number         // L_E mit f_F [PWE/h]
  reserve: number          // R = L_E - Q_E [PWE/h]
  utilizationDegree: number // x = Q_E / L_E
  delay: number            // w [s]
  levelOfService: LevelOfService
}

export interface ExitResult {
  armIndex: number
  qa: number                // Ausfahrtsvolumen [PWE/h]
  fg: number                // Fussgängerbelastung [FG/h]
  capacity: number          // L_A [PWE/h]
  utilizationDegree: number // X = Q_A / L_A
  overloaded: boolean       // Q_A > L_A → andere Knotenform suchen
}

export interface RoundaboutResult {
  type: RoundaboutType
  entries: EntryResult[]
  exits: ExitResult[]
  exitOverload: boolean     // mind. eine Ausfahrt überlastet (Q_A > L_A)
  overallLevelOfService: LevelOfService
}

// ── Hauptberechnung ───────────────────────────────────────────────────────────
// Q_K wird direkt eingegeben (kommt aus Verkehrsmodell / OD-Umlegung)

export interface RoundaboutInput {
  type: RoundaboutType
  qe: number[]   // Einfahrtsvolumen [PWE/h]
  qk: number[]   // Kreisfahrbahnbelastung je Einfahrt [PWE/h]
  fg: number[]   // Fussgängerbelastung je Einfahrt [FG/h]
  qa?: number[]      // Ausfahrtsvolumen [PWE/h] — für Ausfahrten-Check (Ziffer 10)
  exitWide?: boolean[]  // Ausfahrtsbreite 4.5 m statt 3.5 m je Arm
}

export function calculateRoundabout(input: RoundaboutInput): RoundaboutResult {
  const { type, qe, qk, fg, qa, exitWide } = input

  const entries: EntryResult[] = qe.map((q, i) => {
    const fF          = correctionFactorFF(type, fg[i], qk[i])
    const leBase      = basicCapacity(type, qk[i])
    const capacity    = leBase * fF
    const reserve     = capacity - q
    const x           = capacity > 0 ? q / capacity : Infinity
    const delay       = entryDelay(q, capacity)
    const los         = levelOfService(delay)
    return { armIndex: i, qe: q, qk: qk[i], fg: fg[i], fF, leBase, capacity, reserve, utilizationDegree: x, delay, levelOfService: los }
  })

  // Ausfahrten-Check (Ziffer 10, Abb. 5): Q_A(i) ≤ L_A(i) an allen Ausfahrten
  const exits: ExitResult[] = (qa ?? []).map((q, i) => {
    const capacity = exitCapacity(fg[i], exitWide?.[i] ?? false)
    const xa       = capacity > 0 ? q / capacity : Infinity
    return { armIndex: i, qa: q, fg: fg[i], capacity, utilizationDegree: xa, overloaded: q > capacity }
  })

  return {
    type, entries, exits,
    exitOverload: exits.some(e => e.overloaded),
    overallLevelOfService: worstLOS(entries.map(e => e.levelOfService)),
  }
}

// ── Hilfsfunktion: Q_K aus OD-Matrix (bekannter Startwert Q_K[0]) ─────────────
// Formel: Q_K(i) = Q_K(i-1) + Q_E(i-1) - Q_A(i)
// Hinweis: Q_K[0] ist ein freier Parameter — muss aus dem Verkehrsmodell bekannt sein
export function computeQKfromOD(qe: number[], qa: number[], qk0: number): number[] {
  const n = qe.length
  const qk = new Array<number>(n)
  qk[0] = qk0
  for (let i = 1; i < n; i++) {
    qk[i] = qk[i - 1] + qe[i - 1] - qa[i]
  }
  return qk
}

// ── Q_K aus Abbiegeströmen (Abb. 10, SN 640 024a S. 10) ──────────────────────
// Einheit: Fz/h — Caller multipliziert mit PCE_RING für PWE/h
// rights[i]    = 1. Ausfahrt (Rechtsabbieger) von Arm i
// straights[i] = 2. Ausfahrt (Geradeaus)     von Arm i  [4-Arm: belegt, 3-Arm: ignoriert]
// lefts[i]     = 3. Ausfahrt (Linksabbieger)  von Arm i
//
// Herleitung: Ring-Querschnitt vor Arm i enthält Fz, die noch nicht ausgefahren sind:
//   4-Arm: Q_K[i] = straight[i-1] + left[i-1] + left[i-2]   (mod 4)
//   3-Arm: Q_K[i] = left[i-1]                                (mod 3)
export function computeQKfromTurnings(
  _rights: number[], straights: number[], lefts: number[], armCount: 3 | 4
): number[] {
  const n = armCount
  return Array.from({ length: n }, (_, i) => {
    const p1 = (i - 1 + n) % n
    const p2 = (i - 2 + n) % n
    return n === 4
      ? straights[p1] + lefts[p1] + lefts[p2]
      : lefts[p1]
  })
}
