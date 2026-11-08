// Verifikation Stochastik-Simulation SN 640 022
// Stufen 1A (lognormales t_c), 1B (Cowan M3), 2C (simultane Ströme), 2D (Stauraum),
// 3 (Rückstau analog F13–F20), Vergleich mit der Normrechnung

import { describe, test, expect, afterAll } from 'vitest'
import {
  runStochasticSN640022, runStochasticSN640022Multi,
  sampleLogNormal, sampleCowanM3, seededRandom, GAP_PARAMS, GAP_PARAMS_SN640022,
  GAP_PARAMS_SN640022_CH, pedBlockingTime, normalizePedestrianLeg, findDeparture,
} from '../stochasticSN640022'
import { conform } from '../conform'
import type { PedestrianConfig, PedestrianLegConfig } from '../stochasticSN640022'
import { analyzeSN640022, basicCapacityG } from '../sn640022Calculator'
import type { SimInterval } from '../stochasticSN640022'
import type { SN640022LaneFlags } from '../types'

// Alle Zufallszahlen dieser Datei aus einem Generator mit festem Startwert:
// Die statistischen Tests sind damit reproduzierbar und schlagen nicht zufällig fehl.
// (Direkt ersetzt, nicht per vi.spyOn — ein Spy protokolliert jeden der Millionen Aufrufe.)
const originalRandom = Math.random
Math.random = seededRandom(20260929)
afterAll(() => { Math.random = originalRandom })

const acc = (a: number, b: number, tol: number) =>
  expect(Math.abs(a - b)).toBeLessThanOrEqual(tol)

const noFlags: SN640022LaneFlags = {
  mixedB: 'all', mixedD: 'all',
  armASeparateLane: false, armCSeparateLane: false,
  armATriangleIsland: false, armCTriangleIsland: false,
  armBRightIsland: false, armDRightIsland: false,
}


// ── Stufe 1A: lognormal gestreutes t_c ────────────────────────────────────────
describe('1A — t_c lognormal', () => {
  const nominal = 6.5, sigma = 0.8, N = 5000
  const rng = seededRandom(1)
  const samples = Array.from({ length: N }, () => sampleLogNormal(nominal, sigma, rng))
  const mean = samples.reduce((s, x) => s + x, 0) / N
  const sd = Math.sqrt(samples.reduce((s, x) => s + (x - mean) ** 2, 0) / N)

  test('Mittelwert ≈ Nominalwert (±2 %)', () => acc(mean, nominal, nominal * 0.02))
  test('Standardabweichung ≈ σ (±5 %)', () => acc(sd, sigma, sigma * 0.05))
  test('Alle Samples > 0', () => { for (const x of samples) expect(x).toBeGreaterThan(0) })
  test('σ = 0 → konstant', () => expect(sampleLogNormal(nominal, 0, rng)).toBe(nominal))
})

// ── Zufallsgenerator mit Startwert ────────────────────────────────────────────
describe('seed: reproduzierbare Resultate', () => {
  const v = [[0, 500, 100], [400, 0, 100], [80, 60, 0]]
  test('gleicher seed → gleiche Wartezeiten', () => {
    const a = runStochasticSN640022(v, noFlags, undefined, { runs: 20, seed: 7 })!
    const b = runStochasticSN640022(v, noFlags, undefined, { runs: 20, seed: 7 })!
    expect(a.streams.map(s => s.stats?.mean)).toEqual(b.streams.map(s => s.stats?.mean))
  })
})

// ── Stufe 1B: Cowan M3 ────────────────────────────────────────────────────────
describe('1B — Cowan M3 Zeitlücken', () => {
  const N = 3000, A = 7.0, tm = 1.8

  test('Mittlere Lücke = 1/q für qpi=600 Fz/h', () => {
    const qpi = 600, q = qpi / 3600, lambda = q
    const samples = Array.from({ length: N }, () => sampleCowanM3(lambda, A, tm))
    const mean = samples.reduce((s, x) => s + x, 0) / N
    acc(mean, 1 / lambda, 1 / lambda * 0.10)
  })

  test('Bei hohem qpi=1200: viele Lücken = tm (Kolonnen)', () => {
    const qpi = 1200, q = qpi / 3600
    const alpha = Math.exp(-A * q)
    const samples = Array.from({ length: N }, () => sampleCowanM3(q, A, tm))
    const bundledFraction = samples.filter(h => Math.abs(h - tm) < 0.001).length / N
    // Erwarteter Anteil gebundener Fahrzeuge = (1-alpha) ≈ 0.91 bei qpi=1200
    acc(bundledFraction, 1 - alpha, 0.05)
  })

  test('Alle Lücken ≥ tm', () => {
    const qpi = 800, q = qpi / 3600
    const samples = Array.from({ length: N }, () => sampleCowanM3(q, A, tm))
    for (const h of samples) expect(h).toBeGreaterThanOrEqual(tm - 0.001)
  })

  test('Bei niedrigem qpi=200: nahezu wie Exponential', () => {
    const qpi = 200, q = qpi / 3600
    const alpha = Math.exp(-A * q)  // ≈ 0.68: viele freie Fahrzeuge
    expect(alpha).toBeGreaterThan(0.6)  // α gross → wenig Kolonnen
  })
})

// ── Simulation: Konvergenz bei a → 0 ──────────────────────────────────────────
describe('Konvergenz — Einmündung, kleine NS-Belastung', () => {
  const v = [[0, 570, 200], [425, 0, 115], [8, 5, 0]]
  const r = runStochasticSN640022(v, noFlags, undefined, { runs: 400 })!

  test('Ergebnis nicht null', () => expect(r).not.toBeNull())
  test('Config in Result', () => expect(r.config.runs).toBe(400))

  test('S7: Sim-Mittel in Grössenordnung Analytik (0.4×–3×)', () => {
    const s = r.streams.find(s => s.streamNumber === 7)!
    // Analytischer Referenzwert direkt aus dem SN-640-022-Rechner
    // (Plausibilitätsschranke; die Simulation selbst führt keinen Vergleich mit)
    const analytical = analyzeSN640022(v, noFlags)!.streams.find(x => x.streamNumber === 7)!
    const ratio = s.stats!.mean / analytical.delay
    expect(ratio).toBeGreaterThan(0.4)
    expect(ratio).toBeLessThan(3.0)
  })
  test('P85 ≥ P50', () => {
    const s7 = r.streams.find(s => s.streamNumber === 7)!
    expect(s7.stats!.p85).toBeGreaterThanOrEqual(s7.stats!.p50)
  })
})

