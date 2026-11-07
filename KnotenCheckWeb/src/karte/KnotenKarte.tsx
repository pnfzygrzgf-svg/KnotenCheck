// Karte wie in den anderen Rechnern: Luftbild und Landeskarte, Massstab, Standort, Ortssuche über der Karte. Ab Zoom 16 fragt sie Overpass
// nach den Knoten im Ausschnitt und zeigt sie als blaue Punkte. Nach dem Klick zeigt sie die Arme des gewählten Knotens mit den
// Bezeichnungen des Rechners. Suche, Abstände und Farben wie im SichtweitenCheck.

import { useEffect, useRef, useState, type CSSProperties } from 'react'
import L from 'leaflet'
import '../kartenbaustein/tooltipRand'
import { EbenenFenster, EbenenZeile, Legende, useFensterLage } from '../kartenbaustein/EbenenFenster'
import { AUSSCHNITT_HINWEIS, BAUZONEN, HALTESTELLEN_BAV, HALTESTELLEN_BERN, STRASSENKLASSEN_TLM, TRAMGLEISE_TLM, useBundEbenen, VERKEHRSMODELL_NPVM, type AusschnittEbene } from '../kartenbaustein/ebenenAusschnitt'
import { BESCHRIFT_ZOOM, zeichneObjekte } from '../kartenbaustein/ebenenZeichnen'
import { orthofotoBern } from '../kartenbaustein/hintergrund'
import { kartenHover } from '../kartenbaustein/hover'
import type { KartenObjekt } from '../kartenbaustein/modell'
import { lv95 } from '../kartenbaustein/projektion'
import { QuelleLink, UNFALL_EBENE, UnfallLegende, ebenenQuelleUrl, objektFenster, objektHtml, objektQuelleUrl, unfallKacheln, type Stelle } from '../kartenbaustein/quellenLink'
import { trefferObjekt } from '../kartenbaustein/treffer'
import { UNFALL_HINWEIS, UNFALL_TITEL, unfallEbenen, unfallHtml } from '../kartenbaustein/unfaelle'
import { useUnfaelle } from '../kartenbaustein/unfaelleKarte'
import { useHoehenkurven } from '../hoehenkurven/Karte'
import { HoehenkurvenWahl } from '../hoehenkurven/Wahl'
import Ortssuche from '../knotenkern/Ortssuche'
import {
  abfrageBox, aufnehmen, enthaelt, imCache, vereinigen, zuGross, type Box, type CacheEintrag,
} from '../knotenkern/ausschnitt'
import { istAbbruch } from '../knotenkern/daten/holen'
import { KREISEL_TAG, ladeKnoten, overpassSperre, type OsmKnoten } from '../knotenkern/daten/osm'
import { ortZoom } from '../knotenkern/daten/ortssuche'
import { VERKEHRSMENGE_ORT } from './belastung'
import { ORT_EBENEN, useOrtEbenen, type OrtObjekt } from './ortEbenen'
import { AvEbenenWahl } from '../kartenbaustein/AvEbenenWahl'
import { PruefGruppe } from '../kartenbaustein/PruefGruppe'
import { AV_LEGENDE, avArtenLesen } from '../knotenkern/daten/anbieter/gemeinsam/avKarte'
import { AV_QUELLE, useAvAusschnitt } from './avEbene'

const SUCHE_ZOOM = 16
const SUCHE_PAUSE_MS = 800
const SUCHE_ABSTAND_MS = 2000
const START: L.LatLngTuple = [46.95456, 7.43811]
const START_ZOOM = 18
const STANDORT_ZOOM = 18
const STANDORT_UNGENAU_M = 100
const STANDORT_MS = 15000
const STANDORT_FARBE = '#2563eb'
const STANDORT_SYMBOL = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" ' +
  'stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/>' +
  '<path d="M12 2v4M12 18v4M2 12h4M18 12h4"/></svg>'
