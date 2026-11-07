// Vom Kartenvorschlag zu den Eingaben der Rechner: Reihenfolge der Arme und Namen.
//
// Einmündung, Kreuzung, Knoten mit Fussgänger*innen, LSA und Simulation führen die Arme als [A, C, B, D]: A und C sind die Hauptstrasse,
// von A aus liegt B rechts und D links (A West, C Ost, B Süd, D Nord). Im Uhrzeigersinn folgen sie also A, D, C, B.
// Der Kreisel zählt die Arme in Fahrtrichtung: Rechts abbiegen führt von Arm i zu Arm i + 1, die Nummern laufen gegen den Uhrzeigersinn.
// Eine Spiegelung vertauschte links und rechts und damit alle Abbiegeströme: uebernahme.test.ts prüft das in jeder Drehlage.

import { winkelGrad, dot } from '../knotenkern/geo'
import type { RoundaboutType } from '../engine/roundaboutCalculator'
import type { ArmBelastung } from './belastung'
import { armStroeme, type AbbiegerStand } from './modellAbbieger'
import { armName, RECHTSVORTRITT_TEXT, vermutlichRechtsvortritt, type KartenArm, type KnotenVorschlag } from './knotenVorschlag'
import { klasseText, NEIGUNG_LINIE_M, type ArmNeigung } from './neigung'
import type { ArmStreifen, Belegt, KnotenUebernahme, UebernahmeArm } from './rechner'
import type { ArmVergleich } from './vergleich'
import type { ArmTempo } from './ortEbenen'

export type HauptPaar = [string, string]

/** Azimut [°] im Uhrzeigersinn ab Norden */
const azimut = (a: KartenArm) => (450 - winkelGrad(a.richtung)) % 360
const imUhrzeigersinn = (arme: KartenArm[]) => [...arme].sort((a, b) => azimut(a) - azimut(b))

/** Wählbare Hauptstrassen: bei drei Armen jedes Paar, bei vier Armen nur gegenüberliegende (die Rechner kennen keine abknickende) */
export function hauptPaare(v: KnotenVorschlag): HauptPaar[] {
  const c = imUhrzeigersinn(v.arme)
  if (c.length === 4) return [[c[0].key, c[2].key], [c[1].key, c[3].key]]
  if (c.length === 3) return [[c[0].key, c[1].key], [c[1].key, c[2].key], [c[0].key, c[2].key]]
  return []
}

const gleichesPaar = (p: HauptPaar, q: HauptPaar) => p.includes(q[0]) && p.includes(q[1])

/** Hauptstrasse zu Beginn: die aus OSM, wenn wählbar, sonst das gestreckteste Paar */
export function anfangsPaar(v: KnotenVorschlag): HauptPaar | null {
  const paare = hauptPaare(v)
  if (!paare.length) return null
  const haupt = v.haupt
  if (haupt) { const p = paare.find(x => gleichesPaar(x, haupt)); if (p) return p }
  const arm = (k: string) => v.arme.find(a => a.key === k)!
  const gestreckt = (p: HauptPaar) => -dot(arm(p[0]).richtung, arm(p[1]).richtung)
  return paare.reduce((b, p) => (gestreckt(p) > gestreckt(b) ? p : b))
}

/** OSM nennt eine abknickende Hauptstrasse, die Rechner setzen gegenüberliegende Arme voraus */
export const hauptKnickt = (v: KnotenVorschlag): boolean =>
  !!v.haupt && hauptPaare(v).every(p => !gleichesPaar(p, v.haupt!))

/** Arme in Rechner-Reihenfolge [A, C, B, D] zur gewählten Hauptstrasse */
export function armeOrdnen(v: KnotenVorschlag, paar: HauptPaar): KartenArm[] {
  const c = imUhrzeigersinn(v.arme)
  if (c.length === 3) {
    const b = c.findIndex(a => !paar.includes(a.key))
    return [c[(b + 1) % 3], c[(b + 2) % 3], c[b]]
  }
  const i = c.findIndex(a => paar.includes(a.key))
  return [c[i], c[(i + 2) % 4], c[(i + 3) % 4], c[(i + 1) % 4]]
}

/** Kreiselarme in Fahrtrichtung (gegen den Uhrzeigersinn), ab dem nördlichsten */
export function kreiselOrdnen(arme: KartenArm[]): KartenArm[] {
  const abNord = (a: KartenArm) => (winkelGrad(a.richtung) - 90 + 360) % 360
  return [...arme].sort((a, b) => abNord(a) - abNord(b))
}

