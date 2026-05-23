import XCTest
@testable import KnotenCheckEngine

/// Verifiziert den SN640022Calculator gegen die Berechnungsbeispiele
/// aus SN 640 022, Abschnitt D (S. 11–14).
final class SN640022Tests: XCTestCase {

    let calc = SN640022Calculator()

    // MARK: - Abb. 2 Grundleistungsfähigkeit

    func test_G_Einmuendung_stream7() {
        // Einmündung S.12: q_p7 = 770 Fz/h → G_7 = 635 PWE/h
        let G = calc.basicCapacity_testable(.mainRoadLeft, qpi: 770)
        XCTAssertEqual(G, 635, accuracy: 5)
    }

    func test_G_Einmuendung_stream6() {
        // q_p6 = 670 → G_6 = 550
        let G = calc.basicCapacity_testable(.sideRoadRight, qpi: 670)
        XCTAssertEqual(G, 550, accuracy: 5)
    }

    func test_G_Einmuendung_stream4() {
        // q_p4 = 1210 → G_4 = 250
        let G = calc.basicCapacity_testable(.sideRoadLeft, qpi: 1210)
        XCTAssertEqual(G, 250, accuracy: 5)
    }

    func test_G_Kreuzung_stream1() {
        // Kreuzung S.13: q_p1 = 550 → G_1 = 810
        let G = calc.basicCapacity_testable(.mainRoadLeft, qpi: 550)
        XCTAssertEqual(G, 810, accuracy: 8)
    }

    func test_G_Kreuzung_stream5() {
        // q_p5 = 1170 → G_5 = 300
        let G = calc.basicCapacity_testable(.sideRoadCross, qpi: 1170)
        XCTAssertEqual(G, 300, accuracy: 5)
    }

    func test_G_Kreuzung_stream11() {
        // q_p11 = 1390 → G_11 = 250
        let G = calc.basicCapacity_testable(.sideRoadCross, qpi: 1390)
        XCTAssertEqual(G, 250, accuracy: 5)
    }

    // MARK: - Einmündung (S. 12)
    //
    // Situation: HS A ↔ C, NS B
    // Arm A: q2=570, q3=200  |  Arm C: q8=425, q7=115  |  Arm B: q4=180, q6=130
    //
    // Erwartete Ergebnisse (PWE aus Norm-Beispiel, angepasst auf f=1.0):
    //   G_7=635, L_7=635, a_7≈0.181, LOS A
    //   G_6=550, L_6=550, a_6≈0.236, LOS A
    //   G_4≈248, L_4≈203, a_4≈0.887, LOS E
    //   Mischstrom 4+6: Σq=310, Σa≈1.12 → LOS F

    private var einmuendungVolumes: [[Double]] {
        var v = Array(repeating: Array(repeating: 0.0, count: 3), count: 3)
        v[0][1] = 570; v[0][2] = 200   // Arm A: gerade→C, links→B
        v[1][0] = 425; v[1][2] = 115   // Arm C: gerade→A, rechts→B
        v[2][0] = 180; v[2][1] = 130   // Arm B: →A, →C
        return v
    }

    func test_Einmuendung_stream7_capacity() {
        let r = calc.analyze(volumes: einmuendungVolumes)
        let s7 = r.streams.first { $0.streamNumber == 7 }!
        XCTAssertEqual(s7.qpi,          770, accuracy: 1)
        XCTAssertEqual(s7.basicCapacity, 635, accuracy: 5)
        XCTAssertEqual(s7.capacity,      635, accuracy: 5)
        XCTAssertEqual(s7.rang, 2)
        XCTAssertEqual(s7.levelOfService, .A)
    }

    func test_Einmuendung_stream6_capacity() {
        let r = calc.analyze(volumes: einmuendungVolumes)
        let s6 = r.streams.first { $0.streamNumber == 6 }!
        XCTAssertEqual(s6.qpi,           670, accuracy: 1)
        XCTAssertEqual(s6.basicCapacity,  550, accuracy: 5)
        XCTAssertEqual(s6.rang, 2)
        XCTAssertEqual(s6.levelOfService, .A)
    }

    func test_Einmuendung_stream4_capacity() {
        let r = calc.analyze(volumes: einmuendungVolumes)
        let s4 = r.streams.first { $0.streamNumber == 4 }!
        // q_p4 = 570 + 0.5×200 + 425 + 115 = 1210
        XCTAssertEqual(s4.qpi, 1210, accuracy: 1)
        // G_4 ≈ 248, p0,7 = 1 - 115/635 ≈ 0.819, L_4 ≈ 203
        XCTAssertEqual(s4.capacity, 203, accuracy: 8)
        XCTAssertEqual(s4.rang, 3)
        XCTAssertEqual(s4.levelOfService, .E)
    }

