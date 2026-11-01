// Querungsart der Fussgänger*innen je Knotenarm (VSS 2011/308 und Simulation)
//
// - 'fgs':                Fussgängerstreifen über die Fahrbahn dieses Arms
// - 'trottoirueberfahrt': Trottoir läuft über die Einmündung der Nebenstrasse durch;
//                         Fussgänger*innen haben gegenüber den ein- und ausfahrenden
//                         Fahrzeugen Vortritt (VRV Art. 41 Abs. 2)
//
// Annahme: Eine Trottoirüberfahrt wird gerechnet wie ein Fussgängerstreifen über die
// Nebenstrasse (Querungslänge = Breite der Einmündung). VSS 2011/308 kennt die
// Trottoirüberfahrt nicht. Es gibt sie nur an Nebenstrassen-Armen und ohne Mittelinsel.

export type Querung = 'keine' | 'fgs' | 'trottoirueberfahrt'

export const QUERUNGEN: readonly Querung[] = ['keine', 'fgs', 'trottoirueberfahrt']

export const QUERUNG_LABEL: Record<Querung, string> = {
  keine:              'keine',
  fgs:                'Fussgängerstreifen',
  trottoirueberfahrt: 'Trottoirüberfahrt',
}

// Bezeichnung in Ergebnis und Druckblatt (Trottoirüberfahrt mit Annahme)
export const QUERUNG_ERGEBNIS: Record<Querung, string> = {
  keine:              'keine Querung',
  fgs:                'Fussgängerstreifen',
  trottoirueberfahrt: 'Trottoirüberfahrt (Annahme: wie Fussgängerstreifen)',
}

// Querungsart bestimmen:
// - gültiger Wert wird übernommen; eine Trottoirüberfahrt an einem Arm, der keine
//   Nebenstrasse ist, wird zum Fussgängerstreifen
// - fehlt der Wert (ältere gespeicherte Dateien) oder ist er ungültig, folgt er aus
//   den bisherigen Feldern: Fussgänger*innen vorhanden → 'fgs', sonst 'keine'
export function resolveQuerung(value: unknown, hatFussgaenger: boolean, istNebenstrasse: boolean): Querung {
  const q: Querung = QUERUNGEN.includes(value as Querung)
    ? value as Querung
    : hatFussgaenger ? 'fgs' : 'keine'
  return q === 'trottoirueberfahrt' && !istNebenstrasse ? 'fgs' : q
}
