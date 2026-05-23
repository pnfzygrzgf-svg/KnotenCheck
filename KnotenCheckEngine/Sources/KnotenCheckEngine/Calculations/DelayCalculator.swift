import Foundation

public enum DelayCalculator {

    // Mittlerer Zeitverlust [s] (stochastisch + Überlastungsanteil)
    // w(x,Q) = 900 × [(x−1) − 4Cx/Q + √((x−1)² + 8C·(x+1+2Cx/Q) / (Q/x))]
    // C = 1 (Bezugsperiode 1 Stunde) — VSS 2008/301, S. 10
    public static func delay(utilizationDegree x: Double, volume Q: Double) -> Double {
        guard Q > 0.5 else { return 0 }

        let C = 1.0
        let term1 = x - 1.0
        let term2 = 4.0 * C * x / Q
        let radicand = pow(term1, 2) + 8.0 * C * (x + 1.0 + 2.0 * C * x / Q) / (Q / x)

        guard radicand >= 0 else { return 0 }
        return 900.0 * (term1 - term2 + sqrt(radicand))
    }
}
