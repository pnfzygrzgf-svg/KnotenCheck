// ── Kartenebenen Tempo, Vortrittszeichen, Fussgängerstreifen und Lichtsignale ──
// Alle vier zeigen die beste Quelle am Ort: den amtlichen Dienst, sonst OpenStreetMap. Darum brauchen sie eine Umkreisabfrage bei Overpass und
// die Dienste der Gemeinden im Ausschnitt. Geladen wird wie bei den anderen Ebenen ab Zoom 17 für den Ausschnitt, nur solange eine Ebene an ist.
// Die Dienste kommen aus dem Knotenkern und sind dieselben wie in den anderen Rechnern. Die Rechnung liest nichts von hier.

import { useEffect, useRef, useState } from 'react'
import type L from 'leaflet'
import { AUSSCHNITT_ZOOM } from '../kartenbaustein/ebenenAusschnitt'
import type { KartenObjekt, LegendenEintrag, P } from '../kartenbaustein/modell'
import { ladeGebiet } from '../knotenkern/daten/anbieter/gemeinsam/gebiet'
import { ladeRegional, type RegionalObjekt } from '../knotenkern/daten/anbieter/gemeinsam/regional'
import { regionalFuer, type RegionalDienst } from '../knotenkern/daten/anbieter/gemeinsam/regionalDienste'
import type { Gemeinde } from '../knotenkern/daten/anbieter/gemeinsam/typen'
import { ladeZuerich, type ZhLinie } from '../knotenkern/daten/anbieter/gemeinsam/zuerich'
import { AbrufFehler, holeJson, istAbbruch } from '../knotenkern/daten/holen'
import { ladeOsmRoh, osmParsen, type OsmDaten, type OsmKnoten, type OsmWeg } from '../knotenkern/daten/osm'
import { abstandStrecke, dist, lv95 } from '../knotenkern/geo'

export type OrtEbeneId = 'tempo' | 'vortritt' | 'streifen' | 'lsa'
export interface OrtEbene { id: OrtEbeneId; titel: string; quelle: string; legende: readonly LegendenEintrag[] }
/** dienstUrl: Seite des Dienstes für «Quelle ↗», wo der Text allein sie nicht verrät */
export type OrtObjekt = KartenObjekt & { dienstUrl?: string }

export const tempoKlasse = (v: number): string => (v <= 20 ? 't20' : v <= 30 ? 't30' : v <= 40 ? 't40' : v <= 50 ? 't50' : 't60')
export const ORT_EBENEN: readonly OrtEbene[] = [
  { id: 'tempo', titel: 'Tempo', quelle: 'Amtlich, wo ein Dienst besteht; sonst OpenStreetMap, gestrichelt; nur Karte, keine Wirkung auf die Rechnung',
    legende: [['t20', '#16a34a', '20 km/h und weniger'], ['t30', '#65a30d', '30 km/h'], ['t40', '#ca8a04', '40 km/h'], ['t50', '#ea580c', '50 km/h'],
      ['t60', '#dc2626', '60 km/h und mehr'], ['verbot', '#7f1d1d', 'Fahrverbot oder ungeklärtes Regime']] },
  { id: 'vortritt', titel: 'Vortrittszeichen', quelle: 'Amtliches Signalinventar, wo ein Dienst besteht; sonst OpenStreetMap highway=give_way, stop; nur Karte, keine Wirkung auf die Rechnung',
    legende: [['give_way', '#b91c1c', 'Kein Vortritt', '▽'], ['stop', '#7f1d1d', 'Stop', '■'], ['hauptstrasse', '#ca8a04', 'Hauptstrasse', 'H']] },
  { id: 'streifen', titel: 'Fussgängerstreifen', quelle: 'Amtliches Inventar, wo ein Dienst besteht, meist ohne Gemeindestrassen; sonst OpenStreetMap; nur Karte, keine Wirkung auf die Rechnung',
    legende: [['fgs', '#2563eb', 'Streifen aus dem Inventar', 'F'], ['fgs_signal', '#0891b2', 'Signal 4.11, keine Querungsachse', 'S'], ['fgs_osm', '#64748b', 'Übergang aus OpenStreetMap', 'Ü']] },
  { id: 'lsa', titel: 'Lichtsignale', quelle: 'Amtliches Inventar, wo ein Dienst besteht; Anlagen, keine Signalgruppen; sonst OpenStreetMap; nur Karte, keine Wirkung auf die Rechnung',
    legende: [['lsa', '#9333ea', 'Anlage aus dem Inventar', 'L'], ['lsa_osm', '#64748b', 'Lichtsignal aus OpenStreetMap', 'L']] },
]