const HINTERGRUND_LUFTBILD = 'https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.swissimage/default/current/3857/{z}/{x}/{y}.jpeg'
const HINTERGRUND_KARTE = 'https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.pixelkarte-farbe/default/current/3857/{z}/{x}/{y}.jpeg'
export const KNOTEN_FARBE = '#0ea5e9'
export const ARM_HAUPT_FARBE = '#e2e8f0'
export const ARM_NEBEN_FARBE = '#94a3b8'
const KARTE_STUFEN = [30, 45, 70]
const OBEN_PANE = 'oben'
const SCHILD_PANE = 'schilder'
const EBENEN_PANE = 'ebenen'
const EBENEN_SPEICHER = 'kc.ebenen'
const ANSICHT_SPEICHER = 'kc.ansicht'
/** Ebenen, die der KnotenCheck im Ausschnitt lädt; die Unfälle kommen dazu. Flächen zuerst, damit sie nicht über den Linien liegen */
const BUND_EBENEN: readonly AusschnittEbene[] = [BAUZONEN, HALTESTELLEN_BAV, HALTESTELLEN_BERN, STRASSENKLASSEN_TLM, TRAMGLEISE_TLM, VERKEHRSMODELL_NPVM, VERKEHRSMENGE_ORT]

export interface KartenLinie { label: string; name: string; linie: [number, number][]; haupt: boolean }
interface Hinweis { text: string; fehler?: boolean }

interface Props {
  aktiv: boolean
  breite: number
  fokus: { lat: number; lon: number } | null
  gewaehlt: number | null
  linien: KartenLinie[]
  onKnoten: (k: OsmKnoten) => void
}

const markerStil = (g: boolean, kreisel: boolean): L.CircleMarkerOptions => ({
  radius: g ? 9 : 6, color: kreisel ? KNOTEN_FARBE : g ? '#0f172a' : '#ffffff', weight: kreisel ? (g ? 5 : 4) : g ? 3 : 2,
  fillColor: kreisel ? '#ffffff' : KNOTEN_FARBE, fillOpacity: 0.95, pane: OBEN_PANE,
})

const standortFehlerText = (code: number) => code === 1 ? 'Standort nicht freigegeben: Zugriff auf den Standort in den Einstellungen des Browsers erlauben.' :
  code === 3 ? `Standort nicht innert ${STANDORT_MS / 1000} s bestimmt; nochmals versuchen.` : 'Standort zurzeit nicht verfügbar (kein GPS- bzw. Netzempfang).'

