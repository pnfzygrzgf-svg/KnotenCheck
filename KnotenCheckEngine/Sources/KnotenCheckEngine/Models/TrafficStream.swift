import Foundation

public struct TrafficStream: Identifiable, Codable, Sendable {
    public let id: UUID
    public var name: String
    public var rank: ReferenceValues.Rank
    public var mode: VehicleMode
    public var volume: Double           // Q [Einheit/h]

    public var dominatingStreamIDs: [UUID]

    /// Arm-Bezeichnung für die UI-Darstellung (z.B. "A", "B", "C", "D").
    public var armLabel: String?

    /// Hilfsstrom (Teilstrom einer Fahrspur) — wird in der UI nicht direkt angezeigt.
    public var isAuxiliary: Bool

    public init(
        id: UUID = UUID(),
        name: String,
        rank: ReferenceValues.Rank,
        mode: VehicleMode,
        volume: Double,
        dominatingStreamIDs: [UUID] = [],
        isAuxiliary: Bool = false
    ) {
        self.id = id
        self.name = name
        self.rank = rank
        self.mode = mode
        self.volume = volume
        self.dominatingStreamIDs = dominatingStreamIDs
        self.isAuxiliary = isAuxiliary
    }

    public var maxSaturation: Double {
        ReferenceValues.maxSaturation(mode: mode, rank: rank)
    }

    public var saturationDegree: Double {
        volume / maxSaturation
    }
}
