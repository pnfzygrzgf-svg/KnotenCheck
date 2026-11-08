import { describe, expect, it } from 'vitest'
import { leereArmMengen, schaetzen, schaetzungGilt, schaetzungLesen, zaehlungAus, type ArmmengenEingabe } from './schaetzung'

const L = ['A', 'C', 'B', 'D']
const gerichtet = (z: [number, number][]): ArmmengenEingabe =>
  ({ modus: 'gerichtet', arme: z.map(([zu, weg]) => ({ ...leereArmMengen(1)[0], zu, weg })) })

describe('Schätzung aus Armmengen im Rechner', () => {
  it('rechnet erst, wenn jeder Arm eine Menge hat', () => {
    expect(zaehlungAus({ modus: 'gerichtet', arme: leereArmMengen(4) })).toBeNull()
    expect('fehler' in schaetzen({ modus: 'gerichtet', arme: leereArmMengen(4) }, L, false)).toBe(true)
  })
  it('Hinweis nennt Anteile, Ausschlüsse und dass es geschätzt ist', () => {
    const e = gerichtet([[300, 300], [300, 300], [100, 100], [100, 100]])
    e.arme[0].verboten = ['left']
    const r = schaetzen(e, L, false)
    expect('schaetzung' in r).toBe(true)
    if (!('schaetzung' in r)) return
    expect(r.schaetzung.text).toContain('22, 61 und 17 % (Annahme)')
    expect(r.schaetzung.text).toContain('Ausgeschlossen: A links.')
    expect(r.schaetzung.text).toContain('Geschätzt, nicht gezählt')
    expect(r.schaetzung.stroeme[0].left).toBe(0)
  })
  it('mit Hauptstrasse: Hinweis nennt die Anteile von Haupt- und Nebenstrasse', () => {
    const r = schaetzen(gerichtet([[300, 300], [300, 300], [100, 100], [100, 100]]), L, false, true)
    if (!('schaetzung' in r)) throw new Error('keine Schätzung')
    expect(r.schaetzung.text).toContain('an der Hauptstrasse (A, C) von 14, 73 und 13 %')
    expect(r.schaetzung.text).toContain('an der Nebenstrasse (B, D) von 31, 31 und 38 % (Annahme)')
    const t = schaetzen(gerichtet([[300, 300], [300, 300], [100, 100]]), ['A', 'C', 'B'], false, true)
    expect('schaetzung' in t && t.schaetzung.text).toContain('an der Nebenstrasse (B) von')
  })
  it('Kreisel kennt keine Hauptstrasse: gemeinsame Anteile', () => {
    const r = schaetzen(gerichtet([[300, 300], [300, 300], [100, 100], [100, 100]]), ['1', '2', '3', '4'], true, true)
    expect('schaetzung' in r && r.schaetzung.text).toContain('22, 61 und 17 % (Annahme)')
  })
  it('Querschnitt: Hinweis auf die 50/50-Annahme', () => {
    const r = schaetzen({ modus: 'querschnitt', arme: [600, 600, 200, 200].map(q => ({ ...leereArmMengen(1)[0], q })) }, L, false)
    expect('schaetzung' in r && r.schaetzung.text).toContain('beide Richtungen je zur Hälfte angenommen')
  })
  it('gilt, solange ein Strom mit Verkehr noch gleich ist', () => {
    const r = schaetzen(gerichtet([[300, 300], [300, 300], [100, 100], [100, 100]]), L, false)
    if (!('schaetzung' in r)) throw new Error('keine Schätzung')
    const s = r.schaetzung
    expect(schaetzungGilt(s, s.stroeme)).toBe(true)
    expect(schaetzungGilt(s, s.stroeme.map(() => ({ left: 1, straight: 1, right: 1 })))).toBe(false)
    expect(schaetzungGilt(null, s.stroeme)).toBe(false)
  })
  it('Speicherdatei: liest nur passende Angaben', () => {
    const r = schaetzen(gerichtet([[300, 300], [300, 300], [100, 100], [100, 100]]), L, false)
    if (!('schaetzung' in r)) throw new Error('keine Schätzung')
    const zurueck = schaetzungLesen(JSON.parse(JSON.stringify(r.schaetzung)), 4)
    expect(zurueck).toEqual(r.schaetzung)
    expect(schaetzungLesen(r.schaetzung, 3)).toBeNull()
    expect(schaetzungLesen({ text: 1 }, 4)).toBeNull()
  })
})
