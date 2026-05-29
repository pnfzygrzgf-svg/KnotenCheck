// Verifikation gegen VSS 40 023a — Tab. 4, Tab. 7, Tab. 2

import { describe, test, expect } from 'vitest'
import { streamDelay, losFromDelay, calculateLSA } from '../lsaCalculator'
import type { LSAInput } from '../lsaCalculator'

const approx = (actual: number, expected: number, tol: number) =>
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tol)

// ── LOS-Klassierung (Tab. 4) ──────────────────────────────────────────────────

describe('losFromDelay — Tab. 4', () => {
  test('≤20s → A',   () => { expect(losFromDelay(0)).toBe('A');  expect(losFromDelay(20)).toBe('A') })
  test('21s → B',    () => expect(losFromDelay(21)).toBe('B'))
  test('≤35s → B',   () => expect(losFromDelay(35)).toBe('B'))
  test('36s → C',    () => expect(losFromDelay(36)).toBe('C'))
  test('≤50s → C',   () => expect(losFromDelay(50)).toBe('C'))
  test('51s → D',    () => expect(losFromDelay(51)).toBe('D'))
  test('≤70s → D',   () => expect(losFromDelay(70)).toBe('D'))
  test('71s → E',    () => expect(losFromDelay(71)).toBe('E'))
  test('≤100s → E',  () => expect(losFromDelay(100)).toBe('E'))
  test('101s → F',   () => expect(losFromDelay(101)).toBe('F'))
  test('∞ → F',      () => expect(losFromDelay(Infinity)).toBe('F'))
})

// ── streamDelay — Formel nach Ziffer 12 ──────────────────────────────────────
// Verifikation gegen Tab. 7 (VSS 40 023a S. 20), Umlaufzeit Z=80s
// Toleranz ±3s (Tab. 7-Werte wurden aus Diagramm Abb. 14 abgelesen)

describe('streamDelay — Verifikation Tab. 7 (Z=80s)', () => {
  test('Q=0 → wm=0, X=0', () => {
    const r = streamDelay(0, 0.4, 80)
    expect(r.wm).toBe(0)
    expect(r.X).toBe(0)
  })

  test('X≥1 → Infinity', () => {
    const r = streamDelay(1000, 0.4, 80)  // L=0.4*1800=720 < 1000 → X>1
    expect(r.wm).toBe(Infinity)
  })

  // Fahrstreifen 3: Q=600, λ=0.400, Z=80 → X≈0.833, w_m≈34s (LOS B)
  test('Fahrstreifen 3: Q=600 λ=0.400 → w_m≈34s LOS B', () => {
    const r = streamDelay(600, 0.400, 80)
    approx(r.X, 0.833, 0.005)
    approx(r.wm, 34, 3)
    expect(losFromDelay(r.wm)).toBe('B')
  })

  // Fahrstreifen 4: Q=275, λ=0.188, Z=80 → X≈0.814, w_m≈53s (LOS D)
  test('Fahrstreifen 4: Q=275 λ=0.188 → w_m≈53s LOS D', () => {
    const r = streamDelay(275, 0.188, 80)
    approx(r.X, 0.814, 0.005)
    approx(r.wm, 53, 3)
    expect(losFromDelay(r.wm)).toBe('D')
  })

  // Fahrstreifen 6: Q=325, λ=0.225, Z=80 → X≈0.802, w_m≈46s (LOS C)
  test('Fahrstreifen 6: Q=325 λ=0.225 → w_m≈46s LOS C', () => {
    const r = streamDelay(325, 0.225, 80)
    approx(r.X, 0.802, 0.005)
    approx(r.wm, 46, 3)
    expect(losFromDelay(r.wm)).toBe('C')
  })

  // Fahrstreifen 2: Q=500, λ=0.400, Z=80 → X≈0.694, w_m≈26s (LOS B)
  test('Fahrstreifen 2: Q=500 λ=0.400 → w_m≈26s LOS B', () => {
    const r = streamDelay(500, 0.400, 80)
    approx(r.wm, 26, 3)
    expect(losFromDelay(r.wm)).toBe('B')
  })
})

