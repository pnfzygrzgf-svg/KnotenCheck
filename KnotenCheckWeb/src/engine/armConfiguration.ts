// Eingabemodell — Port von ArmConfiguration.swift + IntersectionConfiguration.swift

import type { MixedLaneCombination, SN640022LaneFlags } from './types'
import { conform, conformFixed, oneOf, wahl } from './conform'

// ── Neigungsklassen (Tab. 1) ──────────────────────────────────────────────────

export type GradientCategory = '+4%' | '+2%' | '±0%' | '-2%' | '-4%'

export const GRADIENT_F_FZ: Record<GradientCategory, number> = {
  '+4%': 1.7, '+2%': 1.4, '±0%': 1.1, '-2%': 1.0, '-4%': 0.9,
}

// Tab. 2 — Fall 2: Faktoren je Fahrzeugkategorie
export const GRADIENT_FACTORS: Record<GradientCategory, {
  fPW: number; fLW: number; fLZ: number; fMR: number; fFR?: number
}> = {
  '+4%': { fPW: 1.4, fLW: 3.0, fLZ: 6.0, fMR: 0.7 },
  '+2%': { fPW: 1.2, fLW: 2.0, fLZ: 3.0, fMR: 0.6 },
  '±0%': { fPW: 1.0, fLW: 1.5, fLZ: 2.0, fMR: 0.5, fFR: 0.25 },
  '-2%': { fPW: 0.9, fLW: 1.2, fLZ: 1.5, fMR: 0.4 },
  '-4%': { fPW: 0.8, fLW: 1.0, fLZ: 1.2, fMR: 0.3 },
}

// ── Fahrzeugzusammensetzung (Fall 2) ─────────────────────────────────────────

export interface VehicleCategoryMix {
  pctLW: number  // Lastwagen [%]
  pctLZ: number  // Lastzüge [%]
  pctMR: number  // Motorräder [%]
  pctFR: number  // Fahrräder (nur ±0%) [%]
}

export function pctPW(mix: VehicleCategoryMix): number {
  return Math.max(0, 100 - mix.pctLW - mix.pctLZ - mix.pctMR - mix.pctFR)
}

/** Anteile der Fahrzeugkategorien: jeder 0 bis 100 %, zusammen höchstens 100 % (der Rest sind Personenwagen). Gilt für alle Rechner */
export function mixGueltig(mix: object | undefined | null): boolean {
  if (!mix) return true
  const w = Object.entries(mix).filter(([k]) => k.startsWith('pct')).map(([, v]) => v as unknown)
  return w.every(x => typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= 100) && (w as number[]).reduce((s, x) => s + x, 0) <= 100 + 1e-9
}
export const MIX_OFFEN = 'Fahrzeuganteile (zusammen höchstens 100 %)'

export function effectiveFactor(mix: VehicleCategoryMix, gradient: GradientCategory): number {
  const f = GRADIENT_FACTORS[gradient]
  const pw = pctPW(mix)
  const fFR = f.fFR ?? 0
  const tot = pw + mix.pctLW + mix.pctLZ + mix.pctMR + mix.pctFR
  if (tot <= 0) return 1
  return (f.fPW * pw + f.fLW * mix.pctLW + f.fLZ * mix.pctLZ
          + f.fMR * mix.pctMR + fFR * mix.pctFR) / tot
}

// ── Arm-Konfiguration ─────────────────────────────────────────────────────────

export interface ArmConfiguration {
  id: string
  streetName: string      // Strassenname für Berechnungsblatt
  leftVolume: number      // Linksabbieger [Fz/h]
  straightVolume: number  // Geradeaus [Fz/h]
  rightVolume: number     // Rechtsabbieger [Fz/h]
  gradient: GradientCategory | null       // null = noch nicht gewählt
  fall: 1 | 2 | null                      // Ziffer 8: Fall 1 ohne, Fall 2 mit Kategorien; null = noch nicht gewählt
  vehicleMix?: VehicleCategoryMix         // nur Fall 2
  hasSeparateTurnLane: boolean            // Fn 1
  rightLaneVolume?: number                // Fn 2
  hasRightTurnTriangleIsland: boolean     // Fn 3/4
  hasLeftTurnLane?: boolean               // Ziffer 14 / F22: separater HS-Linksabbiegestreifen (fehlt nur in älteren Dateien: vorhanden)
  mixedLaneCombination: MixedLaneCombination | null  // nur NS-Arme in Kreuzung; null = noch nicht gewählt
}

