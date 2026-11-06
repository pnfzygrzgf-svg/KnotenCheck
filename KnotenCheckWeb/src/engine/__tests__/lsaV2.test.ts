// LSA V2: Unverträglichkeitsmatrix und Strombeschriftung gegen ein unabhängiges
// Geometriemodell prüfen (Rechtsverkehr, Lage der Arme wie LSA_4_Arm.svg)

import { describe, test, expect } from 'vitest'
import {
  armMovements, armStreamIds, STREAM_LABELS, streamsConflict, suggestPhasePlan,
  calculateLSAV2, defaultLanesAndPhases, queue95, tzFor, tzModeFromFile,
} from '../lsaCalculatorV2'
import { streamDelay } from '../lsaCalculator'
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

// ── Mischfahrstreifen: Verkehrsstärke des Fahrstreifens = Summe der Ströme (Ziff. 9.3) ──
describe('LSA V2: Mischfahrstreifen zählt die Summe seiner Ströme', () => {
  const base = defaultLanesAndPhases(4)
  const vol = { q1: 300, q2: 500, q3: 300, q7: 300, q8: 500, q9: 300,
                q4: 300, q5: 500, q6: 300, q10: 300, q11: 500, q12: 300 }
  const r = calculateLSAV2({ armCount: 4, volumes: vol, lanes: base.lanes, phases: base.phases, targetLos: 'D', tZ: 5 })

  test('Q_krit je Fahrstreifen = 1100 PWE/h, nicht 500', () => {
    for (const l of r.lanes) expect(l.qKrit).toBe(1100)
    expect(r.sumQKrit).toBe(2200)
  })
  test('2 × 1100 PWE/h übersteigt jede Umlaufzeit der Tab. 2 → überlastet', () => {
    expect(r.overloaded).toBe(true)
    for (const l of r.lanes) expect(l.los).toBe('F')
  })
  test('Strom-Ergebnisse tragen die Werte ihres Fahrstreifens', () => {
    const r2 = calculateLSAV2({ armCount: 4, volumes: { q2: 400, q3: 200, q5: 300 },
                                lanes: base.lanes, phases: base.phases, targetLos: 'D', tZ: 5 })
    const lane = r2.lanes.find(l => l.laneId === 'FS1')!
    expect(lane.qKrit).toBe(600)
    for (const id of ['q2', 'q3']) {
      const s = r2.streams.find(x => x.streamId === id)!
      expect(s.X).toBe(lane.X)
      expect(s.wm).toBe(lane.wm)
      expect(s.los).toBe(lane.los)
    }
  })
})

// ── Minimaler Phasenplan: nur Ströme mit Verkehr ──────────────────────────────
describe('LSA V2: Minimaler Phasenplan beachtet nur Ströme mit Q > 0', () => {
  const { lanes } = defaultLanesAndPhases(4)
  const volumes = { q2: 600, q8: 600, q5: 300, q11: 300 }

  test('Mischfahrstreifen ohne Abbieger: 2 Phasen, Z 45, VQS B, kein Konflikt', () => {
    const phases = suggestPhasePlan(lanes, volumes, 4)
    expect(phases.length).toBe(2)
    const r = calculateLSAV2({ armCount: 4, volumes, lanes, phases, targetLos: 'D', tZ: 5 })
    expect(r.Z).toBe(45)
    expect(r.sumQKrit).toBe(900)
    expect(r.overallLos).toBe('B')
    expect(r.conflicts).toEqual([])
  })
  test('mit Linksabbiegern bleibt die Trennung', () => {
    const phases = suggestPhasePlan(lanes, { ...volumes, q1: 50, q7: 50 }, 4)
    const r = calculateLSAV2({ armCount: 4, volumes: { ...volumes, q1: 50, q7: 50 }, lanes, phases, targetLos: 'D', tZ: 5 })
    expect(r.conflicts).toEqual([])
    expect(phases.length).toBeGreaterThan(2)
  })
})

