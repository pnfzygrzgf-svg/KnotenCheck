import XCTest
@testable import KnotenCheckEngine

final class CalculatorTests: XCTestCase {

    // MARK: - SaturationCalculator

    func test_saturationDegree_basic() {
        XCTAssertEqual(SaturationCalculator.saturationDegree(volume: 900, maxSaturation: 1800), 0.500, accuracy: 0.001)
        XCTAssertEqual(SaturationCalculator.saturationDegree(volume: 250, maxSaturation: 1500), 0.167, accuracy: 0.001)
    }

    func test_saturationDegree_zeroSaturation_returnsInfinity() {
        XCTAssertTrue(SaturationCalculator.saturationDegree(volume: 100, maxSaturation: 0).isInfinite)
    }

    func test_parallelSaturation() {
        // y_a,b = y_a + y_b - y_a × y_b
        let ya = 0.278, yb = 0.222
        let expected = ya + yb - ya * yb
        XCTAssertEqual(SaturationCalculator.parallelSaturation(ya: ya, yb: yb), expected, accuracy: 0.001)
    }

    // MARK: - CapacityCalculator

    func test_capacitySecondary_fromNormExample() {
        // Normbeispiel S.11: S_m2=1500, y₁=0.500 → L₂ = 1500 × (1-0.5)² = 375
        let L = CapacityCalculator.capacitySecondary(Sm2: 1500, y1: 0.500)
        XCTAssertEqual(L, 375, accuracy: 1.0)
    }

    func test_capacitySecondary_y1GreaterOne_returnsZero() {
        let L = CapacityCalculator.capacitySecondary(Sm2: 1500, y1: 1.1)
        XCTAssertEqual(L, 0)
    }

    func test_capacityAfterSwitch_fromNormExample() {
        // Normbeispiel S.11: y₁=0.5, y₂=0.167, totalY=0.667
        // L₁* = 1800 × 0.5/0.667 = 1350 (Näherung: 1286 im Beispiel wegen Q₂=300)
        let L1 = CapacityCalculator.capacityAfterSwitch(Sm: 1800, ownY: 0.5, totalY: 0.667)
        XCTAssertEqual(L1, 1349, accuracy: 5.0)
    }

    func test_switchThreshold() {
        XCTAssertEqual(CapacityCalculator.switchThreshold(y1: 0.5, y2: 0.167), 0.667, accuracy: 0.001)
    }

    // MARK: - DelayCalculator

    func test_delay_lowUtilization() {
        // Bei x=0.5, Q=900: Wartezeit sollte wenige Sekunden sein
        let w = DelayCalculator.delay(utilizationDegree: 0.5, volume: 900)
        XCTAssertGreaterThan(w, 0)
        XCTAssertLessThan(w, 10)
    }

    func test_delay_nearCapacity_highDelay() {
        // Bei x=0.9 deutlich höhere Wartezeit
        let w_low = DelayCalculator.delay(utilizationDegree: 0.5, volume: 900)
        let w_high = DelayCalculator.delay(utilizationDegree: 0.9, volume: 900)
        XCTAssertGreaterThan(w_high, w_low)
    }

    func test_delay_zeroVolume_returnsZero() {
        let w = DelayCalculator.delay(utilizationDegree: 0.5, volume: 0)
        XCTAssertEqual(w, 0)
    }

    func test_delay_normExample_rank1() {
        // Normbeispiel S.12: Q=900, L=1800, x=0.5 → w ≈ 4s
        let w = DelayCalculator.delay(utilizationDegree: 0.500, volume: 900)
        XCTAssertEqual(w, 4, accuracy: 2.0)
    }

    func test_delay_normExample_rank2() {
        // Normbeispiel S.12: Q=250, L=375, x=0.667 → w ≈ 35s
        let w = DelayCalculator.delay(utilizationDegree: 0.667, volume: 250)
        XCTAssertEqual(w, 35, accuracy: 5.0)
    }

    // MARK: - QueueCalculator

    func test_queueLength_normExample() {
        // k = w × L / 3600: w=35s, L=375 → k ≈ 3.6 ≈ 4
        let k = QueueCalculator.queueLength(delay: 35, capacity: 375)
        XCTAssertEqual(k, 3.6, accuracy: 0.5)
    }

    func test_queueLength_infinite_delay_returns_infinity() {
        let k = QueueCalculator.queueLength(delay: .infinity, capacity: 375)
        XCTAssertTrue(k.isInfinite)
    }
}
