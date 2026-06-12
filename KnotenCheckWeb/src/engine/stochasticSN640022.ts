// Stochastik-Simulation SN 640 022 — Einmündung & Kreuzung
// Stufe 1A: Erlang-verteiltes t_c (Fahrerheterogenität)
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
  rho:         number   // mittlere Gruppengrösse (1–5)
  mittelinsel: boolean  // Art. 47 Abs. 3 VRV: Insel teilt Streifen → Blockierzeit halbiert
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
  erlangK?:     number   // Erlang-Ordnung für t_c (1 = deterministisch), default 2
  useCowan?:    boolean  // Cowan-M3-Zeitlücken (Kolonnen) statt Exponential, default true
  cowanA?:      number   // Platoon-Faktor A (Troutbeck & Brilon, FHWA 1997, Kap. 8, Tab. 8.1), default 7.0
  cowanTm?:     number   // Physikalischer Mindestabstand t_m [s], default 1.8
  storageB?:    number   // Arm-B-Stauraum [Fz], default Infinity
  storageD?:    number   // Arm-D-Stauraum [Fz], default Infinity
  gapOverrides?: GapOverrides       // Feature A: tc/tf je Strom-Typ überschreiben
  pedestrians?:  PedestrianConfig   // Feature C: Fussgänger-Blocking-Events
}

const DEFAULTS: Required<Omit<StochasticConfig, 'gapOverrides' | 'pedestrians'>> = {
  runs: 150, T: 3600, erlangK: 2,
  useCowan: true, cowanA: 7.0, cowanTm: 1.8,
  storageB: Infinity, storageD: Infinity,
}

type FullConfig = Required<Omit<StochasticConfig, 'gapOverrides' | 'pedestrians'>>
  & { gapOverrides: GapOverrides; pedestrians: PedestrianConfig | undefined }

