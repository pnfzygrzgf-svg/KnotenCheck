import SwiftUI

struct CapacityGauge: View {
    let value: Double   // 0.0 – 1.5
    let color: Color

    private var clamped: Double { min(1.5, max(0, value)) }

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                RoundedRectangle(cornerRadius: 4)
                    .fill(Color.secondary.opacity(0.15))
                RoundedRectangle(cornerRadius: 4)
                    .fill(color)
                    .frame(width: geo.size.width * CGFloat(clamped / 1.5))
                    .animation(.easeOut(duration: 0.4), value: clamped)
                // Kapazitätsgrenze bei 100%
                Rectangle()
                    .fill(Color.primary.opacity(0.3))
                    .frame(width: 1.5)
                    .offset(x: geo.size.width * CGFloat(1.0 / 1.5))
            }
        }
        .frame(height: 8)
    }
}
