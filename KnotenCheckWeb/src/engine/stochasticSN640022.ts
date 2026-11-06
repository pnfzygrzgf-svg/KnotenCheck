// Stochastik-Simulation SN 640 022 — Einmündung & Kreuzung
// Stufe 1A: lognormal gestreutes t_c (Fahrerheterogenität)
// Stufe 1B: Cowan M3 Zeitlücken je Fahrstreifen (Kolonnenbildung im Hauptstrom)
// Stufe 2C: Simultane NS-Ströme (gemeinsame Haltlinie)
// Stufe 2D: Endlicher Stauraum
// Stufe 3:  Rückstau höherrangiger Ströme analog F13–F20 (Ziff. 11, S. 6)
// Feature A: Konfigurierbare Grenz-/Folgezeitlücken (tc/tf) pro Strom-Typ
// Feature C: Fussgänger*innen sperren die Fahrtrichtung, die sie überqueren
// Feature D: Mehrere Zeitintervalle mit Carry-over-Queue
// Referenz: Troutbeck & Brilon, Traffic Flow Theory Kap. 8

import { analyzeSN640022 } from './sn640022Calculator'
import type { SN640022LaneFlags } from './types'
import { resolveQuerung, type Querung } from './querung'

// ── Konfiguration ─────────────────────────────────────────────────────────────

// Feature A: Überschreibbare tc/tf pro Strom-Typ
export type GapStreamType = 'mainLeft' | 'sideRight' | 'sideCross' | 'sideLeft'

export interface GapOverrides {
  mainLeft?:  Partial<GapParams>
  sideRight?: Partial<GapParams>
  sideCross?: Partial<GapParams>
  sideLeft?:  Partial<GapParams>
}

// Feature C: Fussgänger-Konfiguration
export interface PedestrianLegConfig {
  enabled:     boolean  // Querung (Fussgängerstreifen / Trottoirüberfahrt) am Arm vorhanden
  // Querungsart (engine/querung.ts). Fehlt das Feld (ältere Dateien), gilt enabled → 'fgs',
  // sonst 'keine'. Trottoirüberfahrt nur an NS-Armen (B, D): gerechnet wie ein
  // Fussgängerstreifen über die Nebenstrasse (Direktsperre, Sperrzeit = Breite der
  // Einmündung / v_FG) — Annahme; immer ohne Mittelinsel.
  querung?:    Querung
  fg:          number   // Fussgänger*innen [Fg/h] am Fussgängerstreifen
  rho:         number   // mittlere Gruppengrösse (1–5) — steuert die Häufigkeit der
                        // Sperrungen: λ = (fg/ρ)/3600 Gruppen/s (nicht die Dauer)
  mittelinsel: boolean  // Art. 47 Abs. 3 VRV: Insel teilt Streifen → Sperrzeit halbiert
  fahrbahnbreite?: number  // [m] zu querende Fahrbahnbreite; undefined → Standard 8 m
}

// Gehgeschwindigkeit für die Sperrzeit (VSS 40 240, konservativ: ältere Menschen /
// Menschen mit Behinderung). Bewusst tiefer als die 1.2 m/s der LSA-Räumzeit (VSS 40 837).
export const V_FG = 0.80                  // m/s
export const DEFAULT_FAHRBAHNBREITE = 8   // m — Standardfall (Option 1)
export const MITTELINSEL_GRENZE_M = 8.5   // m — ab hier Mittelinsel nötig (VSS 40 241)

// Sperrzeit, während der eine querende Fussgängergruppe den Hauptstrom blockiert.
// Querungsdauer der Fahrbahn bei v_FG; Mittelinsel halbiert die wirksame Breite
// (jede Hälfte gilt als selbständiger Streifen, Art. 47 Abs. 3 VRV).
// Unabhängig von der Gruppengrösse ρ (die Gruppe quert gemeinsam).
export function pedBlockingTime(leg: { fahrbahnbreite?: number; mittelinsel: boolean }): number {
  const w = typeof leg.fahrbahnbreite === 'number' && leg.fahrbahnbreite > 0
    ? leg.fahrbahnbreite : DEFAULT_FAHRBAHNBREITE
  return (w / V_FG) * (leg.mittelinsel ? 0.5 : 1)
}

// Mittlere Gruppengrösse ρ, mindestens 1 (ungültige Werte → 1)
function groupSize(leg: PedestrianLegConfig): number {
  return Number.isFinite(leg.rho) && leg.rho >= 1 ? leg.rho : 1
}

export interface PedestrianConfig {
  armA: PedestrianLegConfig   // HS-Arm A: hält den Hauptstrom von A an und sperrt Ströme über den Streifen
  armC: PedestrianLegConfig   // HS-Arm C: hält den Hauptstrom von C an und sperrt Ströme über den Streifen
  armB?: PedestrianLegConfig  // NS-Arm B: Direktsperre für Ströme mit Abfahrt/Ankunft an Arm B
  armD?: PedestrianLegConfig  // NS-Arm D: Direktsperre (nur 4-Arm)
}

// Querung eines Arms bereinigen, ohne die Rechnung zu ändern: enabled folgt der Querung;
// Trottoirüberfahrt nur an NS-Armen (sonst Fussgängerstreifen) und nie mit Mittelinsel.
export function normalizePedestrianLeg(leg: PedestrianLegConfig, istNebenstrasse: boolean):
  PedestrianLegConfig & { querung: Querung } {
  const querung = resolveQuerung(leg.querung, leg.enabled === true, istNebenstrasse)
  return {
    ...leg,
    querung,
    enabled:     querung !== 'keine',
    mittelinsel: querung === 'trottoirueberfahrt' ? false : leg.mittelinsel,
  }
}

