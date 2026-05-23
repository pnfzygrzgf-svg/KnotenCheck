import Foundation

public struct ConflictResolver {

    public init() {}

    public func resolve(group: ConflictGroup, streams: [TrafficStream]) -> ConflictOutput {
        let relevant: [TrafficStream] = streams
            .filter { group.streamIDs.contains($0.id) }
            .map { stream in
                guard let override = group.rankOverrides[stream.id] else { return stream }
                var s = stream
                s.rank = override
                return s
            }
        guard !relevant.isEmpty else {
            return ConflictOutput(results: [], warnings: ["Konfliktgruppe enthält keine Ströme"])
        }

        let calculator: any ConflictCalculable = switch group.conflictType {
        case .twoRankNoSwitch:   Type1_TwoRankNoSwitch()
        case .twoRankWithSwitch: Type2_TwoRankWithSwitch()
        case .multiRankNoSwitch:   Type5_MultiRankNoSwitch()
        case .multiRankWithSwitch: Type6_MultiRankWithSwitch()
        case .parallelLanes:     Type7_ParallelLanes()
        }

        return calculator.calculate(streams: relevant)
    }
}