const BERN_BFS = 351, ZUERICH_BFS = 261
const BERN_TEMPO = 'https://map.bern.ch/arcgis/rest/services/Geoportal/Signalisierte_Hoechstgeschwindigkeit/MapServer/0/query'
/** Pause nach der Kartenbewegung: Die Knotensuche fragt Overpass zuerst, zwei gleichzeitige Abfragen träfen die Grenze je Adresse */
const ORT_PAUSE_MS = 1500
/** Rand um den Ausschnitt, damit kleines Verschieben keine neue Abfrage braucht */
const ORT_RAND_M = 100
/** Bei Zoom 17 reicht das für übliche Bildschirme; mehr wäre eine zu schwere Abfrage */
export const ORT_MAX_RADIUS_M = 1000
/** Liegt die Mitte eines OSM-Wegs so nah an einer amtlichen Linie, gilt dort die amtliche */
const AMTLICH_NAH_M = 12
/** Annahme: So nah an einem amtlichen Objekt meint ein OSM-Punkt dasselbe. Beim Lichtsignal steht der Anlagenpunkt mitten im Knoten, die Signale an den Haltelinien */
const NAH_M: Readonly<Record<'vortritt' | 'streifen' | 'lsa', number>> = { vortritt: 15, streifen: 15, lsa: 40 }
/** Was eine Ebene aus den amtlichen Inventaren nimmt: ge.signal und die Signale von Schwyz gehören zu zwei Ebenen */
const INVENTAR: Readonly<Record<'vortritt' | 'streifen' | 'lsa', { arten: readonly RegionalDienst['art'][]; klassen: readonly string[] }>> = {
  vortritt: { arten: ['signal'], klassen: ['stop', 'give_way', 'hauptstrasse'] },
  streifen: { arten: ['fgs', 'markierung', 'signal'], klassen: ['fgs', 'fgs_signal'] },
  lsa: { arten: ['lsa'], klassen: ['lsa'] },
}
const KLASSE_TEXT: Readonly<Record<string, string>> = { stop: 'Stop', give_way: 'Kein Vortritt', hauptstrasse: 'Hauptstrasse', fgs: 'Fussgängerstreifen', fgs_signal: 'Signal Fussgängerstreifen', lsa: 'Lichtsignalanlage' }

const wegLinie = (w: OsmWeg): P[] => w.geom.map(([lat, lon]) => lv95(lat, lon))

/** Tempo eines Wegs: maxspeed, sonst Zone (zone:maxspeed, maxspeed:type wie CH:30 oder CH:zone20) */
export function wegTempo(t: Record<string, string>): number | null {
  if (/^\d+$/.test(t.maxspeed ?? '')) return Number(t.maxspeed)
  const m = /CH:(?:zone)?(\d+)/.exec(`${t['zone:maxspeed'] ?? ''} ${t['maxspeed:type'] ?? ''}`)
  return m ? Number(m[1]) : null
}

export function tempoAusOsm(wege: readonly OsmWeg[]): OrtObjekt[] {
  return wege.flatMap(w => {
    const v = wegTempo(w.tags)
    return v === null ? [] : [{ id: `osm:${w.id}`, quelle: 'OpenStreetMap maxspeed · © OpenStreetMap-Mitwirkende, ODbL (gestrichelt)', linien: [wegLinie(w)], klasse: tempoKlasse(v),
      wert: String(v), gestrichelt: true, text: `Tempo ${v} km/h${w.tags.name ? `, ${w.tags.name}` : ''} (OpenStreetMap maxspeed)` }]
  })
}

export function vortrittAusOsm(zeichen: readonly OsmKnoten[]): OrtObjekt[] {
  return zeichen.map(k => ({ id: `vt:${k.id}`, punkt: lv95(k.lat, k.lon), klasse: k.tags.highway ?? 'stop',
    text: `${k.tags.highway === 'give_way' ? 'Kein Vortritt' : 'Stop'}${k.tags.direction ? ` (Richtung ${k.tags.direction})` : ''} (OpenStreetMap)` }))
}

