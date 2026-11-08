// Druckblatt Ungesteuerter Knoten mit Fussgänger*innen: Beim Umbau darf keine Zahl verloren gehen. Die Referenz stammt vom
// Blatt vor dem Umbau (07.11.2026); jede Zahl daraus muss mindestens so oft wieder vorkommen.
import { describe, expect, test } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync, writeFileSync } from 'node:fs'
import { Bewertungsblatt308 } from '../VSS308App'
import { calculateVSS308, type ArmInput } from '../engine/vss2011308Calculator'
import { zahlenAus, fehlendeZahlen } from './zahlen'

// Kreuzung, Reihenfolge des Rechners: A, C (Hauptstrasse), B, D (Nebenstrasse)
function fall(): ArmInput[] {
  return [
    { name: 'Strasse A', roadType: 'HS', left: 40, straight: 420, right: 60, querung: 'fgs', fg: 120, rho: 2, mittelinsel: true },
    { name: 'Strasse C', roadType: 'HS', left: 55, straight: 380, right: 35, querung: 'fgs', fg: 80, rho: 1, mittelinsel: false },
    { name: 'Strasse B', roadType: 'NS', left: 25, straight: 30, right: 45, querung: 'fgs', fg: 60, rho: 3, mittelinsel: false },
    { name: 'Strasse D', roadType: 'NS', left: 20, straight: 15, right: 30, querung: 'trottoirueberfahrt', fg: 40, rho: 1, mittelinsel: false },
  ]
}

const REFERENZ = new URL('./referenz_vss308.json', import.meta.url)
// Das alte Blatt hatte eine eigene Fusszeile mit der Lizenz («© 2026 … AGPL-3.0, … CC BY-SA 4.0»); das gemeinsame Gerüst führt
// sie nicht, die Lizenz steht in der Fusszeile des Rechners. Diese drei Zahlen sind keine Ergebnisse und gelten als vorhanden.
const LIZENZ = ['2026', '-3.0', '4.0']

describe('Druckblatt Ungesteuerter Knoten mit Fussgänger*innen', () => {
  const arms = fall()
  const result = calculateVSS308({ type: '4arm', arms })
  const html = renderToStaticMarkup(<Bewertungsblatt308 nodeName="Prüfknoten" nodeType="4arm" arms={arms} result={result} onClose={() => {}} />)
  test('alle Zahlen der Referenz sind noch da', () => {
    if (process.env.REFERENZ_SCHREIBEN) writeFileSync(REFERENZ, JSON.stringify(zahlenAus(html)))
    const ref = JSON.parse(readFileSync(REFERENZ, 'utf8')) as string[]
    expect(fehlendeZahlen(ref, [...zahlenAus(html), ...LIZENZ])).toEqual([])
  })
})