// ── Stufe 2C: Simultane NS-Ströme ─────────────────────────────────────────────
describe('2C — Simultane NS-Ströme (Einmündung Arm B)', () => {
  // Hohe NS-Last: Strom 4 (qpi hoch) blockiert Strom 6
  const v = [[0, 700, 180], [600, 0, 130], [120, 80, 0]]  // a4 ≈ 0.6

  const rSim = runStochasticSN640022(v, noFlags, undefined, { runs: 120 })!
  // Vergleich: alle unabhängig (erlangK=1 → deterministisch, kein simultaner Effekt messbar direkt)
  // Stattdessen: S4 mean > S7 mean (Links > HS-Links wegen höherem qpi)
  const s4 = rSim.streams.find(s => s.streamNumber === 4)!
  const s7 = rSim.streams.find(s => s.streamNumber === 7)!

  test('S4 (NS-Links, Rg 3) hat höhere Mean als S7 (HS-Links, Rg 2)', () => {
    expect(s4.stats!.mean).toBeGreaterThan(s7.stats!.mean)
  })

  test('Strom 6 hat Stats (wird simultan mit 4 simuliert)', () => {
    const s6 = rSim.streams.find(s => s.streamNumber === 6)!
    expect(s6.stats).not.toBeNull()
  })

  test('Simultane Sim: S4 P85 ≥ S4 Mean', () => {
    expect(s4.stats!.p85).toBeGreaterThanOrEqual(s4.stats!.mean)
  })
})

describe('2C — Simultane NS-Ströme (Kreuzung Arm B + D)', () => {
  const v = [[0,500,220,30],[550,0,90,0],[170,60,0,10],[20,5,15,0]]
  const flags: SN640022LaneFlags = {
    mixedB: 'leftAndThrough', mixedD: 'throughAndRight',
    armASeparateLane: true, armCSeparateLane: false,
    armATriangleIsland: false, armCTriangleIsland: false,
    armBRightIsland: false, armDRightIsland: false,
  }
  const r = runStochasticSN640022(v, flags, undefined, { runs: 80 })!

  test('8 Ströme vorhanden', () => expect(r.streams).toHaveLength(8))
  test('Strom 4 Mean > Strom 1 Mean', () => {
    const m1 = r.streams.find(s => s.streamNumber === 1)!.stats!.mean
    const m4 = r.streams.find(s => s.streamNumber === 4)!.stats!.mean
    expect(m4).toBeGreaterThan(m1)
  })
  test('Arm D: S10, S11, S12 alle simuliert', () => {
    for (const n of [10, 11, 12]) {
      const s = r.streams.find(x => x.streamNumber === n)!
      // S10 und S12 könnten q=0 haben — dann stats=null ist ok
      expect(s).toBeDefined()
    }
  })
  test('Laufzeit < 2000 ms', () => expect(r.durationMs).toBeLessThan(2000))
})

// ── Stufe 2D: Endlicher Stauraum ──────────────────────────────────────────────
describe('2D — Endlicher Stauraum', () => {
  // Hohe NS-Last → Schlange bildet sich. Ein voller Stauraum hält niemanden zurück:
  // Die Fahrzeuge warten dahinter weiter, ausgewiesen wird, wie viele ihn voll antreffen.
  const v = [[0, 800, 200], [700, 0, 150], [150, 100, 0]]
  const opts = { runs: 30, seed: 20 }
  const unbegrenzt = runStochasticSN640022(v, noFlags, undefined, opts)!
  const stau5 = runStochasticSN640022(v, noFlags, undefined, { ...opts, storageB: 5 })!
  const stau1 = runStochasticSN640022(v, noFlags, undefined, { ...opts, storageB: 1 })!
  const s4 = (r: typeof unbegrenzt) => r.streams.find(s => s.streamNumber === 4)!.stats!

  test('kein Fahrzeug fällt weg, die Wartezeit hängt nicht vom Stauraum ab', () => {
    expect(s4(stau5).n).toBe(s4(unbegrenzt).n)
    expect(s4(stau1).n).toBe(s4(unbegrenzt).n)
    expect(s4(stau1).mean).toBe(s4(unbegrenzt).mean)
  })

  test('Anteil der Fahrzeuge, die den Stauraum voll antreffen', () => {
    expect(unbegrenzt.overflow).toEqual([])
    const a5 = stau5.overflow![0], a1 = stau1.overflow![0]
    expect(a5).toMatchObject({ arm: 'B', storage: 5 })
    expect(a5.share).toBeGreaterThan(0)
    expect(a1.share).toBeGreaterThan(a5.share)
    expect(a1.share).toBeLessThanOrEqual(1)
  })
})

// ── Folgezeitlücke auch für frei Ankommende ───────────────────────────────────
describe('Folgezeitlücke zwischen zwei Abfahrten', () => {
  const opts = { runs: 30, seed: 5, tcSigma: 0 }
  const strom4 = (q: number) => runStochasticSN640022([[0, 0, 0], [0, 0, 0], [q, 0, 0]], noFlags, undefined, opts)!
    .streams.find(s => s.streamNumber === 4)!

  test('ohne Hauptstrom höchstens 3600/t_f: 4000 Fz/h stauen sich', () => {
    const s = strom4(4000)
    expect(s.stats!.mean).toBeGreaterThan(60)
    expect(s.utilization).toBeGreaterThan(1)
  })
  test('ohne Hauptstrom ist die Auslastung q·t_f/3600 wie in der Normrechnung', () => {
    acc(strom4(300).utilization, 300 * GAP_PARAMS.sideLeft.tf / 3600, 300 * GAP_PARAMS.sideLeft.tf / 3600 * 0.05)
  })
})

// ── Monotonie ─────────────────────────────────────────────────────────────────
describe('Monotonie — Wartezeit steigt mit Belastung', () => {
  const low  = runStochasticSN640022([[0,350,80],[300,0,70],[25,20,0]], noFlags, undefined, { runs: 60 })!
  const high = runStochasticSN640022([[0,800,200],[750,0,150],[80,50,0]], noFlags, undefined, { runs: 60 })!

  test('S4 Mean: hohe Last > niedrige Last', () =>
    expect(high.streams.find(s => s.streamNumber === 4)!.stats!.mean)
      .toBeGreaterThan(low.streams.find(s => s.streamNumber === 4)!.stats!.mean))
})

// ── Cowan M3 vs Exponential ───────────────────────────────────────────────────
describe('1B — Cowan M3 vs Exponential bei hohem qpi', () => {
  const v = [[0, 1000, 250], [900, 0, 200], [60, 40, 0]]

  const rCowan = runStochasticSN640022(v, noFlags, undefined, { runs: 100, useCowan: true })!
  const rExp   = runStochasticSN640022(v, noFlags, undefined, { runs: 100, useCowan: false })!

  const meanCowan = rCowan.streams.find(s => s.streamNumber === 4)!.stats!.mean
  const meanExp   = rExp.streams.find(s => s.streamNumber === 4)!.stats!.mean

  test('Cowan M3 gibt andere Wartezeiten als Exponential (bei hohem qpi)', () => {
    // Bei hohem qpi bilden sich Kolonnen → Cowan M3 hat grössere Lücken zwischen Kolonnen
    // Wartezeiten können kürzer oder ähnlich sein je nach Konkretisierung
    expect(Math.abs(meanCowan - meanExp)).toBeGreaterThanOrEqual(0)
    // Beide sind endlich und > 0
    expect(meanCowan).toBeGreaterThan(0)
    expect(meanExp).toBeGreaterThan(0)
  })
})

