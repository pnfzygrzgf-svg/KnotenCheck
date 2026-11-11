// VSS 2011/308 — Verkehrsablauf an ungesteuerten Knoten innerorts
// Kap. 5: Pro-Strom-Kapazität mit Einfahrts- und Ausfahrts-Fg
// Methodik nach Kap. 5.1 (Abb. 22/23, Gl. 5/6/12)
// Menendez / Guler / Puffe, September 2015

import type { LevelOfService } from './types'
import { classifyLOS, worstLOS } from './levelOfService'
import { resolveQuerung, type Querung } from './querung'

export type RoadType = 'HS' | 'NS' | 'equal'

export type { LevelOfService, Querung }

// ── Sättigungsflüsse (Tab. 8 / Tab. 13) ──────────────────────────────────────
const S_M1 = 1750  // Rang 1 Fz/h (empirisch; VSS 2008/301 hatte 1800)
const S_M2 = 1650  // Rang 2 Fz/h (empirisch; VSS 2008/301 hatte 1500)
const S_FG = 900   // Fg/h (ρ=1)

// ── Eingabe ───────────────────────────────────────────────────────────────────

export interface ArmInput {
  name:     string
  roadType: RoadType  // HS = Vortritt (Rang 1), NS = Rang 2, equal = gleicher Rang
  right:    number    // Fz/h
  straight: number    // Fz/h
  left:     number    // Fz/h
  fg:          number   // Fg/h an Fussgängerstreifen (0 = kein FG-Streifen)
  rho?:        number   // mittlere Gruppengrösse gemeinsam querender Fg (1–5); S_Fg = 900 × rho (Tab. 9)
  mittelinsel?: boolean // Fussgängerstreifen durch Verkehrsinsel unterteilt (Art. 47 Abs. 3 VRV)
  // Querungsart (engine/querung.ts). Fehlt das Feld (ältere Dateien), gilt fg > 0 → 'fgs',
  // sonst 'keine'. Trottoirüberfahrt nur an NS-Armen; gerechnet wie ein Fussgängerstreifen
  // (Annahme, VSS 2011/308 kennt sie nicht), immer ohne Mittelinsel.
  querung?:    Querung
}

// Querung bereinigen, ohne die Rechnung zu ändern: 'keine' → kein Fussgängervolumen;
// Trottoirüberfahrt nur an NS-Armen (sonst Fussgängerstreifen) und nie mit Mittelinsel.
export function normalizeArm308(arm: ArmInput): ArmInput & { querung: Querung } {
  const querung = resolveQuerung(arm.querung, arm.fg > 0, arm.roadType === 'NS')
  return {
    ...arm,
    querung,
    fg:          querung === 'keine' ? 0 : arm.fg,
    mittelinsel: querung === 'trottoirueberfahrt' ? false : arm.mittelinsel,
  }
}

export interface VSS308Input {
  type: '3arm' | '4arm'
  arms: ArmInput[]    // [0]=A(HS), [1]=C(HS), [2]=B(NS), [3]=D(NS, 4-Arm)
}

// ── Strom-Topologie ───────────────────────────────────────────────────────────
// 4-Arm-Geometrie: A=West, C=Ost, B=Süd, D=Nord
// Von A (ostwärts fahrend): rechts=B, gerade=C, links=D
// Von C (westwärts fahrend): rechts=D, gerade=A, links=B
// Von B (nordwärts fahrend, Blick Nord): rechts=C, gerade=D, links=A
// Von D (südwärts fahrend, Blick Süd):  rechts=A, gerade=B, links=C
// toArmIndex=-1: kein Zielarm (Abbiegemanöver ohne Gegenarm im 3-Arm)

interface StreamDef {
  fromArmIndex: number
  movement:     'right' | 'straight' | 'left'
  toArmIndex:   number
}