/** Reihenfolge und Bezeichnung der Arme, wie der Rechner sie zeigt */
export function armeMitLabel(v: KnotenVorschlag, paar: HauptPaar | null): { arm: KartenArm; label: string }[] {
  if (v.form === 'kreisel') return kreiselOrdnen(v.arme).map((arm, i) => ({ arm, label: String(i + 1) }))
  if (!paar) return []
  return armeOrdnen(v, paar).map((arm, i) => ({ arm, label: ['A', 'C', 'B', 'D'][i] }))
}

export type Spitze = 'morgen' | 'abend'
export const SPITZE_TEXT: Record<Spitze, string> = { morgen: 'Morgenspitze 7–8 Uhr', abend: 'Abendspitze 17–18 Uhr' }
/** Herkunft des Tempos: Stimmt ein gewählter Wert mit einer Quelle überein, gilt diese Quelle */
export function tempoQuelle(hand: number | undefined, amtlich: ArmTempo | undefined, osm: number | null): string {
  if (hand === undefined) return amtlich?.quelle ?? 'OSM'
  return hand === amtlich?.tempo ? amtlich.quelle : hand === osm ? 'OSM' : 'von Hand'
}

export interface Auswahl { neigung: boolean; fgs: boolean; streifen: boolean; tempo: boolean; schwerverkehr: Spitze | null; abbieger: Spitze | null }
/** Schwerverkehrsanteil und Abbiegeströme verändern die Rechnung und stammen aus dem Modell: nur auf ausdrückliche Wahl */
export const ALLES: Auswahl = { neigung: true, fgs: true, streifen: true, tempo: true, schwerverkehr: null, abbieger: null }

/** Kreiseltyp einer Einfahrt aus Fahrstreifen der Einfahrt und des Rings; unklar bleibt die Vorgabe des Rechners */
export function kreiselTyp(s: ArmStreifen | null, ring: number | null): RoundaboutType | undefined {
  if (s?.anzahl === 1) return ring === 2 ? undefined : '1/1'
  if (s?.anzahl === 2) return ring === 2 ? '2/2' : '2/1+'
  return undefined
}

const labels = (l: string[]) => l.join(', ')
const zahlText = (x: number) => String(Math.round(x * 10) / 10).replace('.', ',')