// Leerer Arm: Die Rechner beginnen ohne Startwerte
export function defaultArm(): ArmConfiguration {
  return {
    id: crypto.randomUUID(),
    streetName: '',
    leftVolume: 0, straightVolume: 0, rightVolume: 0,
    gradient: null,
    fall: null,
    vehicleMix: undefined,
    hasSeparateTurnLane: false,
    rightLaneVolume: undefined,
    hasRightTurnTriangleIsland: false,
    hasLeftTurnLane: false,
    mixedLaneCombination: null,
  }
}

// null, solange die Neigung fehlt
export function armFactor(arm: ArmConfiguration): number | null {
  if (arm.gradient === null) return null
  if (arm.vehicleMix) return effectiveFactor(arm.vehicleMix, arm.gradient)
  return GRADIENT_F_FZ[arm.gradient]
}

// ── Kreuzungskonfiguration ────────────────────────────────────────────────────

export interface IntersectionConfiguration {
  name: string
  arms: ArmConfiguration[]   // [0]=A(HS), [1]=C(HS), [2]=B(NS), [3]=D(NS, opt.)
}

export function defaultIntersection(armCount: 3 | 4): IntersectionConfiguration {
  const arms: ArmConfiguration[] = []
  for (let i = 0; i < armCount; i++) {
    arms.push(defaultArm())
  }
  return { name: '', arms }
}

// ── Geladene Daten absichern ──────────────────────────────────────────────────

const MIX_TEMPLATE: VehicleCategoryMix = { pctLW: 0, pctLZ: 0, pctMR: 0, pctFR: 0 }
const GRADIENTS = Object.keys(GRADIENT_F_FZ) as GradientCategory[]
const MIXED_COMBINATIONS: readonly MixedLaneCombination[] = ['leftAndThrough', 'throughAndRight', 'all']

// Arme aus einer Datei auf genau armCount Arme mit gültigen Werten bringen. leereFelder: siehe saveLoad.ts
export function conformArms(value: unknown, armCount: 3 | 4, leereFelder = false): ArmConfiguration[] {
  // Der Linksabbiegestreifen hat keinen Vorlagewert: Fehlt er in einer älteren Datei, gilt «vorhanden»
  const vorlage = defaultIntersection(armCount).arms.map(a => ({ ...a, hasLeftTurnLane: undefined }))
  return conformFixed(vorlage, value).map(a => {
    const gradient = leereFelder ? wahl(GRADIENTS, a.gradient) : oneOf(GRADIENTS, a.gradient, '±0%')
    const mix = a.vehicleMix ? conform(MIX_TEMPLATE, a.vehicleMix) : undefined
    return {
      ...a,
      gradient,
      fall: leereFelder ? wahl<1 | 2>([1, 2], a.fall) : a.vehicleMix ? 2 : 1,
      mixedLaneCombination: leereFelder ? wahl(MIXED_COMBINATIONS, a.mixedLaneCombination) : oneOf(MIXED_COMBINATIONS, a.mixedLaneCombination, 'all'),
      // Fahrräder gibt es nur bei ±0 % (Tab. 2), wie beim Wechsel der Neigung in der Armkarte; sonst zählten sie ohne Faktor im Nenner
      vehicleMix: mix && gradient !== '±0%' ? { ...mix, pctFR: 0 } : mix,
      rightLaneVolume: typeof a.rightLaneVolume === 'number' && a.rightLaneVolume >= 0
        ? a.rightLaneVolume : undefined,
      hasLeftTurnLane: typeof a.hasLeftTurnLane === 'boolean' ? a.hasLeftTurnLane : undefined,
    }
  })
}

export function conformIntersection(value: unknown): IntersectionConfiguration {
  const src = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>
  const armCount = Array.isArray(src.arms) && src.arms.length === 4 ? 4 : 3
  return {
    name: typeof src.name === 'string' ? src.name : '',
    arms: conformArms(src.arms, armCount, src.leereFelder === true),
  }
}

export function armLabel(index: number): string {
  return ['A', 'C', 'B', 'D', 'E'][index] ?? `${index + 1}`
}

