// ── Höhendienste für die Längsneigung (swissALTI3D schweizweit, in der Stadt Bern das DTM 2023 der Stadt) ──
//
// Ein Dienst liefert Höhenprofile entlang einer Linie (ProfilPunkt: dist, h) für die Längsneigung der Fahrstreifenachsen, der Zufahrt
// und des Trottoirs (App.tsx, Effekt «Längsneigung aus dem Höhenmodell»). In der Stadt Bern steht das DTM 2023 (25 cm) zuerst;
// antwortet es nicht (Fehler, Zeitüberschreitung, Linie ausserhalb), fällt der Abruf auf swissALTI3D zurück (mitRueckfall). Je Fall
// gilt immer nur ein Modell; die Messungen tragen den Namen des benutzten Modells am Anfang der Quelle (rechner/neigung.modellName).
// Gleicher Aufbau wie im fgsCheck (dort src/daten/hoehenDienst.ts); nicht Teil des Rechenkerns.

import type { P } from '../geo'
import { istAbbruch, type Abruf } from './holen'
import { ladeProfil, linieLaenge, PROFIL_PUNKTE } from './hoehen'
import { HOEHEN_QUELLE, neigungMessung, type ProfilPunkt } from '../rechner/neigung'
import type { NeigungMessung } from '../rechner/typen'
import { BERN_DTM_KURZ, ladeBernProfil } from './bernDtm'

export type HoehenDienstId = 'swissalti' | 'bern.dtm'

export interface HoehenDienst {
  id: HoehenDienstId
  /** Modellname in Texten («swissALTI3D», «DTM 2023 Stadt Bern») */
  kurz: string
  /** Anbieter mit Quellenangabe */
  anbieter: string
  host: string
  /** Schlüssel in «Geladene Quellen» */
  schluessel: string
  /** Profil entlang der Linie holen */
  laden(linie: P[], punkte: number, signal?: AbortSignal): Promise<Abruf<ProfilPunkt[]>>
}

export const SWISSALTI: HoehenDienst = {
  id: 'swissalti', kurz: 'swissALTI3D', anbieter: '© swisstopo', host: 'api3.geo.admin.ch', schluessel: 'hoehen',
  laden: (linie, _punkte, signal) => ladeProfil(linie, signal),
}
export const BERN_DTM: HoehenDienst = {
  id: 'bern.dtm', kurz: BERN_DTM_KURZ, anbieter: 'Geodaten Stadt Bern', host: 'gisapp.bern.ch', schluessel: 'hoehenBern',
  laden: ladeBernProfil,
}
export const HOEHEN_DIENSTE: readonly HoehenDienst[] = [SWISSALTI, BERN_DTM]

/** Dienste in der Reihenfolge des Rückfalls: in der Stadt Bern das DTM der Stadt, dann swissALTI3D; sonst nur swissALTI3D */
export const hoehenDienstFuer = (bern: boolean): readonly HoehenDienst[] => (bern ? [BERN_DTM, SWISSALTI] : [SWISSALTI])

/** Dienst zum Modellnamen (kurz) bzw. zur Kennung bzw. zum Schlüssel; undefined, wenn unbekannt */
export const hoehenDienst = (name: string | undefined): HoehenDienst | undefined =>
  HOEHEN_DIENSTE.find(d => d.kurz === name || d.id === name || d.schluessel === name)

/** Name des Dienstes in «Geladene Quellen» */
export const hoehenName = (d: HoehenDienst): string => `Höhenmodell (${d.kurz}, ${d.anbieter.replace(/^© /, '')}; Profile)`

/** Neigungsmessung des Kerns mit dem Modellnamen des Dienstes als Quelle (der Kern schreibt immer HOEHEN_QUELLE) */
export function neigungMit(d: HoehenDienst, profil: ProfilPunkt[] | Error, geplantM?: number): NeigungMessung {
  const m = neigungMessung(profil, geplantM)
  return d.id === 'swissalti' ? m : { ...m, quelle: m.quelle.replace(HOEHEN_QUELLE, `${d.kurz} (${d.anbieter.replace(/^© /, '')})`) }
}

/** Neigung entlang der Linie mit dem Dienst (wie daten/hoehen.ladeNeigung): Fehler des Dienstes → i = null mit Hinweis; ein Abbruch
 *  wird weitergereicht. -> [Messung, Abruf bzw. Fehlertext] */
export async function ladeNeigungMit(d: HoehenDienst, linie: P[], signal?: AbortSignal): Promise<[NeigungMessung, Abruf<ProfilPunkt[]> | string]> {
  try {
    const r = await d.laden(linie, PROFIL_PUNKTE, signal)
    return [neigungMit(d, r.daten, linieLaenge(linie)), r]
  } catch (e) {
    if (signal?.aborted || istAbbruch(e)) throw e
    const f = e instanceof Error ? e : new Error(String(e))
    return [neigungMit(d, f), f.message]
  }
}

/** Ergebnis eines Laufs mit dem Dienst, der ihn geliefert hat */
export interface MitDienst<R> { dienst: HoehenDienst; wert: R }

/**
 * Lauf mit Rückfall: die Dienste der Reihe nach; wirft der Lauf (ausser bei Abbruch), meldet `rueckfall(dienst, fehler, nächster)` und
 * der nächste Dienst übernimmt; wirft der letzte, wird sein Fehler weitergereicht. Ein Abbruch wird sofort weitergereicht.
 */
export async function mitRueckfall<R>(dienste: readonly HoehenDienst[], lauf: (d: HoehenDienst) => Promise<R>,
  rueckfall: (d: HoehenDienst, fehler: Error, naechster: HoehenDienst) => void = () => {}): Promise<MitDienst<R>> {
  if (!dienste.length) throw new Error('kein Höhendienst')
  for (let i = 0; i < dienste.length; i++) {
    const d = dienste[i]
    try {
      return { dienst: d, wert: await lauf(d) }
    } catch (e) {
      if (istAbbruch(e) || i === dienste.length - 1) throw e
      rueckfall(d, e instanceof Error ? e : new Error(String(e)), dienste[i + 1])
    }
  }
  throw new Error('kein Höhendienst')
}

/** Rückfallgrund für «Geladene Quellen» */
export const rueckfallText = (fehler: Error, naechster: HoehenDienst): string => `${fehler.message} (Rückfall auf ${naechster.kurz})`