// ── Z-Auswahl (Tab. 2) ────────────────────────────────────────────────────────

describe('calculateLSA — Z-Auswahl nach Tab. 2', () => {
  test('ΣQ_krit=0 → Z=45 (erste Tab-Zeile genügt)', () => {
    const r = calculateLSA({ armCount: 3, phaseCount: 3,
      arms: [{name:'',left:0,straight:0,right:0},{name:'',left:0,straight:0,right:0},{name:'',left:0,straight:0,right:0}]})
    expect(r.Z).toBe(45)
  })

  // ΣQ_krit=1200, 3-phasig → qKritMax(Z=45)=1200 nicht strikt grösser → Z=50
  test('ΣQ_krit=1200 3ph → Z=50', () => {
    // q8=600, q7=275 (aber 3-ph Plan: q7 in Phase2 allein, q4/q6 in Phase3)
    // Wähle q8=600, q7=400, q4=0, q6=200 → ΣQ_krit=600+400+200=1200
    const r = calculateLSA({
      armCount: 3, phaseCount: 3,
      arms: [
        { name: '', left: 0, straight: 600, right: 0 },   // A: q2=600
        { name: '', left: 400, straight: 0, right: 0 },   // C: q7=400
        { name: '', left: 0, straight: 0, right: 200 },   // B: q6=200
      ],
    })
    // Phase1: q2=600,q3=0,q8=0 → Q_krit=600
    // Phase2: q7=400 → Q_krit=400
    // Phase3: q4=0,q6=200 → Q_krit=200
    // ΣQ_krit=1200 → qKritMax(Z=45,3ph)=1200, nicht strikt > → Z=50
    expect(r.sumQKrit).toBe(1200)
    expect(r.Z).toBe(50)
  })

  // ΣQ_krit=1201, 3-phasig → Z=50 (qKritMax(Z=50,3ph)=1260 > 1201)
  test('ΣQ_krit=1201 3ph → Z=50', () => {
    const r = calculateLSA({
      armCount: 3, phaseCount: 3,
      arms: [
        { name: '', left: 0, straight: 601, right: 0 },
        { name: '', left: 400, straight: 0, right: 0 },
        { name: '', left: 0, straight: 0, right: 200 },
      ],
    })
    expect(r.sumQKrit).toBe(1201)
    expect(r.Z).toBe(50)
  })

  // 2-phasig: ΣQ_krit=1440, qKritMax(Z=50,2ph)=1440 nicht strikt grösser → Z=60
  test('ΣQ_krit=1440 2ph → Z=60', () => {
    const r = calculateLSA({
      armCount: 3, phaseCount: 2,
      arms: [
        { name: '', left: 0, straight: 900, right: 0 },  // q2=900 → Phase1 krit
        { name: '', left: 0, straight: 0, right: 0 },
        { name: '', left: 540, straight: 0, right: 0 },  // q4=540 → Phase2 krit
      ],
    })
    // Phase1={q2=900,q3=0,q7=0,q8=0} → Q_krit=900
    // Phase2={q4=540,q6=0} → Q_krit=540
    // ΣQ_krit=1440 → Z=60
    expect(r.sumQKrit).toBe(1440)
    expect(r.Z).toBe(60)
  })

  test('ΣQ_krit > 1575 3ph → overloaded=true', () => {
    const r = calculateLSA({
      armCount: 3, phaseCount: 3,
      arms: [
        { name: '', left: 0, straight: 1000, right: 0 },
        { name: '', left: 500, straight: 0, right: 0 },
        { name: '', left: 0, straight: 0, right: 200 },
      ],
    })
    // ΣQ_krit = 1000+500+200 = 1700 > 1575
    expect(r.overloaded).toBe(true)
    expect(r.Z).toBe(120)
  })
})

// ── Integrations-Test: vollständige calculateLSA ─────────────────────────────

