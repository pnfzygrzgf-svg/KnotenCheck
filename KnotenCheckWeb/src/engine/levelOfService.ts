// Qualitätsstufen A–F nach SN 640 022, Tab. 3
// Port von LevelOfService.swift + LevelOfService.classify()

import type { LevelOfService } from './types'

export function classifyLOS(delay: number, utilizationDegree: number): LevelOfService {
  if (utilizationDegree >= 1.0 || !isFinite(delay)) return 'F'
  if (delay < 10)  return 'A'
  if (delay < 15)  return 'B'
  if (delay < 25)  return 'C'
  if (delay < 45)  return 'D'
  return 'E'
}

// Qualitätsstufen nach SN 640 024a (Tab. 3) und VSS 2011/308 — nur Wartezeit:
// A ≤10 s · B ≤20 s · C ≤30 s · D ≤45 s · E >45 s · F überlastet/unendlich
export function classifyDelayLOS(delay: number): LevelOfService {
  if (!isFinite(delay)) return 'F'
  if (delay <= 10) return 'A'
  if (delay <= 20) return 'B'
  if (delay <= 30) return 'C'
  if (delay <= 45) return 'D'
  return 'E'
}

export function worstLOS(levels: LevelOfService[]): LevelOfService {
  const order: LevelOfService[] = ['A', 'B', 'C', 'D', 'E', 'F']
  return levels.reduce((worst, cur) =>
    order.indexOf(cur) > order.indexOf(worst) ? cur : worst, 'A' as LevelOfService)
}

export const LOS_LABEL: Record<LevelOfService, string> = {
  A: 'Sehr gut (< 10 s)',
  B: 'Sehr gut (10–15 s)',
  C: 'Gut (15–25 s)',
  D: 'Ausreichend (25–45 s)',
  E: 'Kritisch (> 45 s)',
  F: 'Überlastet',
}
