import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import BerichtQuellen from './BerichtQuellen'

describe('Quellentabelle im Druckblatt', () => {
  it('zeigt die fünf Spalten wie die anderen Rechner', () => {
    const html = renderToString(<BerichtQuellen zeilen={[{ quelle: 'OpenStreetMap (Overpass)', fuer: 'Arme', anbieter: 'OpenStreetMap', stand: '07.11.2026', lizenz: 'ODbL', url: 'https://www.openstreetmap.org/' }]} />)
    for (const s of ['Quelle', 'Für', 'Anbieter', 'Stand', 'Lizenz', 'OpenStreetMap (Overpass)', '07.11.2026', 'href="https://www.openstreetmap.org/"']) expect(html).toContain(s)
  })
  it('fehlt ganz, wenn nichts aus der Karte kam', () => {
    expect(renderToString(<BerichtQuellen zeilen={[]} />)).toBe('')
  })
})
