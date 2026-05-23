import Foundation

public struct ConflictGroup: Identifiable, Codable, Sendable {
    public let id: UUID
    public var streamIDs: [UUID]
    public var conflictType: ConflictType
    public var rankOverrides: [UUID: ReferenceValues.Rank]

    public init(
        id: UUID = UUID(),
        streamIDs: [UUID],
        conflictType: ConflictType,
        rankOverrides: [UUID: ReferenceValues.Rank] = [:]
    ) {
        self.id = id
        self.streamIDs = streamIDs
        self.conflictType = conflictType
        self.rankOverrides = rankOverrides
    }

    public func effectiveRank(for stream: TrafficStream) -> ReferenceValues.Rank {
        rankOverrides[stream.id] ?? stream.rank
    }
}

/// Fasst die Teilströme einer physischen Fahrspur zusammen.
/// Die Engine kombiniert nach der Einzelberechnung alle Teilstrom-Ergebnisse
/// und schreibt das Gesamtergebnis in den Haupt-Armstrom (armStreamID).
public struct MixedLaneGroup: Identifiable, Codable, Sendable {
    public let id: UUID
    public var name: String
    public var armStreamID: UUID
    public var subStreamIDs: [UUID]

    public init(id: UUID = UUID(), name: String, armStreamID: UUID, subStreamIDs: [UUID]) {
        self.id = id
        self.name = name
        self.armStreamID = armStreamID
        self.subStreamIDs = subStreamIDs
    }
}

public struct IntersectionNode: Identifiable, Codable, Sendable {
    public let id: UUID
    public var name: String
    public var streams: [TrafficStream]
    public var conflictGroups: [ConflictGroup]
    public var mixedLaneGroups: [MixedLaneGroup]

    public init(
        id: UUID = UUID(),
        name: String,
        streams: [TrafficStream] = [],
        conflictGroups: [ConflictGroup] = [],
        mixedLaneGroups: [MixedLaneGroup] = []
    ) {
        self.id = id
        self.name = name
        self.streams = streams
        self.conflictGroups = conflictGroups
        self.mixedLaneGroups = mixedLaneGroups
    }

    public func stream(for id: UUID) -> TrafficStream? {
        streams.first { $0.id == id }
    }

    public func validatePriorityGraph() -> [String] {
        var errors: [String] = []
        for stream in streams {
            for dominatingID in stream.dominatingStreamIDs {
                if let dominator = self.stream(for: dominatingID) {
                    if dominator.dominatingStreamIDs.contains(stream.id) {
                        errors.append("Zyklischer Vortritt zwischen '\(stream.name)' und '\(dominator.name)'")
                    }
                }
            }
        }
        return errors
    }
}
