// VSS SN 640 024a — Knoten mit Kreisverkehr

export type RoundaboutType = '1/1' | '2/1+'

export type LevelOfService = 'A' | 'B' | 'C' | 'D' | 'E' | 'F'

// ── f_F Lookup-Tabellen (Abb. 3 und Abb. 4) ──────────────────────────────────
// Stützpunkte [Q_K, f_F] — abgelesen und bestätigt durch Anwender
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
  200: [[0, 0.86], [200, 0.87], [400, 0.89], [600, 0.91], [800, 0.94], [1000, 0.96], [1200, 1.00]],
  300: [[0, 0.83], [200, 0.84], [400, 0.86], [600, 0.87], [800, 0.90], [1000, 0.93], [1200, 0.96], [1400, 1.00]],
  400: [[0, 0.80], [200, 0.81], [400, 0.82], [600, 0.84], [800, 0.86], [1000, 0.87], [1200, 0.915], [1400, 0.95]],
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

// ── Grenzleistungsfähigkeit L_E (Abb. 6) ─────────────────────────────────────
export function basicCapacity(type: RoundaboutType, qk: number): number {
  if (type === '1/1') return Math.max(0, 1141 - 0.578 * qk)
  return Math.max(0, 1455 - 0.537 * qk)
}

// ── Wartezeit nach Kimber & Hollis / HBS, Abb. 7 (Ref. [10]) ─────────────────
// T=1.0h: Betrachtungshorizont 1 Stunde (für Kreisverkehrsberechnung)
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
export function levelOfService(delay: number): LevelOfService {
  if (!isFinite(delay)) return 'F'
  if (delay <= 10) return 'A'
  if (delay <= 20) return 'B'
  if (delay <= 30) return 'C'
  if (delay <= 45) return 'D'
  return 'E'
}

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

export interface RoundaboutResult {
  type: RoundaboutType
  entries: EntryResult[]
  overallLevelOfService: LevelOfService
}

// ── Hauptberechnung ───────────────────────────────────────────────────────────
// Q_K wird direkt eingegeben (kommt aus Verkehrsmodell / OD-Umlegung)

export interface RoundaboutInput {
  type: RoundaboutType
  qe: number[]   // Einfahrtsvolumen [PWE/h]
  qk: number[]   // Kreisfahrbahnbelastung je Einfahrt [PWE/h]
  fg: number[]   // Fussgängerbelastung je Einfahrt [FG/h]
}

export function calculateRoundabout(input: RoundaboutInput): RoundaboutResult {
  const { type, qe, qk, fg } = input
  const losRank: LevelOfService[] = ['A', 'B', 'C', 'D', 'E', 'F']

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

  const overallLevelOfService = entries.reduce<LevelOfService>((worst, e) => {
    return losRank.indexOf(e.levelOfService) > losRank.indexOf(worst) ? e.levelOfService : worst
  }, 'A')

  return { type, entries, overallLevelOfService }
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
  rights: number[], straights: number[], lefts: number[], armCount: 3 | 4
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
