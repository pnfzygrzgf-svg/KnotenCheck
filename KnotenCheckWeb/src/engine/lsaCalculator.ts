// VSS 40 023a — Knoten mit Lichtsignalanlagen

export type LevelOfService = 'A' | 'B' | 'C' | 'D' | 'E' | 'F'

const S = 1800  // Fahrstreifensättigung [PWE/h] (Ziffer 11.3)
const C = 0.5   // Konstante für isolierte LSA (Ziffer 12)

// ── Tabelle 2 ─────────────────────────────────────────────────────────────────
interface Tab2Entry { tGrSum: number; lambdaSum: number; qKritMax: number }
interface Tab2Row   { Z: number; p2: Tab2Entry; p3: Tab2Entry; p4: Tab2Entry }

const TAB2: Tab2Row[] = [
  {Z: 45,  p2:{tGrSum:35, lambdaSum:0.778,qKritMax:1400}, p3:{tGrSum:30, lambdaSum:0.667,qKritMax:1200}, p4:{tGrSum:25,lambdaSum:0.556,qKritMax:1000}},
  {Z: 50,  p2:{tGrSum:40, lambdaSum:0.800,qKritMax:1440}, p3:{tGrSum:35, lambdaSum:0.700,qKritMax:1260}, p4:{tGrSum:30,lambdaSum:0.600,qKritMax:1080}},
  {Z: 60,  p2:{tGrSum:50, lambdaSum:0.833,qKritMax:1500}, p3:{tGrSum:45, lambdaSum:0.750,qKritMax:1350}, p4:{tGrSum:40,lambdaSum:0.667,qKritMax:1200}},
  {Z: 72,  p2:{tGrSum:62, lambdaSum:0.861,qKritMax:1550}, p3:{tGrSum:57, lambdaSum:0.792,qKritMax:1425}, p4:{tGrSum:52,lambdaSum:0.722,qKritMax:1300}},
  {Z: 80,  p2:{tGrSum:70, lambdaSum:0.875,qKritMax:1575}, p3:{tGrSum:65, lambdaSum:0.813,qKritMax:1463}, p4:{tGrSum:60,lambdaSum:0.750,qKritMax:1350}},
  {Z: 90,  p2:{tGrSum:80, lambdaSum:0.889,qKritMax:1600}, p3:{tGrSum:75, lambdaSum:0.833,qKritMax:1500}, p4:{tGrSum:70,lambdaSum:0.778,qKritMax:1400}},
  {Z: 100, p2:{tGrSum:90, lambdaSum:0.900,qKritMax:1620}, p3:{tGrSum:85, lambdaSum:0.850,qKritMax:1530}, p4:{tGrSum:80,lambdaSum:0.800,qKritMax:1440}},
  {Z: 120, p2:{tGrSum:110,lambdaSum:0.917,qKritMax:1650}, p3:{tGrSum:105,lambdaSum:0.875,qKritMax:1575}, p4:{tGrSum:100,lambdaSum:0.833,qKritMax:1500}},
]

function getTabEntry(row: Tab2Row, phaseCount: 2 | 3): Tab2Entry {
  return phaseCount === 2 ? row.p2 : row.p3
}

// ── Standard-Phasenpläne ───────────────────────────────────────────────────────
// Basis: SN 640 022-Nummerierung
// 3-Arm: q2=A→C, q3=A→B, q4=B→A, q6=B→C, q7=C→B, q8=C→A
// 4-Arm: q1=A→D, q2=A→C, q3=A→B, q4=B→A, q5=B→D, q6=B→C,
//         q7=C→B, q8=C→A, q9=C→D, q10=D→C, q11=D→B, q12=D→A
const PHASE_PLANS: Record<string, ReadonlyArray<ReadonlyArray<string>>> = {
  '3-2': [['q2','q3','q7','q8'], ['q4','q6']],
  // 3-Arm 3-Phasen: Überlappungsplan — q3 in Phase 1+2, q6 in Phase 2+3, q8 in Phase 1+3
  '3-3': [['q2','q3','q8'], ['q3','q4','q6'], ['q6','q7','q8']],
  '4-2': [['q1','q2','q3','q7','q8','q9'], ['q4','q5','q6','q10','q11','q12']],
  '4-3': [['q2','q3','q8','q9'], ['q5','q6','q11','q12'], ['q1','q4','q7','q10']],
}

// Für Pläne mit Überlappungsphasen: nur diese Ströme bestimmen Q_krit je Phase.
// Überlappende Ströme erhalten λ_effektiv = Σ(λ aller Phasen, in denen sie grün sind).
const CRITICAL_STREAM_IDS: Partial<Record<string, ReadonlyArray<ReadonlyArray<string>>>> = {
  '3-3': [['q2'], ['q4'], ['q7']],
}