const crossingText = (t: Record<string, string>) => (t.crossing ? ` (crossing=${t.crossing})` : '')
export const streifenAusOsm = (uebergaenge: readonly OsmKnoten[]): OrtObjekt[] => uebergaenge.map(k => ({ id: `ue:${k.id}`, punkt: lv95(k.lat, k.lon), klasse: 'fgs_osm',
  text: `Fussgängerübergang${crossingText(k.tags)} (OpenStreetMap)` }))
export const lsaAusOsm = (ampeln: readonly OsmKnoten[]): OrtObjekt[] => ampeln.map(k => ({ id: `lsa:${k.id}`, punkt: lv95(k.lat, k.lon), klasse: 'lsa_osm', text: 'Lichtsignal (OpenStreetMap highway=traffic_signals)' }))

/** Objekte eines Inventars, die zur Ebene gehören; Markierungen liegen als Linien vor, die übrigen als Punkte */
export function inventarObjekte(d: Pick<RegionalDienst, 'name' | 'anbieter' | 'url' | 'hinweis'>, objekte: readonly RegionalObjekt[], klassen: readonly string[]): OrtObjekt[] {
  return objekte.flatMap((o): OrtObjekt[] => {
    if (!o.verkehr || !klassen.includes(o.verkehr)) return []
    const basis = { quelle: `${d.anbieter}, ${d.name}`, dienstUrl: d.url, klasse: o.verkehr, text: [KLASSE_TEXT[o.verkehr], o.name, o.hinweis || d.hinweis, d.anbieter].filter(Boolean).join('; ') }
    if (o.punkte) return o.punkte.map((punkt, i) => ({ ...basis, id: `${o.id}:${i}`, punkt }))
    return o.teile ? [{ ...basis, id: o.id, linien: o.teile }] : []
  })
}

/** Amtliche Objekte, dazu OSM nur dort, wo keines in der Nähe liegt: Die Inventare enden oft an den Kantonsstrassen */
export function punkteZusammen(amtlich: readonly OrtObjekt[], osm: readonly OrtObjekt[], nahM: number): OrtObjekt[] {
  const orte = amtlich.flatMap(o => [...(o.punkt ? [o.punkt] : []), ...(o.linien ?? []).flat()])
  return [...amtlich, ...osm.filter(o => !orte.some(p => dist(p, o.punkt!) <= nahM))]
}

/** Amtliche Linien, dazu OSM nur dort, wo keine amtliche Linie liegt: Kantone führen oft nur ihre eigenen Strassen */
export function tempoZusammen(amtlich: readonly OrtObjekt[], osm: readonly OrtObjekt[]): OrtObjekt[] {
  const stuecke = amtlich.flatMap(o => (o.linien ?? []).flatMap(l => l.slice(1).map((p, i) => [l[i], p] as const)))
  const frei = osm.filter(o => {
    const l = o.linien?.[0]
    const mitte = l?.[l.length >> 1]
    return !mitte || !stuecke.some(([a, b]) => abstandStrecke(mitte, a, b) <= AMTLICH_NAH_M)
  })
  return [...amtlich, ...frei]
}

export const bernTempoUrl = (mitte: P, r: number): string => `${BERN_TEMPO}?${new URLSearchParams({
  geometry: [mitte[0] - r, mitte[1] - r, mitte[0] + r, mitte[1] + r].map(v => v.toFixed(0)).join(','), geometryType: 'esriGeometryEnvelope', inSR: '2056',
  spatialRel: 'esriSpatialRelIntersects', outFields: 'Objectid,V_sig,Strassenname', outSR: '2056', f: 'geojson', geometryPrecision: '2' })}`

interface BernAntwort {
  crs?: { properties?: { name?: string } }
  error?: { code?: number; message?: string }
  exceededTransferLimit?: boolean
  properties?: { exceededTransferLimit?: boolean }
  features?: { id?: number | string; geometry?: { type?: string; coordinates?: unknown } | null; properties?: Record<string, unknown> | null }[]
}