// Alle Arme: A und C sind Hauptstrassen-Arme, B und D Nebenstrassen-Arme.
// Fehlende Arme bleiben fehlend (= keine Querung).
export function normalizePedestrianConfig(p: PedestrianConfig): PedestrianConfig {
  const norm = (leg: PedestrianLegConfig | undefined, ns: boolean) =>
    leg ? normalizePedestrianLeg(leg, ns) : leg
  return {
    armA: norm(p.armA, false)!,
    armC: norm(p.armC, false)!,
    ...(p.armB && { armB: norm(p.armB, true) }),
    ...(p.armD && { armD: norm(p.armD, true) }),
  }
}

export interface StochasticConfig {
  runs?:        number   // Anzahl Simulationsläufe, default 150
  T?:           number   // Simulationsdauer [s], default 3600
  tcSigma?:     number   // Streuung der Grenzzeitlücke t_c zwischen Fahrer*innen [s]
                         // (Standardabweichung, lognormal, Mittelwert = t_c); 0 = konstant.
                         // Default 0.5 s (eigene Annahme)
  seed?:        number   // Startwert des Zufallsgenerators → reproduzierbare Resultate
  useCowan?:    boolean  // Cowan-M3-Zeitlücken (Kolonnen) statt Exponential, default true
  cowanA?:      number   // Platoon-Faktor A (Troutbeck & Brilon, FHWA 1997, Kap. 8, Gl. 8.23; A = 6–9), default 7.0
  cowanTm?:     number   // Physikalischer Mindestabstand t_m [s], default 1.8
  storageB?:    number   // Arm-B-Stauraum [Fz], default Infinity
  storageD?:    number   // Arm-D-Stauraum [Fz], default Infinity
  gapOverrides?: GapOverrides       // Feature A: tc/tf je Strom-Typ überschreiben
  pedestrians?:  PedestrianConfig   // Feature C: Fussgänger-Blocking-Events
}

const DEFAULTS: Required<Omit<StochasticConfig, 'gapOverrides' | 'pedestrians' | 'seed'>> = {
  runs: 150, T: 3600, tcSigma: 0.5,
  useCowan: true, cowanA: 7.0, cowanTm: 1.8,
  storageB: Infinity, storageD: Infinity,
}

type FullConfig = Required<Omit<StochasticConfig, 'gapOverrides' | 'pedestrians' | 'seed'>>
  & { gapOverrides: GapOverrides; pedestrians: PedestrianConfig | undefined; rng: () => number }

// Ungültige Werte (z. B. aus einer beschädigten Datei) durch Standardwerte ersetzen:
// NaN, negative Dauer oder Läufe würden die Ereignisschleifen nie beenden.
function resolveConfig(config: StochasticConfig): FullConfig {
  const pos = (v: number | undefined, d: number) =>
    typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : d
  return {
    runs:     Math.round(pos(config.runs, DEFAULTS.runs)),
    T:        pos(config.T, DEFAULTS.T),
    tcSigma:  typeof config.tcSigma === 'number' && Number.isFinite(config.tcSigma) && config.tcSigma >= 0
                ? config.tcSigma : DEFAULTS.tcSigma,
    useCowan: typeof config.useCowan === 'boolean' ? config.useCowan : DEFAULTS.useCowan,
    cowanA:   pos(config.cowanA, DEFAULTS.cowanA),
    cowanTm:  pos(config.cowanTm, DEFAULTS.cowanTm),
    // Stauraum: leer, 0 oder ungültig = unbegrenzt (gespeichertes Infinity kommt als null)
    storageB: pos(config.storageB, Infinity),
    storageD: pos(config.storageD, Infinity),
    gapOverrides: config.gapOverrides ?? {},
    pedestrians:  config.pedestrians ? normalizePedestrianConfig(config.pedestrians) : undefined,
    rng: typeof config.seed === 'number' && Number.isFinite(config.seed) ? seededRandom(config.seed) : Math.random,
  }
}

// Zufallsgenerator mit Startwert (mulberry32): gleiche Eingaben + gleicher seed → gleiches Resultat
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6D2B79F5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ── Grenz- und Folgezeitlücken ────────────────────────────────────────────────
// HBS 2015, Kap. S5 (Stadtstrassen), Tabelle S5-3 (Nummer gemäss Brilon-Vortrag 2016), Zeichen 205 StVO (Vorfahrt gewähren).
// Quelle: Brilon, W. (2016): HBS 2015 — L5 & S5: Knotenpunkte ohne Lichtsignalanlage – Vorfahrt.
//         Vortrag VSVI Baden-Württemberg, 23.02.2016.
// Nutzer kann Werte überschreiben.

export interface GapParams {
  tc: number
  tf: number
}

export const GAP_PARAMS: Record<GapStreamType, GapParams> = {
  mainLeft:  { tc: 5.5, tf: 2.8 },
  sideRight: { tc: 5.9, tf: 3.0 },
  sideCross: { tc: 6.7, tf: 3.3 },
  sideLeft:  { tc: 6.5, tf: 3.2 },
}

// ── Preset «SN 640 022 (implizit)» ────────────────────────────────────────────
// Rückgerechnete äquivalente Grenz-/Folgezeitlücken aus den Abb.-2-Kurven der
// SN 640 022: Siegloch  G − 90 = (3600/tf)·e^(−qpi·(tg − tf/2)/3600)  trifft mit
// diesen Werten jede Kurve (Vektorpfad des PDF) über qpi 0–1800 auf ≤ 3 PWE/h.
// Die Werte entsprechen der Verfahrensgeneration der Norm-Referenzen [6]/[7]
// (FGSV-Merkblatt / BMV Heft 669; t_f nahe HBS 2001).
// Achtung: Gap-Acceptance mit diesen Lücken reproduziert die Kurven OHNE die
// CH-Erhöhung +90 PWE/h (Abschnitt 9) — die Simulation rechnet damit konservativ.
export const GAP_PARAMS_SN640022: Record<GapStreamType, GapParams> = {
  mainLeft:  { tc: 5.8, tf: 2.5 },
  sideRight: { tc: 6.5, tf: 3.1 },
  sideCross: { tc: 6.5, tf: 4.0 },
  sideLeft:  { tc: 7.2, tf: 3.9 },
}

