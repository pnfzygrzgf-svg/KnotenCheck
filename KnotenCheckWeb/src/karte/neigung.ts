// Längsneigung je Arm aus dem Höhenmodell, gerundet auf die Klassen der Normtabellen. SN 640 022 Tabellen 1 und 2 (Seite 4) und
// SN 640 024a Tabelle 2 (Seite 9) nennen die Neigung in Fahrrichtung zum Knoten: ansteigend zum Knoten positiv, wie der Höhenkern rechnet.

import type { GradientCategory } from '../engine/armConfiguration'
import { BERN_DTM_RECHTECK } from '../knotenkern/daten/bernDtm'
import { hoehenDienstFuer, ladeNeigungMit } from '../knotenkern/daten/hoehenDienst'
import type { P } from '../knotenkern/geo'

/** Annahme: Die Norm nennt keine Messlänge; gemessen wird die Zufahrt über so viele Meter ab dem Knoten */
export const NEIGUNG_LINIE_M = 50
/** Annahme: Steiler als so viele Prozent liegt ausserhalb der Tabellen, gerechnet wird mit ±4 % */
const TABELLE_ENDE = 5
/** Annahme: Ab diesem Anteil der Messlänge gilt das Profil als vollständig (die Höhenpunkte treffen die Enden nicht immer genau) */
export const NEIGUNG_VOLL = 0.9

export interface ArmNeigung {
  prozent: number | null
  klasse: GradientCategory | null
  modell: string           // «swissALTI3D» bzw. «DTM 2023 Stadt Bern»
  hinweis: string | null
  laengeM?: number         // Länge, über die das Profil wirklich reicht
}

/** Nächste Klasse der Tabellen: ±0 bis unter 1 %, ±2 bis unter 3 %, darüber ±4 % */
export function neigungsklasse(i: number): GradientCategory {
  const a = Math.abs(i)
  if (a < 1) return '±0%'
  if (a < 3) return i > 0 ? '+2%' : '-2%'
  return i > 0 ? '+4%' : '-4%'
}

const imBernerDtm = (p: P) => p[0] >= BERN_DTM_RECHTECK[0] && p[0] <= BERN_DTM_RECHTECK[2] && p[1] >= BERN_DTM_RECHTECK[1] && p[1] <= BERN_DTM_RECHTECK[3]

/** Neigung entlang der Linie vom Knoten weg; in Bern zuerst das Modell der Stadt. Ein Abbruch wird weitergereicht */
export async function ladeArmNeigung(linie: P[], signal?: AbortSignal): Promise<ArmNeigung> {
  const dienste = hoehenDienstFuer(linie.every(imBernerDtm))
  let letzter: ArmNeigung = { prozent: null, klasse: null, modell: dienste[0].kurz, hinweis: null }
  for (const d of dienste) {
    const [m] = await ladeNeigungMit(d, linie, signal)
    if (m.i !== null) {
      const steil = Math.abs(m.i) > TABELLE_ENDE ? `Neigung ${String(m.i).replace('.', ',')} % liegt ausserhalb der Tabellen, gerechnet wird mit ±4 %.` : null
      // Der Höhenkern nimmt ein Profil ab 20 m an. Reicht es nicht über die ganze Messlänge, steht das beim Wert
      const teil = m.laenge < NEIGUNG_VOLL * NEIGUNG_LINIE_M ? `Höhenprofil reicht nur über ${Math.round(m.laenge)} m statt ${NEIGUNG_LINIE_M} m: Neigung bitte prüfen.` : null
      return { prozent: m.i, klasse: neigungsklasse(m.i), modell: d.kurz, hinweis: [steil, teil, m.hinweis].filter(x => x).join(' ') || null, laengeM: m.laenge }
    }
    letzter = { prozent: null, klasse: null, modell: d.kurz, hinweis: 'Neigung nicht bestimmbar.' }
  }
  return letzter
}

/** Anzeige einer Klasse: «+2 %» */
export const klasseText = (k: GradientCategory) => k.replace('%', ' %')