    func test_Einmuendung_mischstrom_ueberlastet() {
        let r = calc.analyze(volumes: einmuendungVolumes)
        let m = r.mixedLanes.first!
        // Σq = 180+130 = 310, Σa > 1 → LOS F
        XCTAssertEqual(m.volumeFzh, 310, accuracy: 1)
        XCTAssertGreaterThan(m.utilizationDegree, 1.0)
        XCTAssertEqual(m.levelOfService, .F)
        XCTAssertEqual(r.overallLevelOfService, .F)
    }

    // MARK: - Kreuzung (S. 13–14)
    //
    // Situation: HS A ↔ C, NS B ↔ D
    // Arm A: q1=30, q2=500, q3=220
    // Arm C: q7=90, q8=550, q9=0
    // Arm B: q4=170, q5=10,  q6=60
    // Arm D: q10=5,  q11=15,  q12=20
    //
    // Erwartete L_i (Norm-Werte, Toleranz ±10%):
    //   L_1=810, L_7=670, L_6=675, L_12=635
    //   L_5=245, L_11=204
    //   L_4=200, L_10=174

    private var kreuzungVolumes: [[Double]] {
        var v = Array(repeating: Array(repeating: 0.0, count: 4), count: 4)
        // Arm 0 = SN A: →D(q1), →C(q2), →B(q3)
        v[0][3] = 30; v[0][1] = 500; v[0][2] = 220
        // Arm 1 = SN C: →B(q7), →A(q8), →D(q9)
        v[1][2] = 90; v[1][0] = 550; v[1][3] = 0
        // Arm 2 = SN B: →A(q4), →D(q5), →C(q6)
        v[2][0] = 170; v[2][3] = 10; v[2][1] = 60
        // Arm 3 = SN D: →C(q10), →B(q11), →A(q12)
        v[3][1] = 5; v[3][2] = 15; v[3][0] = 20
        return v
    }

    // MARK: Basisfall (einspurig, ohne separate Abbiegestreifen)

    func test_Kreuzung_rang2_capacities() {
        let r = calc.analyze(volumes: kreuzungVolumes)
        let s = { (n: Int) in r.streams.first { $0.streamNumber == n }! }

        XCTAssertEqual(s(1).capacity,  810, accuracy: 15)   // qp1=550, kein q3-Term
        XCTAssertEqual(s(7).capacity,  671, accuracy: 10)   // qp7=720, inkl. q3=220
        XCTAssertEqual(s(6).capacity,  591, accuracy: 10)   // qp6=610, ohne Fussnote 3
        XCTAssertEqual(s(12).capacity, 635, accuracy: 10)   // qp12=550, q9=0
    }

    func test_Kreuzung_rang3_capacities() {
        let r = calc.analyze(volumes: kreuzungVolumes)
        XCTAssertEqual(r.streams.first { $0.streamNumber == 5  }!.capacity, 228, accuracy: 15)
        XCTAssertEqual(r.streams.first { $0.streamNumber == 11 }!.capacity, 208, accuracy: 15)
    }

    func test_Kreuzung_rang4_capacities() {
        let r = calc.analyze(volumes: kreuzungVolumes)
        XCTAssertEqual(r.streams.first { $0.streamNumber == 4  }!.capacity, 176, accuracy: 15)
        XCTAssertEqual(r.streams.first { $0.streamNumber == 10 }!.capacity, 170, accuracy: 15)
    }

    // MARK: Norm-Beispiel S.13 (Fussnote 1 aktiv + normkonforme Mischstrom-Kombination)
    //
    // Arm B: Rechtseinbieger (6) hat eigene Warteposition → mixedB = .leftAndThrough (4+5)
    // Arm D: Linkseinbieger (10) hat eigene Warteposition → mixedD = .throughAndRight (11+12)

    private var normFlags: SN640022LaneFlags {
        SN640022LaneFlags(
            mixedB: .leftAndThrough,
            mixedD: .throughAndRight,
            armASeparateLane: true
        )
    }

