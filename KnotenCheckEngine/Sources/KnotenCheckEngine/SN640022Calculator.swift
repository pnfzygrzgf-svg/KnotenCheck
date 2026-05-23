import Foundation

// MARK: - Ergebnis-Typen

public struct SN640022StreamResult: Identifiable, Sendable {
    public let id: UUID
    public let streamNumber: Int       // SN-Stromnummer 1–12
    public let name: String
    public let rang: Int               // 1–4
    public let volumeFzh: Double       // q_i [Fz/h] (Eingabe)
    public let qpi: Double             // massgebende Hauptstrombelastung [Fz/h]
    public let basicCapacity: Double   // G_i [PWE/h] aus Abb. 2
    public let capacity: Double        // L_i [PWE/h]
    public let reserve: Double         // R_i = L_i − q_i
    public let utilizationDegree: Double // a_i = q_i / L_i
    public let delay: Double           // w_i [s]
    public let levelOfService: LevelOfService

    /// Sprechende Bewegungsbeschreibung für die UI (SN 640 022, Abb. 1).
    public var movementDescription: String {
        switch streamNumber {
        case 1, 7:  return "Linksabbiegen HS"
        case 6, 12: return "Rechtseinbiegen NS"
        case 5, 11: return "Kreuzen NS"
        case 4, 10: return "Linkseinbiegen NS"
        default:    return name
        }
    }

    public init(id: UUID = UUID(), streamNumber: Int, name: String, rang: Int,
                volumeFzh: Double, qpi: Double, basicCapacity: Double, capacity: Double,
                reserve: Double, utilizationDegree: Double, delay: Double,
                levelOfService: LevelOfService) {
        self.id = id; self.streamNumber = streamNumber; self.name = name; self.rang = rang
        self.volumeFzh = volumeFzh; self.qpi = qpi; self.basicCapacity = basicCapacity
        self.capacity = capacity; self.reserve = reserve
        self.utilizationDegree = utilizationDegree; self.delay = delay
        self.levelOfService = levelOfService
    }
}

public struct SN640022MixedResult: Identifiable, Sendable {
    public let id: UUID
    public let name: String
    public let streamNumbers: [Int]    // kombinierte SN-Stromnummern

    /// Arm-Bezeichnung ohne Stromnummern (z.B. "Arm B" statt "Arm B (4+6)").
    public var armLabel: String {
        if let idx = name.firstIndex(of: "(") {
            return String(name[name.startIndex..<idx]).trimmingCharacters(in: .whitespaces)
        }
        return name
    }
    public let volumeFzh: Double       // Σq_i [Fz/h]
    public let capacity: Double        // L_m [PWE/h]  [F21]
    public let reserve: Double         // R_m = L_m − Σq_i
    public let utilizationDegree: Double // Σa_i
    public let delay: Double           // w_m [s]
    public let levelOfService: LevelOfService

    public init(id: UUID = UUID(), name: String, streamNumbers: [Int], volumeFzh: Double,
                capacity: Double, reserve: Double, utilizationDegree: Double,
                delay: Double, levelOfService: LevelOfService) {
        self.id = id; self.name = name; self.streamNumbers = streamNumbers
        self.volumeFzh = volumeFzh; self.capacity = capacity; self.reserve = reserve
        self.utilizationDegree = utilizationDegree; self.delay = delay
        self.levelOfService = levelOfService
    }
}

public struct SN640022Result: Sendable {
    /// Alle berechneten Nebenströme (Rang ≥ 2). Rang-1-Ströme werden nicht ausgegeben,
    /// da sie keine Wartezeit aus dem SN-Modell erhalten.
    public let streams: [SN640022StreamResult]
    public let mixedLanes: [SN640022MixedResult]
    public let overallLevelOfService: LevelOfService