// Hauptstrassenarme (A, C), an denen mehr als die Hälfte der Zufahrt rechts abbiegt (Strom 3 bzw. 9). Nach SN 640 022 Ziffer 4, S. 2
// missachten die Linkseinbieger (Strom 4 bzw. 10) dann den Vortritt; ihre Leistungsfähigkeit ist in der Regel höher als gerechnet.
export function starkeRechtsabbieger(arms: ArmConfiguration[]): string[] {
  return arms.slice(0, 2).flatMap((a, i) => {
    const zufahrt = a.leftVolume + a.straightVolume + a.rightVolume
    return zufahrt > 0 && a.rightVolume > 0.5 * zufahrt ? [armLabel(i)] : []
  })
}
export const RECHTSABBIEGER_HINWEIS = (label: string) =>
  `Arm ${label}: Mehr als 50 % der Zufahrt biegen rechts ab. Nach Ziffer 4 (Seite 2) ist die Leistungsfähigkeit der Linkseinbieger dann in der Regel höher als gerechnet.`
/** Anwendungsgrenzen der SN 640 022 (Ziffer 1, S. 1 und Ziffer 4, S. 2) */
export const SN022_GRENZEN = 'Gilt nicht für Knoten mit Rechtsvortritt und nicht für abknickende Hauptstrassen. Nur bedingt anwendbar bei vielen Fussgänger*innen oder Velos ' +
  'und in der Nähe von Lichtsignalanlagen oder Bahnübergängen (Ziffer 1, Seite 1). Eingeschränkte Sicht und Kreuzungswinkel unter 70 gon können die Leistungsfähigkeit senken (Ziffer 4, Seite 2).'

// Angaben der Arme, die für die Rechnung noch fehlen. Leere Stromfelder zählen als kein Verkehr,
// mindestens ein Strom ist nötig. mischstreifen = false: Das Feld ist ausgeblendet (Simulation).
export function offeneArmAngaben(arms: ArmConfiguration[], { mischstreifen = true, verkehr = true } = {}): string[] {
  const aus: string[] = []
  if (verkehr && !arms.some(a => a.leftVolume + a.straightVolume + a.rightVolume > 0)) aus.push('Verkehrsmengen')
  arms.forEach((a, i) => {
    const arm = `Arm ${armLabel(i)}`
    if (a.fall === null) aus.push(`${arm}: Fall 1 oder Fall 2`)
    if (a.gradient === null) aus.push(`${arm}: Neigung`)
    if (!mixGueltig(a.vehicleMix)) aus.push(`${arm}: ${MIX_OFFEN}`)
    if (mischstreifen && arms.length === 4 && i >= 2 && a.mixedLaneCombination === null) aus.push(`${arm}: Mischstreifen-Kombination`)
  })
  return aus
}

// ── SN 640 022 Lane-Flags aus Konfiguration ───────────────────────────────────

export function toSNLaneFlags(cfg: IntersectionConfiguration): SN640022LaneFlags {
  const a = cfg.arms[0], c = cfg.arms[1], b = cfg.arms[2], d = cfg.arms[3]
  return {
    mixedB: b?.mixedLaneCombination ?? 'all',
    mixedD: d?.mixedLaneCombination ?? 'all',
    armASeparateLane:   a?.hasSeparateTurnLane       ?? false,
    armCSeparateLane:   c?.hasSeparateTurnLane       ?? false,
    // Fn 2: rechter Fahrstreifen trägt höchstens den ganzen Geradeausverkehr
    armAQ2Override:     a?.rightLaneVolume !== undefined ? Math.min(a.rightLaneVolume, a.straightVolume) : undefined,
    armCQ8Override:     c?.rightLaneVolume !== undefined ? Math.min(c.rightLaneVolume, c.straightVolume) : undefined,
    armATriangleIsland: a?.hasRightTurnTriangleIsland ?? false,
    armCTriangleIsland: c?.hasRightTurnTriangleIsland ?? false,
    armBRightIsland:    b?.hasRightTurnTriangleIsland ?? false,
    armDRightIsland:    d?.hasRightTurnTriangleIsland ?? false,
    armALeftLane:       a?.hasLeftTurnLane ?? true,   // F22: aus = p0* (Rückstau HS)
    armCLeftLane:       c?.hasLeftTurnLane ?? true,
  }
}

// ── Volumenmatrix volumes[i][j] [PWE/h] ──────────────────────────────────────

