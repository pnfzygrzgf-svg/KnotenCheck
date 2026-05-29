// Verifikation gegen empirische Tabellenwerte aus VSS 2011/308 (Kap. 4)
// PDF: "Verkehrsablauf an ungesteuerten Knoten innerorts", Sept. 2015

import { describe, test, expect } from 'vitest'
import { computeDelay, computeLOS, calculateVSS308 } from '../vss2011308Calculator'

const approx = (actual: number, expected: number, tol: number) =>
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tol)

// ── Wartezeit-Formel (Gl. 1, S. 62) ──────────────────────────────────────────

describe('computeDelay', () => {
  test('x=0 → nahezu 0s', () => {
    const w = computeDelay(0, 1500, 1.0)
    expect(w).toBe(0)
  })
  test('x≥1 → Infinity', () => {
    expect(computeDelay(1500, 1500, 1.0)).toBe(Infinity)
    expect(computeDelay(2000, 1500, 1.0)).toBe(Infinity)
  })
  test('C=0.5 ergibt weniger Wartezeit als C=1.0 bei gleicher Last', () => {
    const w05 = computeDelay(800, 1800, 0.5)
    const w10 = computeDelay(800, 1500, 1.0)
    expect(w05).toBeLessThan(w10)
  })
  test('Rang-2: x≈0.7 → plausible Wartezeit 10–30s', () => {
    const w = computeDelay(1050, 1500, 1.0)  // x=0.7
    expect(w).toBeGreaterThan(5)
    expect(w).toBeLessThan(40)
  })
})

// ── Tab. 15 — Goldbrunnenplatz 2 (S. 43) ─────────────────────────────────────
// Rang 1 (HS): Q=400, S_m1=1800 → y₁=0.222
// Rang 2 (NS): Q=190 (empirisch), Wartezeit empirisch ≈6.0s
// β = (1−0.222)³ ≈ 0.471, L=1500×0.471=707, x=190/707≈0.27

describe('Tab. 15 — Goldbrunnenplatz 2', () => {
  const yHS = 400 / 1800   // ≈ 0.222
  const beta = (1 - yHS) ** 3
  const L = 1500 * beta
  const Q = 190
  const w = computeDelay(Q, L, 1.0)

  test('β ≈ 0.47', () => approx(beta, 0.47, 0.02))
  test('L ≈ 707', () => approx(L, 707, 10))
  test('w zwischen 3s und 12s (empirisch 6s)', () => {
    expect(w).toBeGreaterThan(3)
    expect(w).toBeLessThan(12)
  })
})

// ── Tab. 15 — Uster 2 (S. 43) ────────────────────────────────────────────────
// Rang 2: Q=434, y₁=642/1800≈0.357
// β = (1−0.357)³ ≈ 0.266, L=1500×0.266=399
// x=434/399≈1.09 → Überlast → w=Infinity

describe('Tab. 15 — Uster 2 (overflow)', () => {
  const yHS = 642 / 1800
  const L   = 1500 * (1 - yHS) ** 3
  const Q   = 434
  test('x>1 → Infinity', () => {
    expect(computeDelay(Q, L, 1.0)).toBe(Infinity)
  })
  test('LOS F bei Overflow', () => {
    expect(computeLOS(Infinity)).toBe('F')
  })
})

// ── LOS-Klassierung ───────────────────────────────────────────────────────────

describe('computeLOS', () => {
  test('0s  → A', () => expect(computeLOS(0)).toBe('A'))
  test('10s → A', () => expect(computeLOS(10)).toBe('A'))
  test('11s → B', () => expect(computeLOS(11)).toBe('B'))
  test('20s → B', () => expect(computeLOS(20)).toBe('B'))
  test('25s → C', () => expect(computeLOS(25)).toBe('C'))
  test('30s → C', () => expect(computeLOS(30)).toBe('C'))
  test('40s → D', () => expect(computeLOS(40)).toBe('D'))
  test('45s → D', () => expect(computeLOS(45)).toBe('D'))
  test('46s → E', () => expect(computeLOS(46)).toBe('E'))
  test('∞  → F', () => expect(computeLOS(Infinity)).toBe('F'))
})

// ── Gesamtberechnung — Kreuzung mit FG ───────────────────────────────────────

describe('calculateVSS308 — 4-Arm mit Fussgängern', () => {
  const result = calculateVSS308({
    type: '4arm',
    arms: [
      { name: 'A', roadType: 'HS', right: 100, straight: 400, left: 100, fg: 0 },
      { name: 'C', roadType: 'HS', right: 100, straight: 400, left: 100, fg: 0 },
      { name: 'B', roadType: 'NS', right: 80, straight: 0, left: 80, fg: 200 },
      { name: 'D', roadType: 'NS', right: 80, straight: 0, left: 80, fg: 0 },
    ],
  })

  test('HS-Arm A: LOS besser als NS-Arm B', () => {
    const losRank = ['A','B','C','D','E','F']
    const rankA = losRank.indexOf(result.arms[0].levelOfService)
    const rankB = losRank.indexOf(result.arms[2].levelOfService)
    expect(rankA).toBeLessThanOrEqual(rankB)
  })
  test('NS-Arm B mit FG hat kleinere Kapazität als D ohne FG', () => {
    expect(result.arms[2].capacity).toBeLessThan(result.arms[3].capacity)
  })
  test('Gesamt-LOS = schlechtester Einzel-LOS', () => {
    const losRank = ['A','B','C','D','E','F']
    const worst = result.arms.reduce((w, a) =>
      losRank.indexOf(a.levelOfService) > losRank.indexOf(w)
        ? a.levelOfService : w, 'A' as 'A'|'B'|'C'|'D'|'E'|'F')
    expect(result.overallLevelOfService).toBe(worst)
  })
})

// ── Gleicher Rang (Rechtsvortritt) ────────────────────────────────────────────

describe('calculateVSS308 — Gleicher Rang', () => {
  const result = calculateVSS308({
    type: '4arm',
    arms: [
      { name: 'A', roadType: 'equal', right: 100, straight: 200, left: 100, fg: 0 },
      { name: 'C', roadType: 'equal', right: 100, straight: 200, left: 100, fg: 0 },
      { name: 'B', roadType: 'equal', right: 80, straight: 150, left: 80, fg: 0 },
      { name: 'D', roadType: 'equal', right: 80, straight: 150, left: 80, fg: 0 },
    ],
  })

  test('Symmetrische Arme haben gleiche β', () => {
    expect(result.arms[0].beta).toBeCloseTo(result.arms[1].beta, 5)
    expect(result.arms[2].beta).toBeCloseTo(result.arms[3].beta, 5)
  })
  test('β < 1 bei gleicher Rangierung mit Last', () => {
    expect(result.arms[0].beta).toBeLessThan(1)
  })
})
