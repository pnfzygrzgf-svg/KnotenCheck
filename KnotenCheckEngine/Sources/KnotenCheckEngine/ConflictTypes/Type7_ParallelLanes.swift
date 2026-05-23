import Foundation

// Typ 7: Konflikt mit parallelen Fahrstreifen
// Parallele Streifen schliessen sich nicht gegenseitig aus.
// Kombinierter Sättigungsgrad: y_a,b = y_a + y_b - y_a × y_b
// Kombinierte Sättigung: S_a,b = ΣQ / y_a,b
// Kapazität pro Streifen basiert auf kombiniertem Sättigungsgrad im Konflikt mit Rang-2.
public struct Type7_ParallelLanes: ConflictCalculable {

    public init() {}

    public func calculate(streams: [TrafficStream]) -> ConflictOutput {
        let rank1 = streams.filter { $0.rank == .primary }
        let rank2 = streams.filter { $0.rank == .secondary }

        // Kombinierter Sättigungsgrad aller parallelen Rang-1-Streifen
        let y1Values = rank1.map(\.saturationDegree)
        let y1_combined = SaturationCalculator.parallelSaturation(values: y1Values)

        var results: [StreamResult] = []

        // Rang-1-Streifen: volle Kapazität
        for s in rank1 {
            let L = CapacityCalculator.capacityPrimary(maxSaturation: s.maxSaturation)
            results.append(makeResult(stream: s, capacity: L))
        }

        // Rang-2-Streifen: Kapazität auf Basis kombiniertem y₁
        for s in rank2 {
            let L = CapacityCalculator.capacitySecondary(Sm2: s.maxSaturation, y1: y1_combined)
            results.append(makeResult(stream: s, capacity: L))
        }

        return ConflictOutput(results: results)
    }
}
