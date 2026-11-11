// Die Rechner beginnen ohne Startwerte: Was fehlt, steht in der Liste, und erst eine leere Liste gibt die Rechnung frei
import { describe, test, expect } from 'vitest'
import { conformIntersection, defaultArm, defaultIntersection, offeneArmAngaben, toSNVolumes } from '../armConfiguration'
import { offenKreisel, offenLsa, offenSimulation, offenVss308 } from '../offeneAngaben'
import { wahl } from '../conform'

describe('leerer Arm', () => {
  test('hat keinen Startwert', () => {
    const a = defaultArm()
    expect([a.leftVolume, a.straightVolume, a.rightVolume]).toEqual([0, 0, 0])
    expect([a.gradient, a.fall, a.mixedLaneCombination]).toEqual([null, null, null])
    expect(a.hasLeftTurnLane).toBe(false)
    expect(defaultIntersection(3).name).toBe('')
  })
  test('ohne Neigung gibt es keine PWE-Matrix', () => {
    expect(toSNVolumes(defaultIntersection(3))).toBeNull()
  })
})

describe('offeneArmAngaben', () => {
  const voll = (n: 3 | 4) => defaultIntersection(n).arms.map(a => ({ ...a, leftVolume: 10, gradient: '±0%' as const, fall: 1 as const, mixedLaneCombination: 'all' as const }))
  test('vollständig: nichts offen', () => {
    expect(offeneArmAngaben(voll(4))).toEqual([])
  })
  test('nennt Verkehr, Fall, Neigung und Mischstreifen', () => {
    const offen = offeneArmAngaben(defaultIntersection(4).arms)
    expect(offen[0]).toBe('Verkehrsmengen')
    expect(offen).toContain('Arm A: Fall 1 oder Fall 2')
    expect(offen).toContain('Arm D: Neigung')
    expect(offen).toContain('Arm B: Mischstreifen-Kombination')
    expect(offen).not.toContain('Arm A: Mischstreifen-Kombination')
  })
  test('am T-Knoten und in der Simulation keine Mischstreifen-Wahl', () => {
    const t = voll(3).map(a => ({ ...a, mixedLaneCombination: null }))
    expect(offeneArmAngaben(t)).toEqual([])
    const k = voll(4).map(a => ({ ...a, mixedLaneCombination: null }))
    expect(offeneArmAngaben(k, { mischstreifen: false })).toEqual([])
  })
})

describe('offenKreisel', () => {
  const arm = { type: '1/1', right: 100, straight: 0, left: 0, gradient: '±0%', exitWide: false, exitTwoLanes: null, mischung: 'pauschal' }
  test('vollständig: nichts offen', () => {
    expect(offenKreisel([arm, arm, arm])).toEqual([])
  })
  test('Fahrstreifen der Ausfahrt nur bei Typ 2/2, Breite nicht bei zweistreifiger Ausfahrt', () => {
    expect(offenKreisel([{ ...arm, type: '2/2' }, arm, arm])).toEqual(['Arm 1: Fahrstreifen der Ausfahrt'])
    expect(offenKreisel([{ ...arm, type: '2/2', exitTwoLanes: true, exitWide: null }, arm, arm])).toEqual([])
    expect(offenKreisel([{ ...arm, exitWide: null }, arm, arm])).toEqual(['Arm 1: Ausfahrtsbreite'])
  })
  test('Geradeaus zählt am dreiarmigen Kreisel nicht', () => {
    const leer = { ...arm, right: 0, straight: 50 }
    expect(offenKreisel([leer, leer, leer])).toContain('Abbiegeströme')
  })
})

describe('offenVss308', () => {
  const arm = { left: 10, straight: 0, right: 0, fg: 0, querung: 'keine' as const }
  test('Querung muss gewählt sein, «keine» genügt', () => {
    expect(offenVss308([arm, arm, arm])).toEqual([])
    expect(offenVss308([{ ...arm, querung: undefined }, arm, arm])).toEqual(['Arm A: Querung'])
  })
  test('Fussgängerstreifen verlangt Menge und Gruppengrösse', () => {
    expect(offenVss308([arm, arm, { ...arm, querung: 'fgs' as const }])).toEqual(['Arm B: Fussgänger*innen je Stunde', 'Arm B: Gruppengrösse ρ'])
  })
})