describe('calculateLSA — Integration 4-Arm 3-phasig symmetrisch', () => {
  const input: LSAInput = {
    armCount: 4,
    phaseCount: 3,
    arms: [
      { name: 'A', left: 100, straight: 400, right: 100 },  // q1=100,q2=400,q3=100
      { name: 'C', left: 100, straight: 400, right: 100 },  // q7=100,q8=400,q9=100
      { name: 'B', left: 150, straight: 200, right: 100 },  // q4=150,q5=200,q6=100
      { name: 'D', left: 150, straight: 200, right: 100 },  // q10=150,q11=200,q12=100
    ],
  }
  const result = calculateLSA(input)

  // Phase1={q2,q3,q8,q9} krit=max(400,100,400,100)=400
  // Phase2={q5,q6,q11,q12} krit=max(200,100,200,100)=200
  // Phase3={q1,q4,q7,q10} krit=max(100,150,100,150)=150
  // ΣQ_krit=750 → Z=45 (qKritMax=1200>750 ✓)

  test('ΣQ_krit = 750', () => expect(result.sumQKrit).toBe(750))
  test('Z = 45', () => expect(result.Z).toBe(45))
  test('nicht überlastet', () => expect(result.overloaded).toBe(false))
  test('3 Phasen', () => expect(result.phases.length).toBe(3))

  test('Phase 1 Q_krit = 400', () => expect(result.phases[0].qKrit).toBe(400))
  test('Phase 2 Q_krit = 200', () => expect(result.phases[1].qKrit).toBe(200))
  test('Phase 3 Q_krit = 150', () => expect(result.phases[2].qKrit).toBe(150))

  test('Phase 1 λ plausibel (0.2–0.8)', () => {
    expect(result.phases[0].lambda).toBeGreaterThan(0.2)
    expect(result.phases[0].lambda).toBeLessThan(0.8)
  })

  test('Gesamt-LOS ist schlechtester Einzel-LOS', () => {
    const losRank = ['A','B','C','D','E','F']
    const worstStream = result.streams
      .filter(s => s.Q > 0)
      .reduce((w, s) =>
        losRank.indexOf(s.los) > losRank.indexOf(w) ? s.los : w, 'A')
    expect(result.overallLos).toBe(worstStream)
  })

  test('HS-Ströme (q2,q8) haben gleiche LOS bei gleicher Belastung', () => {
    const q2 = result.streams.find(s => s.id === 'q2')!
    const q8 = result.streams.find(s => s.id === 'q8')!
    expect(q2.los).toBe(q8.los)
    expect(q2.X).toBeCloseTo(q8.X, 5)
  })

  test('kritische Ströme korrekt markiert', () => {
    const q2 = result.streams.find(s => s.id === 'q2')!  // Phase1 krit
    const q3 = result.streams.find(s => s.id === 'q3')!  // Phase1 unkrit
    expect(q2.isCritical).toBe(true)
    expect(q3.isCritical).toBe(false)
  })
})

describe('calculateLSA — 3-Arm 2-phasig', () => {
  const input: LSAInput = {
    armCount: 3, phaseCount: 2,
    arms: [
      { name: 'A', left: 0, straight: 500, right: 100 },   // q2=500, q3=100
      { name: 'C', left: 100, straight: 500, right: 0 },   // q7=100, q8=500
      { name: 'B', left: 200, straight: 0, right: 150 },   // q4=200, q6=150
    ],
  }
  const result = calculateLSA(input)
  // Phase1={q2=500,q3=100,q7=100,q8=500} → Q_krit=500
  // Phase2={q4=200,q6=150} → Q_krit=200
  // ΣQ_krit=700 → Z=45

  test('ΣQ_krit=700, Z=45', () => {
    expect(result.sumQKrit).toBe(700)
    expect(result.Z).toBe(45)
  })

  test('2 Phasen', () => expect(result.phases.length).toBe(2))

  test('NS-Ströme schlechtere LOS als HS', () => {
    const losRank = ['A','B','C','D','E','F']
    const q2 = result.streams.find(s => s.id === 'q2')!
    const q4 = result.streams.find(s => s.id === 'q4')!
    // HS hat mehr Grünzeit → kleinere X → bessere LOS
    expect(losRank.indexOf(q2.los)).toBeLessThanOrEqual(losRank.indexOf(q4.los))
  })
})
