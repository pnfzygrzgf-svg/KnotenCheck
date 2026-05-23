import XCTest
@testable import KnotenCheckEngine

final class ConflictTypeTests: XCTestCase {

    // MARK: - Typ 1: Zweirangig ohne Vortrittswechsel
    // Referenz: Normbeispiel S.12, Fahrzeug/Fahrzeug, Vortritt 1

    func test_type1_rank1_fullCapacity() {
        let s1 = makeStream(name: "Fz Nord", rank: .primary, mode: .motorVehicle, volume: 900)
        let s2 = makeStream(name: "Fz Ost",  rank: .secondary, mode: .motorVehicle, volume: 250)
        let output = Type1_TwoRankNoSwitch().calculate(streams: [s1, s2])

        let r1 = output.results.first { $0.id == s1.id }!
        let r2 = output.results.first { $0.id == s2.id }!

        // L₁ = S_m1 = 1800
        XCTAssertEqual(r1.capacity, 1800, accuracy: 1.0)
        // x₁ = 900/1800 = 0.5
        XCTAssertEqual(r1.utilizationDegree, 0.500, accuracy: 0.001)

        // L₂ = 1500 × (1 - 0.5)² = 375
        XCTAssertEqual(r2.capacity, 375, accuracy: 1.0)
        // x₂ = 250/375 = 0.667
        XCTAssertEqual(r2.utilizationDegree, 0.667, accuracy: 0.001)
    }

    func test_type1_rank2_delay_matches_norm() {
        let s1 = makeStream(name: "Fz Nord", rank: .primary, mode: .motorVehicle, volume: 900)
        let s2 = makeStream(name: "Fz Ost",  rank: .secondary, mode: .motorVehicle, volume: 250)
        let output = Type1_TwoRankNoSwitch().calculate(streams: [s1, s2])

        let r1 = output.results.first { $0.id == s1.id }!
        let r2 = output.results.first { $0.id == s2.id }!

        // Normbeispiel: w₁ ≈ 4s, w₂ ≈ 35s
        XCTAssertEqual(r1.delay, 4,  accuracy: 2.0)
        XCTAssertEqual(r2.delay, 35, accuracy: 5.0)
    }

    // MARK: - Typ 1: Fussgänger / Fahrzeug
    // Referenz: Normbeispiel S.12

    func test_type1_pedestrian_vehicle() {
        let fg = makeStream(name: "Fussgänger", rank: .primary, mode: .pedestrian, volume: 500)
        let fz = makeStream(name: "Fahrzeug",   rank: .secondary, mode: .motorVehicle, volume: 1000)
        let output = Type1_TwoRankNoSwitch().calculate(streams: [fg, fz])

        let rFg = output.results.first { $0.id == fg.id }!
        let rFz = output.results.first { $0.id == fz.id }!

        // L_fg = 2500
        XCTAssertEqual(rFg.capacity, 2500, accuracy: 1.0)
        // y_fg = 500/2500 = 0.200
        // L_fz = 1500 × (1 - 0.2)² = 960
        XCTAssertEqual(rFz.capacity, 960, accuracy: 1.0)
        // x_fz = 1000/960 = 1.042 → Überlast
        XCTAssertGreaterThan(rFz.utilizationDegree, 1.0)
        XCTAssertEqual(rFz.levelOfService, .F)
    }

    // MARK: - Typ 2: Mit Vortrittswechsel
    // Referenz: Normbeispiel S.12, zweite Tabelle

    func test_type2_withSwitch() {
        let s1 = makeStream(name: "Fz Nord", rank: .primary, mode: .motorVehicle, volume: 900)
        let s2 = makeStream(name: "Fz Ost",  rank: .secondary, mode: .motorVehicle, volume: 300)
        let output = Type2_TwoRankWithSwitch().calculate(streams: [s1, s2])

        // y₁=0.5, y₂=0.2, totalY=0.7
        // L₁* = 1800 × 0.5/0.7 ≈ 1286
        // L₂* = 1500 × 0.2/0.7 ≈ 429
        let r1 = output.results.first { $0.id == s1.id }!
        let r2 = output.results.first { $0.id == s2.id }!

        XCTAssertEqual(r1.capacity, 1286, accuracy: 5.0)
        XCTAssertEqual(r2.capacity, 429,  accuracy: 5.0)
        // Auslastungsgrad nach Wechsel gleich gross: x₁ = x₂ ≈ 0.7
        XCTAssertEqual(r1.utilizationDegree, r2.utilizationDegree, accuracy: 0.01)
    }

    // MARK: - Typ 5: Mehrrangig
    // Referenz: Normbeispiel S.17, vierrangiger Konflikt, erste Zeile

