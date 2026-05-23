import Foundation
import KnotenCheckEngine

/// Neigungsverhältnis in Fahrtrichtung zum Knoten (SN 640 022, Abschnitt 8).
/// Positive Werte = Steigung (bergauf zum Knoten), negative = Gefälle.
enum GradientCategory: String, Codable, CaseIterable {
    case plus4  = "+4%"
    case plus2  = "+2%"
    case zero   = "±0%"
    case minus2 = "−2%"
    case minus4 = "−4%"

    /// Anzeigetext für die Picker-Auswahl.
    var label: String {
        switch self {
        case .plus4:  return "+4 % (starke Steigung bergauf)"
        case .plus2:  return "+2 % (leichte Steigung bergauf)"
        case .zero:   return "±0 % (eben)"
        case .minus2: return "−2 % (leichtes Gefälle bergab)"
        case .minus4: return "−4 % (starkes Gefälle bergab)"
        }
    }

    /// Tab. 1 — Fall 1 (Fahrzeugkategorien unbekannt), Formel [F9].
    var fFz: Double {
        switch self { case .plus4: return 1.7; case .plus2: return 1.4
                      case .zero:  return 1.1; case .minus2: return 1.0; case .minus4: return 0.9 }
    }

    /// Tab. 2 — Fall 2, Formel [F10]: Faktoren je Fahrzeugkategorie.
    var fPW: Double {
        switch self { case .plus4: return 1.4; case .plus2: return 1.2
                      case .zero:  return 1.0; case .minus2: return 0.9; case .minus4: return 0.8 }
    }
    var fLW: Double {
        switch self { case .plus4: return 3.0; case .plus2: return 2.0
                      case .zero:  return 1.5; case .minus2: return 1.2; case .minus4: return 1.0 }
    }
    var fLZ: Double {
        switch self { case .plus4: return 6.0; case .plus2: return 3.0
                      case .zero:  return 2.0; case .minus2: return 1.5; case .minus4: return 1.2 }
    }
    var fMR: Double {
        switch self { case .plus4: return 0.7; case .plus2: return 0.6
                      case .zero:  return 0.5; case .minus2: return 0.4; case .minus4: return 0.3 }
    }
    /// FR nur bei ±0% definiert (Tab. 2). Bei anderen Neigungen nicht anwendbar.
    var fFR: Double? { self == .zero ? 0.25 : nil }
}

/// Fahrzeugzusammensetzung eines Stroms — Fall 2 gemäss [F10].
/// Nur die Nicht-PW-Anteile werden gespeichert; PW = 100 − Σ Rest.
struct VehicleCategoryMix: Codable, Equatable {
    var pctLW: Double = 0   // Lastwagen [%]
    var pctLZ: Double = 0   // Lastzüge [%]
    var pctMR: Double = 0   // Motorräder [%]
    var pctFR: Double = 0   // Fahrräder (nur ±0%) [%]

    var pctPW: Double { max(0, 100 - pctLW - pctLZ - pctMR - pctFR) }
    var isValid: Bool { pctLW + pctLZ + pctMR + pctFR <= 100 }

    /// Effektiver Umrechnungsfaktor f nach [F10], normiert auf Gesamtanteil.
    func effectiveFactor(gradient: GradientCategory) -> Double {
        let fFR = gradient.fFR ?? 0.0
        let pw  = pctPW
        let tot = pw + pctLW + pctLZ + pctMR + pctFR
        guard tot > 0 else { return 1.0 }
        return (gradient.fPW * pw + gradient.fLW * pctLW
              + gradient.fLZ * pctLZ + gradient.fMR * pctMR
              + fFR * pctFR) / tot
    }
}

/// Physical configuration of one arm/approach of the intersection.
struct ArmConfiguration: Codable, Identifiable, Equatable {
    var id = UUID()
    var rank: ReferenceValues.Rank = .primary

    // Turning movement volumes [Fz/h]
    var leftVolume: Double = 100      // Linksabbieger
    var straightVolume: Double = 300  // Geradeausfahrer
    var rightVolume: Double = 100     // Rechtsabbieger

    /// Neigung in Fahrtrichtung zum Knoten.
    var gradient: GradientCategory = .zero
    /// Wenn gesetzt: Fall 2 ([F10]) mit bekannten Fahrzeugkategorien.
    /// Wenn nil: Fall 1 ([F9], Tab. 1).
    var vehicleMix: VehicleCategoryMix? = nil
    /// Fn 1: Separater Streifen für HS-Rechtsabbieger → NS.
    /// A: q3f=0 in F3/F5/F7. C: q9f=0 in F4/F6/F8.
    var hasSeparateTurnLane: Bool = false