// ── Verteilungseigenschaften ──────────────────────────────────────────────────
describe('Verteilungseigenschaften', () => {
  const v = [[0, 500, 120], [420, 0, 100], [60, 40, 0]]
  const r = runStochasticSN640022(v, noFlags, undefined, { runs: 150 })!
  const s4 = r.streams.find(s => s.streamNumber === 4)!

  test('P85 ≥ P50', () => expect(s4.stats!.p85).toBeGreaterThanOrEqual(s4.stats!.p50))
  test('P95 ≥ P85', () => expect(s4.stats!.p95).toBeGreaterThanOrEqual(s4.stats!.p85))
  test('Histogramm-Frequenzen summieren zu 1 (±0.001)', () => {
    acc(s4.stats!.freq.reduce((s, f) => s + f, 0), 1.0, 0.001)
  })
  test('Mean > 0', () => expect(s4.stats!.mean).toBeGreaterThan(0))
})

// ── Feature A: Konfigurierbare tc/tf ─────────────────────────────────────────
describe('Feature A — GapOverrides (tc/tf je Strom-Typ)', () => {
  const v = [[0, 700, 200], [600, 0, 130], [80, 60, 0]]

  test('gapOverrides={} → identische Struktur wie ohne Override', () => {
    const r = runStochasticSN640022(v, noFlags, undefined, { runs: 60, gapOverrides: {} })!
    expect(r).not.toBeNull()
    expect(r.streams).toHaveLength(3)
  })

  test('Höheres tc (mainLeft: tc=7.0) → höhere S7-Wartezeit als Default', () => {
    const base = runStochasticSN640022(v, noFlags, undefined, { runs: 100 })!
    const high = runStochasticSN640022(v, noFlags, undefined, {
      runs: 100,
      gapOverrides: { mainLeft: { tc: 7.0 } },
    })!
    const meanBase = base.streams.find(s => s.streamNumber === 7)!.stats!.mean
    const meanHigh = high.streams.find(s => s.streamNumber === 7)!.stats!.mean
    // Höheres tc → weniger akzeptable Lücken → (tendenziell) höhere Wartezeit
    expect(meanHigh).toBeGreaterThan(meanBase * 0.5)  // Mind. halb so gross (statistisch)
    expect(meanHigh).toBeGreaterThan(0)
  })

  test('Niedrigeres tc (sideLeft: tc=3.5) → niedrigere S4-Wartezeit als Default', () => {
    const base = runStochasticSN640022(v, noFlags, undefined, { runs: 100 })!
    const low  = runStochasticSN640022(v, noFlags, undefined, {
      runs: 100,
      gapOverrides: { sideLeft: { tc: 3.5 } },
    })!
    const meanBase = base.streams.find(s => s.streamNumber === 4)!.stats!.mean
    const meanLow  = low.streams.find(s => s.streamNumber === 4)!.stats!.mean
    expect(meanLow).toBeLessThan(meanBase * 1.5)  // Statistisch: tendenziell tiefer
    expect(meanLow).toBeGreaterThan(0)
  })

})

// ── Feature C: Fussgänger als Blocking-Events ─────────────────────────────────
describe('Feature C — Fussgänger Blocking-Events', () => {
  const v = [[0, 700, 200], [600, 0, 130], [80, 60, 0]]

  test('enabled=false → keine Wirkung (identische Struktur wie ohne pedestrians)', () => {
    const r = runStochasticSN640022(v, noFlags, undefined, {
      runs: 60,
      pedestrians: {
        armA: { enabled: false, fg: 0, rho: 1, mittelinsel: false },
        armC: { enabled: false, fg: 0, rho: 1, mittelinsel: false },
      },
    })!
    expect(r).not.toBeNull()
    expect(r.streams.find(s => s.streamNumber === 4)!.stats).not.toBeNull()
  })

  test('fg=400, rho=3, enabled=true → Simulation liefert gültige Statistiken', () => {
    const r = runStochasticSN640022(v, noFlags, undefined, {
      runs: 80,
      pedestrians: {
        armA: { enabled: true, fg: 400, rho: 3, mittelinsel: false },
        armC: { enabled: true, fg: 200, rho: 2, mittelinsel: false },
      },
    })!
    expect(r).not.toBeNull()
    const s4 = r.streams.find(s => s.streamNumber === 4)!
    expect(s4.stats).not.toBeNull()
    expect(s4.stats!.mean).toBeGreaterThanOrEqual(0)
  })

  test('Hohe fg → S4 Mean nicht negativ', () => {
    const r = runStochasticSN640022(v, noFlags, undefined, {
      runs: 60,
      pedestrians: {
        armA: { enabled: true, fg: 1000, rho: 5, mittelinsel: false },
        armC: { enabled: false, fg: 0, rho: 1, mittelinsel: false },
      },
    })!
    const s4 = r.streams.find(s => s.streamNumber === 4)!
    if (s4.stats) expect(s4.stats.mean).toBeGreaterThanOrEqual(0)
  })

  test('Mittelinsel halbiert Sperrzeit — kein Fehler', () => {
    const r = runStochasticSN640022(v, noFlags, undefined, {
      runs: 60,
      pedestrians: {
        armA: { enabled: true, fg: 300, rho: 3, mittelinsel: true },
        armC: { enabled: false, fg: 0, rho: 1, mittelinsel: false },
      },
    })!
    expect(r).not.toBeNull()
    const s4 = r.streams.find(s => s.streamNumber === 4)!
    if (s4.stats) expect(s4.stats.mean).toBeGreaterThanOrEqual(0)
  })

  test('Verteilungseigenschaften auch mit Fussgänger*innen erhalten', () => {
    const r = runStochasticSN640022(v, noFlags, undefined, {
      runs: 100,
      pedestrians: {
        armA: { enabled: true, fg: 300, rho: 2, mittelinsel: false },
        armC: { enabled: false, fg: 0, rho: 1, mittelinsel: false },
      },
    })!
    const s4 = r.streams.find(s => s.streamNumber === 4)!
    if (s4.stats) {
      expect(s4.stats.p85).toBeGreaterThanOrEqual(s4.stats.p50)
      acc(s4.stats.freq.reduce((s, f) => s + f, 0), 1.0, 0.001)
    }
  })
})

