// Stochastik-Simulation SN 640 022 — Einmündung & Kreuzung
// Stufe 1A: lognormal gestreutes t_c (Fahrerheterogenität)
// Stufe 1B: Cowan M3 Zeitlücken (Kolonnenbildung im Hauptstrom)
// Stufe 2C: Simultane NS-Ströme (gemeinsame Haltlinie)
// Stufe 2D: Endlicher Stauraum
// Feature A: Konfigurierbare Grenz-/Folgezeitlücken (tc/tf) pro Strom-Typ
// Feature C: Fussgänger als Blocking-Events im Hauptstrom
// Feature D: Mehrere Zeitintervalle mit Carry-over-Queue
// Referenz: Troutbeck & Brilon, Traffic Flow Theory Kap. 8

import { analyzeSN640022 } from './sn640022Calculator'
import type { SN640022LaneFlags } from './types'

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
  enabled:     boolean  // Fussgängerstreifen am Arm vorhanden
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
  armA: PedestrianLegConfig   // HS-Arm A: beeinflusst NS-Arm-B-Ströme
  armC: PedestrianLegConfig   // HS-Arm C: beeinflusst NS-Arm-D-Ströme
  armB?: PedestrianLegConfig  // NS-Arm B: Direktsperre für Ströme mit Abfahrt/Ankunft an Arm B
  armD?: PedestrianLegConfig  // NS-Arm D: Direktsperre (nur 4-Arm)
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
    pedestrians:  config.pedestrians,
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
// HBS 2015, Kap. S5 (Stadtstrassen), Tabelle S5-5, Zeichen 205 StVO (Vorfahrt gewähren).
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

// Feature C: Fussgänger-Blocking-Events im Hauptstrom
// Fussgänger-Gruppen kommen Poisson-verteilt, blockieren den HS für t_block Sekunden.
// Während t_block gibt es eine erzwungene Lücke für NS-Fahrzeuge.
// HS-Fahrzeuge, die während t_block ankommen, werden danach als Cluster freigegeben.
// Mittelinsel (Art. 47 Abs. 3 VRV): Fussgänger queren nur eine Hälfte → t_block × 0.5.
function generateConflicts(
  lambdaFz: number,
  cfg: FullConfig,
  pedMod?: { lambdaFg: number; tBlock: number },
): number[] {
  const horizon = conflictHorizon(cfg)
  // Ohne Fussgänger: klassische Implementierung
  if (!pedMod || pedMod.lambdaFg <= 0) {
    const arr: number[] = []
    let t = 0
    while (true) {
      t += sampleHeadway(lambdaFz, cfg)
      if (t >= horizon) break
      arr.push(t)
    }
    return arr
  }

  const t_block = pedMod.tBlock

  // Sperrzeiten [start, end] generieren (aufsteigend); überlappende zusammenführen,
  // damit ein Fahrzeug erst am Ende der gesamten Sperrung freigegeben wird
  const blocks: [number, number][] = []
  let tFg = 0
  while (true) {
    tFg += -Math.log(cfg.rng()) / pedMod.lambdaFg
    if (tFg >= horizon) break
    const last = blocks[blocks.length - 1]
    if (last && tFg <= last[1]) last[1] = tFg + t_block
    else blocks.push([tFg, tFg + t_block])
  }

  // HS-Fahrzeuge generieren
  const rawArrivals: number[] = []
  let t = 0
  while (true) {
    t += sampleHeadway(lambdaFz, cfg)
    if (t >= horizon) break
    rawArrivals.push(t)
  }

  // Fahrzeuge in Sperrzeiten → Cluster nach Ende der Sperre
  const conflicts: number[] = []
  const blockBacklog = new Map<number, number>()  // blockEnd → Anzahl angestauter Fz

  // Ankünfte und Sperrzeiten sind beide aufsteigend → ein gemeinsamer Durchgang
  // (vorher: jede Ankunft gegen alle Sperrzeiten, bei vielen Fussgängern sehr langsam)
  let bi = 0
  for (const arr of rawArrivals) {
    while (bi < blocks.length && blocks[bi][1] <= arr) bi++
    if (bi < blocks.length && arr >= blocks[bi][0]) {
      const e = blocks[bi][1]
      blockBacklog.set(e, (blockBacklog.get(e) ?? 0) + 1)
    } else conflicts.push(arr)
  }

  // Cluster nach jedem Sperr-Ende einfügen
  for (const [blockEnd, count] of blockBacklog) {
    let clusterT = blockEnd
    for (let i = 0; i < count; i++) {
      if (clusterT < horizon) conflicts.push(clusterT)
      clusterT += cfg.cowanTm
    }
  }

  return conflicts.sort((a, b) => a - b)
}

