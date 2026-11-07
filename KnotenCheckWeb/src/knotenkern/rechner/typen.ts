// Einzige Datei in src/knotenkern/, die von Hand gepflegt wird (scripts/knotenkern_holen.mjs): Sie enthält nur die Typen, die
// knoten.ts und neigung.ts aus der Typdatei des SichtweitenCheck braucht. Die vollständige Datei zöge fast den ganzen Rechner nach.

import type { P } from '../geo'

/** Längsneigung aus dem Höhenmodell: i [%] in Fahrtrichtung zum Knoten, null wenn unbekannt */
export interface NeigungMessung { i: number | null; quelle: string; laenge: number; punkte: number; hinweis: string | null }

export interface ArmInfo {
  key: string                 // «wid:i:sd»
  nr: string                  // Nummer am Knoten, im Uhrzeigersinn ab Norden; leer, solange nicht nummeriert
  wid: number; i: number; sd: number
  name: string                // Strassenname (leer ohne name)
  hw: string                  // highway
  richtung: P                 // Einheitsvektor vom Knoten weg (Sehne 10 m)
  himmel: string              // Himmelsrichtung, z. B. «Süd»
  zufluss: boolean            // Verkehr fährt auf diesem Arm zum Knoten (keine Einbahn vom Knoten weg)
  stichM?: number             // Stichstück: die Strassenwege des Arms enden nach so vielen Metern
  einbahn: number             // OSM-Einbahn (+1/-1/0) des Wegs
  veloZufluss: boolean        // Velos fahren auf diesem Arm zum Knoten
  veloZuflussQuelle: string   // das Tag des Velos gegen die Einbahn
}

export interface VortrittsHinweis { quelle?: string; armKey?: string; id: number; art: 'stop' | 'give_way'; p: P }

export interface KnotenInfo {
  id: number
  p: P                        // LV95
  ll: [number, number]        // WGS84 [lat, lon]
  name: string                // «Strasse A / Strasse B»
  arme: ArmInfo[]
  vortritt: [string, string] | null   // Arme der vortrittsberechtigten Strasse
  vortrittGrund: string
  vorschlag: string | null    // Zufahrt, wenn eindeutig
  signale: VortrittsHinweis[] // OSM highway=stop/give_way an Armen mit Verkehr zum Knoten
  grundstueck?: boolean
  vortrittSicher?: string     // Vortrittsstrasse sicher bekannt (Signal an einem Arm, priority_road): Grund
  mitVortritt?: string[]
  lsa?: boolean               // Lichtsignal (OSM traffic_signals) am Knoten bzw. auf einem Arm bis 30 m
}