// ── Preset «SN 640 022 (mit +90)» ─────────────────────────────────────────────
// Rechengrössen für den Vergleich mit der Norm, keine gemessenen Zeitlücken: Die Werte
// sind so gewählt, dass die Kapazität nach Harders bei exponentiellen Lücken die
// Abb.-2-Kurven samt CH-Erhöhung (Ziff. 9, S. 4) über qpi 100–1800 Fz/h trifft
// (Kleinste Quadrate; mittlere Abweichung 3–6 %, höchstens 7–14 %). Der Sprung +90 lässt
// sich mit t_c, t_f nicht genau abbilden; die Abweichung liegt vor allem bei kleinem qpi.
export const GAP_PARAMS_SN640022_CH: Record<GapStreamType, GapParams> = {
  mainLeft:  { tc: 4.85, tf: 2.55 },
  sideRight: { tc: 5.2,  tf: 3.2 },
  sideCross: { tc: 5.05, tf: 4.05 },
  sideLeft:  { tc: 5.45, tf: 4.1 },
}

// Feature A: gapParamsFor mit optionalen Overrides
export function gapParamsFor(streamNumber: number, overrides?: GapOverrides): GapParams {
  const type: GapStreamType =
    (streamNumber === 1 || streamNumber === 7)  ? 'mainLeft'  :
    (streamNumber === 6 || streamNumber === 12) ? 'sideRight' :
    (streamNumber === 5 || streamNumber === 11) ? 'sideCross' :
    'sideLeft'
  const base = GAP_PARAMS[type]
  const ov   = overrides?.[type]
  const ok = (v: number | undefined): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0
  return { tc: ok(ov?.tc) ? ov.tc : base.tc, tf: ok(ov?.tf) ? ov.tf : base.tf }
}

// ── Zufallszahlen-Generatoren ─────────────────────────────────────────────────

// 1A: persönliche Grenzzeitlücke je Fahrzeug — lognormal mit Mittelwert `mean` und
// Standardabweichung `sigma` [s] (positiv, rechtsschief). sigma = 0 → konstant.
export function sampleLogNormal(mean: number, sigma: number, rng: () => number = Math.random): number {
  if (sigma <= 0) return mean
  const s2 = Math.log(1 + (sigma / mean) ** 2)
  const mu = Math.log(mean) - s2 / 2
  // Standardnormal nach Box-Muller (1 − u vermeidet log(0))
  const z = Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng())
  return Math.exp(mu + Math.sqrt(s2) * z)
}

function sampleTc(nominalTc: number, cfg: FullConfig): number {
  if (cfg.tcSigma <= 0) return nominalTc
  return Math.max(1.0, sampleLogNormal(nominalTc, cfg.tcSigma, cfg.rng))
}

// 1B: Cowan M3 (Cowan 1975; Troutbeck & Brilon, FHWA 1997, Kap. 8, Gl. 8.21–8.23)
export function sampleCowanM3(lambdaFz: number, A: number, tm: number, rng: () => number = Math.random): number {
  const q = lambdaFz
  const denom = 1 - tm * q
  if (denom <= 0) return tm
  const alpha = Math.exp(-A * q)
  if (rng() >= alpha) return tm
  return tm - Math.log(rng()) * denom / (alpha * q)
}

function sampleHeadway(lambdaFz: number, cfg: FullConfig): number {
  if (cfg.useCowan) return sampleCowanM3(lambdaFz, cfg.cowanA, cfg.cowanTm, cfg.rng)
  return -Math.log(cfg.rng()) / lambdaFz
}

// ── Hilfsfunktionen ───────────────────────────────────────────────────────────

type Interval = [number, number]
type ArmKey = 'A' | 'B' | 'C' | 'D'

// Hauptstrom und Fussgänger*innen laufen über das Periodenende hinaus weiter: Fahrzeuge,
// die bei T noch warten, finden danach weiterhin Konfliktverkehr vor (sonst würde die
// Restschlange bei Überlast unrealistisch schnell abgebaut). Ankünfte nur in [0, T].
function conflictHorizon(cfg: FullConfig): number {
  return 2 * cfg.T
}

// Sperrzeiten einer Querung: Gruppen kommen Poisson-verteilt und sperren je t_block
// Sekunden; überlappende Sperrungen werden zusammengefasst. Je Lauf wird jede Querung
// genau einmal gewürfelt: Dieselben Sperrzeiten halten den Hauptstrom an (Lücken für
// andere Ströme) und sperren die Fahrzeuge, die den Streifen selbst überfahren.
function generateBlocks(leg: PedestrianLegConfig, horizon: number, rng: () => number): Interval[] {
  const tBlock = pedBlockingTime(leg)
  // Häufigkeit der Sperrungen: Gruppen pro Sekunde = (fg / ρ) / 3600
  const lambda = leg.fg / (groupSize(leg) * 3600)
  const blocks: Interval[] = []
  let t = 0
  while (true) {
    t += -Math.log(rng()) / lambda
    if (t >= horizon) break
    const last = blocks[blocks.length - 1]
    if (last && t <= last[1]) last[1] = t + tBlock
    else blocks.push([t, t + tBlock])
  }
  return blocks
}

// Sortierte, überlappungsfreie Liste aus mehreren Intervall-Listen
function mergeIntervals(lists: Interval[][]): Interval[] {
  const filled = lists.filter(l => l.length > 0)
  if (filled.length === 0) return []
  if (filled.length === 1) return filled[0]
  const all = filled.flat().sort((a, b) => a[0] - b[0])
  const merged: Interval[] = [[all[0][0], all[0][1]]]
  for (let i = 1; i < all.length; i++) {
    const last = merged[merged.length - 1]
    if (all[i][0] <= last[1]) last[1] = Math.max(last[1], all[i][1])
    else merged.push([all[i][0], all[i][1]])
  }
  return merged
}

