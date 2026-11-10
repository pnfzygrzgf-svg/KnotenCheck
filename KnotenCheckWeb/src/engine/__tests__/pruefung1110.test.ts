// Prüfung vom 10.11.2026: Regressionstests zu den Befunden KC-04 bis KC-07 und KC-09
import { describe, test, expect } from 'vitest'
import { conformArms, defaultIntersection, mixGueltig, offeneArmAngaben } from '../armConfiguration'
import { offenKreisel, offenLsa } from '../offeneAngaben'
import { entryFactor, mixZurNeigung } from '../roundaboutCalculator'
import { defaultPhasesFor, type Lane } from '../lsaCalculatorV2'
import { findDeparture, runStochasticSN640022, runStochasticSN640022Multi, type SimInterval } from '../stochasticSN640022'
import type { SN640022LaneFlags } from '../types'

const noFlags: SN640022LaneFlags = {
  mixedB: 'all', mixedD: 'all',
  armASeparateLane: false, armCSeparateLane: false,
  armATriangleIsland: false, armCTriangleIsland: false,
  armBRightIsland: false, armDRightIsland: false,
}

describe('KC-04: Wartezeit über die Intervallgrenze', () => {
  const erstes = [[0, 1000, 0], [0, 0, 500], [200, 0, 0]]
  const iv = (volumes: number[][], label: string): SimInterval => ({ label, volumes, rawVolumes: volumes, T: 300 })
  const lauf = (zweites: number[][]) => runStochasticSN640022Multi([iv(erstes, 'eins'), iv(zweites, 'zwei')], noFlags, { runs: 30, seed: 42, useCowan: false, tcSigma: 0 })!
  const frei = lauf([[0, 0, 0], [0, 0, 0], [0, 50, 0]]), dicht = lauf([[0, 1500, 0], [0, 0, 700], [0, 50, 0]])
  const strom4 = (r: typeof frei, i: number) => r.intervals[i].result.streams.find(s => s.streamNumber === 4)!

  test('das erste Intervall hat Rückstau', () => {
    expect(frei.intervals[0].carryOver).toBeGreaterThan(5)
    expect(dicht.intervals[0].carryOver).toBeGreaterThan(5)
  })
  test('die Wartezeit der Fahrzeuge des ersten Intervalls hängt vom Folgeintervall ab', () => {
    expect(strom4(dicht, 0).stats!.mean).toBeGreaterThan(strom4(frei, 0).stats!.mean * 1.2)
  })
  test('jedes Fahrzeug zählt genau einmal, im Intervall seiner Ankunft', () => {
    // Strom 4 hat im zweiten Intervall keinen Zufluss: Dort gibt es keine Wartezeiten, auch wenn die Übernommenen dort abfahren
    expect(strom4(frei, 1).stats).toBeNull()
    expect(strom4(dicht, 1).stats).toBeNull()
    // Alle in 300 s Angekommenen stehen im ersten Intervall: rund 200 Fz/h · 300 s · 30 Läufe = 500
    for (const r of [frei, dicht]) { expect(strom4(r, 0).stats!.n).toBeGreaterThan(400); expect(strom4(r, 0).stats!.n).toBeLessThan(600) }
  })
  test('ohne Verkehr im Folgeintervall fahren alle ab, in der Überlast bleiben Fahrzeuge offen', () => {
    expect(strom4(frei, 0).open).toBe(0)
    expect(frei.intervals[1].carryOver).toBe(0)
    expect(strom4(dicht, 0).open!).toBeGreaterThan(0)
    expect(dicht.intervals[1].carryOver).toBeGreaterThan(0)
  })
  test('ein Intervall allein rechnet wie bisher mit weiterlaufendem Verkehr', () => {
    const r = runStochasticSN640022([[0, 300, 0], [0, 0, 50], [40, 30, 0]], noFlags, undefined, { runs: 20, seed: 3 })!
    expect(r.streams.every(s => (s.open ?? 0) === 0)).toBe(true)
    expect(r.streams.find(s => s.streamNumber === 4)!.stats!.mean).toBeGreaterThan(0)
  })
})