// Hauptstrom und Fussgänger*innen laufen über das Periodenende hinaus weiter: Fahrzeuge,
// die bei T noch warten, finden danach weiterhin Konfliktverkehr vor (sonst würde die
// Restschlange bei Überlast unrealistisch schnell abgebaut). Ankünfte nur in [0, T].
function conflictHorizon(cfg: FullConfig): number {
  return 2 * cfg.T
}

// Direktes Blocking: Sperrzeiten generieren und zu disjunkten Intervallen zusammenführen.
// Jedes Arm-Leg erzeugt Poisson-verteilte Sperrzeiten; alle Arme werden kombiniert
// und überlappende Intervalle gemergt → sortierte disjunkte [start, end]-Liste.
function generateDirectBlocks(
  legs: (PedestrianLegConfig | undefined)[],
  T: number,
  rng: () => number,
): [number, number][] {
  const raw: [number, number][] = []
  for (const leg of legs) {
    if (!leg?.enabled || !(leg.fg > 0)) continue
    const t_block = pedBlockingTime(leg)
    // Häufigkeit der Sperrungen: Gruppen pro Sekunde = (fg / ρ) / 3600
    const lambda  = leg.fg / (groupSize(leg) * 3600)
    let t = 0
    while (true) {
      t += -Math.log(rng()) / lambda
      if (t >= T) break
      raw.push([t, t + t_block])
    }
  }
  if (raw.length === 0) return raw
  raw.sort((a, b) => a[0] - b[0])
  const merged: [number, number][] = [raw[0]]
  for (let i = 1; i < raw.length; i++) {
    const last = merged[merged.length - 1]
    if (raw[i][0] <= last[1]) { last[1] = Math.max(last[1], raw[i][1]) }
    else merged.push(raw[i])
  }
  return merged
}

// Lückensuche: ersten Zeitpunkt finden, ab dem eine Lücke ≥ tc_i existiert.
// directBlocks: sortierte disjunkte Sperrzeiten — Abfahrt darf nicht innerhalb liegen.
// Effizient via Binärsuche + linearem Vorwärtssprung über getroffene Intervalle.
function findDeparture(
  seekStart: number, conflicts: number[], tc_i: number,
  directBlocks?: [number, number][],
): number {
  let lo = 0, hi = conflicts.length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (conflicts[mid] <= seekStart) lo = mid + 1
    else hi = mid
  }
  let ptr = lo, prev = seekStart
  while (ptr < conflicts.length) {
    if (conflicts[ptr] - prev >= tc_i) break
    prev = conflicts[ptr]
    ptr++
  }
  // Abfahrt bei Beginn der akzeptierten Lücke (Vorbeifahrt des letzten Konfliktfahrzeugs).
  // Nachrückende fahren frühestens t_f später und brauchen ab dort wieder t_c:
  // In einer Lücke der Länge t finden so n Fahrzeuge Platz, wenn t ≥ t_c + (n−1)·t_f
  // (Harders; Troutbeck & Brilon 1997, Kap. 8). Früher wurde hier zusätzlich t_f
  // aufgeschlagen — das verlangte t_c + n·t_f und unterschätzte die Kapazität.
  let departure = prev

  // Direkte Sperrzeiten: Binärsuche auf das erste Intervall, das nach departure endet
  if (directBlocks && directBlocks.length > 0) {
    let iLo = 0, iHi = directBlocks.length
    while (iLo < iHi) {
      const m = (iLo + iHi) >>> 1
      if (directBlocks[m][1] <= departure) iLo = m + 1; else iHi = m
    }
    let idx = iLo
    // Vorwärts durch getroffene Intervalle (disjunkt → maximal O(treffer))
    while (idx < directBlocks.length && departure > directBlocks[idx][0]) {
      departure = directBlocks[idx][1]
      idx++
    }
  }
  return departure
}

// ── Auslastung der Haltelinie ─────────────────────────────────────────────────
// Bedienzeit eines Fahrzeugs = Zeit an erster Stelle der Warteschlange
// (von max(Ankunft, Abfahrt des Vordermanns) bis zur eigenen Abfahrt).
// Auslastung x = Σ Bedienzeiten / Simulationsdauer T. Bei x ≥ 1 reicht die Zeit
// nicht, um die in T ankommenden Fahrzeuge abzufertigen: Die Warteschlange wächst
// bis zum Periodenende (Überlastung, QS F). Entspricht x = q/L der Analytik.

