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
  empty: boolean            // Phase ohne Fahrstreifen mit Verkehr: zählt nicht (kein T_Z, kein Grün)
  minGreenGoverns: boolean  // Q_krit < Q_krit,min: Mindestgrünzeit bestimmt die Grünzeit
  belowMinGreen: boolean    // t_Gr < t_Gr,min (nur bei Überlast möglich)
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
  zRaised: boolean          // manuelle Z unter Σ T_Z + Σ t_Gr,min → auf dieses Minimum angehoben
  zAboveMax: boolean        // Z > 120 s: nach Ziff. 10.4.3 nicht zu verwenden
  tZ: number
  sumQKrit: number          // Σ max(Q_krit, Q_krit,min) über die Phasen
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
// Geometrisch unverträgliche Strompaare (vollständige Phasentrennung):
// Pfade kreuzen sich oder führen in dieselbe Ausfahrt. Rechtsverkehr.
// 4-Arm: A=West, B=Süd, C=Ost, D=Nord (wie LSA_4_Arm.svg)
// Geradeaus: q2(A→C), q5(B→D), q8(C→A), q11(D→B)
// Links:     q1(A→D), q4(B→A), q7(C→B), q10(D→C)
// Rechts:    q3(A→B), q6(B→C), q9(C→D), q12(D→A)
// Gegenüberliegende Linksabbieger (q1|q7, q4|q10) kreuzen sich nicht (tangential).
const CONFLICTS_4 = conflictSet([
  // Geradeaus senkrechter Arme (kreuzen sich)
  'q2|q5', 'q2|q11', 'q8|q5', 'q8|q11',
  // Linksabbieger vs. Gegen-Geradeaus (kreuzen sich)
  'q1|q8', 'q7|q2', 'q4|q11', 'q10|q5',
  // Linksabbieger vs. Geradeaus von links (kreuzen sich)
  'q1|q11', 'q7|q5', 'q4|q2', 'q10|q8',
  // Linksabbieger senkrechter Arme (kreuzen sich)
  'q1|q4', 'q1|q10', 'q7|q4', 'q7|q10',
  // Gleiche Ausfahrt (Links, Geradeaus und Rechts fliessen zusammen)
  'q1|q5', 'q1|q9', 'q5|q9',      // → D
  'q3|q7', 'q3|q11', 'q7|q11',    // → B
  'q4|q8', 'q4|q12', 'q8|q12',    // → A
  'q2|q6', 'q2|q10', 'q6|q10',    // → C
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
const CONFLICTS_3 = conflictSet([
  'q2|q4',   // A Geradeaus vs. B Links
  'q2|q7',   // A Geradeaus vs. C Links
  'q8|q4',   // C Geradeaus vs. B Links: beide nach A
  'q4|q7',   // B Links vs. C Links (kreuzen sich)
  'q3|q7',   // A Rechts vs. C Links: beide nach B
  'q6|q2',   // B Rechts vs. A Gerade: beide nach C
  // FGS: feindlich zu allen aus- und einfahrenden Strömen des jeweiligen Arms
  'fgs-A|q2', 'fgs-A|q3', 'fgs-A|q4', 'fgs-A|q8',
  'fgs-B|q3', 'fgs-B|q4', 'fgs-B|q6', 'fgs-B|q7',
  'fgs-C|q2', 'fgs-C|q6', 'fgs-C|q7', 'fgs-C|q8',
])

// Paare in beliebiger Schreibrichtung erfassen; Schlüssel wird wie beim Nachschlagen gebildet
function conflictSet(pairs: string[]): ReadonlySet<string> {
  return new Set(pairs.map(p => {
    const [a, b] = p.split('|')
    return conflictKey(a, b)
  }))
}

function conflictKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`
}

function isConflict(set: ReadonlySet<string>, a: string, b: string): boolean {
  return set.has(conflictKey(a, b))
}

// Sind zwei Ströme (Kfz oder FGS) geometrisch unverträglich?
export function streamsConflict(armCount: 3 | 4, a: string, b: string): boolean {
  return isConflict(armCount === 4 ? CONFLICTS_4 : CONFLICTS_3, a, b)
}

// ── Mindestgrünzeit ────────────────────────────────────────────────────────────
// Fahrzeuge ohne FG-Streifen: 4 s (Mindestfreigabezeit, VSS 40 837 Tab. 1)
// Mit FG-Streifen: max(5 s, (2/3 · L) / 1.2 m·s⁻¹)
//   2/3 der Querungslänge mit 1,2 m/s: VSS 40 837 Tab. 1 (Fussgänger);
//   Mindestwert 5 s: Berechnungstool HB LSA Stadt Bern V 2.1, Anhang G
// Ohne FGS (undefined): 4 s; mit FGS mindestens 5 s, auch bei fehlender Querungslänge
function tGrMin(fgLength?: number): number {
  if (fgLength === undefined) return 4
  return Math.max(5, (2 / 3 * Math.max(0, fgLength)) / 1.2)
}

// ── LOS-Rang ──────────────────────────────────────────────────────────────────
const LOS_RANK: LevelOfService[] = ['A', 'B', 'C', 'D', 'E', 'F']
export function losRank(los: LevelOfService): number { return LOS_RANK.indexOf(los) }

// ── Hauptberechnung ───────────────────────────────────────────────────────────
export function calculateLSAV2(input: LSAInputV2): LSAResultV2 {
  const { volumes, lanes, phases, targetLos, armCount, manualZ } = input

  // Q_krit pro Fahrstreifen = max Q der zugeordneten Ströme (bewusst nicht die Summe;
  // VSS 40 023a Ziff. 10.4.1: «grösste … Verkehrsstärken pro Fahrstreifen»)
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

  // Leere Phasen (kein Fahrstreifen mit Verkehr) zählen nicht: keine Zwischenzeit, kein Grün
  const phaseActive = phases.map(ph => ph.laneIds.some(id => (laneQ.get(id) ?? 0) > 0))
  const n = phaseActive.filter(Boolean).length

  // Mindestgrünzeit pro Phase: aus FGS-Lanes in der Phase ableiten
  // (ohne FGS: 4 s Kfz-Minimum; mit FGS: max(5 s, 2/3·L/1,2))
  const phaseTGrMinVal = phases.map(ph => {
    const fgsInPhase = ph.laneIds
      .map(id => lanes.find(l => l.id === id))
      .filter((l): l is Lane => l?.isFGS === true)
    if (fgsInPhase.length === 0) return tGrMin()
    return Math.max(...fgsInPhase.map(l => tGrMin(l.fgLength ?? 0)))
  })

  // T_Z: Norm-Pauschale 5 s/Phase (VSS 40 023a Ziff. 11.2, abweichende Werte zulässig).
  // Staffelung 3/4/5 s nach v_zul = eigene Annahme (≈ Gelbzeit VSS 40 837 Tab. 1 + 1 s)
  const T_Z = input.tZ ?? 5

  // Ziff. 10.4.1: Jede Phase zählt mindestens mit Q_krit,min = t_Gr,min / Z · S — so erhält
  // auch eine Phase mit kleinem Q_krit (z. B. reine FGS-Phase) ihre Mindestgrünzeit.
  // Q_krit,min hängt von Z ab, darum wird es je geprüfter Umlaufzeit neu bestimmt.
  const effQKrit = (z: number) => phases.map((_, i) =>
    phaseActive[i] ? Math.max(phaseQKrit[i], phaseTGrMinVal[i] / z * S) : 0)
  const sumOf = (a: number[]) => a.reduce((x, y) => x + y, 0)
  const qKritMaxFor = (z: number) => z > 0 ? Math.max(0, z - n * T_Z) / z * S : 0

  // Z-Auswahl: manuell oder automatisch (kleinste Z aus Tab. 2 mit Reserve)
  // Manuell: mindestens Σ Zwischenzeiten + Σ Mindestgrünzeiten, sonst angehoben
  const zMin = n * T_Z + sumOf(phases.map((_, i) => phaseActive[i] ? phaseTGrMinVal[i] : 0))
  const zIsManual = (manualZ ?? 0) > 0
  let Z: number
  let zRaised = false
  if (zIsManual) {
    Z = manualZ!
    if (Z < zMin) { Z = Math.ceil(zMin); zRaised = true }
  } else {
    Z = (TAB2.find(row => qKritMaxFor(row.Z) > sumOf(effQKrit(row.Z))) ?? TAB2[TAB2.length - 1]).Z
  }
  const qEff     = effQKrit(Z)
  const sumQKrit = sumOf(qEff)
  const tGrSum   = Math.max(0, Z - n * T_Z)
  const qKritMax = qKritMaxFor(Z)
  // Überlastet, wenn keine Reserve bleibt (gleiche Regel für manuelle und automatische Z)
  const overloaded = sumQKrit >= qKritMax

  // Grünzeiten proportional zu Q_krit (inkl. Mindestwert Q_krit,min)
  const tGrRaw = phases.map((_, i) =>
    !phaseActive[i] ? 0 : sumQKrit > 0 ? tGrSum * qEff[i] / sumQKrit : tGrSum / n
  )

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
      empty: !phaseActive[i],
      minGreenGoverns: phaseActive[i] && phaseQKrit[i] < qKritMinVal,
      belowMinGreen: phaseActive[i] && tGr < tGrMinVal - 1e-9,
    }
  })

  // Fahrstreifenergebnisse: λ_effektiv = Summe der λ aller Phasen mit diesem FS
  // FGS: S=8000 Fg/h; Kfz: S=1800 PWE/h
  const laneResults: LaneResultV2[] = lanes.map(lane => {
    const q = laneQ.get(lane.id) ?? 0
    // Effektive Grünzeit: Summe der Phasengrünzeiten + T_Z für jede aufeinanderfolgende
    // Phase, in der dieser Fahrstreifen ebenfalls grün ist (Norm S. 19: «sowie der Zwischenzeit»)
    // Leere Phasen werden übersprungen (sie existieren im Signalplan nicht)
    const activeIdx = phases.map((_, i) => i).filter(i => phaseActive[i])
    let effectiveTGr = 0
    for (let k = 0; k < activeIdx.length; k++) {
      const i = activeIdx[k]
      if (!phases[i].laneIds.includes(lane.id)) continue
      effectiveTGr += tGrRaw[i]
      const next = activeIdx[(k + 1) % activeIdx.length]
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
    Z, zIsManual, zRaised, zAboveMax: Z > 120, tZ: T_Z, sumQKrit, maxQKrit: qKritMax, overloaded,
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

// Bewegungen pro Arm: Strom-ID, Beschriftung, Eingabefeld der Arm-Eingabe
// armIdx: 0=A, 1=C, 2=B, 3=D — Geometrie siehe Unverträglichkeitsmatrix
export type Movement = { id: string; label: string; direction: 'left' | 'straight' | 'right' }
export function armMovements(armCount: 3 | 4, armIdx: number): Movement[] {
  if (armCount === 3) {
    if (armIdx === 0) return [
      {id:'q2',label:'Geradeaus →C',direction:'straight'},
      {id:'q3',label:'Rechts →B',direction:'right'},
    ]
    if (armIdx === 1) return [
      {id:'q7',label:'Links →B',direction:'left'},
      {id:'q8',label:'Geradeaus →A',direction:'straight'},
    ]
    return [
      {id:'q4',label:'Links →A',direction:'left'},
      {id:'q6',label:'Rechts →C',direction:'right'},
    ]
  }
  if (armIdx === 0) return [
    {id:'q1',label:'Links →D',direction:'left'},
    {id:'q2',label:'Geradeaus →C',direction:'straight'},
    {id:'q3',label:'Rechts →B',direction:'right'},
  ]
  if (armIdx === 1) return [
    {id:'q7',label:'Links →B',direction:'left'},
    {id:'q8',label:'Geradeaus →A',direction:'straight'},
    {id:'q9',label:'Rechts →D',direction:'right'},
  ]
  if (armIdx === 2) return [
    {id:'q4',label:'Links →A',direction:'left'},
    {id:'q5',label:'Geradeaus →D',direction:'straight'},
    {id:'q6',label:'Rechts →C',direction:'right'},
  ]
  return [
    {id:'q10',label:'Links →C',direction:'left'},
    {id:'q11',label:'Geradeaus →B',direction:'straight'},
    {id:'q12',label:'Rechts →A',direction:'right'},
  ]
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
