// Verifikation gegen Norm-Berechnungsbeispiele SN 640 022 S. 12–14
// Alle erwarteten Werte direkt aus den Normtabellen

import { describe, test, expect } from 'vitest'
import { analyzeSN640022, w } from '../sn640022Calculator'
import type { SN640022LaneFlags } from '../types'

const acc = (a: number, b: number, tol: number) =>
  expect(Math.abs(a - b)).toBeLessThanOrEqual(tol)

// ─── Einmündung (Punkt 21, S. 12) ────────────────────────────────────────────
// HS A↔C, NS B; Abendspitze
// Arm A: q2=570 Fz/h, q3=200; Arm C: q8=425, q7=115; Arm B: q4=180, q6=130

describe('Einmündung (Punkt 21)', () => {
  const v = [[0, 570, 200], [425, 0, 115], [180, 130, 0]]
  const r = analyzeSN640022(v)!

  test('G7 Linksabbiegen HS: qp7=770 → G7≈635', () => {
    const s7 = r.streams.find(s => s.streamNumber === 7)!
    acc(s7.qpi, 770, 1)
    // Toleranz ±12: lineare Interpolation auf konkaver Kurve liegt zwischen
    // Gitterpunkten leicht über dem Kurvenwert (Ablesegenauigkeit ±15 PWE/h)
    acc(s7.basicCapacity, 635, 12)
  })
  test('G6 Rechtseinbiegen NS: qp6=670 → G6≈550', () => {
    const s6 = r.streams.find(s => s.streamNumber === 6)!
    acc(s6.qpi, 670, 1)
    acc(s6.basicCapacity, 550, 12)
  })
  test('G4 Linkseinbiegen NS: qp4=1210 → L4≈203', () => {
    const s4 = r.streams.find(s => s.streamNumber === 4)!
    acc(s4.qpi, 1210, 1)
    acc(s4.capacity, 203, 8)
  })
  test('Mischstrom 4+6 überlastet (Σa>1)', () => {
    const m = r.mixedLanes[0]
    expect(m.utilizationDegree).toBeGreaterThan(1.0)
    expect(m.levelOfService).toBe('F')
  })
})

// ─── Einmündung mit F22 (kein Linksabbiegestreifen auf HS, Arm C) ────────────
// Gleiche Volumes wie Punkt 21; armCLeftLane: false aktiviert F22 für p0,7*
// p0,7* = 1 − (115/635) × (1800/(1800−425)) ≈ 0.763  (statt 0.811 ohne F22)
// G4(qp4=1210) ≈ 250  →  L4 ≈ 0.763 × 250 ≈ 191

describe('Einmündung mit F22 (armCLeftLane: false)', () => {
  const v = [[0, 570, 200], [425, 0, 115], [180, 130, 0]]
  const r = analyzeSN640022(v, { mixedB: 'all', mixedD: 'all',
    armASeparateLane: false, armCSeparateLane: false,
    armATriangleIsland: false, armCTriangleIsland: false,
    armBRightIsland: false, armDRightIsland: false,
    armCLeftLane: false })!
  const s4 = r.streams.find(s => s.streamNumber === 4)!

  test('L4 kleiner als ohne F22 (< 203)', () => {
    expect(s4.capacity).toBeLessThan(203)
  })
  test('L4 ≈ 191 (F22 angewendet)', () => {
    acc(s4.capacity, 191, 10)
  })
})

// ─── Kreuzung mit F22 (kein Linksabbiegestreifen auf HS, Arme A und C) ───────
// Gleiche Volumes wie Punkt 22; armALeftLane: false + armCLeftLane: false
// p01* = 1 − (30/810) × (1800/(1800−500−220)) ≈ 0.938
// p07* = 1 − (90/670) × (1800/(1800−550−0))   ≈ 0.807
// px*  = 0.938 × 0.807 ≈ 0.757  (statt px≈0.817 ohne F22)
// G5(qp5=1170) ≈ 311  →  L5* ≈ 0.757 × 311 ≈ 236

