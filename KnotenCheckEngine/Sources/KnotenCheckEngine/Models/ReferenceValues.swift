// Richtwerte für die maximale Sättigung gemäss VSS-Norm (Tabelle S. 9)
public enum ReferenceValues {

    public enum Rank: Int, Codable, Sendable {
        case primary = 1    // Vortrittsberechtigter
        case secondary = 2  // Vortrittsbelasteter
    }

    public static func maxSaturation(mode: VehicleMode, rank: Rank) -> Double {
        switch (mode, rank) {

        // Fahrzeuge
        case (.motorVehicle, .primary):   return 1800
        case (.motorVehicle, .secondary): return 1500

        // Fussgänger (nur vortrittsberechtigend relevant; S_m2 nicht anwendbar)
        case (.pedestrian, .primary):     return 2500
        case (.pedestrian, .secondary):   return 2500

        // Tram Eigentrasse
        case (.tramOwnTrack, .primary):   return 360
        case (.tramOwnTrack, .secondary): return 300

        // Bus Eigentrasse
        case (.busOwnTrack, .primary):    return 720
        case (.busOwnTrack, .secondary):  return 600

        // ÖV kein Überholen
        case (.transitOneStop_NoOvertake, .primary):    return 120
        case (.transitTwoStops_NoOvertake, .primary):   return 180
        case (.transitThreeStops_NoOvertake, .primary): return 245
        case (.transitFourStops_NoOvertake, .primary):  return 305

        case (.transitOneStop_NoOvertake, .secondary):    return 100
        case (.transitTwoStops_NoOvertake, .secondary):   return 150
        case (.transitThreeStops_NoOvertake, .secondary): return 205
        case (.transitFourStops_NoOvertake, .secondary):  return 255

        // ÖV mit Überholen
        case (.transitOneStop_Overtake, .primary):    return 120
        case (.transitTwoStops_Overtake, .primary):   return 190
        case (.transitThreeStops_Overtake, .primary): return 255
        case (.transitFourStops_Overtake, .primary):  return 320

        case (.transitOneStop_Overtake, .secondary):    return 100
        case (.transitTwoStops_Overtake, .secondary):   return 155
        case (.transitThreeStops_Overtake, .secondary): return 215
        case (.transitFourStops_Overtake, .secondary):  return 265
        }
    }
}