// ── Hauptstrom je Fahrtrichtung ───────────────────────────────────────────────
// Der Hauptstrom wird je Richtung und Fahrstreifen erzeugt, nicht als ein Strom mit
// der Rate qpi: Cowan M3 beschreibt einen einzelnen Fahrstreifen (Troutbeck & Brilon
// 1997, Gl. 8.21–8.23, S. 8-8). Die Überlagerung unabhängiger Fahrstreifen ist das
// Modell mehrerer Hauptströme (Kap. 8.5.1, S. 8-31); auf dem summierten qpi hätte M3
// ab 3600/t_m = 2000 Fz/h überhaupt keine Lücken mehr. Weil jedes Fahrzeug seine
// Herkunft kennt, hält eine Querung nur die Richtung an, die sie tatsächlich überfährt:
// Sie schafft genau den Strömen Lücken, zu denen sie parallel liegt, und sperrt die
// Ströme, die sie selbst überfahren (wie Szenario II in VSS 2011/308, Gl. 6, S. 61).

// Fahrzeugarten eines Hauptstrom-Arms; die Bitmasken je Nebenstrom bilden F1–F8 ab
const THROUGH_RIGHT = 1  // Geradeaus auf dem rechten Fahrstreifen (Fussnote 2, S. 3)
const THROUGH_OTHER = 2  // Geradeaus auf weiteren Fahrstreifen
const TURN_HALF     = 4  // Rechtsabbieger, die in 0,5·q3 bzw. 0,5·q9 zählen
const TURN_REST     = 8  // die übrigen Rechtsabbieger
const THROUGH = THROUGH_RIGHT | THROUGH_OTHER
const KINDS = [THROUGH_RIGHT, THROUGH_OTHER, TURN_HALF, TURN_REST]

interface MainArm {
  through: number      // q2 bzw. q8 [Fz/h]
  rightLane: number    // Anteil davon auf dem rechten Fahrstreifen [Fz/h]
  turn: number         // q3 bzw. q9 [Fz/h]
  ownTurnLane: boolean // Rechtsabbieger auf eigenem Streifen (kein Mischverkehr mit Geradeaus)
}

// Fahrzeuge eines Fahrstreifens, die in eine Sperrzeit fallen, fahren erst an deren Ende
// weiter und rücken im Abstand t_m nach. Ohne Sperrzeiten bleibt der Strom unverändert.
function releaseAfterBlocks(raw: number[], blocks: Interval[], tm: number): number[] {
  if (blocks.length === 0) return raw
  const out: number[] = []
  let bi = 0, prev = -Infinity, prevHeld = false
  for (const t0 of raw) {
    let t = t0
    if (prevHeld && t < prev + tm) t = prev + tm
    while (bi < blocks.length && blocks[bi][1] <= t) bi++
    if (bi < blocks.length && t >= blocks[bi][0]) t = blocks[bi][1]
    prevHeld = t > t0
    prev = t
    out.push(t)
  }
  return out
}

// Vorbeifahrten eines Fahrstreifens mit der Stärke rate [Fz/h]
function laneArrivals(rate: number, horizon: number, cfg: FullConfig): number[] {
  const out: number[] = []
  if (!(rate > 0)) return out
  const lambda = rate / 3600
  let t = 0
  while (true) {
    t += sampleHeadway(lambda, cfg)
    if (t >= horizon) break
    out.push(t)
  }
  return out
}

// Vorbeifahrten eines Hauptstrom-Arms am Knoten, getrennt nach Fahrzeugart
function generateMainArm(arm: MainArm, blocks: Interval[], cfg: FullConfig): Map<number, number[]> {
  const horizon = conflictHorizon(cfg)
  const byKind = new Map<number, number[]>(KINDS.map(k => [k, []]))
  const turnInRightLane = arm.ownTurnLane ? 0 : arm.turn
  const pTurn = turnInRightLane > 0 ? turnInRightLane / (arm.rightLane + turnInRightLane) : 0
  const turnKind = () => cfg.rng() < 0.5 ? TURN_HALF : TURN_REST

  // Rechter Fahrstreifen: Geradeaus und, ohne eigenen Streifen, die Rechtsabbieger
  const rightLane = releaseAfterBlocks(
    laneArrivals(arm.rightLane + turnInRightLane, horizon, cfg), blocks, cfg.cowanTm)
  for (const t of rightLane)
    byKind.get(cfg.rng() < pTurn ? turnKind() : THROUGH_RIGHT)!.push(t)
  // Weitere Geradeaus-Fahrstreifen und eigener Rechtsabbiegestreifen
  byKind.get(THROUGH_OTHER)!.push(...releaseAfterBlocks(
    laneArrivals(arm.through - arm.rightLane, horizon, cfg), blocks, cfg.cowanTm))
  if (arm.ownTurnLane) {
    for (const t of releaseAfterBlocks(laneArrivals(arm.turn, horizon, cfg), blocks, cfg.cowanTm))
      byKind.get(turnKind())!.push(t)
  }
  return byKind
}

function pick(byKind: Map<number, number[]>, mask: number): number[][] {
  return KINDS.filter(k => mask & k).map(k => byKind.get(k)!)
}

