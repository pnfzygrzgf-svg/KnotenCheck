// Kleine Marke hinter einem Eingabefeld: Der Wert stammt aus dem Modell oder aus der Karte. Sie verschwindet, sobald man ihn ändert.

import type { HerkunftArt } from './bericht/herkunft'

const TITEL: Record<HerkunftArt, string> = {
  M: 'Modellwert des NPVM, berechnet, nicht gezählt. Bitte prüfen, eine Zählung ist genauer.',
  K: 'Aus der Karte übernommen (OpenStreetMap oder amtliche Daten). Bitte vor Ort oder im Luftbild prüfen.',
}

export function HerkunftMarke({ art }: { art: HerkunftArt | null }) {
  if (!art) return null
  return <span className={`herkunft-marke herkunft-marke-${art}`} title={TITEL[art]}>{art === 'M' ? 'Modell' : 'Karte'}</span>
}