    /// Fn 2: Separater Linksabbiegestreifen auf der HS → mehr als 1 Streifen.
    /// Linksabbieger (Strom 1/7) stehen dem Geradeaus-/Rechtsabbieger-Verkehr nicht im Weg.
    /// NS gibt nur dem rechten Fahrstreifen Vortritt → nur dieser Wert [Fz/h] in F3/F4.
    /// nil = einspurig (kein separater Linksabbiegestreifen).
    var rightLaneVolume: Double? = nil

    /// Fn 3: Dreiecksinsel für HS-Rechtsabbieger mit «Kein Vortritt» oder «Stop».
    /// A: q3g=0 in F2/F6. C: q9g=0 in F1/F5.
    var hasRightTurnTriangleIsland: Bool = false

    /// Mischstreifen-Kombination (nur NS-Arme bei 4-armiger Kreuzung, Abschn. 13 [F21]).
    /// Bestimmt welche NS-Ströme eine gemeinsame Wartelinie teilen.
    /// Bei Einmündung (3-armig) immer 4+6 — dieser Wert wird ignoriert.
    var mixedLaneCombination: SN640022LaneFlags.MixedLaneCombination = .all

    /// Fussgängerstreifen an der Zufahrt dieses Arms (Schätzverfahren).
    /// Fussgänger haben Vortritt (Rang 1) gegenüber allen Fahrzeugen dieses Arms.
    var hasPedestrianCrossing: Bool = false
    var pedestrianVolume: Double = 0   // [Fg/h]
    /// Mittelinsel teilt den Streifen in zwei selbstständige Übergänge (VRV Art. 47 Abs. 3).
    var hasMittelinsel: Bool = false

    /// Effektiver Umrechnungsfaktor Fz/h → PWE/h nach Abschnitt 8.
    var fFactor: Double {
        vehicleMix?.effectiveFactor(gradient: gradient) ?? gradient.fFz
    }

    var totalVolume: Double { leftVolume + straightVolume + rightVolume }
}

/// High-level element-based description of an intersection.
struct IntersectionConfiguration: Codable, Equatable {
    var name: String = "Neuer Knoten"
    var arms: [ArmConfiguration]

    init(name: String = "Neuer Knoten", armCount: Int = 4) {
        self.name = name
        self.arms = (0..<armCount).map { i in
            ArmConfiguration(rank: i < 2 ? .primary : .secondary,
                             leftVolume: i < 2 ? 100 : 80,
                             straightVolume: i < 2 ? 400 : 0,
                             rightVolume: i < 2 ? 100 : 80)
        }
    }

    var armCount: Int { arms.count }

    /// Gibt zurück ob mindestens ein Arm eine erweiterte Konfiguration hat,
    /// die in der Schematik mehr Platz benötigt (Mehrstreifen, Dreiecksinsel).
    var hasDetailedLaneConfig: Bool {
        arms.contains {
            $0.rightLaneVolume != nil ||
            $0.hasRightTurnTriangleIsland ||
            $0.hasSeparateTurnLane ||
            $0.mixedLaneCombination != .all
        }
    }

    mutating func setArmCount(_ n: Int) {
        while arms.count < n {
            let i = arms.count
            arms.append(ArmConfiguration(rank: i < 2 ? .primary : .secondary,
                                         leftVolume: i < 2 ? 100 : 80,
                                         straightVolume: i < 2 ? 400 : 0,
                                         rightVolume: i < 2 ? 100 : 80))
        }
        if arms.count > n { arms = Array(arms.prefix(n)) }
    }

    func label(for index: Int) -> String {
        // SN 640 022: A = HS links, C = HS rechts, B = NS unten, D = NS oben
        let letters = ["A", "C", "B", "D", "E"]
        return index < letters.count ? letters[index] : "\(index + 1)"
    }

    // MARK: - Available movements per arm

    /// Returns the movement descriptions for arm[armIndex] given the current arm count.
    struct Movement {
        let name: String
        let keyPath: WritableKeyPath<ArmConfiguration, Double>
        let yieldsTo: [Int]    // arm indices this movement yields to
        let destination: Int   // arm index this movement goes to
    }

