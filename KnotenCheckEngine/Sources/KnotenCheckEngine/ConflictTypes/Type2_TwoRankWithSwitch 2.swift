import Foundation

// Typ 2: Zweirangiger Konflikt mit Vortrittswechsel
// Ohne Wechsel: wie Typ 1
// Mit Wechsel bei x* = y₁ + y₂:
//   L₁* = S_m1 × y₁/(y₁+y₂)
//   L₂* = S_m2 × y₂/(y₁+y₂)
public struct Type2_TwoRankWithSwitch: ConflictCalculable {

    public init() {}

    public func calculate(streams: [TrafficStream]) -> ConflictOutput {
        let rank1 = streams.filter { $0.rank == .primary }
        let rank2 = streams.filter { $0.rank == .secondary }

        let y1 = rank1.reduce(0.0) { $0 + $1.saturationDegree }
        let y2 = rank2.reduce(0.0) { $0 + $1.saturationDegree }
        let totalY = y1 + y2

        // Prüfe ob Vortrittswechsel stattfindet (x* = y₁ + y₂)
        // Wechsel tritt auf wenn Auslastungsgrad > Schwellenwert
        let xStar = CapacityCalculator.switchThreshold(y1: y1, y2: y2)

        // Kapazität ohne Wechsel berechnen für Vergleich
        let L2_noSwitch = rank2.first.map { CapacityCalculator.capacitySecondary(Sm2: $0.maxSaturation, y1: y1) } ?? 0
        let x2_noSwitch = rank2.first.map { $0.volume / max(1, L2_noSwitch) } ?? 0

        let switchOccurs = x2_noSwitch >= xStar || totalY >= 1.0

        var results: [StreamResult] = []

        if switchOccurs {
            for s in rank1 {
                let L = CapacityCalculator.capacityAfterSwitch(Sm: s.maxSaturation, ownY: y1, totalY: totalY)
                results.append(makeResult(stream: s, capacity: L))
            }
            for s in rank2 {
                let L = CapacityCalculator.capacityAfterSwitch(Sm: s.maxSaturation, ownY: y2, totalY: totalY)
                results.append(makeResult(stream: s, capacity: L))
            }
        } else {
            for s in rank1 {
                let L = CapacityCalculator.capacityPrimary(maxSaturation: s.maxSaturation)
                results.append(makeResult(stream: s, capacity: L))
            }
            for s in rank2 {
                let L = CapacityCalculator.capacitySecondary(Sm2: s.maxSaturation, y1: y1)
                results.append(makeResult(stream: s, capacity: L))
            }
        }

        return ConflictOutput(results: results)
    }
}
