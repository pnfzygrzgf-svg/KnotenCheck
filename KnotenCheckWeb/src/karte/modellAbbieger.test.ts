import { describe, expect, it } from 'vitest'
import type { P } from '../knotenkern/geo'
import { armStroeme, kachelNamen, modellMatrix, type AbbiegerZeile, type Kachel } from './modellAbbieger'

const m: P = [2600000, 1200000]

describe('Fahrbeziehung nach den Bezeichnungen der Rechner', () => {
  const k = (...l: string[]) => l.map(label => ({ key: label, label }))
  const m4 = { A: { B: 1, C: 2, D: 3 }, B: { A: 4, C: 5, D: 6 }, C: { A: 7, B: 8, D: 9 }, D: { A: 10, B: 11, C: 12 } }
  it('Kreuzung: von A aus liegt B rechts und D links', () => {
    const r = armStroeme(m4, k('A', 'C', 'B', 'D'), false)
    expect(r.A).toEqual({ left: 3, straight: 2, right: 1 })
    expect(r.C).toEqual({ left: 8, straight: 7, right: 9 })
    expect(r.B).toEqual({ left: 4, straight: 6, right: 5 })
    expect(r.D).toEqual({ left: 12, straight: 11, right: 10 })
  })
  it('Einmündung: A geradeaus zu C, rechts zu B, von B links zu A', () => {
    const r = armStroeme({ A: { B: 1, C: 2 }, B: { A: 4, C: 5 }, C: { A: 7, B: 8 } }, k('A', 'C', 'B'), false)
    expect(r.A).toEqual({ left: 0, straight: 2, right: 1 })
    expect(r.C).toEqual({ left: 8, straight: 7, right: 0 })
    expect(r.B).toEqual({ left: 4, straight: 0, right: 5 })
  })
  it('Kreisel: rechts ist die nächste Ausfahrt in Fahrtrichtung', () => {
    const r = armStroeme({ 1: { 2: 10, 3: 20, 4: 30 } }, k('1', '2', '3', '4'), true)
    expect(r[1]).toEqual({ right: 10, straight: 20, left: 30 })
  })
  it('Kreisel mit drei Armen hat keinen Geradeaus-Strom', () => {
    const r = armStroeme({ 1: { 2: 10, 3: 30 } }, k('1', '2', '3'), true)
    expect(r[1]).toEqual({ right: 10, straight: 0, left: 30 })
  })
})

describe('Modellmatrix', () => {
  // Strecken: 1 Süd, 2 Nord, 3 Ost; Knoten 10 Süd, 20 Nord, 30 Ost, 1 und 2 sind zwei Modellknoten derselben Kreuzung
  const k: Record<string, P> = { 10: [m[0], m[1] - 200], 20: [m[0], m[1] + 200], 30: [m[0] + 200, m[1]], 1: [m[0], m[1] - 5], 2: [m[0], m[1] + 5] }
  const z = (v: number, u: number, n: number, a: number, b: number, fz: number): AbbiegerZeile => [v, u, n, a, b, fz, 0, fz * 2, 0]
  const kachel: Kachel = { k, a: [z(10, 1, 2, 1, 9, 100), z(10, 1, 30, 1, 3, 50), z(1, 2, 20, 9, 2, 80), z(1, 2, 30, 9, 3, 20), z(30, 1, 10, 3, 1, 40)] }
  const arme = [{ key: 's', nummern: [1] }, { key: 'n', nummern: [2] }, { key: 'o', nummern: [3] }]

  it('verfolgt den Verkehr über mehrere Modellknoten', () => {
    const r = modellMatrix([kachel], m, arme, 'morgen')
    expect(r.s.n).toBeCloseTo(80)
    expect(r.s.o).toBeCloseTo(70)
    expect(r.o.s).toBeCloseTo(40)
  })
  it('nimmt für den Abend die Abendwerte', () => { expect(modellMatrix([kachel], m, arme, 'abend').s.o).toBeCloseTo(140) })
  it('rundet auf ganze Fahrzeuge je Fahrbeziehung', () => {
    const e = [{ key: 's', label: 'A' }, { key: 'n', label: 'C' }, { key: 'o', label: 'B' }]
    expect(armStroeme(modellMatrix([kachel], m, arme, 'morgen'), e, false).s).toEqual({ left: 0, straight: 80, right: 70 })
  })
  it('zählt zwei Strecken desselben Arms hintereinander nur einmal', () => {
    const k2: Kachel = { k: { 5: [m[0], m[1] - 60], 10: [m[0], m[1] - 200], 1: [m[0], m[1] - 5], 30: [m[0] + 200, m[1]] }, a: [z(10, 5, 1, 7, 1, 100), z(5, 1, 30, 1, 3, 100)] }
    expect(modellMatrix([k2], m, [{ key: 's', nummern: [7, 1] }, { key: 'o', nummern: [3] }], 'morgen').s.o).toBeCloseTo(100)
  })
  it('ohne Strecke des Arms bleibt der Arm leer', () => {
    expect(modellMatrix([kachel], m, [{ key: 's', nummern: [] }, { key: 'n', nummern: [2] }], 'morgen').s).toEqual({})
  })
})

describe('Kacheln', () => {
  it('nennt am Rand beide Kacheln', () => { expect(kachelNamen([2600100, 1200100]).sort()).toEqual(['519_239', '519_240', '520_239', '520_240']) })
  it('in der Mitte nur eine', () => { expect(kachelNamen([2602500, 1202500])).toEqual(['520_240']) })
})
