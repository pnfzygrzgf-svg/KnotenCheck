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

// ── Normprüfung vom 11.11.2026 ────────────────────────────────────────────────
import { starkeRechtsabbieger } from '../armConfiguration'

describe('EK-1: starke Rechtsabbieger der Hauptstrasse (SN 640 022 Ziffer 4, S. 2)', () => {
  const arme = (a: [number, number, number], c: [number, number, number], b: [number, number, number] = [10, 0, 10]) =>
    defaultIntersection(3).arms.map((x, i) => { const [l, s, r] = [a, c, b][i]; return { ...x, leftVolume: l, straightVolume: s, rightVolume: r } })
  test('über 50 % der Zufahrt: der Arm wird genannt', () => {
    expect(starkeRechtsabbieger(arme([0, 200, 300], [50, 400, 0]))).toEqual(['A'])
    expect(starkeRechtsabbieger(arme([0, 100, 300], [0, 100, 150]))).toEqual(['A', 'C'])
  })
  test('genau 50 %, weniger oder kein Verkehr: kein Hinweis; die Nebenstrasse zählt nicht', () => {
    expect(starkeRechtsabbieger(arme([0, 300, 300], [0, 400, 100]))).toEqual([])
    expect(starkeRechtsabbieger(arme([0, 0, 0], [0, 0, 0], [0, 0, 500]))).toEqual([])
  })
})

import { ausserhalbAbb2, ausserhalbAbb4 } from '../sn640022Calculator'

describe('EK-3: Werte ausserhalb der Diagramme der SN 640 022 (Abb. 2, S. 5; Abb. 4, S. 9)', () => {
  test('Abb. 2 reicht bis 1800 Fz/h', () => {
    expect(ausserhalbAbb2(1800)).toBe(false)
    expect(ausserhalbAbb2(1801)).toBe(true)
  })
  test('Abb. 4 beginnt bei L = 200 PWE/h; ohne Verkehr und bei Überlast kein Zeichen', () => {
    expect(ausserhalbAbb4(50, 199)).toBe(true)
    expect(ausserhalbAbb4(50, 200)).toBe(false)
    expect(ausserhalbAbb4(0, 150)).toBe(false)
    expect(ausserhalbAbb4(160, 150)).toBe(false)
  })
})

import { analyzeSN640022 } from '../sn640022Calculator'

describe('EK-6: Faktoren p_x, p_y, p_z der Kreuzung (SN 640 022 F14, F17, F18, S. 6; Normbeispiel Ziffer 22, S. 13–14)', () => {
  const fz = [[0, 500, 220, 30], [550, 0, 90, 0], [170, 60, 0, 10], [20, 5, 15, 0]]
  const pwe = [[0, 550, 242, 33], [605, 0, 99, 0], [187, 66, 0, 11], [22, 6, 17, 0]]
  const flags = { ...noFlags, mixedB: 'leftAndThrough' as const, mixedD: 'throughAndRight' as const, armASeparateLane: true }
  const r = analyzeSN640022(pwe, flags, fz)!
  const s = (n: number) => r.streams.find(x => x.streamNumber === n)!
  test('p_x wie in der Tabelle der zweitrangigen Ströme', () => expect(r.px!).toBeCloseTo(0.817, 2))
  test('p_y und p_z der Ströme 5 und 11 wie in der Tabelle der drittrangigen Ströme', () => {
    expect(s(5).py!).toBeCloseTo(0.780, 2)
    expect(s(5).pz!).toBeCloseTo(0.831, 2)
    expect(s(11).py!).toBeCloseTo(0.749, 2)
    expect(s(11).pz!).toBeCloseTo(0.806, 2)
  })
  test('die Faktoren ergeben die Leistungsfähigkeiten: F15 und F19', () => {
    expect(s(5).capacity).toBeCloseTo(r.px! * s(5).basicCapacity, 6)
    const p012 = 1 - s(12).utilizationDegree
    expect(s(4).capacity).toBeCloseTo(s(11).pz! * p012 * s(4).basicCapacity, 6)
  })
  test('andere Ströme und die Einmündung tragen keine Faktoren', () => {
    expect(s(1).py).toBeUndefined()
    expect(analyzeSN640022([[0, 500, 100], [400, 0, 50], [30, 40, 0]])!.px).toBeUndefined()
  })
})

import { calculateVSS308, computeDelay } from '../vss2011308Calculator'

