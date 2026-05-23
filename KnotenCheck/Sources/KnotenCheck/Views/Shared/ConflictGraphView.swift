import SwiftUI
import KnotenCheckEngine

struct ConflictGraphView: View {
    let node: IntersectionNode

    private let nodeWidth: CGFloat  = 110
    private let nodeHeight: CGFloat = 44
    private let rowGap: CGFloat     = 72
    private let hPad: CGFloat       = 16

    var body: some View {
        GeometryReader { geo in
            let positions = streamPositions(in: geo.size)
            ZStack(alignment: .topLeading) {
                // Conflict edges
                Canvas { ctx, _ in
                    for group in node.conflictGroups {
                        let ids = group.streamIDs
                        for i in 0..<ids.count {
                            for j in (i+1)..<ids.count {
                                guard let a = positions[ids[i]], let b = positions[ids[j]] else { continue }
                                let ca = CGPoint(x: a.x + nodeWidth / 2, y: a.y + nodeHeight / 2)
                                let cb = CGPoint(x: b.x + nodeWidth / 2, y: b.y + nodeHeight / 2)
                                var path = Path()
                                path.move(to: ca)
                                path.addLine(to: cb)
                                ctx.stroke(path, with: .color(.secondary.opacity(0.35)), lineWidth: 1.5)
                            }
                        }
                    }
                }

                // Stream nodes (nur Hauptströme, keine Teilströme)
                ForEach(node.streams.filter { !$0.isAuxiliary }) { stream in
                    if let pos = positions[stream.id] {
                        StreamNode(stream: stream)
                            .frame(width: nodeWidth, height: nodeHeight)
                            .position(x: pos.x + nodeWidth / 2, y: pos.y + nodeHeight / 2)
                    }
                }
            }
        }
        .frame(height: graphHeight)
        .padding(.horizontal, hPad)
    }

    // MARK: - Layout

    private var rows: [[TrafficStream]] {
        let display    = node.streams.filter { !$0.isAuxiliary }
        let primary    = display.filter { $0.rank == .primary && $0.mode != .pedestrian }
        let secondary  = display.filter { $0.rank == .secondary && $0.mode != .pedestrian }
        let pedestrian = display.filter { $0.mode == .pedestrian }
        return [primary, secondary, pedestrian].filter { !$0.isEmpty }
    }

    private var graphHeight: CGFloat {
        let r = CGFloat(rows.count)
        return r * nodeHeight + (r - 1) * rowGap + 32
    }

    private func streamPositions(in size: CGSize) -> [UUID: CGPoint] {
        var result: [UUID: CGPoint] = [:]
        let usableWidth = size.width - 2 * hPad
        for (rowIdx, row) in rows.enumerated() {
            let y = 16 + CGFloat(rowIdx) * (nodeHeight + rowGap)
            let spacing = row.count > 1 ? (usableWidth - nodeWidth) / CGFloat(row.count - 1) : 0
            let startX  = row.count == 1 ? (usableWidth - nodeWidth) / 2 : 0
            for (colIdx, stream) in row.enumerated() {
                let x = startX + CGFloat(colIdx) * spacing
                result[stream.id] = CGPoint(x: x, y: y)
            }
        }
        return result
    }
}

// MARK: - StreamNode

private struct StreamNode: View {
    let stream: TrafficStream

    var body: some View {
        VStack(spacing: 2) {
            HStack(spacing: 4) {
                Image(systemName: modeIcon)
                    .font(.system(size: 10))
                if let arm = stream.armLabel {
                    Text("Arm \(arm)")
                        .font(.system(size: 9, weight: .semibold))
                        .foregroundStyle(.white.opacity(0.8))
                }
            }
            Text(stream.name)
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(.white)
                .lineLimit(1)
        }
        .padding(.horizontal, 8)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(rankColor, in: RoundedRectangle(cornerRadius: 10))
    }

    private var rankColor: Color {
        switch stream.mode {
        case .pedestrian: return Color(red: 0.20, green: 0.65, blue: 0.40)
        default:          return stream.rank == .primary
                              ? Color(red: 0.20, green: 0.50, blue: 0.85)
                              : Color(red: 0.90, green: 0.55, blue: 0.15)
        }
    }

    private var modeIcon: String {
        switch stream.mode {
        case .motorVehicle: return "car.fill"
        case .pedestrian:   return "figure.walk"
        case .tramOwnTrack: return "tram.fill"
        default:            return "bus.fill"
        }
    }
}