describe('offenLsa', () => {
  const o = {
    armCount: 3 as const, arms: [{ left: 0, straight: 100, right: 0 }, { left: 0, straight: 0, right: 0 }, { left: 0, straight: 0, right: 0 }],
    moveLane: { q2: 1 as const }, fgs: {}, tzMode: 'norm', targetLos: 'D', phasenplan: true,
  }
  test('vollständig: nichts offen, Ströme ohne Verkehr brauchen keinen Fahrstreifen', () => {
    expect(offenLsa(o)).toEqual([])
  })
  test('Ströme mit Verkehr brauchen einen Fahrstreifen', () => {
    expect(offenLsa({ ...o, moveLane: {} })).toEqual(['Arm A: Fahrstreifen der Ströme'])
  })
  test('Tempo nur bei gestaffelter Zwischenzeit', () => {
    expect(offenLsa({ ...o, tzMode: 'staffel' })).toContain('Arm C: Tempo')
    expect(offenLsa({ ...o, tzMode: null })).toEqual(['Zwischenzeit'])
  })
  test('nennt Phasenplan, Ziel-VQS und unvollständige Fussgängerstreifen', () => {
    const offen = offenLsa({ ...o, phasenplan: false, targetLos: null, fgs: { A: { enabled: true, volume: 0, length: 0 } } })
    expect(offen).toEqual(['Fussgängerstreifen Arm A: Fg/h', 'Fussgängerstreifen Arm A: Länge', 'Phasenplan', 'Ziel-VQS'])
  })
})

describe('offenSimulation', () => {
  const arms = defaultIntersection(3).arms.map(a => ({ ...a, leftVolume: 10, gradient: '±0%' as const, fall: 1 as const }))
  const keine = { querung: 'keine' as const, fg: 0, rho: 0 }
  const o = { arms, beine: [keine, keine, keine, undefined], intervalle: null, runs: 200, useCowan: true, tcSigma: 0.5, zeitluecken: true }
  test('vollständig: nichts offen', () => {
    expect(offenSimulation(o)).toEqual([])
  })
  test('Einstellungen haben keinen Startwert', () => {
    expect(offenSimulation({ ...o, runs: undefined, useCowan: undefined, tcSigma: undefined, zeitluecken: false }))
      .toEqual(['Anzahl Simulationsläufe', 'Zeitlückenverteilung', 'Streuung t_c', 'Grenz- und Folgezeitlücken'])
  })
  test('Querung verlangt Menge, Gruppe und Breite', () => {
    expect(offenSimulation({ ...o, beine: [{ querung: 'fgs', fg: 0, rho: 0 }, keine, undefined, undefined] }))
      .toEqual(['Arm A: Fussgänger*innen je Stunde', 'Arm A: Gruppengrösse ρ', 'Arm A: Fahrbahnbreite', 'Arm B: Querung'])
  })
  test('Mit Intervallen zählen deren Mengen und Dauer', () => {
    const leer = arms.map(a => ({ ...a, leftVolume: 0 }))
    expect(offenSimulation({ ...o, arms: leer, intervalle: [{ T: null, arms: leer }] })).toEqual(['Intervall 1: Dauer', 'Intervall 1: Verkehrsmengen'])
  })
})

describe('Dateien', () => {
  test('ältere Datei behält die Werte, mit denen sie gerechnet wurde', () => {
    const cfg = conformIntersection({ arms: [{ leftVolume: 1 }, {}, { vehicleMix: { pctLW: 5 } }, {}] })
    expect(cfg.arms[0].gradient).toBe('±0%')
    expect(cfg.arms[0].fall).toBe(1)
    expect(cfg.arms[2].fall).toBe(2)
    expect(cfg.arms[3].mixedLaneCombination).toBe('all')
    expect(cfg.arms[0].hasLeftTurnLane).toBeUndefined()   // in der Rechnung: vorhanden
  })
  test('neue Datei lässt Offenes offen', () => {
    const cfg = conformIntersection({ leereFelder: true, arms: [{ gradient: null, fall: null, hasLeftTurnLane: false }, { gradient: '+2%', fall: 2 }, {}] })
    expect(cfg.arms[0].gradient).toBeNull()
    expect(cfg.arms[0].fall).toBeNull()
    expect(cfg.arms[0].hasLeftTurnLane).toBe(false)
    expect(cfg.arms[1].gradient).toBe('+2%')
    expect(cfg.arms[1].fall).toBe(2)
  })
  test('wahl: ungültig heisst noch nicht gewählt', () => {
    expect(wahl([1, 2], 2)).toBe(2)
    expect(wahl([1, 2], 3)).toBeNull()
    expect(wahl(['a'], undefined)).toBeNull()
  })
})

describe('offenKreisel: Bypass (KR-2)', () => {
  const arm = { type: '1/1', right: 100, straight: 0, left: 50, gradient: '±0%', exitWide: false, exitTwoLanes: null, mischung: 'pauschal' }
  test('mit Rechtsabbiegern ist die Wahl Pflicht', () => {
    expect(offenKreisel([{ ...arm, bypass: null }, arm, arm])).toEqual(['Arm 1: Rechtsabbieger über Bypass'])
    expect(offenKreisel([{ ...arm, bypass: false }, arm, arm])).toEqual([])
    expect(offenKreisel([{ ...arm, bypass: true }, arm, arm])).toEqual([])
  })
  test('ohne Rechtsabbieger wird nicht gefragt', () => {
    expect(offenKreisel([{ ...arm, right: 0, bypass: null }, arm, arm])).toEqual([])
  })
})