// ── Normbeispiel Ziffer 16 (S. 16–20) ─────────────────────────────────────────
describe('LSA V2: Normbeispiel Ziffer 16 mit Z = 80 s', () => {
  const lane = (id: string, armIndex: number, stream: string): Lane =>
    ({ id, armIndex, label: `FS ${id}`, streamIds: [stream] })
  const lanes = [lane('1', 0, 'q3'), lane('2', 0, 'q2'), lane('3', 1, 'q8'),
                 lane('4', 1, 'q7'), lane('5', 2, 'q6'), lane('6', 2, 'q4')]
  const phases = [{ id: 1, laneIds: ['1', '2', '3'] }, { id: 2, laneIds: ['4', '5'] }, { id: 3, laneIds: ['5', '6'] }]
  const volumes = { q2: 500, q3: 175, q8: 600, q7: 275, q4: 325, q6: 100 }
  const calc = (extra: Partial<LSAInputV2> = {}) =>
    calculateLSAV2({ armCount: 3, volumes, lanes, phases, targetLos: 'D', ...extra })

  test('Vorgabe ohne T_Z: Pauschale 5 s, ΣQ_krit 1200, Maximum 1463, VQS D', () => {
    const r = calc({ manualZ: 80 })
    expect(r.Z).toBe(80)
    expect(r.tZ).toBe(5)
    expect(r.sumQKrit).toBe(1200)
    expect(Math.round(r.maxQKrit)).toBe(1463)
    expect(r.overallLos).toBe('D')
    expect(r.overlapIssues).toEqual([])
  })
  test('Fahrstreifen 5 erhält die Zwischenzeit zwischen seinen Phasen (Tab. 6, S. 19)', () => {
    expect(calc({ manualZ: 80 }).lanes.find(l => l.laneId === '5')!.tGr).toBeCloseTo(14.9 + 17.6 + 5, 0)
  })

  // Auto-Z nimmt 50 s (Tab. 2, S. 10) und verfehlt D; die Norm wählt darum eine höhere Z (S. 18)
  test('Auto-Z verfehlt Ziel D und nennt die Umlaufzeit, die es erreicht', () => {
    const r = calc()
    expect(r.Z).toBe(50)
    expect(r.overallLos).toBe('E')
    expect(r.zForTarget).not.toBeNull()
    expect(r.zForTarget!.Z).toBeGreaterThanOrEqual(60)
    expect(r.zForTarget!.Z).toBeLessThanOrEqual(90)
    const check = calc({ manualZ: r.zForTarget!.Z })
    expect(check.meetsTargetLos).toBe(true)
    expect(check.overallLos).toBe(r.zForTarget!.los)
  })
  test('kein Hinweis, wenn das Ziel erreicht ist oder Z von Hand gesetzt wurde', () => {
    expect(calc({ targetLos: 'E' }).zForTarget).toBeNull()
    expect(calc({ manualZ: 50 }).zForTarget).toBeNull()
  })
  test('kein Vorschlag, wenn 60–90 s das Ziel nicht erreichen', () => {
    expect(calc({ targetLos: 'A' }).zForTarget).toBeNull()
  })
})

// ── 95%-Rückstau: Tab. 7 (S. 20) und Tab. 10 (S. 22), Abb. 15 (S. 28) ─────────
describe('ST_RE95 trifft die Tabellen der Norm (Z = 80 s, t_Gr gerundet wie in der Norm)', () => {
  const metres = (Q: number, tGr: number) => {
    const { w0, X } = streamDelay(Q, tGr / 80, 80)
    return queue95(Q, 80 - tGr, w0, X) * 6
  }
  test.each([
    [175, 32, 31], [500, 32, 75], [600, 32, 95], [275, 15, 69], [100, 38, 19], [325, 18, 73],
  ])('Tab. 7: Q %i, t_Gr %i → %i m', (Q, tGr, expected) => {
    expect(Math.abs(metres(Q, tGr) - expected)).toBeLessThanOrEqual(1)
  })
  test.each([
    [175, 31, 32], [500, 31, 77], [600, 31, 100], [275, 14, 77], [100, 36, 19], [325, 17, 79],
  ])('Tab. 10: Q %i, t_Gr %i → %i m', (Q, tGr, expected) => {
    expect(Math.abs(metres(Q, tGr) - expected)).toBeLessThanOrEqual(1)
  })
  test('Abb. 15: λ 0,2, Q 324 → 14,6 PWE', () => {
    const { w0, X } = streamDelay(324, 0.2, 80)
    expect(queue95(324, 64, w0, X)).toBeCloseTo(14.6, 1)
  })
})

// ── Zwischenzeit: Pauschale als Vorgabe, Staffelung als Annahme ───────────────
describe('Zwischenzeit T_Z', () => {
  test('Vorgabe: 5 s unabhängig vom Tempo', () => expect(tzFor('norm', [30, 30, 30])).toBe(5))
  test('Annahme: Staffelung, grösster Wert aller Arme', () => {
    expect(tzFor('staffel', [30, 30])).toBe(3)
    expect(tzFor('staffel', [30, 50, undefined])).toBe(4)
    expect(tzFor('staffel', [30, 60])).toBe(5)
  })
  test('neuere Datei: gespeicherte Wahl gilt', () => {
    expect(tzModeFromFile('norm', [50, 50])).toBe('norm')
    expect(tzModeFromFile('staffel', [60, 60])).toBe('staffel')
  })
  test('ältere Datei: bleibt gestaffelt, wenn das T_Z von der Pauschale abweicht', () => {
    expect(tzModeFromFile(undefined, [50, 50, 50])).toBe('staffel')
    expect(tzModeFromFile(undefined, [50, 60, 50])).toBe('norm')
  })
})