// Hauptstrom-Anteile je Nebenstrom nach F1–F8 mit den Fussnoten 1–3 (Ziff. 7, S. 3)
function mainConflictMasks(sn: number, flags: SN640022LaneFlags): { a: number; c: number } {
  const halfA = flags.armASeparateLane ? 0 : TURN_HALF              // 0,5·q3, Fn 1
  const halfC = flags.armCSeparateLane ? 0 : TURN_HALF              // 0,5·q9, Fn 1
  const fullA = flags.armATriangleIsland ? 0 : TURN_HALF | TURN_REST // q3, Fn 3
  const fullC = flags.armCTriangleIsland ? 0 : TURN_HALF | TURN_REST // q9, Fn 3
  switch (sn) {
    case 1:  return { a: 0, c: THROUGH | fullC }                     // F1
    case 7:  return { a: THROUGH | fullA, c: 0 }                     // F2
    case 6:  return { a: THROUGH_RIGHT | halfA, c: 0 }               // F3, Fn 2
    case 12: return { a: 0, c: THROUGH_RIGHT | halfC }               // F4, Fn 2
    case 5:  return { a: THROUGH | halfA, c: THROUGH | fullC }       // F5
    case 11: return { a: THROUGH | fullA, c: THROUGH | halfC }       // F6
    case 4:  return { a: THROUGH | halfA, c: THROUGH }               // F7
    default: return { a: THROUGH, c: THROUGH | halfC }               // F8 (Strom 10)
  }
}

// Nebenströme, deren Fahrzeuge in qpi zählen (F5–F8, q6/q12 nach Fussnote 4, S. 3)
function vehicleConflicts(sn: number, flags: SN640022LaneFlags): number[] {
  switch (sn) {
    case 5: case 11: return [1, 7]
    case 4:  return flags.armDRightIsland ? [1, 7, 11] : [1, 7, 11, 12]
    case 10: return flags.armBRightIsland ? [1, 7, 5] : [1, 7, 5, 6]
    default: return []
  }
}

// Zufahrtsarm je Nebenstrom und Querungen, die er an Abfahrt und Ankunft selbst überfährt
const ENTRY: Record<number, ArmKey> = { 1: 'A', 4: 'B', 5: 'B', 6: 'B', 7: 'C', 10: 'D', 11: 'D', 12: 'D' }
const CROSSES: Record<number, ArmKey[]> = {
  1: ['A', 'D'], 4: ['B', 'A'], 5: ['B', 'D'], 6: ['B', 'C'],
  7: ['C', 'B'], 10: ['D', 'C'], 11: ['D', 'B'], 12: ['D', 'A'],
}

// Lückensuche: ersten Zeitpunkt ab seekStart finden, an dem die Lücke bis zum nächsten
// Konfliktfahrzeug mindestens tc_i beträgt und keine Sperrzeit läuft. Fällt die Abfahrt
// in eine Sperrzeit, beginnt die Suche an deren Ende von vorne: Dann gilt wieder die
// Grenzzeitlücke, die vorher gefundene Lücke kann inzwischen zu kurz sein.
// usable[i] sagt, ob die Lücke vor conflicts[i] für diesen Strom frei ist (Rückstau
// höherrangiger Ströme, siehe gapAvailability); ohne Angabe sind alle Lücken frei.
export function findDeparture(
  seekStart: number, conflicts: Float64Array, tc_i: number, blocks: Interval[],
  usable?: Uint8Array,
): number {
  let start = seekStart
  while (true) {
    let lo = 0, hi = conflicts.length
    while (lo < hi) {
      const mid = (lo + hi) >>> 1
      if (conflicts[mid] <= start) lo = mid + 1
      else hi = mid
    }
    let ptr = lo, prev = start
    while (ptr < conflicts.length) {
      if (conflicts[ptr] - prev >= tc_i && (!usable || usable[ptr])) break
      prev = conflicts[ptr]
      ptr++
    }
    // Abfahrt bei Beginn der akzeptierten Lücke (Vorbeifahrt des letzten Konfliktfahrzeugs).
    // Nachrückende fahren frühestens t_f später und brauchen ab dort wieder t_c:
    // In einer Lücke der Länge t finden so n Fahrzeuge Platz, wenn t ≥ t_c + (n−1)·t_f
    // (Harders; Troutbeck & Brilon 1997, Kap. 8.4.1, S. 8-12).
    const departure = prev

    let iLo = 0, iHi = blocks.length
    while (iLo < iHi) {
      const m = (iLo + iHi) >>> 1
      if (blocks[m][1] <= departure) iLo = m + 1; else iHi = m
    }
    if (iLo >= blocks.length || departure <= blocks[iLo][0]) return departure
    start = blocks[iLo][1]
  }
}

// ── Auslastung der Haltelinie ─────────────────────────────────────────────────
// Bedienzeit eines Fahrzeugs = Zeit an erster Stelle der Warteschlange
// (von max(Ankunft, Abfahrt des Vordermanns) bis zur eigenen Abfahrt).
// Auslastung x = Σ Bedienzeiten / Simulationsdauer T. Bei x ≥ 1 reicht die Zeit
// nicht, um die in T ankommenden Fahrzeuge abzufertigen: Die Warteschlange wächst
// bis zum Periodenende (Überlastung, QS F). Entspricht x = q/L der Analytik.

// ── Haltelinien ───────────────────────────────────────────────────────────────
// Eine Haltelinie: HS-Linksabbieger je Richtung (eigener Streifen), NS-Arm gemeinsam.

interface LineStream {
  streamNumber: number
  q:   number
  tc:  number
  tf:  number
  mask: { a: number; c: number }
  vehicleConflicts: number[]
  crosses: ArmKey[]
}

interface Line {
  key:     string
  storage: number
  streams: LineStream[]
}

interface LineVehicle {
  arrival: number
  si:      number   // Index in Line.streams
  tc:      number
  carried: boolean  // aus dem vorangehenden Intervall übernommen
}

