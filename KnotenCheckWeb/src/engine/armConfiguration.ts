// Eingabemodell — Port von ArmConfiguration.swift + IntersectionConfiguration.swift

import type { MixedLaneCombination, SN640022LaneFlags, IntersectionNode, TrafficStream, ConflictGroup, MixedLaneGroup, Rank } from './types'

// ── Neigungsklassen (Tab. 1) ──────────────────────────────────────────────────

export type GradientCategory = '+4%' | '+2%' | '±0%' | '-2%' | '-4%'

export const GRADIENT_F_FZ: Record<GradientCategory, number> = {
  '+4%': 1.7, '+2%': 1.4, '±0%': 1.1, '-2%': 1.0, '-4%': 0.9,
}

// Tab. 2 — Fall 2: Faktoren je Fahrzeugkategorie
export const GRADIENT_FACTORS: Record<GradientCategory, {
  fPW: number; fLW: number; fLZ: number; fMR: number; fFR?: number
}> = {
  '+4%': { fPW: 1.4, fLW: 3.0, fLZ: 6.0, fMR: 0.7 },
  '+2%': { fPW: 1.2, fLW: 2.0, fLZ: 3.0, fMR: 0.6 },
  '±0%': { fPW: 1.0, fLW: 1.5, fLZ: 2.0, fMR: 0.5, fFR: 0.25 },
  '-2%': { fPW: 0.9, fLW: 1.2, fLZ: 1.5, fMR: 0.4 },
  '-4%': { fPW: 0.8, fLW: 1.0, fLZ: 1.2, fMR: 0.3 },
}

// ── Fahrzeugzusammensetzung (Fall 2) ─────────────────────────────────────────

export interface VehicleCategoryMix {
  pctLW: number  // Lastwagen [%]
  pctLZ: number  // Lastzüge [%]
  pctMR: number  // Motorräder [%]
  pctFR: number  // Fahrräder (nur ±0%) [%]
}

export function pctPW(mix: VehicleCategoryMix): number {
  return Math.max(0, 100 - mix.pctLW - mix.pctLZ - mix.pctMR - mix.pctFR)
}

export function effectiveFactor(mix: VehicleCategoryMix, gradient: GradientCategory): number {
  const f = GRADIENT_FACTORS[gradient]
  const pw = pctPW(mix)
  const fFR = f.fFR ?? 0
  const tot = pw + mix.pctLW + mix.pctLZ + mix.pctMR + mix.pctFR
  if (tot <= 0) return 1
  return (f.fPW * pw + f.fLW * mix.pctLW + f.fLZ * mix.pctLZ
          + f.fMR * mix.pctMR + fFR * mix.pctFR) / tot
}

// ── Arm-Konfiguration ─────────────────────────────────────────────────────────

export interface ArmConfiguration {
  id: string
  leftVolume: number      // Linksabbieger [Fz/h]
  straightVolume: number  // Geradeaus [Fz/h]
  rightVolume: number     // Rechtsabbieger [Fz/h]
  gradient: GradientCategory
  vehicleMix?: VehicleCategoryMix         // null = Fall 1
  hasSeparateTurnLane: boolean            // Fn 1
  rightLaneVolume?: number                // Fn 2
  hasRightTurnTriangleIsland: boolean     // Fn 3/4
  mixedLaneCombination: MixedLaneCombination  // nur NS-Arme in Kreuzung
  hasPedestrianCrossing: boolean
  pedestrianVolume: number
  hasMittelinsel: boolean
}

export function defaultArm(isHS: boolean): ArmConfiguration {
  return {
    id: crypto.randomUUID(),
    leftVolume:     isHS ? 100 : 80,
    straightVolume: isHS ? 400 : 0,
    rightVolume:    isHS ? 100 : 80,
    gradient: '±0%',
    vehicleMix: undefined,
    hasSeparateTurnLane: false,
    rightLaneVolume: undefined,
    hasRightTurnTriangleIsland: false,
    mixedLaneCombination: 'all',
    hasPedestrianCrossing: false,
    pedestrianVolume: 0,
    hasMittelinsel: false,
  }
}