function resolveConfig(config: StochasticConfig): FullConfig {
  return {
    ...DEFAULTS,
    ...config,
    gapOverrides: config.gapOverrides ?? {},
    pedestrians:  config.pedestrians,
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
// SN 640 022: Siegloch-Fit  G − 90 = (3600/tf)·e^(−qpi·(tg − tf/2)/3600)  auf
// die digitalisierten Stützpunkte (sn640022Calculator.ts), Genauigkeit ±0.2–0.4 s.
// Die Werte entsprechen der Verfahrensgeneration der Norm-Referenzen [6]/[7]
// (FGSV-Merkblatt / BMV Heft 669; t_f nahe HBS 2001).
// Achtung: Gap-Acceptance mit diesen Lücken reproduziert die Kurven OHNE die
// CH-Erhöhung +90 PWE/h (Abschnitt 9) — die Simulation rechnet damit konservativ.
export const GAP_PARAMS_SN640022: Record<GapStreamType, GapParams> = {
  mainLeft:  { tc: 5.8, tf: 2.5 },
  sideRight: { tc: 6.1, tf: 3.3 },
  sideCross: { tc: 6.4, tf: 4.0 },
  sideLeft:  { tc: 6.9, tf: 4.1 },
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
  return { tc: ov?.tc ?? base.tc, tf: ov?.tf ?? base.tf }
}

// ── Zufallszahlen-Generatoren ─────────────────────────────────────────────────

// 1A: Erlang(k, mean) — persönliche Grenzzeitlücke pro Fahrer
export function sampleErlang(mean: number, k: number): number {
  const rate = k / mean
  let s = 0
  for (let i = 0; i < k; i++) s += -Math.log(Math.random()) / rate
  return s
}

function sampleTc(nominalTc: number, cfg: FullConfig): number {
  if (cfg.erlangK <= 1) return nominalTc
  return Math.max(1.0, sampleErlang(nominalTc, cfg.erlangK))
}

// 1B: Cowan M3 (Cowan 1975; Troutbeck & Brilon, FHWA 1997, Kap. 8, Gl. 8.21–8.23)
export function sampleCowanM3(lambdaFz: number, A: number, tm: number): number {
  const q = lambdaFz
  const denom = 1 - tm * q
  if (denom <= 0) return tm
  const alpha = Math.exp(-A * q)
  if (Math.random() >= alpha) return tm
  return tm - Math.log(Math.random()) * denom / (alpha * q)
}

function sampleHeadway(lambdaFz: number, cfg: FullConfig): number {
  if (cfg.useCowan) return sampleCowanM3(lambdaFz, cfg.cowanA, cfg.cowanTm)
  return -Math.log(Math.random()) / lambdaFz
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
  pedMod?: { lambdaFg: number; rho: number; mittelinsel: boolean },
): number[] {
  // Ohne Fussgänger: klassische Implementierung
  if (!pedMod || pedMod.lambdaFg <= 0) {
    const arr: number[] = []
    let t = 0
    while (true) {
      t += sampleHeadway(lambdaFz, cfg)
      if (t >= cfg.T) break
      arr.push(t)
    }
    return arr
  }

  const t_block = Math.max(5.0, pedMod.rho * 1.5) * (pedMod.mittelinsel ? 0.5 : 1.0)

  // Sperrzeiten [start, end] generieren
  const blocks: [number, number][] = []
  let tFg = 0
  while (true) {
    tFg += -Math.log(Math.random()) / pedMod.lambdaFg
    if (tFg >= cfg.T) break
    blocks.push([tFg, tFg + t_block])
  }

  // HS-Fahrzeuge generieren
  const rawArrivals: number[] = []
  let t = 0
  while (true) {
    t += sampleHeadway(lambdaFz, cfg)
    if (t >= cfg.T) break
    rawArrivals.push(t)
  }

  // Fahrzeuge in Sperrzeiten → Cluster nach Ende der Sperre
  const conflicts: number[] = []
  const blockBacklog = new Map<number, number>()  // blockEnd → Anzahl angestauter Fz

  for (const arr of rawArrivals) {
    let inBlock = false
    for (const [s, e] of blocks) {
      if (arr >= s && arr < e) {
        blockBacklog.set(e, (blockBacklog.get(e) ?? 0) + 1)
        inBlock = true
        break
      }
    }
    if (!inBlock) conflicts.push(arr)
  }

  // Cluster nach jedem Sperr-Ende einfügen
  for (const [blockEnd, count] of blockBacklog) {
    let clusterT = blockEnd
    for (let i = 0; i < count; i++) {
      if (clusterT < cfg.T) conflicts.push(clusterT)
      clusterT += cfg.cowanTm
    }
  }

  return conflicts.sort((a, b) => a - b)
}

// Direktes Blocking: Sperrzeiten generieren und zu disjunkten Intervallen zusammenführen.
// Jedes Arm-Leg erzeugt Poisson-verteilte Sperrzeiten; alle Arme werden kombiniert
// und überlappende Intervalle gemergt → sortierte disjunkte [start, end]-Liste.
function generateDirectBlocks(
  legs: (PedestrianLegConfig | undefined)[],
  T: number,
): [number, number][] {
  const raw: [number, number][] = []
  for (const leg of legs) {
    if (!leg?.enabled || leg.fg <= 0) continue
    const t_block = Math.max(5.0, leg.rho * 1.5) * (leg.mittelinsel ? 0.5 : 1.0)
    const lambda  = leg.fg / 3600
    let t = 0
    while (true) {
      t += -Math.log(Math.random()) / lambda
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
  seekStart: number, conflicts: number[], tc_i: number, tf: number,
  directBlocks?: [number, number][],
): number {
  let lo = 0, hi = conflicts.length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (conflicts[mid] <= seekStart) lo = mid + 1
    else hi = mid
  }
  let ptr = lo, prev = seekStart, waited = false
  while (ptr < conflicts.length) {
    if (conflicts[ptr] - prev >= tc_i) break
    prev = conflicts[ptr]
    ptr++
    waited = true
  }
  // Folgezeitlücke tf nur aufschlagen, wenn das Fahrzeug tatsächlich hinter einem
  // Konfliktfahrzeug einfädeln musste. Ein frei einfahrendes Fahrzeug (sofort
  // ausreichende Lücke ab seekStart) fährt ohne tf-Aufschlag ab → vermeidet eine
  // systematische Überschätzung der Wartezeit bei gering belasteten Strömen.
  let departure = waited ? prev + tf : prev

  // Direkte Sperrzeiten: Binärsuche auf das erste Intervall, das nach departure endet
  if (directBlocks && directBlocks.length > 0) {
    let idx = 0, iLo = 0, iHi = directBlocks.length
    while (iLo < iHi) {
      const m = (iLo + iHi) >>> 1
      if (directBlocks[m][1] <= departure) iLo = m + 1; else iHi = m
    }
    idx = iLo
    // Vorwärts durch getroffene Intervalle (disjunkt → maximal O(treffer))
    while (idx < directBlocks.length && departure > directBlocks[idx][0]) {
      departure = directBlocks[idx][1]
      idx++
    }
  }
  return departure
}

// ── HS-Ströme: unabhängige Simulation (mit 1A + 1B) ──────────────────────────

function simulateStream(
  q: number, qpi: number, tc: number, tf: number,
  cfg: FullConfig,
  pedMod?: { lambdaFg: number; rho: number; mittelinsel: boolean },
  crossingLegs?: (PedestrianLegConfig | undefined)[],
): number[] {
  if (q <= 0 || qpi <= 0) return []
  const lambdaC = qpi / 3600
  const lambdaN = q / 3600
  const delays: number[] = []

  for (let run = 0; run < cfg.runs; run++) {
    const conflicts    = generateConflicts(lambdaC, cfg, pedMod)
    const directBlocks = crossingLegs ? generateDirectBlocks(crossingLegs, cfg.T) : undefined
    let t = 0, nextFreeSlot = 0
    while (true) {
      t += -Math.log(Math.random()) / lambdaN
      if (t >= cfg.T) break
      const seekStart = Math.max(t, nextFreeSlot)
      const departure = findDeparture(seekStart, conflicts, sampleTc(tc, cfg), tf, directBlocks)
      delays.push(departure - t)
      nextFreeSlot = departure
    }
  }
  return delays
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
  pedMod?: { lambdaFg: number; rho: number; mittelinsel: boolean },
  preBacklog?: number,
): { delayMap: Map<number, number[]>; avgEndBacklog: number } {
  const delayMap = new Map<number, number[]>()
  for (const s of streams) delayMap.set(s.streamNumber, [])

  const active = streams.filter(s => s.q > 0 && s.qpi > 0)
  if (active.length === 0) return { delayMap, avgEndBacklog: 0 }

  const totalQ = active.reduce((s, st) => s + st.q, 0)
  const lambdaN = totalQ / 3600

  const weights: number[] = []
  let cum = 0
  for (const s of active) { cum += s.q / totalQ; weights.push(cum) }

  let totalEndBacklog = 0

  for (let run = 0; run < cfg.runs; run++) {
    const conflictsPerIdx   = active.map(s => generateConflicts(s.qpi / 3600, cfg, pedMod))
    const directBlocksPerIdx = active.map(s => generateDirectBlocks(s.crossingLegs, cfg.T))

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
      t += -Math.log(Math.random()) / lambdaN
      if (t >= cfg.T) break
      const r = Math.random()
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

      const seekStart = Math.max(arrival, nextFreeSlot)
      const tc_i = sampleTc(active[si].tc, cfg)
      const departure = findDeparture(seekStart, conflictsPerIdx[si], tc_i, active[si].tf, directBlocksPerIdx[si])

      // Wartezeit: nur für nicht-Pre-Backlog-Fahrzeuge mit arrival > 0 sinnvoll zu messen
      // Pre-Backlog-Fahrzeuge haben arrival=0, das Delay wäre irreführend → überspringen
      if (arrival > 0) {
        delayMap.get(active[si].streamNumber)!.push(departure - arrival)
      }
      departures.push(departure)
      nextFreeSlot = departure
    }

    // Feature D: Fahrzeuge die noch nach cfg.T abfahren = Carry-over für nächstes Intervall
    const endBacklog = departures.filter(d => d > cfg.T).length
    totalEndBacklog += endBacklog
  }

  return { delayMap, avgEndBacklog: totalEndBacklog / cfg.runs }
}

// ── Statistik ─────────────────────────────────────────────────────────────────

export const HIST_EDGES = [0, 10, 20, 30, 45, 60, 90, 120, Infinity]

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
  const legA = peds?.armA?.enabled && (peds.armA.fg > 0) ? peds.armA : undefined
  const legB = peds?.armB?.enabled && (peds.armB.fg > 0) ? peds.armB : undefined
  const legC = peds?.armC?.enabled && (peds.armC.fg > 0) ? peds.armC : undefined
  const legD = peds?.armD?.enabled && (peds.armD.fg > 0) ? peds.armD : undefined

  // Gap-Effekt (HS-Fussgängerstreifen erzeugen Lücken im Konfliktstrom):
  // Arm A → schafft Lücken in q2+q3 → profitieren: NS-B-Ströme (4,5,6) + Strom 7 (C→B)
  // Arm C → schafft Lücken in q8+q9 → profitieren: NS-D-Ströme (10,11,12) + Strom 1 (A→D)
  const pedModA = legA ? { lambdaFg: legA.fg / 3600, rho: legA.rho, mittelinsel: legA.mittelinsel } : undefined
  const pedModC = legC ? { lambdaFg: legC.fg / 3600, rho: legC.rho, mittelinsel: legC.mittelinsel } : undefined

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
    streamDelays.set(sn, simulateStream(s.volumePWE, s.qpi, tc, tf, cfg, hsPed, crossing))
  }

  // NS Arm B: simultan mit Carry-over
  const armBDefs = armBNums.map(makeArmDef).filter((d): d is ArmStreamDef => d !== null)
  if (armBDefs.length > 0) {
    const { delayMap, avgEndBacklog } = simulateArm(armBDefs, cfg.storageB, cfg, pedModA, preBacklogB)
    for (const [sn, delays] of delayMap) streamDelays.set(sn, delays)
    endBacklogB = avgEndBacklog
  }

  // NS Arm D: simultan mit Carry-over
  const armDDefs = armDNums.map(makeArmDef).filter((d): d is ArmStreamDef => d !== null)
  if (armDDefs.length > 0) {
    const { delayMap, avgEndBacklog } = simulateArm(armDDefs, cfg.storageD, cfg, pedModC, preBacklogD)
    for (const [sn, delays] of delayMap) streamDelays.set(sn, delays)
    endBacklogD = avgEndBacklog
  }

  const streams: StochasticStreamResult[] = analytical.streams.map(s => ({
    streamNumber:   s.streamNumber,
    name:           s.name,
    rang:           s.rang,
    qpi:            s.qpi,
    stats:          computeStats(streamDelays.get(s.streamNumber) ?? []),
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