    public init(streams: [SN640022StreamResult], mixedLanes: [SN640022MixedResult]) {
        self.streams = streams
        self.mixedLanes = mixedLanes
        let allLOS = streams.map(\.levelOfService) + mixedLanes.map(\.levelOfService)
        self.overallLevelOfService = allLOS.max { $0.rawValue < $1.rawValue } ?? .A
    }

    public static let empty = SN640022Result(streams: [], mixedLanes: [])
}

// MARK: - Streifenflags (Fussnoten 1–4, SN 640 022 S. 3)

public struct SN640022LaneFlags: Sendable {

    // MARK: Mischstrom-Kombination (Abschnitt 13, [F21])

    /// Welche Nebenströme auf Arm B einen gemeinsamen Mischstreifen bilden.
    /// Norm S. 7: m = 4+5, 5+6 oder 4+5+6 — abhängig von der Knotengeometrie.
    public enum MixedLaneCombination: String, Sendable, Codable, Hashable, CaseIterable {
        /// Linkseinbieger + Kreuzen teilen den Streifen (Strom 4+5 / 10+11).
        /// Rechtseinbieger hat eigene Warteposition oder separaten Streifen.
        case leftAndThrough
        /// Kreuzen + Rechtseinbieger teilen den Streifen (Strom 5+6 / 11+12).
        /// Linkseinbieger hat eigene Warteposition oder separaten Streifen.
        case throughAndRight
        /// Alle drei Ströme teilen den gemeinsamen Streifen (Strom 4+5+6 / 10+11+12).
        case all
    }

    /// Mischstrom-Kombination für Arm B (NS). Default: .all
    public var mixedB: MixedLaneCombination
    /// Mischstrom-Kombination für Arm D (NS, nur Kreuzung). Default: .all
    public var mixedD: MixedLaneCombination

    // MARK: Fussnoten 1–4

    /// Fn 1: separater Streifen für HS-Rechtsabbieger → q3f = 0 in F3, F5, F7
    public var armASeparateLane: Bool
    /// Fn 1: separater Streifen für HS-Rechtsabbieger → q9f = 0 in F4, F6, F8
    public var armCSeparateLane: Bool
    /// Fn 2: mehr als 1 Streifen auf HS Arm A → nur rechter Fahrstreifen in F3
    public var armAQ2Override: Double?
    /// Fn 2: mehr als 1 Streifen auf HS Arm C → nur rechter Fahrstreifen in F4
    public var armCQ8Override: Double?
    /// Fn 3: Dreiecksinsel für A-Rechtsabbieger m. Kein-Vortritt/Stop → q3g = 0 in F2, F6
    public var armATriangleIsland: Bool
    /// Fn 3: Dreiecksinsel für C-Rechtsabbieger m. Kein-Vortritt/Stop → q9g = 0 in F1, F5
    public var armCTriangleIsland: Bool
    /// Fn 4: Dreiecksinsel für B-Rechtsabbieger (Strom 6) m. Kein-Vortritt/Stop → q6g = 0 in F8
    public var armBRightIsland: Bool
    /// Fn 4: Dreiecksinsel für D-Rechtsabbieger (Strom 12) m. Kein-Vortritt/Stop → q12g = 0 in F7
    public var armDRightIsland: Bool

    public init(mixedB: MixedLaneCombination = .all,
                mixedD: MixedLaneCombination = .all,
                armASeparateLane: Bool = false, armCSeparateLane: Bool = false,
                armAQ2Override: Double? = nil, armCQ8Override: Double? = nil,
                armATriangleIsland: Bool = false, armCTriangleIsland: Bool = false,
                armBRightIsland: Bool = false, armDRightIsland: Bool = false) {
        self.mixedB             = mixedB
        self.mixedD             = mixedD
        self.armASeparateLane   = armASeparateLane
        self.armCSeparateLane   = armCSeparateLane
        self.armAQ2Override     = armAQ2Override
        self.armCQ8Override     = armCQ8Override
        self.armATriangleIsland = armATriangleIsland
        self.armCTriangleIsland = armCTriangleIsland
        self.armBRightIsland    = armBRightIsland
        self.armDRightIsland    = armDRightIsland
    }
}