    func movements(for armIndex: Int) -> [Movement] {
        let n = arms.count
        guard n == 3 || n == 4 else { return [] }

        if n == 3 {
            switch armIndex {
            case 0: // A (HS): gerade→C, rechts→B
                return [
                    Movement(name: "Geradeaus → C", keyPath: \.straightVolume, yieldsTo: [],     destination: 1),
                    Movement(name: "Rechts → B",    keyPath: \.rightVolume,    yieldsTo: [],     destination: 2),
                ]
            case 1: // C (HS): gerade→A, links→B
                return [
                    Movement(name: "Geradeaus → A", keyPath: \.straightVolume, yieldsTo: [],     destination: 0),
                    Movement(name: "Links → B",     keyPath: \.leftVolume,     yieldsTo: [0],    destination: 2),
                ]
            case 2: // B (NS): links→A, rechts→C
                return [
                    Movement(name: "Links → A",  keyPath: \.leftVolume,     yieldsTo: [0, 1], destination: 0),
                    Movement(name: "Rechts → C", keyPath: \.rightVolume,    yieldsTo: [0],    destination: 1),
                ]
            default: return []
            }
        } else {
            switch armIndex {
            case 0: // A (HS): gerade→C, rechts→B, links→D
                return [
                    Movement(name: "Geradeaus → C", keyPath: \.straightVolume, yieldsTo: [],     destination: 1),
                    Movement(name: "Rechts → B",    keyPath: \.rightVolume,    yieldsTo: [],     destination: 2),
                    Movement(name: "Links → D",     keyPath: \.leftVolume,     yieldsTo: [1],    destination: 3),
                ]
            case 1: // C (HS): gerade→A, links→B, rechts→D
                return [
                    Movement(name: "Geradeaus → A", keyPath: \.straightVolume, yieldsTo: [],     destination: 0),
                    Movement(name: "Links → B",     keyPath: \.leftVolume,     yieldsTo: [0],    destination: 2),
                    Movement(name: "Rechts → D",    keyPath: \.rightVolume,    yieldsTo: [],     destination: 3),
                ]
            case 2: // B (NS): gerade→D, links→A, rechts→C
                return [
                    Movement(name: "Geradeaus → D", keyPath: \.straightVolume, yieldsTo: [0, 1], destination: 3),
                    Movement(name: "Links → A",     keyPath: \.leftVolume,     yieldsTo: [0, 1], destination: 0),
                    Movement(name: "Rechts → C",    keyPath: \.rightVolume,    yieldsTo: [0],    destination: 1),
                ]
            case 3: // D (NS): gerade→B, rechts→A, links→C
                return [
                    Movement(name: "Geradeaus → B", keyPath: \.straightVolume, yieldsTo: [0, 1], destination: 2),
                    Movement(name: "Rechts → A",    keyPath: \.rightVolume,    yieldsTo: [1],    destination: 0),
                    Movement(name: "Links → C",     keyPath: \.leftVolume,     yieldsTo: [0, 1], destination: 1),
                ]
            default: return []
            }
        }
    }

    // MARK: - SN 640 022 Streifenflags

    var snLaneFlags: SN640022LaneFlags {
        let a = arms.count > 0 ? arms[0] : nil   // Arm A (HS links)
        let c = arms.count > 1 ? arms[1] : nil   // Arm C (HS rechts)
        let b = arms.count > 2 ? arms[2] : nil   // Arm B (NS unten)
        let d = arms.count > 3 ? arms[3] : nil   // Arm D (NS oben)
        return SN640022LaneFlags(
            mixedB:             b?.mixedLaneCombination      ?? .all,
            mixedD:             d?.mixedLaneCombination      ?? .all,
            armASeparateLane:   a?.hasSeparateTurnLane       ?? false,
            armCSeparateLane:   c?.hasSeparateTurnLane       ?? false,
            armAQ2Override:     a?.rightLaneVolume,
            armCQ8Override:     c?.rightLaneVolume,
            armATriangleIsland: a?.hasRightTurnTriangleIsland ?? false,
            armCTriangleIsland: c?.hasRightTurnTriangleIsland ?? false,
            armBRightIsland:    b?.hasRightTurnTriangleIsland ?? false,
            armDRightIsland:    d?.hasRightTurnTriangleIsland ?? false
        )
    }

    // MARK: - SN 640 022 Volumen-Matrix

