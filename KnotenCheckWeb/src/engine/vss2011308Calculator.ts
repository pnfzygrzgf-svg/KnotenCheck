// VSS 2011/308 — Verkehrsablauf an ungesteuerten Knoten innerorts
// Kap. 5: Pro-Strom-Kapazität mit Einfahrts- und Ausfahrts-Fg
// Methodik nach Kap. 5.1 (Abb. 22/23, Gl. 5/6/12)
// Menendez / Guler / Puffe, September 2015

export type RoadType = 'HS' | 'NS' | 'equal'

export type LevelOfService = 'A' | 'B' | 'C' | 'D' | 'E' | 'F'

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
  fg:       number    // Fg/h an Fussgängerstreifen (0 = kein FG-Streifen)
}

export interface VSS308Input {
  type: '3arm' | '4arm'
  arms: ArmInput[]    // [0]=A(HS), [1]=C(HS), [2]=B(NS), [3]=D(NS, 4-Arm)
}

// ── Strom-Topologie ───────────────────────────────────────────────────────────
// 4-Arm-Geometrie: A=West, C=Ost, B=Süd, D=Nord
// Von A (westwärts fahrend, Blick Ost): rechts=B, gerade=C, links=D
// Von C (ostwärts fahrend, Blick West): rechts=D, gerade=A, links=B
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

// ── Ergebnis-Typen ────────────────────────────────────────────────────────────

export interface StreamResult {
  id:                string            // 'A→C', 'B→A', etc.
  fromArmIndex:      number
  toArmIndex:        number            // -1 = kein Zielarm
  movement:          'right' | 'straight' | 'left'
  roadType:          RoadType
  Q:                 number            // Strom-Belastung [Fz/h]
  beta:              number            // β dieses Stroms
  saturation:        number            // S [Fz/h]
  capacity:          number            // L = S × β [Fz/h]
  utilizationDegree: number            // x = Q / L
  delay:             number            // w [s]
  queue:             number            // k [Fz]
  levelOfService:    LevelOfService
}

export interface ArmResult {
  armIndex:          number
  name:              string
  roadType:          RoadType
  qFz:               number            // Q = right+straight+left [Fz/h]
  qFg:               number            // Q_Fg [Fg/h]
  saturation:        number            // S [Fz/h]
  beta:              number            // Volumen-gewichtetes Mittel
  capacity:          number            // Volumen-gewichtetes Mittel [Fz/h]
  utilizationDegree: number            // qFz / capacity_avg
  delay:             number            // Volumen-gewichtetes Mittel [s]
  queue:             number            // Summe der Strom-Staulängen [Fz]
  levelOfService:    LevelOfService
  streams:           StreamResult[]   // Per-Strom-Ergebnisse
}

export interface VSS308Result {
  arms:                  ArmResult[]
  streams:               StreamResult[]  // flache Liste aller Ströme
  overallLevelOfService: LevelOfService
}

// ── Wartezeit nach Gl. 1, S. 62 (VSS 2011/308) ───────────────────────────────
// w(x,Q) = 900 × [(x−1) − 4C·(x/Q) + √((x−1)² + 8C·(x+1+2C·(x/Q)) / (Q/x))]
// C = 0.5 für Rang 1, C = 1.0 für Rang 2 und gleicher Rang
export function computeDelay(Q: number, L: number, C: number): number {
  if (L <= 0) return Infinity
  const x = Q / L
  if (x >= 1) return Infinity
  if (Q <= 0) return 0
  const xDivQ  = x / Q
  const QDivX  = Q / x
  const inner  = (x - 1) ** 2 + 8 * C * (x + 1 + 2 * C * xDivQ) / QDivX
  return 900 * ((x - 1) - 4 * C * xDivQ + Math.sqrt(inner))
}

// ── LOS-Klassierung (analog SN 640 022 Tab. 3) ────────────────────────────────
export function computeLOS(delay: number): LevelOfService {
  if (!isFinite(delay)) return 'F'
  if (delay <= 10) return 'A'
  if (delay <= 20) return 'B'
  if (delay <= 30) return 'C'
  if (delay <= 45) return 'D'
  return 'E'
}

// ── Hauptberechnung ───────────────────────────────────────────────────────────

