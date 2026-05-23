import Foundation

public enum CapacityCalculator {

    // Rang 1 (vortrittsberechtigend): L₁ = S_m1
    public static func capacityPrimary(maxSaturation Sm1: Double) -> Double {
        return Sm1
    }

    // Zweirangig Rang 2 (ohne Vortrittswechsel): L₂ = S_m2 × (1 − y₁)²
    public static func capacitySecondary(Sm2: Double, y1: Double) -> Double {
        let freeFraction = 1.0 - y1
        guard freeFraction > 0 else { return 0 }
        return Sm2 * freeFraction * freeFraction
    }

    // Mehrrangig Rang k (ohne Vortrittswechsel): L_k = S_mk × (1 − Σy_i)²
    public static func capacityMultiRank(Smk: Double, sumY: Double) -> Double {
        let freeFraction = 1.0 - sumY
        guard freeFraction > 0 else { return 0 }
        return Smk * freeFraction * freeFraction
    }

    // Vortrittswechsel: L_i* = S_mi × y_i / (y₁ + y₂)
    public static func capacityAfterSwitch(Sm: Double, ownY: Double, totalY: Double) -> Double {
        guard totalY > 0 else { return 0 }
        return Sm * ownY / totalY
    }

    // Schwellenwert Vortrittswechsel: x* = y₁ + y₂
    public static func switchThreshold(y1: Double, y2: Double) -> Double {
        return y1 + y2
    }

    // Typ 7: Kombinierte Sättigung paralleler Streifen
    public static func capacityParallelLanes(totalVolume Q: Double, combinedSaturation y: Double) -> Double {
        guard y > 0 else { return 0 }
        return Q / y
    }
}
