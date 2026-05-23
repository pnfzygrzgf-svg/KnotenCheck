public enum VehicleMode: String, CaseIterable, Codable, Sendable {
    case motorVehicle
    case pedestrian
    case tramOwnTrack
    case busOwnTrack
    case transitOneStop_NoOvertake
    case transitTwoStops_NoOvertake
    case transitThreeStops_NoOvertake
    case transitFourStops_NoOvertake
    case transitOneStop_Overtake
    case transitTwoStops_Overtake
    case transitThreeStops_Overtake
    case transitFourStops_Overtake

    public var displayName: String {
        switch self {
        case .motorVehicle:                  return "Fahrzeug"
        case .pedestrian:                    return "Fussgänger"
        case .tramOwnTrack:                  return "Tram (Eigentrasse)"
        case .busOwnTrack:                   return "Bus (Eigentrasse)"
        case .transitOneStop_NoOvertake:     return "ÖV 1 Halt. (kein Überholen)"
        case .transitTwoStops_NoOvertake:    return "ÖV 2 Halt. (kein Überholen)"
        case .transitThreeStops_NoOvertake:  return "ÖV 3 Halt. (kein Überholen)"
        case .transitFourStops_NoOvertake:   return "ÖV 4 Halt. (kein Überholen)"
        case .transitOneStop_Overtake:       return "ÖV 1 Halt. (mit Überholen)"
        case .transitTwoStops_Overtake:      return "ÖV 2 Halt. (mit Überholen)"
        case .transitThreeStops_Overtake:    return "ÖV 3 Halt. (mit Überholen)"
        case .transitFourStops_Overtake:     return "ÖV 4 Halt. (mit Überholen)"
        }
    }

    public var unit: String {
        switch self {
        case .motorVehicle:  return "Fz/h"
        case .pedestrian:    return "Fg/h"
        case .tramOwnTrack,
             .transitOneStop_NoOvertake, .transitTwoStops_NoOvertake,
             .transitThreeStops_NoOvertake, .transitFourStops_NoOvertake,
             .transitOneStop_Overtake, .transitTwoStops_Overtake,
             .transitThreeStops_Overtake, .transitFourStops_Overtake: return "T/h"
        case .busOwnTrack:   return "B/h"
        }
    }
}