export function armFactor(arm: ArmConfiguration): number {
  if (arm.vehicleMix) return effectiveFactor(arm.vehicleMix, arm.gradient)
  return GRADIENT_F_FZ[arm.gradient]
}

export function totalVolume(arm: ArmConfiguration): number {
  return arm.leftVolume + arm.straightVolume + arm.rightVolume
}

// ── Kreuzungskonfiguration ────────────────────────────────────────────────────

export interface IntersectionConfiguration {
  name: string
  arms: ArmConfiguration[]   // [0]=A(HS), [1]=C(HS), [2]=B(NS), [3]=D(NS, opt.)
}

export function defaultIntersection(armCount: 3 | 4): IntersectionConfiguration {
  const arms: ArmConfiguration[] = []
  for (let i = 0; i < armCount; i++) {
    arms.push(defaultArm(i < 2))
  }
  return { name: 'Neuer Knoten', arms }
}

export function armLabel(index: number): string {
  return ['A', 'C', 'B', 'D', 'E'][index] ?? `${index + 1}`
}

// ── SN 640 022 Lane-Flags aus Konfiguration ───────────────────────────────────

export function toSNLaneFlags(cfg: IntersectionConfiguration): SN640022LaneFlags {
  const a = cfg.arms[0], c = cfg.arms[1], b = cfg.arms[2], d = cfg.arms[3]
  return {
    mixedB: b?.mixedLaneCombination ?? 'all',
    mixedD: d?.mixedLaneCombination ?? 'all',
    armASeparateLane:   a?.hasSeparateTurnLane       ?? false,
    armCSeparateLane:   c?.hasSeparateTurnLane       ?? false,
    armAQ2Override:     a?.rightLaneVolume,
    armCQ8Override:     c?.rightLaneVolume,
    armATriangleIsland: a?.hasRightTurnTriangleIsland ?? false,
    armCTriangleIsland: c?.hasRightTurnTriangleIsland ?? false,
    armBRightIsland:    b?.hasRightTurnTriangleIsland ?? false,
    armDRightIsland:    d?.hasRightTurnTriangleIsland ?? false,
  }
}

// ── Volumenmatrix volumes[i][j] [PWE/h] ──────────────────────────────────────

export function toSNVolumes(cfg: IntersectionConfiguration): number[][] | null {
  const n = cfg.arms.length
  if (n !== 3 && n !== 4) return null
  const f = cfg.arms.map(armFactor)
  const v: number[][] = Array.from({ length: n }, () => Array(n).fill(0))

  if (n === 3) {
    // A (0): gerade→C (q2), rechts→B (q3)
    v[0][1] = f[0] * cfg.arms[0].straightVolume
    v[0][2] = f[0] * cfg.arms[0].rightVolume
    // C (1): gerade→A (q8), links→B (q7)
    v[1][0] = f[1] * cfg.arms[1].straightVolume
    v[1][2] = f[1] * cfg.arms[1].leftVolume
    // B (2): links→A (q4), rechts→C (q6)
    v[2][0] = f[2] * cfg.arms[2].leftVolume
    v[2][1] = f[2] * cfg.arms[2].rightVolume
  } else {
    // A (0): gerade→C (q2), rechts→B (q3), links→D (q1)
    v[0][1] = f[0] * cfg.arms[0].straightVolume
    v[0][2] = f[0] * cfg.arms[0].rightVolume
    v[0][3] = f[0] * cfg.arms[0].leftVolume
    // C (1): gerade→A (q8), links→B (q7), rechts→D (q9)
    v[1][0] = f[1] * cfg.arms[1].straightVolume
    v[1][2] = f[1] * cfg.arms[1].leftVolume
    v[1][3] = f[1] * cfg.arms[1].rightVolume
    // B (2): links→A (q4), rechts→C (q6), gerade→D (q5)
    v[2][0] = f[2] * cfg.arms[2].leftVolume
    v[2][1] = f[2] * cfg.arms[2].rightVolume
    v[2][3] = f[2] * cfg.arms[2].straightVolume
    // D (3): rechts→A (q12), links→C (q10), gerade→B (q11)
    v[3][0] = f[3] * cfg.arms[3].rightVolume
    v[3][1] = f[3] * cfg.arms[3].leftVolume
    v[3][2] = f[3] * cfg.arms[3].straightVolume
  }
  return v
}