    func test_Kreuzung_fussnote3_rang2() {
        let r = calc.analyze(volumes: kreuzungVolumes, laneFlags: normFlags)
        let s = { (n: Int) in r.streams.first { $0.streamNumber == n }! }

        // Mit Fn1: q3=220 entfällt in F3 → qp6=500 → G6≈675
        XCTAssertEqual(s(6).capacity,  675, accuracy: 10)
        XCTAssertEqual(s(1).capacity,  810, accuracy: 15)
        XCTAssertEqual(s(7).capacity,  671, accuracy: 10)
    }

    func test_Kreuzung_fussnote3_rang3() {
        let r = calc.analyze(volumes: kreuzungVolumes, laneFlags: normFlags)

        // Norm-Bsp. S.14: L5=245, L11=204
        XCTAssertEqual(r.streams.first { $0.streamNumber == 5  }!.capacity, 245, accuracy: 12)
        XCTAssertEqual(r.streams.first { $0.streamNumber == 11 }!.capacity, 204, accuracy: 12)
    }

    func test_Kreuzung_fussnote3_rang4() {
        let r = calc.analyze(volumes: kreuzungVolumes, laneFlags: normFlags)

        // Norm-Bsp. S.14: L4=200, L10=174
        XCTAssertEqual(r.streams.first { $0.streamNumber == 4  }!.capacity, 200, accuracy: 12)
        XCTAssertEqual(r.streams.first { $0.streamNumber == 10 }!.capacity, 174, accuracy: 12)
    }

    // MARK: Mischstrom-Kombinationen [F21]

    func test_Kreuzung_mixed_normBeispiel_armB_leftAndThrough() {
        // Norm S.14: Arm B → 4+5 → Σq=170+10=180, Σa=a4+a5, Lm≈202 (mit PWE-Werten)
        // Code mit Fz/h: Σq=180, Σa=170/L4+10/L5
        let r = calc.analyze(volumes: kreuzungVolumes, laneFlags: normFlags)
        let m = r.mixedLanes.first { $0.streamNumbers == [4, 5] }!
        XCTAssertEqual(m.volumeFzh, 180, accuracy: 1)          // q4+q5
        XCTAssertTrue(m.utilizationDegree < 1.0)
        XCTAssertEqual(m.capacity, 202, accuracy: 20)           // Norm: 202
        XCTAssertEqual(m.levelOfService, .E)
    }

    func test_Kreuzung_mixed_normBeispiel_armD_throughAndRight() {
        // Norm S.14: Arm D → 11+12 → Σq=15+20=35, Lm≈330 (mit PWE-Werten)
        let r = calc.analyze(volumes: kreuzungVolumes, laneFlags: normFlags)
        let m = r.mixedLanes.first { $0.streamNumbers == [11, 12] }!
        XCTAssertEqual(m.volumeFzh, 35, accuracy: 1)            // q11+q12
        XCTAssertEqual(m.capacity, 330, accuracy: 30)           // Norm: 330
        XCTAssertEqual(m.levelOfService, .A)
    }

    func test_Kreuzung_mixed_all_armB() {
        // Standardfall .all → 4+5+6, konservativste Annahme
        let r = calc.analyze(volumes: kreuzungVolumes)
        let m = r.mixedLanes.first { $0.streamNumbers == [4, 5, 6] }!
        XCTAssertEqual(m.volumeFzh, 240, accuracy: 1)           // q4+q5+q6
    }

    func test_Kreuzung_mixed_throughAndRight_armB() {
        // Linkseinbieger (4) hat eigene Warteposition → nur 5+6
        let flags = SN640022LaneFlags(mixedB: .throughAndRight, armASeparateLane: true)
        let r = calc.analyze(volumes: kreuzungVolumes, laneFlags: flags)
        let m = r.mixedLanes.first { $0.streamNumbers == [5, 6] }!
        XCTAssertEqual(m.volumeFzh, 70, accuracy: 1)            // q5+q6
    }

    func test_Kreuzung_mixed_leftAndThrough_armD() {
        // Rechtseinbieger (12) hat eigene Warteposition → nur 10+11
        let flags = SN640022LaneFlags(mixedD: .leftAndThrough)
        let r = calc.analyze(volumes: kreuzungVolumes, laneFlags: flags)
        let m = r.mixedLanes.first { $0.streamNumbers == [10, 11] }!
        XCTAssertEqual(m.volumeFzh, 20, accuracy: 1)            // q10+q11
    }

    func test_Kreuzung_rang2_LOS_A() {
        let r = calc.analyze(volumes: kreuzungVolumes)
        for n in [1, 7, 6, 12] {
            let s = r.streams.first { $0.streamNumber == n }!
            XCTAssertEqual(s.levelOfService, .A, "Strom \(n)")
        }
    }