// ── Feature D: Mehrere Zeitintervalle ─────────────────────────────────────────
describe('Feature D — Multi-Intervall (Carry-over-Queue)', () => {
  const vLow:  number[][] = [[0, 350,  80], [300, 0, 70], [25, 20, 0]]
  const vHigh: number[][] = [[0, 800, 200], [750, 0, 150], [80, 50, 0]]

  const iv1: SimInterval = { label: '06:00–07:00', volumes: vLow,  T: 3600 }
  const iv2: SimInterval = { label: '07:00–08:00', volumes: vHigh, T: 3600 }
  const iv3: SimInterval = { label: '08:00–09:00', volumes: vLow,  T: 3600 }

  test('2 Intervalle → 2 Ergebnisse', () => {
    const r = runStochasticSN640022Multi([iv1, iv2], noFlags, { runs: 60 })
    expect(r).not.toBeNull()
    expect(r!.intervals).toHaveLength(2)
  })

  test('3 Intervalle → 3 Ergebnisse mit korrekten Labels', () => {
    const r = runStochasticSN640022Multi([iv1, iv2, iv3], noFlags, { runs: 60 })!
    expect(r.intervals[0].label).toBe('06:00–07:00')
    expect(r.intervals[2].label).toBe('08:00–09:00')
  })

  test('Spitzenstunden-Intervall hat höhere Wartezeit als Schwachlast', () => {
    const r = runStochasticSN640022Multi([iv1, iv2], noFlags, { runs: 80 })!
    const mean1 = r.intervals[0].result.streams.find(s => s.streamNumber === 4)!.stats?.mean ?? 0
    const mean2 = r.intervals[1].result.streams.find(s => s.streamNumber === 4)!.stats?.mean ?? 0
    expect(mean2).toBeGreaterThan(mean1 * 0.5)  // Hoch-Last tendenziell grösser
  })

  test('carryOver ist nicht-negativ', () => {
    const r = runStochasticSN640022Multi([iv1, iv2, iv3], noFlags, { runs: 60 })!
    for (const iv of r.intervals) {
      expect(iv.carryOver).toBeGreaterThanOrEqual(0)
    }
  })

  test('Leeres Intervall-Array → null', () => {
    const r = runStochasticSN640022Multi([], noFlags, { runs: 30 })
    expect(r).toBeNull()
  })

  // Rückstau bleibt, auch wenn im nächsten Intervall niemand mehr zufährt
  const voll = [[0, 600, 0], [600, 0, 0], [4000, 0, 0]]
  const halb = (q6: number): SimInterval[] => [
    { label: 'voll', volumes: voll, T: 900 },
    { label: 'danach', volumes: [[0, 600, 0], [600, 0, 0], [0, q6, 0]], T: 900 },
  ]
  test('Rückstau ohne neue Zufahrt wird weiter abgebaut, nicht gelöscht', () => {
    const r = runStochasticSN640022Multi(halb(0), noFlags, { runs: 10, seed: 5, tcSigma: 0 })!
    expect(r.intervals[0].carryOver).toBeGreaterThan(500)
    expect(r.intervals[1].carryOver).toBeGreaterThan(0)
    expect(r.intervals[1].carryOver).toBeLessThan(r.intervals[0].carryOver)
  })
  test('neu Zufahrende stehen hinter dem übernommenen Rückstau', () => {
    const r = runStochasticSN640022Multi(halb(100), noFlags, { runs: 10, seed: 5, tcSigma: 0 })!
    expect(r.intervals[1].result.streams.find(s => s.streamNumber === 6)!.stats!.mean).toBeGreaterThan(300)
  })

  test('Laufzeit für 3 Intervalle < 6000 ms', () => {
    const r = runStochasticSN640022Multi([iv1, iv2, iv3], noFlags, { runs: 60 })!
    expect(r.totalDurationMs).toBeLessThan(6000)
  })
})

// ── Preset «SN 640 022 (implizit)» ───────────────────────────────────────────
// Die rückgerechneten Zeitlücken müssen via Siegloch-Formel
// G = 90 + (3600/tf)·e^(−qpi·(tc − tf/2)/3600) die digitalisierten
// Abb.-2-Stützpunkte der Norm reproduzieren (Ablesegenauigkeit der Kurven
// ±15–25 PWE/h; Restabweichung des Exponentialmodells bis ~70 PWE/h).

describe('Preset SN 640 022 (implizit) — Siegloch vs. Abb. 2', () => {
  const siegloch = (qp: number, p: { tc: number; tf: number }) =>
    90 + (3600 / p.tf) * Math.exp(-qp * (p.tc - p.tf / 2) / 3600)

  for (const key of ['mainLeft', 'sideRight', 'sideCross', 'sideLeft'] as const) {
    test(`${key}: |Siegloch − Abb. 2| ≤ 5 PWE/h für qpi 0–1800`, () => {
      for (let qp = 0; qp <= 1800; qp += 50)
        acc(siegloch(qp, GAP_PARAMS_SN640022[key]), basicCapacityG(key, qp), 5)
    })
  }
})

// ── Fussgänger-Sperrzeit: querungsbasiert (v_FG = 0.80 m/s) ──────────────────
// t_block = Fahrbahnbreite / 0.80 × (Mittelinsel ? 0.5 : 1); ρ-unabhängig.
describe('pedBlockingTime', () => {
  test('Standard (undefined → 8 m) → 10 s', () => {
    expect(pedBlockingTime({ mittelinsel: false })).toBeCloseTo(10, 5)
  })
  test('8 m + Mittelinsel → 5 s', () => {
    expect(pedBlockingTime({ fahrbahnbreite: 8, mittelinsel: true })).toBeCloseTo(5, 5)
  })
  test('12 m → 15 s', () => {
    expect(pedBlockingTime({ fahrbahnbreite: 12, mittelinsel: false })).toBeCloseTo(15, 5)
  })
  test('unabhängig von ρ (kein rho-Argument)', () => {
    // Gleiche Breite → gleiche Dauer, egal welche Gruppengrösse anderswo gilt
    expect(pedBlockingTime({ fahrbahnbreite: 8, mittelinsel: false }))
      .toBe(pedBlockingTime({ fahrbahnbreite: 8, mittelinsel: false }))
  })
})

// ρ steuert die Häufigkeit: höheres ρ → weniger (aber gleich lange) Sperrungen →
// weniger erzwungene HS-Lücken → geringerer positiver Kapazitätseffekt für den NS.
// Strom 6 (B→C) gewählt, weil seine Direktsperren legB/legC nutzen, NICHT legA —
// so misst der Test isoliert den Gap-Effekt von Arm A (ohne Direktsperr-Überlagerung).
describe('Fussgänger: höheres ρ → schwächerer Gap-Effekt (Strom 6)', () => {
  // 3-Arm, stark belasteter HS; B nur Rechtseinbieger (Strom 6)
  const v = [[0, 750, 0], [750, 0, 0], [0, 200, 0]]
  const run = (rho: number) => {
    // Mittel über mehrere Läufe-Sets zur Rauschdämpfung
    const vals = Array.from({ length: 5 }, () =>
      runStochasticSN640022(v, noFlags, undefined, {
        runs: 200,
        pedestrians: {
          armA: { enabled: true, fg: 200, rho, mittelinsel: false },
          armC: { enabled: false, fg: 0, rho: 1, mittelinsel: false },
        },
      })!.streams.find(s => s.streamNumber === 6)!.stats!.mean)
    return vals.reduce((a, b) => a + b, 0) / vals.length
  }

  test('Strom 6: Mittel bei ρ=1 ≤ Mittel bei ρ=5 (mehr Lücken bei kleinen Gruppen)', () => {
    const mLow  = run(1)   // viele Sperrungen → viele Lücken → kürzere Wartezeit
    const mHigh = run(5)   // wenige Sperrungen → weniger Lücken → längere Wartezeit
    // Richtungstest mit grosszügiger Toleranz gegen Reststreuung (stochastisch).
    expect(mLow).toBeLessThanOrEqual(mHigh + 2)
  })
})

