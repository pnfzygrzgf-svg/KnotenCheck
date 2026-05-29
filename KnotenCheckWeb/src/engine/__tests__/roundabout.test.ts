// Verifikation gegen Norm-Berechnungsbeispiel SN 640 024a, Kap. 17 (S. 18–20)
// Kreisverkehr Typ 1/1 (einstreifige Einfahrten, einstreifige Kreiselfahrbahn)
// Q_K-Werte direkt aus Tab. 4 (kommen aus Verkehrsmodell-Umlegung)

import { describe, test, expect } from 'vitest'
import {
  correctionFactorFF,
  basicCapacity,
  entryDelay,
  levelOfService,
  calculateRoundabout,
  computeQKfromOD,
  computeQKfromTurnings,
} from '../roundaboutCalculator'

const approx = (actual: number, expected: number, tol: number) =>
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tol)

// ── Q_K aus Abbiegeströmen (Abb. 10, S. 10) ──────────────────────────────────
// Norm-Beispiel: Arm 1: r=110, s=380, l=260; Arm 4: s=410, l=130; Arm 3: l=60
// PCE≈1.0 im Norm-Beispiel → Fz ≈ PWE

describe('computeQKfromTurnings (Abb. 10)', () => {
  // Vollständige OD-Matrix (Arm 1+4 direkt aus Norm; Arm 2+3 eine konsistente Lösung)
  // Arm 1 (idx 0): r=110, s=380, l=260
  // Arm 2 (idx 1): r=40,  s=270, l=160  (s+l=430, konsistent mit Q_K[2]=690)
  // Arm 3 (idx 2): r=250, s=260, l=60
  // Arm 4 (idx 3): r=420, s=410, l=130
  const rights    = [110,  40, 250, 420]
  const straights = [380, 270, 260, 410]
  const lefts     = [260, 160,  60, 130]
  const qk = computeQKfromTurnings(rights, straights, lefts, 4)

  test('Arm 1: Q_K = 600', () => approx(qk[0], 600, 1))
  test('Arm 2: Q_K = 770', () => approx(qk[1], 770, 1))
  test('Arm 3: Q_K = 690', () => approx(qk[2], 690, 1))
  test('Arm 4: Q_K = 480', () => approx(qk[3], 480, 1))
})

// ── Tab. 4: Kreisfahrbahnbelastung via OD-Umlegung ────────────────────────────
// Startwert Q_K[0]=600 ist bekannt (aus Tab. 4 / Verkehrsmodell)

describe('computeQKfromOD (Tab. 4)', () => {
  const qk = computeQKfromOD([750, 470, 570, 960], [840, 580, 550, 780], 600)
  test('Arm 1: Q_K = 600', () => approx(qk[0], 600, 1))
  test('Arm 2: Q_K = 770', () => approx(qk[1], 770, 1))
  test('Arm 3: Q_K = 690', () => approx(qk[2], 690, 1))
  test('Arm 4: Q_K = 480', () => approx(qk[3], 480, 1))
})

// ── Tab. 6: Leistungsfähigkeit der Einfahrten ─────────────────────────────────

describe('basicCapacity L_E ohne f_F (Tab. 6, Typ 1/1, Abb. 6)', () => {
  test('Arm 1: Q_K=600 → L_E≈794', () => approx(basicCapacity('1/1', 600), 794, 2))
  test('Arm 2: Q_K=770 → L_E≈696', () => approx(basicCapacity('1/1', 770), 696, 2))
  test('Arm 3: Q_K=690 → L_E≈742', () => approx(basicCapacity('1/1', 690), 742, 2))
  test('Arm 4: Q_K=480 → L_E≈863', () => approx(basicCapacity('1/1', 480), 863, 2))
})

describe('correctionFactorFF f_F (Tab. 6, Abb. 3)', () => {
  test('Arm 1: FG=100, Q_K=600 → f_F≈0.99', () => approx(correctionFactorFF('1/1', 100, 600), 0.99, 0.01))
  test('Arm 2: FG=300, Q_K=770 → f_F≈0.96', () => approx(correctionFactorFF('1/1', 300, 770), 0.96, 0.01))
  test('Arm 3: FG=250, Q_K=690 → f_F≈0.96', () => approx(correctionFactorFF('1/1', 250, 690), 0.96, 0.01))
  test('Arm 4: FG=0 → f_F=1.00',             () => expect(correctionFactorFF('1/1',   0, 480)).toBe(1.0))
})

