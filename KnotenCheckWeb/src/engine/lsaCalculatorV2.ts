// VSS 40 023a — Stufe 3: freier Fahrstreifen- und Phasenplan
// Wartezeit w_m nach Kimber & Hollis (1979), TRRL Report LR 909 [Ref. 18 der Norm]
// VQS nach Tab. 4 der Norm, in Anlehnung an FGSV HBS 2001 [Ref. 17]

import { streamDelay, losFromDelay, TAB2 } from './lsaCalculator'
import type { LevelOfService } from './lsaCalculator'

export type { LevelOfService }

const S     = 1800  // PWE/h (Ziffer 11.3)
const S_FGS = 8000  // Fg/h  (VSS 40 834, Ziffer 5)

// ── Typen ─────────────────────────────────────────────────────────────────────

export interface Lane {
  id: string
  armIndex: number   // 0=A, 1=C, 2=B, 3=D
  label: string
  streamIds: string[]
  isFGS?: boolean    // Fussgängerstreifen (S=8000 Fg/h)
  fgLength?: number  // Querungslänge [m], nur für FGS-Lanes
}

export interface PhaseDefinition {
  id: number
  laneIds: string[]
  // fgLength nicht mehr hier — kommt von der FGS-Lane in der Phase
}

export interface LSAInputV2 {
  armCount: 3 | 4
  volumes: Record<string, number>   // stream-ID → PWE/h (Kfz) oder Fg/h (FGS)
  lanes: Lane[]
  phases: PhaseDefinition[]
  targetLos: LevelOfService
  manualZ?: number                  // manuell gesetzte Umlaufzeit [s]; undefined = auto (Tab. 2)
  tZ?: number                       // Zwischenzeit [s] pro Phase; default 5 (Norm-Pauschale VSS 40 023a Ziff. 11.2)
}

export interface PhaseResultV2 {
  id: number
  laneIds: string[]
  qKrit: number
  qKritMin: number
  tGrMin: number
  tGr: number
  lambda: number
  L: number
  criticalLaneId: string | null
  belowMinGreen: boolean
}

export interface LaneResultV2 {
  laneId: string
  armIndex: number
  label: string
  streamIds: string[]
  isFGS: boolean
  qKrit: number
  tGr: number
  lambda: number
  L: number
  X: number
  w1: number
  w0: number
  wm: number
  stRE95: number   // 95%-Rückstau [PWE] gemäss VSS 40 023a Ziff. 11.5
  queueM: number   // physische Rückstaulänge [m] (ST_RE95 × 6 m/PWE)
  los: LevelOfService
  isCritical: boolean
  meetsTarget: boolean
}

export interface ConflictWarning {
  phaseId: number
  streamA: string
  streamB: string
}

export interface StreamResultV2 {
  streamId: string
  laneId: string
  laneLabel: string
  armIndex: number
  isFGS: boolean
  Q: number
  X: number
  wm: number
  queueM: number   // L-95 [m]
  los: LevelOfService
  meetsTarget: boolean
}

export interface LSAResultV2 {
  Z: number
  zIsManual: boolean
  tZ: number
  sumQKrit: number
  maxQKrit: number
  overloaded: boolean
  phases: PhaseResultV2[]
  lanes: LaneResultV2[]
  streams: StreamResultV2[]
  conflicts: ConflictWarning[]
  overallLos: LevelOfService
  meetsTargetLos: boolean
}