/** Antwort mit ArcGIS-Fehler, gekappt oder nicht in LV95 wirft: lieber keine Linien als unvollständige */
export function bernTempoLesen(gj: BernAntwort): OrtObjekt[] {
  if (gj.error) throw new AbrufFehler(`ArcGIS ${gj.error.code ?? ''} ${gj.error.message ?? ''}`.trim())
  if (gj.exceededTransferLimit || gj.properties?.exceededTransferLimit) throw new AbrufFehler('Antwort unvollständig (Übertragungsgrenze des Dienstes)')
  if (!/(^|[^0-9])2056$/.test(gj.crs?.properties?.name ?? '')) throw new AbrufFehler('Antwort nicht in LV95 (EPSG:2056)')
  return (gj.features ?? []).flatMap((f, i) => {
    const pr = f.properties ?? {}, g = f.geometry, v = Number(pr.V_sig)
    if (!(v >= 5 && v <= 130) || !g) return []
    const linien = (g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : []) as P[][]
    if (!Array.isArray(linien) || !linien.length) return []
    const strasse = typeof pr.Strassenname === 'string' ? pr.Strassenname : ''
    return [{ id: `vs:${String(pr.Objectid ?? f.id ?? i)}`, quelle: 'Geoportal Stadt Bern, Signalisierte Höchstgeschwindigkeit', klasse: tempoKlasse(v), wert: String(v),
      linien: linien.map(l => l.map(p => [p[0], p[1]] as P)), text: `Tempo ${v} km/h${strasse ? `, ${strasse}` : ''} (Geoportal Stadt Bern)` }]
  })
}

export function tempoAusZuerich(linien: readonly ZhLinie[]): OrtObjekt[] {
  return linien.map(l => ({ id: `zh:${l.id}`, quelle: 'Stadt Zürich, signalisierte Geschwindigkeiten; CC0', linien: l.teile, klasse: l.tempo === null ? 'verbot' : tempoKlasse(l.tempo),
    ...(l.tempo === null ? {} : { wert: String(l.tempo) }), text: `${l.name}: ${l.regime} (${l.code}); ${[l.signal, l.ausnahmen].filter(x => x).join(' ')}; Stadt Zürich` }))
}

export function tempoAusRegional(d: Pick<RegionalDienst, 'id' | 'name' | 'anbieter' | 'url'>, objekte: readonly RegionalObjekt[]): OrtObjekt[] {
  return objekte.flatMap(o => {
    if (!o.teile?.length || o.tempo === null || o.tempo === undefined) return []
    return [{ id: `reg:${d.id}:${o.id}`, quelle: `${d.anbieter}, ${d.name}`, dienstUrl: d.url, linien: o.teile, klasse: tempoKlasse(o.tempo), wert: String(o.tempo),
      text: `Tempo ${o.tempo} km/h${o.name ? `, ${o.name}` : ''} (${d.anbieter})` }]
  })
}

/** Welche amtlichen Dienste für die Gemeinden im Ausschnitt zuständig sind */
export function tempoDienste(orte: readonly Gemeinde[]) {
  return { bern: orte.some(o => o.bfs === BERN_BFS), zuerich: orte.some(o => o.bfs === ZUERICH_BFS), regional: regionalFuer(orte).filter(d => d.art === 'tempo') }
}

/** Dienste der Inventare für die eingeschalteten Ebenen; ein Dienst für zwei Ebenen wird nur einmal gefragt */
export function inventarDienste(orte: readonly Gemeinde[], an: readonly OrtEbeneId[]): { d: RegionalDienst; ebenen: InventarEbene[] }[] {
  const ebenen = an.filter((id): id is InventarEbene => id !== 'tempo')
  return regionalFuer(orte).flatMap(d => { const fuer = ebenen.filter(id => INVENTAR[id].arten.includes(d.art)); return fuer.length ? [{ d, ebenen: fuer }] : [] })
}

type InventarEbene = Exclude<OrtEbeneId, 'tempo'>
/** Annahmen wie im SichtweitenCheck: eine amtliche Linie gehört bis 8 m und 20° zum Arm */
const ARM_ABSTAND_M = 8, ARM_WINKEL = 20 * Math.PI / 180
/** Annahme: geprüft wird der Arm zwischen 10 und 50 m ab dem Knoten, im Knoten selbst liegen die Linien aller Arme */
const ARM_VON_M = 10, ARM_BIS_M = 50, ARM_SCHRITT_M = 10

export interface ArmTempo { tempo: number; quelle: string }

/** Punkte der Armlinie mit Richtung, im Abstand vom Knoten */
function armProben(linie: readonly P[]): { p: P; w: number }[] {
  const aus: { p: P; w: number }[] = []
  let weg = 0, ziel = ARM_VON_M
  for (let i = 1; i < linie.length && ziel <= ARM_BIS_M; i++) {
    const a = linie[i - 1], b = linie[i], l = dist(a, b)
    while (l > 0 && ziel <= weg + l && ziel <= ARM_BIS_M) {
      const t = (ziel - weg) / l
      aus.push({ p: [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])], w: Math.atan2(b[1] - a[1], b[0] - a[0]) })
      ziel += ARM_SCHRITT_M
    }
    weg += l
  }
  return aus
}

