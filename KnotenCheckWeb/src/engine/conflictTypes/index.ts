// Alle Konflikttypen — Port von ConflictTypes/*.swift

import { maxSaturation } from '../referenceValues'
import {
  capacityPrimary, capacitySecondary, capacityMultiRank,
  capacityAfterSwitch, switchThreshold, parallelSaturation,
  delay, queueLength
} from '../calculators'
import { classifyLOS } from '../levelOfService'
import type { TrafficStream, StreamResult } from '../types'

// ── Hilfsfunktion ─────────────────────────────────────────────────────────────

function makeResult(stream: TrafficStream, capacity: number): StreamResult {
  const Sm = stream.maxSaturation ?? maxSaturation(stream.mode, stream.rank)
  const y = Sm > 0 ? stream.volume / Sm : Infinity
  const x = capacity > 0 ? stream.volume / capacity : Infinity
  const w = x < 1 ? delay(x, stream.volume) : Infinity
  const k = queueLength(w, capacity)
  const los = classifyLOS(w, x)
  return { id: stream.id, saturationDegree: y, capacity, volume: stream.volume,
           utilizationDegree: x, delay: w, queueLength: k, levelOfService: los }
}

// ── Typ 1: Zweirangig ohne Vortrittswechsel ────────────────────────────────────
// L₂ = S_m2 × (1 − y₁)²

export function type1(streams: TrafficStream[]): StreamResult[] {
  const rank1 = streams.filter(s => s.rank === 'primary')
  const rank2 = streams.filter(s => s.rank === 'secondary')
  const y1 = rank1.reduce((sum, s) => {
    const Sm = s.maxSaturation ?? maxSaturation(s.mode, s.rank)
    return sum + s.volume / Sm
  }, 0)
  return [
    ...rank1.map(s => makeResult(s, capacityPrimary(s.maxSaturation ?? maxSaturation(s.mode, s.rank)))),
    ...rank2.map(s => makeResult(s, capacitySecondary(s.maxSaturation ?? maxSaturation(s.mode, s.rank), y1))),
  ]
}

// ── Typ 2: Zweirangig mit Vortrittswechsel ─────────────────────────────────────
// Ohne Wechsel wie Typ 1; bei Überlast: L* = S_m × y / (y₁+y₂)

export function type2(streams: TrafficStream[]): StreamResult[] {
  const rank1 = streams.filter(s => s.rank === 'primary')
  const rank2 = streams.filter(s => s.rank === 'secondary')

  const getSm = (s: TrafficStream) => s.maxSaturation ?? maxSaturation(s.mode, s.rank)
  const y1 = rank1.reduce((sum, s) => sum + s.volume / getSm(s), 0)
  const y2 = rank2.reduce((sum, s) => sum + s.volume / getSm(s), 0)
  const totalY = y1 + y2

  // Kapazität ohne Wechsel prüfen
  const L2noSwitch = rank2[0] ? capacitySecondary(getSm(rank2[0]), y1) : 0
  const x2noSwitch = rank2[0] && L2noSwitch > 0 ? rank2[0].volume / L2noSwitch : 0
  const xStar = switchThreshold(y1, y2)
  const switchOccurs = x2noSwitch >= xStar || totalY >= 1.0

  if (switchOccurs) {
    return [
      ...rank1.map(s => makeResult(s, capacityAfterSwitch(getSm(s), y1, totalY))),
      ...rank2.map(s => makeResult(s, capacityAfterSwitch(getSm(s), y2, totalY))),
    ]
  }
  return type1(streams)
}

// ── Typ 5: Mehrrangig ohne Vortrittswechsel ────────────────────────────────────
// L_k = S_mk × (1 − Σy_i)²

export function type5(streams: TrafficStream[]): StreamResult[] {
  const getSm = (s: TrafficStream) => s.maxSaturation ?? maxSaturation(s.mode, s.rank)
  const sorted = [...streams].sort((a, b) => {
    const rankOrder = { primary: 1, secondary: 2 }
    return rankOrder[a.rank] - rankOrder[b.rank]
  })
  // Ränge als integer über rank-Wert: primary=1, secondary=2
  // Für mehrrangige Konflikte: primary = alle ausser letzten
  // Vereinfachung: primary=Ränge 1..k-1, secondary=Rang k
  const rank1 = sorted.filter(s => s.rank === 'primary')
  const rankK = sorted.filter(s => s.rank === 'secondary')
  const sumY = rank1.reduce((sum, s) => sum + s.volume / getSm(s), 0)
  return [
    ...rank1.map(s => makeResult(s, capacityPrimary(getSm(s)))),
    ...rankK.map(s => makeResult(s, capacityMultiRank(getSm(s), sumY))),
  ]
}

// ── Typ 6: Mehrrangig mit Vortrittswechsel ─────────────────────────────────────

export function type6(streams: TrafficStream[]): StreamResult[] {
  const getSm = (s: TrafficStream) => s.maxSaturation ?? maxSaturation(s.mode, s.rank)
  const totalY = streams.reduce((sum, s) => sum + s.volume / getSm(s), 0)
  const lastRank = streams.filter(s => s.rank === 'secondary')
  const prevRank = streams.filter(s => s.rank === 'primary')
  const sumPrev = prevRank.reduce((sum, s) => sum + s.volume / getSm(s), 0)
  const L_last_no_switch = lastRank[0] ? capacityMultiRank(getSm(lastRank[0]), sumPrev) : 1
  const x_last = lastRank[0] && L_last_no_switch > 0 ? lastRank[0].volume / L_last_no_switch : 0
  const switchOccurs = x_last >= totalY || totalY >= 1.0

  if (switchOccurs) {
    return streams.map(s => makeResult(s, capacityAfterSwitch(getSm(s), s.volume / getSm(s), totalY)))
  }
  return type5(streams)
}

// ── Typ 7: Parallele Streifen ─────────────────────────────────────────────────
// y_a,b = y_a + y_b − y_a × y_b

export function type7(streams: TrafficStream[]): StreamResult[] {
  const getSm = (s: TrafficStream) => s.maxSaturation ?? maxSaturation(s.mode, s.rank)
  const rank1 = streams.filter(s => s.rank === 'primary')
  const rank2 = streams.filter(s => s.rank === 'secondary')
  const y1Values = rank1.map(s => s.volume / getSm(s))
  const y1combined = parallelSaturation(y1Values)
  return [
    ...rank1.map(s => makeResult(s, capacityPrimary(getSm(s)))),
    ...rank2.map(s => makeResult(s, capacitySecondary(getSm(s), y1combined))),
  ]
}
