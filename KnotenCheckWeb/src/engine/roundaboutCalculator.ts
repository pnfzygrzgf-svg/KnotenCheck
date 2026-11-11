// VSS SN 640 024a — Knoten mit Kreisverkehr
// Typ 2/2: VSS-Forschungsauftrag 2005/301 (Ergänzung zu SN 640 024a)

import type { LevelOfService } from './types'
import { classifyDelayLOS, worstLOS } from './levelOfService'

export type RoundaboutType = '1/1' | '2/1+' | '2/2'
export const ROUNDABOUT_TYPES: readonly RoundaboutType[] = ['1/1', '2/1+', '2/2']

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

/** Anwendungsgrenzen der VSS 40 024a (Ziffer 1 und 5, S. 3) */
export const KREISEL_GRENZEN = 'Gilt nicht für Kreisel mit Rechtsvortritt, Tram- oder Bahnquerung, Lichtsignalen an Zufahrten, Fussgängerstreifen zur Mittelinsel, ' +
  'Verflechtungen, für Doppelkreisel und stark ovale Formen (Ziffer 5, Seite 3). Vorausgesetzt ist, dass kein Rückstau vom Nachbarknoten die Kreiselfahrbahn ' +
  'blockiert (Ziffer 1, Seite 3). Zweistreifig markierte Kreiselfahrbahnen rechnet der Rechner nach VSS 2005/301 (Typ 2/2).'

// Mischung passend zur Neigung: Fahrräder gibt es nur bei ±0 % (Tabelle 2, Seite 9). Bei anderer Neigung hat ihr Anteil keinen Faktor
// und zählte als Verkehr ohne Belastung; er wird darum auf 0 gesetzt. ohneFR nennt den entfernten Anteil [%], 0 ohne Änderung
export function mixZurNeigung(mix: RbVehicleMix | undefined, gradient: GradientPCE | null): { mix: RbVehicleMix | undefined; ohneFR: number } {
  if (!mix || !(mix.pctFR > 0) || gradient === null || gradient === '±0%') return { mix, ohneFR: 0 }
  return { mix: { ...mix, pctFR: 0 }, ohneFR: mix.pctFR }
}

// PW-Äquivalentfaktor der Kreiselfahrbahn — immer bei ±0 % Neigung (Norm S. 9).
export function ringFactor(mix?: RbVehicleMix): number {
  return entryFactor('±0%', mix)
}

// ── f_F Lookup-Tabellen (Abb. 3 und Abb. 4, SN 640 024a S. 10) ───────────────
// Stützpunkte im Abstand 100 PWE/h aus den Vektorkurven der Norm-PDF ausgelesen
// (Abweichung zur Kurve ≤ 0,002). Die Kurven enden bei f_F = 1,00 (Abb. 3: Q_K = 900).
// FG=0 → f_F=1.0 (kein Einfluss); zwischen 0 und 100 FG/h linear zur 100er-Kurve.
// Die Diagramme (auch Abb. 5) reichen bis 400 FG/h; darüber wird mit der
// 400er-Kurve gerechnet und das Resultat als ausserhalb des Normbereichs markiert.
export const FG_MAX_NORM = 400

const FF_1_1: Record<number, [number, number][]> = {
  100: [[0, 0.99], [800, 0.99], [900, 1.00]],
  200: [[0, 0.932], [100, 0.935], [200, 0.94], [300, 0.945], [400, 0.95],
        [500, 0.956], [600, 0.961], [700, 0.97], [800, 0.98], [900, 1.00]],
  300: [[0, 0.871], [100, 0.875], [200, 0.882], [300, 0.89], [400, 0.90],
        [500, 0.913], [600, 0.93], [700, 0.95], [800, 0.97], [900, 1.00]],
  400: [[0, 0.809], [100, 0.82], [200, 0.83], [300, 0.843], [400, 0.86],
        [500, 0.88], [600, 0.903], [700, 0.93], [800, 0.96], [900, 1.00]],
}

