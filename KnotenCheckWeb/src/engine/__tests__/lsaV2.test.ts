// LSA V2: Unverträglichkeitsmatrix und Strombeschriftung gegen ein unabhängiges
// Geometriemodell prüfen (Rechtsverkehr, Lage der Arme wie LSA_4_Arm.svg)

import { describe, test, expect } from 'vitest'
import {
  armMovements, armStreamIds, STREAM_LABELS, streamsConflict, suggestPhasePlan,
  calculateLSAV2, defaultLanesAndPhases,
} from '../lsaCalculatorV2'
import type { Lane, LSAInputV2 } from '../lsaCalculatorV2'

// Lage der Arme [°], mathematisch: 0 = Ost, gegen den Uhrzeigersinn
const ARM_ANGLE: Record<string, number> = { C: 0, D: 90, A: 180, B: 270 }
const ARM_LABELS = { 3: ['A', 'C', 'B'], 4: ['A', 'C', 'B', 'D'] } as const

// Herkunft und Ziel aus der Strombeschriftung, z. B. 'A→D'
function route(id: string): { from: string; to: string } {
  const [from, to] = STREAM_LABELS[id].split('→')
  return { from, to }
}

// Abbiegerichtung: bei der Einfahrt zeigt die Fahrtrichtung vom Arm weg
function turn(from: string, to: string): 'left' | 'straight' | 'right' {
  const delta = (((ARM_ANGLE[to] - ARM_ANGLE[from] - 180) % 360) + 360) % 360
  return delta === 0 ? 'straight' : delta === 90 ? 'left' : 'right'
}

// Fahrwege als Sehnen auf einem Kreis um den Knoten. Rechtsverkehr: Einfahrt liegt
// gegen den Uhrzeigersinn neben der Armachse, Ausfahrt im Uhrzeigersinn daneben.
// Zwei Sehnen kreuzen sich, wenn ihre Endpunkte auf dem Kreis abwechseln; Sehnen mit
// gemeinsamem Endpunkt (gleiche Herkunft oder gleiche Ausfahrt) berühren sich nur.
const pIn  = (arm: string) => ARM_ANGLE[arm] + 10
const pOut = (arm: string) => (ARM_ANGLE[arm] + 350) % 360
function pathsCross(a: string, b: string): boolean {
  const ra = route(a), rb = route(b)
  if (ra.from === rb.from || ra.to === rb.to) return false
  const [lo, hi] = [pIn(ra.from), pOut(ra.to)].sort((x, y) => x - y)
  const inside = (p: number) => lo < p && p < hi
  return inside(pIn(rb.from)) !== inside(pOut(rb.to))
}

// Erwartung: Kfz-Ströme aus verschiedenen Armen sind unverträglich, wenn sich ihre Wege
// kreuzen oder beide in dieselbe Ausfahrt führen. FGS: alle Ströme, die in den Arm
// ein- oder aus ihm ausfahren.
function geometricConflict(a: string, b: string): boolean {
  const fgsA = a.startsWith('fgs-'), fgsB = b.startsWith('fgs-')
  if (fgsA && fgsB) return false
  if (fgsA || fgsB) {
    const arm = (fgsA ? a : b).slice(4)
    const r = route(fgsA ? b : a)
    return r.from === arm || r.to === arm
  }
  const ra = route(a), rb = route(b)
  if (ra.from === rb.from) return false
  return ra.to === rb.to || pathsCross(a, b)
}

function allStreams(armCount: 3 | 4): string[] {
  const labels = ARM_LABELS[armCount]
  return [
    ...labels.flatMap((_, i) => armStreamIds(armCount, i)),
    ...labels.map(l => `fgs-${l}`),
  ]
}

describe.each([3, 4] as const)('LSA %i-Arm: Strombeschriftung', armCount => {
  const labels = ARM_LABELS[armCount]

  test.each(labels.map((l, i) => [l, i] as const))('Arm %s: Bewegungen passen zur Geometrie', (lbl, i) => {
    const moves = armMovements(armCount, i)
    expect(moves.map(m => m.id).sort()).toEqual([...armStreamIds(armCount, i)].sort())
    for (const m of moves) {
      const r = route(m.id)
      expect(r.from).toBe(lbl)
      expect(m.label.endsWith(`→${r.to}`)).toBe(true)
      expect(m.direction).toBe(turn(r.from, r.to))
    }
  })
})

describe('Geometriemodell (Plausibilität)', () => {
  test('4-Arm: 16 Kreuzungspunkte (4 Geradeaus, 8 Links/Geradeaus, 4 Links/Links)', () => {
    const kfz = allStreams(4).filter(s => !s.startsWith('fgs-'))
    let n = 0
    for (let i = 0; i < kfz.length; i++)
      for (let j = i + 1; j < kfz.length; j++)
        if (route(kfz[i]).from !== route(kfz[j]).from && pathsCross(kfz[i], kfz[j])) n++
    expect(n).toBe(16)
  })
  test('gegenüberliegende Linksabbieger kreuzen sich nicht', () => {
    expect(pathsCross('q1', 'q7')).toBe(false)
    expect(pathsCross('q4', 'q10')).toBe(false)
  })
  test('Rechtsabbieger kreuzen keinen Weg', () => {
    for (const r of ['q3', 'q6', 'q9', 'q12'])
      for (const s of allStreams(4).filter(x => !x.startsWith('fgs-') && x !== r))
        expect(pathsCross(r, s)).toBe(false)
  })
})

