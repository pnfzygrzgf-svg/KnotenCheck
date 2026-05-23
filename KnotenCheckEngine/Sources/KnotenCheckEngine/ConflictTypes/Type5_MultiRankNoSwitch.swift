import Foundation

// Typ 5: Mehrrangiger Konflikt (k Ränge) ohne Vortrittswechsel
// Ränge 1 bis k-1: Leistung L_{1→k-1} = S_{1→k-1} (zusammengefasster Vortrittsberechtigter)
// Rang k:          L_k = S_km × (1 - Σy_i)²
// Mit Σy_i = Summe Sättigungsgrade Ränge 1 bis k-1
public struct Type5_MultiRankNoSwitch: ConflictCalculable {

    public init() {}

    public func calculate(streams: [TrafficStream]) -> ConflictOutput {
        // Ströme nach Rang sortieren
        let sorted = streams.sorted { $0.rank.rawValue < $1.rank.rawValue }
        guard let maxRank = sorted.last?.rank.rawValue else {
            return ConflictOutput(results: [])
        }

        var results: [StreamResult] = []
        var cumulativeY = 0.0

        for rankValue in 1...maxRank {
            let rankStreams = sorted.filter { $0.rank.rawValue == rankValue }
            let isLastRank = rankValue == maxRank

            if isLastRank {
                // Rang k: vortrittsbelastet
                for s in rankStreams {
                    let L = CapacityCalculator.capacityMultiRank(Smk: s.maxSaturation, sumY: cumulativeY)
                    results.append(makeResult(stream: s, capacity: L))
                }
            } else {
                // Ränge 1 bis k-1: vortrittsberechtigend
                for s in rankStreams {
                    let L = CapacityCalculator.capacityPrimary(maxSaturation: s.maxSaturation)
                    results.append(makeResult(stream: s, capacity: L))
                    cumulativeY += s.saturationDegree
                }
            }
        }

        return ConflictOutput(results: results)
    }
}
