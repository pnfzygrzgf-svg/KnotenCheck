// VSS 2011/308 — Verkehrsablauf an ungesteuerten Knoten innerorts
// Methodik nach Kap. 4 (einfache Knoten) und Tab. 25 (Zusammenfassung)
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

// ── Ergebnis ──────────────────────────────────────────────────────────────────

export interface ArmResult {
  armIndex:         number
  name:             string
  roadType:         RoadType
  qFz:              number            // Q = right+straight+left [Fz/h]
  qFg:              number            // Q_Fg [Fg/h]
  saturation:       number            // S [Fz/h]
  beta:             number            // Reduktionsfaktor β
  capacity:         number            // L = S × β [Fz/h]
  utilizationDegree: number           // x = Q / L
  delay:            number            // w [s] (Infinity bei Überlast)
  queue:            number            // k [Fz]
  levelOfService:   LevelOfService
}

export interface VSS308Result {
  arms:                  ArmResult[]
  overallLevelOfService: LevelOfService
}

// ── β-Berechnung (Tab. 25, Abb. 23) ──────────────────────────────────────────
// Für Fz/Fg als konfligierende Rang-1-Ströme: β_i = (1 − y_i)³
// Gleicher Rang (Rechtsvortritt): β = y₁ / (y₁ + y₂)

function betaCubic(y: number): number {
  return Math.max(0, (1 - y) ** 3)
}

// ── Wartezeit nach Gl. 1, S. 62 (VSS 2011/308) ───────────────────────────────
// w(x,Q) = 900 × [(x−1) − 4C·(x/Q) + √((x−1)² + 8C·(x+1+2C·(x/Q)) / (Q/x))]
// C = 0.5 für Rang 1, C = 1.0 für Rang 2 und gleicher Rang
export function computeDelay(Q: number, L: number, C: number): number {
  if (L <= 0) return Infinity
  const x = Q / L
  if (x >= 1) return Infinity
  if (Q <= 0) return 0
  const xDivQ  = x / Q      // = 1/L
  const QDivX  = Q / x      // = L
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

  // Gesamtes HS-Volumen (Arme A + C, Indices 0 + 1)
  const hsArms = arms.filter(a => a.roadType === 'HS')
  const qHSTotal = hsArms.reduce((s, a) => s + a.right + a.straight + a.left, 0)
  const yHS = qHSTotal / S_M1

  const results: ArmResult[] = arms.map((arm, i) => {
    const qFz = arm.right + arm.straight + arm.left
    const qFg = arm.fg

    let beta = 1
    let saturation = S_M1
    let C = 0.5

    if (arm.roadType === 'HS') {
      // Rang 1: keine Kapazitätsreduktion durch andere Fz; β=1, S=S_m1
      // Wenn FG-Streifen: Fz muss Fg Vortritt geben → β_Fg = (1−y_Fg)³
      const yFg = qFg > 0 ? qFg / S_FG : 0
      beta = qFg > 0 ? betaCubic(yFg) : 1
      saturation = S_M1
      C = 0.5

    } else if (arm.roadType === 'NS') {
      // Rang 2: β = (1−y_HS)³ × (1−y_Fg)³ (falls FG vorhanden)
      const yFg = qFg > 0 ? qFg / S_FG : 0
      const betaFz = betaCubic(yHS)
      const betaFg = qFg > 0 ? betaCubic(yFg) : 1
      beta = betaFz * betaFg
      saturation = S_M2
      C = 1.0

    } else {
      // Gleicher Rang (Rechtsvortritt): β = y_partner / (y_this + y_partner)
      // Partner: A↔C (Indices 0↔1), B↔D (Indices 2↔3)
      const partnerIndex = i === 0 ? 1 : i === 1 ? 0 : i === 2 ? 3 : 2
      const partner = arms[partnerIndex]
      if (partner) {
        const qPartner = partner.right + partner.straight + partner.left
        const yThis    = qFz / S_M1
        const yPartner = qPartner / S_M1
        const denom    = yThis + yPartner
        beta = denom > 0 ? yThis / denom : 0.5
      }
      saturation = S_M1
      C = 1.0
    }

    const capacity = Math.max(0, saturation * beta)
    const x = capacity > 0 ? qFz / capacity : Infinity
    const delay = computeDelay(qFz, capacity, C)
    const queue = isFinite(delay) ? delay * capacity / 3600 : Infinity
    const los = computeLOS(delay)

    return {
      armIndex: i, name: arm.name, roadType: arm.roadType,
      qFz, qFg, saturation, beta, capacity,
      utilizationDegree: x, delay, queue, levelOfService: los,
    }
  })

  const overallLOS = results.reduce<LevelOfService>((worst, r) => {
    return losRank.indexOf(r.levelOfService) > losRank.indexOf(worst)
      ? r.levelOfService : worst
  }, 'A')

  return { arms: results, overallLevelOfService: overallLOS }
}
