// Druckblatt Einmündung & Kreuzung: Beim Umbau darf keine Zahl verloren gehen. Die Referenz stammt vom Blatt vor dem Umbau
// (07.11.2026); jede Zahl daraus muss mindestens so oft wieder vorkommen.
import { describe, expect, test } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync, writeFileSync } from 'node:fs'
import { Berechnungsblatt } from '../Berechnungsblatt'
import { analyzeSN640022 } from '../engine/sn640022Calculator'
import { defaultIntersection, toSNLaneFlags, toSNRawVolumes, toSNVolumes, type IntersectionConfiguration } from '../engine/armConfiguration'
import { zahlenAus, fehlendeZahlen } from './zahlen'

function fall(): IntersectionConfiguration {
  const c = defaultIntersection(4)
  const werte = [[40, 420, 60], [55, 380, 35], [25, 30, 45], [20, 15, 30]]
  c.name = 'Prüfknoten'
  c.arms = c.arms.map((a, i) => ({ ...a, streetName: `Strasse ${i}`, leftVolume: werte[i][0], straightVolume: werte[i][1], rightVolume: werte[i][2],
    gradient: i === 2 ? '+2%' : '±0%', fall: 1,
    ...(i === 0 ? { hasSeparateTurnLane: true } : {}), ...(i === 1 ? { hasRightTurnTriangleIsland: true } : {}),
    ...(i >= 2 ? { mixedLaneCombination: i === 2 ? 'all' : 'leftAndThrough' } : {}) }) as typeof a)
  return c
}

const REFERENZ = new URL('./referenz_sn022.json', import.meta.url)

describe('Druckblatt Einmündung & Kreuzung', () => {
  const cfg = fall()
  const result = analyzeSN640022(toSNVolumes(cfg)!, toSNLaneFlags(cfg), toSNRawVolumes(cfg)!)
  const html = renderToStaticMarkup(<Berechnungsblatt cfg={cfg} result={result!} onClose={() => {}} />)
  test('alle Zahlen der Referenz sind noch da', () => {
    if (process.env.REFERENZ_SCHREIBEN) writeFileSync(REFERENZ, JSON.stringify(zahlenAus(html)))
    const ref = JSON.parse(readFileSync(REFERENZ, 'utf8')) as string[]
    expect(fehlendeZahlen(ref, zahlenAus(html))).toEqual([])
  })
})
