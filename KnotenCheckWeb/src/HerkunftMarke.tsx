// Kleine Marke hinter einem Eingabefeld: Der Wert stammt aus dem Modell, aus der Karte oder ist aus Armmengen geschätzt. Sie verschwindet, sobald man ihn ändert.

import type { HerkunftArt } from './bericht/herkunft'

const TITEL: Record<HerkunftArt, string> = {
  M: 'Modellwert des NPVM, berechnet, nicht gezählt. Bitte prüfen, eine Zählung ist genauer.',
  K: 'Aus der Karte übernommen (OpenStreetMap oder amtliche Daten). Bitte vor Ort oder im Luftbild prüfen.',
  S: 'Aus gezählten Armmengen geschätzt, nicht gezählt. Bitte prüfen, eine Knotenstromzählung ist genauer.',
}
const KURZ: Record<HerkunftArt, string> = { M: 'Modell', K: 'Karte', S: 'geschätzt' }

export function HerkunftMarke({ art }: { art: HerkunftArt | null }) {
  if (!art) return null
  return <span className={`herkunft-marke herkunft-marke-${art}`} title={TITEL[art]}>{KURZ[art]}</span>
}