const FF_2_1PLUS: Record<number, [number, number][]> = {
  100: [[0, 0.89], [100, 0.895], [200, 0.901], [300, 0.91], [400, 0.922],
        [500, 0.935], [600, 0.95], [700, 0.965], [800, 0.981], [900, 1.00]],
  200: [[0, 0.86], [100, 0.866], [200, 0.872], [300, 0.881], [400, 0.89], [500, 0.90], [600, 0.911],
        [700, 0.925], [800, 0.939], [900, 0.953], [1000, 0.968], [1100, 0.984], [1200, 1.00]],
  300: [[0, 0.83], [100, 0.836], [200, 0.842], [300, 0.85], [400, 0.859], [500, 0.868], [600, 0.878],
        [700, 0.889], [800, 0.902], [900, 0.915], [1000, 0.93], [1100, 0.946], [1200, 0.963],
        [1300, 0.981], [1400, 1.00]],
  400: [[0, 0.80], [100, 0.805], [200, 0.811], [300, 0.817], [400, 0.824], [500, 0.832], [600, 0.84],
        [700, 0.849], [800, 0.86], [900, 0.872], [1000, 0.885], [1100, 0.899], [1200, 0.914],
        [1300, 0.932], [1400, 0.95]],
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

// Bilineare Interpolation in der FG-Dimension (Abb. 3 / Abb. 4, S. 10)
// Typ 2/2: f_F konnte in der Forschungsarbeit 2005/301 nicht ermittelt werden
// (zu wenig Fussgänger an Untersuchungsstandorten) → Abb.-4-Kurven der Norm
// für 2-streifige Einfahrten (FF_2_1PLUS) werden analog verwendet.
export function correctionFactorFF(type: RoundaboutType, fg: number, qk: number): number {
  if (fg <= 0) return 1.0
  const table = type === '1/1' ? FF_1_1 : FF_2_1PLUS
  const keys = Object.keys(table).map(Number).sort((a, b) => a - b)

  // 0 < FG < 100: linear zwischen f_F = 1 (keine Fussgänger) und der 100er-Kurve
  if (fg < keys[0]) return 1 + fg / keys[0] * (lerpPoints(table[keys[0]], qk) - 1)
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
// 1/1, 2/1+: linear nach SN 640 024a Abb. 6, S. 12 (gültig Q_K ≤ 1400 bzw. ≤ 2000)
// 2/2:       exponentiell nach VSS 2005/301 Abb. 4.25, S. 55: Q_E = 1639.9·e^(−0.0006·Q_K)
//            (Q_K > 1800 datenarm; setzt gleichmässige Fahrstreifenbelastung ±10 % voraus)
// Gültigkeitsbereich der Bemessungszusammenhänge: SN 640 024a Abb. 6 (S. 12) gibt
// 0 ≤ Q_K ≤ 1400 (1/1) bzw. ≤ 2000 (2/1+) an; die 2/2-Kurve ist nach VSS 2005/301
// bei Q_K > 1800 PWE/h statistisch nicht abgestützt. Darüber wird extrapoliert
// und das Resultat markiert.
export const QK_MAX_NORM: Record<RoundaboutType, number> = { '1/1': 1400, '2/1+': 2000, '2/2': 1800 }

export function basicCapacity(type: RoundaboutType, qk: number): number {
  if (type === '1/1')  return Math.max(0, 1141 - 0.578 * qk)
  if (type === '2/1+') return Math.max(0, 1455 - 0.537 * qk)
  return Math.max(0, 1639.9 * Math.exp(-0.0006 * qk))
}

// ── Ausfahrtsleistungsfähigkeit L_A — Abb. 5, SN 640 024a (Ziffer 10, S. 11) ─
// L_A,MAX = 1400 PWE/h (ohne Fussgänger); querende Fussgänger reduzieren sie,
// abhängig von der Ausfahrtsbreite B (3.5 m bzw. 4.5 m, Fussgängerstreifenlänge).
// Stützpunkte aus den Vektorkurven der Norm-PDF ausgelesen (Schritt 50 FG/h). Tab. 5
// (S. 19) ist vom Diagramm abgelesen: FG 100→1310, 250→1190, 300→1160, Kurve 1309, 1193, 1159.
const LA_TABLE_3_5: [number, number][] = [
  [0, 1400], [50, 1353], [100, 1309], [150, 1268], [200, 1229],
  [250, 1193], [300, 1159], [350, 1126], [400, 1095],
]
const LA_TABLE_4_5: [number, number][] = [
  [0, 1400], [50, 1340], [100, 1284], [150, 1233], [200, 1184],
  [250, 1139], [300, 1097], [350, 1057], [400, 1017],
]
export function exitCapacity(fg: number, wide = false): number {
  return lerpPoints(wide ? LA_TABLE_4_5 : LA_TABLE_3_5, Math.max(0, fg))
}

// Ausfahrten an zweistreifigen Kreiseln: VSS 2005/301 Ziffer 5.2.3 (S. 64) gibt Richtwerte
// ohne Fussgänger: einstreifig 1700 Fz/h, zweistreifig 1850 Fz/h. Einen Abzug für Fussgänger
// nennt die Quelle nicht («einzeln abklären», Ziffer 4.2, S. 58), und SN 640 024a Ziffer 1
// (S. 3) schliesst zweistreifige Ausfahrten mit Fussgängerstreifen aus.
// Annahmen: Der Abzug folgt anteilig Abb. 5 (zweistreifig: 4,5-m-Kurve); die Richtwerte
// in Fz/h werden direkt mit Q_A in PWE/h verglichen.
export const LA_MAX_2_2 = { oneLane: 1700, twoLanes: 1850 } as const

export function exitCapacityFor(type: RoundaboutType, fg: number, wide = false, twoLanes = false): number {
  if (type !== '2/2') return exitCapacity(fg, wide)
  const base = twoLanes ? LA_MAX_2_2.twoLanes : LA_MAX_2_2.oneLane
  return base * exitCapacity(fg, wide || twoLanes) / exitCapacity(0)
}

// ── Ausfahrtsvolumen Q_A aus Abbiegeströmen (Umkehrung von Abb. 10, S. 18) ──────────
// Q_A[j] = Summe aller Bewegungen, die an Arm j ausfahren. Erhält die Einheit
// der Eingabe-Arrays (Fz/h oder PWE/h, falls bereits gewichtet übergeben).
// Im Rechner wie Q_K mit dem Ring-f der Herkunftsarme gewichtet (Werte bei 0 %): Ausfahrende kommen von der Kreiselfahrbahn
// (Ziffer 9.2, S. 8–9; Tab. 2, Fussnote 4, S. 9). Bis 11.11.2026 mit dem f der Einfahrt samt Neigung.
//   right[i]    → fährt an Arm (i+1) aus
//   straight[i] → fährt an Arm (i+2) aus   (nur 4-Arm)
//   left[i]     → fährt an Arm (i+3) bzw. (i+2) aus   (4-/3-Arm)
// uturns: Wender je Arm; sie verlassen den Kreisel an ihrem eigenen Arm (Ziffer 8.3, Seite 7: alle Knotenströme)
export function computeQAfromTurnings(
  rights: number[], straights: number[], lefts: number[], armCount: 3 | 4, uturns: number[] = [],
): number[] {
  const n = armCount
  return Array.from({ length: n }, (_, j) =>
    (n === 4
      ? rights[(j - 1 + n) % n] + straights[(j - 2 + n) % n] + lefts[(j - 3 + n) % n]
      : rights[(j - 1 + n) % n] + lefts[(j - 2 + n) % n]) + (uturns[j] ?? 0)
  )
}

// ── Wartezeit — Abb. 7, S. 15 (Ref. [10] = Kimber & Hollis 1979) ────────────────────
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

// ── LOS-Klassierung (Tab. 3, S. 14, SN 640 024a) ─────────────────────────────────────
// F = Overflow (x ≥ 1, Zufluss > Kapazität), sonst nach Delay-Schwellen
export const levelOfService = classifyDelayLOS

// ── Ergebnistypen ─────────────────────────────────────────────────────────────

export interface EntryResult {
  armIndex: number
  type: RoundaboutType     // Fahrstreifenanordnung dieser Einfahrt
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
  loaded: boolean          // Q_E > 0; ohne Einfahrtsverkehr keine QS (zählt nicht zur Gesamt-QS)
  fgOutOfRange: boolean    // FG > 400: ausserhalb Abb. 3–5 (S. 10–11), mit 400er-Kurve gerechnet
  qkOutOfRange: boolean    // Q_K über dem Gültigkeitsbereich der L_E-Formel (QK_MAX_NORM), extrapoliert
}

export interface ExitResult {
  armIndex: number
  type: RoundaboutType      // Typ des Arms: 2/2 prüft nach VSS 2005/301 (S. 64), sonst nach Abb. 5 (S. 11)
  twoLanes: boolean         // zweistreifige Ausfahrt (nur Typ 2/2)
  fgAssumed: boolean        // Typ 2/2 mit Fussgängern: L_A enthält den angenommenen Abzug
  qa: number                // Ausfahrtsvolumen [PWE/h]
  fg: number                // Fussgängerbelastung [FG/h]
  capacity: number          // L_A [PWE/h]
  utilizationDegree: number // X = Q_A / L_A
  overloaded: boolean       // Q_A > L_A → andere Knotenform suchen
}

export interface RoundaboutResult {
  entries: EntryResult[]
  exits: ExitResult[]
  exitOverload: boolean     // mind. eine Ausfahrt überlastet (Q_A > L_A)
  overallLevelOfService: LevelOfService
}

// ── Hauptberechnung ───────────────────────────────────────────────────────────
// Q_K wird direkt eingegeben (kommt aus Verkehrsmodell / OD-Umlegung)

export interface RoundaboutInput {
  // Fahrstreifenanordnung je Einfahrt (Ziffer 11, S. 12); ein einzelner Wert gilt für alle
  type: RoundaboutType | RoundaboutType[]
  qe: number[]   // Einfahrtsvolumen [PWE/h]
  qk: number[]   // Kreisfahrbahnbelastung je Einfahrt [PWE/h]
  fg: number[]   // Fussgängerbelastung je Einfahrt [FG/h]
  qa?: number[]      // Ausfahrtsvolumen [PWE/h] — für Ausfahrten-Check (Ziffer 10, S. 11)
  exitWide?: boolean[]  // Ausfahrtsbreite 4.5 m statt 3.5 m je Arm
  exitTwoLanes?: boolean[]  // zweistreifige Ausfahrt je Arm (nur Typ 2/2)
}

export function calculateRoundabout(input: RoundaboutInput): RoundaboutResult {
  const { qe, qk, fg, qa, exitWide, exitTwoLanes } = input
  const typeOf = (i: number): RoundaboutType =>
    Array.isArray(input.type) ? input.type[i] ?? input.type[0] : input.type

  const entries: EntryResult[] = qe.map((q, i) => {
    const type        = typeOf(i)
    const fF          = correctionFactorFF(type, fg[i], qk[i])
    const leBase      = basicCapacity(type, qk[i])
    const capacity    = leBase * fF
    const reserve     = capacity - q
    const loaded      = q > 0
    const x           = capacity > 0 ? q / capacity : (loaded ? Infinity : 0)
    // Ohne Einfahrtsverkehr wartet niemand: keine Wartezeit, QS nur Platzhalter
    const delay       = loaded ? entryDelay(q, capacity) : 0
    const los         = levelOfService(delay)
    return { armIndex: i, type, qe: q, qk: qk[i], fg: fg[i], fF, leBase, capacity, reserve, utilizationDegree: x,
             delay, levelOfService: los, loaded,
             fgOutOfRange: fg[i] > FG_MAX_NORM, qkOutOfRange: qk[i] > QK_MAX_NORM[type] }
  })

  // Ausfahrten-Check (Ziffer 10, S. 11): Q_A(i) ≤ L_A(i) an allen Ausfahrten
  const exits: ExitResult[] = (qa ?? []).map((q, i) => {
    const type     = typeOf(i)
    const twoLanes = type === '2/2' && (exitTwoLanes?.[i] ?? false)
    const capacity = exitCapacityFor(type, fg[i], exitWide?.[i] ?? false, twoLanes)
    const xa       = capacity > 0 ? q / capacity : Infinity
    return { armIndex: i, type, twoLanes, fgAssumed: type === '2/2' && fg[i] > 0,
             qa: q, fg: fg[i], capacity, utilizationDegree: xa, overloaded: q > capacity }
  })

  return {
    entries, exits,
    exitOverload: exits.some(e => e.overloaded),
    overallLevelOfService: worstLOS(entries.filter(e => e.loaded).map(e => e.levelOfService)),
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

// ── Q_K aus Abbiegeströmen (Abb. 10, SN 640 024a S. 18) ──────────────────────
// Einheit: Fz/h — Caller multipliziert mit PCE_RING für PWE/h
// rights[i]    = 1. Ausfahrt (Rechtsabbieger) von Arm i
// straights[i] = 2. Ausfahrt (Geradeaus)     von Arm i  [4-Arm: belegt, 3-Arm: ignoriert]
// lefts[i]     = 3. Ausfahrt (Linksabbieger)  von Arm i
//
// Herleitung: Ring-Querschnitt vor Arm i enthält Fz, die noch nicht ausgefahren sind:
//   4-Arm: Q_K[i] = straight[i-1] + left[i-1] + left[i-2]   (mod 4)
//   3-Arm: Q_K[i] = left[i-1]                                (mod 3)
// uturns: Wender je Arm; sie fahren an allen anderen Einfahrten vorbei (Ziffer 8.3, Seite 7: alle Knotenströme)
export function computeQKfromTurnings(
  _rights: number[], straights: number[], lefts: number[], armCount: 3 | 4, uturns: number[] = [],
): number[] {
  const n = armCount
  return Array.from({ length: n }, (_, i) => {
    const p1 = (i - 1 + n) % n
    const p2 = (i - 2 + n) % n
    const wender = Array.from({ length: n }, (_, j) => (j === i ? 0 : uturns[j] ?? 0)).reduce((s, x) => s + x, 0)
    return (n === 4
      ? straights[p1] + lefts[p1] + lefts[p2]
      : lefts[p1]) + wender
  })
}

// ── Speicherdatei: Typ je Einfahrt ────────────────────────────────────────────
// Neuere Dateien führen den Typ je Arm; ältere einen Typ je Knoten, der dann für alle Arme gilt.
export function entryTypesFromFile(
  data: { type?: unknown; arms?: unknown }, count: number,
): RoundaboutType[] {
  const isType = (v: unknown): v is RoundaboutType => ROUNDABOUT_TYPES.includes(v as RoundaboutType)
  const common = isType(data.type) ? data.type : '1/1'
  const arms = Array.isArray(data.arms) ? data.arms as { type?: unknown }[] : []
  return Array.from({ length: count }, (_, i) => {
    const t = arms[i]?.type
    return isType(t) ? t : common
  })
}
