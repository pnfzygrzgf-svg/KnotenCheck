import { describe, expect, it } from 'vitest'
import { avObjekte, inLuzern } from './avEbene'

describe('Amtliche Vermessung im KnotenCheck', () => {
  const ring: [number, number][] = [[2600000, 1200000], [2600010, 1200000], [2600010, 1200010]]
  it('teilt die Flächen in die Arten der anderen Rechner ein', () => {
    const [a, b, c] = avObjekte([{ art: 'Strasse_Weg', ringe: [ring] }, { art: 'Gebaeude', ringe: [ring] }, { art: 'Acker_Wiese_Weide', ringe: [ring] }])
    expect([a.klasse, b.klasse, c.klasse]).toEqual(['strasse', 'gebaeude', 'gruen'])
    expect(a.text).toBe('Strasse, Weg (Amtliche Vermessung)')
    expect(a.deckkraft).toBeGreaterThan(0)
  })
  it('lässt Flächen ohne Ring weg', () => {
    expect(avObjekte([{ art: 'Trottoir', ringe: [] }])).toEqual([])
  })
  it('nimmt in der Stadt Luzern deren Dienst', () => {
    expect(inLuzern({ e: 2666000, n: 1211000 })).toBe(true)
    expect(inLuzern({ e: 2600000, n: 1200000 })).toBe(false)
  })
})
