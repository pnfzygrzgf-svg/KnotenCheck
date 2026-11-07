// Die Rechner beginnen leer: Sie dürfen ohne Angaben nicht abstürzen und zeigen keine Werte, die niemand eingegeben hat
import { describe, test, expect } from 'vitest'
import { renderToString } from 'react-dom/server'
import type { ComponentType } from 'react'
import type { KnotenUebernahme } from './karte/rechner'
import SN022App from './SN022App'
import RoundaboutApp from './RoundaboutApp'
import VSS308App from './VSS308App'
import LSAApp from './LSAApp'
import SimulationApp from './SimulationApp'

const knoten: KnotenUebernahme = {
  id: 1, lat: 46.95, lon: 7.44, name: 'Knoten', armCount: 4, belegt: [], vergleich: [], hinweise: [], osmStand: "unbekannt", hoehenModelle: [],
  arme: ['A', 'C', 'B', 'D'].map(label => ({ label, name: `Strasse ${label}`, himmel: 'N' })),
}

const RECHNER: [string, ComponentType<{ uebernahme?: KnotenUebernahme }>][] = [
  ['SN 640 022', SN022App], ['Kreisel', RoundaboutApp], ['VSS 2011/308', VSS308App], ['LSA', LSAApp], ['Simulation', SimulationApp],
]

describe.each(RECHNER)('%s', (_, Rechner) => {
  test('ohne Angaben: nur die Frage nach dem Knotentyp', () => {
    const html = renderToString(<Rechner />)
    expect(html).toContain('Für die Berechnung fehlt noch')
    expect(html).not.toContain('Neuer Knoten')
    expect(html).not.toContain('Neue Simulation')
  })
  test('aus der Karte: leere Felder, kein Ergebnis', () => {
    const html = renderToString(<Rechner uebernahme={knoten} />)
    expect(html).toContain('Für die Berechnung fehlt noch')
    expect(html).not.toMatch(/<input[^>]*type="number"[^>]*value="[1-9]/)   // kein Zahlenfeld ist belegt
    expect(html).not.toMatch(/<input[^>]*checked=""[^>]*>/)                 // kein Häkchen, keine Wahl
    expect(html).not.toMatch(/<option[^>]*selected=""[^>]*value="[^"]/)     // keine Auswahl
  })
})