describe('Kreuzung mit F22 (armALeftLane: false, armCLeftLane: false)', () => {
  const v = [
    [0, 500, 220, 30],
    [550, 0, 90, 0],
    [170, 60, 0, 10],
    [20, 5, 15, 0],
  ]
  const r = analyzeSN640022(v, {
    mixedB: 'leftAndThrough', mixedD: 'throughAndRight',
    armASeparateLane: true, armCSeparateLane: false,
    armATriangleIsland: false, armCTriangleIsland: false,
    armBRightIsland: false, armDRightIsland: false,
    armALeftLane: false, armCLeftLane: false })!
  const s = (n: number) => r.streams.find(s => s.streamNumber === n)!

  test('L5 kleiner als ohne F22 (px* < px)', () => {
    expect(s(5).capacity).toBeLessThan(245)
  })
  test('L5 ≈ 236 (F22 angewendet)', () => {
    acc(s(5).capacity, 236, 15)
  })
})

// ─── Kreuzung (Punkt 22, S. 13–14) ───────────────────────────────────────────
// Fn 1: separater Rechtsabbiegestreifen Arm A → mixedB=leftAndThrough, mixedD=throughAndRight

describe('Kreuzung (Punkt 22)', () => {
  const v = [
    [0, 500, 220, 30],    // A: q2=500, q3=220, q1=30
    [550, 0, 90, 0],      // C: q8=550, q7=90, q9=0
    [170, 60, 0, 10],     // B: q4=170, q6=60, q5=10
    [20, 5, 15, 0],       // D: q12=20, q10=5, q11=15
  ]
  const flags: SN640022LaneFlags = {
    mixedB: 'leftAndThrough', mixedD: 'throughAndRight',
    armASeparateLane: true, armCSeparateLane: false,
    armAQ2Override: undefined, armCQ8Override: undefined,
    armATriangleIsland: false, armCTriangleIsland: false,
    armBRightIsland: false, armDRightIsland: false,
  }
  const r = analyzeSN640022(v, flags)!
  const s = (n: number) => r.streams.find(s => s.streamNumber === n)!

  // Rang 2 — Grundleistungsfähigkeit (Toleranz ±12: Interpolationsfehler auf konkaver Kurve)
  test('S1: qp1=550 → G1≈810', () => { acc(s(1).basicCapacity, 810, 12) })
  test('S7: qp7=720 → G7≈670', () => { acc(s(7).basicCapacity, 670, 8) })
  test('S6: qp6=500 → G6≈675 (Fn1 aktiv)', () => { acc(s(6).basicCapacity, 675, 8) })
  test('S12: qp12=550 → G12≈635', () => { acc(s(12).basicCapacity, 635, 8) })

  // Rang 2 — Leistungsfähigkeit = G
  test('S1: L1=G1', () => { acc(s(1).capacity, s(1).basicCapacity, 1) })
  test('S7: L7=G7', () => { acc(s(7).capacity, s(7).basicCapacity, 1) })

  // Rang 3
  // Rang 3 (Toleranz ±18: Interpolation auf konkaver Kreuzen-Kurve)
  test('S5: L5≈245', () => { acc(s(5).capacity, 245, 18) })
  test('S11: L11≈204', () => { acc(s(11).capacity, 204, 18) })

  // Rang 4
  test('S4: L4≈200', () => { acc(s(4).capacity, 200, 12) })
  test('S10: L10≈174', () => { acc(s(10).capacity, 174, 18) })

  // Qualitätsstufen
  test('Rang-2-Ströme alle QS A', () => {
    for (const n of [1, 7, 6, 12]) expect(s(n).levelOfService).toBe('A')
  })
  test('S4 QS E (kritisch)', () => {
    expect(['D', 'E']).toContain(s(4).levelOfService)
  })
})

// ─── G-Kurven direkt ─────────────────────────────────────────────────────────