/** Amtliches Tempo eines Arms: je Probe die nächste etwa parallele Linie, gezählt nur, wenn die Mehrheit der Proben denselben Wert trifft */
export function armTempoAmtlich(linie: readonly P[], amtlich: readonly OrtObjekt[]): ArmTempo | null {
  const proben = armProben(linie), treffer: OrtObjekt[] = []
  for (const { p, w } of proben) {
    let best: OrtObjekt | null = null, bestD: number = ARM_ABSTAND_M
    for (const o of amtlich) for (const l of o.linien ?? []) for (let i = 1; i < l.length; i++) {
      const d = abstandStrecke(p, l[i - 1], l[i]), v = Math.atan2(l[i][1] - l[i - 1][1], l[i][0] - l[i - 1][0])
      if (d <= bestD && Math.abs(Math.sin(v - w)) <= Math.sin(ARM_WINKEL)) { bestD = d; best = o }
    }
    if (best) treffer.push(best)
  }
  const zahl = new Map<string, OrtObjekt[]>()
  for (const o of treffer) if (o.wert) zahl.set(o.wert, [...(zahl.get(o.wert) ?? []), o])
  const [sieger] = [...zahl.values()].sort((a, b) => b.length - a.length)
  if (!sieger || sieger.length * 2 <= proben.length) return null
  const q = sieger[0].quelle ?? ''
  return { tempo: Number(sieger[0].wert), quelle: q.split(',')[0].replace(/^Geoportal /, '') }
}

type Stand = Partial<Record<OrtEbeneId, string>>
type Objekte = Record<OrtEbeneId, OrtObjekt[]>
type Luecken = Partial<Record<OrtEbeneId, number>>
const LEER: Objekte = { tempo: [], vortritt: [], streifen: [], lsa: [] }

/** Jeder Dienst für sich: Fällt einer aus, bleiben die übrigen und OSM. luecken zählt je Ebene die ausgefallenen */
export async function ladeAmtlich(an: readonly OrtEbeneId[], lat: number, lon: number, r: number, signal: AbortSignal): Promise<{ objekte: Objekte; luecken: Luecken }> {
  const mitte = lv95(lat, lon), orte = (await ladeGebiet(lat, lon, r, signal)).daten.imAusschnitt
  const { bern, zuerich, regional } = tempoDienste(orte)
  const auftraege: { ebenen: readonly OrtEbeneId[]; holen: Promise<Partial<Objekte>> }[] = [
    ...(an.includes('tempo') ? [
      ...(bern ? [holeJson<BernAntwort>(bernTempoUrl(mitte, r), {}, 30000, signal).then(a => bernTempoLesen(a.daten))] : []),
      ...(zuerich ? [ladeZuerich('tempo', mitte, r, signal).then(a => tempoAusZuerich(a.daten.objekte))] : []),
      ...regional.map(d => ladeRegional(d, mitte, r, signal).then(a => tempoAusRegional(d, a.daten.objekte))),
    ].map(p => ({ ebenen: ['tempo'] as const, holen: p.then(tempo => ({ tempo })) })) : []),
    ...inventarDienste(orte, an).map(({ d, ebenen }) => ({ ebenen, holen: ladeRegional(d, mitte, r, signal).then(a =>
      Object.fromEntries(ebenen.map(id => [id, inventarObjekte(d, a.daten.objekte, INVENTAR[id].klassen)])) as Partial<Objekte>) })),
  ]
  const antworten = await Promise.allSettled(auftraege.map(a => a.holen))
  const objekte: Objekte = { tempo: [], vortritt: [], streifen: [], lsa: [] }, luecken: Luecken = {}
  antworten.forEach((a, i) => {
    if (a.status === 'rejected') { for (const id of auftraege[i].ebenen) luecken[id] = (luecken[id] ?? 0) + 1; return }
    for (const [id, liste] of Object.entries(a.value) as [OrtEbeneId, OrtObjekt[]][]) objekte[id].push(...liste)
  })
  return { objekte, luecken }
}