const STREAM_DEFS: Record<'3arm' | '4arm', StreamDef[]> = {
  '3arm': [
    { fromArmIndex: 0, movement: 'straight', toArmIndex:  1 }, // A→C
    { fromArmIndex: 0, movement: 'right',    toArmIndex:  2 }, // A→B
    { fromArmIndex: 0, movement: 'left',     toArmIndex: -1 }, // A→? (kein Gegenarm)
    { fromArmIndex: 1, movement: 'straight', toArmIndex:  0 }, // C→A
    { fromArmIndex: 1, movement: 'left',     toArmIndex:  2 }, // C→B
    { fromArmIndex: 1, movement: 'right',    toArmIndex: -1 }, // C→? (kein Gegenarm)
    { fromArmIndex: 2, movement: 'left',     toArmIndex:  0 }, // B→A
    { fromArmIndex: 2, movement: 'right',    toArmIndex:  1 }, // B→C
  ],
  '4arm': [
    { fromArmIndex: 0, movement: 'right',    toArmIndex:  2 }, // A→B
    { fromArmIndex: 0, movement: 'straight', toArmIndex:  1 }, // A→C
    { fromArmIndex: 0, movement: 'left',     toArmIndex:  3 }, // A→D
    { fromArmIndex: 1, movement: 'right',    toArmIndex:  3 }, // C→D
    { fromArmIndex: 1, movement: 'straight', toArmIndex:  0 }, // C→A
    { fromArmIndex: 1, movement: 'left',     toArmIndex:  2 }, // C→B
    { fromArmIndex: 2, movement: 'right',    toArmIndex:  1 }, // B→C
    { fromArmIndex: 2, movement: 'straight', toArmIndex:  3 }, // B→D
    { fromArmIndex: 2, movement: 'left',     toArmIndex:  0 }, // B→A
    { fromArmIndex: 3, movement: 'right',    toArmIndex:  0 }, // D→A
    { fromArmIndex: 3, movement: 'straight', toArmIndex:  2 }, // D→B
    { fromArmIndex: 3, movement: 'left',     toArmIndex:  1 }, // D→C
  ],
}

const ARM_LABEL = ['A', 'C', 'B', 'D']

function streamId(from: number, to: number): string {
  return `${ARM_LABEL[from]}→${to >= 0 ? ARM_LABEL[to] : '?'}`
}

function getFlow(arm: ArmInput, m: 'right' | 'straight' | 'left'): number {
  return m === 'right' ? arm.right : m === 'straight' ? arm.straight : arm.left
}

// ── β-Berechnung (Abb. 23, Gl. 12) ───────────────────────────────────────────
// Abbiegende Fz oder Fg senkrecht (höher rangiert): βᵢ = (1−yᵢ)³
function betaCubic(y: number): number {
  return Math.max(0, (1 - y) ** 3)
}

// Sättigungsgrad der Fussgänger*innen an einem Fussgängerstreifen.
// Art. 47 Abs. 3 VRV: bei Mittelinsel gilt jede Hälfte als selbständiger Streifen →
// Fahrzeuge müssen nur Fg auf der fahrzeugnahen Hälfte Vortritt gewähren → Q_Fg / 2
function yFg(arm: ArmInput): number {
  const fgEff = arm.fg * (arm.mittelinsel ? 0.5 : 1)
  return fgEff > 0 ? fgEff / (S_FG * (arm.rho ?? 1)) : 0
}

// ── Ergebnis-Typen ────────────────────────────────────────────────────────────

export interface StreamResult {
  id:                string            // 'A→C', 'B→A', etc.
  fromArmIndex:      number
  toArmIndex:        number            // -1 = kein Zielarm
  movement:          'right' | 'straight' | 'left'
  roadType:          RoadType
  Q:                 number            // Strom-Belastung [Fz/h]
  beta:              number            // β dieses Stroms (Produkt der senkrechten βᵢ)
  scenario:          'I' | 'II'        // Kapazitätsform nach Abb. 22/35
  yParallel:         number            // Σy der parallelen höherrangigen Fg-Ströme (Szenario II)
  saturation:        number            // S [Fz/h]
  capacity:          number            // L: Szenario I = S·β; Szenario II = S·y_par + S·(1−y_par)·β [Fz/h]
  utilizationDegree: number            // x = Q / L
  delay:             number            // w [s]
  queue:             number            // k [Fz]
  levelOfService:    LevelOfService
}

