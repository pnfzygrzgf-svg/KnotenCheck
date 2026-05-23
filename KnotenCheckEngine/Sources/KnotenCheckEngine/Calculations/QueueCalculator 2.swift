import Foundation

public enum QueueCalculator {

    // Durchschnittlicher Stau: k = w[s] × L / 3600 — VSS 2008/301, S. 10
    public static func queueLength(delay w: Double, capacity L: Double) -> Double {
        guard w.isFinite, L > 0 else { return .infinity }
        return w * L / 3600.0
    }
}