describe('FG-1: Hauptstrassenarm mit wartepflichtigem Linksabbieger rechnet mit C = 1 (VSS 2011/308, Ziffer 4.2, S. 51)', () => {
  const arm = (name: string, roadType: 'HS' | 'NS', o: object = {}) => ({ name, roadType, right: 0, straight: 0, left: 0, fg: 0, rho: 1, ...o })
  const knoten = (a: object) => calculateVSS308({ type: '4arm', arms: [arm('A', 'HS', a), arm('C', 'HS', { straight: 700 }), arm('B', 'NS'), arm('D', 'NS')] as never })
  test('mit Linksabbieger: C = 1, S = 1650', () => {
    const a = knoten({ straight: 600, left: 150 }).arms[0]
    expect(a.saturation).toBe(1650)
    expect(a.delay).toBeCloseTo(computeDelay(a.qFz, a.capacity, 1), 6)
    expect(a.delay).toBeCloseTo(22.2, 1)
    expect(a.levelOfService).toBe('C')
  })
  test('ohne Linksabbieger bleibt der Arm Rang 1: C = 0,5, S = 1750', () => {
    const a = knoten({ straight: 600, right: 100 }).arms[0]
    expect(a.saturation).toBe(1750)
    expect(a.delay).toBeCloseTo(computeDelay(a.qFz, a.capacity, 0.5), 6)
  })
  test('ein Linksabbieger ohne Verkehr ändert nichts', () => {
    expect(knoten({ straight: 600, left: 0 }).arms[0].saturation).toBe(1750)
  })
  test('die Einzelströme bleiben wie bisher: Geradeaus Rang 1, Linksabbieger nachrangig', () => {
    const r = knoten({ straight: 600, left: 150 })
    expect(r.streams.find(s => s.id === 'A→C')!.saturation).toBe(1750)
    expect(r.streams.find(s => s.id === 'A→D')!.saturation).toBe(1650)
  })
})

describe('FG-2: Linksabbieger der Nebenstrasse wartet auf die gegenüberliegende Nebenstrasse (VSS 2011/308 Gl. 12, S. 61; Tab. 25, S. 58)', () => {
  const arm = (name: string, roadType: 'HS' | 'NS', o: object = {}) => ({ name, roadType, right: 0, straight: 0, left: 0, fg: 0, rho: 1, ...o })
  const kreuzung = (b: object, d: object, a: object = {}) => calculateVSS308({ type: '4arm',
    arms: [arm('A', 'HS', { straight: 400, ...a }), arm('C', 'HS', { straight: 400 }), arm('B', 'NS', b), arm('D', 'NS', d)] as never })
  const strom = (r: ReturnType<typeof kreuzung>, id: string) => r.streams.find(s => s.id === id)!
  test('ohne Verkehr auf der Gegenseite wie bisher', () => {
    expect(strom(kreuzung({ left: 100 }, {}), 'B→A').capacity).toBeCloseTo(264.0, 1)
  })
  test('Geradeaus und Rechts der Gegenseite mindern mit (1 − y)³, y = Q / 1650', () => {
    const s = strom(kreuzung({ left: 100 }, { straight: 300, right: 200 }), 'B→A')
    expect(s.capacity).toBeCloseTo(264.0 * (1 - 500 / 1650) ** 3, 1)
    expect(s.capacity).toBeCloseTo(89.4, 1)
    expect(s.delay).toBe(Infinity)
  })
  test('der Linksabbieger der Gegenseite und der eigene Geradeaus- und Rechtsstrom zählen nicht', () => {
    expect(strom(kreuzung({ left: 100 }, { left: 300 }), 'B→A').capacity).toBeCloseTo(264.0, 1)
    const r = kreuzung({ straight: 100, right: 100 }, { straight: 300, right: 200 })
    expect(strom(r, 'B→D').capacity).toBeCloseTo(264.0, 1)
    expect(strom(r, 'B→C').capacity).toBeCloseTo(264.0, 1)
  })
  test('gilt für beide Nebenstrassenarme; an der Einmündung gibt es keine Gegenseite', () => {
    expect(strom(kreuzung({ straight: 300, right: 200 }, { left: 100 }), 'D→C').capacity).toBeCloseTo(89.4, 1)
    const t = calculateVSS308({ type: '3arm', arms: [arm('A', 'HS', { straight: 400 }), arm('C', 'HS', { straight: 400 }), arm('B', 'NS', { left: 100 })] as never })
    expect(t.streams.find(s => s.id === 'B→A')!.capacity).toBeCloseTo(264.0, 1)
  })
  test('ein Fussgängerstreifen auf der Hauptstrasse (Szenario II) hebt den Faktor nicht auf', () => {
    const ohne = strom(kreuzung({ left: 100 }, {}, { fg: 200 }), 'B→A')
    const mit = strom(kreuzung({ left: 100 }, { straight: 300, right: 200 }, { fg: 200 }), 'B→A')
    expect(mit.capacity).toBeCloseTo(ohne.capacity * (1 - 500 / 1650) ** 3, 1)
  })
})

