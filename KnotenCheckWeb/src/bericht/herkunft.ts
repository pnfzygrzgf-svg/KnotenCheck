// Herkunft eines Werts im Druckblatt: aus dem Modell (M), aus der Karte (K) oder aus gezählten Armmengen geschätzt (S). Ein Wert gilt nur so lange als übernommen,
// wie er noch gleich ist wie bei der Übernahme; von Hand geänderte Werte tragen kein Zeichen.

import { eigenerLinks, eigenerRechts, kombination, type KnotenUebernahme, type UebernahmeArm } from '../karte/rechner'
import type { MixedLaneCombination } from '../engine/types'
import type { ArmStroeme } from '../engine/armmengen'

export type HerkunftArt = 'M' | 'K' | 'S'

/** Abbiegestrom aus der Schätzung aus Armmengen: S, solange er dem geschätzten Wert entspricht */
export const schaetzArt = (s: ArmStroeme | undefined, art: 'left' | 'straight' | 'right', wert: number): HerkunftArt | null =>
  (s && s[art] === wert ? 'S' : null)

/** Abbiegestrom eines Arms (Rechner-Reihenfolge wie die Übernahme): M, wenn er noch dem Modellwert entspricht */
export function stromHerkunft(u: KnotenUebernahme | undefined, arm: number, art: 'left' | 'straight' | 'right', wert: number): HerkunftArt | null {
  const s = u?.arme[arm]?.stroeme
  return s && s[art] === wert ? 'M' : null
}

/** Übrige Werte aus der Karte (Name, Neigung, Tempo …): K, wenn noch gleich */
export function kartenHerkunft<T>(uebernommen: T | undefined | null, wert: T): HerkunftArt | null {
  return uebernommen !== undefined && uebernommen !== null && uebernommen === wert ? 'K' : null
}

/** Schwerverkehr aus dem Modell: M, wenn die Anteile noch gleich sind */
export function svHerkunft(u: KnotenUebernahme | undefined, arm: number, lw: number | undefined, lz: number | undefined): HerkunftArt | null {
  const s = u?.arme[arm]?.schwerverkehr
  return s && s.lw === lw && s.lz === lz ? 'M' : null
}

// ── Je Arm, für die Eingabefelder am Bildschirm (Arm der Übernahme direkt) ──

/** Abbiegestrom: M, solange er dem Modellwert entspricht */
export const stromArt = (u: UebernahmeArm | undefined, art: 'left' | 'straight' | 'right', wert: number): HerkunftArt | null =>
  (u?.stroeme && u.stroeme[art] === wert ? 'M' : null)

/** Schwerverkehr aus dem Modell: M, solange LW und LZ gleich sind */
export const svArt = (u: UebernahmeArm | undefined, lw: number | undefined, lz: number | undefined): HerkunftArt | null =>
  (u?.schwerverkehr && u.schwerverkehr.lw === lw && u.schwerverkehr.lz === lz ? 'M' : null)

/** Fahrstreifen aus OSM: K, solange die Angabe im Rechner noch der abgeleiteten entspricht */
export function streifenArt(u: UebernahmeArm | undefined, feld: 'links' | 'rechts', wert: boolean): HerkunftArt | null
export function streifenArt(u: UebernahmeArm | undefined, feld: 'misch', wert: MixedLaneCombination | null): HerkunftArt | null
export function streifenArt(u: UebernahmeArm | undefined, feld: 'links' | 'rechts' | 'misch', wert: boolean | MixedLaneCombination | null): HerkunftArt | null {
  const s = u?.streifen
  if (!s) return null
  const abgeleitet = feld === 'links' ? eigenerLinks(s) : feld === 'rechts' ? eigenerRechts(s) : kombination(s)
  return abgeleitet !== null && abgeleitet === wert ? 'K' : null
}

/** Ein Feld des Schwerverkehrs (LW oder LZ): M, solange es dem Modellwert entspricht */
export const svFeldArt = (u: UebernahmeArm | undefined, feld: 'lw' | 'lz', wert: number): HerkunftArt | null =>
  (u?.schwerverkehr && u.schwerverkehr[feld] === wert ? 'M' : null)
