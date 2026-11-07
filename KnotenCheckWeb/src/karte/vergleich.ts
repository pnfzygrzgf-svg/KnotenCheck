// Vergleich der eingegebenen Ströme mit Modell- und Zählwerten je Arm. Nur Anzeige, ohne Wirkung auf die Rechnung. Bewusst ohne
// Knotenerkennung (siehe rechner.ts).

/** Modellwerte und Zählwerte eines Arms; alle Werte sind Querschnitte, beide Richtungen zusammen */
export interface ArmVergleich {
  label: string
  name: string
  dtv: number | null       // Fz/Tag, Modell
  msp: number | null       // Fz/h, Morgenspitze 7–8 Uhr, Modell
  asp: number | null       // Fz/h, Abendspitze 17–18 Uhr, Modell
  lokalDtv: number | null  // Fz/Tag, lokale Quelle
  lokalQuelle: string | null
}

/** Spaltentitel der lokalen Werte: der Anbieter, wenn alle Arme dieselbe Quelle haben */
export function lokalTitel(vergleich: readonly ArmVergleich[]): string {
  const quellen = [...new Set(vergleich.map(v => v.lokalQuelle).filter(q => q))] as string[]
  return quellen.length === 1 ? quellen[0].split(',')[0] : 'Lokale Daten'
}

export interface ArmStroeme { left: number; straight: number; right: number }

/** Ziel je Fahrbeziehung in der Reihenfolge der Knotenrechner [A, C, B, D]: von A aus liegt B rechts, C geradeaus, D links */
const KNOTEN_ZIEL: { left: number; straight: number; right: number }[] = [
  { left: 3, straight: 1, right: 2 },   // A
  { left: 2, straight: 0, right: 3 },   // C
  { left: 0, straight: 3, right: 1 },   // B
  { left: 1, straight: 2, right: 0 },   // D
]

export interface Querschnitt { zu: number; weg: number; summe: number }

const fuege = (aus: Querschnitt[], von: number, ziel: number, q: number) => {
  if (ziel >= aus.length || !(q > 0)) return   // Ziel fehlt am dreiarmigen Knoten: Eingabe zählt nicht
  aus[von].zu += q
  aus[ziel].weg += q
}

/** Querschnitt je Arm aus den Strömen [A, C, B, D]: Verkehr zum Knoten und vom Knoten weg */
export function querschnitteKnoten(arme: ArmStroeme[]): Querschnitt[] {
  const aus = arme.map(() => ({ zu: 0, weg: 0, summe: 0 }))
  arme.forEach((a, i) => {
    const z = KNOTEN_ZIEL[i]
    fuege(aus, i, z.left, a.left); fuege(aus, i, z.straight, a.straight); fuege(aus, i, z.right, a.right)
  })
  return aus.map(x => ({ ...x, summe: x.zu + x.weg }))
}

/** Querschnitt je Kreiselarm: rechts zum nächsten Arm, geradeaus zum übernächsten (nur vierarmig), links zum letzten vor der Einfahrt */
export function querschnitteKreisel(arme: ArmStroeme[]): Querschnitt[] {
  const n = arme.length
  const aus = arme.map(() => ({ zu: 0, weg: 0, summe: 0 }))
  arme.forEach((a, i) => {
    fuege(aus, i, (i + 1) % n, a.right)
    if (n === 4) fuege(aus, i, (i + 2) % n, a.straight)
    fuege(aus, i, (i + n - 1) % n, a.left)
  })
  return aus.map(x => ({ ...x, summe: x.zu + x.weg }))
}

/** Annahme: Ausserhalb der Hälfte der tieferen und des 1,5-Fachen der höheren Spitze gilt die Eingabe als auffällig */
export const ABWEICHUNG_TIEF = 0.5
export const ABWEICHUNG_HOCH = 1.5

/** Auffällige Abweichung der Stundeneingabe von den Modellspitzen; null ohne Eingabe, ohne Modell oder ohne Auffälligkeit */
export function abweichung(summe: number, v: Pick<ArmVergleich, 'msp' | 'asp'>): 'hoch' | 'tief' | null {
  if (!(summe > 0) || v.msp === null || v.asp === null) return null
  if (summe > ABWEICHUNG_HOCH * Math.max(v.msp, v.asp)) return 'hoch'
  if (summe < ABWEICHUNG_TIEF * Math.min(v.msp, v.asp)) return 'tief'
  return null
}