export interface ArmResult {
  armIndex:          number
  name:              string
  roadType:          RoadType
  querung:           Querung           // Querungsart der Fussgänger*innen an diesem Arm
  qFz:               number            // Q = right+straight+left [Fz/h]
  qFg:               number            // Q_Fg [Fg/h]
  saturation:        number            // S [Fz/h]
  beta:              number            // Volumen-gewichtetes Mittel (nur Anzeige)
  capacity:          number            // L_Arm = ΣQ / x_Arm (Mischstreifen) [Fz/h]
  utilizationDegree: number            // x_Arm = Σ Q_i / L_i
  delay:             number            // Wartezeit aus ΣQ und L_Arm [s]
  queue:             number            // Staulänge des Arms [Fz]
  levelOfService:    LevelOfService
  streams:           StreamResult[]   // Per-Strom-Ergebnisse
}

export interface VSS308Result {
  arms:                  ArmResult[]
  streams:               StreamResult[]  // flache Liste aller Ströme
  overallLevelOfService: LevelOfService
}

// ── Wartezeit nach Gl. 1, S. 18, wiederholt auf S. 62 (VSS 2011/308) ───────────────────────────────
// w(x,Q) = 900 × [(x−1) − 4C·(x/Q) + √((x−1)² + 8C·(x+1+2C·(x/Q)) / (Q/x))]
// C = 0.5 für Rang 1, C = 1.0 für Rang 2 und gleicher Rang
export function computeDelay(Q: number, L: number, C: number): number {
  if (Q <= 0) return 0        // ohne Verkehr keine Wartezeit, auch wenn L = 0 ist
  if (L <= 0) return Infinity
  const x = Q / L
  if (x >= 1) return Infinity
  const xDivQ  = x / Q
  const QDivX  = Q / x
  const inner  = (x - 1) ** 2 + 8 * C * (x + 1 + 2 * C * xDivQ) / QDivX
  return 900 * ((x - 1) - 4 * C * xDivQ + Math.sqrt(inner))
}

// ── Qualitätsstufen ───────────────────────────────────────────────────────────
// Der Bericht verweist für die Stufen auf das «LOS-Konzept [5]» (S. 86); [5] ist SN 640 022. Es gelten darum die Grenzen von deren
// Tab. 3 (S. 10): A < 10 s · B 10–15 s · C 15–25 s · D 25–45 s · E > 45 s · F Überlast (Entscheid vom 11.11.2026, vorher Grenzen der SN 640 024a)
export const computeLOS = (delay: number): LevelOfService => classifyLOS(delay, 0)

// ── Hauptberechnung ───────────────────────────────────────────────────────────