export const PHASE_PLAN_LABELS: Record<string, string[]> = {
  '3-2': ['Phase 1 — Hauptstrasse (A↔C)', 'Phase 2 — Nebenstrasse (B)'],
  '3-3': ['Phase 1 — A→C, A→B, C→A', 'Phase 2 — A→B, B→A, B→C', 'Phase 3 — B→C, C→B, C→A'],
  '4-2': ['Phase 1 — Hauptstrasse (A↔C)', 'Phase 2 — Nebenstrasse (B↔D)'],
  '4-3': ['Phase 1 — A↔C (gerade + rechts)', 'Phase 2 — B↔D (gerade + rechts)', 'Phase 3 — Linksabbieger (alle)'],
}

const STREAM_LABELS: Record<string, string> = {
  q1:'A→D', q2:'A→C', q3:'A→B',
  q4:'B→A', q5:'B→D', q6:'B→C',
  q7:'C→B', q8:'C→A', q9:'C→D',
  q10:'D→C', q11:'D→B', q12:'D→A',
}

// ── Eingabe ────────────────────────────────────────────────────────────────────
export interface ArmInput {
  name:     string
  left:     number    // [PWE/h]
  straight: number    // [PWE/h]
  right:    number    // [PWE/h]
}

export interface LSAInput {
  armCount:   3 | 4
  phaseCount: 2 | 3
  arms:       ArmInput[]  // [0]=A(HS), [1]=C(HS), [2]=B(NS), [3]=D(NS, 4-Arm)
}

// ── Knotenstrom-Volumen aus Arm-Eingaben ──────────────────────────────────────
function toStreamVolumes(input: LSAInput): Record<string, number> {
  const [A, C, B, D] = input.arms
  if (input.armCount === 3) {
    return {
      q2: A?.straight ?? 0,  // A→C
      q3: A?.right    ?? 0,  // A→B
      q4: B?.left     ?? 0,  // B→A
      q6: B?.right    ?? 0,  // B→C
      q7: C?.left     ?? 0,  // C→B
      q8: C?.straight ?? 0,  // C→A
    }
  }
  return {
    q1:  A?.left     ?? 0,
    q2:  A?.straight ?? 0,
    q3:  A?.right    ?? 0,
    q4:  B?.left     ?? 0,
    q5:  B?.straight ?? 0,
    q6:  B?.right    ?? 0,
    q7:  C?.left     ?? 0,
    q8:  C?.straight ?? 0,
    q9:  C?.right    ?? 0,
    q10: D?.left     ?? 0,
    q11: D?.straight ?? 0,
    q12: D?.right    ?? 0,
  }
}

// ── Wartezeit (Ziffer 12) ─────────────────────────────────────────────────────
// w_m = w_1 + w_0
// w_1 = Z·(1−λ)² / (2·(1−λ·X))
// w_0 = 900·[(X−1) − 2C·X/Q + √((X−1)² + 4C·(X+1+C·X/Q) / (Q/X))]
// C = 0.5 für isolierte LSA
export function streamDelay(
  Q: number, lambda: number, Z: number,
): { w1: number; w0: number; wm: number; X: number } {
  if (Q <= 0) return { w1: 0, w0: 0, wm: 0, X: 0 }
  const L = lambda * S
  if (L <= 0) return { w1: Infinity, w0: Infinity, wm: Infinity, X: Infinity }
  const X = Q / L
  if (X >= 1) return { w1: Infinity, w0: Infinity, wm: Infinity, X }

  const w1    = Z * (1 - lambda) ** 2 / (2 * (1 - lambda * X))
  const xDivQ = X / Q
  const QDivX = Q / X
  const inner = (X - 1) ** 2 + 4 * C * (X + 1 + C * xDivQ) / QDivX
  const w0    = 900 * ((X - 1) - 2 * C * xDivQ + Math.sqrt(Math.max(0, inner)))
  return { w1, w0: Math.max(0, w0), wm: w1 + Math.max(0, w0), X }
}

// ── LOS-Klassierung (Tab. 4) ──────────────────────────────────────────────────
export function losFromDelay(wm: number): LevelOfService {
  if (!isFinite(wm)) return 'F'
  if (wm <=  20) return 'A'
  if (wm <=  35) return 'B'
  if (wm <=  50) return 'C'
  if (wm <=  70) return 'D'
  if (wm <= 100) return 'E'
  return 'F'
}