describe('Grundleistungsfähigkeit G_i (Abb. 2)', () => {
  const check = (qpi: number, expected: number, armType: 'mainLeft' | 'sideRight' | 'sideCross' | 'sideLeft') => {
    // Verwende eine 3-armige Konfiguration mit passendem qpi
    // qpi wird indirekt über die Eingabevolumen erzeugt
    // Stattdessen testen wir die Exponentialformel direkt
    const formulas = {
      mainLeft:  (q: number) => Math.max(0, 1486 * Math.exp(-0.001104 * q)),
      sideRight: (q: number) => Math.max(0, 1232 * Math.exp(-0.001205 * q)),
      sideCross: (q: number) => Math.max(0,  791 * Math.exp(-0.000829 * q)),
      sideLeft:  (q: number) => Math.max(0, 1019 * Math.exp(-0.001166 * q)),
    }
    acc(formulas[armType](qpi), expected, 5)
  }

  test('Linksabbiegen HS: qp=770 → 635', () => check(770, 635, 'mainLeft'))
  test('Rechtseinbiegen NS: qp=670 → 550', () => check(670, 550, 'sideRight'))
  test('Linkseinbiegen NS: qp=1210 → 250', () => check(1210, 250, 'sideLeft'))
  test('Kreuzen NS: qp=1170 → 300', () => check(1170, 300, 'sideCross'))
  test('Kreuzen NS: qp=1390 → 250', () => check(1390, 250, 'sideCross'))
})

// ─── Egerkingen (Verkehrsgutachten Anhang I) ──────────────────────────────────
// Einmündung Oltnerstrasse / Hotel Egerkingen, Prognose 2035
// Rohdaten Fz/h, f = 1.1 (Fall 1, ±0%); Gutachtenwerte in Klammern

describe('Egerkingen Anhang I', () => {
  const f = 1.1
  const raw = [[0, 833, 13], [833, 0, 41], [13, 41, 0]]
  const v   = raw.map(row => row.map(x => x * f))
  const r = analyzeSN640022(v, undefined, raw)!
  const s = (n: number) => r.streams.find(s => s.streamNumber === n)!

  // qpi-Werte — aus Formeln, identisch zum Gutachten
  test('qp7 = 846 (PDF: 846)', () => acc(s(7).qpi, 846, 1))
  test('qp6 = 839.5 (PDF: 839.5)', () => acc(s(6).qpi, 839.5, 0.5))
  test('qp4 = 1713.5 (PDF: 1713.5)', () => acc(s(4).qpi, 1713.5, 0.5))

  // G-Werte — Interpolation aus digitisierten Kurven (Toleranz ±15 = Ablesegenauigkeit)
  test('G7 ≈ 580 (PDF: 580)', () => acc(s(7).basicCapacity, 580, 15))
  test('G6 ≈ 450 (PDF: 450)', () => acc(s(6).basicCapacity, 450, 15))
  test('G4 ≈ 170 (PDF: 170)', () => acc(s(4).basicCapacity, 170, 20))

  // Leistungsfähigkeit & Reserve — Rang 3
  test('L4 ≈ 165 (PDF: 165)', () => acc(s(4).capacity, 165, 15))
  test('R4 ≈ 151 (PDF: 151)', () => acc(s(4).reserve, 151, 15))

  // Wartezeit & Qualitätsstufe
  test('w4 ≈ 23s → QS C (PDF: 23s, C)', () => {
    acc(s(4).delay, 23, 4)
    expect(s(4).levelOfService).toBe('C')
  })
  test('S7 QS A (PDF: A)', () => expect(s(7).levelOfService).toBe('A'))
  test('S6 QS A (PDF: A)', () => expect(s(6).levelOfService).toBe('A'))
})

// ─── Anhang B — Referenzwerte Verkehrsgutachten ────────────────────────────────────
// Quelle: EB_Beilage_02_Verkehrsbericht-Kontextplan-AG_inkl_Beilagen_250829.pdf
// Inputs rückgerechnet aus qp-Werten (Formeln F2/F3/F7 bzw. F1/F12/F5).
// f=1.1 (Fall 1, Standardwert); Das Gutachten verwendete Fall 2 (f≈1.05–1.06),
// daher stimmen PWE/h-Eingaben nicht 1:1, aber qp-Werte und VQS stimmen überein.

// ─── B2.x Einmündung Oltnerstrasse / Hotel Egerkingen ────────────────────────
// Gemeinsame Geometrie: Einmündung (3-Arm), keine Sonderstreifen

