import SwiftUI
import KnotenCheckEngine

struct LOSBadge: View {
    let los: LevelOfService

    var body: some View {
        Text(los.rawValue)
            .font(.caption.bold())
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(color.opacity(0.2), in: Capsule())
            .foregroundStyle(color)
    }

    private var color: Color {
        switch los {
        case .A: return .green
        case .B: return .mint
        case .C: return .yellow
        case .D: return .orange
        case .E: return .red
        case .F: return .purple
        }
    }
}