    func test_Kreuzung_stream4_LOS_E() {
        let r = calc.analyze(volumes: kreuzungVolumes)
        let s4 = r.streams.first { $0.streamNumber == 4 }!
        // a_4 ≈ 0.85, LOS D or E
        XCTAssertTrue(s4.levelOfService == .D || s4.levelOfService == .E,
                      "Erwartet D oder E, erhalten: \(s4.levelOfService)")
    }

    // MARK: - f-Faktor (Tab. 1, [F9])
    //
    // Verifiziert dass eine Skalierung der Eingangsvolumen (= f × q_Fz)
    // die Grundleistungsfähigkeit korrekt reduziert.
    // Referenz: Tab. 1, ±0% → f = 1.1 (Standard, Kategorien unbekannt)
    //           Einmündung Strom 7 mit f=1.1 auf alle Arm-A-Ströme:
    //           qp7 = 1.1×(570+200) = 1.1×770 = 847 PWE/h → G7 ≈ 583 PWE/h

    // MARK: - f-Faktor Fall 2 (Tab. 2, [F10])
    //
    // Beispiel: 80% PW + 15% LW + 5% LZ, Neigung ±0%
    // f = (1.0×80 + 1.5×15 + 2.0×5) / 100 = (80 + 22.5 + 10) / 100 = 1.125
    // q_pi(S7) = 1.125 × (570+200) = 1.125 × 770 = 866.25 PWE/h

    func test_fFaktor_fall2_zusammensetzung() {
        // Effektiver f-Faktor manuell berechnen (Tab. 2, ±0%)
        // fPW=1.0, fLW=1.5, fLZ=2.0, fMR=0.5
        let f = (1.0 * 80.0 + 1.5 * 15.0 + 2.0 * 5.0) / 100.0  // = 1.125
        var v = Array(repeating: Array(repeating: 0.0, count: 3), count: 3)
        v[0][1] = f * 570; v[0][2] = f * 200   // Arm A: Fall 2
        v[1][0] = 425;     v[1][2] = 115        // Arm C: Fall 1 f=1.0
        v[2][0] = 180;     v[2][1] = 130        // Arm B: Fall 1 f=1.0
        let r = calc.analyze(volumes: v)
        let s7 = r.streams.first { $0.streamNumber == 7 }!

        // qp7 = 1.125 × 770 = 866.25 → G7 = 1486 × exp(−0.001104 × 866.25) ≈ 571
        XCTAssertEqual(s7.qpi, 866.25, accuracy: 0.5)
        XCTAssertEqual(s7.basicCapacity, 571, accuracy: 5)
        XCTAssertLessThan(s7.basicCapacity, 635)
    }

    func test_fFaktor_skaliert_qpi_korrekt() {
        // f = 1.1 auf Arm A anwenden (Arm C und B bleiben bei f = 1.0)
        let f = 1.1
        var v = Array(repeating: Array(repeating: 0.0, count: 3), count: 3)
        v[0][1] = f * 570; v[0][2] = f * 200   // Arm A: f=1.1
        v[1][0] = 425;     v[1][2] = 115        // Arm C: f=1.0
        v[2][0] = 180;     v[2][1] = 130        // Arm B: f=1.0
        let r = calc.analyze(volumes: v)
        let s7 = r.streams.first { $0.streamNumber == 7 }!

        // qp7 = 1.1×770 = 847 → G7 = 1486 × exp(−0.001104 × 847) ≈ 583
        XCTAssertEqual(s7.qpi,          847, accuracy: 1)
        XCTAssertEqual(s7.basicCapacity, 583, accuracy: 5)
        // Kapazität soll kleiner sein als ohne f-Faktor (635)
        XCTAssertLessThan(s7.basicCapacity, 635)
    }
}

// MARK: - Testbarkeits-Erweiterung

extension SN640022Calculator {
    enum TestMovementType {
        case mainRoadLeft, sideRoadRight, sideRoadCross, sideRoadLeft
    }

    func basicCapacity_testable(_ type: TestMovementType, qpi: Double) -> Double {
        switch type {
        case .mainRoadLeft:  return 1486.0 * exp(-0.001104 * qpi)
        case .sideRoadRight: return 1232.0 * exp(-0.001205 * qpi)
        case .sideRoadCross: return 791.0  * exp(-0.000829 * qpi)
        case .sideRoadLeft:  return 1019.0 * exp(-0.001166 * qpi)
        }
    }
}