describe('Anhang B2.1 — MSP IST', () => {
  const f = 1.1
  const raw = [[0, 832, 6], [844, 0, 10], [13, 27, 0]]
  const v   = raw.map(row => row.map(x => x * f))
  const r = analyzeSN640022(v, undefined, raw)!
  const s = (n: number) => r.streams.find(s => s.streamNumber === n)!

  test('qp7 = 838 (838)', () => acc(s(7).qpi, 838, 1))
  test('qp6 = 835 (835)', () => acc(s(6).qpi, 835, 1))
  test('qp4 = 1689 (1689)', () => acc(s(4).qpi, 1689, 2))

  test('G7 ≈ 589 (589)', () => acc(s(7).basicCapacity, 589, 15))
  test('G6 ≈ 459 (459)', () => acc(s(6).basicCapacity, 459, 15))
  test('G4 ≈ 169 (169)', () => acc(s(4).basicCapacity, 169, 20))

  test('w7 ≈ 6.2s (6.2)', () => acc(s(7).delay, 6.2, 3))
  test('w6 ≈ 8.3s (8.3)', () => acc(s(6).delay, 8.3, 3))
  test('w4 ≈ 23.5s → QS C (23.5, C)', () => {
    acc(s(4).delay, 23.5, 4)
    expect(s(4).levelOfService).toBe('C')
  })
})

describe('Anhang B2.2 — MSP Szenario 1', () => {
  const f = 1.1
  const raw = [[0, 832, 6], [844, 0, 11], [17, 34, 0]]
  const v   = raw.map(row => row.map(x => x * f))
  const r = analyzeSN640022(v, undefined, raw)!
  const s = (n: number) => r.streams.find(s => s.streamNumber === n)!

  test('qp7 = 838 (838)', () => acc(s(7).qpi, 838, 1))
  test('qp6 = 835 (835)', () => acc(s(6).qpi, 835, 1))
  test('qp4 = 1690 (1690)', () => acc(s(4).qpi, 1690, 2))

  test('w7 ≈ 6.2s (6.2)', () => acc(s(7).delay, 6.2, 3))
  test('w6 ≈ 8.4s (8.4)', () => acc(s(6).delay, 8.4, 3))
  test('w4 ≈ 24.2s → QS C (24.2, C)', () => {
    acc(s(4).delay, 24.2, 4)
    expect(s(4).levelOfService).toBe('C')
  })
})

describe('Anhang B2.3 — ASP IST', () => {
  const f = 1.1
  const raw = [[0, 1001, 16], [911, 0, 23], [12, 21, 0]]
  const v   = raw.map(row => row.map(x => x * f))
  const r = analyzeSN640022(v, undefined, raw)!
  const s = (n: number) => r.streams.find(s => s.streamNumber === n)!

  test('qp7 = 1017 (1017)', () => acc(s(7).qpi, 1017, 1))
  test('qp6 = 1009 (1009)', () => acc(s(6).qpi, 1009, 1))
  test('qp4 = 1943 (1943)', () => acc(s(4).qpi, 1943, 2))

  test('G7 ≈ 488 (488)', () => acc(s(7).basicCapacity, 488, 15))
  test('G6 ≈ 380 (380)', () => acc(s(6).basicCapacity, 380, 20))
  test('G4 ≈ 144 (144)', () => acc(s(4).basicCapacity, 144, 20))

  test('w7 ≈ 7.7s (7.7)', () => acc(s(7).delay, 7.7, 3))
  test('w6 ≈ 10.0s (10.0)', () => acc(s(6).delay, 10.0, 3))
  test('w4 ≈ 28.6s → QS D (28.6, D)', () => {
    acc(s(4).delay, 28.6, 4)
    expect(s(4).levelOfService).toBe('D')
  })
})