export function calculateVSS308(input: VSS308Input): VSS308Result {
  const arms = input.arms.map(normalizeArm308)
  const defs = STREAM_DEFS[input.type]

  // Belastung eines Arms: nur Ströme mit Zielarm. Im 3-Arm gibt es A-links und
  // C-rechts nicht; Werte in diesen Feldern (z. B. aus dem 4-Arm) zählen nicht.
  const armFlow = (i: number) => defs
    .filter(d => d.fromArmIndex === i && d.toArmIndex >= 0)
    .reduce((s, d) => s + getFlow(arms[i], d.movement), 0)

  const oppositeHS = (i: number) => {
    const j = i === 0 ? 1 : i === 1 ? 0 : -1
    return j >= 0 && arms[j]?.roadType === 'HS' ? j : -1
  }

  // Rang eines HS-Stroms: Rang 1 (S = 1750, C = 0.5) hat nur, wer niemandem Vortritt
  // gewähren muss (Tab. 25, S. 58; C: S. 62). Wer Fussgänger*innen Vortritt gewährt, ist
  // nachrangig: Im Berichtsbeispiel hat Fz2 S = 1650 und C = 1 (Tab. 26, S. 68). Das gilt
  // auch für den HS-Linksabbieger gegenüber dem Gegenverkehr.
  const yieldsToFg = (d: StreamDef) => yFg(arms[d.fromArmIndex]) > 0
    || (d.toArmIndex >= 0 && yFg(arms[d.toArmIndex]) > 0)
  const hsIsRank1 = (d: StreamDef) => {
    const turnsAcross = d.movement === 'left' && d.toArmIndex >= 0 && oppositeHS(d.fromArmIndex) >= 0
    return !yieldsToFg(d) && !turnsAcross
  }
  // Sättigungsgrad von HS-Strömen als Konfliktverkehr: y = Q / S mit dem S des Stroms selbst (Tab. 13, S. 39; Beispiel Tab. 26, S. 68).
  // Rang 1 hat S = 1750; wer Fussgänger*innen oder als Linksabbieger dem Gegenverkehr Vortritt gewährt, S = 1650.
  const ySum = (ds: StreamDef[]) =>
    ds.reduce((s, d) => s + getFlow(arms[d.fromArmIndex], d.movement) / (hsIsRank1(d) ? S_M1 : S_M2), 0)

  // Gesamte HS-Belastung für NS-β (konfligierende Ströme aus den HS-Armen)
  const yHS = ySum(defs.filter(d => d.toArmIndex >= 0 && arms[d.fromArmIndex].roadType === 'HS'))

  // ── Per-Strom-Berechnung (Kap. 5, Szenario I: L = S × β) ─────────────────
  // Szenario I gilt für reine Fz/Fg-Knoten: kein paralleler höherrangiger Strom
  // (kein Tram, kein Bus → Abb. 22 führt immer zu Szenario I)
  const allStreams: StreamResult[] = defs.map(def => {
    const fromArm  = arms[def.fromArmIndex]
    const toArm    = def.toArmIndex >= 0 ? arms[def.toArmIndex] : null
    const Q        = toArm ? getFlow(fromArm, def.movement) : 0
    const roadType = fromArm.roadType

    // Senkrechte Fg-Ströme: Einfahrt (fromArm) + Ausfahrt (toArm)
    // Fg hat Vortritt über Fz → β_Fg = (1−y_Fg)³  (Abb. 23, Gl. 8)
    const y_FgEntry = yFg(fromArm)
    const y_FgExit  = toArm ? yFg(toArm) : 0

    // Szenario II (Abb. 22/35, Gl. 6): Fussgängerstreifen auf HS-Armen, die dieser Strom
    // nicht selbst überfährt, sind parallele höherrangige Ströme. Während sie belegt sind
    // (Zeitanteil y), blockieren sie den senkrechten HS-Konfliktverkehr und verschaffen
    // dem Strom Zeitfenster: L = S·y_par + S·(1−y_par)·β (vgl. L_Fz1, S. 64)
    const parallelFg = () => {
      let y = 0
      for (let h = 0; h < arms.length; h++) {
        if (arms[h].roadType !== 'HS' || h === def.fromArmIndex || h === def.toArmIndex) continue
        y += yFg(arms[h])
      }
      return Math.min(1, y)
    }

    let beta: number
    let saturation: number
    let C: number
    let scenario: 'I' | 'II' = 'I'
    let yParallel = 0
    let betaGegenNS = 1   // nur Linksabbieger der Nebenstrasse an der Kreuzung, siehe unten

    if (roadType === 'HS') {
      // Senkrechte höherrangige Ströme = Fg-Entry + Fg-Exit
      // β = (1−y_FgEntry)³ × (1−y_FgExit)³   (Gl. 12, Abb. 23 Typ 8)
      // Szenario I: Die senkrechten Vortrittsströme sind Fussgänger — kein
      // paralleler Modus blockiert Fussgänger (vgl. Berichtsbeispiel L_Fz2 = S·β, S. 65).
      beta = betaCubic(y_FgEntry) * betaCubic(y_FgExit)
      const rank1 = hsIsRank1(def)
      saturation = rank1 ? S_M1 : S_M2
      C = rank1 ? 0.5 : 1.0
      // Linksabbieger von der HS: muss dem Gegenverkehr (Geradeaus + Rechts des
      // gegenüberliegenden HS-Arms, vgl. SN 640 022 F1/F2) Vortritt gewähren →
      // abbiegendes Fahrzeug (Tab. 25, S. 58): β_i = (1−y_gegen)³. Dieser Konfliktverkehr
      // wird von Fg auf dem Gegenarm angehalten, die der Linksabbieger selbst nicht
      // überfährt → paralleler höherrangiger Strom, Szenario II wie bei den NS-Strömen.
      const oppIdx = oppositeHS(def.fromArmIndex)
      if (def.movement === 'left' && toArm && oppIdx >= 0) {
        const yOpp = ySum(defs.filter(d =>
          d.fromArmIndex === oppIdx && d.toArmIndex >= 0 && d.movement !== 'left'))
        beta *= betaCubic(yOpp)
        if (yOpp > 0) {
          yParallel = parallelFg()
          if (yParallel > 0) scenario = 'II'
        }
      }
    } else if (roadType === 'NS') {
      // Rang 2: senkrechte höherrangige Ströme = HS-Fz (gesamt) + Fg-Entry + Fg-Exit
      beta = betaCubic(yHS) * betaCubic(y_FgEntry) * betaCubic(y_FgExit)
      saturation = S_M2
      C = 1.0
      if (yHS > 0) {
        yParallel = parallelFg()
        if (yParallel > 0) scenario = 'II'
      }
      // Linksabbieger der Nebenstrasse an der Kreuzung: muss auch dem Gegenverkehr der gegenüberliegenden Nebenstrasse (Geradeaus
      // und Rechts) Vortritt gewähren, wie Strom 4 gegen 11 und 12 in SN 640 022 (Ziffer 7, S. 3). Der Bericht nennt den Fall nicht
      // eigens; nach Gl. 12 (S. 61) zählt jeder kreuzende Strom mit Vortritt, gegen abbiegende Fahrzeuge mit (1−y)³ (Tab. 25, S. 58).
      // Annahme: y mit S = 1650, weil die Ströme der Gegenseite selbst nachrangig sind. Fussgängerstreifen auf der Hauptstrasse
      // halten diesen Gegenverkehr nicht an: Der Faktor wirkt darum auf die ganze Leistungsfähigkeit, auch im Szenario II.
      const gegen = def.fromArmIndex === 2 ? 3 : def.fromArmIndex === 3 ? 2 : -1
      if (def.movement === 'left' && toArm && gegen >= 0 && gegen < arms.length && arms[gegen].roadType === 'NS') {
        const yGegen = defs.filter(d => d.fromArmIndex === gegen && d.toArmIndex >= 0 && d.movement !== 'left')
          .reduce((s, d) => s + getFlow(arms[gegen], d.movement) / S_M2, 0)
        betaGegenNS = betaCubic(yGegen)
      }
    } else {
      // Gleicher Rang (Rechtsvortritt): β = y_this / (y_this + y_partner)
      const partnerIdx = def.fromArmIndex === 0 ? 1
        : def.fromArmIndex === 1 ? 0
        : def.fromArmIndex === 2 ? 3 : 2
      const partner = arms[partnerIdx]
      if (partner) {
        const qThis    = armFlow(def.fromArmIndex)
        const qPartner = armFlow(partnerIdx)
        const yThis    = qThis    / S_M1
        const yPartner = qPartner / S_M1
        const denom    = yThis + yPartner
        beta = denom > 0 ? yThis / denom : 0.5
      } else {
        beta = 0.5
      }
      saturation = S_M1
      C = 1.0
    }

    // Gl. 5 (Szenario I) bzw. Gl. 6 (Szenario II)
    const capacity = betaGegenNS * (scenario === 'II'
      ? Math.max(0, saturation * (yParallel + (1 - yParallel) * beta))
      : Math.max(0, saturation * beta))
    const utilizationDegree = capacity > 0 ? Q / capacity : (Q > 0 ? Infinity : 0)
    const delay             = computeDelay(Q, capacity, C)
    const queue             = isFinite(delay) ? delay * capacity / 3600 : Infinity

    return {
      id: streamId(def.fromArmIndex, def.toArmIndex),
      fromArmIndex: def.fromArmIndex,
      toArmIndex:   def.toArmIndex,
      movement:     def.movement,
      roadType, Q, beta: beta * betaGegenNS, scenario, yParallel, saturation, capacity,
      utilizationDegree, delay, queue,
      levelOfService: computeLOS(delay),
    }
  })

  // ── Arm-Ergebnisse: Arm als Mischstreifen (analog SN 640 022, F21) ──────────
  // Die Ströme eines Arms teilen eine Haltelinie. Auslastung x_Arm = Σ Q_i / L_i,
  // Leistungsfähigkeit L_Arm = ΣQ / x_Arm, Wartezeit aus ΣQ und L_Arm (Gl. 1).
  // Bei x_Arm ≥ 1 ist der Arm überlastet (QS F), auch wenn jeder Strom für sich
  // unter seiner Leistungsfähigkeit bleibt.
  const armResults: ArmResult[] = arms.map((arm, i) => {
    const armStreams   = allStreams.filter(s => s.fromArmIndex === i)
    const validStreams = armStreams.filter(s => s.toArmIndex >= 0)
    const qFz         = validStreams.reduce((sum, s) => sum + s.Q, 0)
    const loaded      = validStreams.filter(s => s.Q > 0)
    // HS-Arm als Rang 1 (C = 0,5), solange alle belasteten Ströme Rang 1 sind. C = 0,5 setzt eine feste Bedienzeit voraus, die «nicht von
    // anderen Faktoren abhängig» ist (VSS 2011/308, Ziffer 4.2, S. 51). Wartet im selben Fahrstreifen ein nachrangiger Strom, etwa der
    // Linksabbieger auf den Gegenverkehr, gilt das nicht mehr: dann C = 1 und S = 1650. Ohne Verkehr bleibt die Anzeige wie bisher.
    const hsRank1 = loaded.length > 0
      ? loaded.every(s => s.saturation === S_M1)
      : validStreams.every(s => s.movement === 'left' || s.saturation === S_M1)
    const saturation = arm.roadType === 'NS' || (arm.roadType === 'HS' && !hsRank1) ? S_M2 : S_M1
    const C          = arm.roadType === 'HS' && hsRank1 ? 0.5 : 1.0

    if (loaded.length === 0) {
      // Keine Belastung: Display-β und -L vom ersten Strom
      return {
        armIndex: i, name: arm.name, roadType: arm.roadType, querung: arm.querung,
        qFz, qFg: arm.fg, saturation,
        beta:     armStreams[0]?.beta ?? 1,
        capacity: armStreams[0]?.capacity ?? saturation,
        utilizationDegree: 0, delay: 0, queue: 0,
        levelOfService: computeLOS(0),
        streams: armStreams,
      }
    }

    const x        = loaded.reduce((sum, s) => sum + (s.capacity > 0 ? s.Q / s.capacity : Infinity), 0)
    const capacity = isFinite(x) ? qFz / x : 0
    const delay    = computeDelay(qFz, capacity, C)
    const queue    = isFinite(delay) ? delay * capacity / 3600 : Infinity
    // β nur zur Anzeige: volumengewichtetes Mittel der Ströme
    const beta     = loaded.reduce((sum, s) => sum + s.Q * s.beta, 0) / qFz

    return {
      armIndex: i, name: arm.name, roadType: arm.roadType, querung: arm.querung,
      qFz, qFg: arm.fg, saturation, beta, capacity,
      utilizationDegree: x, delay, queue,
      levelOfService: computeLOS(delay),
      streams: armStreams,
    }
  })

  return {
    arms: armResults, streams: allStreams,
    overallLevelOfService: worstLOS(armResults.map(r => r.levelOfService)),
  }
}