// Ankünfte einer Haltelinie: übernommene Fahrzeuge bei t = 0, dann Poisson-Prozess.
// Persönliche Grenzzeitlücke einmal je Fahrzeug.
function generateVehicles(line: Line, carried: number, cfg: FullConfig): LineVehicle[] {
  const totalQ = line.streams.reduce((s, st) => s + st.q, 0)
  const weights: number[] = []
  let cum = 0
  for (const s of line.streams) { cum += s.q / totalQ; weights.push(cum) }
  const streamAt = (r: number) => {
    const si = weights.findIndex(w => r < w)
    return si < 0 ? line.streams.length - 1 : si
  }
  const vehicle = (arrival: number, si: number, isCarried: boolean): LineVehicle =>
    ({ arrival, si, tc: sampleTc(line.streams[si].tc, cfg), carried: isCarried })

  const out: LineVehicle[] = []
  // Verteilt proportional zu q_i, bei t = 0
  for (let i = 0; i < carried; i++) out.push(vehicle(0, streamAt((i + 0.5) / carried), true))
  const lambda = totalQ / 3600
  let t = 0
  while (true) {
    t += -Math.log(cfg.rng()) / lambda
    if (t >= cfg.T) break
    out.push(vehicle(t, streamAt(cfg.rng()), false))
  }
  return out
}

interface LinePass {
  delays:     number[][]  // je Index in Line.streams
  busy:       number
  endBacklog: number      // Fahrzeuge, die erst nach T abfahren → Übertrag ins nächste Intervall
}

// Alle Fahrzeuge einer Haltelinie in Ankunftsreihenfolge abfertigen. Steht ein Fahrzeug
// bei Ankunft hinter einem Vorgänger, fährt es frühestens t_f nach dessen Abfahrt
// (Sättigungsabfluss 3600/t_f; Troutbeck & Brilon 1997, Kap. 8.4.1, S. 8-12); frei Einfahrende
// erhalten keinen t_f-Aufschlag.
function runLine(line: Line, vehicles: LineVehicle[], run: RunContext, usableOf: (s: LineStream, n: number) => Uint8Array | undefined, T: number): LinePass {
  const conflicts = line.streams.map(s => run.conflictsOf(s))
  const blocks    = line.streams.map(s => run.blocksOf(s))
  const usable    = line.streams.map((s, i) => usableOf(s, conflicts[i].length))
  const delays: number[][] = line.streams.map(() => [])
  const departures: number[] = []
  let nextFreeSlot = 0, sysStart = 0, busy = 0

  for (const v of vehicles) {
    while (sysStart < departures.length && departures[sysStart] <= v.arrival) sysStart++
    if (departures.length - sysStart >= line.storage) continue

    // <=: Übernommene Fahrzeuge stehen alle bei t = 0 und rücken einzeln nach
    const tf        = line.streams[v.si].tf
    const queued    = departures.length > 0 && v.arrival <= nextFreeSlot
    const seekStart = queued ? nextFreeSlot + tf : v.arrival
    const departure = findDeparture(seekStart, conflicts[v.si], v.tc, blocks[v.si], usable[v.si])

    // Übernommene Fahrzeuge: ihre Wartezeit gehört zum vorangehenden Intervall
    if (!v.carried) delays[v.si].push(departure - v.arrival)
    departures.push(departure)
    busy += departure - Math.max(v.arrival, nextFreeSlot)
    nextFreeSlot = departure
  }
  return { delays, busy, endBacklog: departures.filter(d => d > T).length }
}

// ── Ein Simulationslauf ───────────────────────────────────────────────────────

interface RunContext {
  conflictsOf: (s: LineStream) => Float64Array
  blocksOf:    (s: LineStream) => Interval[]
}

// Zufällige Umwelt eines Laufs: Jede Querung und jeder Hauptstrom wird genau einmal
// gewürfelt und gilt für alle Ströme. Die Nebenströme in qpi (q1, q7, q5, q6, q11, q12)
// zählen wie in F5–F8 als eigener, vom Hauptstrom unabhängiger Konfliktverkehr.
function generateRun(
  mainFlows: { a: MainArm; c: MainArm },
  legs: Partial<Record<ArmKey, PedestrianLegConfig>>,
  vehicleRates: Map<number, number>,
  cfg: FullConfig,
): RunContext {
  const horizon = conflictHorizon(cfg)
  const blocksAt: Record<ArmKey, Interval[]> = { A: [], B: [], C: [], D: [] }
  for (const k of ['A', 'B', 'C', 'D'] as const) {
    const leg = legs[k]
    if (leg) blocksAt[k] = generateBlocks(leg, horizon, cfg.rng)
  }
  const mainA = generateMainArm(mainFlows.a, blocksAt.A, cfg)
  const mainC = generateMainArm(mainFlows.c, blocksAt.C, cfg)
  const vehicleLanes = new Map<number, number[]>()
  for (const [sn, rate] of vehicleRates)
    vehicleLanes.set(sn, releaseAfterBlocks(laneArrivals(rate, horizon, cfg), blocksAt[ENTRY[sn]], cfg.cowanTm))

  return {
    conflictsOf: s => {
      const lists = [
        ...pick(mainA, s.mask.a), ...pick(mainC, s.mask.c),
        ...s.vehicleConflicts.map(h => vehicleLanes.get(h) ?? []),
      ]
      const out = new Float64Array(lists.reduce((n, l) => n + l.length, 0))
      let i = 0
      for (const l of lists) { out.set(l, i); i += l.length }
      return out.sort()
    },
    blocksOf: s => mergeIntervals(s.crosses.map(k => blocksAt[k])),
  }
}

// Grundleistungsfähigkeit eines Stroms in der Simulation: Abfahrten je Stunde bei
// dauernd besetzter Haltelinie. Mit Fussgänger*innen sind deren Sperrzeiten enthalten.
function saturatedDepartures(s: LineStream, run: RunContext, cfg: FullConfig): number {
  const conflicts = run.conflictsOf(s)
  const blocks    = run.blocksOf(s)
  let count = 0, t = 0
  while (true) {
    t = findDeparture(t, conflicts, sampleTc(s.tc, cfg), blocks)
    if (t >= cfg.T) return count
    count++
    t += s.tf
  }
}

