// Fahrstreifen eines Arms zum Knoten hin aus den OSM-Tags. Gleiche Lesart wie fahrstreifenTags im SichtweitenCheck, ohne dessen Bezug zur
// Fahrbahngeometrie. Wie vollständig OSM hier ist, ist nirgends gemessen: Das Ergebnis bleibt ein Vorschlag.

import { einbahnTag } from '../knotenkern/rechner/netz'
import type { ArmStreifen, Spur } from './rechner'

type Tags = Record<string, string>

const SPUREN: Record<string, Spur> = {
  left: 'left', slight_left: 'left', sharp_left: 'left', right: 'right', slight_right: 'right', sharp_right: 'right', through: 'straight',
}

function zahl(v: string | undefined): number | null {
  if (v === undefined || !/^\d+$/.test(v.trim())) return null
  const n = parseInt(v, 10)
  return n >= 1 ? n : null
}

/** «left|through;right» -> [['left'], ['straight', 'right']]; leere Angaben gelten als geradeaus */
export function spurenLesen(roh: string): Spur[][] {
  return roh.split('|').map(teil => {
    const l = [...new Set(teil.split(';').map(x => SPUREN[x.trim()]).filter((s): s is Spur => !!s))]
    return l.length ? l : ['straight']
  })
}

/** Fahrstreifen in OSM-Wegrichtung (vorwaerts) bzw. dagegen; null ohne Angabe oder auf einer Einbahn gegen die Fahrtrichtung */
export function armStreifen(t: Tags, vorwaerts: boolean): ArmStreifen | null {
  const ow = einbahnTag(t)
  const lanes = zahl(t.lanes)
  let n: number | null, turn: string | undefined
  if (ow) {
    if ((ow > 0) !== vorwaerts) return null
    n = lanes
    turn = t['turn:lanes'] || t[ow > 0 ? 'turn:lanes:forward' : 'turn:lanes:backward']
  } else {
    let fw = zahl(t['lanes:forward']), bw = zahl(t['lanes:backward'])
    const beid = zahl(t['lanes:both_ways']) ?? 0
    if (lanes !== null && (fw === null) !== (bw === null)) {
      const rest = lanes - (fw ?? bw!) - beid
      if (fw !== null) bw = rest >= 1 ? rest : null
      else fw = rest >= 1 ? rest : null
    }
    n = fw !== null && bw !== null ? (vorwaerts ? fw : bw) : lanes === 1 ? 1 : lanes && lanes % 2 === 0 ? lanes / 2 : null
    turn = t[vorwaerts ? 'turn:lanes:forward' : 'turn:lanes:backward']
  }
  if (n === null) return null
  const spuren = turn ? spurenLesen(turn) : null
  return { anzahl: n, spuren: spuren && spuren.length === n ? spuren : null }
}
