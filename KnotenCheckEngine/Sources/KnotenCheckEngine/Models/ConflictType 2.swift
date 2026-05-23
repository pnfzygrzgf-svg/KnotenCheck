public enum ConflictType: Int, CaseIterable, Codable, Sendable {
    case twoRankNoSwitch   = 1
    case twoRankWithSwitch = 2
    case multiRankNoSwitch = 5
    case multiRankWithSwitch = 6
    case parallelLanes     = 7

    public var displayName: String {
        switch self {
        case .twoRankNoSwitch:   return "Zweirangig (ohne Vortrittswechsel)"
        case .twoRankWithSwitch: return "Zweirangig (mit Vortrittswechsel)"
        case .multiRankNoSwitch:   return "Mehrrangig (ohne Vortrittswechsel)"
        case .multiRankWithSwitch: return "Mehrrangig (mit Vortrittswechsel)"
        case .parallelLanes:     return "Parallele Fahrstreifen"
        }
    }
}