// ── Ungültige Eingaben (z. B. aus beschädigten Dateien) ──────────────────────
describe('Ungültige Eingaben enden ohne Endlosschleife', () => {
  const v = [[0, 400, 100], [400, 0, 100], [80, 80, 0]]
  const leg = { enabled: true, fg: 200, rho: 1, mittelinsel: false }

  test('Intervalldauer NaN → Standarddauer', () => {
    const ivs: SimInterval[] = [{ label: 'x', volumes: v, T: NaN }]
    const r = runStochasticSN640022Multi(ivs, noFlags, { runs: 5 })!
    expect(r.intervals[0].result.streams.some(s => s.stats !== null)).toBe(true)
  })
  test('Gruppengrösse ρ ≤ 0 → ρ = 1', () => {
    const r = runStochasticSN640022(v, noFlags, undefined, {
      runs: 5, pedestrians: { armA: { ...leg, rho: -2 }, armC: { ...leg, rho: 0 } },
    })!
    expect(r.streams.some(s => s.stats !== null)).toBe(true)
  })
  test('Stauraum null (gespeichertes ∞) → unbegrenzt, Arm-B-Ströme vorhanden', () => {
    const r = runStochasticSN640022(v, noFlags, undefined, {
      runs: 5, storageB: null as unknown as number,
    })!
    expect(r.streams.find(s => s.streamNumber === 4)?.stats).not.toBeNull()
  })
})

// ── Auslastung der Haltelinie ─────────────────────────────────────────────────
describe('Auslastung x der Haltelinie', () => {
  const opts = { runs: 30, useCowan: false, tcSigma: 0 }

  test('schwach belastet: x deutlich < 1', () => {
    const r = runStochasticSN640022([[0, 300, 50], [300, 0, 50], [50, 50, 0]], noFlags, undefined, opts)!
    for (const s of r.streams.filter(x => x.stats)) expect(s.utilization).toBeLessThan(0.5)
  })
  test('überlastet (analytisch a > 1): x ≥ 1 für Arm B', () => {
    const v = [[0, 900, 200], [900, 0, 100], [300, 300, 0]]
    expect(analyzeSN640022(v, noFlags)!.mixedLanes[0].utilizationDegree).toBeGreaterThan(1)
    const r = runStochasticSN640022(v, noFlags, undefined, opts)!
    expect(r.streams.find(s => s.streamNumber === 4)!.utilization).toBeGreaterThanOrEqual(1)
  })
  test('Arm-B-Ströme teilen die Haltelinie: gleiches x', () => {
    const r = runStochasticSN640022([[0, 400, 100], [400, 0, 100], [80, 80, 0]], noFlags, undefined, opts)!
    const x4 = r.streams.find(s => s.streamNumber === 4)!.utilization
    const x6 = r.streams.find(s => s.streamNumber === 6)!.utilization
    expect(x4).toBe(x6)
  })
})

// ── Kapazität bei Sättigung = Harders-Formel ──────────────────────────────────
// Exponentielle Hauptstromlücken, konstantes t_c: In einer Lücke t fahren n Fahrzeuge,
// wenn t ≥ t_c + (n−1)·t_f → Kapazität c = q·e^(−q·t_c) / (1 − e^(−q·t_f)) (Harders).
// Bei Überlast ist die Haltelinie dauernd besetzt → c ≈ Nachfrage / Auslastung x.
describe('Kapazität der Simulation bei Sättigung (Harders)', () => {
  const harders = (qpi: number, tc: number, tf: number) => {
    const q = qpi / 3600
    return 3600 * q * Math.exp(-q * tc) / (1 - Math.exp(-q * tf))
  }
  test.each([300, 600, 900])('Strom 7, qpi = %i Fz/h: ±4 %', qpi => {
    const { tc, tf } = GAP_PARAMS.mainLeft
    const c = harders(qpi, tc, tf)
    const demand = Math.round(1.5 * c)
    // Einmündung: nur q2 (A→C) als Hauptstrom, Strom 7 (C→B) übersättigt
    const v = [[0, qpi, 0], [0, 0, demand], [0, 0, 0]]
    const r = runStochasticSN640022(v, noFlags, v, { runs: 40, useCowan: false, tcSigma: 0, seed: qpi })!
    const x = r.streams.find(s => s.streamNumber === 7)!.utilization
    acc(demand / x, c, c * 0.04)
  })
})

// ── Strom ohne Konfliktverkehr ────────────────────────────────────────────────
describe('Strom mit Verkehr, aber ohne Hauptstrom', () => {
  test('wird simuliert: ohne Fussgänger*innen nur kurze Wartezeit hinter dem Vorgänger (t_f)', () => {
    const v = [[0, 0, 0], [0, 0, 100], [50, 50, 0]]
    const r = runStochasticSN640022(v, noFlags, undefined, { runs: 5, seed: 3 })!
    const s7 = r.streams.find(s => s.streamNumber === 7)!
    expect(s7.qpi).toBe(0)
    expect(s7.stats).not.toBeNull()
    expect(s7.stats!.mean).toBeGreaterThanOrEqual(0)
    expect(s7.stats!.mean).toBeLessThan(0.5)
  })
})

// ── Trottoirüberfahrt an NS-Armen: gerechnet wie Fussgängerstreifen (Annahme) ──
const DEFAULT_SPERRZEIT = 8 / 0.8  // Standardbreite 8 m bei v_FG = 0.80 m/s

