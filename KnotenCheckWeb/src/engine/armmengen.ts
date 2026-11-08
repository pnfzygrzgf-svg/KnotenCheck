// Abbiegeströme aus gezählten Armmengen schätzen: feste Anteile links/geradeaus/rechts als Start, dann abwechselnd auf die gezählten
// Zu- und Wegfahrten ausgeglichen (Furness, auch IPF genannt), bis die Armsummen auf REST_GRENZE stimmen; sonst kein Vorschlag.
// Danach je Zufahrt auf ganze Fahrzeuge gerundet. Es sind Schätzwerte, nicht gezählt.
//
// Die Arme stehen in der Reihenfolge der Rechner: [A, C, B, D] mit A West, C Ost, B Süd, D Nord; am Kreisel Nummern in Fahrtrichtung,
// rechts führt von Arm i zu Arm i + 1.

export type Fahrbeziehung = 'left' | 'straight' | 'right'
export const FAHRBEZIEHUNGEN: readonly Fahrbeziehung[] = ['left', 'straight', 'right']
export interface ArmStroeme { left: number; straight: number; right: number }

/** Annahme: Startanteile der Fahrbeziehungen; nur ihr Verhältnis je Zufahrt zählt, der Ausgleich passt sie an die Zählung an.
 *  Mit Hauptstrasse (A und C, wie in SN 640 022) gelten eigene Werte für Haupt- und Nebenstrasse, sonst (Kreisel, LSA) gemeinsame. */
export const START_HAUPT: Record<Fahrbeziehung, number> = { left: 0.14, straight: 0.73, right: 0.13 }
export const START_NEBEN: Record<Fahrbeziehung, number> = { left: 0.31, straight: 0.31, right: 0.38 }
export const START_ALLE: Record<Fahrbeziehung, number> = { left: 0.22, straight: 0.61, right: 0.17 }
export const istHauptarm = (label: string) => label === 'A' || label === 'C'
export const startAnteile = (label: string, hauptstrasse: boolean): Record<Fahrbeziehung, number> =>
  !hauptstrasse ? START_ALLE : istHauptarm(label) ? START_HAUPT : START_NEBEN
/** Annahme: Über dieser Abweichung zwischen allen Zu- und Wegfahrten gibt es einen Hinweis */
export const SUMMEN_TOLERANZ = 0.05
/** Annahme: So genau [Fz/h] muss jede Armsumme nach dem Ausgleich stimmen, sonst gehen die Armmengen nicht auf */
export const REST_GRENZE = 0.5
const MAX_SCHRITTE = 20000

const ZIEL: Record<string, Record<Fahrbeziehung, string>> = {
  A: { left: 'D', straight: 'C', right: 'B' }, C: { left: 'B', straight: 'A', right: 'D' },
  B: { left: 'A', straight: 'D', right: 'C' }, D: { left: 'C', straight: 'B', right: 'A' },
}

/** Index des Zielarms einer Fahrbeziehung; null, wenn es sie nicht gibt (Einmündung, Kreisel mit drei Armen geradeaus) */
export function zielIndex(labels: readonly string[], i: number, f: Fahrbeziehung, kreisel: boolean): number | null {
  const n = labels.length
  if (kreisel) {
    if (n === 3 && f === 'straight') return null
    return (i + (f === 'right' ? 1 : f === 'left' ? n - 1 : 2)) % n
  }
  const j = labels.indexOf(ZIEL[labels[i]]?.[f] ?? '')
  return j < 0 ? null : j
}

export interface ArmZaehlung { zu: number; weg: number }
export type Richtung = 'beide' | 'zu' | 'weg'

/** Querschnitt als Zu- und Wegfahrt: beide Richtungen je zur Hälfte (Annahme), bei Einbahn ganz in einer Richtung */
export function ausQuerschnitt(q: number, richtung: Richtung): ArmZaehlung {
  if (richtung === 'zu') return { zu: q, weg: 0 }
  if (richtung === 'weg') return { zu: 0, weg: q }
  return { zu: q / 2, weg: q / 2 }
}

export interface SchaetzErgebnis { stroeme: ArmStroeme[]; hinweise: string[] }
export type SchaetzAntwort = { ok: true; ergebnis: SchaetzErgebnis } | { ok: false; fehler: string }

/** Eine Zufahrt auf ganze Fahrzeuge runden, Summe = ziel (grösster Rest). Fahrzeuge kommen nur zu Strömen, die nach dem
 *  Ausgleich Verkehr haben; Wenden, ausgeschlossene Ströme und Ströme zu Armen ohne Wegfahrt bleiben 0. */
function runden(werte: readonly number[], ziel: number): number[] {
  const r = werte.map(w => Math.floor(w))
  const rest = (i: number) => werte[i] - r[i]
  let diff = ziel - r.reduce((s, x) => s + x, 0)
  const auf = werte.map((_, i) => i).filter(i => werte[i] > 1e-6).sort((a, b) => rest(b) - rest(a))
  while (diff > 0 && auf.length > 0) for (const i of auf) { if (diff === 0) break; r[i]++; diff-- }
  const ab = werte.map((_, i) => i).sort((a, b) => rest(a) - rest(b))
  while (diff < 0 && r.some(x => x > 0)) for (const i of ab) { if (diff === 0) break; if (r[i] > 0) { r[i]--; diff++ } }
  return r
}