// ── Überlappender Fahrstreifen ────────────────────────────────────────────────
describe('Überlappender Fahrstreifen zählt nicht zu ΣQ_krit, wird aber gemeldet', () => {
  const lane = (id: string, armIndex: number, stream: string): Lane =>
    ({ id, armIndex, label: `FS ${id}`, streamIds: [stream] })
  const lanes = [lane('1', 0, 'q3'), lane('2', 0, 'q2'), lane('3', 1, 'q8'),
                 lane('4', 1, 'q7'), lane('5', 2, 'q6'), lane('6', 2, 'q4')]
  const phases = [{ id: 1, laneIds: ['1', '2', '3'] }, { id: 2, laneIds: ['4', '5'] }, { id: 3, laneIds: ['5', '6'] }]
  const volumes = { q2: 500, q3: 175, q8: 600, q7: 100, q4: 100, q6: 900 }
  const calc = (manualZ?: number) =>
    calculateLSAV2({ armCount: 3, volumes, lanes, phases, targetLos: 'D', tZ: 5, manualZ })

  test('Auto-Z: X ≥ 1 und Pfad 1500 über dem Maximum 1400', () => {
    const r = calc()
    expect(r.overloaded).toBe(false)
    expect(r.overlapIssues.length).toBe(1)
    const i = r.overlapIssues[0]
    expect(i.laneId).toBe('5')
    expect(i.X).toBeGreaterThanOrEqual(1)
    expect(i.pathSum).toBe(1500)
    expect(i.pathMax).toBeCloseTo(35 / 45 * 1800, 8)
    expect(i.pathExceeded).toBe(true)
  })
  test('Z = 120: Pfad reicht, X bleibt ≥ 1 (Grün folgt den Phasen) und wird gemeldet', () => {
    const i = calc(120).overlapIssues[0]
    expect(i.pathExceeded).toBe(false)
    expect(i.X).toBeGreaterThanOrEqual(1)
  })
  test('Grünzeitverteilung bleibt bei der Norm', () => {
    const r = calc(80)
    expect(r.sumQKrit).toBe(600 + 100 + 100)
    expect(r.phases[0].tGr).toBeCloseTo(65 * 600 / 800, 8)
  })
})

// ── Fussgängerstreifen überlastet ─────────────────────────────────────────────
describe('FGS mit X ≥ 1 wird gemeldet, das Grün bleibt beim Motorfahrzeugverkehr', () => {
  const lanes: Lane[] = [
    { id: 'a', armIndex: 0, label: 'a', streamIds: ['q2'] },
    { id: 'b', armIndex: 2, label: 'b', streamIds: ['q5'] },
    { id: 'fgs-A', armIndex: 0, label: 'FGS A', streamIds: ['fgs-A'], isFGS: true, fgLength: 9 },
  ]
  const phases = [{ id: 1, laneIds: ['a'] }, { id: 2, laneIds: ['b'] }, { id: 3, laneIds: ['fgs-A'] }]
  const calc = (fg: number) => calculateLSAV2({
    armCount: 4, volumes: { q2: 400, q5: 300, 'fgs-A': fg }, lanes, phases, targetLos: 'D', tZ: 5, manualZ: 60,
  })
  test('2000 Fg/h: gemeldet, Gesamt-VQS bleibt beim Motorfahrzeugverkehr', () => {
    const r = calc(2000)
    expect(r.fgsOverloaded).toEqual(['fgs-A'])
    expect(r.overallLos).toBe('B')
  })
  test('500 Fg/h: keine Meldung', () => expect(calc(500).fgsOverloaded).toEqual([]))
})

describe('LSA ohne Verkehr', () => {
  const { lanes, phases } = defaultLanesAndPhases(4)
  test('ohne Eingaben: kein Motorfahrzeugverkehr gemeldet', () => {
    expect(calculateLSAV2({ armCount: 4, volumes: {}, lanes, phases, targetLos: 'D' }).hasVehicleTraffic).toBe(false)
  })
  test('mit Verkehr: gemeldet', () => {
    expect(calculateLSAV2({ armCount: 4, volumes: { q2: 100 }, lanes, phases, targetLos: 'D' }).hasVehicleTraffic).toBe(true)
  })
})
