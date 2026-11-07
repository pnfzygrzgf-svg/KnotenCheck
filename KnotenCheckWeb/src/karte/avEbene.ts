// ── Amtliche Vermessung als Kartenebene ──
// Lädt wie im VeloroutenCheck ab Zoom 17 je Halt der Karte ein Quadrat um den Ausschnitt. Nur Karte: Die Rechnung liest nichts von hier.

import { useEffect, useMemo, useState } from 'react'
import type L from 'leaflet'
import { avAusschnittLader, type AvBox, type AvQuadrat } from '../kartenbaustein/avAusschnitt'
import { ladeAv, ladeAvLuzern, type AvFlaeche, type AvHolen } from '../kartenbaustein/avDienst'
import { AUSSCHNITT_ZOOM } from '../kartenbaustein/ebenenAusschnitt'
import type { KartenObjekt } from '../kartenbaustein/modell'
import { avKartenStil, avKlasse } from '../knotenkern/daten/anbieter/gemeinsam/avKarte'
import { lv95 } from '../knotenkern/geo'

export const AV_QUELLE = 'Amtliche Vermessung (geodienste.ch), in der Stadt Luzern Strassenflächen der Stadt; nur Karte, keine Wirkung auf die Rechnung'
/** Stadt Luzern in LV95: Der Kanton gibt die AV nicht frei, die Stadt ihre Strassenflächen schon */
const LUZERN = [2660000, 1207000, 2671000, 1216000]
const AV_PAUSE_MS = 400

export const inLuzern = (q: Pick<AvQuadrat, 'e' | 'n'>) => q.e >= LUZERN[0] && q.e <= LUZERN[2] && q.n >= LUZERN[1] && q.n <= LUZERN[3]

export function avObjekte(flaechen: readonly AvFlaeche[]): KartenObjekt[] {
  return flaechen.filter(f => f.ringe[0]?.length).map(f => ({ id: `av:${f.art}:${f.ringe[0][0][0].toFixed(1)},${f.ringe[0][0][1].toFixed(1)}`, ringe: f.ringe, klasse: avKlasse(f.art),
    deckkraft: avKartenStil(f.art).deckkraft, text: `${f.art.replace('_', ', ')} (Amtliche Vermessung)` }))
}

const holen: AvHolen = async url => {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.json()
}

type Setzen<T> = (wert: T | ((alt: T) => T)) => void

function avLader(setListe: Setzen<ReadonlyMap<string, KartenObjekt>>, setStand: Setzen<string>) {
  let laufend = 0
  return avAusschnittLader<KartenObjekt[]>({
    laden: async q => avObjekte(await (inLuzern(q) ? ladeAvLuzern(q.e, q.n, q.r, holen) : ladeAv(q.e, q.n, q.r, holen))),
    fertig: neu => { setListe(alt => new Map([...alt, ...neu.map(o => [o.id, o] as const)])); setStand('') },
    fehler: () => setStand('nicht geladen'),
    zaehlen: d => { laufend += d; const offen = laufend > 0; setStand(s => (offen ? 'wird geladen …' : s === 'wird geladen …' ? '' : s)) },
    zuGross: gross => setStand(s => (gross ? 'zum Laden näher heranzoomen' : s === 'zum Laden näher heranzoomen' ? '' : s)),
  })
}

export function useAvAusschnitt(map: L.Map | null, an: boolean) {
  const [liste, setListe] = useState<ReadonlyMap<string, KartenObjekt>>(new Map())
  const [stand, setStand] = useState('')
  const lader = useMemo(() => avLader(setListe, setStand), [])
  useEffect(() => {
    if (!map || !an) return
    let uhr = 0
    const melden = () => {
      window.clearTimeout(uhr)
      uhr = window.setTimeout(() => {
        if (map.getZoom() < AUSSCHNITT_ZOOM) return
        const b = map.getBounds(), ecken = [b.getSouthWest(), b.getSouthEast(), b.getNorthEast(), b.getNorthWest()].map(p => lv95(p.lat, p.lng))
        const e = ecken.map(p => p[0]), n = ecken.map(p => p[1])
        lader.wunsch([Math.min(...e), Math.min(...n), Math.max(...e), Math.max(...n)] satisfies AvBox)
      }, AV_PAUSE_MS)
    }
    melden(); map.on('moveend', melden)
    return () => { window.clearTimeout(uhr); map.off('moveend', melden) }
  }, [map, an, lader])
  const objekte = useMemo(() => [...liste.values()], [liste])
  return { objekte, stand }
}