// ── Unverträglichkeitsmatrix ──────────────────────────────────────────────────
// Geometrisch unverträgliche Strompaare (vollständige Phasentrennung)
// 4-Arm: A=West, B=Süd, C=Ost, D=Nord
// Geradeaus: q2(A→C), q5(B→D), q8(C→A), q11(D→B)
// Links:     q1(A→D), q6(B→C), q7(C→B), q12(D→A)
// Rechts:    q3(A→B), q4(B→A), q9(C→D), q10(D→C)
const CONFLICTS_4: ReadonlySet<string> = new Set([
  // Geradeaus senkrechter Arme
  'q2|q5', 'q2|q11', 'q8|q5', 'q8|q11',
  // Linksabbieger vs. gegenläufiger Geradeausstrom (selbe Achse)
  'q1|q8', 'q7|q2', 'q6|q11', 'q12|q5',
  // Linksabbieger vs. Geradeausstrom senkrechter Arme
  'q1|q5', 'q1|q11', 'q7|q5', 'q7|q11',
  'q6|q2', 'q6|q8', 'q12|q2', 'q12|q8',
  // Linksabbieger senkrechter Arme (kreuzen sich)
  'q1|q6', 'q1|q12', 'q7|q6', 'q7|q12',
  // Rechtsabbieger vs. Linksabbieger Gegenarm (gleiche Zielspur) und vs. Geradeaus von der Seite
  'q3|q7',  'q3|q11',   // A→B rechts: vs. C→B links, vs. D→B gerade
  'q4|q12', 'q4|q8',    // B→A rechts: vs. D→A links, vs. C→A gerade
  'q9|q1',  'q9|q5',    // C→D rechts: vs. A→D links, vs. B→D gerade
  'q10|q6', 'q10|q2',   // D→C rechts: vs. B→C links, vs. A→C gerade
  // FGS: feindlich zu allen aus- und einfahrenden Strömen des jeweiligen Arms
  'fgs-A|q1', 'fgs-A|q2', 'fgs-A|q3', 'fgs-A|q4', 'fgs-A|q8',  'fgs-A|q12',
  'fgs-B|q3', 'fgs-B|q4', 'fgs-B|q5', 'fgs-B|q6', 'fgs-B|q7',  'fgs-B|q11',
  'fgs-C|q2', 'fgs-C|q6', 'fgs-C|q7', 'fgs-C|q8', 'fgs-C|q9',  'fgs-C|q10',
  'fgs-D|q1', 'fgs-D|q5', 'fgs-D|q9', 'fgs-D|q10','fgs-D|q11', 'fgs-D|q12',
])

// 3-Arm: A=HS-links, C=HS-rechts, B=NS
// Geradeaus: q2(A→C), q8(C→A)
// Links:     q4(B→A), q7(C→B)
// Rechts:    q3(A→B), q6(B→C)
const CONFLICTS_3: ReadonlySet<string> = new Set([
  'q2|q4',   // A Geradeaus vs. B Links
  'q2|q7',   // A Geradeaus vs. C Links
  'q8|q4',   // C Geradeaus vs. B Links
  'q4|q7',   // B Links vs. C Links (kreuzen sich)
  'q3|q7',   // A Rechts vs. C Links: q7 kreuzt die Gegenfahrbahn inkl. q3-Spur
  'q6|q2',   // B Rechts vs. A Gerade: beide nach C, Pfade kreuzen sich
  // FGS: feindlich zu allen aus- und einfahrenden Strömen des jeweiligen Arms
  'fgs-A|q2', 'fgs-A|q3', 'fgs-A|q4', 'fgs-A|q8',
  'fgs-B|q3', 'fgs-B|q4', 'fgs-B|q6', 'fgs-B|q7',
  'fgs-C|q2', 'fgs-C|q6', 'fgs-C|q7', 'fgs-C|q8',
])

function conflictKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`
}

function isConflict(set: ReadonlySet<string>, a: string, b: string): boolean {
  return set.has(conflictKey(a, b))
}

// ── Mindestgrünzeit ────────────────────────────────────────────────────────────
// Fahrzeuge ohne FG-Streifen: 4 s (Mindestfreigabezeit, VSS 40 837 Tab. 1)
// Mit FG-Streifen: max(5 s, (2/3 · L) / 1.2 m·s⁻¹)
//   2/3 der Querungslänge mit 1,2 m/s: VSS 40 837 Tab. 1 (Fussgänger);
//   Mindestwert 5 s: Berechnungstool HB LSA Stadt Bern V 2.1, Anhang G
function tGrMin(fgLength: number): number {
  if (fgLength <= 0) return 4
  return Math.max(5, (2 / 3 * fgLength) / 1.2)
}

// ── LOS-Rang ──────────────────────────────────────────────────────────────────
const LOS_RANK: LevelOfService[] = ['A', 'B', 'C', 'D', 'E', 'F']
export function losRank(los: LevelOfService): number { return LOS_RANK.indexOf(los) }

// ── Hauptberechnung ───────────────────────────────────────────────────────────
export function calculateLSAV2(input: LSAInputV2): LSAResultV2 {
  const { volumes, lanes, phases, targetLos, armCount, manualZ } = input

  // Q_krit pro Fahrstreifen = max Q der zugeordneten Ströme
  // FGS: Einheit Fg/h; Kfz: Einheit PWE/h
  const laneQ = new Map<string, number>()
  for (const lane of lanes) {
    laneQ.set(lane.id, Math.max(0, ...lane.streamIds.map(id => volumes[id] ?? 0)))
  }

  // Anzahl Phasen, in denen jeder Fahrstreifen vorkommt
  const lanePhaseCount = new Map<string, number>()
  for (const lane of lanes) lanePhaseCount.set(lane.id, 0)
  for (const ph of phases)
    for (const id of ph.laneIds)
      lanePhaseCount.set(id, (lanePhaseCount.get(id) ?? 0) + 1)

  // Q_krit pro Phase: nur Kfz-Fahrstreifen — FGS sind unkritisch (VSS 40 834)
  const phaseQKrit = phases.map(ph => {
    const vehIds = ph.laneIds.filter(id => !lanes.find(l => l.id === id)?.isFGS)
    const exclusive = vehIds.filter(id => (lanePhaseCount.get(id) ?? 0) === 1)
    const candidates = exclusive.length > 0 ? exclusive : vehIds
    return Math.max(0, ...candidates.map(id => laneQ.get(id) ?? 0))
  })

  // Kritischer Fahrstreifen pro Phase (nur Kfz)
  const phaseCritLane = phases.map((ph, i) => {
    const vehIds = ph.laneIds.filter(id => !lanes.find(l => l.id === id)?.isFGS)
    const exclusive = vehIds.filter(id => (lanePhaseCount.get(id) ?? 0) === 1)
    const candidates = exclusive.length > 0 ? exclusive : vehIds
    const q = phaseQKrit[i]
    return candidates.find(id => (laneQ.get(id) ?? 0) === q) ?? null
  })

  const sumQKrit = phaseQKrit.reduce((a, b) => a + b, 0)
  const n = phases.length

  // Z-Auswahl: manuell oder automatisch (Tab. 2)
  // T_Z: Norm-Pauschale 5 s/Phase (VSS 40 023a Ziff. 11.2, abweichende Werte zulässig).
  // Staffelung 3/4/5 s nach v_zul = eigene Annahme (≈ Gelbzeit VSS 40 837 Tab. 1 + 1 s)
  const T_Z = input.tZ ?? 5
  let Z: number
  let tabData: { tGrSum: number; lambdaSum: number; qKritMax: number }
  let overloaded: boolean
  const zIsManual = (manualZ ?? 0) > 0

  if (zIsManual) {
    Z = manualZ!
    const tGrSum = Math.max(0, Z - n * T_Z)
    const lambdaSum = Z > 0 ? tGrSum / Z : 0
    tabData = { tGrSum, lambdaSum, qKritMax: lambdaSum * S }
    overloaded = sumQKrit > tabData.qKritMax
  } else {
    let selectedRow = TAB2[TAB2.length - 1]
    overloaded = true
    for (const row of TAB2) {
      const tGrSumDyn = Math.max(0, row.Z - n * T_Z)
      const qKritMaxDyn = row.Z > 0 ? (tGrSumDyn / row.Z) * S : 0
      if (qKritMaxDyn > sumQKrit) {
        selectedRow = row
        overloaded = false
        break
      }
    }
    Z = selectedRow.Z
    const tGrSumDyn = Math.max(0, Z - n * T_Z)
    const lambdaSumDyn = Z > 0 ? tGrSumDyn / Z : 0
    tabData = { tGrSum: tGrSumDyn, lambdaSum: lambdaSumDyn, qKritMax: lambdaSumDyn * S }
  }

  // Grünzeiten proportional zu Q_krit; Mindestgrünzeit beachten
  const tGrRaw = phases.map((_, i) =>
    sumQKrit > 0 ? tabData.tGrSum * phaseQKrit[i] / sumQKrit : tabData.tGrSum / n
  )

  // Mindestgrünzeit pro Phase: aus FGS-Lanes in der Phase ableiten
  // (ohne FGS: 4 s Kfz-Minimum; mit FGS: max(5 s, 2/3·L/1,2))
  const phaseTGrMinVal = phases.map(ph => {
    const fgsInPhase = ph.laneIds
      .map(id => lanes.find(l => l.id === id))
      .filter((l): l is Lane => l?.isFGS === true)
    if (fgsInPhase.length === 0) return tGrMin(0)
    return Math.max(...fgsInPhase.map(l => tGrMin(l.fgLength ?? 0)))
  })

  // Phasenergebnisse
  const phaseResults: PhaseResultV2[] = phases.map((ph, i) => {
    const tGrMinVal = phaseTGrMinVal[i]
    const qKritMinVal = (tGrMinVal / Z) * S
    const tGr = tGrRaw[i]
    const lambda = tGr / Z
    return {
      id: ph.id,
      laneIds: ph.laneIds,
      qKrit: phaseQKrit[i],
      qKritMin: qKritMinVal,
      tGrMin: tGrMinVal,
      tGr,
      lambda,
      L: lambda * S,
      criticalLaneId: phaseCritLane[i],
      belowMinGreen: phaseQKrit[i] > 0 && phaseQKrit[i] < qKritMinVal,
    }
  })

  // Fahrstreifenergebnisse: λ_effektiv = Summe der λ aller Phasen mit diesem FS
  // FGS: S=8000 Fg/h; Kfz: S=1800 PWE/h
  const laneResults: LaneResultV2[] = lanes.map(lane => {
    const q = laneQ.get(lane.id) ?? 0
    // Effektive Grünzeit: Summe der Phasengrünzeiten + T_Z für jede aufeinanderfolgende
    // Phase, in der dieser Fahrstreifen ebenfalls grün ist (Norm S. 19: «sowie der Zwischenzeit»)
    let effectiveTGr = 0
    for (let i = 0; i < phases.length; i++) {
      if (!phases[i].laneIds.includes(lane.id)) continue
      effectiveTGr += tGrRaw[i]
      const next = (i + 1) % phases.length
      if (phases[next].laneIds.includes(lane.id)) effectiveTGr += T_Z
    }
    const lambda = effectiveTGr / Z
    const sSat = lane.isFGS ? S_FGS : S
    const L = lambda * sSat
    const { w1, w0, wm, X } = streamDelay(q, lambda, Z, sSat)
    const los = losFromDelay(isFinite(wm) ? wm : Infinity)
    const isCritical = phaseResults.some(ph => ph.criticalLaneId === lane.id)

    // ST_RE95 nur für Kfz-Fahrstreifen (VSS 40 023a Ziff. 11.5)
    let stRE95 = Infinity
    let queueM = Infinity
    if (!lane.isFGS && isFinite(X) && X < 1 && q > 0) {
      const tRed = Z - effectiveTGr
      const pweArrRed  = q * tRed / 3600            // PWE_mr
      const pweResidual = (isFinite(w0) ? w0 : 0) * q / 3600 * X  // PWE_GE
      const pweTotal = pweArrRed + pweResidual
      stRE95  = 1.691 * Math.sqrt(pweTotal) + pweTotal
      queueM  = stRE95 * 6
    }

    return {
      laneId: lane.id, armIndex: lane.armIndex, label: lane.label,
      streamIds: lane.streamIds, isFGS: lane.isFGS ?? false, qKrit: q,
      tGr: effectiveTGr, lambda, L,
      X: isFinite(X) ? X : Infinity,
      w1: isFinite(w1) ? w1 : Infinity,
      w0: isFinite(w0) ? w0 : Infinity,
      wm: isFinite(wm) ? wm : Infinity,
      stRE95, queueM,
      los, isCritical,
      meetsTarget: losRank(los) <= losRank(targetLos),
    }
  })

  // Konfliktprüfung (Kfz- und FGS-Ströme)
  const conflictSet = armCount === 4 ? CONFLICTS_4 : CONFLICTS_3
  const conflicts: ConflictWarning[] = []
  for (const ph of phases) {
    const streams = ph.laneIds.flatMap(id => {
      const lane = lanes.find(l => l.id === id)
      if (!lane) return []
      return lane.streamIds.filter(s => (volumes[s] ?? 0) > 0)
    })
    for (let i = 0; i < streams.length; i++)
      for (let j = i + 1; j < streams.length; j++)
        if (isConflict(conflictSet, streams[i], streams[j]))
          conflicts.push({ phaseId: ph.id, streamA: streams[i], streamB: streams[j] })
  }

  // Gesamturteil: nur Kfz-Fahrstreifen (FGS-VQS ist Sache von VSS 40 834)
  const activeVehLanes = laneResults.filter(l => l.qKrit > 0 && !l.isFGS)
  const overallLos = activeVehLanes.reduce<LevelOfService>(
    (w, l) => losRank(l.los) > losRank(w) ? l.los : w, 'A'
  )

  // VQS pro Strom: jeder Strom mit Q>0 erhält eigene Wartezeit (lambda vom Fahrstreifen)
  const streamResults: StreamResultV2[] = laneResults.flatMap(lane => {
    const sSat = lane.isFGS ? S_FGS : S
    const tRed = Z - lane.tGr
    return lane.streamIds
      .filter(id => (volumes[id] ?? 0) > 0)
      .map(id => {
        const q = volumes[id] ?? 0
        const { w0, wm, X } = streamDelay(q, lane.lambda, Z, sSat)
        const los = losFromDelay(isFinite(wm) ? wm : Infinity)
        let queueM = Infinity
        if (!lane.isFGS && isFinite(X) && X < 1 && q > 0) {
          const pweArrRed  = q * tRed / 3600
          const pweResidual = (isFinite(w0) ? w0 : 0) * q / 3600 * X
          const pweTotal = pweArrRed + pweResidual
          queueM = (1.691 * Math.sqrt(pweTotal) + pweTotal) * 6
        }
        return {
          streamId: id,
          laneId: lane.laneId,
          laneLabel: lane.label,
          armIndex: lane.armIndex,
          isFGS: lane.isFGS,
          Q: q,
          X: isFinite(X) ? X : Infinity,
          wm: isFinite(wm) ? wm : Infinity,
          queueM,
          los,
          meetsTarget: losRank(los) <= losRank(targetLos),
        }
      })
  })

  return {
    Z, zIsManual, tZ: T_Z, sumQKrit, maxQKrit: tabData.qKritMax, overloaded,
    phases: phaseResults, lanes: laneResults, streams: streamResults, conflicts,
    overallLos, meetsTargetLos: losRank(overallLos) <= losRank(targetLos),
  }
}

// ── Strom-Labels ──────────────────────────────────────────────────────────────
export const STREAM_LABELS: Record<string, string> = {
  q1:'A→D', q2:'A→C', q3:'A→B',
  q4:'B→A', q5:'B→D', q6:'B→C',
  q7:'C→B', q8:'C→A', q9:'C→D',
  q10:'D→C', q11:'D→B', q12:'D→A',
  'fgs-A':'FGS A', 'fgs-B':'FGS B', 'fgs-C':'FGS C', 'fgs-D':'FGS D',
}

// Ströme von einem Arm (Fahrrichtungen aus diesem Arm)
export function armStreamIds(armCount: 3 | 4, armIndex: number): string[] {
  if (armCount === 3) return [['q2','q3'], ['q8','q7'], ['q4','q6']][armIndex] ?? []
  return [
    ['q1','q2','q3'],
    ['q8','q9','q7'],
    ['q4','q5','q6'],
    ['q12','q11','q10'],
  ][armIndex] ?? []
}

// ── Minimaler Phasenplan (Backtracking-Coloring) ──────────────────────────────
// Findet die kleinstmögliche Anzahl Phasen, in der alle aktiven Lanes
// mindestens einmal grün sind und keine feindlichen Ströme zusammen landen.

export function suggestPhasePlan(
  lanes: Lane[],
  volumes: Record<string, number>,
  armCount: 3 | 4,
): PhaseDefinition[] {
  const conflictSet = armCount === 4 ? CONFLICTS_4 : CONFLICTS_3
  const active = lanes.filter(l => l.streamIds.some(s => (volumes[s] ?? 0) > 0))
  if (active.length === 0) return []

  const n = active.length
  const adj: boolean[] = new Array(n * n).fill(false)
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const conflict = active[i].streamIds.some(sa =>
        active[j].streamIds.some(sb => isConflict(conflictSet, sa, sb))
      )
      adj[i * n + j] = adj[j * n + i] = conflict
    }
  }

  const colors = new Array(n).fill(-1)

  function backtrack(node: number, k: number): boolean {
    if (node === n) return true
    for (let c = 0; c < k; c++) {
      let ok = true
      for (let j = 0; j < node; j++) {
        if (adj[node * n + j] && colors[j] === c) { ok = false; break }
      }
      if (ok) {
        colors[node] = c
        if (backtrack(node + 1, k)) return true
        colors[node] = -1
      }
    }
    return false
  }

  let k = 1
  for (; k <= n; k++) {
    colors.fill(-1)
    if (backtrack(0, k)) break
  }

  const phases: PhaseDefinition[] = []
  for (let c = 0; c < k; c++) {
    phases.push({
      id: c + 1,
      laneIds: active.filter((_, i) => colors[i] === c).map(l => l.id),
    })
  }
  return phases
}

// ── Standard-Vorschlag ────────────────────────────────────────────────────────
// Liefert Lanes und Phasen als Ausgangspunkt; kann vom Benutzer überschrieben werden.
export function defaultLanesAndPhases(armCount: 3 | 4): {
  lanes: Lane[]
  phases: PhaseDefinition[]
} {
  const armCount4 = armCount === 4
  const armLabels = armCount4 ? ['A','C','B','D'] : ['A','C','B']

  const lanes: Lane[] = armLabels.map((lbl, i) => ({
    id: `FS${i + 1}`,
    armIndex: i,
    label: `Arm ${lbl} — alle Richtungen`,
    streamIds: armStreamIds(armCount, i),
  }))

  // 4-Arm 2-phasig: HS (A+C) | NS (B+D)
  // 3-Arm 3-phasig: A | C | B  — q3(A→B) und q7(C→B) sind geometrisch unverträglich
  const phases: PhaseDefinition[] = armCount4
    ? [
        { id: 1, laneIds: ['FS1', 'FS2'] },
        { id: 2, laneIds: ['FS3', 'FS4'] },
      ]
    : [
        { id: 1, laneIds: ['FS1'] },
        { id: 2, laneIds: ['FS2'] },
        { id: 3, laneIds: ['FS3'] },
      ]

  return { lanes, phases }
}
