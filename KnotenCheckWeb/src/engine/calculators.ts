// Kapazitäts-, Wartezeit-, Stau- und Sättigungsrechner
// Port von CapacityCalculator.swift, DelayCalculator.swift,
//         QueueCalculator.swift, SaturationCalculator.swift

// ── CapacityCalculator ────────────────────────────────────────────────────────

/** Rang 1: volle Sättigungsleistung */
export function capacityPrimary(maxSaturation: number): number {
  return maxSaturation
}

/** Rang 2 (zweirangig ohne Vortrittswechsel): L₂ = S_m2 × (1 − y₁)²  */
export function capacitySecondary(Sm2: number, y1: number): number {
  if (y1 >= 1) return 0
  return Sm2 * (1 - y1) ** 2
}

/** Rang k (mehrrangig): L_k = S_mk × (1 − Σy_i)²  */
export function capacityMultiRank(Smk: number, sumY: number): number {
  if (sumY >= 1) return 0
  return Smk * (1 - sumY) ** 2
}

/** Kapazität nach Vortrittswechsel: L* = S_m × y_own / Σy  */
export function capacityAfterSwitch(Sm: number, ownY: number, totalY: number): number {
  if (totalY <= 0) return Sm
  return Sm * ownY / totalY
}

/** Schwellenwert für Vortrittswechsel: x* = y₁ + y₂  */
export function switchThreshold(y1: number, y2: number): number {
  return y1 + y2
}

// ── DelayCalculator ───────────────────────────────────────────────────────────

/**
 * @deprecated Formel stimmt nicht mit Abb. 4 / SN 640 022 überein — gibt w→0 bei a→0.
 * Ersetzt durch die Kimber-Hollis-Formel direkt in sn640022Calculator.ts (w-Funktion).
 * Funktion bleibt bis zur vollständigen Migration erhalten.
 *
 * Mittlere Wartezeit nach Kimber-Hollis (Abb. 4, SN 640 022 / VSS 2008/301 S. 10).
 * w(x,Q) = 900·T · [(x−1) − 4Cx/Q + √((x−1)² + 8C(x+1+2Cx/Q)/(Q/x))]
 * mit C = 1, T = 0.25 h
 */
export function delay(utilizationDegree: number, volume: number): number {
  if (volume <= 0) return 0
  const x = utilizationDegree
  if (x >= 1) return Infinity
  const T = 0.25
  const C = 1
  const inner = (x - 1) ** 2 + (8 * C * (x + 1 + 2 * C * x / volume)) / (volume / x)
  return 900 * T * ((x - 1) - 4 * C * x / volume + Math.sqrt(inner))
}

// ── QueueCalculator ───────────────────────────────────────────────────────────

/** Mittlere Staulänge: k = w · L / 3600  */
export function queueLength(delay: number, capacity: number): number {
  if (!isFinite(delay)) return Infinity
  return delay * capacity / 3600
}

// ── SaturationCalculator ─────────────────────────────────────────────────────

/** Sättigungsgrad: y = Q / S_m  */
export function saturationDegree(volume: number, maxSaturation: number): number {
  if (maxSaturation <= 0) return Infinity
  return volume / maxSaturation
}

/**
 * Kombinierter Sättigungsgrad paralleler Streifen:
 * y_a,b = y_a + y_b − y_a × y_b  (rekursiv für n Streifen)
 */
export function parallelSaturation(values: number[]): number {
  return values.reduce((combined, y) => combined + y - combined * y, 0)
}