// MARK: - Rechner

/// Berechnet einen Knoten ohne Lichtsignalanlage nach SN 640 022.
///
/// Eingabe: volumes[i][j] = Verkehrsstärke von Arm i nach Arm j [Fz/h].
/// Die Werte werden als Personenwagen-Einheiten (PWE) behandelt (Umrechnungsfaktor f = 1.0,
/// gilt für reinen PW-Verkehr bei ±0 % Längsneigung).
///
/// Arm-Nummern (0-basiert) entsprechen der SN-Zufahrtbezeichnung:
///   3-armig: Arm 0 = SN A (HS), Arm 1 = SN C (HS), Arm 2 = SN B (NS)
///   4-armig: Arm 0 = SN A (HS), Arm 1 = SN C (HS), Arm 2 = SN B (NS), Arm 3 = SN D (NS)
public struct SN640022Calculator: Sendable {

    public init() {}

    public func analyze(volumes: [[Double]],
                        laneFlags: SN640022LaneFlags = .init()) -> SN640022Result {
        switch volumes.count {
        case 3: return einmuendung(v: volumes, flags: laneFlags)
        case 4: return kreuzung(v: volumes, flags: laneFlags)
        default: return .empty
        }
    }

    // MARK: - Einmündung (3-armig)
    // Arm 0 = SN A (HS), Arm 1 = SN C (HS), Arm 2 = SN B (NS)

    private func einmuendung(v: [[Double]], flags: SN640022LaneFlags) -> SN640022Result {
        let q2 = v[0][1], q3 = v[0][2]       // Arm A: Geradeaus→C, Rechts→B
        let q8 = v[1][0], q7 = v[1][2]       // Arm C: Geradeaus→A, Links→B
        let q4 = v[2][0], q6 = v[2][1]       // Arm B (NS): →A, →C

        // Fn 1: separater Streifen → q3 entfällt in F3/F7
        let q3f = flags.armASeparateLane ? 0.0 : q3
        // Fn 2: rechter Fahrstreifen Arm A für F3
        let q2r = flags.armAQ2Override ?? q2
        // Fn 3: Dreiecksinsel für A-Rechtsabbieger → q3 entfällt in F2
        let q3g = flags.armATriangleIsland ? 0.0 : q3

        // Rang 2 ─────────────────────────────────────────────────────────────────

        // Strom 7: Linksabbiegen HS (C → B)
        let qp7 = q2 + q3g                    // [F2] Fn3: q3g
        let G7  = g(.mainRoadLeft,  qpi: qp7)
        let L7  = G7                           // [F11]
        let s7  = stream(7, "C → B", rang: 2, q: q7, qpi: qp7, G: G7, L: L7)

        // Strom 6: Rechtseinbiegen NS (B → C)
        let qp6 = q2r + 0.5 * q3f            // [F3] Fn2: q2r, Fn1: q3f
        let G6  = g(.sideRoadRight, qpi: qp6)
        let L6  = G6                           // [F11]
        let s6  = stream(6, "B → C", rang: 2, q: q6, qpi: qp6, G: G6, L: L6)

        // Rang 3 ─────────────────────────────────────────────────────────────────

        // Strom 4: Linkseinbiegen NS (B → A)  [F7] vereinfacht (q1=q11=q12=0)
        // Fn4 (q12g) entfällt in Einmündung da kein Arm D
        let qp4 = q2 + 0.5 * q3f + q8 + q7  // [F7]
        let G4  = g(.sideRoadLeft,  qpi: qp4)
        let p07 = p0(q: q7, L: L7)
        let L4  = p07 * G4                    // [F13]
        let s4  = stream(4, "B → A", rang: 3, q: q4, qpi: qp4, G: G4, L: L4)

        // Mischstreifen Arm B: 4 + 6  [F21]
        let mixB = mixed("Arm B (4+6)", nums: [4, 6],
                         parts: [(q4, L4), (q6, L6)])

        return SN640022Result(streams: [s7, s6, s4], mixedLanes: [mixB])
    }