/** Eingaben aus der Karte; nur was ausgewählt ist und einen Wert hat. Fehlt ein Wert, bleibt das Feld im Rechner leer */
export function uebernahmeAus(v: KnotenVorschlag, paar: HauptPaar | null, neigungen: Record<string, ArmNeigung> = {}, auswahl: Auswahl = ALLES,
  belastung: Record<string, ArmBelastung> = {}, osmStand = 'unbekannt', abbieger: AbbiegerStand | null = null, tempoHand: Record<string, number> = {}, tempoAmtlich: Record<string, ArmTempo> = {}): KnotenUebernahme | null {
  const arme = armeMitLabel(v, paar)
  if (v.meldung || arme.length < 3 || arme.length > 4) return null
  const armCount = arme.length as 3 | 4
  const hinweise = [...v.hinweise]
  for (const { arm, label } of arme) {
    if (!arm.zufahrt) hinweise.push(`Arm ${label} ist Einbahn vom Knoten weg: keine Zufahrt, Ströme dort bleiben 0.`)
    if (arm.stichM !== null) hinweise.push(`Arm ${label} endet nach ${Math.round(arm.stichM)} m für Motorfahrzeuge.`)
    const n = neigungen[arm.key]
    if (auswahl.neigung && n?.hinweis) hinweise.push(`Arm ${label}: ${n.hinweis}`)
  }
  if (vermutlichRechtsvortritt(v)) hinweise.push(RECHTSVORTRITT_TEXT)
  else if (v.form !== 'kreisel' && !v.hauptSicher) hinweise.push(`Hauptstrasse angenommen (${v.hauptGrund || 'OSM ohne Angabe'}): bitte prüfen.`)
  if (hauptKnickt(v)) hinweise.push('In OSM knickt die Hauptstrasse ab. Die Rechner setzen gegenüberliegende Arme voraus.')

  const modell = auswahl.abbieger && abbieger?.spitze === auswahl.abbieger ? abbieger : null
  const stroeme = modell ? armStroeme(modell.matrix, arme.map(({ arm, label }) => ({ key: arm.key, label })), v.form === 'kreisel') : null
  if (modell) for (const { arm, label } of arme) if (modell.offen.includes(arm.key)) hinweise.push(`Arm ${label}: kein passender Modellwert, seine Ströme fehlen im Vorschlag.`)

  const uArme: UebernahmeArm[] = arme.map(({ arm, label }) => {
    const n = neigungen[arm.key]
    const typ = v.form === 'kreisel' && auswahl.streifen ? kreiselTyp(arm.streifen, v.ringStreifen) : undefined
    const b = belastung[arm.key]
    const sv = auswahl.schwerverkehr ? b?.[auswahl.schwerverkehr === 'morgen' ? 'svMorgen' : 'svAbend'] : null
    const hand = tempoHand[arm.key], amtlich = tempoAmtlich[arm.key], tempo = hand ?? amtlich?.tempo ?? arm.tempo
    return {
      label, name: armName(arm), himmel: arm.himmel,
      ...(auswahl.neigung && n?.klasse ? { neigung: n.klasse } : {}),
      ...(auswahl.fgs && arm.fgs ? { fgs: { insel: arm.fgs.insel } } : {}),
      ...(auswahl.streifen && arm.streifen ? { streifen: arm.streifen } : {}),
      ...(auswahl.tempo && tempo !== null ? { tempo } : {}),
      ...(auswahl.tempo && tempo !== null ? { tempoQuelle: tempoQuelle(hand, amtlich, arm.tempo) } : {}),
      ...(typ ? { kreiselTyp: typ } : {}),
      ...(sv ? { schwerverkehr: sv } : {}),
      ...(stroeme ? { stroeme: stroeme[arm.key] } : {}),
    }
  })

  const vergleich: ArmVergleich[] = arme.map(({ arm, label }) => {
    const b = belastung[arm.key]
    return { label, name: armName(arm), dtv: b?.dtv ?? null, msp: b?.msp ?? null, asp: b?.asp ?? null, lokalDtv: b?.lokalDtv ?? null, lokalQuelle: b?.lokalQuelle ?? null }
  })

  const belegt: Belegt[] = []
  const mitNeigung = uArme.filter(a => a.neigung)
  const modelle = [...new Set(arme.map(({ arm }) => neigungen[arm.key]?.modell).filter(m => m))]
  if (mitNeigung.length) {
    belegt.push({ art: 'neigung', text: `Neigung aus ${modelle.join(', ')}, gemessen über ${NEIGUNG_LINIE_M} m ab dem Knoten (Annahme), auf die Tabellenklassen gerundet: ` +
      labels(mitNeigung.map(a => `${a.label} ${klasseText(a.neigung!)}`)) })
  }
  const mitFgs = uArme.filter(a => a.fgs)
  if (mitFgs.length) belegt.push({ art: 'fgs', text: `Fussgängerstreifen aus OSM an Arm ${labels(mitFgs.map(a => a.label))}. Fussgänger*innen je Stunde bitte eingeben.` })
  const mitStreifen = uArme.filter(a => a.streifen)
  if (mitStreifen.length) belegt.push({ art: 'streifen', text: `Fahrstreifen aus OSM an Arm ${labels(mitStreifen.map(a => a.label))}: bitte prüfen, OSM ist hier nicht immer vollständig.` })
  const mitTempo = uArme.filter(a => a.tempo)
  if (mitTempo.length) belegt.push({ art: 'tempo', text: `Tempo: ${labels(mitTempo.map(a => `${a.label} ${a.tempo} km/h (${a.tempoQuelle})`))}.` })
  const mitSv = uArme.filter(a => a.schwerverkehr)
  if (mitSv.length) belegt.push({ art: 'schwerverkehr', text: `Schwerverkehrsanteil aus dem Modell NPVM, ${SPITZE_TEXT[auswahl.schwerverkehr!]}, nicht gezählt: ${labels(mitSv.map(a => `${a.label} ${zahlText(a.schwerverkehr!.lw + a.schwerverkehr!.lz)} %`))}.` })

  if (modell) belegt.push({ art: 'abbieger', text: `Abbiegeströme aus dem Modell NPVM, ${SPITZE_TEXT[modell.spitze]}, berechnet, nicht gezählt. Sie können stark abweichen, vor allem kleine Ströme: bitte prüfen, eine Zählung ist genauer.` })

  return { id: v.id, lat: v.lat, lon: v.lon, name: v.name, armCount, arme: uArme, belegt, vergleich, hinweise, osmStand, hoehenModelle: mitNeigung.length ? modelle : [] }
}