// ── HS-Ströme: unabhängige Simulation (mit 1A + 1B) ──────────────────────────

function simulateStream(
  q: number, qpi: number, tc: number, tf: number,
  cfg: FullConfig,
  pedMod?: { lambdaFg: number; tBlock: number },
  crossingLegs?: (PedestrianLegConfig | undefined)[],
): { delays: number[]; utilization: number } {
  if (q <= 0) return { delays: [], utilization: 0 }
  const lambdaC = qpi / 3600
  const lambdaN = q / 3600
  const delays: number[] = []
  let busy = 0

  for (let run = 0; run < cfg.runs; run++) {
    const conflicts    = generateConflicts(lambdaC, cfg, pedMod)
    const directBlocks = crossingLegs ? generateDirectBlocks(crossingLegs, conflictHorizon(cfg), cfg.rng) : undefined
    let t = 0, nextFreeSlot = 0
    while (true) {
      t += -Math.log(cfg.rng()) / lambdaN
      if (t >= cfg.T) break
      // Steht das Fahrzeug bei Ankunft bereits hinter einem Vorgänger (Server belegt)?
      // Dann darf es frühestens t_f nach dessen Abfahrt einfahren — die Folgezeitlücke
      // taktet den Abfluss innerhalb einer grossen Lücke (Sättigungsabfluss 3600/t_f;
      // Troutbeck & Brilon 1997, Kap. 8.4.1: t_f = Kopffolge wartender Fahrzeuge in
      // derselben Hauptstromlücke). Frei einfahrende Fahrzeuge erhalten kein t_f.
      const queued    = t < nextFreeSlot
      const seekStart = queued ? nextFreeSlot + tf : t
      const departure = findDeparture(seekStart, conflicts, sampleTc(tc, cfg), directBlocks)
      delays.push(departure - t)
      busy += departure - Math.max(t, nextFreeSlot)
      nextFreeSlot = departure
    }
  }
  return { delays, utilization: busy / (cfg.runs * cfg.T) }
}

// ── NS-Arme: simultane Simulation (2C + 2D) ───────────────────────────────────

interface ArmStreamDef {
  streamNumber: number
  q:   number
  qpi: number
  tc:  number
  tf:  number
  // Fussgängerstreifen an Abfahrt- und Ankunftsarm dieses Stroms (Direktsperre)
  crossingLegs: (PedestrianLegConfig | undefined)[]
}

