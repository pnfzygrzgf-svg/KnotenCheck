// Druckblatt Kreisverkehr: Beim Umbau darf keine Zahl verloren gehen. Die Referenz stammt vom Blatt vor dem Umbau
// (07.11.2026); jede Zahl daraus muss mindestens so oft wieder vorkommen.
import { describe, expect, test } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync, writeFileSync } from 'node:fs'
import { Bewertungsblatt, type ArmInput } from '../RoundaboutApp'
import type { KnotenUebernahme } from '../karte/rechner'
import { calculateRoundabout, computeQAfromTurnings, computeQKfromTurnings, entryFactor, ringFactor } from '../engine/roundaboutCalculator'
import { zahlenAus, fehlendeZahlen } from './zahlen'

function fall(): ArmInput[] {
  return [
    { name: 'Bahnhofstrasse', type: '1/1', right: 180, straight: 320, left: 90, fg: 120, gradient: '+2%',
      exitWide: false, exitTwoLanes: false, mischung: 'pauschal' },
    { name: 'Seeweg', type: '2/1+', right: 150, straight: 260, left: 110, fg: 450, gradient: '±0%',
      exitWide: true, exitTwoLanes: false, mischung: 'detail', mix: { pctFR: 4, pctMR: 2, pctLW: 6, pctLZ: 3 } },
    { name: 'Kirchgasse', type: '1/1', right: 70, straight: 140, left: 40, fg: 0, gradient: '-2%',
      exitWide: false, exitTwoLanes: false, mischung: 'pauschal' },
    { name: 'Industriestrasse', type: '2/1+', right: 120, straight: 200, left: 60, fg: 60, gradient: '±0%',
      exitWide: true, exitTwoLanes: false, mischung: 'pauschal' },
  ]
}

// Wie im Rechner (RoundaboutApp): Q_E mit dem f der Einfahrt, Q_K mit dem Ring-f, Q_A mit dem f der Herkunftsarme
function rechnen(arms: ArmInput[]) {
  const f = (a: ArmInput) => entryFactor(a.gradient!, a.mix)
  const qe = arms.map(a => Math.round((a.right + a.straight + a.left) * f(a)))
  const qk = computeQKfromTurnings(arms.map(a => a.right * ringFactor(a.mix)), arms.map(a => a.straight * ringFactor(a.mix)),
    arms.map(a => a.left * ringFactor(a.mix)), 4).map(Math.round)
  const qa = computeQAfromTurnings(arms.map(a => a.right * f(a)), arms.map(a => a.straight * f(a)), arms.map(a => a.left * f(a)), 4).map(Math.round)
  return calculateRoundabout({ type: arms.map(a => a.type!), qe, qk, fg: arms.map(a => a.fg), qa,
    exitWide: arms.map(a => a.exitWide === true), exitTwoLanes: arms.map(a => a.exitTwoLanes === true) })
}

const REFERENZ = new URL('./referenz_kreisel.json', import.meta.url)

describe('Druckblatt Kreisverkehr', () => {
  const arms = fall()
  const result = rechnen(arms)
  const html = renderToStaticMarkup(<Bewertungsblatt nodeName="Prüfkreisel" armCount={4} arms={arms} result={result} onClose={() => {}} />)
  test('alle Zahlen der Referenz sind noch da', () => {
    if (process.env.REFERENZ_SCHREIBEN) writeFileSync(REFERENZ, JSON.stringify(zahlenAus(html)))
    const ref = JSON.parse(readFileSync(REFERENZ, 'utf8')) as string[]
    expect(fehlendeZahlen(ref, zahlenAus(html))).toEqual([])
  })
  test('Werte aus Karte und Modell tragen ihr Zeichen, solange sie unverändert sind', () => {
    const u = { arme: [
      { label: 'A', name: 'Bahnhofstrasse', himmel: 'N', neigung: '+2%', kreiselTyp: '1/1', stroeme: { left: 90, straight: 320, right: 180 } },
      { label: 'B', name: 'Seeweg', himmel: 'O', stroeme: { left: 111, straight: 260, right: 150 } },
      { label: 'C', name: 'Kirchgasse', himmel: 'S' },
      { label: 'D', name: 'Industrie', himmel: 'W' },
    ] } as unknown as KnotenUebernahme
    const mit = renderToStaticMarkup(<Bewertungsblatt nodeName="" armCount={4} arms={arms} result={result} onClose={() => {}} uebernahme={u} />)
    const m = mit.match(/herkunft-M" title/g)?.length ?? 0, k = mit.match(/herkunft-K" title/g)?.length ?? 0
    expect(m).toBe(5)       // Arm 1 drei Ströme, Arm 2 zwei (links von Hand geändert)
    expect(k).toBe(5)       // Arm 1 Name, Typ, Neigung; Arm 2 und 3 Name; Arm 4 umbenannt
    expect(mit).toContain('Modellwert des NPVM')
  })
})