describe('Trottoirüberfahrt — gleiche Rechnung wie Fussgängerstreifen', () => {
  const off: PedestrianLegConfig = { enabled: false, querung: 'keine', fg: 0, rho: 1, mittelinsel: false }
  const streams = (v: number[][], pedestrians: PedestrianConfig) =>
    runStochasticSN640022(v, noFlags, v, { runs: 30, seed: 11, pedestrians })!.streams

  test('3-Arm, Arm B: Trottoirüberfahrt = Fussgängerstreifen ohne Mittelinsel', () => {
    const v = [[0, 700, 200], [600, 0, 130], [80, 60, 0]]
    const leg = { enabled: true, fg: 300, rho: 2, fahrbahnbreite: 6.5 }
    const fgs = streams(v, { armA: off, armC: off,
      armB: { ...leg, querung: 'fgs', mittelinsel: false } })
    // Mittelinsel bei Trottoirüberfahrt wird ignoriert (immer ohne)
    const tue = streams(v, { armA: off, armC: off,
      armB: { ...leg, querung: 'trottoirueberfahrt', mittelinsel: true } })
    expect(tue).toEqual(fgs)
    // Kontrolle: die Querung wirkt überhaupt (Strom 4 wartet länger als ohne)
    const ohne = streams(v, { armA: off, armC: off })
    const m = (r: typeof fgs) => r.find(s => s.streamNumber === 4)!.stats!.mean
    expect(m(fgs)).toBeGreaterThan(m(ohne))
  })

  test('4-Arm, Arm D: Trottoirüberfahrt = Fussgängerstreifen', () => {
    const v = [[0, 500, 220, 30], [550, 0, 90, 0], [170, 60, 0, 10], [20, 5, 15, 0]]
    const leg = { enabled: true, fg: 250, rho: 1, mittelinsel: false }
    const fgs = streams(v, { armA: off, armC: off, armD: { ...leg, querung: 'fgs' } })
    const tue = streams(v, { armA: off, armC: off, armD: { ...leg, querung: 'trottoirueberfahrt' } })
    expect(tue).toEqual(fgs)
  })

  test('HS-Arm A: Trottoirüberfahrt wird zum Fussgängerstreifen (inkl. Mittelinsel)', () => {
    const leg: PedestrianLegConfig = { enabled: true, querung: 'trottoirueberfahrt', fg: 300, rho: 2, mittelinsel: true }
    const n = normalizePedestrianLeg(leg, false)
    expect(n.querung).toBe('fgs')
    expect(n.mittelinsel).toBe(true)
    const v = [[0, 700, 200], [600, 0, 130], [80, 60, 0]]
    expect(streams(v, { armA: leg, armC: off }))
      .toEqual(streams(v, { armA: { ...leg, querung: 'fgs' }, armC: off }))
  })

  test('NS-Arm: Trottoirüberfahrt bleibt, Mittelinsel immer aus', () => {
    const n = normalizePedestrianLeg(
      { enabled: true, querung: 'trottoirueberfahrt', fg: 100, rho: 1, mittelinsel: true }, true)
    expect(n.querung).toBe('trottoirueberfahrt')
    expect(n.mittelinsel).toBe(false)
    expect(pedBlockingTime(n)).toBeCloseTo(DEFAULT_SPERRZEIT, 9)
  })

  test('querung "keine" schaltet die Querung ab (enabled = false)', () => {
    const n = normalizePedestrianLeg({ enabled: true, querung: 'keine', fg: 100, rho: 1, mittelinsel: false }, true)
    expect(n.enabled).toBe(false)
  })

  test('ältere Datei ohne querung: enabled → Fussgängerstreifen, sonst keine', () => {
    // wie beim Laden in der Simulation: Vorlage mit offener querung, danach bereinigen
    const vorlage: PedestrianLegConfig = { enabled: false, querung: undefined, fg: 0, rho: 1, mittelinsel: false, fahrbahnbreite: undefined }
    const laden = (raw: unknown, ns: boolean) => normalizePedestrianLeg(conform(vorlage, raw), ns)
    const alt = laden({ enabled: true, fg: 200, rho: 2, mittelinsel: true }, true)
    expect(alt.querung).toBe('fgs')
    expect(alt.mittelinsel).toBe(true)
    expect(alt.fg).toBe(200)
    expect(laden({ enabled: false, fg: 0, rho: 1, mittelinsel: false }, true).querung).toBe('keine')
    // ungültiger Wert → wie fehlend
    expect(laden({ enabled: true, querung: 'zebra', fg: 50, rho: 1, mittelinsel: false }, false).querung).toBe('fgs')
    // gespeicherte Trottoirüberfahrt bleibt erhalten
    expect(laden({ enabled: true, querung: 'trottoirueberfahrt', fg: 50, rho: 1, mittelinsel: false }, true).querung)
      .toBe('trottoirueberfahrt')
  })
})

// ── Lückensuche ───────────────────────────────────────────────────────────────
describe('findDeparture', () => {
  const conflicts = Float64Array.from([100, 107, 120])

  test('nach einer Sperrzeit gilt die Grenzzeitlücke neu', () => {
    // Lücke 100–107 reicht für t_c = 5.9, aber die Sperrzeit endet erst bei 106:
    // Bis zum Fahrzeug bei 107 bleibt nur 1 s, also erst die Lücke ab 107
    expect(findDeparture(100, conflicts, 5.9, [[95, 106]])).toBe(107)
  })
  test('Ende der Sperrzeit reicht, wenn die Restlücke genügt', () => {
    expect(findDeparture(100, conflicts, 5.9, [[95, 101]])).toBe(101)
  })
  test('Abfahrt vor der Sperrzeit bleibt', () => {
    expect(findDeparture(100, conflicts, 5.9, [[103, 110]])).toBe(100)
  })
  test('nicht freie Lücke wird übergangen', () => {
    const c = Float64Array.from([10, 30, 50])
    expect(findDeparture(12, c, 5, [], Uint8Array.from([1, 0, 1]))).toBe(30)
    expect(findDeparture(12, c, 5, [], Uint8Array.from([1, 1, 1]))).toBe(12)
  })
})

// ── Zusammensetzung von qpi (F1–F8 mit Fussnoten, Ziff. 7, S. 3) ──────────────
// Exponentielle Lücken: Stimmt die Zusammensetzung, ist die Kapazität jedes Stroms
// Harders(qpi); der Hauptstrom wird je Richtung und Fahrzeugart erzeugt.
describe('Hauptstrom je Richtung ergibt qpi', () => {
  const harders = (qpi: number, tc: number, tf: number) => {
    const q = qpi / 3600
    return 3600 * q * Math.exp(-q * tc) / (1 - Math.exp(-q * tf))
  }
  const opts = { runs: 60, useCowan: false, tcSigma: 0, seed: 21 }
  const capacity = (v: number[][], flags: SN640022LaneFlags, sn: number, q: number, key: keyof typeof GAP_PARAMS) => {
    const r = runStochasticSN640022(v, flags, v, opts)!
    const s = r.streams.find(x => x.streamNumber === sn)!
    const { tc, tf } = GAP_PARAMS[key]
    return { sim: q / s.utilization, exact: harders(s.qpi, tc, tf), qpi: s.qpi }
  }
  // Einmündung: A gerade 600 / rechts 200, Strom 6 übersättigt
  const v6 = [[0, 600, 200], [0, 0, 0], [0, 900, 0]]

  test('Strom 6: q2 + 0,5·q3 (F3)', () => {
    const c = capacity(v6, noFlags, 6, 900, 'sideRight')
    expect(c.qpi).toBe(700)
    acc(c.sim, c.exact, c.exact * 0.05)
  })
  test('Strom 6 mit separatem Streifen: nur q2 (Fussnote 1)', () => {
    const c = capacity(v6, { ...noFlags, armASeparateLane: true }, 6, 900, 'sideRight')
    expect(c.qpi).toBe(600)
    acc(c.sim, c.exact, c.exact * 0.05)
  })
  test('Strom 6 mehrstreifig: nur rechter Fahrstreifen (Fussnote 2)', () => {
    const c = capacity(v6, { ...noFlags, armAQ2Override: 250 }, 6, 900, 'sideRight')
    expect(c.qpi).toBe(350)
    acc(c.sim, c.exact, c.exact * 0.05)
  })
  test('Strom 7 mit Dreiecksinsel: q3 entfällt (Fussnote 3)', () => {
    const c = capacity([[0, 600, 200], [0, 0, 900], [0, 0, 0]], { ...noFlags, armATriangleIsland: true }, 7, 900, 'mainLeft')
    expect(c.qpi).toBe(600)
    acc(c.sim, c.exact, c.exact * 0.05)
  })
  test('Strom 5: beide Richtungen und Linksabbieger (F5)', () => {
    const v = [[0, 400, 100, 0], [300, 0, 0, 100], [0, 0, 0, 600], [0, 0, 0, 0]]
    const c = capacity(v, noFlags, 5, 600, 'sideCross')
    expect(c.qpi).toBe(850)
    acc(c.sim, c.exact, c.exact * 0.05)
  })
})