    /// Baut die volumes[i][j]-Matrix für den SN640022Calculator.
    /// Arm-Reihenfolge: arm[0]=SN A (HS), arm[1]=SN C (HS), arm[2]=SN B (NS)[, arm[3]=SN D (NS)].
    /// Gibt nil zurück wenn armCount ≠ 3 oder 4.
    func toSNVolumes() -> [[Double]]? {
        let n = arms.count
        guard n == 3 || n == 4 else { return nil }
        var v = [[Double]](repeating: [Double](repeating: 0.0, count: n), count: n)
        // Konvertierung Fz/h → PWE/h je Arm: Fall 1 [F9] oder Fall 2 [F10]
        let f = arms.map { $0.fFactor }

        if n == 3 {
            // A (arm 0): gerade→C (q2), rechts→B (q3)
            v[0][1] = f[0] * arms[0].straightVolume; v[0][2] = f[0] * arms[0].rightVolume
            // C (arm 1): gerade→A (q8), links→B (q7)
            v[1][0] = f[1] * arms[1].straightVolume; v[1][2] = f[1] * arms[1].leftVolume
            // B (arm 2): links→A (q4), rechts→C (q6)
            v[2][0] = f[2] * arms[2].leftVolume;     v[2][1] = f[2] * arms[2].rightVolume
        } else {
            // A (arm 0): gerade→C (q2), rechts→B (q3), links→D (q1)
            v[0][1] = f[0] * arms[0].straightVolume; v[0][2] = f[0] * arms[0].rightVolume; v[0][3] = f[0] * arms[0].leftVolume
            // C (arm 1): gerade→A (q8), links→B (q7), rechts→D (q9)
            v[1][0] = f[1] * arms[1].straightVolume; v[1][2] = f[1] * arms[1].leftVolume;  v[1][3] = f[1] * arms[1].rightVolume
            // B (arm 2): links→A (q4), rechts→C (q6), gerade→D (q5)
            v[2][0] = f[2] * arms[2].leftVolume;     v[2][1] = f[2] * arms[2].rightVolume; v[2][3] = f[2] * arms[2].straightVolume
            // D (arm 3): rechts→A (q12), links→C (q10), gerade→B (q11)
            v[3][0] = f[3] * arms[3].rightVolume;    v[3][1] = f[3] * arms[3].leftVolume;  v[3][2] = f[3] * arms[3].straightVolume
        }
        return v
    }

    // MARK: - Conversion to engine model (für erweiterte Berechnung)