// pedMod: erzeugt Lücken im Konfliktstrom (Gap-Effekt durch HS-Fussgängerstreifen)
// preBacklog: Fahrzeuge aus vorangehendem Intervall
function simulateArm(
  streams: ArmStreamDef[],
  storage: number,
  cfg: FullConfig,
  pedMod?: { lambdaFg: number; tBlock: number },
  preBacklog?: number,
): { delayMap: Map<number, number[]>; avgEndBacklog: number; utilization: number } {
  const delayMap = new Map<number, number[]>()
  for (const s of streams) delayMap.set(s.streamNumber, [])

  const active = streams.filter(s => s.q > 0)
  if (active.length === 0) return { delayMap, avgEndBacklog: 0, utilization: 0 }
  let busy = 0

  const totalQ = active.reduce((s, st) => s + st.q, 0)
  const lambdaN = totalQ / 3600

  const weights: number[] = []
  let cum = 0
  for (const s of active) { cum += s.q / totalQ; weights.push(cum) }

  let totalEndBacklog = 0

  for (let run = 0; run < cfg.runs; run++) {
    const conflictsPerIdx   = active.map(s => generateConflicts(s.qpi / 3600, cfg, pedMod))
    const directBlocksPerIdx = active.map(s => generateDirectBlocks(s.crossingLegs, conflictHorizon(cfg), cfg.rng))

    // Feature D: Pre-Backlog — Fahrzeuge aus vorangehendem Intervall
    const preArr: { time: number; si: number }[] = []
    if (preBacklog && preBacklog > 0) {
      // Verteilt proportional zu q_i, bei t = 0
      for (let i = 0; i < preBacklog; i++) {
        const r = (i + 0.5) / preBacklog
        let si = weights.findIndex(w => r < w)
        if (si < 0) si = active.length - 1
        preArr.push({ time: 0, si })
      }
    }

    // Normale Ankünfte
    const arrivals: { time: number; si: number }[] = []
    let t = 0
    while (true) {
      t += -Math.log(cfg.rng()) / lambdaN
      if (t >= cfg.T) break
      const r = cfg.rng()
      let si = weights.findIndex(w => r < w)
      if (si < 0) si = active.length - 1
      arrivals.push({ time: t, si })
    }

    const allArrivals = [...preArr, ...arrivals]

    let nextFreeSlot = 0
    let sysStart = 0
    const departures: number[] = []

    for (const { time: arrival, si } of allArrivals) {
      while (sysStart < departures.length && departures[sysStart] <= arrival) sysStart++
      const inSystem = departures.length - sysStart

      if (inSystem >= storage) continue

      // Folgezeitlücke für nachrückende Wartende (wie simulateStream, Kap. 8.4.1):
      // ein bei Ankunft bereits anstehendes Fahrzeug fährt frühestens t_f nach der
      // Abfahrt des Vordermanns; frei Einfahrende ohne t_f-Aufschlag.
      const tf_i = active[si].tf
      const queued    = arrival < nextFreeSlot
      const seekStart = queued ? nextFreeSlot + tf_i : arrival
      const tc_i = sampleTc(active[si].tc, cfg)
      const departure = findDeparture(seekStart, conflictsPerIdx[si], tc_i, directBlocksPerIdx[si])

      // Wartezeit: nur für nicht-Pre-Backlog-Fahrzeuge mit arrival > 0 sinnvoll zu messen
      // Pre-Backlog-Fahrzeuge haben arrival=0, das Delay wäre irreführend → überspringen
      if (arrival > 0) {
        delayMap.get(active[si].streamNumber)!.push(departure - arrival)
      }
      departures.push(departure)
      busy += departure - Math.max(arrival, nextFreeSlot)
      nextFreeSlot = departure
    }

    // Feature D: Fahrzeuge die noch nach cfg.T abfahren = Carry-over für nächstes Intervall
    const endBacklog = departures.filter(d => d > cfg.T).length
    totalEndBacklog += endBacklog
  }

  return { delayMap, avgEndBacklog: totalEndBacklog / cfg.runs, utilization: busy / (cfg.runs * cfg.T) }
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

function runInternal(
  volumes: number[][],
  flags: SN640022LaneFlags,
  rawVolumes: number[][] | undefined,
  config: StochasticConfig,
  preBacklogB: number,
  preBacklogD: number,
): { result: StochasticSN640022Result; endBacklogB: number; endBacklogD: number } | null {
  const analytical = analyzeSN640022(volumes, flags, rawVolumes)
  if (!analytical) return null

  const cfg = resolveConfig(config)
  const t0 = performance.now()
  const n = volumes.length

  const hsNums   = n === 3 ? [7]          : [1, 7]
  const armBNums = n === 3 ? [4, 6]       : [4, 5, 6]
  const armDNums = n === 4 ? [10, 11, 12] : []

  // Fussgänger-Konfigurationen je Arm (undefined = kein Fussgängerstreifen)
  const peds = cfg.pedestrians
  // (fg > 0) ist auch für NaN falsch → ungültige Eingaben wirken wie «kein Streifen»
  const legA = peds?.armA?.enabled && (peds.armA.fg > 0) ? peds.armA : undefined
  const legB = peds?.armB?.enabled && (peds.armB.fg > 0) ? peds.armB : undefined
  const legC = peds?.armC?.enabled && (peds.armC.fg > 0) ? peds.armC : undefined
  const legD = peds?.armD?.enabled && (peds.armD.fg > 0) ? peds.armD : undefined

  // Gap-Effekt (HS-Fussgängerstreifen erzeugen Lücken im Konfliktstrom):
  // Arm A → schafft Lücken in q2+q3 → profitieren: NS-B-Ströme (4,5,6) + Strom 7 (C→B)
  // Arm C → schafft Lücken in q8+q9 → profitieren: NS-D-Ströme (10,11,12) + Strom 1 (A→D)
  // lambdaFg = Häufigkeit der Sperrungen [Gruppen/s] = (fg / ρ) / 3600; tBlock = Querungsdauer
  const pedModA = legA ? { lambdaFg: legA.fg / (groupSize(legA) * 3600), tBlock: pedBlockingTime(legA) } : undefined
  const pedModC = legC ? { lambdaFg: legC.fg / (groupSize(legC) * 3600), tBlock: pedBlockingTime(legC) } : undefined

  // Crossing-Zuweisung: jeder Strom wird an seinem Abfahrt- UND Ankunftsarm
  // direkt durch den dortigen Fussgängerstreifen gesperrt.
  // Abfahrtsarm / Ankunftsarm (nach SN 640 022-Strom-Nummerierung):
  //   1 (A→D): A, D  |  4 (B→A): B, A  |  5 (B→D): B, D  |  6 (B→C): B, C
  //   7 (C→B): C, B  | 10 (D→C): D, C  | 11 (D→B): D, B  | 12 (D→A): D, A
  const crossings: Record<number, (PedestrianLegConfig | undefined)[]> = {
    1:  [legA, legD],
    4:  [legB, legA],
    5:  [legB, legD],
    6:  [legB, legC],
    7:  [legC, legB],
    10: [legD, legC],
    11: [legD, legB],
    12: [legD, legA],
  }

  const makeArmDef = (sn: number): ArmStreamDef | null => {
    const s = analytical.streams.find(x => x.streamNumber === sn)
    if (!s) return null
    const { tc, tf } = gapParamsFor(sn, cfg.gapOverrides)
    return { streamNumber: sn, q: s.volumePWE, qpi: s.qpi, tc, tf, crossingLegs: crossings[sn] ?? [] }
  }

  const streamDelays = new Map<number, number[]>()
  const streamUtil   = new Map<number, number>()
  let endBacklogB = 0
  let endBacklogD = 0

  // HS-Ströme: unabhängige Simulation
  // Strom 7 (C→B): Gap-Effekt von Arm A; Direktsperre durch Arm C + Arm B
  // Strom 1 (A→D): Gap-Effekt von Arm C; Direktsperre durch Arm A + Arm D
  for (const sn of hsNums) {
    const s = analytical.streams.find(x => x.streamNumber === sn)
    if (!s) continue
    const { tc, tf } = gapParamsFor(sn, cfg.gapOverrides)
    const hsPed     = sn === 7 ? pedModA : sn === 1 ? pedModC : undefined
    const crossing  = crossings[sn] ?? []
    const { delays, utilization } = simulateStream(s.volumePWE, s.qpi, tc, tf, cfg, hsPed, crossing)
    streamDelays.set(sn, delays)
    streamUtil.set(sn, utilization)
  }

  // NS Arm B: simultan mit Carry-over
  const armBDefs = armBNums.map(makeArmDef).filter((d): d is ArmStreamDef => d !== null)
  if (armBDefs.length > 0) {
    const { delayMap, avgEndBacklog, utilization } = simulateArm(armBDefs, cfg.storageB, cfg, pedModA, preBacklogB)
    for (const [sn, delays] of delayMap) { streamDelays.set(sn, delays); streamUtil.set(sn, utilization) }
    endBacklogB = avgEndBacklog
  }

  // NS Arm D: simultan mit Carry-over
  const armDDefs = armDNums.map(makeArmDef).filter((d): d is ArmStreamDef => d !== null)
  if (armDDefs.length > 0) {
    const { delayMap, avgEndBacklog, utilization } = simulateArm(armDDefs, cfg.storageD, cfg, pedModC, preBacklogD)
    for (const [sn, delays] of delayMap) { streamDelays.set(sn, delays); streamUtil.set(sn, utilization) }
    endBacklogD = avgEndBacklog
  }

  const streams: StochasticStreamResult[] = analytical.streams.map(s => ({
    streamNumber:   s.streamNumber,
    name:           s.name,
    rang:           s.rang,
    qpi:            s.qpi,
    stats:          computeStats(streamDelays.get(s.streamNumber) ?? []),
    utilization:    streamUtil.get(s.streamNumber) ?? 0,
  }))

  return {
    result: {
      streams, runs: cfg.runs,
      durationMs: performance.now() - t0,
      config,
    },
    endBacklogB,
    endBacklogD,
  }
}

// ── Öffentliche API ───────────────────────────────────────────────────────────

export function runStochasticSN640022(
  volumes: number[][],
  flags: SN640022LaneFlags,
  rawVolumes?: number[][],
  config: StochasticConfig = {},
): StochasticSN640022Result | null {
  return runInternal(volumes, flags, rawVolumes, config, 0, 0)?.result ?? null
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
  let backlogB = 0
  let backlogD = 0

  for (const iv of intervals) {
    const r = runInternal(
      iv.volumes, flags, iv.rawVolumes,
      { ...config, T: iv.T },
      Math.round(backlogB),
      Math.round(backlogD),
    )
    if (!r) return null
    backlogB = r.endBacklogB
    backlogD = r.endBacklogD
    results.push({
      label:     iv.label,
      result:    r.result,
      carryOver: Math.round(backlogB + backlogD),
    })
  }

  return {
    intervals: results,
    totalDurationMs: performance.now() - t0,
    config,
  }
}
