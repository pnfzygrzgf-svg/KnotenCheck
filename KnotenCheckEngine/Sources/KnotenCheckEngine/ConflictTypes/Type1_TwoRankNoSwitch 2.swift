import Foundation

// Typ 1: Zweirangiger ungesteuerter Konflikt ohne Vortrittswechsel
// Rang 1 (Vortrittsberechtigte): L₁ = S_m1
// Rang 2 (Vortrittsbelastete):   L₂ = S_m2 × (1 - y₁)²
public struct Type1_TwoRankNoSwitch: ConflictCalculable {

    public init() {}

    public func calculate(streams: [TrafficStream]) -> ConflictOutput {
        let rank1 = streams.filter { $0.rank == .primary }
        let rank2 = streams.filter { $0.rank == .secondary }

        // Kombinierter Sättigungsgrad aller Rang-1-Ströme
        let y1_total = rank1.reduce(0.0) { $0 + $1.saturationDegree }

        var results: [StreamResult] = []

        for s in rank1 {
            let L = CapacityCalculator.capacityPrimary(maxSaturation: s.maxSaturation)
            results.append(makeResult(stream: s, capacity: L))
        }

        for s in rank2 {
            let L = CapacityCalculator.capacitySecondary(Sm2: s.maxSaturation, y1: y1_total)
            results.append(makeResult(stream: s, capacity: L))
        }

        return ConflictOutput(results: results)
    }
}