describe('capacity L_E mit f_F (Tab. 6)', () => {
  const qk  = [600, 770, 690, 480]
  const fg  = [100, 300, 250,   0]
  const exp = [786, 668, 712, 863]
  for (let i = 0; i < 4; i++) {
    test(`Arm ${i + 1}: L_E≈${exp[i]}`, () => {
      const le = basicCapacity('1/1', qk[i]) * correctionFactorFF('1/1', fg[i], qk[i])
      approx(le, exp[i], 5)
    })
  }
})

// ── Tab. 7: Qualitätsmerkmale ─────────────────────────────────────────────────

describe('utilizationDegree x = Q_E / L_E (Tab. 7)', () => {
  const qe  = [750, 470, 570, 960]
  const cap = [786, 668, 712, 863]
  const exp = [0.95, 0.70, 0.80, 1.11]
  for (let i = 0; i < 4; i++) {
    test(`Arm ${i + 1}: x≈${exp[i]}`, () => approx(qe[i] / cap[i], exp[i], 0.01))
  }
})

// Mittlere Wartezeit: T=1.0 gibt ~61s für Arm 1 (Norm liest ~67s vom Diagramm Abb. 7)
describe('entryDelay (Tab. 7, Abb. 7)', () => {
  test('Arm 1: q=750, L=786 → w≈55–70s', () => {
    const d = entryDelay(750, 786)
    expect(d).toBeGreaterThan(45)
    expect(d).toBeLessThan(80)
  })
  test('Arm 2: q=470, L=668 → w≈17s', () => approx(entryDelay(470, 668), 17, 3))
  test('Arm 3: q=570, L=712 → w≈25s', () => approx(entryDelay(570, 712), 25, 4))
  test('Arm 4: overflow → Infinity',    () => expect(entryDelay(960, 863)).toBe(Infinity))
})

// LOS-Klassierung nach Tab. 3 (F = Overflow, E = Delay > 45s)
describe('levelOfService (Tab. 3)', () => {
  test('≤10s  → A', () => expect(levelOfService(10)).toBe('A'))
  test('≤20s  → B', () => expect(levelOfService(17)).toBe('B'))
  test('≤30s  → C', () => expect(levelOfService(25)).toBe('C'))
  test('≤45s  → D', () => expect(levelOfService(45)).toBe('D'))
  test('>45s  → E', () => expect(levelOfService(67)).toBe('E'))
  test('∞     → F', () => expect(levelOfService(Infinity)).toBe('F'))
})

// ── Gesamtberechnung ──────────────────────────────────────────────────────────

describe('calculateRoundabout (Norm-Gesamtbeispiel)', () => {
  const result = calculateRoundabout({
    type: '1/1',
    qe: [750, 470, 570, 960],
    qk: [600, 770, 690, 480],
    fg: [100, 300, 250,   0],
  })

  // Arm 1: delay>45s → E per Tab. 3 (F nur bei Overflow; Norm liest F aus Abb. 7)
  test('Arm 1 LOS = E (delay>45s, x<1)', () => expect(result.entries[0].levelOfService).toBe('E'))
  test('Arm 2 LOS = B',                  () => expect(result.entries[1].levelOfService).toBe('B'))
  test('Arm 3 LOS = C',                  () => expect(result.entries[2].levelOfService).toBe('C'))
  test('Arm 4 LOS = F (overflow x>1)',   () => expect(result.entries[3].levelOfService).toBe('F'))
  test('Gesamt LOS = F',                 () => expect(result.overallLevelOfService).toBe('F'))

  test('Arm 1 reserve = 36 PWE/h', () => approx(result.entries[0].reserve, 36, 3))
  test('Arm 2 reserve = 198 PWE/h', () => approx(result.entries[1].reserve, 198, 3))
})