describe('KC-05: Ende des Konflikthorizonts', () => {
  const dicht = Float64Array.from([1, 2, 3, 4])
  test('das Ende der Daten ist keine freie Lücke', () => {
    expect(findDeparture(0, dicht, 5, [], Uint8Array.from([0, 0, 0, 0]))).toBe(Infinity)
    expect(findDeparture(0, dicht, 5, [])).toBe(Infinity)
    expect(findDeparture(0, dicht, 5, [], undefined, 8)).toBe(Infinity)   // bis zum Horizont bleiben nur 4 s
  })
  test('eine bis zum Horizont beobachtete Lücke gilt', () => {
    expect(findDeparture(0, dicht, 5, [], undefined, 9)).toBe(4)
    expect(findDeparture(0, dicht, 5, [], undefined, Infinity)).toBe(4)
  })
  test('eine freie Lücke im beobachteten Bereich wird weiter erkannt', () => {
    expect(findDeparture(0, Float64Array.from([1, 2, 10, 11]), 5, [])).toBe(2)
  })
  test('ohne Konfliktverkehr ist die Fahrt frei', () => {
    expect(findDeparture(7, new Float64Array(0), 5, [])).toBe(7)
  })
  test('starke Überlast: offene Fahrzeuge werden ausgewiesen, die Wartezeit ist ein Mindestwert', () => {
    const v = [[0, 900, 0], [0, 0, 900], [600, 0, 0]]
    const s4 = runStochasticSN640022(v, noFlags, v, { runs: 10, seed: 7, T: 600, tcSigma: 0 })!.streams.find(s => s.streamNumber === 4)!
    expect(s4.open!).toBeGreaterThan(1)
    expect(Number.isFinite(s4.stats!.mean)).toBe(true)
    expect(s4.utilization).toBeGreaterThanOrEqual(1)
  })
})

describe('KC-06: Fahrzeuganteile', () => {
  const mix = (pctLW: number, pctLZ: number) => ({ pctLW, pctLZ, pctMR: 0, pctFR: 0 })
  test('Grenzen: je Anteil 0 bis 100 %, zusammen höchstens 100 %', () => {
    expect(mixGueltig(undefined)).toBe(true)
    expect(mixGueltig(mix(100, 0))).toBe(true)
    expect(mixGueltig(mix(60, 40))).toBe(true)
    expect(mixGueltig(mix(59.99, 40))).toBe(true)
    expect(mixGueltig(mix(60.01, 40))).toBe(false)
    expect(mixGueltig(mix(80, 80))).toBe(false)
    expect(mixGueltig(mix(150, 0))).toBe(false)
    expect(mixGueltig(mix(-1, 0))).toBe(false)
    expect(mixGueltig(mix(NaN, 0))).toBe(false)
  })
  const arme = (m: ReturnType<typeof mix>) => defaultIntersection(3).arms.map((a, i) => ({ ...a, rightVolume: 100, gradient: '±0%' as const, fall: 2 as const, ...(i === 0 ? { vehicleMix: m } : {}) }))
  test('Einmündung und Simulation: 80 % + 80 % sperrt, die Korrektur gibt frei', () => {
    expect(offeneArmAngaben(arme(mix(80, 80)))).toEqual(['Arm A: Fahrzeuganteile (zusammen höchstens 100 %)'])
    expect(offeneArmAngaben(arme(mix(80, 20)))).toEqual([])
  })
  test('eine geladene Datei mit 160 % bleibt offen und wird nicht umgedeutet', () => {
    const geladen = conformArms(arme(mix(80, 80)), 3, true)
    expect(geladen[0].vehicleMix).toMatchObject({ pctLW: 80, pctLZ: 80 })
    expect(offeneArmAngaben(geladen)).toContain('Arm A: Fahrzeuganteile (zusammen höchstens 100 %)')
  })
  test('Kreisel', () => {
    const arm = { type: '1/1', right: 100, straight: 0, left: 0, gradient: '±0%', exitWide: false, exitTwoLanes: null, mischung: 'detail', mix: { pctFR: 0, pctMR: 0, pctLW: 80, pctLZ: 80 } }
    expect(offenKreisel([arm, arm, arm])).toContain('Arm 1: Fahrzeuganteile (zusammen höchstens 100 %)')
    expect(offenKreisel([{ ...arm, mix: { pctFR: 0, pctMR: 0, pctLW: 100, pctLZ: 0 } }])).toEqual([])
  })
  test('LSA: 150 % Lastwagen', () => {
    const o = { armCount: 3 as const, arms: [{ left: 0, straight: 100, right: 0, mix: { pctLW: 150, pctMR: 0, pctFR: 0 } }, { left: 0, straight: 0, right: 0 }, { left: 0, straight: 0, right: 0 }],
      moveLane: { q2: 1 as const }, fgs: {}, tzMode: 'norm', targetLos: 'D', phasenplan: true }
    expect(offenLsa(o)).toEqual(['Arm A: Fahrzeuganteile (zusammen höchstens 100 %)'])
    expect(offenLsa({ ...o, arms: o.arms.map(a => ({ ...a, mix: { pctLW: 100, pctMR: 0, pctFR: 0 } })) })).toEqual([])
  })
})

