import Foundation

public enum LevelOfService: String, Codable, Sendable, CaseIterable {
    case A, B, C, D, E, F

    // Klassifikation nach SN 640 022, Tab. 3: mittlere Wartezeit w [s]
    // F wird bei Überlastung (x ≥ 1) gesetzt, bevor diese Funktion aufgerufen wird.
    public static func classify(delay w: Double, utilizationDegree x: Double) -> LevelOfService {
        guard x < 1.0, w.isFinite else { return .F }
        switch w {
        case ..<10:  return .A
        case ..<15:  return .B
        case ..<25:  return .C
        case ..<45:  return .D  // SN 640 022: D = 25–45 s
        default:     return .E  // w ≥ 45 s
        }
    }

    public var label: String {
        switch self {
        case .A: return "Sehr gut"
        case .B: return "Sehr gut"
        case .C: return "Gut"
        case .D: return "Ausreichend"
        case .E: return "Kritisch"
        case .F: return "Überlastet"
        }
    }
}

public struct StreamResult: Identifiable, Codable, Sendable {
    public let id: UUID                     // entspricht TrafficStream.id
    public var saturationDegree: Double     // y = Q / S_m
    public var capacity: Double             // L [Einheit/h]
    public var utilizationDegree: Double    // x = Q / L
    public var delay: Double                // w [s], .infinity bei Überlast
    public var queueLength: Double          // k [Fz]
    public var levelOfService: LevelOfService

    public init(
        id: UUID,
        saturationDegree: Double,
        capacity: Double,
        volume: Double
    ) {
        self.id = id
        self.saturationDegree = saturationDegree
        self.capacity = max(0, capacity)
        self.utilizationDegree = capacity > 0 ? volume / capacity : .infinity
        self.delay = 0
        self.queueLength = 0
        self.levelOfService = .A  // wird in makeResult() nach delay-Berechnung überschrieben
    }
}

public struct NodeResult: Identifiable, Codable, Sendable {
    public let id: UUID
    public let nodeID: UUID
    public var streamResults: [StreamResult]
    public var calculationDate: Date
    public var converged: Bool
    public var iterationCount: Int
    public var warnings: [String]

    public init(nodeID: UUID, streamResults: [StreamResult], converged: Bool = true, iterationCount: Int = 0, warnings: [String] = []) {
        self.id = UUID()
        self.nodeID = nodeID
        self.streamResults = streamResults
        self.calculationDate = Date()
        self.converged = converged
        self.iterationCount = iterationCount
        self.warnings = warnings
    }

    public var worstLevelOfService: LevelOfService {
        streamResults.map(\.levelOfService).max(by: { $0.rawValue < $1.rawValue }) ?? .A
    }
}