    func test_type5_fourRank() {
        let fg  = makeStream(name: "Fg",     rank: .primary,   mode: .pedestrian,   volume: 250)
        let fz2 = makeStream(name: "Fz R2",  rank: .secondary, mode: .motorVehicle, volume: 600)
        // Rang 3 und 4 brauchen eigene Rank-Werte – hier simuliert via secondary (Vereinfachung)
        let output = Type5_MultiRankNoSwitch().calculate(streams: [fg, fz2])

        let rFg = output.results.first { $0.id == fg.id }!
        let rFz = output.results.first { $0.id == fz2.id }!

        // y_fg = 250/2500 = 0.100
        // L_fz = 1500 × (1 - 0.100)² = 1215
        XCTAssertEqual(rFg.capacity, 2500, accuracy: 1.0)
        XCTAssertEqual(rFz.capacity, 1215, accuracy: 5.0)
    }

    // MARK: - Typ 7: Parallele Streifen

    func test_type7_parallel() {
        let s1a = makeStream(name: "Bus 1a",  rank: .primary,   mode: .busOwnTrack,   volume: 20)
        let s1b = makeStream(name: "Bus 1b",  rank: .primary,   mode: .busOwnTrack,   volume: 20)
        let s2  = makeStream(name: "Fz Ost",  rank: .secondary, mode: .motorVehicle,  volume: 270)
        let output = Type7_ParallelLanes().calculate(streams: [s1a, s1b, s2])

        let rFz = output.results.first { $0.id == s2.id }!

        // y_1a = 20/720 = 0.028, y_1b = 0.028
        // y_combined = 0.028 + 0.028 - 0.028×0.028 ≈ 0.055
        // L₂ = 1500 × (1-0.055)² ≈ 1341
        XCTAssertGreaterThan(rFz.capacity, 1200)
        XCTAssertLessThan(rFz.capacity, 1400)
    }

    // MARK: - LevelOfService Klassifikation

    // SN 640 022, Tab. 3: Klassifikation nach mittlerer Wartezeit w [s]
    func test_los_classification() {
        XCTAssertEqual(LevelOfService.classify(delay: 5,    utilizationDegree: 0.3),  .A)
        XCTAssertEqual(LevelOfService.classify(delay: 12,   utilizationDegree: 0.5),  .B)
        XCTAssertEqual(LevelOfService.classify(delay: 20,   utilizationDegree: 0.7),  .C)
        XCTAssertEqual(LevelOfService.classify(delay: 35,   utilizationDegree: 0.85), .D)
        XCTAssertEqual(LevelOfService.classify(delay: 60,   utilizationDegree: 0.95), .E)
        XCTAssertEqual(LevelOfService.classify(delay: 999,  utilizationDegree: 1.2),  .F)
        XCTAssertEqual(LevelOfService.classify(delay: .infinity, utilizationDegree: 1.1), .F)
    }

    // MARK: - ReferenceValues

    func test_referenceValues_vehicles() {
        XCTAssertEqual(ReferenceValues.maxSaturation(mode: .motorVehicle, rank: .primary),   1800)
        XCTAssertEqual(ReferenceValues.maxSaturation(mode: .motorVehicle, rank: .secondary), 1500)
    }

    func test_referenceValues_tram() {
        XCTAssertEqual(ReferenceValues.maxSaturation(mode: .tramOwnTrack, rank: .primary),   360)
        XCTAssertEqual(ReferenceValues.maxSaturation(mode: .tramOwnTrack, rank: .secondary), 300)
    }

    func test_referenceValues_transitWithStops() {
        XCTAssertEqual(ReferenceValues.maxSaturation(mode: .transitTwoStops_NoOvertake, rank: .primary),   180)
        XCTAssertEqual(ReferenceValues.maxSaturation(mode: .transitTwoStops_Overtake,   rank: .secondary), 155)
    }

    // MARK: - Massgebende Leistung (Norm S. 50, Norm-Einmündung)
    // When a secondary stream participates in multiple Teilkonflikte, the engine
    // must use the minimum capacity (= most constraining result) across all groups.

    func test_massgebendeLeistung_minCapacityAcrossGroups() {
        // Norm-Einmündung: two primary arms, one secondary arm.
        // Arm 1: Q=790, S_m1=1800, y₁=0.439  → Arm3 L₂ = 1500×(1-0.439)² ≈ 472
        // Arm 2: Q=120, S_m1=1500, y₁=0.080  → Arm3 L₂ = 1500×(1-0.080)² ≈ 1270
        // massgebende Leistung für Arm 3 = min(472, 1270) = 472
        let arm1 = makeStream(name: "Arm 1", rank: .primary,   mode: .motorVehicle, volume: 790)
        let arm2 = makeStream(name: "Arm 2", rank: .primary,   mode: .motorVehicle, volume: 120)
        let arm3 = makeStream(name: "Arm 3", rank: .secondary, mode: .motorVehicle, volume: 450)

        var node = IntersectionNode(name: "Norm-Einmündung")
        node.streams = [arm1, arm2, arm3]
        node.conflictGroups = [
            ConflictGroup(streamIDs: [arm1.id, arm3.id], conflictType: .twoRankNoSwitch),
            ConflictGroup(streamIDs: [arm2.id, arm3.id], conflictType: .twoRankNoSwitch),
        ]

        let result = KnotenCheckEngine().analyze(node: node)

        let r3 = result.streamResults.first { $0.id == arm3.id }
        XCTAssertNotNil(r3)
        // massgebende Leistung must be ≈ 472, NOT 1270
        XCTAssertEqual(r3!.capacity, 472, accuracy: 5.0)
        // x = 450/472 ≈ 0.953
        XCTAssertEqual(r3!.utilizationDegree, 0.953, accuracy: 0.01)
    }

