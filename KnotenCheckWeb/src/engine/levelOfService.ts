// Qualitätsstufen A–F nach SN 640 022, Tab. 3
// Port von LevelOfService.swift + LevelOfService.classify()

import type { LevelOfService } from './types'

export function classifyLOS(delay: number, utilizationDegree: number): LevelOfService {
  if (utilizationDegree >= 1.0 || !isFinite(delay)) return 'F'
  if (delay < 10)  return 'A'
  if (delay < 15)  return 'B'
  if (delay < 25)  return 'C'
  if (delay < 45)  return 'D'
  if (delay < 80)  return 'E'
  return 'F'
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
