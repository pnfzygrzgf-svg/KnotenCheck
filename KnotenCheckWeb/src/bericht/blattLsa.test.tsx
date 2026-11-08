// Druckblatt LSA-Knoten: Beim Umbau darf keine Zahl verloren gehen. Die Referenz stammt vom Blatt vor dem Umbau
// (07.11.2026); jede Zahl daraus muss mindestens so oft wieder vorkommen.
import { describe, expect, test } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync, writeFileSync } from 'node:fs'
import { LSAPrintSheet } from '../LSAApp'
import { armMovements, armStreamIds, calculateLSAV2, tzFor, type DesignSpeed, type Lane } from '../engine/lsaCalculatorV2'
import type { KnotenUebernahme } from '../karte/rechner'
import { zahlenAus, fehlendeZahlen } from './zahlen'

// Kreuzung, Arme in Rechner-Reihenfolge A, C, B, D; A und C mit eigenem Linksabbiegestreifen (FS2), Fussgängerstreifen über B
const ARME = [
  { name: 'Hauptstrasse West', left: 90, straight: 520, right: 70, mix: { pctLW: 6, pctMR: 2, pctFR: 1 }, vDesign: 50 as DesignSpeed },
  { name: 'Hauptstrasse Ost', left: 80, straight: 480, right: 60, vDesign: 50 as DesignSpeed },
  { name: 'Nebenstrasse Süd', left: 50, straight: 140, right: 110, vDesign: 30 as DesignSpeed },
  { name: 'Nebenstrasse Nord', left: 40, straight: 120, right: 70, vDesign: 30 as DesignSpeed },
]
const LABELS = ['A', 'C', 'B', 'D']
const MOVE_LANE: Record<string, 1 | 2> = { q1: 2, q2: 1, q3: 1, q8: 1, q9: 1, q7: 2, q4: 1, q5: 1, q6: 1, q10: 1, q11: 1, q12: 1 }
const FGS = { B: { enabled: true, volume: 180, length: 10 } }
const PHASEN = [
  { id: 1, selectedLaneIds: ['A-FS1', 'C-FS1'] },
  { id: 2, selectedLaneIds: ['A-FS2', 'C-FS2'] },
  { id: 3, selectedLaneIds: ['B-FS1'] },
  { id: 4, selectedLaneIds: ['D-FS1', 'fgs-B'] },
]

// Umrechnung in PWE und Fahrstreifen wie im Rechner
function faktor(m?: { pctLW: number; pctMR: number; pctFR: number }) {
  if (!m) return 1
  const pw = Math.max(0, 100 - m.pctLW - m.pctMR - m.pctFR)
  return (pw + m.pctLW * 2 + m.pctMR * 0.5 + m.pctFR * 0.25) / (pw + m.pctLW + m.pctMR + m.pctFR)
}
function volumen(): Record<string, number> {
  const v: Record<string, number> = {}
  ARME.forEach((a, i) => { for (const m of armMovements(4, i)) v[m.id] = Math.round(a[m.direction] * faktor(a.mix)) })
  v['fgs-B'] = FGS.B.volume
  return v
}
function fahrstreifen(): Lane[] {
  const lanes: Lane[] = []
  LABELS.forEach((lbl, i) => {
    const s = armStreamIds(4, i), fs1 = s.filter(x => MOVE_LANE[x] === 1), fs2 = s.filter(x => MOVE_LANE[x] === 2)
    if (fs1.length) lanes.push({ id: `${lbl}-FS1`, armIndex: i, label: `Arm ${lbl}${fs2.length ? ' FS1' : ''}`, streamIds: fs1 })
    if (fs2.length) lanes.push({ id: `${lbl}-FS2`, armIndex: i, label: `Arm ${lbl} FS2`, streamIds: fs2 })
    if (lbl === 'B') lanes.push({ id: 'fgs-B', armIndex: i, label: 'FGS Arm B', streamIds: ['fgs-B'], isFGS: true, fgLength: FGS.B.length })
  })
  return lanes
}

const REFERENZ = new URL('./referenz_lsa.json', import.meta.url)

describe('Druckblatt LSA-Knoten', () => {
  const volumes = volumen(), lanes = fahrstreifen()
  const tZ = tzFor('staffel', ARME.map(a => a.vDesign))
  const result = calculateLSAV2({ armCount: 4, volumes, lanes, phases: PHASEN.map(p => ({ id: p.id, laneIds: p.selectedLaneIds })), targetLos: 'C', tZ })
  const blatt = (uebernahme?: KnotenUebernahme) => renderToStaticMarkup(
    <LSAPrintSheet nodeName="Prüfknoten LSA" armCount={4} arms={ARME} volumes={volumes} moveLane={MOVE_LANE} fgsConfig={FGS}
      lanes={lanes} phaseStates={PHASEN} result={result} targetLos="C" tzMode="staffel" onClose={() => {}} uebernahme={uebernahme} />)

  test('alle Zahlen der Referenz sind noch da', () => {
    const html = blatt()
    if (process.env.REFERENZ_SCHREIBEN) writeFileSync(REFERENZ, JSON.stringify(zahlenAus(html)))
    const ref = JSON.parse(readFileSync(REFERENZ, 'utf8')) as string[]
    expect(fehlendeZahlen(ref, zahlenAus(html))).toEqual([])
  })

  test('Werte aus der Karte tragen ihr Zeichen, solange sie gleich sind', () => {
    const u = {
      id: 1, lat: 46.95, lon: 7.44, name: 'Prüfknoten LSA', armCount: 4, belegt: [], vergleich: [], hinweise: [], osmStand: '', hoehenModelle: [],
      arme: ARME.map((a, i) => ({ label: LABELS[i], name: a.name, himmel: '', tempo: i === 0 ? 50 : i === 2 ? 20 : 60,
        stroeme: i === 0 ? { left: 90, straight: 520, right: 999 } : undefined })),
    } as KnotenUebernahme
    const html = blatt(u)
    if (!process.env.REFERENZ_SCHREIBEN) {
      // Je ein Zeichen mehr für die Legende. M: Ströme links und geradeaus von Arm A; rechts 70 statt 999 ist von Hand geändert
      expect(html.match(/herkunft herkunft-M/g)!.length).toBe(2 + 1)
      // K: Tempo A 50 = 50, B 20 → 30 (gestaffelt); C und D weichen ab. Dazu die Namen der vier Arme und des Knotens
      expect(html.match(/herkunft herkunft-K/g)!.length).toBe(2 + 4 + 1 + 1)
    }
  })
})