export function calculateVSS308(input: VSS308Input): VSS308Result {
  const { arms } = input
  const losRank: LevelOfService[] = ['A', 'B', 'C', 'D', 'E', 'F']

  // Gesamtes HS-Volumen für NS-β (konfligierende Ströme aus Rang-1-Armen)
  const qHSTotal = arms
    .filter(a => a.roadType === 'HS')
    .reduce((s, a) => s + a.right + a.straight + a.left, 0)
  const yHS = qHSTotal / S_M1

  // ── Per-Strom-Berechnung (Kap. 5, Szenario I: L = S × β) ─────────────────
  // Szenario I gilt für reine Fz/Fg-Knoten: kein paralleler höherrangiger Strom
  // (kein Tram, kein Bus → Abb. 22 führt immer zu Szenario I)
  const allStreams: StreamResult[] = STREAM_DEFS[input.type].map(def => {
    const fromArm  = arms[def.fromArmIndex]
    const toArm    = def.toArmIndex >= 0 ? arms[def.toArmIndex] : null
    const Q        = getFlow(fromArm, def.movement)
    const roadType = fromArm.roadType

    // Senkrechte Fg-Ströme: Einfahrt (fromArm) + Ausfahrt (toArm)
    // Fg hat Vortritt über Fz → β_Fg = (1−y_Fg)³  (Abb. 23, Gl. 8)
    const y_FgEntry = fromArm.fg > 0 ? fromArm.fg / S_FG : 0
    const y_FgExit  = (toArm?.fg ?? 0) > 0 ? toArm!.fg / S_FG : 0

    let beta: number
    let saturation: number
    let C: number

    if (roadType === 'HS') {
      // Rang 1: senkrechte höherrangige Ströme = Fg-Entry + Fg-Exit
      // β = (1−y_FgEntry)³ × (1−y_FgExit)³   (Gl. 12, Abb. 23 Typ 8)
      beta = betaCubic(y_FgEntry) * betaCubic(y_FgExit)
      saturation = S_M1
      C = 0.5
    } else if (roadType === 'NS') {
      // Rang 2: senkrechte höherrangige Ströme = HS-Fz (gesamt) + Fg-Entry + Fg-Exit
      beta = betaCubic(yHS) * betaCubic(y_FgEntry) * betaCubic(y_FgExit)
      saturation = S_M2
      C = 1.0
    } else {
      // Gleicher Rang (Rechtsvortritt): β = y_this / (y_this + y_partner)
      const partnerIdx = def.fromArmIndex === 0 ? 1
        : def.fromArmIndex === 1 ? 0
        : def.fromArmIndex === 2 ? 3 : 2
      const partner = arms[partnerIdx]
      if (partner) {
        const qThis    = fromArm.right + fromArm.straight + fromArm.left
        const qPartner = partner.right + partner.straight + partner.left
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

    const capacity          = Math.max(0, saturation * beta)
    const utilizationDegree = capacity > 0 ? Q / capacity : (Q > 0 ? Infinity : 0)
    const delay             = computeDelay(Q, capacity, C)
    const queue             = isFinite(delay) ? delay * capacity / 3600 : Infinity

    return {
      id: streamId(def.fromArmIndex, def.toArmIndex),
      fromArmIndex: def.fromArmIndex,
      toArmIndex:   def.toArmIndex,
      movement:     def.movement,
      roadType, Q, beta, saturation, capacity,
      utilizationDegree, delay, queue,
      levelOfService: computeLOS(delay),
    }
  })

  // ── Arm-Ergebnisse: volumen-gewichtete Mittelwerte aus Strom-Ergebnissen ───
  const armResults: ArmResult[] = arms.map((arm, i) => {
    const armStreams = allStreams.filter(s => s.fromArmIndex === i)
    const qFz       = arm.right + arm.straight + arm.left
    const loaded    = armStreams.filter(s => s.Q > 0)
    const saturation = arm.roadType === 'NS' ? S_M2 : S_M1

    let beta: number, capacity: number, delay: number, queue: number

    if (loaded.length === 0) {
      // Keine Belastung: Display-β vom ersten Strom
      beta     = armStreams[0]?.beta ?? 1
      capacity = armStreams[0]?.capacity ?? saturation
      delay    = 0
      queue    = 0
    } else if (loaded.some(s => !isFinite(s.delay))) {
      const qW = loaded.reduce((s, x) => s + x.Q, 0)
      beta     = loaded.reduce((s, x) => s + x.Q * x.beta,     0) / qW
      capacity = loaded.reduce((s, x) => s + x.Q * x.capacity, 0) / qW
      delay    = Infinity
      queue    = Infinity
    } else {
      const qW = loaded.reduce((s, x) => s + x.Q, 0)
      beta     = loaded.reduce((s, x) => s + x.Q * x.beta,     0) / qW
      capacity = loaded.reduce((s, x) => s + x.Q * x.capacity, 0) / qW
      delay    = loaded.reduce((s, x) => s + x.Q * x.delay,    0) / qW
      queue    = loaded.reduce((s, x) => s + x.queue,           0)
    }

    const x = capacity > 0 ? qFz / capacity : (qFz > 0 ? Infinity : 0)

    return {
      armIndex: i, name: arm.name, roadType: arm.roadType,
      qFz, qFg: arm.fg, saturation, beta, capacity,
      utilizationDegree: x, delay, queue,
      levelOfService: computeLOS(delay),
      streams: armStreams,
    }
  })

  const overallLOS = armResults.reduce<LevelOfService>((worst, r) =>
    losRank.indexOf(r.levelOfService) > losRank.indexOf(worst)
      ? r.levelOfService : worst, 'A')

  return { arms: armResults, streams: allStreams, overallLevelOfService: overallLOS }
}
