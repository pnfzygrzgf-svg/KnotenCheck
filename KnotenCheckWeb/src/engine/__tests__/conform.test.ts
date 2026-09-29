// Absicherung geladener Dateien: Vorlage mit Standardwerten
import { describe, test, expect } from 'vitest'
import { conform, conformFixed, oneOf } from '../conform'
import { conformIntersection, toSNVolumes } from '../armConfiguration'

describe('conform', () => {
  test('falscher Typ, fehlend, null, NaN → Vorlagewert', () => {
    const t = { a: 1, b: 'x', c: true, d: 5 }
    expect(conform(t, { a: '7', c: null, d: NaN })).toEqual(t)
  })
  test('negative Zahl bei nicht-negativer Vorlage → Vorlagewert', () => {
    expect(conform({ q: 100 }, { q: -5 })).toEqual({ q: 100 })
  })
  test('optionale Felder: flache Objekte übernommen, verschachtelte verworfen', () => {
    const r = conform<{ x: number; mix?: object }>({ x: 0, mix: undefined }, { x: 2, mix: { a: 1 }, deep: { b: { c: 1 } } })
    expect(r).toEqual({ x: 2, mix: { a: 1 } })
  })
  test('kein Objekt → Vorlage', () => {
    expect(conform({ a: 1 }, 'kaputt')).toEqual({ a: 1 })
  })
  test('conformFixed: feste Länge, fehlende Elemente = Vorlage', () => {
    expect(conformFixed([{ a: 1 }, { a: 2 }], [{ a: 9 }])).toEqual([{ a: 9 }, { a: 2 }])
    expect(conformFixed([{ a: 1 }], [{ a: 9 }, { a: 8 }])).toEqual([{ a: 9 }])
  })
  test('oneOf', () => {
    expect(oneOf(['3arm', '4arm'], '5arm', '4arm')).toBe('4arm')
    expect(oneOf([1, 2], 2, 1)).toBe(2)
  })
})

describe('conformIntersection (SN 640 022 / Simulation)', () => {
  test('beschädigte Datei ergibt rechenbare Konfiguration', () => {
    const cfg = conformIntersection({
      name: 42,
      arms: [
        { leftVolume: '100', straightVolume: 400, rightVolume: null, gradient: '+9%' },
        null,
        { leftVolume: 80, vehicleMix: { pctLW: 10 }, mixedLaneCombination: 'x' },
      ],
    })
    expect(cfg.name).toBe('')
    expect(cfg.arms).toHaveLength(3)
    expect(cfg.arms[0].gradient).toBe('±0%')
    expect(cfg.arms[2].vehicleMix).toEqual({ pctLW: 10, pctLZ: 0, pctMR: 0, pctFR: 0 })
    expect(cfg.arms[2].mixedLaneCombination).toBe('all')
    const v = toSNVolumes(cfg)!
    expect(v.flat().every(Number.isFinite)).toBe(true)
  })
  test('4 Arme bleiben 4 Arme', () => {
    expect(conformIntersection({ arms: [{}, {}, {}, {}] }).arms).toHaveLength(4)
  })
})
