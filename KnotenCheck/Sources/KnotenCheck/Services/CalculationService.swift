import Foundation
import KnotenCheckEngine

@MainActor
@Observable
final class CalculationService {
    var result: NodeResult?
    var snResult: SN640022Result?
    var isCalculating = false
    var errorMessage: String?

    private var currentTask: Task<Void, Never>?

    func calculate(node: IntersectionNode,
                   snVolumes: [[Double]]? = nil,
                   snLaneFlags: SN640022LaneFlags = .init()) async {
        currentTask?.cancel()
        isCalculating = true
        errorMessage = nil

        let nodeSnapshot = node
        let snVols       = snVolumes
        let flags        = snLaneFlags

        let task = Task.detached(priority: .userInitiated) {
            let vss = KnotenCheckEngine().analyze(node: nodeSnapshot)
            let sn: SN640022Result? = snVols.map {
                SN640022Calculator().analyze(volumes: $0, laneFlags: flags)
            }
            return (vss, sn)
        }
        currentTask = Task {
            let (vssResult, snCalc) = await task.value
            guard !Task.isCancelled else { return }
            result       = vssResult
            snResult     = snCalc
            isCalculating = false
            if !vssResult.warnings.isEmpty {
                errorMessage = vssResult.warnings.joined(separator: "\n")
            }
        }
        await currentTask?.value
    }

    func reset() {
        currentTask?.cancel()
        currentTask = nil
        result      = nil
        snResult    = nil
        isCalculating = false
        errorMessage  = nil
    }
}
