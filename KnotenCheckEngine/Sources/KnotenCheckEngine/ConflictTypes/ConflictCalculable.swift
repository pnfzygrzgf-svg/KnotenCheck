// Gemeinsames Protokoll aller 9 Konflikttypen
public protocol ConflictCalculable {
    func calculate(streams: [TrafficStream]) -> ConflictOutput
}

public struct ConflictOutput {
    public var results: [StreamResult]
    public var converged: Bool
    public var iterationCount: Int
    public var warnings: [String]

    public init(results: [StreamResult], converged: Bool = true, iterationCount: Int = 0, warnings: [String] = []) {
        self.results = results
        self.converged = converged
        self.iterationCount = iterationCount
        self.warnings = warnings
    }
}

// Hilfsfunktion: StreamResult aus Stream + berechneter Kapazität fertigstellen
func makeResult(stream: TrafficStream, capacity L: Double) -> StreamResult {
    var result = StreamResult(
        id: stream.id,
        saturationDegree: stream.saturationDegree,
        capacity: L,
        volume: stream.volume
    )
    let x = result.utilizationDegree
    result.delay = x.isFinite ? DelayCalculator.delay(utilizationDegree: x, volume: stream.volume) : .infinity
    result.queueLength = QueueCalculator.queueLength(delay: result.delay, capacity: L)
    result.levelOfService = LevelOfService.classify(delay: result.delay, utilizationDegree: x)
    return result
}