/** Ströme je Arm aus den gezählten Armmengen. verboten[i] nennt Fahrbeziehungen, die es an Arm i nicht gibt.
 *  hauptstrasse: A und C sind Hauptstrasse, B und D Nebenstrasse (eigene Startanteile); sonst gemeinsame Startanteile */
export function stroemeSchaetzen(labels: readonly string[], zaehlung: readonly ArmZaehlung[], kreisel: boolean,
  verboten: readonly (readonly Fahrbeziehung[])[] = [], hauptstrasse = false): SchaetzAntwort {
  const n = labels.length
  if (zaehlung.length !== n) return { ok: false, fehler: 'Für jeden Arm braucht es eine Zählung.' }
  if (zaehlung.some(z => !(z.zu >= 0) || !(z.weg >= 0))) return { ok: false, fehler: 'Armmengen müssen Zahlen ab 0 sein.' }
  const zu = zaehlung.map(z => z.zu), sumZu = zu.reduce((s, x) => s + x, 0)
  let weg = zaehlung.map(z => z.weg)
  const sumWeg = weg.reduce((s, x) => s + x, 0)
  if (sumZu <= 0) return { ok: false, fehler: 'Keine Zufahrt gezählt.' }
  if (sumWeg <= 0) return { ok: false, fehler: 'Keine Wegfahrt gezählt.' }
  const hinweise: string[] = []
  const abw = Math.abs(sumWeg - sumZu) / sumZu
  if (abw > SUMMEN_TOLERANZ) {
    hinweise.push(`Zu- und Wegfahrten weichen um ${Math.round(abw * 100)} % voneinander ab (${Math.round(sumZu)} gegen ${Math.round(sumWeg)} Fz/h). ` +
      'Die Wegfahrten sind anteilig an die Zufahrten angepasst; bitte die Zählung prüfen.')
  }
  weg = weg.map(x => x * sumZu / sumWeg)

  // Start: feste Anteile, verbotene und fehlende Fahrbeziehungen 0
  const t = labels.map(() => labels.map(() => 0)), typ: (Fahrbeziehung | null)[][] = labels.map(() => labels.map(() => null))
  const mitHaupt = hauptstrasse && !kreisel
  labels.forEach((l, i) => FAHRBEZIEHUNGEN.forEach(f => {
    const j = zielIndex(labels, i, f, kreisel)
    if (j === null || verboten[i]?.includes(f)) return
    t[i][j] = startAnteile(l, mitHaupt)[f]; typ[i][j] = f
  }))
  for (let i = 0; i < n; i++) {
    if (zu[i] > 0 && t[i].every(x => x === 0)) return { ok: false, fehler: `Arm ${labels[i]} hat eine Zufahrt, aber keine erlaubte Fahrbeziehung.` }
    if (weg[i] > 0 && t.every((z, k) => z[i] === 0 || zu[k] === 0)) {
      return { ok: false, fehler: `Arm ${labels[i]} hat eine Wegfahrt, aber kein Arm mit Zufahrt fährt dorthin.` }
    }
  }

  // Abwechselnd Zeilen (Zufahrten) und Spalten (Wegfahrten) anpassen, bis jede Armsumme stimmt
  const zeile = (i: number) => t[i].reduce((a, x) => a + x, 0), spalte = (j: number) => t.reduce((a, z) => a + z[j], 0)
  const restOf = () => Math.max(...labels.map((_, i) => Math.abs(zeile(i) - zu[i])), ...labels.map((_, j) => Math.abs(spalte(j) - weg[j])))
  let rest = Infinity
  for (let schritt = 0; schritt < MAX_SCHRITTE && rest > 1e-6; schritt++) {
    for (let i = 0; i < n; i++) { const s = zeile(i); if (s > 0) t[i] = t[i].map(x => x * zu[i] / s) }
    for (let j = 0; j < n; j++) { const s = spalte(j); if (s > 0) for (let i = 0; i < n; i++) t[i][j] *= weg[j] / s }
    rest = restOf()
  }
  const nichtLoesbar: SchaetzAntwort = { ok: false, fehler: 'Die Armmengen gehen nicht auf, etwa weil eine Wegfahrt grösser ist als die Zufahrten, ' +
    'die dorthin fahren können, oder weil ausgeschlossene Fahrbeziehungen den Weg versperren. Bitte die Zählung prüfen.' }
  if (rest > REST_GRENZE) return nichtLoesbar

  const gerundet = labels.map((_, i) => runden(t[i], Math.round(zu[i])))
  // Kontrolle: Jede Zufahrt ergibt ihre gerundete Menge, nicht vorhandene Ströme bleiben 0
  if (gerundet.some((r, i) => r.reduce((a, x) => a + x, 0) !== Math.round(zu[i]) || r.some((w, j) => w > 0 && !typ[i][j]))) return nichtLoesbar
  const stroeme = gerundet.map((r, i) => {
    const s: ArmStroeme = { left: 0, straight: 0, right: 0 }
    r.forEach((w, j) => { const f = typ[i][j]; if (f) s[f] += w })
    return s
  })
  return { ok: true, ergebnis: { stroeme, hinweise } }
}
