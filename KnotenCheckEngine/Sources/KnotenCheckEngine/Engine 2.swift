import Foundation

public struct KnotenCheckEngine {

    public init() {}

    public func analyze(node: IntersectionNode) -> NodeResult {
        let validationErrors = node.validatePriorityGraph()
        if !validationErrors.isEmpty {
            return NodeResult(
                nodeID: node.id,
                streamResults: [],
                converged: false,
                warnings: validationErrors
            )
        }

        let resolver = ConflictResolver()
        var allResults: [StreamResult] = []
        var allConverged = true
        var totalIterations = 0
        var allWarnings: [String] = []

        // Alle Konfliktgruppen auflösen
        for group in node.conflictGroups {
            let output = resolver.resolve(group: group, streams: node.streams)
            allResults.append(contentsOf: output.results)
            if !output.converged { allConverged = false }
            totalIterations += output.iterationCount
            allWarnings.append(contentsOf: output.warnings)
        }

        // Ströme ohne Konfliktgruppe: volle Kapazität (Rang 1)
        let assignedStreamIDs = Set(node.conflictGroups.flatMap(\.streamIDs))
        for stream in node.streams where !assignedStreamIDs.contains(stream.id) {
            let L = CapacityCalculator.capacityPrimary(maxSaturation: stream.maxSaturation)
            allResults.append(makeResult(stream: stream, capacity: L))
        }

        // Massgebende Leistung (VSS 2008/301, S. 50): bei mehreren Teilkonflikten
        // pro Strom zählt das restriktivste Ergebnis (minimale Kapazität).
        var seen: [UUID: Int] = [:]
        var deduped: [StreamResult] = []
        for r in allResults {
            if let idx = seen[r.id] {
                if r.capacity < deduped[idx].capacity { deduped[idx] = r }
            } else {
                seen[r.id] = deduped.count
                deduped.append(r)
            }
        }
        allResults = deduped

        // Fahrspurergebnisse: Teilstrom-Ergebnisse zu Arm-Ergebnis kombinieren.
        // x_M = Σ(Q_i / L_i),  L_M = Q_M / x_M — VSS 2008/301, S. 19-20
        for group in node.mixedLaneGroups {
            let subStreams = group.subStreamIDs.compactMap { node.stream(for: $0) }
            guard !subStreams.isEmpty else { continue }

            let Q_M = subStreams.reduce(0.0) { $0 + $1.volume }
            guard Q_M > 0 else { continue }

            let sumQoverL = subStreams.reduce(0.0) { acc, sub in
                let L_i = allResults.first(where: { $0.id == sub.id })?.capacity ?? sub.maxSaturation
                return acc + sub.volume / max(L_i, 1.0)
            }

            let x_M  = sumQoverL
            let L_M  = Q_M / max(x_M, 1e-9)
            let w_M  = DelayCalculator.delay(utilizationDegree: x_M, volume: Q_M)
            let k_M  = QueueCalculator.queueLength(delay: w_M, capacity: L_M)
            let los  = LevelOfService.classify(delay: w_M, utilizationDegree: x_M)

            if let idx = allResults.firstIndex(where: { $0.id == group.armStreamID }) {
                allResults[idx].capacity         = L_M
                allResults[idx].utilizationDegree = x_M
                allResults[idx].delay            = w_M
                allResults[idx].queueLength      = k_M
                allResults[idx].levelOfService   = los
            } else if let armStream = node.stream(for: group.armStreamID) {
                var r = StreamResult(id: group.armStreamID,
                                     saturationDegree: armStream.saturationDegree,
                                     capacity: L_M, volume: Q_M)
                r.utilizationDegree = x_M
                r.delay             = w_M
                r.queueLength       = k_M
                r.levelOfService    = los
                allResults.append(r)
            }
        }

        return NodeResult(
            nodeID: node.id,
            streamResults: allResults,
            converged: allConverged,
            iterationCount: totalIterations,
            warnings: allWarnings
        )
    }
}