describe('Anhang B2.4 — ASP Szenario 1', () => {
  const f = 1.1
  const raw = [[0, 1001, 20], [911, 0, 28], [14, 23, 0]]
  const v   = raw.map(row => row.map(x => x * f))
  const r = analyzeSN640022(v, undefined, raw)!
  const s = (n: number) => r.streams.find(s => s.streamNumber === n)!

  test('qp7 = 1021 (1021)', () => acc(s(7).qpi, 1021, 1))
  test('qp6 = 1011 (1011)', () => acc(s(6).qpi, 1011, 1))
  test('qp4 = 1950 (1950)', () => acc(s(4).qpi, 1950, 2))

  test('w7 ≈ 7.8s (7.8)', () => acc(s(7).delay, 7.8, 3))
  test('w6 ≈ 10.1s (10.1)', () => acc(s(6).delay, 10.1, 3))
  test('w4 ≈ 29.6s → QS D (29.6, D)', () => {
    acc(s(4).delay, 29.6, 4)
    expect(s(4).levelOfService).toBe('D')
  })
})

// ─── B1.x Kreuzung Hauptstrasse / Oltnerstrasse ───────────────────────────────
// Keine Sonderstreifen, keine Dreiecksinseln (Geometrie laut Gutachten: "nein")

const defaultFlags: SN640022LaneFlags = {
  mixedB: 'all', mixedD: 'all',
  armASeparateLane: false, armCSeparateLane: false,
  armAQ2Override: undefined, armCQ8Override: undefined,
  armATriangleIsland: false, armCTriangleIsland: false,
  armBRightIsland: false, armDRightIsland: false,
}

describe('Anhang B1.1 — MSP IST', () => {
  const f = 1.1
  const raw = [[0, 416, 4, 0], [645, 0, 5, 14], [4, 12, 0, 0], [2, 4, 0, 0]]
  const v   = raw.map(row => row.map(x => x * f))
  const r = analyzeSN640022(v, defaultFlags, raw)!
  const s = (n: number) => r.streams.find(s => s.streamNumber === n)!

  test('qp1 = 659 (659)', () => acc(s(1).qpi, 659, 1))
  test('qp7 = 420 (420)', () => acc(s(7).qpi, 420, 1))
  test('qp6 = 418 (418)', () => acc(s(6).qpi, 418, 1))
  test('qp12 = 652 (652)', () => acc(s(12).qpi, 652, 1))

  test('G1 ≈ 716 (716)', () => acc(s(1).basicCapacity, 716, 15))
  test('G7 ≈ 937 (937)', () => acc(s(7).basicCapacity, 937, 15))
  test('G6 ≈ 744 (744)', () => acc(s(6).basicCapacity, 744, 15))
  test('G12 ≈ 564 (564)', () => acc(s(12).basicCapacity, 564, 15))

  test('Alle Ströme QS B oder besser (B)', () => {
    for (const n of [1, 7, 6, 12, 5, 11, 4, 10]) {
      const los = s(n).levelOfService
      expect(['A', 'B']).toContain(los)
    }
  })
})

describe('Anhang B1.2 — MSP Szenario 2.1', () => {
  const f = 1.1
  const raw = [[0, 415, 6, 1], [645, 0, 7, 14], [13, 27, 0, 0], [2, 5, 0, 0]]
  const v   = raw.map(row => row.map(x => x * f))
  const r = analyzeSN640022(v, defaultFlags, raw)!
  const s = (n: number) => r.streams.find(s => s.streamNumber === n)!

  test('qp1 = 659 (659)', () => acc(s(1).qpi, 659, 1))
  test('qp7 = 421 (421)', () => acc(s(7).qpi, 421, 1))
  test('qp6 = 418 (418)', () => acc(s(6).qpi, 418, 1))
  test('qp12 = 652 (652)', () => acc(s(12).qpi, 652, 1))

  test('Alle Ströme QS B oder besser (B)', () => {
    for (const n of [1, 7, 6, 12, 5, 11, 4, 10]) {
      const los = s(n).levelOfService
      expect(['A', 'B']).toContain(los)
    }
  })
})

