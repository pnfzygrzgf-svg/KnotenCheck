import { describe, expect, it } from 'vitest'
import { ausQuerschnitt, START_ALLE, START_HAUPT, START_NEBEN, startAnteile, stroemeSchaetzen, zielIndex, type ArmStroeme, type Fahrbeziehung } from '../armmengen'

const KREUZ = ['A', 'C', 'B', 'D']
const summe = (s: ArmStroeme) => s.left + s.straight + s.right

describe('Zielarm', () => {
  it('Kreuzung: von A aus B rechts, D links, C geradeaus', () => {
    expect(zielIndex(KREUZ, 0, 'right', false)).toBe(2)
    expect(zielIndex(KREUZ, 0, 'left', false)).toBe(3)
    expect(zielIndex(KREUZ, 0, 'straight', false)).toBe(1)
    expect(zielIndex(KREUZ, 2, 'left', false)).toBe(0)
  })
  it('Einmündung ohne D', () => {
    expect(zielIndex(['A', 'C', 'B'], 0, 'left', false)).toBeNull()
    expect(zielIndex(['A', 'C', 'B'], 2, 'straight', false)).toBeNull()
  })
  it('Kreisel: rechts ist die nächste Ausfahrt, mit drei Armen kein Geradeaus', () => {
    expect(zielIndex(['1', '2', '3', '4'], 3, 'right', true)).toBe(0)
    expect(zielIndex(['1', '2', '3', '4'], 0, 'left', true)).toBe(3)
    expect(zielIndex(['1', '2', '3'], 0, 'straight', true)).toBeNull()
  })
})