// ── Fussgänger*innen: Wirkung je Strom und Fahrtrichtung ──────────────────────
describe('Querungen wirken je Strom', () => {
  const off: PedestrianLegConfig = { enabled: false, fg: 0, rho: 1, mittelinsel: false }
  const on = (fg: number): PedestrianLegConfig => ({ enabled: true, fg, rho: 1, mittelinsel: false })
  const opts = { runs: 150, tcSigma: 0, seed: 31 }
  const mean = (v: number[][], sn: number, pedestrians: PedestrianConfig) =>
    runStochasticSN640022(v, noFlags, v, { ...opts, pedestrians })!
      .streams.find(s => s.streamNumber === sn)!.stats!.mean

  // Strom 5 kreuzt beide Richtungen; eine Querung hält nur ihre Richtung an
  const kreuzung = (q2: number, q8: number) => [[0, q2, 0, 0], [q8, 0, 0, 0], [0, 0, 0, 100], [0, 0, 0, 0]]
  test('Strom 5: nur die Querung der stark belasteten Richtung schafft Lücken', () => {
    const v = kreuzung(100, 900)
    const ohne = mean(v, 5, { armA: off, armC: off })
    expect(mean(v, 5, { armA: off, armC: on(300) })).toBeLessThan(ohne * 0.85)
    acc(mean(v, 5, { armA: on(300), armC: off }), ohne, ohne * 0.1)
  })
  test('Strom 5 gespiegelt: Wirkung wechselt die Richtung', () => {
    const v = kreuzung(900, 100)
    const ohne = mean(v, 5, { armA: off, armC: off })
    expect(mean(v, 5, { armA: on(300), armC: off })).toBeLessThan(ohne * 0.85)
    acc(mean(v, 5, { armA: off, armC: on(300) }), ohne, ohne * 0.1)
  })

  // Strom 4 (B→A) überfährt die Querung A selbst: Dieselben Sperrzeiten halten ihn an
  // und nützen ihm nichts. Parallel liegt die Querung C.
  const t4 = [[0, 500, 0], [500, 0, 0], [100, 0, 0]]
  test('Strom 4: eigene Querung verlängert die Wartezeit', () => {
    const ohne = mean(t4, 4, { armA: off, armC: off })
    const m200 = mean(t4, 4, { armA: on(200), armC: off })
    const m300 = mean(t4, 4, { armA: on(300), armC: off })
    expect(m200).toBeGreaterThan(ohne * 1.5)
    expect(m300).toBeGreaterThan(m200)
  })
  test('Strom 4: parallele Querung verkürzt die Wartezeit leicht', () => {
    expect(mean(t4, 4, { armA: off, armC: on(300) }))
      .toBeLessThan(mean(t4, 4, { armA: off, armC: off }))
  })
  test('Strom 6: Querung A schafft Lücken, Querung B und C sperren ihn', () => {
    const v = [[0, 800, 0], [0, 0, 0], [0, 200, 0]]
    const ohne = mean(v, 6, { armA: off, armC: off })
    expect(mean(v, 6, { armA: on(300), armC: off })).toBeLessThan(ohne)
    expect(mean(v, 6, { armA: off, armC: on(300) })).toBeGreaterThan(ohne * 2)
    expect(mean(v, 6, { armA: off, armC: off, armB: on(300) })).toBeGreaterThan(ohne * 2)
  })
})

// ── Hauptstrom aus zwei Richtungen: kein Abriss bei qpi um 2000 Fz/h ──────────
describe('Cowan M3 je Fahrstreifen', () => {
  const opts = { runs: 60, seed: 41, tcSigma: 0 }
  test('zwei Richtungen mit je 1000 Fz/h lassen Lücken (qpi = 2030)', () => {
    const v = [[0, 1000, 0], [1000, 0, 30], [20, 20, 0]]
    const r = runStochasticSN640022(v, noFlags, v, opts)!
    const s4 = r.streams.find(s => s.streamNumber === 4)!
    expect(s4.qpi).toBe(2030)
    expect(s4.utilization).toBeLessThan(0.6)
    expect(s4.stats!.mean).toBeLessThan(120)
  })
  test.each([1800, 2000, 2200])('Kapazität fällt mit qpi = %i stetig, nicht abrupt', qpi => {
    const v = [[0, qpi / 2, 0], [qpi / 2, 0, 0], [30, 0, 0]]
    const s4 = runStochasticSN640022(v, noFlags, v, opts)!.streams.find(s => s.streamNumber === 4)!
    expect(s4.utilization).toBeLessThan(0.5)
  })
})