describe('FG-5: Linksabbieger der Hauptstrasse steht im Konfliktverkehr mit S = 1650 (VSS 2011/308 Tab. 13, S. 39)', () => {
  const arm = (name: string, roadType: 'HS' | 'NS', o: object = {}) => ({ name, roadType, right: 0, straight: 0, left: 0, fg: 0, rho: 1, ...o })
  const t = (c: object) => calculateVSS308({ type: '3arm', arms: [arm('A', 'HS', { straight: 300 }), arm('C', 'HS', c), arm('B', 'NS', { left: 100 })] as never })
    .streams.find(s => s.id === 'B→A')!
  test('mit Linksabbieger: y = 600/1750 + 200/1650', () => {
    expect(t({ straight: 300, left: 200 }).capacity).toBeCloseTo(1650 * (1 - (600 / 1750 + 200 / 1650)) ** 3, 1)
    expect(t({ straight: 300, left: 200 }).capacity).toBeCloseTo(254.0, 1)
  })
  test('ohne Linksabbieger wie bisher: y = 800/1750', () => {
    expect(t({ straight: 500 }).capacity).toBeCloseTo(1650 * (1 - 800 / 1750) ** 3, 1)
  })
})

import { computeQAfromTurnings, computeQKfromTurnings, basicCapacity } from '../roundaboutCalculator'
import { querschnitteKreisel } from '../../karte/vergleich'

describe('KR-3: Wender am Kreisel (VSS 40 024a, Ziffer 8.3, S. 7)', () => {
  // Normbeispiel Kapitel 17, Abb. 10 (S. 18): rechts / geradeaus / links je Arm [PWE/h]
  const r = [110, 40, 210, 420], g = [380, 310, 300, 410], l = [260, 120, 60, 130]
  test('ohne Wender: Q_K und Q_A wie Tab. 4 der Norm', () => {
    expect(computeQKfromTurnings(r, g, l, 4)).toEqual([600, 770, 690, 480])
    expect(computeQAfromTurnings(r, g, l, 4)).toEqual([840, 580, 550, 780])
  })
  test('50 Wender an Arm 1: Ring an den Einfahrten 2 bis 4 und Ausfahrt 1 je + 50', () => {
    const w = [50, 0, 0, 0]
    expect(computeQKfromTurnings(r, g, l, 4, w)).toEqual([600, 820, 740, 530])
    expect(computeQAfromTurnings(r, g, l, 4, w)).toEqual([890, 580, 550, 780])
    expect(Math.round(basicCapacity('1/1', 820))).toBe(667)   // Typ 1/1, Abb. 6: 1141 − 0,578 · 820
  })
  test('dreiarmig: Wender an jedem anderen Arm', () => {
    expect(computeQKfromTurnings([0, 0, 0], [0, 0, 0], [10, 20, 30], 3, [0, 5, 0])).toEqual([35, 10, 25])
  })
  test('Querschnitt: Wender fahren am eigenen Arm zu und weg', () => {
    const q = querschnitteKreisel([{ left: 0, straight: 0, right: 0, uturn: 40 }, { left: 0, straight: 0, right: 0 }, { left: 0, straight: 0, right: 0 }])
    expect(q[0]).toEqual({ zu: 40, weg: 40, summe: 80 })
  })
  test('nur Wender eingetragen: Abbiegeströme sind nicht offen', () => {
    const arm = { type: '1/1', right: 0, straight: 0, left: 0, gradient: '±0%', exitWide: false, exitTwoLanes: null, mischung: 'pauschal' }
    expect(offenKreisel([{ ...arm, uturn: 30 }, arm, arm])).toEqual([])
  })
})