// ── Statistik ─────────────────────────────────────────────────────────────────

// Klassengrenzen = QS-Grenzen der Tab. 3 (A < 10, B < 15, C < 25, D < 45 s), danach E
export const HIST_EDGES = [0, 10, 15, 25, 45, 60, 90, 120, Infinity]

export interface DelayStats {
  n: number
  mean: number
  stdDev: number
  p50: number
  p85: number
  p95: number
  freq: number[]
}

function computeStats(delays: number[]): DelayStats | null {
  const n = delays.length
  if (n === 0) return null

  const sorted = Float64Array.from(delays).sort()
  const mean = delays.reduce((s, d) => s + d, 0) / n
  const variance = delays.reduce((s, d) => s + (d - mean) ** 2, 0) / n

  const bins = HIST_EDGES.length - 1
  const counts = new Array<number>(bins).fill(0)
  for (const d of delays) {
    let b = 0
    while (b < bins - 1 && d >= HIST_EDGES[b + 1]) b++
    counts[b]++
  }

  return {
    n, mean, stdDev: Math.sqrt(variance),
    p50: sorted[Math.floor(n * 0.50)],
    p85: sorted[Math.floor(n * 0.85)],
    p95: sorted[Math.floor(n * 0.95)],
    freq: counts.map(c => c / n),
  }
}

// ── Ergebnis-Typen ────────────────────────────────────────────────────────────

export interface StochasticStreamResult {
  streamNumber: number
  name: string
  rang: number
  qpi: number
  stats: DelayStats | null
  // Auslastung der Haltelinie (siehe oben); NS-Ströme eines Arms teilen die Haltelinie
  utilization: number
}

export interface StochasticSN640022Result {
  streams: StochasticStreamResult[]
  runs: number
  durationMs: number
  config: StochasticConfig
}

// Feature D: Multi-Intervall-Typen
export interface SimInterval {
  label:       string       // z.B. "07:30–08:00"
  volumes:     number[][]  // PWE/h
  rawVolumes?: number[][]  // Fz/h (für qpi)
  T:           number       // Sekunden
}

export interface StochasticIntervalResult {
  label:     string
  result:    StochasticSN640022Result
  carryOver: number  // Durchschnittliche Fahrzeuge, die ins nächste Intervall übergehen
}

export interface StochasticMultiResult {
  intervals:       StochasticIntervalResult[]
  totalDurationMs: number
  config:          StochasticConfig
}

// ── Interne Haupt-Simulation ──────────────────────────────────────────────────

const CAPACITY_RUNS = 30  // Läufe für die Grundleistungsfähigkeit (siehe gapAvailability)

function runInternal(
  volumes: number[][],
  flags: SN640022LaneFlags,
  rawVolumes: number[][] | undefined,
  config: StochasticConfig,
  carried: Map<string, number>,
): { result: StochasticSN640022Result; endBacklog: Map<string, number> } | null {
  const analytical = analyzeSN640022(volumes, flags, rawVolumes)
  if (!analytical) return null

  const cfg = resolveConfig(config)
  const t0 = performance.now()
  const raw = rawVolumes ?? volumes
  const isCrossing = volumes.length === 4

  // Fussgänger-Konfigurationen je Arm; (fg > 0) ist auch für NaN falsch →
  // ungültige Eingaben wirken wie «kein Streifen»
  const peds = cfg.pedestrians
  const legs: Partial<Record<ArmKey, PedestrianLegConfig>> = {}
  for (const [key, leg] of [['A', peds?.armA], ['B', peds?.armB], ['C', peds?.armC], ['D', peds?.armD]] as const)
    if (leg?.enabled && leg.fg > 0) legs[key] = leg

  // Hauptstrom-Arme A und C (Fz/h)
  const q2 = raw[0][1], q3 = raw[0][2], q8 = raw[1][0], q9 = raw[1][3] ?? 0
  const mainFlows = {
    a: { through: q2, rightLane: flags.armAQ2Override ?? q2, turn: q3,
         ownTurnLane: flags.armASeparateLane || flags.armATriangleIsland },
    c: { through: q8, rightLane: flags.armCQ8Override ?? q8, turn: q9,
         ownTurnLane: flags.armCSeparateLane || flags.armCTriangleIsland },
  }
  // Nebenströme als Konfliktverkehr tieferer Ränge (Fz/h)
  const vehicleRates = new Map<number, number>(isCrossing
    ? [[1, raw[0][3]], [7, raw[1][2]], [5, raw[2][3]], [6, raw[2][1]], [11, raw[3][2]], [12, raw[3][0]]]
    : [[7, raw[1][2]]])

  const streamDefs = new Map<number, LineStream>(analytical.streams.map(s => {
    const { tc, tf } = gapParamsFor(s.streamNumber, cfg.gapOverrides)
    return [s.streamNumber, {
      streamNumber: s.streamNumber, q: s.volumePWE, tc, tf,
      mask: mainConflictMasks(s.streamNumber, flags),
      vehicleConflicts: vehicleConflicts(s.streamNumber, flags),
      crosses: CROSSES[s.streamNumber],
    }]
  }))
  const makeLine = (key: string, numbers: number[], storage: number): Line | null => {
    const streams = numbers.map(n => streamDefs.get(n)!).filter(s => s.q > 0)
    return streams.length > 0 ? { key, storage, streams } : null
  }
  const lines = (isCrossing
    ? [makeLine('1', [1], Infinity), makeLine('7', [7], Infinity),
       makeLine('B', [4, 5, 6], cfg.storageB), makeLine('D', [10, 11, 12], cfg.storageD)]
    : [makeLine('7', [7], Infinity), makeLine('B', [4, 6], cfg.storageB)])
    .filter((l): l is Line => l !== null)

  const newRun = () => generateRun(mainFlows, legs, vehicleRates, cfg)

  // Rückstau höherrangiger Ströme (Ziff. 11, S. 6): siehe gapAvailability
  const availability = gapAvailability(streamDefs, newRun, volumes, flags, rawVolumes, cfg)
  const usableOf = (s: LineStream, n: number): Uint8Array | undefined => {
    const p = availability.get(s.streamNumber) ?? 1
    if (p >= 1) return undefined
    const flagsOfGaps = new Uint8Array(n)
    for (let i = 0; i < n; i++) flagsOfGaps[i] = cfg.rng() < p ? 1 : 0
    return flagsOfGaps
  }

  const delaysOf = new Map<number, number[]>()
  const busy = new Map<string, number>()
  const backlog = new Map<string, number>()
  const vehiclesOf = (line: Line) => generateVehicles(line, carried.get(line.key) ?? 0, cfg)
  for (let i = 0; i < cfg.runs; i++) {
    const run = newRun()
    for (const line of lines) {
      const p = runLine(line, vehiclesOf(line), run, usableOf, cfg.T)
      busy.set(line.key, (busy.get(line.key) ?? 0) + p.busy)
      backlog.set(line.key, (backlog.get(line.key) ?? 0) + p.endBacklog)
      line.streams.forEach((s, si) => {
        const all = delaysOf.get(s.streamNumber) ?? []
        for (const d of p.delays[si]) all.push(d)
        delaysOf.set(s.streamNumber, all)
      })
    }
  }

  const streamUtil = new Map<number, number>()
  const endBacklog = new Map<string, number>()
  for (const line of lines) {
    for (const s of line.streams)
      streamUtil.set(s.streamNumber, (busy.get(line.key) ?? 0) / (cfg.runs * cfg.T))
    endBacklog.set(line.key, (backlog.get(line.key) ?? 0) / cfg.runs)
  }

  const streams: StochasticStreamResult[] = analytical.streams.map(s => ({
    streamNumber:   s.streamNumber,
    name:           s.name,
    rang:           s.rang,
    qpi:            s.qpi,
    stats:          computeStats(delaysOf.get(s.streamNumber) ?? []),
    utilization:    streamUtil.get(s.streamNumber) ?? 0,
  }))

  return {
    result: {
      streams, runs: cfg.runs,
      durationMs: performance.now() - t0,
      config,
    },
    endBacklog,
  }
}