export default function KnotenKarte({ aktiv, breite, fokus, gewaehlt, linien, onKnoten }: Props) {
  const elRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const armeRef = useRef<L.LayerGroup | null>(null)
  const markerRef = useRef(new Map<number, { k: OsmKnoten; m: L.CircleMarker }>())
  const gewaehltRef = useRef<number | null>(null)
  const onKnotenRef = useRef(onKnoten)
  useEffect(() => { onKnotenRef.current = onKnoten })
  const [suchHinweis, setSuchHinweis] = useState<Hinweis | null>(null)
  const [standortHinweis, setStandortHinweis] = useState<Hinweis | null>(null)
  const [stufe, setStufe] = useState(45)
  const [karte, setKarte] = useState<L.Map | null>(null)
  const [armeGruppe, setArmeGruppe] = useState<L.LayerGroup | null>(null)
  const [ebenenOffen, setEbenenOffen] = useState(false)
  const [ebenenAn, setEbenenAn] = useState<Set<string>>(() => {
    try { const v = JSON.parse(localStorage.getItem(EBENEN_SPEICHER) ?? 'null'); if (Array.isArray(v)) return new Set(v as string[]) } catch { /* ohne Speicher */ }
    return new Set()
  })
  const ebeneSchalten = (id: string, an: boolean) => setEbenenAn(alt => {
    const neu = new Set(alt); if (an) neu.add(id); else neu.delete(id)
    try { localStorage.setItem(EBENEN_SPEICHER, JSON.stringify([...neu])) } catch { /* nur für diese Sitzung */ }
    return neu
  })
  const fensterLage = useFensterLage('kc.ebenenPos', ebenenOffen)
  const unfaelle = useUnfaelle(karte, unfallEbenen(ebenenAn), lv95)
  const bund = useBundEbenen(karte, BUND_EBENEN.filter(e => ebenenAn.has(e.id)))
  const ort = useOrtEbenen(karte, ORT_EBENEN.map(e => e.id).filter(id => ebenenAn.has(id)))
  const hk = useHoehenkurven(karte, null)
  const avEbene = useAvAusschnitt(karte, ebenenAn.has('av'))
  const [avArten, setAvArten] = useState(() => { try { return avArtenLesen(localStorage.getItem('kc.avArten')) } catch { return avArtenLesen(null) } })
  const avArtSetzen = (art: string, an: boolean) => setAvArten(alt => {
    const neu = new Set(alt); if (an) neu.add(art); else neu.delete(art)
    try { localStorage.setItem('kc.avArten', JSON.stringify([...neu])) } catch { /* nur für diese Sitzung */ }
    return neu
  })
  const [beschriften, setBeschriften] = useState(false)
  const objekteRef = useRef<KartenObjekt[]>([])
  const ebeneVonRef = useRef(new Map<KartenObjekt, { id: string; quelle: string }>())
  const ebenenRef = useRef<L.LayerGroup | null>(null)
  const kartenMitte = (): Stelle | null => { const c = mapRef.current?.getCenter(); if (!c) return null; const [e, n] = lv95(c.lat, c.lng); return { lat: c.lat, lon: c.lng, e, n } }

  useEffect(() => {
    if (!elRef.current) return
    const gemerkt = ((): { c: [number, number]; z: number } | null => {
      try {
        const v = JSON.parse(localStorage.getItem(ANSICHT_SPEICHER) ?? 'null') as { c: [number, number]; z: number } | null
        return v && v.c[0] > 45.7 && v.c[0] < 47.9 && v.c[1] > 5.9 && v.c[1] < 10.6 && v.z >= 8 && v.z <= 22 ? v : null
      } catch { return null }
    })()
    const map = L.map(elRef.current, { maxZoom: 22, doubleClickZoom: false }).setView(gemerkt?.c ?? START, gemerkt?.z ?? START_ZOOM)
    map.on('moveend', () => {
      const c = map.getCenter()
      try { localStorage.setItem(ANSICHT_SPEICHER, JSON.stringify({ c: [c.lat, c.lng], z: map.getZoom() })) } catch { /* nur für diese Sitzung */ }
    })
    mapRef.current = map
    map.attributionControl.getContainer()?.addEventListener('click', ev => (ev.currentTarget as HTMLElement).classList.toggle('offen'))
    const luftbild = L.tileLayer(HINTERGRUND_LUFTBILD, { maxZoom: 22, maxNativeZoom: 20, attribution: '© swisstopo' }).addTo(map)
    const landeskarte = L.tileLayer(HINTERGRUND_KARTE, { maxZoom: 22, maxNativeZoom: 18, attribution: '© swisstopo' })
    map.createPane(OBEN_PANE).style.zIndex = '430'
    map.createPane(SCHILD_PANE).style.zIndex = '640'
    const knotenEbene = L.layerGroup().addTo(map)
    const armeEbene = L.layerGroup().addTo(map)
    armeRef.current = armeEbene
    const standortEbene = L.layerGroup().addTo(map)
    const ebenenPane = map.createPane(EBENEN_PANE); ebenenPane.style.zIndex = '420'; ebenenPane.style.pointerEvents = 'none'
    ebenenRef.current = L.layerGroup().addTo(map)
    kartenHover(map, [
      s => { const hier = unfaelle.bei(map, s.bild); return hier.length ? { schluessel: `u:${hier.map(u => u.id).join()}`, html: unfallHtml(hier, false) } : null },
      s => { const o = trefferObjekt(objekteRef.current, s.p, s.tolM, s.ueberObjekt); return o ? { schluessel: `e:${o.id}`, html: objektHtml(o.text) } : null },
      s => { const k = hk.bei(s.ort.lat, s.ort.lng, s.tolM); return k ? { schluessel: `k:${k}`, html: objektHtml(k) } : null },
    ])
    // Klick auf ein Ebenenobjekt: Angaben mit Link zur Quelle; Knoten und Arme gehen vor
    map.on('click', (e: L.LeafletMouseEvent) => {
      if ((e.originalEvent.target as Element | null)?.closest?.('.leaflet-interactive, .leaflet-marker-icon, .leaflet-control')) return
      const hier = unfaelle.bei(map, e.containerPoint)
      if (hier.length) { L.popup({ maxWidth: 280, maxHeight: 300 }).setLatLng(e.latlng).setContent(unfallHtml(hier, true)).openOn(map); return }
      const [ost, nord] = lv95(e.latlng.lat, e.latlng.lng), tol = map.distance(e.latlng, map.containerPointToLatLng(e.containerPoint.add([7, 0])))
      const o: OrtObjekt | null = trefferObjekt(objekteRef.current, [ost, nord], tol), ebene = o && ebeneVonRef.current.get(o)
      if (!o || !ebene) return
      const url = objektQuelleUrl(o, ebene.id, ebenenQuelleUrl(ebene.id, o.quelle ?? ebene.quelle, o.dienstUrl), { lat: e.latlng.lat, lon: e.latlng.lng, e: ost, n: nord })
      if (url) L.popup({ maxWidth: 280 }).setLatLng(e.latlng).setContent(objektFenster(o.text, url)).openOn(map)
    })
    const zoomMerken = () => setBeschriften(map.getZoom() >= BESCHRIFT_ZOOM)
    map.on('zoomend', zoomMerken); zoomMerken()
    setKarte(map); setArmeGruppe(armeEbene)
    orthofotoBern(map, L.control.layers({ 'Luftbild (SWISSIMAGE)': luftbild, 'Landeskarte (swisstopo)': landeskarte }).addTo(map), luftbild)
    L.control.scale({ imperial: false }).addTo(map)
    map.attributionControl.addAttribution('© OpenStreetMap-Mitwirkende')

    const standort = () => {
      if (!window.isSecureContext) { setStandortHinweis({ text: 'Standort nur über eine sichere Verbindung (https) abrufbar.', fehler: true }); return }
      if (!('geolocation' in navigator)) { setStandortHinweis({ text: 'Dieser Browser kann den Standort nicht bestimmen.', fehler: true }); return }
      setStandortHinweis({ text: 'Standort wird bestimmt …' })
      navigator.geolocation.getCurrentPosition(pos => {
        if (mapRef.current !== map) return
        const { latitude: lat, longitude: lon, accuracy } = pos.coords
        standortEbene.clearLayers()
        L.circle([lat, lon], { radius: accuracy, color: STANDORT_FARBE, weight: 1, fillColor: STANDORT_FARBE, fillOpacity: 0.12, interactive: false }).addTo(standortEbene)
        L.circleMarker([lat, lon], { radius: 6, color: '#ffffff', weight: 2, fillColor: STANDORT_FARBE, fillOpacity: 1, interactive: false }).addTo(standortEbene)
        if (accuracy > STANDORT_UNGENAU_M) map.fitBounds(L.latLng(lat, lon).toBounds(2 * accuracy))
        else map.setView([lat, lon], STANDORT_ZOOM)
        setStandortHinweis(null)
      }, err => setStandortHinweis({ text: standortFehlerText(err.code), fehler: true }),
      { enableHighAccuracy: true, timeout: STANDORT_MS, maximumAge: 30000 })
    }
    const standortKnopf = new L.Control({ position: 'topleft' })
    standortKnopf.onAdd = () => {
      const div = L.DomUtil.create('div', 'leaflet-bar standort-knopf')
      const a = L.DomUtil.create('a', '', div)
      a.href = '#'; a.title = 'Zum eigenen Standort'; a.setAttribute('role', 'button'); a.setAttribute('aria-label', 'Zum eigenen Standort')
      a.innerHTML = STANDORT_SYMBOL
      L.DomEvent.disableClickPropagation(div)
      L.DomEvent.on(a, 'click', e => { L.DomEvent.preventDefault(e); standort() })
      return div
    }
    standortKnopf.addTo(map)

    const markerNachfuehren = (alle: OsmKnoten[]) => {
      const n = markerRef.current
      for (const k of alle) {
        if (n.has(k.id)) continue
        const kreisel = !!k.tags[KREISEL_TAG]
        const m = L.circleMarker([k.lat, k.lon], markerStil(k.id === gewaehltRef.current, kreisel))
          .bindTooltip(kreisel ? 'Kreisel' : 'Knoten')
          .on('click', e => { L.DomEvent.stopPropagation(e); onKnotenRef.current(k) })
          .addTo(knotenEbene)
        n.set(k.id, { k, m })
      }
    }

    let cache: CacheEintrag<OsmKnoten>[] = []
    let timer = 0, laeuft: AbortController | null = null, laeuftBox: Box | null = null, nachher = false, start = -SUCHE_ABSTAND_MS
    const sicht = (): Box | null => {
      if (map.getZoom() < SUCHE_ZOOM) return null
      const b = map.getBounds()
      const s: Box = { s: b.getSouth(), w: b.getWest(), n: b.getNorth(), e: b.getEast() }
      return zuGross(s) ? null : s
    }
    const zuWeit: Hinweis = { text: 'Zum Suchen der Knoten näher heranzoomen' }

    const suchen = async (): Promise<void> => {
      clearTimeout(timer)
      const s = sicht()
      if (!s) { setSuchHinweis(zuWeit); return }
      const treffer = imCache(cache, s)
      if (treffer) { cache = treffer; if (!laeuft) setSuchHinweis(null); return }
      if (laeuft) { if (!(laeuftBox && enthaelt(laeuftBox, s))) nachher = true; return }
      const gesperrt = overpassSperre()
      if (gesperrt > 0) {
        setSuchHinweis({ text: `Overpass ausgelastet: nächste Knotensuche in rund ${Math.ceil(gesperrt / 1000)} s` })
        timer = window.setTimeout(suchen, gesperrt + 100)
        return
      }
      const warten = start + SUCHE_ABSTAND_MS - performance.now()
      if (warten > 0) { timer = window.setTimeout(suchen, warten); return }
      const ctrl = new AbortController(), box = abfrageBox(s)
      laeuft = ctrl; laeuftBox = box; start = performance.now(); nachher = false
      setSuchHinweis({ text: 'Knoten werden gesucht …' })
      try {
        const r = await ladeKnoten(box.s, box.w, box.n, box.e, ctrl.signal)
        if (ctrl.signal.aborted) return
        cache = aufnehmen(cache, { box, daten: r.daten })
        markerNachfuehren(vereinigen(cache))
        setSuchHinweis(r.daten.length ? null : { text: 'Keine Knoten im Ausschnitt' })
      } catch (e) {
        if (ctrl.signal.aborted || istAbbruch(e)) return
        setSuchHinweis({ text: `Suche fehlgeschlagen: ${(e as Error).message}`, fehler: true })
      } finally {
        if (laeuft === ctrl) { laeuft = null; laeuftBox = null }
        if (nachher && !ctrl.signal.aborted) { nachher = false; void suchen() }
      }
    }
    map.on('moveend', () => {
      clearTimeout(timer)
      if (!sicht()) { setSuchHinweis(zuWeit); return }
      timer = window.setTimeout(suchen, SUCHE_PAUSE_MS)
    })
    timer = window.setTimeout(suchen, 300)

    return () => {
      clearTimeout(timer)
      laeuft?.abort()
      map.remove()
      mapRef.current = null
      armeRef.current = null
      markerRef.current = new Map()
    }
  }, [])

  // versteckt gemountet bzw. Panel oder Kartenhöhe geändert: Grösse neu messen
  useEffect(() => {
    if (!aktiv) return
    const raf = requestAnimationFrame(() => mapRef.current?.invalidateSize())
    return () => cancelAnimationFrame(raf)
  }, [aktiv, breite, stufe])

  // Link aus einem anderen Rechner: zum Ort
  useEffect(() => {
    if (fokus) mapRef.current?.setView([fokus.lat, fokus.lon], START_ZOOM)
  }, [fokus])

  useEffect(() => {
    const n = markerRef.current
    for (const id of [gewaehltRef.current, gewaehlt]) {
      const x = id === null ? undefined : n.get(id)
      if (x) x.m.setStyle(markerStil(id === gewaehlt, !!x.k.tags[KREISEL_TAG]))
    }
    gewaehltRef.current = gewaehlt
  }, [gewaehlt])

  useEffect(() => {
    const g = armeRef.current
    if (!g) return
    g.clearLayers()
    for (const l of linien) {
      L.polyline(l.linie, { color: l.haupt ? ARM_HAUPT_FARBE : ARM_NEBEN_FARBE, weight: 5, opacity: 0.85, pane: OBEN_PANE })
        .bindTooltip(l.name, { sticky: true }).addTo(g)
      const ende = l.linie[l.linie.length - 1]
      if (ende) L.marker(ende, { pane: SCHILD_PANE, keyboard: false, zIndexOffset: 1000,
        icon: L.divIcon({ className: 'arm-nr', iconSize: [22, 22], html: `<span>${l.label}</span>` }) }).bindTooltip(l.name).addTo(g)
    }
  }, [linien])

  // Unfälle: Kartenbild der Quelle
  useEffect(() => {
    if (!karte) return
    const lagen = Object.entries(UNFALL_EBENE).filter(([id]) => ebenenAn.has(id))
      .map(([, layer]) => L.tileLayer(unfallKacheln(layer), { pane: EBENEN_PANE, maxZoom: 22, maxNativeZoom: 18, attribution: '© ASTRA' }).addTo(karte))
    return () => { for (const l of lagen) l.remove() }
  }, [karte, ebenenAn])
  // Ebenen aus dem Ausschnitt
  useEffect(() => {
    const g = ebenenRef.current
    if (!g) return
    g.clearLayers()
    const aktiv = [{ id: 'av', quelle: AV_QUELLE, legende: AV_LEGENDE, liste: avEbene.objekte.filter(o => avArten.has(o.klasse)) }, ...BUND_EBENEN.map(e => ({ ...e, liste: bund.objekte[e.id] ?? [] })),
      ...ORT_EBENEN.map(e => ({ ...e, liste: ort.objekte[e.id] }))].filter(e => ebenenAn.has(e.id))
    objekteRef.current = aktiv.flatMap(e => e.liste)
    ebeneVonRef.current = new Map(aktiv.flatMap(e => e.liste.map(o => [o, { id: e.id, quelle: e.quelle }] as const)))
    for (const e of aktiv) zeichneObjekte(g, e.liste, e.legende, beschriften)
  }, [bund.objekte, ort.objekte, avEbene.objekte, avArten, ebenenAn, beschriften])

  const hinweise = [suchHinweis, standortHinweis].filter((h): h is Hinweis => !!h)
  const ersteUnfallEbene = Object.keys(UNFALL_EBENE).find(id => ebenenAn.has(id))
  const zeilen = [
    ...Object.keys(UNFALL_EBENE).map(id => ({ id, titel: UNFALL_TITEL[id], inhalt: <EbenenZeile key={id} titel={UNFALL_TITEL[id]} an={ebenenAn.has(id)} setzen={an => ebeneSchalten(id, an)}>
      <small>© ASTRA; Datenstand {unfaelle.datenstand || 'unbekannt'}; anonymisierte Lage; nur Karte, keine Wirkung auf die Rechnung</small>
      <small>{(ebenenAn.has(id) && unfaelle.stand) || UNFALL_HINWEIS}</small>
      <QuelleLink url={ebenenQuelleUrl(id, '© ASTRA')} mitte={kartenMitte} />
      {ersteUnfallEbene === id && <UnfallLegende />}
    </EbenenZeile> })),
    { id: 'hoehenkurven', titel: hk.titel, inhalt: <HoehenkurvenWahl key="hoehenkurven" an={hk.an} setzen={hk.setzen} stand={hk.stand} klasse="q-ebene" link={<QuelleLink url={ebenenQuelleUrl('hoehenkurven', 'swisstopo')} mitte={kartenMitte} />} /> },
    ...BUND_EBENEN.map(e => ({ id: e.id, titel: e.titel, inhalt: <EbenenZeile key={e.id} titel={e.titel} zahl={bund.stand[e.id]} hinweis={e.quelle} an={ebenenAn.has(e.id)} setzen={an => ebeneSchalten(e.id, an)}>
      <small>{e.quelle}</small>
      {!bund.stand[e.id] && <small>{AUSSCHNITT_HINWEIS}</small>}
      {/* Die örtlichen Mengen kommen je nach Ort von einem anderen Dienst: Der Link folgt dem, was geladen ist */}
      <QuelleLink url={e === VERKEHRSMENGE_ORT && !bund.objekte[e.id]?.length ? null : ebenenQuelleUrl(e.id, bund.objekte[e.id]?.[0]?.quelle ?? e.quelle)} mitte={kartenMitte} />
      {ebenenAn.has(e.id) && <Legende eintraege={e.legende} />}
    </EbenenZeile> })),
    { id: 'av', titel: 'Amtliche Vermessung', inhalt: <AvEbenenWahl key="av" quelle={`${AV_QUELLE}; ${AUSSCHNITT_HINWEIS}`} objekte={avEbene.objekte} zahl={avEbene.stand || undefined} an={ebenenAn.has('av')} setzen={an => ebeneSchalten('av', an)}
      arten={avArten} artSetzen={avArtSetzen} legende={AV_LEGENDE} link={<QuelleLink url={ebenenQuelleUrl('av', AV_QUELLE)} mitte={kartenMitte} />} /> },
    ...ORT_EBENEN.map(e => ({ id: e.id, titel: e.titel, inhalt: <EbenenZeile key={e.id} titel={e.titel} zahl={ort.stand[e.id]} hinweis={e.quelle} an={ebenenAn.has(e.id)} setzen={an => ebeneSchalten(e.id, an)}>
      <small>{e.quelle}</small>
      {!ort.stand[e.id] && <small>{AUSSCHNITT_HINWEIS}</small>}
      <QuelleLink url={ebenenQuelleUrl(e.id, e.quelle)} mitte={kartenMitte} />
      {ebenenAn.has(e.id) && <Legende eintraege={e.legende} />}
    </EbenenZeile> })),
  ].sort((a, b) => a.titel.localeCompare(b.titel, 'de-CH'))
  return (
    <div className="kartenrahmen" style={{ '--karte-h': `${stufe}dvh` } as CSSProperties}>
      <div ref={elRef} className="karte" />
      <button type="button" className="karte-hoehe" onClick={() => setStufe(v => KARTE_STUFEN[(KARTE_STUFEN.indexOf(v) + 1) % KARTE_STUFEN.length])}
        aria-label={`Kartenhöhe ${stufe} % – ${stufe === 70 ? 'kleiner' : 'grösser'}`} title={`Karte ${stufe === 70 ? 'kleiner' : 'grösser'} (jetzt ${stufe} % der Höhe)`}>
        {stufe === 70 ? '▴' : '▾'}
      </button>
      <button type="button" className={'q-knopf' + (ebenenOffen ? ' offen' : '')} aria-expanded={ebenenOffen} onClick={() => setEbenenOffen(o => !o)}
        title="Kartenebenen zeigen: Daten zum Ort, ohne Wirkung auf die Rechnung">
        Kartenebenen{ebenenAn.size + (hk.an ? 1 : 0) ? ` (${ebenenAn.size + (hk.an ? 1 : 0)})` : ''}
      </button>
      {ebenenOffen && <EbenenFenster lage={fensterLage} schliessen={() => setEbenenOffen(false)}>
        {armeGruppe && <PruefGruppe map={karte} gruppen={[{ name: 'Arme', ebene: armeGruppe }]} />}
        {zeilen.map(z => z.inhalt)}
        <p className="q-fuss">Kurz stillhalten zeigt die Angaben, ein Klick die Quelle.</p>
      </EbenenFenster>}
      <div className="kartenkopf">
        <Ortssuche onOrt={o => mapRef.current?.setView([o.lat, o.lon], ortZoom(o.art))} />
        {hinweise.map(h => <div key={h.text} className={h.fehler ? 'kartenhinweis fehler' : 'kartenhinweis'} role="status">{h.text}</div>)}
      </div>
    </div>
  )
}
