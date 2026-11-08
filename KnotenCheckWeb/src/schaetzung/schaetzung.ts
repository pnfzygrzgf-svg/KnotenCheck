// Schätzung der Abbiegeströme aus gezählten Armmengen: Eingabe, Hinweistext und Speichern. Die Rechnung steht in engine/armmengen.ts.

import { ausQuerschnitt, FAHRBEZIEHUNGEN, istHauptarm, START_ALLE, START_HAUPT, START_NEBEN, stroemeSchaetzen, type ArmStroeme, type Fahrbeziehung, type Richtung, type SchaetzAntwort } from '../engine/armmengen'

export type Modus = 'gerichtet' | 'querschnitt'
export interface ArmMengenEingabe { zu: number | null; weg: number | null; q: number | null; richtung: Richtung; verboten: Fahrbeziehung[] }
export interface ArmmengenEingabe { modus: Modus; arme: ArmMengenEingabe[] }
/** Übernommene Schätzung: Eingabe, Ströme in der Reihenfolge der Rechner, Hinweis für Rechner und Bericht */
export interface Schaetzung { eingabe: ArmmengenEingabe; stroeme: ArmStroeme[]; text: string }

const FB_TEXT: Record<Fahrbeziehung, string> = { left: 'links', straight: 'geradeaus', right: 'rechts' }
const pct = (x: number) => Math.round(x * 100)

export const leereArmMengen = (n: number): ArmMengenEingabe[] =>
  Array.from({ length: n }, () => ({ zu: null, weg: null, q: null, richtung: 'beide' as Richtung, verboten: [] }))

/** Zählung aus der Eingabe; null, solange ein Arm leer ist */
export function zaehlungAus(e: ArmmengenEingabe): { zu: number; weg: number }[] | null {
  if (e.modus === 'gerichtet') return e.arme.every(a => a.zu !== null && a.weg !== null) ? e.arme.map(a => ({ zu: a.zu!, weg: a.weg! })) : null
  return e.arme.every(a => a.q !== null) ? e.arme.map(a => ausQuerschnitt(a.q!, a.richtung)) : null
}

const dreiWerte = (a: Record<Fahrbeziehung, number>) => `${pct(a.left)}, ${pct(a.straight)} und ${pct(a.right)} %`

/** Hinweis für den Rechner und den Bericht unter «Annahmen und Hinweise». hauptstrasse: A und C sind Hauptstrasse */
export function schaetzungText(e: ArmmengenEingabe, labels: readonly string[], hinweise: readonly string[], hauptstrasse = false): string {
  const haupt = labels.filter(istHauptarm), neben = labels.filter(l => !istHauptarm(l))
  const anteile = hauptstrasse
    ? `feste Anteile links, geradeaus, rechts an der Hauptstrasse (${haupt.join(', ')}) von ${dreiWerte(START_HAUPT)}, `
      + `an der Nebenstrasse (${neben.join(', ')}) von ${dreiWerte(START_NEBEN)} (Annahme)`
    : `feste Anteile links, geradeaus, rechts von ${dreiWerte(START_ALLE)} (Annahme)`
  const quelle = e.modus === 'gerichtet'
    ? 'aus gezählten Zu- und Wegfahrten je Arm'
    : 'aus gezählten Querschnitten je Arm, beide Richtungen je zur Hälfte angenommen (ausser bei Einbahn); ohne Richtungen ist der Vorschlag deutlich ungenauer'
  const verboten = e.arme.flatMap((a, i) => a.verboten.map(f => `${labels[i]} ${FB_TEXT[f]}`))
  return [`Abbiegeströme geschätzt ${quelle}: ${anteile}, auf die gezählten Mengen ausgeglichen.`,
    ...(verboten.length ? [`Ausgeschlossen: ${verboten.join(', ')}.`] : []), ...hinweise,
    'Geschätzt, nicht gezählt: bitte prüfen.'].join(' ')
}

/** Rechnen; bei Erfolg die Schätzung zum Übernehmen. hauptstrasse: Rechner mit Haupt- und Nebenstrasse (A, C / B, D) */
export function schaetzen(e: ArmmengenEingabe, labels: readonly string[], kreisel: boolean, hauptstrasse = false): { schaetzung: Schaetzung } | { fehler: string } {
  const z = zaehlungAus(e)
  if (!z) return { fehler: 'Bitte für jeden Arm eine Menge eingeben (0, wenn dort kein Verkehr fährt).' }
  const mitHaupt = hauptstrasse && !kreisel
  const r: SchaetzAntwort = stroemeSchaetzen(labels, z, kreisel, e.arme.map(a => a.verboten), mitHaupt)
  if (!r.ok) return { fehler: r.fehler }
  return { schaetzung: { eingabe: e, stroeme: r.ergebnis.stroeme, text: schaetzungText(e, labels, r.ergebnis.hinweise, mitHaupt) } }
}

/** Gilt die Schätzung noch? Ja, solange mindestens ein Strom mit Verkehr dem geschätzten Wert entspricht */
export function schaetzungGilt(s: Schaetzung | null | undefined, aktuell: readonly ArmStroeme[]): boolean {
  return !!s && aktuell.some((a, i) => FAHRBEZIEHUNGEN.some(f => s.stroeme[i] && s.stroeme[i][f] > 0 && a[f] === s.stroeme[i][f]))
}

const zahl = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) && x >= 0 ? x : null)

/** Schätzung aus einer Speicherdatei; null bei fehlender oder unpassender Angabe */
export function schaetzungLesen(x: unknown, n: number): Schaetzung | null {
  const s = x as Partial<Schaetzung> | null | undefined
  if (!s || typeof s.text !== 'string' || !Array.isArray(s.stroeme) || s.stroeme.length !== n) return null
  const stroeme = s.stroeme.map(a => ({ left: zahl(a?.left) ?? 0, straight: zahl(a?.straight) ?? 0, right: zahl(a?.right) ?? 0 }))
  const roh = s.eingabe as Partial<ArmmengenEingabe> | undefined
  const arme = Array.isArray(roh?.arme) && roh.arme.length === n ? roh.arme.map(a => ({
    zu: zahl(a?.zu), weg: zahl(a?.weg), q: zahl(a?.q),
    richtung: (a?.richtung === 'zu' || a?.richtung === 'weg' ? a.richtung : 'beide') as Richtung,
    verboten: (Array.isArray(a?.verboten) ? a.verboten : []).filter((f): f is Fahrbeziehung => FAHRBEZIEHUNGEN.includes(f as Fahrbeziehung)),
  })) : leereArmMengen(n)
  return { eingabe: { modus: roh?.modus === 'querschnitt' ? 'querschnitt' : 'gerichtet', arme }, stroeme, text: s.text }
}