export function toSNVolumes(cfg: IntersectionConfiguration): number[][] | null {
  const n = cfg.arms.length
  if (n !== 3 && n !== 4) return null
  const faktoren = cfg.arms.map(armFactor)
  if (faktoren.some(x => x === null)) return null
  const f = faktoren as number[]
  const v: number[][] = Array.from({ length: n }, () => Array(n).fill(0))

  if (n === 3) {
    // A (0): gerade→C (q2), rechts→B (q3)
    v[0][1] = f[0] * cfg.arms[0].straightVolume
    v[0][2] = f[0] * cfg.arms[0].rightVolume
    // C (1): gerade→A (q8), links→B (q7)
    v[1][0] = f[1] * cfg.arms[1].straightVolume
    v[1][2] = f[1] * cfg.arms[1].leftVolume
    // B (2): links→A (q4), rechts→C (q6)
    v[2][0] = f[2] * cfg.arms[2].leftVolume
    v[2][1] = f[2] * cfg.arms[2].rightVolume
  } else {
    // A (0): gerade→C (q2), rechts→B (q3), links→D (q1)
    v[0][1] = f[0] * cfg.arms[0].straightVolume
    v[0][2] = f[0] * cfg.arms[0].rightVolume
    v[0][3] = f[0] * cfg.arms[0].leftVolume
    // C (1): gerade→A (q8), links→B (q7), rechts→D (q9)
    v[1][0] = f[1] * cfg.arms[1].straightVolume
    v[1][2] = f[1] * cfg.arms[1].leftVolume
    v[1][3] = f[1] * cfg.arms[1].rightVolume
    // B (2): links→A (q4), rechts→C (q6), gerade→D (q5)
    v[2][0] = f[2] * cfg.arms[2].leftVolume
    v[2][1] = f[2] * cfg.arms[2].rightVolume
    v[2][3] = f[2] * cfg.arms[2].straightVolume
    // D (3): rechts→A (q12), links→C (q10), gerade→B (q11)
    v[3][0] = f[3] * cfg.arms[3].rightVolume
    v[3][1] = f[3] * cfg.arms[3].leftVolume
    v[3][2] = f[3] * cfg.arms[3].straightVolume
  }
  return v
}

// ── Volumenmatrix volumes[i][j] [Fz/h] (roh, ohne PWE-Umrechnung) ────────────
// Wie toSNVolumes, aber OHNE Multiplikation mit Faktor f.
// Wird für qpi in den G-Funktionen (Abb. 2, x-Achse = Fz/h) benötigt.

export function toSNRawVolumes(cfg: IntersectionConfiguration): number[][] | null {
  const n = cfg.arms.length
  if (n !== 3 && n !== 4) return null
  const v: number[][] = Array.from({ length: n }, () => Array(n).fill(0))

  if (n === 3) {
    v[0][1] = cfg.arms[0].straightVolume  // q2 roh [Fz/h]
    v[0][2] = cfg.arms[0].rightVolume     // q3
    v[1][0] = cfg.arms[1].straightVolume  // q8
    v[1][2] = cfg.arms[1].leftVolume      // q7
    v[2][0] = cfg.arms[2].leftVolume      // q4
    v[2][1] = cfg.arms[2].rightVolume     // q6
  } else {
    // A (0): gerade→C (q2), rechts→B (q3), links→D (q1)
    v[0][1] = cfg.arms[0].straightVolume
    v[0][2] = cfg.arms[0].rightVolume
    v[0][3] = cfg.arms[0].leftVolume
    // C (1): gerade→A (q8), links→B (q7), rechts→D (q9)
    v[1][0] = cfg.arms[1].straightVolume
    v[1][2] = cfg.arms[1].leftVolume
    v[1][3] = cfg.arms[1].rightVolume
    // B (2): links→A (q4), rechts→C (q6), gerade→D (q5)
    v[2][0] = cfg.arms[2].leftVolume
    v[2][1] = cfg.arms[2].rightVolume
    v[2][3] = cfg.arms[2].straightVolume
    // D (3): rechts→A (q12), links→C (q10), gerade→B (q11)
    v[3][0] = cfg.arms[3].rightVolume
    v[3][1] = cfg.arms[3].leftVolume
    v[3][2] = cfg.arms[3].straightVolume
  }
  return v
}