/** Amtliches und OSM je Ebene zusammenführen */
export function ebenenZusammen(an: readonly OrtEbeneId[], a: Objekte, osm: OsmDaten): Objekte {
  const aus: Objekte = { ...LEER }
  if (an.includes('tempo')) aus.tempo = tempoZusammen(a.tempo, tempoAusOsm(osm.wege))
  if (an.includes('vortritt')) aus.vortritt = punkteZusammen(a.vortritt, vortrittAusOsm(osm.vortritt), NAH_M.vortritt)
  if (an.includes('streifen')) aus.streifen = punkteZusammen(a.streifen, streifenAusOsm(osm.uebergaenge), NAH_M.streifen)
  if (an.includes('lsa')) aus.lsa = punkteZusammen(a.lsa, lsaAusOsm(osm.ampeln), NAH_M.lsa)
  return aus
}

const zahlText = (n: number) => `${n.toLocaleString('de-CH')} im Ausschnitt`

export function useOrtEbenen(map: L.Map | null, an: readonly OrtEbeneId[]) {
  const [objekte, setObjekte] = useState<Objekte>(LEER)
  const [stand, setStand] = useState<Stand>({})
  // Kreis der letzten Abfrage; überlebt das Einschalten einer weiteren Ebene, damit Overpass nicht nochmals gefragt wird
  const osmRef = useRef<{ lat: number; lon: number; r: number; osm: OsmDaten } | null>(null)
  const schluessel = an.join()
  useEffect(() => {
    if (!map || !an.length) return
    const alle = (text: string): Stand => Object.fromEntries(an.map(id => [id, text]))
    let timer = 0, ctrl: AbortController | null = null, amtlichKreis: { lat: number; lon: number; r: number } | null = null, fertig: Stand = {}
    const imKreis = (k: { lat: number; lon: number; r: number } | null, c: L.LatLng, halb: number) => !!k && dist(lv95(k.lat, k.lon), lv95(c.lat, c.lng)) + halb <= k.r
    const laden = async () => {
      ctrl?.abort(); ctrl = null
      if (map.getZoom() < AUSSCHNITT_ZOOM) { setObjekte(LEER); setStand({}); amtlichKreis = null; return }
      const c = map.getCenter(), halb = map.distance(c, map.getBounds().getNorthEast()), r = Math.ceil(halb + ORT_RAND_M)
      if (r > ORT_MAX_RADIUS_M) { setStand(alle('zum Laden näher heranzoomen')); return }
      const osmDa = imKreis(osmRef.current, c, halb)
      if (osmDa && imKreis(amtlichKreis, c, halb)) { setStand(fertig); return }
      const steuer = new AbortController(), signal = steuer.signal
      ctrl = steuer
      setStand(alle('wird geladen …'))
      const amtlich = ladeAmtlich(an, c.lat, c.lng, r, signal).catch((): { objekte: Objekte; luecken: Luecken } => ({ objekte: LEER, luecken: Object.fromEntries(an.map(id => [id, 1])) }))
      try {
        if (!osmDa) { const roh = await ladeOsmRoh(c.lat, c.lng, r, signal); osmRef.current = { lat: c.lat, lon: c.lng, r, osm: osmParsen(roh.daten as Parameters<typeof osmParsen>[0]) } }
        const a = await amtlich
        if (signal.aborted) return
        const neu = ebenenZusammen(an, a.objekte, osmRef.current!.osm)
        if (!Object.keys(a.luecken).length) amtlichKreis = { lat: c.lat, lon: c.lng, r }
        setObjekte(neu)
        fertig = Object.fromEntries(an.map(id => [id, `${zahlText(neu[id].length)}${a.luecken[id] ? '; amtlich nicht vollständig, sonst OSM' : ''}`]))
        setStand(fertig)
      } catch (e) {
        if (signal.aborted || istAbbruch(e)) return
        // Ohne OSM bleibt das Amtliche
        const a = await amtlich
        if (signal.aborted) return
        setObjekte(a.objekte)
        fertig = Object.fromEntries(an.map(id => [id, a.objekte[id].length ? `${zahlText(a.objekte[id].length)}; OSM nicht geladen` : 'nicht geladen']))
        setStand(fertig)
      }
    }
    const spaeter = () => { window.clearTimeout(timer); timer = window.setTimeout(() => void laden(), ORT_PAUSE_MS) }
    spaeter(); map.on('moveend', spaeter)
    return () => { window.clearTimeout(timer); map.off('moveend', spaeter); ctrl?.abort() }
    // an ist je Darstellung neu, schluessel steht für den Inhalt
  }, [map, schluessel]) // eslint-disable-line react-hooks/exhaustive-deps
  return an.length ? { objekte, stand } : { objekte: LEER, stand: {} as Stand }
}
