// Verifikation gegen empirische Tabellenwerte aus VSS 2011/308 (Kap. 4/5)
// PDF: "Verkehrsablauf an ungesteuerten Knoten innerorts", Sept. 2015

import { describe, test, expect } from 'vitest'
import { computeDelay, computeLOS, calculateVSS308, normalizeArm308 } from '../vss2011308Calculator'
import type { ArmInput } from '../vss2011308Calculator'
import { conformFixed } from '../conform'

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

// ── Tab. 15 — Empirische Standorte (S. 43), über die Engine gerechnet ────────
// Einmündung ohne Fussgänger*innen: Hauptstrom A→C, ein Nebenstrom B→C.
// Die Engine rechnet mit S_m1 = 1750 und S_m2 = 1650 Fz/h (Tab. 8/13).
const tab15 = (qHS: number, qNS: number) => calculateVSS308({
  type: '3arm',
  arms: [
    { name: '', roadType: 'HS', right: 0,   straight: qHS, left: 0, fg: 0 },
    { name: '', roadType: 'HS', right: 0,   straight: 0,   left: 0, fg: 0 },
    { name: '', roadType: 'NS', right: qNS, straight: 0,   left: 0, fg: 0 },
  ],
}).streams.find(s => s.id === 'B→C')!

describe('Tab. 15 — Goldbrunnenplatz 2', () => {
  // Rang 1: Q = 400 Fz/h; Rang 2: Q = 190 Fz/h, empirische Wartezeit ≈ 6 s
  const s = tab15(400, 190)
  test('β = (1 − 400/1750)³', () => approx(s.beta, (1 - 400 / 1750) ** 3, 1e-9))
  test('L = 1650 · β', () => approx(s.capacity, 1650 * s.beta, 1e-6))
  test('w zwischen 3 s und 12 s (empirisch 6 s)', () => {
    expect(s.delay).toBeGreaterThan(3)
    expect(s.delay).toBeLessThan(12)
  })
})

describe('Tab. 15 — Uster 2 (Überlast)', () => {
  // Rang 1: Q = 642 Fz/h; Rang 2: Q = 434 Fz/h → x > 1
  const s = tab15(642, 434)
  test('x > 1 → w = ∞, QS F', () => {
    expect(s.utilizationDegree).toBeGreaterThan(1)
    expect(s.delay).toBe(Infinity)
    expect(s.levelOfService).toBe('F')
  })
})

// ── LOS-Klassierung ───────────────────────────────────────────────────────────