    func toIntersectionNode() -> IntersectionNode {
        var node = IntersectionNode(name: name.isEmpty ? "Neuer Knoten" : name)

        // Rolle wird immer nach Position bestimmt (SN 640 022: Arm 0=A und 1=C sind HS).
        // Das gespeicherte arm.rank-Feld wird ignoriert, damit Altdaten keinen Einfluss haben.
        let isHS: (Int) -> Bool = { $0 < 2 }

        // T1 (Fn 1): Wenn HS-Arm einen separaten Rechtsabbiegestreifen hat,
        // entfällt das Rechtsabbieger-Volumen aus dem konkurrierenden Hauptstrom.
        var armStreams: [TrafficStream] = []
        for (i, arm) in arms.enumerated() {
            let f = arm.fFactor
            let effectiveVol: Double
            if isHS(i) && arm.hasSeparateTurnLane {
                effectiveVol = (arm.straightVolume + arm.leftVolume) * f
            } else {
                effectiveVol = arm.totalVolume * f
            }
            let streamRank: ReferenceValues.Rank = isHS(i) ? .primary : .secondary
            var s = TrafficStream(name: "Arm \(label(for: i))",
                                  rank: streamRank, mode: .motorVehicle, volume: effectiveVol)
            s.armLabel = label(for: i)
            armStreams.append(s)
        }

        var subStreams: [TrafficStream] = []
        var conflictGroups: [ConflictGroup] = []
        var mixedLaneGroups: [MixedLaneGroup] = []
        var armSubIDs: [[UUID]] = Array(repeating: [], count: arms.count)

        for (i, arm) in arms.enumerated() {
            let mvs = movements(for: i)
            var laneSubIDs: [UUID] = []

            for mv in mvs {
                let vol = arm[keyPath: mv.keyPath] * arm.fFactor
                let subRank: ReferenceValues.Rank = isHS(i) ? .primary : .secondary
                var sub = TrafficStream(
                    name: "\(label(for: i)) \(mv.name)",
                    rank: subRank,
                    mode: .motorVehicle,
                    volume: vol,
                    isAuxiliary: true
                )
                sub.armLabel = label(for: i)
                subStreams.append(sub)
                laneSubIDs.append(sub.id)

                for priorityIdx in mv.yieldsTo where priorityIdx < armStreams.count {
                    let priorityArm = arms[priorityIdx]

                    // T2 (Fn 2): NS-Rechtseinbieger gibt nur dem rechten HS-Fahrstreifen Vortritt.
                    // Für alle anderen NS-Ströme gilt die volle (T1-bereinigte) Hauptstrombelastung.
                    if mv.keyPath == \.rightVolume,
                       let rightLane = priorityArm.rightLaneVolume,
                       isHS(priorityIdx) {
                        var rightLaneStream = TrafficStream(
                            name: "Arm \(label(for: priorityIdx)) Rechtsstreifen",
                            rank: .primary, mode: .motorVehicle,
                            volume: rightLane * priorityArm.fFactor,
                            isAuxiliary: true
                        )
                        rightLaneStream.armLabel = label(for: priorityIdx)
                        subStreams.append(rightLaneStream)
                        conflictGroups.append(ConflictGroup(
                            streamIDs: [rightLaneStream.id, sub.id],
                            conflictType: .twoRankNoSwitch,
                            rankOverrides: [rightLaneStream.id: .primary, sub.id: .secondary]
                        ))
                    } else {
                        conflictGroups.append(ConflictGroup(
                            streamIDs: [armStreams[priorityIdx].id, sub.id],
                            conflictType: .twoRankNoSwitch,
                            rankOverrides: [armStreams[priorityIdx].id: .primary, sub.id: .secondary]
                        ))
                    }
                }
            }

            armSubIDs[i] = laneSubIDs
            mixedLaneGroups.append(MixedLaneGroup(
                name: "Arm \(label(for: i))",
                armStreamID: armStreams[i].id,
                subStreamIDs: laneSubIDs
            ))
        }

        // Fussgängerstreifen
        // Ohne Mittelinsel: Fg vs. alle Fz auf beiden Spuren (einfahrend + ausfahrend).
        // Mit Mittelinsel (VRV Art. 47 Abs. 3): K1 (Gegenrichtung) und K2 (Zufahrt) unabhängig —
        // mathematisch identische Formel, aber die Konflikte sind eigenständig.
        var pedestrianStreams: [TrafficStream] = []
        for (i, arm) in arms.enumerated() {
            guard arm.hasPedestrianCrossing && arm.pedestrianVolume > 0 else { continue }

            var fg = TrafficStream(
                name: "Fg \(label(for: i))",
                rank: .primary,
                mode: .pedestrian,
                volume: arm.pedestrianVolume
            )
            fg.armLabel = label(for: i)
            pedestrianStreams.append(fg)

            // K2: eigene Sub-Streams (Fahrzeuge die von Arm i wegfahren)
            let k2IDs = armSubIDs[i]

            // K1: Sub-Streams anderer Arme die ZU Arm i fahren (Gegenverkehr)
            var k1IDs: [UUID] = []
            for (j, _) in arms.enumerated() where j != i {
                let jMvs = movements(for: j)
                for (k, mv) in jMvs.enumerated() where mv.destination == i {
                    if k < armSubIDs[j].count {
                        k1IDs.append(armSubIDs[j][k])
                    }
                }
            }

            func addFgConflict(_ subID: UUID) {
                conflictGroups.append(ConflictGroup(
                    streamIDs: [fg.id, subID],
                    conflictType: .twoRankNoSwitch,
                    rankOverrides: [fg.id: .primary, subID: .secondary]
                ))
            }

            // K1 und K2 werden immer einzeln verknüpft (mit oder ohne Mittelinsel).
            // Der Unterschied: mit Mittelinsel sind sie per Gesetz eigenständig,
            // ohne Mittelinsel blockiert Fg beide Richtungen gleichzeitig —
            // die Kapazitätsformel (L = S_m2 × (1-y_fg)²) ist in beiden Fällen identisch.
            for subID in k1IDs { addFgConflict(subID) }
            for subID in k2IDs { addFgConflict(subID) }
        }

        node.streams = armStreams + subStreams + pedestrianStreams
        node.conflictGroups = conflictGroups
        node.mixedLaneGroups = mixedLaneGroups
        return node
    }
}