describe('KC-07: Fahrradanteil am Kreisel ausserhalb der Ebene', () => {
  const nurFR = { pctFR: 100, pctMR: 0, pctLW: 0, pctLZ: 0 }
  test('bei ±0 % bleibt der Anteil', () => {
    expect(mixZurNeigung(nurFR, '±0%')).toEqual({ mix: nurFR, ohneFR: 0 })
    expect(mixZurNeigung(undefined, '+4%')).toEqual({ mix: undefined, ohneFR: 0 })
  })
  for (const g of ['+4%', '+2%', '-2%', '-4%'] as const) for (const fr of [5, 50, 100]) {
    test(`${g}, ${fr} % Fahrräder: auf 0 gesetzt und gemeldet, der Arm bleibt belastet`, () => {
      const r = mixZurNeigung({ ...nurFR, pctFR: fr }, g)
      expect(r).toEqual({ mix: { ...nurFR, pctFR: 0 }, ohneFR: fr })
      expect(entryFactor(g, r.mix)).toBeGreaterThan(0)
    })
  }
})

describe('KC-09: Standard-Vorschlag der LSA mit zweitem Fahrstreifen', () => {
  const lane = (id: string, armIndex: number, streamIds: string[], isFGS = false): Lane => ({ id, armIndex, label: id, streamIds, isFGS })
  test('Einmündung: C-FS2 steht in der Phase von Arm C', () => {
    const lanes = [lane('A-FS1', 0, ['q2', 'q3']), lane('C-FS1', 1, ['q8']), lane('C-FS2', 1, ['q7']), lane('B-FS1', 2, ['q4', 'q6'])]
    expect(defaultPhasesFor(3, lanes).map(p => p.laneIds)).toEqual([['A-FS1'], ['C-FS1', 'C-FS2'], ['B-FS1']])
  })
  test('Kreuzung: Arm nur mit FS2, mehrere FS2; Fussgängerstreifen bleiben offen', () => {
    const lanes = [lane('A-FS2', 0, ['q1', 'q2', 'q3']), lane('C-FS1', 1, ['q8', 'q9']), lane('C-FS2', 1, ['q7']),
      lane('B-FS1', 2, ['q5', 'q6']), lane('B-FS2', 2, ['q4']), lane('D-FS1', 3, ['q10', 'q11', 'q12']), lane('fgs-A', 0, ['fgs-A'], true)]
    const phasen = defaultPhasesFor(4, lanes)
    expect(phasen.map(p => p.laneIds)).toEqual([['A-FS2', 'C-FS1', 'C-FS2'], ['B-FS1', 'B-FS2', 'D-FS1']])
    expect(phasen.flatMap(p => p.laneIds)).not.toContain('fgs-A')
  })
})