    // MARK: - Kreuzung (4-armig)
    // Arm 0 = SN A (HS), Arm 1 = SN C (HS), Arm 2 = SN B (NS), Arm 3 = SN D (NS)

    private func kreuzung(v: [[Double]], flags: SN640022LaneFlags) -> SN640022Result {
        let q1  = v[0][3], q2 = v[0][1], q3 = v[0][2]     // Arm A
        let q7  = v[1][2], q8 = v[1][0], q9 = v[1][3]     // Arm C
        let q4  = v[2][0], q5 = v[2][3], q6 = v[2][1]     // Arm B (NS)
        let q10 = v[3][1], q11 = v[3][2], q12 = v[3][0]   // Arm D (NS)

        // Fn 1: separater Streifen → entfällt in 0.5-Termen
        let q3f = flags.armASeparateLane ? 0.0 : q3  // F3, F5, F7
        let q9f = flags.armCSeparateLane ? 0.0 : q9  // F4, F6, F8
        // Fn 2: rechter Fahrstreifen bei mehrspuriger HS
        let q2r = flags.armAQ2Override ?? q2          // F3
        let q8r = flags.armCQ8Override ?? q8          // F4
        // Fn 3: Dreiecksinsel für HS-Rechtsabbieger → entfällt in Volltermen
        let q3g = flags.armATriangleIsland ? 0.0 : q3  // F2, F6
        let q9g = flags.armCTriangleIsland ? 0.0 : q9  // F1, F5
        // Fn 4: Dreiecksinsel für NS-Rechtsabbieger
        let q6g  = flags.armBRightIsland ? 0.0 : q6    // F8
        let q12g = flags.armDRightIsland ? 0.0 : q12   // F7

        // Rang 2 ─────────────────────────────────────────────────────────────────

        // Strom 1: Linksabbiegen HS (A → D)
        let qp1 = q8 + q9g                    // [F1] Fn3: q9g
        let G1  = g(.mainRoadLeft,  qpi: qp1); let L1 = G1
        let s1  = stream(1, "A → D", rang: 2, q: q1, qpi: qp1, G: G1, L: L1)

        // Strom 7: Linksabbiegen HS (C → B)
        let qp7 = q2 + q3g                    // [F2] Fn3: q3g
        let G7  = g(.mainRoadLeft,  qpi: qp7); let L7 = G7
        let s7  = stream(7, "C → B", rang: 2, q: q7, qpi: qp7, G: G7, L: L7)

        // Strom 6: Rechtseinbiegen NS (B → C)
        let qp6 = q2r + 0.5 * q3f            // [F3] Fn2: q2r, Fn1: q3f
        let G6  = g(.sideRoadRight, qpi: qp6); let L6 = G6
        let s6  = stream(6, "B → C", rang: 2, q: q6, qpi: qp6, G: G6, L: L6)

        // Strom 12: Rechtseinbiegen NS (D → A)
        let qp12 = q8r + 0.5 * q9f           // [F4] Fn2: q8r, Fn1: q9f
        let G12  = g(.sideRoadRight, qpi: qp12); let L12 = G12
        let s12  = stream(12, "D → A", rang: 2, q: q12, qpi: qp12, G: G12, L: L12)

        // Rang 3 ─────────────────────────────────────────────────────────────────

        let p01 = p0(q: q1, L: L1)
        let p07 = p0(q: q7, L: L7)
        let px  = p01 * p07                   // [F14]

        // Strom 5: Kreuzen NS (B → D)
        let qp5 = q2 + 0.5*q3f + q8 + q9g + q1 + q7  // [F5] Fn1: q3f, Fn3: q9g
        let G5  = g(.sideRoadCross, qpi: qp5)
        let L5  = px * G5                     // [F15]
        let s5  = stream(5, "B → D", rang: 3, q: q5, qpi: qp5, G: G5, L: L5)

        // Strom 11: Kreuzen NS (D → B)
        let qp11 = q8 + 0.5*q9f + q2 + q3g + q1 + q7  // [F6] Fn1: q9f, Fn3: q3g
        let G11  = g(.sideRoadCross, qpi: qp11)
        let L11  = px * G11                   // [F16]
        let s11  = stream(11, "D → B", rang: 3, q: q11, qpi: qp11, G: G11, L: L11)

        // Rang 4 ─────────────────────────────────────────────────────────────────

        // Strom 4: Linkseinbiegen NS (B → A)
        let Py11 = px * p0(q: q11, L: L11)   // [F17]
        let pz11 = pz(Py: Py11)              // [F18]
        let p012 = p0(q: q12, L: L12)
        let qp4  = q2 + 0.5*q3f + q8 + q1 + q7 + q12g + q11  // [F7] Fn1: q3f, Fn4: q12g
        let G4   = g(.sideRoadLeft, qpi: qp4)
        let L4   = pz11 * p012 * G4          // [F19]
        let s4   = stream(4, "B → A", rang: 4, q: q4, qpi: qp4, G: G4, L: L4)

        // Strom 10: Linkseinbiegen NS (D → C)
        let Py5 = px * p0(q: q5, L: L5)      // [F17]
        let pz5 = pz(Py: Py5)                // [F18]
        let p06 = p0(q: q6, L: L6)
        let qp10 = q8 + 0.5*q9f + q2 + q1 + q7 + q6g + q5   // [F8] Fn1: q9f, Fn4: q6g
        let G10  = g(.sideRoadLeft, qpi: qp10)
        let L10  = pz5 * p06 * G10           // [F20]
        let s10  = stream(10, "D → C", rang: 4, q: q10, qpi: qp10, G: G10, L: L10)

        // Mischstreifen  [F21]
        // Kombination abhängig von Knotengeometrie (Abschnitt 13, S. 7):
        //   .leftAndThrough  → 4+5   (Rechtseinbieger hat eigene Warteposition)
        //   .throughAndRight → 5+6   (Linkseinbieger hat eigene Warteposition)
        //   .all             → 4+5+6 (alle drei teilen den Streifen)
        let mixB: SN640022MixedResult
        switch flags.mixedB {
        case .leftAndThrough:
            mixB = mixed("Arm B (4+5)",   nums: [4, 5],    parts: [(q4, L4), (q5, L5)])
        case .throughAndRight:
            mixB = mixed("Arm B (5+6)",   nums: [5, 6],    parts: [(q5, L5), (q6, L6)])
        case .all:
            mixB = mixed("Arm B (4+5+6)", nums: [4, 5, 6], parts: [(q4, L4), (q5, L5), (q6, L6)])
        }

        let mixD: SN640022MixedResult
        switch flags.mixedD {
        case .leftAndThrough:
            mixD = mixed("Arm D (10+11)",    nums: [10, 11],     parts: [(q10, L10), (q11, L11)])
        case .throughAndRight:
            mixD = mixed("Arm D (11+12)",    nums: [11, 12],     parts: [(q11, L11), (q12, L12)])
        case .all:
            mixD = mixed("Arm D (10+11+12)", nums: [10, 11, 12], parts: [(q10, L10), (q11, L11), (q12, L12)])
        }

        return SN640022Result(
            streams: [s1, s7, s6, s12, s5, s11, s4, s10],
            mixedLanes: [mixB, mixD]
        )
    }