describe('Schätzung aus Armmengen', () => {
  // Wahre Ströme der Form a_i · b_j · Startanteil: Der Ausgleich findet genau sie
  const passend = (hauptstrasse: boolean) => {
    const a = [100, 200, 150, 50], b = [1, 1.2, 0.8, 1.1]
    const wahr = KREUZ.map((l, i) => {
      const s: ArmStroeme = { left: 0, straight: 0, right: 0 }
      for (const f of ['left', 'straight', 'right'] as Fahrbeziehung[]) s[f] = a[i] * b[zielIndex(KREUZ, i, f, false)!] * startAnteile(l, hauptstrasse)[f]
      return s
    })
    const zu = wahr.map(summe), weg = KREUZ.map((_, j) => wahr.reduce((t, s, i) =>
      t + (['left', 'straight', 'right'] as Fahrbeziehung[]).reduce((u, f) => u + (zielIndex(KREUZ, i, f, false) === j ? s[f] : 0), 0), 0))
    const r = stroemeSchaetzen(KREUZ, zu.map((z, i) => ({ zu: z, weg: weg[i] })), false, [], hauptstrasse)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    r.ergebnis.stroeme.forEach((s, i) => {
      expect(Math.abs(s.left - wahr[i].left)).toBeLessThanOrEqual(1)
      expect(Math.abs(s.straight - wahr[i].straight)).toBeLessThanOrEqual(1)
      expect(Math.abs(s.right - wahr[i].right)).toBeLessThanOrEqual(1)
    })
    expect(r.ergebnis.hinweise).toEqual([])
  }
  it('gibt eine Matrix zurück, die zu den gemeinsamen Startanteilen passt', () => passend(false))
  it('mit Hauptstrasse: Matrix zu den Startanteilen von Haupt- und Nebenstrasse', () => passend(true))
  it('Startanteile: A und C Hauptstrasse, B und D Nebenstrasse, ohne Hauptstrasse gemeinsam', () => {
    expect(startAnteile('A', true)).toBe(START_HAUPT)
    expect(startAnteile('C', true)).toBe(START_HAUPT)
    expect(startAnteile('B', true)).toBe(START_NEBEN)
    expect(startAnteile('D', true)).toBe(START_NEBEN)
    expect(startAnteile('A', false)).toBe(START_ALLE)
    for (const s of [START_HAUPT, START_NEBEN, START_ALLE]) expect(s.left + s.straight + s.right).toBeCloseTo(1, 6)
  })
  it('Hauptstrasse ändert die Aufteilung: Nebenstrasse biegt mehr ab', () => {
    const z = [{ zu: 600, weg: 600 }, { zu: 600, weg: 600 }, { zu: 200, weg: 200 }, { zu: 200, weg: 200 }]
    const ohne = stroemeSchaetzen(KREUZ, z, false), mit = stroemeSchaetzen(KREUZ, z, false, [], true)
    expect(ohne.ok && mit.ok).toBe(true)
    if (!ohne.ok || !mit.ok) return
    expect(mit.ergebnis.stroeme[2].straight).toBeLessThan(ohne.ergebnis.stroeme[2].straight)
    expect(mit.ergebnis.stroeme.map(summe)).toEqual([600, 600, 200, 200])
  })
  it('behält die gezählten Zufahrten als ganze Fahrzeuge', () => {
    const r = stroemeSchaetzen(KREUZ, [{ zu: 401, weg: 380 }, { zu: 377, weg: 410 }, { zu: 120, weg: 101 }, { zu: 83, weg: 90 }], false)
    expect(r.ok && r.ergebnis.stroeme.map(summe)).toEqual([401, 377, 120, 83])
  })
  it('Einmündung: A ohne Links, B ohne Geradeaus', () => {
    const r = stroemeSchaetzen(['A', 'C', 'B'], [{ zu: 500, weg: 450 }, { zu: 400, weg: 480 }, { zu: 100, weg: 70 }], false)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.ergebnis.stroeme[0].left).toBe(0)
    expect(r.ergebnis.stroeme[2].straight).toBe(0)
    expect(r.ergebnis.stroeme[1].right).toBe(0)
  })
  it('verbotene Fahrbeziehung bleibt 0', () => {
    const r = stroemeSchaetzen(KREUZ, [{ zu: 300, weg: 300 }, { zu: 300, weg: 300 }, { zu: 100, weg: 100 }, { zu: 100, weg: 100 }], false, [['left'], [], [], []])
    expect(r.ok && r.ergebnis.stroeme[0].left).toBe(0)
  })
  it('Kreisel mit drei Armen: kein Geradeaus', () => {
    const r = stroemeSchaetzen(['1', '2', '3'], [{ zu: 200, weg: 200 }, { zu: 150, weg: 150 }, { zu: 100, weg: 100 }], true)
    expect(r.ok && r.ergebnis.stroeme.every(s => s.straight === 0)).toBe(true)
  })
  it('meldet abweichende Summen und gleicht sie an', () => {
    const r = stroemeSchaetzen(KREUZ, [{ zu: 300, weg: 330 }, { zu: 300, weg: 330 }, { zu: 100, weg: 110 }, { zu: 100, weg: 110 }], false)
    expect(r.ok && r.ergebnis.hinweise.join(' ')).toContain('weichen um 10 % voneinander ab')
  })
  it('meldet, wenn eine Wegfahrt nicht aufgehen kann', () => {
    const r = stroemeSchaetzen(['A', 'C', 'B'], [{ zu: 100, weg: 100 }, { zu: 10, weg: 10 }, { zu: 10, weg: 10 }], false)
    expect(r.ok).toBe(false)
  })
  it('weist Armmengen zurück, die nur mit einem Rest aufgehen', () => {
    // A braucht 10 Fz/h Wegfahrt, erreichbar ist A aber nur von B mit 5 Fz/h
    const r = stroemeSchaetzen(['A', 'C', 'B'], [{ zu: 1005, weg: 10 }, { zu: 0, weg: 1000 }, { zu: 5, weg: 0 }], false)
    expect(r.ok).toBe(false)
  })
  it('knapp lösbar: Arm ohne Wegfahrt erhält nichts, Zufahrten stimmen', () => {
    const z = [{ zu: 1000, weg: 10 }, { zu: 5, weg: 1000 }, { zu: 5, weg: 0 }]
    const r = stroemeSchaetzen(['A', 'C', 'B'], z, false)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.ergebnis.stroeme.map(summe)).toEqual([1000, 5, 5])
    expect(r.ergebnis.stroeme[0].right).toBe(0)   // A rechts nach B
    expect(r.ergebnis.stroeme[1].left).toBe(0)    // C links nach B
  })
  it('Zufahrten mit Kommastellen ergeben ihre auf ganze Fahrzeuge gerundete Menge', () => {
    const z = [{ zu: 200.5, weg: 180.5 }, { zu: 150.5, weg: 170.5 }, { zu: 60.5, weg: 70.5 }, { zu: 40.5, weg: 30.5 }]
    const r = stroemeSchaetzen(KREUZ, z, false)
    expect(r.ok && r.ergebnis.stroeme.map(summe)).toEqual(z.map(a => Math.round(a.zu)))
  })
  it('meldet einen Arm mit Zufahrt, aber ohne erlaubte Fahrbeziehung', () => {
    const r = stroemeSchaetzen(['A', 'C', 'B'], [{ zu: 100, weg: 50 }, { zu: 50, weg: 100 }, { zu: 10, weg: 10 }], false, [['straight', 'right'], [], []])
    expect(!r.ok && r.fehler).toContain('Arm A')
  })
  it('Querschnitt: beide Richtungen je zur Hälfte, Einbahn ganz', () => {
    expect(ausQuerschnitt(400, 'beide')).toEqual({ zu: 200, weg: 200 })
    expect(ausQuerschnitt(400, 'zu')).toEqual({ zu: 400, weg: 0 })
    expect(ausQuerschnitt(400, 'weg')).toEqual({ zu: 0, weg: 400 })
  })
})