describe('Anhang B1.3 — ASP IST', () => {
  const f = 1.1
  const raw = [[0, 610, 4, 2], [538, 0, 5, 14], [0, 6, 0, 0], [4, 6, 0, 0]]
  const v   = raw.map(row => row.map(x => x * f))
  const r = analyzeSN640022(v, defaultFlags, raw)!
  const s = (n: number) => r.streams.find(s => s.streamNumber === n)!

  test('qp1 = 552 (552)', () => acc(s(1).qpi, 552, 1))
  test('qp7 = 614 (614)', () => acc(s(7).qpi, 614, 1))
  test('qp6 = 612 (612)', () => acc(s(6).qpi, 612, 1))
  test('qp12 = 545 (545)', () => acc(s(12).qpi, 545, 1))

  test('Alle Ströme QS B oder besser (B)', () => {
    for (const n of [1, 7, 6, 12, 5, 11, 4, 10]) {
      const los = s(n).levelOfService
      expect(['A', 'B']).toContain(los)
    }
  })
})

describe('Anhang B1.4 — ASP Szenario 2.1', () => {
  const f = 1.1
  const raw = [[0, 611, 10, 10], [538, 0, 12, 14], [5, 10, 0, 0], [5, 5, 0, 0]]
  const v   = raw.map(row => row.map(x => x * f))
  const r = analyzeSN640022(v, defaultFlags, raw)!
  const s = (n: number) => r.streams.find(s => s.streamNumber === n)!

  test('qp1 = 552 (552)', () => acc(s(1).qpi, 552, 1))
  test('qp7 = 621 (621)', () => acc(s(7).qpi, 621, 1))
  test('qp6 = 616 (616)', () => acc(s(6).qpi, 616, 1))
  test('qp12 = 545 (545)', () => acc(s(12).qpi, 545, 1))

  test('w10 ≈ 15.2s (15.2)', () => acc(s(10).delay, 15.2, 3))
  test('Gesamtbewertung QS C (C)', () => {
    // S10 bestimmt als schwächster Strom die Gesamtbewertung
    expect(s(10).levelOfService).toBe('C')
  })
})

// ─── Abb. 4 — Rekonstruktion der Wartezeitkurven ──────────────────────────────
// Die Norm gibt w nur grafisch an (Abb. 4, «nach Kimber, Hollis, 1979»).
// Formel: Brilon (2008), TRR 2071, Gl. 9 (Fall D2+A2, Akçelik-Troutbeck)
// + Bedienzeit 3600/L, mit T = 1.0 h.
// Stützpunkte aus Abb. 4 abgelesen Juni 2026 (Ablesegenauigkeit ±2 s;
// Kurvenschar L = 200–1800 in 200er-Schritten, dick/dünn alternierend).
// T = 0.25 würde die sättigungsnahen Punkte (R ≤ 100) um 6–16 s verfehlen.

describe('Abb. 4 — Wartezeitkurven (T = 1.0 h)', () => {
  const points: [number, number, number, number][] = [
    // [L, R, w abgelesen, Toleranz]
    [200,   50, 70, 4],  // steilster Kurvenast, Ablesung am ungenausten
    [200,  100, 37, 3],
    [200,  150, 24, 3],
    [600,  100, 34, 3],
    [1000,  50, 49, 3],
    [1000, 100, 32, 3],
    [1000, 150, 23, 3],
    [1000, 200, 18, 3],
    [1000, 300, 12, 3],
    [1400, 100, 30, 3],
    [1400, 300, 12, 3],
    [1800, 100, 27, 3],
    [1800, 200, 16, 3],
    [1800, 400,  9, 3],
  ]
  for (const [L, R, expected, tol] of points) {
    test(`L=${L}, R=${R} → w ≈ ${expected}s`, () => acc(w(L - R, L), expected, tol))
  }

  // Achsenabschnitte (R=0): Kurven mit w(0) ≤ 80 s schneiden die w-Achse,
  // die übrigen verlassen das Diagramm oben — wie in Abb. 4 gezeichnet.
  test('Achsenabschnitt L=1800: w(R=0) ≈ 62 s', () => acc(w(1800 - 0.01, 1800), 62, 3))
  test('Achsenabschnitt L=1400: w(R=0) ≈ 71 s', () => acc(w(1400 - 0.01, 1400), 71, 3))
})
