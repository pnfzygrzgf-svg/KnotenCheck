// Iterativer Solver — Port von KnotenCheckEngine/Engine.swift + ConflictResolver.swift

import { type1, type2, type5, type6, type7 } from './conflictTypes'
import { capacityPrimary, delay, queueLength } from './calculators'
import { classifyLOS } from './levelOfService'
import { maxSaturation } from './referenceValues'
import type { IntersectionNode, TrafficStream, StreamResult, NodeResult, ConflictGroup } from './types'

function sm(s: TrafficStream): number {
  return s.maxSaturation ?? maxSaturation(s.mode, s.rank)
}

function makeResult(stream: TrafficStream, capacity: number): StreamResult {
  const y = sm(stream) > 0 ? stream.volume / sm(stream) : Infinity
  const x = capacity > 0 ? stream.volume / capacity : Infinity
  const w = x < 1 ? delay(x, stream.volume) : Infinity
  const k = queueLength(w, capacity)
  return { id: stream.id, saturationDegree: y, capacity, volume: stream.volume,
           utilizationDegree: x, delay: w, queueLength: k, levelOfService: classifyLOS(w, x) }
}

function resolveGroup(group: ConflictGroup, streams: TrafficStream[]): StreamResult[] {
  const relevant = streams
    .filter(s => group.streamIDs.includes(s.id))
    .map(s => group.rankOverrides[s.id] ? { ...s, rank: group.rankOverrides[s.id] } : s)
  if (!relevant.length) return []
  switch (group.conflictType) {
    case 'twoRankNoSwitch':    return type1(relevant)
    case 'twoRankWithSwitch':  return type2(relevant)
    case 'multiRankNoSwitch':  return type5(relevant)
    case 'multiRankWithSwitch': return type6(relevant)
    case 'parallelLanes':      return type7(relevant)
  }
}

export function analyzeNode(node: IntersectionNode): NodeResult {
  let allResults: StreamResult[] = []

  // 1. Alle Konfliktgruppen auflösen
  for (const group of node.conflictGroups) {
    allResults.push(...resolveGroup(group, node.streams))
  }

  // 2. Ströme ohne Konfliktgruppe: volle Primärkapazität
  const assignedIDs = new Set(node.conflictGroups.flatMap(g => g.streamIDs))
  for (const stream of node.streams) {
    if (!assignedIDs.has(stream.id)) {
      allResults.push(makeResult(stream, capacityPrimary(sm(stream))))
    }
  }

  // 3. Deduplizieren: restriktivste (minimale) Kapazität je Strom
  const seen = new Map<string, number>()
  const deduped: StreamResult[] = []
  for (const r of allResults) {
    const idx = seen.get(r.id)
    if (idx !== undefined) {
      if (r.capacity < deduped[idx].capacity) deduped[idx] = r
    } else {
      seen.set(r.id, deduped.length)
      deduped.push(r)
    }
  }
  allResults = deduped

  // 4. Mischstreifen-Aggregation: x_M = Σ(Q_i/L_i), L_M = Q_M/x_M (VSS 2008/301 S. 19-20)
  for (const group of node.mixedLaneGroups) {
    const subs = group.subStreamIDs
      .map(id => node.streams.find(s => s.id === id))
      .filter((s): s is TrafficStream => s !== undefined)
    if (!subs.length) continue
    const Q_M = subs.reduce((sum, s) => sum + s.volume, 0)
    if (Q_M <= 0) continue
    const sumQoverL = subs.reduce((acc, sub) => {
      const L_i = allResults.find(r => r.id === sub.id)?.capacity ?? sm(sub)
      return acc + sub.volume / Math.max(L_i, 1)
    }, 0)
    const x_M = sumQoverL
    const L_M = Q_M / Math.max(x_M, 1e-9)
    const w_M = x_M < 1 ? delay(x_M, Q_M) : Infinity
    const armRes: StreamResult = {
      id: group.armStreamID, saturationDegree: 0, capacity: L_M, volume: Q_M,
      utilizationDegree: x_M, delay: w_M, queueLength: queueLength(w_M, L_M),
      levelOfService: classifyLOS(w_M, x_M),
    }
    const idx = allResults.findIndex(r => r.id === group.armStreamID)
    if (idx >= 0) allResults[idx] = armRes
    else allResults.push(armRes)
  }

  return { nodeID: node.id, streamResults: allResults, converged: true, iterationCount: 1, warnings: [] }
}