describe.each([3, 4] as const)('LSA %i-Arm: Unverträglichkeitsmatrix', armCount => {
  const streams = allStreams(armCount)
  const pairs = streams.flatMap((a, i) => streams.slice(i + 1).map(b => [a, b] as const))

  test.each(pairs)('%s | %s', (a, b) => {
    const expected = geometricConflict(a, b)
    expect(streamsConflict(armCount, a, b)).toBe(expected)
    expect(streamsConflict(armCount, b, a)).toBe(expected)
  })
})

describe('LSA 4-Arm: Minimaler Phasenplan trennt feindliche Ströme', () => {
  const lanesPerStream = (ids: string[]): Lane[] =>
    ids.map(id => ({ id, armIndex: 0, label: id, streamIds: [id] }))
  const phaseIsClean = (laneIds: string[]) =>
    laneIds.every((a, i) => laneIds.slice(i + 1).every(b => !streamsConflict(4, a, b)))

  test('kreuzende Geradeausströme q8, q5, q11 nicht in einer Phase', () => {
    const ids = ['q8', 'q5', 'q11']
    const plan = suggestPhasePlan(lanesPerStream(ids), { q8: 500, q5: 500, q11: 500 }, 4)
    expect(plan.length).toBe(2)
    for (const ph of plan) expect(phaseIsClean(ph.laneIds)).toBe(true)
  })

  test('alle 12 Ströme auf eigenen Fahrstreifen: keine Phase mit Konflikt', () => {
    const ids = allStreams(4).filter(s => !s.startsWith('fgs-'))
    const volumes = Object.fromEntries(ids.map(id => [id, 100]))
    const plan = suggestPhasePlan(lanesPerStream(ids), volumes, 4)
    expect(plan.flatMap(ph => ph.laneIds).sort()).toEqual([...ids].sort())
    for (const ph of plan) expect(phaseIsClean(ph.laneIds)).toBe(true)
  })
})

// ── Berechnung: Umlaufzeit, Grünzeiten, Mindestgrünzeit ───────────────────────
describe('LSA V2: Umlaufzeit und Grünzeitverteilung', () => {
  const base = defaultLanesAndPhases(4)   // FS1..FS4 = Arm A, C, B, D; Phasen A+C | B+D
  const vol = { q2: 600, q8: 500, q5: 300, q11: 250 }   // Σ Q_krit = 600 + 300
  const calc = (extra: Partial<LSAInputV2> = {}) => calculateLSAV2({
    armCount: 4, volumes: vol, lanes: base.lanes, phases: base.phases, targetLos: 'D', tZ: 5, ...extra,
  })

  test('kleinste Z aus Tab. 2 mit Reserve; Grün proportional zu Q_krit', () => {
    const r = calc()
    expect(r.Z).toBe(45)                         // qKritMax(45) = 35/45·1800 = 1400 > 900
    expect(r.sumQKrit).toBe(900)
    expect(r.overloaded).toBe(false)
    expect(r.phases[0].tGr).toBeCloseTo(35 * 600 / 900, 10)
    expect(r.phases[1].tGr).toBeCloseTo(35 * 300 / 900, 10)
  })

  test('leere Phase ändert nichts (keine Zwischenzeit, kein Grün)', () => {
    const r0 = calc()
    const r1 = calc({ phases: [...base.phases, { id: 3, laneIds: [] }] })
    expect(r1.Z).toBe(r0.Z)
    expect(r1.lanes.map(l => l.X)).toEqual(r0.lanes.map(l => l.X))
    expect(r1.phases[2].empty).toBe(true)
    expect(r1.phases[2].tGr).toBe(0)
  })

  test('reine FGS-Phase erhält ihre Mindestgrünzeit', () => {
    const fgs: Lane = { id: 'fgs-A', armIndex: 0, label: 'FGS A', streamIds: ['fgs-A'], isFGS: true, fgLength: 12 }
    const r = calc({
      volumes: { ...vol, 'fgs-A': 200 },
      lanes: [...base.lanes, fgs],
      phases: [...base.phases, { id: 3, laneIds: ['fgs-A'] }],
    })
    const ph = r.phases[2]
    expect(ph.tGrMin).toBeCloseTo(Math.max(5, (2 / 3 * 12) / 1.2), 10)
    expect(ph.minGreenGoverns).toBe(true)
    expect(ph.tGr).toBeGreaterThanOrEqual(ph.tGrMin)
    expect(r.phases.every(p => !p.belowMinGreen)).toBe(true)
  })

  test('FGS ohne Querungslänge: mindestens 5 s', () => {
    const fgs: Lane = { id: 'fgs-A', armIndex: 0, label: 'FGS A', streamIds: ['fgs-A'], isFGS: true, fgLength: 0 }
    const r = calc({ volumes: { ...vol, 'fgs-A': 100 }, lanes: [...base.lanes, fgs],
                     phases: [...base.phases, { id: 3, laneIds: ['fgs-A'] }] })
    expect(r.phases[2].tGrMin).toBe(5)
  })

  test('manuelle Z unter Zwischenzeiten + Mindestgrünzeiten wird angehoben', () => {
    const r = calc({ manualZ: 8 })
    expect(r.zRaised).toBe(true)
    expect(r.Z).toBe(2 * 5 + 2 * 4)
    expect(r.overloaded).toBe(true)
  })

  test('manuelle Z: Überlast bei Gleichstand, Hinweis über 120 s', () => {
    // Z = 45: qKritMax = 1400; Σ = 1400 → keine Reserve → überlastet
    const r = calc({ manualZ: 45, volumes: { q2: 1000, q5: 400 } })
    expect(r.sumQKrit).toBe(1400)
    expect(r.overloaded).toBe(true)
    expect(calc({ manualZ: 130 }).zAboveMax).toBe(true)
    expect(calc({ manualZ: 90 }).zAboveMax).toBe(false)
  })
})