describe('computeLOS: Grenzen der SN 640 022, Tab. 3 (S. 10), auf die der Bericht verweist (S. 86)', () => {
  test('0 s → A', () => expect(computeLOS(0)).toBe('A'))
  test('9,9 s → A', () => expect(computeLOS(9.9)).toBe('A'))
  test('10 s → B', () => expect(computeLOS(10)).toBe('B'))
  test('14,9 s → B', () => expect(computeLOS(14.9)).toBe('B'))
  test('15 s → C', () => expect(computeLOS(15)).toBe('C'))
  test('18,1 s → C (Fz1 aus Tab. 26)', () => expect(computeLOS(18.1)).toBe('C'))
  test('24,9 s → C', () => expect(computeLOS(24.9)).toBe('C'))
  test('25 s → D', () => expect(computeLOS(25)).toBe('D'))
  test('45 s → D', () => expect(computeLOS(45)).toBe('D'))
  test('46 s → E', () => expect(computeLOS(46)).toBe('E'))
  test('∞ → F', () => expect(computeLOS(Infinity)).toBe('F'))
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

// ── Per-Strom-Ergebnisse (Kap. 5) ─────────────────────────────────────────────

describe('calculateVSS308 — Strom-Topologie', () => {
  test('4-Arm ergibt 12 Ströme (4 Arme × 3 Richtungen)', () => {
    const r = calculateVSS308({
      type: '4arm',
      arms: [
        { name: '', roadType: 'HS', right: 100, straight: 400, left: 100, fg: 0 },
        { name: '', roadType: 'HS', right: 100, straight: 400, left: 100, fg: 0 },
        { name: '', roadType: 'NS', right: 80,  straight: 0,   left: 80,  fg: 0 },
        { name: '', roadType: 'NS', right: 80,  straight: 0,   left: 80,  fg: 0 },
      ],
    })
    expect(r.streams.length).toBe(12)
    expect(r.arms[0].streams.length).toBe(3)
  })

  test('3-Arm ergibt 8 Ströme', () => {
    const r = calculateVSS308({
      type: '3arm',
      arms: [
        { name: '', roadType: 'HS', right: 100, straight: 400, left: 0, fg: 0 },
        { name: '', roadType: 'HS', right: 100, straight: 400, left: 0, fg: 0 },
        { name: '', roadType: 'NS', right: 80,  straight: 0,   left: 80, fg: 0 },
      ],
    })
    expect(r.streams.length).toBe(8)
  })

  test('Arm als Mischstreifen: ΣQ über Leistungsfähigkeit → QS F, auch wenn jeder Strom < 1', () => {
    const r = calculateVSS308({
      type: '4arm',
      arms: [
        { name: '', roadType: 'HS', right: 600, straight: 700, left: 600, fg: 0 },
        { name: '', roadType: 'HS', right: 0,   straight: 0,   left: 0,   fg: 0 },
        { name: '', roadType: 'NS', right: 0,   straight: 0,   left: 0,   fg: 0 },
        { name: '', roadType: 'NS', right: 0,   straight: 0,   left: 0,   fg: 0 },
      ],
    })
    const armA = r.arms[0]
    expect(armA.streams.every(s => s.utilizationDegree < 1)).toBe(true)
    // x_Arm = Σ Q_i / L_i, ohne Fg und ohne Gegenverkehr L_i = S: Geradeaus+Rechts S_m1, Linksabbieger S_m2
    approx(armA.utilizationDegree, 1300 / 1750 + 600 / 1650, 1e-9)
    expect(armA.levelOfService).toBe('F')
    expect(r.overallLevelOfService).toBe('F')
  })

  test('Arm-Wartezeit folgt aus ΣQ und L_Arm (Gl. 1)', () => {
    const r = calculateVSS308({
      type: '3arm',
      arms: [
        { name: '', roadType: 'HS', right: 50, straight: 200, left: 0,  fg: 0 },
        { name: '', roadType: 'HS', right: 0,  straight: 200, left: 50, fg: 0 },
        { name: '', roadType: 'NS', right: 60, straight: 0,   left: 40, fg: 0 },
      ],
    })
    const b = r.arms[2]
    const x = b.streams.filter(s => s.Q > 0).reduce((sum, s) => sum + s.Q / s.capacity, 0)
    expect(x).toBeLessThan(1)
    approx(b.utilizationDegree, x, 1e-9)
    approx(b.capacity, 100 / x, 1e-6)
    approx(b.delay, computeDelay(100, 100 / x, 1.0), 1e-6)
  })

  test('3-Arm: Felder ohne Zielarm (A-links, C-rechts, B-geradeaus) wirken nicht', () => {
    const calc = (hidden: number) => calculateVSS308({
      type: '3arm',
      arms: [
        { name: '', roadType: 'HS', right: 100,    straight: 400, left: hidden, fg: 0 },
        { name: '', roadType: 'HS', right: hidden, straight: 400, left: 100,    fg: 0 },
        { name: '', roadType: 'NS', right: 80,     straight: hidden, left: 80,  fg: 0 },
      ],
    })
    const mit = calc(100), ohne = calc(0)
    expect(mit.streams.map(s => s.capacity)).toEqual(ohne.streams.map(s => s.capacity))
    expect(mit.arms.map(a => a.qFz)).toEqual(ohne.arms.map(a => a.qFz))
    expect(mit.overallLevelOfService).toBe(ohne.overallLevelOfService)
    // Strom ohne Zielarm trägt keine Belastung
    expect(mit.streams.filter(s => s.toArmIndex < 0).every(s => s.Q === 0)).toBe(true)
  })

  test('Strom-IDs korrekt', () => {
    const r = calculateVSS308({
      type: '4arm',
      arms: [
        { name: '', roadType: 'HS', right: 100, straight: 400, left: 100, fg: 0 },
        { name: '', roadType: 'HS', right: 100, straight: 400, left: 100, fg: 0 },
        { name: '', roadType: 'NS', right: 80,  straight: 0,   left: 80,  fg: 0 },
        { name: '', roadType: 'NS', right: 80,  straight: 0,   left: 80,  fg: 0 },
      ],
    })
    const ids = r.streams.map(s => s.id)
    expect(ids).toContain('A→C')
    expect(ids).toContain('A→B')
    expect(ids).toContain('C→A')
    expect(ids).toContain('B→A')
    expect(ids).toContain('D→C')
  })
})

// ── Kap. 5: Cross-Fg-Korrektur ───────────────────────────────────────────────
// HS-Fahrzeug A→C passiert FgA (Einfahrt) UND FgC (Ausfahrt)
// β_A→C = (1−y_FgA)³ × (1−y_FgC)³   (Abb. 23, Gl. 12)

describe('calculateVSS308 — Cross-Fg HS (Kap. 5)', () => {
  // Arm A: fg=100, Arm C: fg=150, Arm B: fg=0, Arm D: fg=0
  const result = calculateVSS308({
    type: '4arm',
    arms: [
      { name: 'A', roadType: 'HS', right: 0, straight: 400, left: 0, fg: 100 },
      { name: 'C', roadType: 'HS', right: 0, straight: 400, left: 0, fg: 150 },
      { name: 'B', roadType: 'NS', right: 80, straight: 0, left: 80, fg: 0 },
      { name: 'D', roadType: 'NS', right: 80, straight: 0, left: 80, fg: 0 },
    ],
  })

  test('A→C: β = (1−y_FgA)³ × (1−y_FgC)³', () => {
    const s = result.streams.find(s => s.id === 'A→C')!
    const expected = ((1 - 100/900) ** 3) * ((1 - 150/900) ** 3)
    approx(s.beta, expected, 0.001)
  })

  test('A→C: β kleiner als ohne Austritts-Fg', () => {
    const betaEntryOnly = (1 - 100/900) ** 3
    const s = result.streams.find(s => s.id === 'A→C')!
    expect(s.beta).toBeLessThan(betaEntryOnly)
  })

  test('C→A: β = (1−y_FgC)³ × (1−y_FgA)³  (symmetrisch zu A→C)', () => {
    const sAC = result.streams.find(s => s.id === 'A→C')!
    const sCA = result.streams.find(s => s.id === 'C→A')!
    // A→C: entry=FgA=100, exit=FgC=150 → β = (1-100/900)³ × (1-150/900)³
    // C→A: entry=FgC=150, exit=FgA=100 → β = (1-150/900)³ × (1-100/900)³  (gleich)
    expect(sAC.beta).toBeCloseTo(sCA.beta, 5)
  })

  test('A→B: nur Entry-Fg (FgA), kein Exit-Fg (FgB=0)', () => {
    const sAB = result.streams.find(s => s.id === 'A→B')!
    const expected = (1 - 100/900) ** 3
    approx(sAB.beta, expected, 0.001)
  })

  test('A→C hat kleinere Kapazität als A→B (wegen Austritts-Fg FgC)', () => {
    const sAC = result.streams.find(s => s.id === 'A→C')!
    const sAB = result.streams.find(s => s.id === 'A→B')!
    expect(sAC.capacity).toBeLessThan(sAB.capacity)
  })
})

describe('calculateVSS308 — Cross-Fg NS (Kap. 5)', () => {
  // Arm A: fg=150, Arm C: fg=0, Arm B: fg=200, Arm D: fg=0
  // B→A: entry=FgB, exit=FgA  → β = (1−y_HS)³ × (1−y_FgB)³ × (1−y_FgA)³
  // B→C: entry=FgB, exit=FgC=0 → β = (1−y_HS)³ × (1−y_FgB)³

  const arms_base = [
    { name: 'A', roadType: 'HS' as const, right: 100, straight: 400, left: 100, fg: 0 },
    { name: 'C', roadType: 'HS' as const, right: 100, straight: 400, left: 100, fg: 0 },
    { name: 'B', roadType: 'NS' as const, right: 80,  straight: 0,   left: 80,  fg: 200 },
    { name: 'D', roadType: 'NS' as const, right: 80,  straight: 0,   left: 80,  fg: 0 },
  ]
  const arms_with_FgA = arms_base.map((a, i) => i === 0 ? { ...a, fg: 150 } : a)

  const r_without = calculateVSS308({ type: '4arm', arms: arms_base })
  const r_with    = calculateVSS308({ type: '4arm', arms: arms_with_FgA })

  test('B→A mit FgA=150 hat kleinere β als ohne FgA', () => {
    const s_no  = r_without.streams.find(s => s.id === 'B→A')!
    const s_yes = r_with.streams.find(s => s.id === 'B→A')!
    expect(s_yes.beta).toBeLessThan(s_no.beta)
  })

  test('B→C nicht betroffen von FgA (liegt nicht auf B→C Pfad)', () => {
    // B→C: from=B(fg=200), to=C(fg=0) — FgA steht nicht als eigener Faktor in β.
    // Mittelbar wirkt FgA über y_HS: Ströme über den Streifen A haben S = 1650.
    const s_yes = r_with.streams.find(s => s.id === 'B→C')!
    const yHS = (600 + 400 + 100) / 1650 + 100 / 1750  // nur C→D ohne Fg
    expect(s_yes.beta).toBeCloseTo((1 - yHS) ** 3 * (1 - 200 / 900) ** 3, 8)
  })

  test('B→A β korrekt: (1−y_HS)³ × (1−y_FgB)³ × (1−y_FgA)³', () => {
    const yHS  = (600 + 400 + 100) / 1650 + 100 / 1750
    const yFgB = 200 / 900
    const yFgA = 150 / 900
    const expected = ((1 - yHS) ** 3) * ((1 - yFgB) ** 3) * ((1 - yFgA) ** 3)
    const s = r_with.streams.find(s => s.id === 'B→A')!
    approx(s.beta, expected, 0.001)
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

// ── Szenario II (Abb. 22/35, Gl. 6) — parallele höherrangige Fg-Ströme ───────
// Ein Fussgängerstreifen auf einem HS-Arm, den der NS-Strom nicht selbst
// überfährt, blockiert während seiner Belegung den senkrechten HS-Konflikt-
// verkehr → Kapazitätsvorteil (Berichtsbeispiel Kap. 5.2: L_Fz1 = S·y_Fg2 +
// S·(1−y_Fg2)·β). HS-Geradeaus und -Rechts bleiben Szenario I (nichts blockiert
// Fussgänger; vgl. Berichtsbeispiel L_Fz2 = S·β). Der HS-Linksabbieger hat Gegenverkehr
// als senkrechten Strom und folgt dem NS-Strom (eigener Test weiter unten).

describe('calculateVSS308 — Szenario II (parallele Fg)', () => {
  const armsBase = [
    { name: 'A', roadType: 'HS' as const, right: 100, straight: 400, left: 100, fg: 0 },
    { name: 'C', roadType: 'HS' as const, right: 100, straight: 400, left: 100, fg: 0 },
    { name: 'B', roadType: 'NS' as const, right: 80, straight: 0, left: 80, fg: 0 },
    { name: 'D', roadType: 'NS' as const, right: 80, straight: 0, left: 80, fg: 0 },
  ]
  // Fg=180 auf HS-Arm C: B→A (überfährt A, nicht C) profitiert;
  // B→C (überfährt C → FgC ist dort senkrecht) profitiert nicht
  const armsFgC = armsBase.map((a, i) => i === 1 ? { ...a, fg: 180 } : a)
  const rBase = calculateVSS308({ type: '4arm', arms: armsBase })
  const rFgC  = calculateVSS308({ type: '4arm', arms: armsFgC })

  test('B→A: Szenario II, y_par = y_FgC', () => {
    const s = rFgC.streams.find(s => s.id === 'B→A')!
    expect(s.scenario).toBe('II')
    approx(s.yParallel, 180 / 900, 0.001)
  })
  test('B→A: L = S·y_par + S·(1−y_par)·β (Gl. 6)', () => {
    const s = rFgC.streams.find(s => s.id === 'B→A')!
    const yPar = 180 / 900
    // Seit der Normprüfung vom 11.11.2026 wartet der Linksabbieger auch auf Geradeaus und Rechts der Gegenseite (D rechts 80):
    // Dieser Faktor steht ausserhalb der Klammer, weil der Fussgängerstreifen auf C den Verkehr von D nicht anhält
    const betaGegen = (1 - 80 / 1650) ** 3
    approx(s.capacity, betaGegen * 1650 * (yPar + (1 - yPar) * s.beta / betaGegen), 0.5)
  })
  test('B→A: Kapazität grösser als Szenario I (S·β)', () => {
    const s = rFgC.streams.find(s => s.id === 'B→A')!
    expect(s.capacity).toBeGreaterThan(1650 * s.beta)
  })
  test('B→C: überfährt FgC → Szenario I, Kapazität sinkt (FgC senkrecht)', () => {
    const s = rFgC.streams.find(s => s.id === 'B→C')!
    const sBase = rBase.streams.find(s => s.id === 'B→C')!
    expect(s.scenario).toBe('I')
    expect(s.capacity).toBeLessThan(sBase.capacity)
  })
  test('B→D: überfährt weder A noch C → Szenario II', () => {
    expect(rFgC.streams.find(s => s.id === 'B→D')!.scenario).toBe('II')
  })
  test('HS-Ströme bleiben Szenario I', () => {
    for (const id of ['A→C', 'C→A', 'A→B']) {
      expect(rFgC.streams.find(s => s.id === id)!.scenario).toBe('I')
    }
  })
  test('Ohne HS-Verkehr kein Szenario II (nichts zu blockieren)', () => {
    const armsNoHS = armsFgC.map(a =>
      a.roadType === 'HS' ? { ...a, right: 0, straight: 0, left: 0 } : a)
    const r = calculateVSS308({ type: '4arm', arms: armsNoHS })
    expect(r.streams.find(s => s.id === 'B→A')!.scenario).toBe('I')
  })
  test('Mittelinsel auf parallelem Streifen halbiert y_par', () => {
    const armsIsland = armsFgC.map((a, i) => i === 1 ? { ...a, mittelinsel: true } : a)
    const r = calculateVSS308({ type: '4arm', arms: armsIsland })
    approx(r.streams.find(s => s.id === 'B→A')!.yParallel, 90 / 900, 0.001)
  })
})


// ── HS-Linksabbieger: Rang 2 gegenüber dem Gegenverkehr (Tab. 25, abbiegende Fz) ──
describe('calculateVSS308 — HS-Linksabbieger gegen Gegenverkehr', () => {
  const r = calculateVSS308({
    type: '3arm',
    arms: [
      { name: 'A', roadType: 'HS', right: 50, straight: 600, left: 0,  fg: 0 },
      { name: 'C', roadType: 'HS', right: 0,  straight: 600, left: 50, fg: 0 },
      { name: 'B', roadType: 'NS', right: 100, straight: 0,  left: 100, fg: 0 },
    ],
  })
  const sCB = r.streams.find(s => s.id === 'C→B')!
  const sCA = r.streams.find(s => s.id === 'C→A')!

  test('β = (1 − (q2 + q3)/1750)³ (Gegenverkehr Geradeaus + Rechts von A)', () =>
    approx(sCB.beta, (1 - (600 + 50) / 1750) ** 3, 1e-9))
  test('S = 1650 Fz/h (Rang 2), L = S·β', () => {
    expect(sCB.saturation).toBe(1650)
    approx(sCB.capacity, 1650 * sCB.beta, 1e-6)
  })
  test('HS-Geradeaus bleibt Rang 1 (β = 1, S = 1750)', () => {
    expect(sCA.beta).toBe(1)
    expect(sCA.saturation).toBe(1750)
  })
  test('ohne Gegenverkehr: β = 1', () => {
    const r0 = calculateVSS308({
      type: '3arm',
      arms: [
        { name: 'A', roadType: 'HS', right: 0, straight: 0,   left: 0,  fg: 0 },
        { name: 'C', roadType: 'HS', right: 0, straight: 600, left: 50, fg: 0 },
        { name: 'B', roadType: 'NS', right: 0, straight: 0,   left: 0,  fg: 0 },
      ],
    })
    expect(r0.streams.find(s => s.id === 'C→B')!.beta).toBe(1)
  })
})

// ── Trottoirüberfahrt an NS-Armen: gerechnet wie Fussgängerstreifen (Annahme) ──
describe('Trottoirüberfahrt — gleiche Rechnung wie Fussgängerstreifen', () => {
  const hs = (fg = 0): ArmInput => ({ name: '', roadType: 'HS', right: 100, straight: 400, left: 100, fg })
  const ns = (extra: Partial<ArmInput> = {}): ArmInput =>
    ({ name: '', roadType: 'NS', right: 80, straight: 40, left: 80, fg: 0, ...extra })
  // Ergebnis ohne die Bezeichnung der Querung (die unterscheidet sich gewollt)
  const rechnung = (arms: ArmInput[]) => {
    const r = calculateVSS308({ type: arms.length === 3 ? '3arm' : '4arm', arms })
    return { streams: r.streams, arms: r.arms.map(a => ({ ...a, querung: undefined })), los: r.overallLevelOfService }
  }

  test('4-Arm: Trottoirüberfahrt an B und D = Fussgängerstreifen ohne Mittelinsel', () => {
    const fgs = rechnung([hs(150), hs(), ns({ fg: 300, rho: 2, querung: 'fgs' }), ns({ fg: 120, querung: 'fgs' })])
    const tue = rechnung([hs(150), hs(),
      ns({ fg: 300, rho: 2, querung: 'trottoirueberfahrt', mittelinsel: true }),
      ns({ fg: 120, querung: 'trottoirueberfahrt' })])
    expect(tue).toEqual(fgs)
    // Kontrolle: die Querung wirkt überhaupt
    const ohne = rechnung([hs(150), hs(), ns(), ns()])
    expect(fgs.arms[2].capacity).toBeLessThan(ohne.arms[2].capacity)
  })

  test('3-Arm: Trottoirüberfahrt an B = Fussgängerstreifen', () => {
    const fgs = rechnung([hs(), hs(), ns({ fg: 250, querung: 'fgs' })])
    const tue = rechnung([hs(), hs(), ns({ fg: 250, querung: 'trottoirueberfahrt' })])
    expect(tue).toEqual(fgs)
  })

  test('Mittelinsel bei Trottoirüberfahrt immer aus', () => {
    const n = normalizeArm308(ns({ fg: 200, querung: 'trottoirueberfahrt', mittelinsel: true }))
    expect(n.querung).toBe('trottoirueberfahrt')
    expect(n.mittelinsel).toBe(false)
  })

  test('Ergebnis benennt die Querung je Arm', () => {
    const r = calculateVSS308({ type: '4arm',
      arms: [hs(100), hs(), ns({ fg: 200, querung: 'trottoirueberfahrt' }), ns()] })
    expect(r.arms.map(a => a.querung)).toEqual(['fgs', 'keine', 'trottoirueberfahrt', 'keine'])
  })

  test('HS-Arm akzeptiert keine Trottoirüberfahrt → Fussgängerstreifen', () => {
    const arm: ArmInput = { ...hs(200), querung: 'trottoirueberfahrt', mittelinsel: true }
    const n = normalizeArm308(arm)
    expect(n.querung).toBe('fgs')
    expect(n.mittelinsel).toBe(true)  // Mittelinsel am Fussgängerstreifen bleibt
    expect(rechnung([arm, hs(), ns()])).toEqual(rechnung([{ ...arm, querung: 'fgs' }, hs(), ns()]))
  })

  test('querung "keine" → kein Fussgängervolumen', () => {
    expect(rechnung([hs(), hs(), ns({ fg: 300, querung: 'keine' })]))
      .toEqual(rechnung([hs(), hs(), ns()]))
  })

  test('ältere Datei ohne querung: fg > 0 → Fussgängerstreifen, sonst keine', () => {
    // wie beim Laden in VSS308App: Vorlage mit offener querung, danach bereinigen
    const vorlage: ArmInput[] = [hs(), hs(), ns(), ns()].map(a => ({ ...a, rho: 1, mittelinsel: false, querung: undefined }))
    const datei = [
      { name: 'A', roadType: 'HS', right: 100, straight: 400, left: 100, fg: 150, rho: 2, mittelinsel: true },
      { name: 'C', roadType: 'HS', right: 100, straight: 400, left: 100, fg: 0, rho: 1, mittelinsel: false },
      { name: 'B', roadType: 'NS', right: 80, straight: 40, left: 80, fg: 300, rho: 1, mittelinsel: false },
      { name: 'D', roadType: 'NS', right: 80, straight: 40, left: 80, fg: 0, rho: 1, mittelinsel: false },
    ]
    const geladen = conformFixed(vorlage, datei).map(normalizeArm308)
    expect(geladen.map(a => a.querung)).toEqual(['fgs', 'keine', 'fgs', 'keine'])
    expect(geladen[0].mittelinsel).toBe(true)
    // Rechnung unverändert gegenüber der Datei ohne das Feld
    expect(calculateVSS308({ type: '4arm', arms: geladen }))
      .toEqual(calculateVSS308({ type: '4arm', arms: datei as ArmInput[] }))
  })
})

// ── Tab. 26 (S. 68): Berichtsbeispiel Universitäts-/Vogelsangstrasse ──────────
// Fz2 gewährt Fg2 Vortritt und ist damit nachrangig (S = 1650, C = 1); Fz1 (S. 64–67)
// wartet auf Fg1 und Fz2 und hat Fg2 als parallelen Strom (Szenario II). Ohne Tram.
describe('Tab. 26 — Fahrzeuge, die Fussgänger*innen Vortritt gewähren', () => {
  const r = calculateVSS308({
    type: '3arm',
    arms: [
      { name: 'A', roadType: 'HS', right: 0, straight: 480, left: 0, fg: 94 },
      { name: 'C', roadType: 'HS', right: 0, straight: 0,   left: 0, fg: 0 },
      { name: 'B', roadType: 'NS', right: 370, straight: 0, left: 0, fg: 58 },
    ],
  })
  const fz2 = r.streams.find(s => s.id === 'A→C')!
  const fz1 = r.streams.find(s => s.id === 'B→C')!

  test('Fz2: S = 1650, L = 1185, w = 4.1 s', () => {
    expect(fz2.saturation).toBe(1650)
    approx(fz2.capacity, 1185, 1)
    approx(fz2.delay, 4.1, 0.05)
  })
  test('Fz1: L = 603, w = 18.2 s (y_Fz2 mit S = 1650)', () => {
    expect(fz1.scenario).toBe('II')
    approx(fz1.capacity, 603, 1.5)
    approx(fz1.delay, 18.2, 0.2)
  })
  test('Arm A folgt dem Strom: S = 1650, Wartezeit wie Fz2', () => {
    expect(r.arms[0].saturation).toBe(1650)
    approx(r.arms[0].delay, fz2.delay, 1e-9)
  })
  test('ohne Fussgänger*innen bleibt Rang 1: S = 1750, C = 0.5', () => {
    const o = calculateVSS308({
      type: '3arm',
      arms: [
        { name: 'A', roadType: 'HS', right: 0, straight: 480, left: 0, fg: 0 },
        { name: 'C', roadType: 'HS', right: 0, straight: 0,   left: 0, fg: 0 },
        { name: 'B', roadType: 'NS', right: 370, straight: 0, left: 0, fg: 0 },
      ],
    })
    const s = o.streams.find(x => x.id === 'A→C')!
    expect(s.saturation).toBe(1750)
    approx(s.delay, computeDelay(480, 1750, 0.5), 1e-9)
    expect(o.arms[0].saturation).toBe(1750)
    approx(o.arms[0].delay, s.delay, 1e-9)
    // y_HS mit 1750: Fz1 ohne Fg
    approx(o.streams.find(x => x.id === 'B→C')!.beta, (1 - 480 / 1750) ** 3, 1e-9)
  })
  test('Fg nur auf der Ausfahrt genügt: Strom hat C = 1, der Nachbarstrom nicht', () => {
    const o = calculateVSS308({
      type: '4arm',
      arms: [
        { name: 'A', roadType: 'HS', right: 100, straight: 400, left: 0, fg: 0 },
        { name: 'C', roadType: 'HS', right: 0,   straight: 0,   left: 0, fg: 200 },
        { name: 'B', roadType: 'NS', right: 0, straight: 0, left: 0, fg: 0 },
        { name: 'D', roadType: 'NS', right: 0, straight: 0, left: 0, fg: 0 },
      ],
    })
    expect(o.streams.find(x => x.id === 'A→C')!.saturation).toBe(1650)
    expect(o.streams.find(x => x.id === 'A→B')!.saturation).toBe(1750)
  })
})

// ── HS-Linksabbieger: Szenario II (Abb. 22, S. 60; Gl. 6, S. 61) ──────────────
describe('HS-Linksabbieger mit parallelem Fussgängerstreifen', () => {
  const arms = (fgC: number): ArmInput[] => [
    { name: 'A', roadType: 'HS', right: 0,   straight: 500, left: 100, fg: 0 },
    { name: 'C', roadType: 'HS', right: 100, straight: 500, left: 0,   fg: fgC },
    { name: 'B', roadType: 'NS', right: 0, straight: 0, left: 0, fg: 0 },
    { name: 'D', roadType: 'NS', right: 0, straight: 0, left: 0, fg: 0 },
  ]
  const left = (fgC: number) =>
    calculateVSS308({ type: '4arm', arms: arms(fgC) }).streams.find(s => s.id === 'A→D')!

  test('ohne Fg: Szenario I, y_gegen mit S = 1750', () => {
    const s = left(0)
    expect(s.scenario).toBe('I')
    approx(s.capacity, 1650 * (1 - 600 / 1750) ** 3, 1e-6)
  })
  test('Fg auf dem Gegenarm: Szenario II; Gegenverkehr hat dort S = 1650', () => {
    const s = left(300)
    const y = 300 / 900
    const beta = (1 - 600 / 1650) ** 3
    expect(s.scenario).toBe('II')
    approx(s.yParallel, y, 1e-9)
    approx(s.beta, beta, 1e-9)
    approx(s.capacity, 1650 * (y + (1 - y) * beta), 1e-6)
  })
  test('Der Streifen nützt dem Linksabbieger trotz kleinerem β', () => {
    expect(left(300).beta).toBeLessThan(left(0).beta)
    expect(left(300).capacity).toBeGreaterThan(left(0).capacity)
  })
  test('Eigener Streifen (Einfahrt) bleibt senkrecht: kein Szenario II', () => {
    const a = arms(0).map((x, i) => i === 0 ? { ...x, fg: 300 } : x)
    expect(calculateVSS308({ type: '4arm', arms: a }).streams.find(s => s.id === 'A→D')!.scenario).toBe('I')
  })
  test('ohne Gegenverkehr nichts zu blockieren: Szenario I', () => {
    const a = arms(300).map((x, i) => i === 1 ? { ...x, right: 0, straight: 0 } : x)
    expect(calculateVSS308({ type: '4arm', arms: a }).streams.find(s => s.id === 'A→D')!.scenario).toBe('I')
  })
})

// ── Strom ohne Verkehr ────────────────────────────────────────────────────────
describe('Strom ohne Verkehr bei L = 0', () => {
  test('keine Überlastung, keine Wartezeit', () => {
    const r = calculateVSS308({
      type: '3arm',
      arms: [
        { name: 'A', roadType: 'HS', right: 0, straight: 1000, left: 0, fg: 0 },
        { name: 'C', roadType: 'HS', right: 0, straight: 900,  left: 0, fg: 0 },
        { name: 'B', roadType: 'NS', right: 0, straight: 0,    left: 0, fg: 0 },
      ],
    })
    const s = r.streams.find(x => x.id === 'B→A')!
    expect(s.capacity).toBe(0)
    expect(s.delay).toBe(0)
    expect(s.levelOfService).toBe('A')
  })
})