// Rückstaukopplung analog F13–F20 (Ziff. 11, S. 6): Ein Nebenstrom kann eine Lücke nur
// nutzen, wenn die höherrangigen Ströme keinen Rückstau haben. Die Wahrscheinlichkeit
// dafür rechnet dieselbe Normrechnung wie der analytische Rechner, aber mit den
// simulierten Grundleistungsfähigkeiten (t_c, t_f, Lückenmodell, Fussgänger*innen).
// In der Simulation wird dann jede Lücke mit dieser Wahrscheinlichkeit als frei gezogen.
// Eine mikroskopische Kopplung (wartende Fahrzeuge sperren direkt) trifft die Norm nicht:
// Rang-2-Fahrzeuge warten gerade dann, wenn der Hauptstrom ohnehin keine Lücke bietet,
// und fahren gebündelt ab; die Kapazität von Strom 4 lag so bis zum 3,6-Fachen über L4.
function gapAvailability(
  streamDefs: Map<number, LineStream>, newRun: () => RunContext,
  volumes: number[][], flags: SN640022LaneFlags, rawVolumes: number[][] | undefined,
  cfg: FullConfig,
): Map<number, number> {
  const runs = Math.min(cfg.runs, CAPACITY_RUNS)
  const counts = new Map<number, number>()
  for (let i = 0; i < runs; i++) {
    const run = newRun()
    for (const [sn, s] of streamDefs)
      counts.set(sn, (counts.get(sn) ?? 0) + saturatedDepartures(s, run, cfg))
  }
  const G = (sn: number) => (counts.get(sn) ?? 0) * 3600 / (runs * cfg.T)
  const coupled = analyzeSN640022(volumes, flags, rawVolumes, G)!
  return new Map(coupled.streams.map(s =>
    [s.streamNumber, s.basicCapacity > 0 ? s.capacity / s.basicCapacity : 1]))
}

// ── Öffentliche API ───────────────────────────────────────────────────────────

export function runStochasticSN640022(
  volumes: number[][],
  flags: SN640022LaneFlags,
  rawVolumes?: number[][],
  config: StochasticConfig = {},
): StochasticSN640022Result | null {
  return runInternal(volumes, flags, rawVolumes, config, new Map())?.result ?? null
}

// Feature D: Mehrere Zeitintervalle mit Carry-over-Queue
export function runStochasticSN640022Multi(
  intervals: SimInterval[],
  flags: SN640022LaneFlags,
  config: StochasticConfig = {},
): StochasticMultiResult | null {
  if (intervals.length === 0) return null
  const t0 = performance.now()
  const results: StochasticIntervalResult[] = []
  // Noch wartende Fahrzeuge je Haltelinie (HS-Linksabbieger und NS-Arme)
  let backlog = new Map<string, number>()

  for (const iv of intervals) {
    const carried = new Map([...backlog].map(([k, v]) => [k, Math.round(v)]))
    const r = runInternal(iv.volumes, flags, iv.rawVolumes, { ...config, T: iv.T }, carried)
    if (!r) return null
    backlog = r.endBacklog
    results.push({
      label:     iv.label,
      result:    r.result,
      carryOver: Math.round([...backlog.values()].reduce((s, v) => s + v, 0)),
    })
  }

  return {
    intervals: results,
    totalDurationMs: performance.now() - t0,
    config,
  }
}