// ── Erweiterte Berechnung: IntersectionNode ───────────────────────────────────
// Port von ArmConfiguration.toIntersectionNode() (Swift)

interface EngineMovement {
  label: string
  key: 'leftVolume' | 'straightVolume' | 'rightVolume'
  yieldsTo: number[]  // Arm-Indizes mit Vortritt
  destination: number // Ziel-Arm-Index
}

function engineMovements(index: number, armCount: number): EngineMovement[] {
  if (armCount === 3) {
    if (index === 0) return [
      { label: 'Geradeaus →C', key: 'straightVolume', yieldsTo: [],     destination: 1 },
      { label: 'Rechts →B',    key: 'rightVolume',    yieldsTo: [],     destination: 2 },
    ]
    if (index === 1) return [
      { label: 'Geradeaus →A', key: 'straightVolume', yieldsTo: [],     destination: 0 },
      { label: 'Links →B',     key: 'leftVolume',     yieldsTo: [0],    destination: 2 },
    ]
    return [
      { label: 'Links →A',  key: 'leftVolume',  yieldsTo: [0, 1], destination: 0 },
      { label: 'Rechts →C', key: 'rightVolume', yieldsTo: [0],    destination: 1 },
    ]
  }
  if (index === 0) return [
    { label: 'Geradeaus →C', key: 'straightVolume', yieldsTo: [],     destination: 1 },
    { label: 'Rechts →B',    key: 'rightVolume',    yieldsTo: [],     destination: 2 },
    { label: 'Links →D',     key: 'leftVolume',     yieldsTo: [1],    destination: 3 },
  ]
  if (index === 1) return [
    { label: 'Geradeaus →A', key: 'straightVolume', yieldsTo: [],     destination: 0 },
    { label: 'Links →B',     key: 'leftVolume',     yieldsTo: [0],    destination: 2 },
    { label: 'Rechts →D',    key: 'rightVolume',    yieldsTo: [],     destination: 3 },
  ]
  if (index === 2) return [
    { label: 'Geradeaus →D', key: 'straightVolume', yieldsTo: [0, 1], destination: 3 },
    { label: 'Links →A',     key: 'leftVolume',     yieldsTo: [0, 1], destination: 0 },
    { label: 'Rechts →C',    key: 'rightVolume',    yieldsTo: [0],    destination: 1 },
  ]
  return [
    { label: 'Geradeaus →B', key: 'straightVolume', yieldsTo: [0, 1], destination: 2 },
    { label: 'Rechts →A',    key: 'rightVolume',    yieldsTo: [1],    destination: 0 },
    { label: 'Links →C',     key: 'leftVolume',     yieldsTo: [0, 1], destination: 1 },
  ]
}

function makeStream(name: string, rank: Rank, volume: number, armLbl: string, auxiliary = false): TrafficStream {
  return { id: crypto.randomUUID(), name, rank, mode: 'motorVehicle', volume,
           isAuxiliary: auxiliary, armLabel: armLbl }
}