// ── Ergebnis-Typen ────────────────────────────────────────────────────────────
export interface PhaseResult {
  phaseIndex: number
  label:      string
  streamIds:  string[]
  qKrit:      number
  tGr:        number
  lambda:     number
  L:          number
}

export interface StreamResult {
  id:         string
  label:      string
  phaseIndex: number
  Q:          number
  tGr:        number
  lambda:     number
  L:          number
  X:          number
  w1:         number
  w0:         number
  wm:         number
  los:        LevelOfService
  isCritical: boolean
}

export interface LSAResult {
  Z:          number
  sumQKrit:   number
  maxQKrit:   number
  overloaded: boolean
  phases:     PhaseResult[]
  streams:    StreamResult[]
  overallLos: LevelOfService
}

// ── Hauptberechnung ───────────────────────────────────────────────────────────
export function calculateLSA(input: LSAInput): LSAResult {
  const sv       = toStreamVolumes(input)
  const planKey  = `${input.armCount}-${input.phaseCount}`
  const plan     = PHASE_PLANS[planKey] ?? PHASE_PLANS['4-3']
  const planLbls = PHASE_PLAN_LABELS[planKey] ?? []
  const critPlan = CRITICAL_STREAM_IDS[planKey]

  // Q_krit per phase: bei Überlappungsplänen nur kritische Ströme, sonst alle
  const qKritPP = plan.map((ids, i) => {
    const critIds = critPlan ? critPlan[i] : ids
    return Math.max(0, ...critIds.map(id => sv[id] ?? 0))
  })
  const sumQKrit = qKritPP.reduce((a, b) => a + b, 0)

  // Z-Auswahl (Tab. 2): kleinste Z mit qKritMax > ΣQ_krit (Ziffer 11.2)
  let selectedRow = TAB2[TAB2.length - 1]
  let overloaded  = true
  for (const row of TAB2) {
    if (getTabEntry(row, input.phaseCount).qKritMax > sumQKrit) {
      selectedRow = row
      overloaded  = false
      break
    }
  }
  const Z       = selectedRow.Z
  const tabData = getTabEntry(selectedRow, input.phaseCount)

  // Grünzeiten, Grünzeitanteile, Leistungsfähigkeit je Phase
  const phases: PhaseResult[] = plan.map((ids, i) => {
    const qKrit  = qKritPP[i]
    const tGr    = sumQKrit > 0 ? tabData.tGrSum * qKrit / sumQKrit : 0
    const lambda = Z > 0 ? tGr / Z : 0
    return {
      phaseIndex: i,
      label:      planLbls[i] ?? `Phase ${i + 1}`,
      streamIds:  [...ids],
      qKrit, tGr, lambda, L: lambda * S,
    }
  })

  // Strom → Phasen-Zuordnung (für Überlappungen: ein Strom in mehreren Phasen)
  const streamToPhases = new Map<string, number[]>()
  plan.forEach((ids, i) => {
    for (const id of ids) {
      if (!streamToPhases.has(id)) streamToPhases.set(id, [])
      streamToPhases.get(id)!.push(i)
    }
  })

  // Wartezeit und LOS je Knotenstrom (jeder Strom exakt einmal)
  // Überlappende Ströme erhalten λ_effektiv = Σ(λ aller Phasen, in denen sie grün sind)
  const streams: StreamResult[] = []
  for (const [id, phaseIndices] of streamToPhases) {
    const Q              = sv[id] ?? 0
    const effectiveLambda = phaseIndices.reduce((sum, i) => sum + phases[i].lambda, 0)
    const effectiveTGr    = Z * effectiveLambda
    const { w1, w0, wm, X } = streamDelay(Q, effectiveLambda, Z)
    const primaryIdx     = phaseIndices[0]
    const critIds        = critPlan ? critPlan[primaryIdx] : plan[primaryIdx]
    const isCritical     = Q > 0 && qKritPP[primaryIdx] > 0 &&
                           critIds.includes(id) && Q >= qKritPP[primaryIdx]
    streams.push({
      id, label: STREAM_LABELS[id] ?? id,
      phaseIndex: primaryIdx,
      Q, tGr: effectiveTGr, lambda: effectiveLambda, L: effectiveLambda * S,
      X, w1, w0, wm,
      los: losFromDelay(wm),
      isCritical,
    })
  }

  const losRank: LevelOfService[] = ['A','B','C','D','E','F']
  const overallLos = streams
    .filter(r => r.Q > 0)
    .reduce<LevelOfService>((w, r) =>
      losRank.indexOf(r.los) > losRank.indexOf(w) ? r.los : w, 'A')

  return { Z, sumQKrit, maxQKrit: tabData.qKritMax, overloaded, phases, streams, overallLos }
}
