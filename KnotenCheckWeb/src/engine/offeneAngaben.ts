// Angaben, die für die Rechnung noch fehlen. Die Rechner beginnen ohne Startwerte und zeigen ein Ergebnis erst, wenn hier nichts mehr
// offen ist. Leere Stromfelder zählen als kein Verkehr, mindestens ein Strom ist aber nötig. Verlangt wird nur, was gerade sichtbar ist.

import { armLabel, MIX_OFFEN, mixGueltig, offeneArmAngaben, type ArmConfiguration } from './armConfiguration'
import { armMovements } from './lsaCalculatorV2'
import type { Querung } from './querung'

export interface KreiselAngaben {
  type: string | null
  right: number
  bypass?: boolean | null   // nur gefragt, wenn es Rechtsabbieger gibt
  uturn?: number
  straight: number
  left: number
  gradient: string | null
  exitWide: boolean | null
  exitTwoLanes: boolean | null
  mischung: string | null
  mix?: object
}

export function offenKreisel(arms: KreiselAngaben[]): string[] {
  const aus: string[] = []
  const strom = (a: KreiselAngaben) => a.right + a.left + (arms.length === 4 ? a.straight : 0) + (a.uturn ?? 0)
  if (!arms.some(a => strom(a) > 0)) aus.push('Abbiegeströme')
  arms.forEach((a, i) => {
    const arm = `Arm ${i + 1}`
    if (a.type === null) aus.push(`${arm}: Typ der Einfahrt`)
    if (a.right > 0 && a.bypass === null) aus.push(`${arm}: Rechtsabbieger über Bypass`)
    if (a.type === '2/2' && a.exitTwoLanes === null) aus.push(`${arm}: Fahrstreifen der Ausfahrt`)
    if (!(a.type === '2/2' && a.exitTwoLanes === true) && a.exitWide === null) aus.push(`${arm}: Ausfahrtsbreite`)
    if (a.mischung === null) aus.push(`${arm}: pauschal oder detailliert`)
    if (a.gradient === null) aus.push(`${arm}: Neigung`)
    if (a.mischung === 'detail' && !mixGueltig(a.mix)) aus.push(`${arm}: ${MIX_OFFEN}`)
  })
  return aus
}

export interface Vss308Angaben {
  left: number
  straight: number
  right: number
  fg: number
  rho?: number
  querung?: Querung
}

export function offenVss308(arms: Vss308Angaben[]): string[] {
  const aus: string[] = []
  if (!arms.some(a => a.left + a.straight + a.right > 0)) aus.push('Abbiegeströme')
  arms.forEach((a, i) => {
    const arm = `Arm ${armLabel(i)}`
    if (a.querung === undefined) aus.push(`${arm}: Querung`)
    else if (a.querung !== 'keine') {
      if (!(a.fg > 0)) aus.push(`${arm}: Fussgänger*innen je Stunde`)
      if (!a.rho) aus.push(`${arm}: Gruppengrösse ρ`)
    }
  })
  return aus
}

export interface LsaAngaben {
  armCount: 3 | 4
  arms: { left: number; straight: number; right: number; vDesign?: number; mix?: object }[]
  moveLane: Record<string, 1 | 2>
  fgs: Record<string, { enabled: boolean; volume: number; length: number } | undefined>
  tzMode: string | null
  targetLos: string | null
  phasenplan: boolean   // mindestens eine Phase mit Fahrstreifen
}

export function offenLsa(o: LsaAngaben): string[] {
  const aus: string[] = []
  const labels = ['A', 'C', 'B', 'D'].slice(0, o.armCount)
  const stroeme = labels.map((_, i) => armMovements(o.armCount, i).filter(m => (o.arms[i]?.[m.direction] ?? 0) > 0))
  if (!stroeme.some(s => s.length > 0)) aus.push('Verkehrsmengen')
  labels.forEach((lbl, i) => {
    if (stroeme[i].some(m => o.moveLane[m.id] === undefined)) aus.push(`Arm ${lbl}: Fahrstreifen der Ströme`)
    const f = o.fgs[lbl]
    if (f?.enabled && !(f.volume > 0)) aus.push(`Fussgängerstreifen Arm ${lbl}: Fg/h`)
    if (f?.enabled && !(f.length > 0)) aus.push(`Fussgängerstreifen Arm ${lbl}: Länge`)
    if (o.tzMode === 'staffel' && o.arms[i]?.vDesign === undefined) aus.push(`Arm ${lbl}: Tempo`)
    if (!mixGueltig(o.arms[i]?.mix)) aus.push(`Arm ${lbl}: ${MIX_OFFEN}`)
  })
  if (!o.phasenplan) aus.push('Phasenplan')
  if (o.tzMode === null) aus.push('Zwischenzeit')
  if (o.targetLos === null) aus.push('Ziel-VQS')
  return aus
}

export interface SimulationAngaben {
  arms: ArmConfiguration[]
  beine: ({ querung?: Querung; fg: number; rho: number; fahrbahnbreite?: number } | undefined)[]   // Reihenfolge der Arme
  intervalle: { T: number | null; arms: ArmConfiguration[] }[] | null   // null: ein einziger Zeitraum
  runs?: number
  useCowan?: boolean
  tcSigma?: number
  zeitluecken: boolean   // Grenz- und Folgezeitlücken gewählt
}

export function offenSimulation(o: SimulationAngaben): string[] {
  const aus = offeneArmAngaben(o.arms, { mischstreifen: false, verkehr: o.intervalle === null })
  o.arms.forEach((_, i) => {
    const arm = `Arm ${armLabel(i)}`, b = o.beine[i]
    if (b?.querung === undefined) { aus.push(`${arm}: Querung`); return }
    if (b.querung === 'keine') return
    if (!(b.fg > 0)) aus.push(`${arm}: Fussgänger*innen je Stunde`)
    if (!b.rho) aus.push(`${arm}: Gruppengrösse ρ`)
    if (!b.fahrbahnbreite) aus.push(`${arm}: Fahrbahnbreite`)
  })
  o.intervalle?.forEach((iv, i) => {
    if (iv.T === null) aus.push(`Intervall ${i + 1}: Dauer`)
    if (!iv.arms.some(a => a.leftVolume + a.straightVolume + a.rightVolume > 0)) aus.push(`Intervall ${i + 1}: Verkehrsmengen`)
  })
  if (o.runs === undefined) aus.push('Anzahl Simulationsläufe')
  if (o.useCowan === undefined) aus.push('Zeitlückenverteilung')
  if (o.tcSigma === undefined) aus.push('Streuung t_c')
  if (!o.zeitluecken) aus.push('Grenz- und Folgezeitlücken')
  return aus
}
