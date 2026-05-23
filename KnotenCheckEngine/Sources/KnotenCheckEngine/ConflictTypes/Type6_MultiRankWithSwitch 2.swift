import Foundation

// Typ 6: Mehrrangiger Konflikt mit Vortrittswechsel
// Vortrittswechsel bei x* = Σy_i (alle Ränge)
// Nach Wechsel: L_i* = S_im × y_i / Σy_i
public struct Type6_MultiRankWithSwitch: ConflictCalculable {

    public init() {}

    public func calculate(streams: [TrafficStream]) -> ConflictOutput {
        let sorted = streams.sorted { $0.rank.rawValue < $1.rank.rawValue }
        guard let maxRank = sorted.last?.rank.rawValue else {
            return ConflictOutput(results: [])
        }

        let totalY = sorted.reduce(0.0) { $0 + $1.saturationDegree }
        let xStar = totalY

        // Prüfe ob Wechsel stattfindet:
        // Wechsel wenn Auslastungsgrad des letzten Rangs >= x*
        let lastRankStreams = sorted.filter { $0.rank.rawValue == maxRank }
        let y_lastRank = lastRankStreams.reduce(0.0) { $0 + $1.saturationDegree }
        let L_lastNoSwitch = lastRankStreams.first.map {
            let sumPrev = totalY - y_lastRank
            return CapacityCalculator.capacityMultiRank(Smk: $0.maxSaturation, sumY: sumPrev)
        } ?? 1.0
        let x_last = lastRankStreams.first.map { $0.volume / max(1, L_lastNoSwitch) } ?? 0

        let switchOccurs = x_last >= xStar || totalY >= 1.0

        var results: [StreamResult] = []

        if switchOccurs {
            for s in sorted {
                let L = CapacityCalculator.capacityAfterSwitch(Sm: s.maxSaturation, ownY: s.saturationDegree, totalY: totalY)
                results.append(makeResult(stream: s, capacity: L))
            }
        } else {
            // Ohne Wechsel: wie Typ 5
            var cumulativeY = 0.0
            for rankValue in 1...maxRank {
                let rankStreams = sorted.filter { $0.rank.rawValue == rankValue }
                let isLastRank = rankValue == maxRank

                for s in rankStreams {
                    if isLastRank {
                        let L = CapacityCalculator.capacityMultiRank(Smk: s.maxSaturation, sumY: cumulativeY)
                        results.append(makeResult(stream: s, capacity: L))
                    } else {
                        let L = CapacityCalculator.capacityPrimary(maxSaturation: s.maxSaturation)
                        results.append(makeResult(stream: s, capacity: L))
                        cumulativeY += s.saturationDegree
                    }
                }
            }
        }

        return ConflictOutput(results: results)
    }
}