export function toIntersectionNode(cfg: IntersectionConfiguration): IntersectionNode {
  const n = cfg.arms.length
  const isHS = (i: number) => i < 2
  const lbl  = (i: number) => armLabel(i)

  // Arm-Hauptströme
  const armStreams: TrafficStream[] = cfg.arms.map((arm, i) => {
    const f = armFactor(arm)
    const vol = isHS(i) && arm.hasSeparateTurnLane
      ? (arm.straightVolume + arm.leftVolume) * f
      : totalVolume(arm) * f
    return makeStream(`Arm ${lbl(i)}`, isHS(i) ? 'primary' : 'secondary', vol, lbl(i))
  })

  const subStreams:      TrafficStream[] = []
  const conflictGroups: ConflictGroup[]  = []
  const mixedLaneGroups: MixedLaneGroup[] = []
  const armSubIDs: string[][] = cfg.arms.map(() => [])

  // Sub-Ströme und Konfliktgruppen pro Arm
  for (let i = 0; i < n; i++) {
    const arm  = cfg.arms[i]
    const f    = armFactor(arm)
    const mvs  = engineMovements(i, n)
    const rank: Rank = isHS(i) ? 'primary' : 'secondary'

    for (const mv of mvs) {
      const vol = arm[mv.key] * f
      const sub = makeStream(`${lbl(i)} ${mv.label}`, rank, vol, lbl(i), true)
      subStreams.push(sub)
      armSubIDs[i].push(sub.id)

      for (const pi of mv.yieldsTo) {
        const priorityArm = cfg.arms[pi]
        // Fn 2: NS-Rechtseinbieger gibt nur dem rechten HS-Fahrstreifen Vortritt
        if (mv.key === 'rightVolume' && priorityArm.rightLaneVolume !== undefined && isHS(pi)) {
          const rlStream = makeStream(
            `Arm ${lbl(pi)} Rechtsstreifen`, 'primary',
            priorityArm.rightLaneVolume * armFactor(priorityArm), lbl(pi), true
          )
          subStreams.push(rlStream)
          conflictGroups.push({
            id: crypto.randomUUID(), streamIDs: [rlStream.id, sub.id],
            conflictType: 'twoRankNoSwitch',
            rankOverrides: { [rlStream.id]: 'primary', [sub.id]: 'secondary' },
          })
        } else {
          conflictGroups.push({
            id: crypto.randomUUID(), streamIDs: [armStreams[pi].id, sub.id],
            conflictType: 'twoRankNoSwitch',
            rankOverrides: { [armStreams[pi].id]: 'primary', [sub.id]: 'secondary' },
          })
        }
      }
    }

    mixedLaneGroups.push({
      id: crypto.randomUUID(), name: `Arm ${lbl(i)}`,
      armStreamID: armStreams[i].id, subStreamIDs: armSubIDs[i],
    })
  }

  // Fussgängerströme
  const pedestrianStreams: TrafficStream[] = []
  for (let i = 0; i < n; i++) {
    const arm = cfg.arms[i]
    if (!arm.hasPedestrianCrossing || arm.pedestrianVolume <= 0) continue
    const fg: TrafficStream = {
      id: crypto.randomUUID(), name: `Fg ${lbl(i)}`, rank: 'primary',
      mode: 'pedestrian', volume: arm.pedestrianVolume, armLabel: lbl(i),
    }
    pedestrianStreams.push(fg)

    // K2: eigene Sub-Ströme (Fz die von Arm i wegfahren)
    for (const subID of armSubIDs[i]) {
      conflictGroups.push({
        id: crypto.randomUUID(), streamIDs: [fg.id, subID],
        conflictType: 'twoRankNoSwitch',
        rankOverrides: { [fg.id]: 'primary', [subID]: 'secondary' },
      })
    }
    // K1: Sub-Ströme anderer Arme die ZU Arm i fahren
    for (let j = 0; j < n; j++) {
      if (j === i) continue
      const jMvs = engineMovements(j, n)
      jMvs.forEach((mv, k) => {
        if (mv.destination === i && k < armSubIDs[j].length) {
          conflictGroups.push({
            id: crypto.randomUUID(), streamIDs: [fg.id, armSubIDs[j][k]],
            conflictType: 'twoRankNoSwitch',
            rankOverrides: { [fg.id]: 'primary', [armSubIDs[j][k]]: 'secondary' },
          })
        }
      })
    }
  }

  return {
    id: crypto.randomUUID(),
    name: cfg.name || 'Neuer Knoten',
    streams: [...armStreams, ...subStreams, ...pedestrianStreams],
    conflictGroups,
    mixedLaneGroups,
  }
}
