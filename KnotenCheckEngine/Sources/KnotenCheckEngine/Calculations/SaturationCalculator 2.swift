public enum SaturationCalculator {

    // y = Q / S_m
    public static func saturationDegree(volume Q: Double, maxSaturation Sm: Double) -> Double {
        guard Sm > 0 else { return .infinity }
        return Q / Sm
    }

    // Parallele Streifen: y_a,b = y_a + y_b − y_a × y_b — VSS 2008/301, S. 18
    public static func parallelSaturation(ya: Double, yb: Double) -> Double {
        return ya + yb - ya * yb
    }

    // Parallele Streifen für n Streifen (iterativ angewendet)
    public static func parallelSaturation(values: [Double]) -> Double {
        guard !values.isEmpty else { return 0 }
        return values.dropFirst().reduce(values[0]) { acc, y in
            parallelSaturation(ya: acc, yb: y)
        }
    }
}
