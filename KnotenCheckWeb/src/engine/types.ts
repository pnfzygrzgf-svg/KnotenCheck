// Alle Kerndatentypen — Port von KnotenCheckEngine Swift-Models

export type Rank = 'primary' | 'secondary'

export type VehicleMode =
  | 'motorVehicle'
  | 'pedestrian'
  | 'tramOwnTrack'
  | 'busOwnTrack'
  | 'transitOneStop_NoOvertake'
  | 'transitTwoStops_NoOvertake'
  | 'transitThreeStops_NoOvertake'
  | 'transitFourStops_NoOvertake'
  | 'transitOneStop_Overtake'
  | 'transitTwoStops_Overtake'
  | 'transitThreeStops_Overtake'
  | 'transitFourStops_Overtake'

export type ConflictTypeName =
  | 'twoRankNoSwitch'
  | 'twoRankWithSwitch'
  | 'multiRankNoSwitch'
  | 'multiRankWithSwitch'
  | 'parallelLanes'

export type LevelOfService = 'A' | 'B' | 'C' | 'D' | 'E' | 'F'

export interface TrafficStream {
  id: string
  name: string
  rank: Rank
  mode: VehicleMode
  volume: number          // Q [Fz/h oder Fg/h]
  isAuxiliary?: boolean
  armLabel?: string
  // computed
  saturationDegree?: number  // y = Q / S_m
  maxSaturation?: number     // S_m
}

export interface ConflictGroup {
  id: string
  streamIDs: string[]
  conflictType: ConflictTypeName
  rankOverrides: Record<string, Rank>
}

export interface MixedLaneGroup {
  id: string
  name: string
  armStreamID: string
  subStreamIDs: string[]
}

export interface IntersectionNode {
  id: string
  name: string
  streams: TrafficStream[]
  conflictGroups: ConflictGroup[]
  mixedLaneGroups: MixedLaneGroup[]
}

export interface StreamResult {
  id: string
  saturationDegree: number
  capacity: number          // L [Fz/h]
  volume: number
  utilizationDegree: number // x = Q / L
  delay: number             // w [s]
  queueLength: number       // k [Fz]
  levelOfService: LevelOfService
}

export interface NodeResult {
  nodeID: string
  streamResults: StreamResult[]
  converged: boolean
  iterationCount: number
  warnings: string[]
}

// ── SN 640 022 ────────────────────────────────────────────────────────────────

export interface SN640022StreamResult {
  id: string
  streamNumber: number
  name: string
  rang: number
  volumePWE: number   // q [PWE/h] — für Auslastung, Reserve, Wartezeit
  qpi: number         // massgebende Hauptstrombelastung [Fz/h]
  basicCapacity: number
  capacity: number
  reserve: number
  utilizationDegree: number
  delay: number
  levelOfService: LevelOfService
}

export interface SN640022MixedResult {
  id: string
  name: string
  streamNumbers: number[]
  volumeFzh: number
  capacity: number
  reserve: number
  utilizationDegree: number
  delay: number
  levelOfService: LevelOfService
}

export interface SN640022Result {
  streams: SN640022StreamResult[]
  mixedLanes: SN640022MixedResult[]
  overallLevelOfService: LevelOfService
}

export type MixedLaneCombination = 'leftAndThrough' | 'throughAndRight' | 'all'

export interface SN640022LaneFlags {
  mixedB: MixedLaneCombination
  mixedD: MixedLaneCombination
  armASeparateLane: boolean
  armCSeparateLane: boolean
  armAQ2Override?: number
  armCQ8Override?: number
  armATriangleIsland: boolean
  armCTriangleIsland: boolean
  armBRightIsland: boolean
  armDRightIsland: boolean
  // [F22] separater Linksabbiegestreifen auf der HS — fehlt er, wird p0* angewendet
  // undefined verhält sich wie true (Streifen vorhanden, F22 nicht aktiv)
  armALeftLane?: boolean   // Strom 1 (A→D)
  armCLeftLane?: boolean   // Strom 7 (C→B)
}

export const defaultLaneFlags = (): SN640022LaneFlags => ({
  mixedB: 'all',
  mixedD: 'all',
  armASeparateLane: false,
  armCSeparateLane: false,
  armAQ2Override: undefined,
  armCQ8Override: undefined,
  armATriangleIsland: false,
  armCTriangleIsland: false,
  armBRightIsland: false,
  armDRightIsland: false,
})