    // MARK: - Grundleistungsfähigkeit G_i  (Abb. 2)
    // Exponential-Approximation, gefittet an die Norm-Berechnungsbeispiele (S. 12–14).
    // Die Kurven enthalten die schweizerische Erhöhung um 90 PWE/h gemäss Abschnitt 9.

    private enum MovementType {
        case mainRoadLeft   // Linksabbiegen von der HS (Ströme 1, 7)
        case sideRoadRight  // Rechtseinbiegen aus der NS (Ströme 6, 12)
        case sideRoadCross  // Kreuzen aus der NS (Ströme 5, 11)
        case sideRoadLeft   // Linkseinbiegen aus der NS (Ströme 4, 10)
    }

    private func g(_ type: MovementType, qpi: Double) -> Double {
        let result: Double
        switch type {
        case .mainRoadLeft:  result = 1486.0 * exp(-0.001104 * qpi)
        case .sideRoadRight: result = 1232.0 * exp(-0.001205 * qpi)
        case .sideRoadCross: result = 791.0  * exp(-0.000829 * qpi)
        case .sideRoadLeft:  result = 1019.0 * exp(-0.001166 * qpi)
        }
        return max(0.0, result)
    }

    // MARK: - Wahrscheinlichkeit staufreier Zustand  [F12]

