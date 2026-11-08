// Druckblatt der Simulation: Gerüst wie in den anderen Rechnern, Zahlen aus einem festen Lauf (seed)
import { describe, expect, test } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { SimulationBlatt, type SimLauf } from '../SimulationApp'
import { runStochasticSN640022 } from '../engine/stochasticSN640022'
import { defaultIntersection, toSNLaneFlags, toSNRawVolumes, toSNVolumes, type IntersectionConfiguration } from '../engine/armConfiguration'

function fall(): IntersectionConfiguration {
  const c = defaultIntersection(3)
  const werte = [[0, 400, 60], [50, 350, 0], [40, 0, 30]]
  c.arms = c.arms.map((a, i) => ({ ...a, streetName: `Strasse ${i}`, leftVolume: werte[i][0], straightVolume: werte[i][1],
    rightVolume: werte[i][2], gradient: '±0%', fall: 1 }) as typeof a)
  return c
}

describe('Druckblatt Simulation', () => {
  const cfg = fall()
  const result = runStochasticSN640022(toSNVolumes(cfg)!, toSNLaneFlags(cfg), toSNRawVolumes(cfg)!, {
    runs: 10, seed: 11, useCowan: true, tcSigma: 0.5,
    pedestrians: { armA: { enabled: true, querung: 'fgs', fg: 120, rho: 2, mittelinsel: false, fahrbahnbreite: 7 },
                   armC: { enabled: false, fg: 0, rho: 0, mittelinsel: false } },
  })!
  const lauf: SimLauf = { arms: cfg.arms, intervalle: null }
  const html = renderToStaticMarkup(<SimulationBlatt result={result} lauf={lauf} nodeName="Prüfknoten" armCount={3}
    veraltet={false} onClose={() => {}} />)
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

  test('Abschnitte in der Reihenfolge Ergebnis, Eingaben, Annahmen und Hinweise, Quellen', () => {
    const titel = [...html.matchAll(/<h2 class="bl-sec">([^<]+)<\/h2>/g)].map(m => m[1])
    expect(titel).toEqual(['Ergebnis', 'Eingaben', 'Annahmen und Hinweise', 'Quellen'])
  })

  test('Kopf, Mittelwert eines Stroms und Eingaben des Laufs stehen im Blatt', () => {
    expect(text).toContain('Simulation Wartezeiten')
    const s = result.streams.find(x => x.stats !== null)!
    expect(text).toContain(`Mittelwert ${Math.round(s.stats!.mean)} s`)
    expect(text).toContain('Strasse 2')
    expect(text).toContain('Fussgängerstreifen: 120 Fg/h')
    expect(text).toContain('Jeder Lauf streut')
    expect(text).not.toContain('Eingaben wurden nach dieser Simulation geändert')
  })

  test('ohne gespeicherten Lauf nur die Einstellungen, mit Vermerk', () => {
    const ohne = renderToStaticMarkup(<SimulationBlatt result={result} nodeName="" armCount={3} veraltet onClose={() => {}} />)
    expect(ohne).toContain('Verkehrsstärken des Laufs sind nicht gespeichert')
    expect(ohne).toContain('Eingaben wurden nach dieser Simulation geändert')
    expect(ohne).not.toContain('Strasse 2')
  })
})