    // MARK: - Norm-Einmündung S.50 (VSS 2008/301, Seite 50)
    // Referenz: Tabelle «Norm-Einmündung», Abendspitzenstunde
    // Vortrittsberechtigte Ströme: → Q=790, ← Q=450; untergeordneter Mischstreifen Q=320.
    // Geprüft werden hier nur die Vortrittsberechtigten, da der Mischstreifen
    // benachbarte Konflikte (iterativ) erfordert und separat getestet wird.

    func test_normEinmuendung_s50_primaryArm_rechts() {
        // PDF S.50: → Fz, Rang 1, Q=790, S_m=1800 → x=0.439, w≈3s, k≈2
        let stream = makeStream(name: "→ Hauptstrasse", rank: .primary, mode: .motorVehicle, volume: 790)
        var node = IntersectionNode(name: "Norm-Einmündung S.50")
        node.streams = [stream]
        node.conflictGroups = []
        let result = KnotenCheckEngine().analyze(node: node)
        let r = result.streamResults.first { $0.id == stream.id }!
        XCTAssertEqual(r.capacity, 1800, accuracy: 1.0)
        XCTAssertEqual(r.utilizationDegree, 0.439, accuracy: 0.001)
        XCTAssertEqual(r.delay, 3, accuracy: 2.0)     // PDF: w = 3 s
        XCTAssertEqual(r.queueLength, 2, accuracy: 1.0) // PDF: k = 2 Fz
    }

    func test_normEinmuendung_s50_primaryArm_links() {
        // PDF S.50: ← Fz, Rang 1, Q=450, S_m=1800 → x=0.250, w≈1s, k≈1
        let stream = makeStream(name: "← Hauptstrasse", rank: .primary, mode: .motorVehicle, volume: 450)
        var node = IntersectionNode(name: "Norm-Einmündung S.50")
        node.streams = [stream]
        node.conflictGroups = []
        let result = KnotenCheckEngine().analyze(node: node)
        let r = result.streamResults.first { $0.id == stream.id }!
        XCTAssertEqual(r.capacity, 1800, accuracy: 1.0)
        XCTAssertEqual(r.utilizationDegree, 0.250, accuracy: 0.001)
        XCTAssertEqual(r.delay, 1, accuracy: 1.0)     // PDF: w = 1 s
        XCTAssertEqual(r.queueLength, 1, accuracy: 1.0) // PDF: k = 1 Fz
    }

    func test_normEinmuendung_s50_sekundaererArm_massgebendeLeistung() {
        // PDF S.50: Teilkonflikt ↖ mit → (Q=790) und ↖-Hauptstrom (Q=120, Rang 2).
        // massgebende Leistung für untergeordneten Arm (Q=450) = min(472, 1270) = 472.
        // Identisch mit bestehendem test_massgebendeLeistung_minCapacityAcrossGroups,
        // hier explizit mit PDF-Referenzangabe dokumentiert.
        let haupt1 = makeStream(name: "→ Q=790", rank: .primary,   mode: .motorVehicle, volume: 790)
        let haupt2 = makeStream(name: "↖ Q=120", rank: .primary,   mode: .motorVehicle, volume: 120)
        let neben  = makeStream(name: "Mischstreifen Q=450", rank: .secondary, mode: .motorVehicle, volume: 450)
        var node = IntersectionNode(name: "Norm-Einmündung S.50 – Sekundär")
        node.streams = [haupt1, haupt2, neben]
        node.conflictGroups = [
            ConflictGroup(streamIDs: [haupt1.id, neben.id], conflictType: .twoRankNoSwitch),
            ConflictGroup(streamIDs: [haupt2.id, neben.id], conflictType: .twoRankNoSwitch),
        ]
        let result = KnotenCheckEngine().analyze(node: node)
        let r = result.streamResults.first { $0.id == neben.id }!
        // PDF S.50: massgebende Leistung = 472 (Teilkonflikt mit Q=790 ist massgebend)
        XCTAssertEqual(r.capacity, 472, accuracy: 5.0)
        XCTAssertEqual(r.utilizationDegree, 0.953, accuracy: 0.01)
    }

    // MARK: - Hilfsfunktion

    private func makeStream(name: String, rank: ReferenceValues.Rank, mode: VehicleMode, volume: Double) -> TrafficStream {
        TrafficStream(name: name, rank: rank, mode: mode, volume: volume)
    }
}