    private func p0(q: Double, L: Double) -> Double {
        guard L > 0 else { return 0 }
        return max(0.0, 1.0 - q / L)
    }

    // MARK: - Korrekturwahrscheinlichkeit p_z  [F18]

    private func pz(Py: Double) -> Double {
        guard Py > 0 else { return 0 }
        return 0.65 * Py - Py / (Py + 3.0) + 0.6 * sqrt(Py)
    }

    // MARK: - Wartezeit  (nach Kimber-Hollis, Abb. 4)
    // Verwendet die vorhandene DelayCalculator-Formel; LOS-Klassifikation stimmt
    // mit Tab. 3 überein (verifiziert gegen Norm-Beispiele).

    private func w(q: Double, L: Double) -> Double {
        guard L > 0, q > 0 else { return 0 }
        let a = q / L
        guard a < 1.0 else { return .infinity }
        return DelayCalculator.delay(utilizationDegree: a, volume: q)
    }

    // MARK: - Hilfsfunktionen

    private func stream(_ number: Int, _ name: String, rang: Int,
                        q: Double, qpi: Double, G: Double, L: Double) -> SN640022StreamResult {
        let a   = L > 0 ? q / L : Double.infinity
        let R   = L - q
        let wt  = a < 1.0 ? w(q: q, L: L) : Double.infinity
        let los = LevelOfService.classify(delay: wt, utilizationDegree: a)
        return SN640022StreamResult(
            streamNumber: number, name: name, rang: rang,
            volumeFzh: q, qpi: qpi, basicCapacity: G, capacity: L,
            reserve: R, utilizationDegree: a, delay: wt, levelOfService: los
        )
    }

    /// Mischstreifen-Leistungsfähigkeit  [F21]: L_m = Σq_i / Σa_i
    private func mixed(_ name: String, nums: [Int],
                       parts: [(q: Double, L: Double)]) -> SN640022MixedResult {
        let totalQ = parts.reduce(0.0) { $0 + $1.q }
        let sumA   = parts.reduce(0.0) { acc, p in
            guard p.L > 0 else { return acc }
            return acc + p.q / p.L
        }
        let Lm  = sumA > 0 ? totalQ / sumA : 0.0
        let Rm  = Lm - totalQ
        let wt  = sumA < 1.0 ? w(q: totalQ, L: Lm) : Double.infinity
        let los = LevelOfService.classify(delay: wt, utilizationDegree: sumA)
        return SN640022MixedResult(
            name: name, streamNumbers: nums, volumeFzh: totalQ,
            capacity: Lm, reserve: Rm,
            utilizationDegree: sumA, delay: wt, levelOfService: los
        )
    }
}