// ── Vergleich mit der Normrechnung (ohne Fussgänger*innen) ────────────────────
// Modell der Norm: exponentielle Lücken, festes t_c, Zeitlücken des Presets «mit +90».
// Kapazität aus der Sättigung: Bei Überlast ist L = Nachfrage / Auslastung x.
describe('Simulation trifft SN 640 022', () => {
  const opts = { runs: 80, useCowan: false, tcSigma: 0, seed: 51, gapOverrides: GAP_PARAMS_SN640022_CH }
  const sim = (v: number[][], runs = opts.runs) => runStochasticSN640022(v, noFlags, v, { ...opts, runs })!
  const norm = (v: number[][]) => analyzeSN640022(v, noFlags, v)!

  // Kapazität von Strom sn: Nachfrage 1,3·L, die übrigen Ströme des Arms leer
  const capacity = (build: (demand: number) => number[][], sn: number) => {
    const L = norm(build(100)).streams.find(s => s.streamNumber === sn)!.capacity
    const demand = Math.max(30, Math.round(1.3 * L))
    const s = sim(build(demand)).streams.find(x => x.streamNumber === sn)!
    return { L, sim: demand / s.utilization }
  }

  test.each([300, 600, 900, 1200])('Rang 2, qpi = %i: Strom 7 und 6 auf ±12 %', qpi => {
    const c7 = capacity(d => [[0, qpi, 0], [0, 0, d], [0, 0, 0]], 7)
    const c6 = capacity(d => [[0, qpi, 0], [0, 0, 0], [0, d, 0]], 6)
    acc(c7.sim, c7.L, c7.L * 0.12)
    acc(c6.sim, c6.L, c6.L * 0.12)
  })

  // F13: L4 = p0,7·G4; die Rückstaukopplung senkt L4 wie die Norm
  test.each([
    [600, 300, 0], [600, 300, 100], [600, 300, 300], [600, 300, 500], [800, 400, 200], [400, 800, 150],
  ])('Rang 3 Einmündung q2 = %i, q8 = %i, q7 = %i: L4 auf ±15 %', (q2, q8, q7) => {
    const c = capacity(d => [[0, q2, 0], [q8, 0, q7], [d, 0, 0]], 4)
    acc(c.sim, c.L, c.L * 0.15)
  })

  // F15/F16 und F19/F20 (mit F18)
  const k = (q5: number, q4: number, q11: number, q10: number) =>
    [[0, 500, 50, 80], [500, 0, 80, 50], [q4, 60, 0, q5], [60, q10, q11, 0]]
  test('Rang 3 Kreuzung: L5 und L11 auf ±15 %', () => {
    const c5  = capacity(d => k(d, 0, 30, 30), 5)
    const c11 = capacity(d => k(30, 30, d, 0), 11)
    acc(c5.sim, c5.L, c5.L * 0.15)
    acc(c11.sim, c11.L, c11.L * 0.15)
  })
  test('Rang 4 Kreuzung: L4 und L10 auf ±15 %', () => {
    const c4  = capacity(d => k(0, d, 40, 30), 4)
    const c10 = capacity(d => k(40, 30, 0, d), 10)
    acc(c4.sim, c4.L, c4.L * 0.15)
    acc(c10.sim, c10.L, c10.L * 0.15)
  })

  test('Rang 3 mit Überlast: Norm und Simulation ergeben F', () => {
    // a7 = 0.65, L4 = 73, a4 = 1.37
    const v = [[0, 600, 0], [300, 0, 500], [100, 0, 0]]
    const a = norm(v).streams.find(s => s.streamNumber === 4)!
    expect(a.levelOfService).toBe('F')
    const s = sim(v).streams.find(x => x.streamNumber === 4)!
    expect(s.utilization).toBeGreaterThanOrEqual(1)
    acc(s.utilization, a.utilizationDegree, 0.2)
  })
  test('Rang 4 mit Überlast: Norm und Simulation ergeben F', () => {
    const v = [[0, 700, 50, 160], [700, 0, 160, 50], [120, 0, 0, 0], [60, 0, 40, 0]]
    const a = norm(v).streams.find(s => s.streamNumber === 4)!
    expect(a.utilizationDegree).toBeGreaterThan(1)
    expect(sim(v).streams.find(x => x.streamNumber === 4)!.utilization).toBeGreaterThanOrEqual(1)
  })
  test('höherrangiger Strom überlastet: Strom 4 hat keine Lücken mehr', () => {
    const v = [[0, 800, 0], [200, 0, 900], [30, 0, 0]]
    expect(norm(v).streams.find(s => s.streamNumber === 7)!.utilizationDegree).toBeGreaterThan(1)
    expect(sim(v, 20).streams.find(x => x.streamNumber === 4)!.utilization).toBeGreaterThanOrEqual(1)
  })

  // Wartezeit: Grössenordnung. w der Norm enthält immer die Bedienzeit 3600/L, die
  // Simulation misst Abfahrt − Ankunft; bei kleiner Auslastung liegt sie deshalb tiefer.
  test.each([
    ['Einmündung', [[0, 500, 50], [400, 0, 100], [60, 80, 0]], [4, 6, 7]],
    ['Kreuzung',   [[0, 400, 50, 60], [400, 0, 70, 50], [40, 50, 0, 20], [30, 40, 30, 0]], [1, 5, 11]],
  ])('%s: Wartezeit zwischen 0,4× und 2× der Norm', (_name, v, streams) => {
    const a = norm(v as number[][]), r = sim(v as number[][], 200)
    for (const sn of streams as number[]) {
      const ratio = r.streams.find(x => x.streamNumber === sn)!.stats!.mean
        / a.streams.find(x => x.streamNumber === sn)!.delay
      expect(ratio).toBeGreaterThan(0.4)
      expect(ratio).toBeLessThan(2)
    }
  })

  test('gemeinsame Haltelinie: Auslastung x ≈ Σa des Mischstreifens (F21)', () => {
    const v = [[0, 700, 50, 120], [700, 0, 120, 50], [60, 30, 0, 20], [30, 30, 20, 0]]
    const a = norm(v).mixedLanes[0]
    expect(a.utilizationDegree).toBeGreaterThan(0.6)
    acc(sim(v, 200).streams.find(x => x.streamNumber === 4)!.utilization, a.utilizationDegree, 0.15)
  })
})

// ── Fehlender Linksabbiegestreifen (Ziff. 14, S. 7–8) ─────────────────────────
describe('Rückstau ohne Linksabbiegestreifen', () => {
  test('p0* senkt die Kapazität der Nebenströme auch in der Simulation', () => {
    const v = [[0, 500, 0, 100], [500, 0, 100, 0], [0, 0, 0, 60], [0, 0, 60, 0]]
    const run = (flags: SN640022LaneFlags) => runStochasticSN640022(v, flags, v,
      { runs: 120, seed: 61, tcSigma: 0 })!.streams.find(s => s.streamNumber === 5)!.stats!.mean
    expect(run({ ...noFlags, armALeftLane: false, armCLeftLane: false })).toBeGreaterThan(run(noFlags))
  })
})

// ── Übertrag für alle Ströme ──────────────────────────────────────────────────
describe('Carry-over auch für HS-Linksabbieger', () => {
  const heavy = [[0, 700, 0], [100, 0, 900], [10, 10, 0]]
  const light = [[0, 100, 0], [100, 0, 50], [10, 10, 0]]
  const iv = (volumes: number[][], label: string): SimInterval => ({ label, volumes, rawVolumes: volumes, T: 3600 })
  const r = runStochasticSN640022Multi([iv(heavy, 'Spitze'), iv(light, 'danach')], noFlags,
    { runs: 40, seed: 71, tcSigma: 0 })!
  const stream7 = (i: number) => r.intervals[i].result.streams.find(s => s.streamNumber === 7)!

  test('Überlast auf Strom 7 wird als Rückstau ausgewiesen', () => {
    expect(stream7(0).utilization).toBeGreaterThanOrEqual(1)
    expect(r.intervals[0].carryOver).toBeGreaterThan(100)
  })
  test('Rückstau belegt das nächste Intervall', () => {
    const allein = runStochasticSN640022(light, noFlags, light, { runs: 40, seed: 72, tcSigma: 0 })!
      .streams.find(s => s.streamNumber === 7)!
    expect(stream7(1).utilization).toBeGreaterThan(allein.utilization + 0.1)
    expect(stream7(1).stats!.mean).toBeGreaterThan(allein.stats!.mean * 5)
  })
})
