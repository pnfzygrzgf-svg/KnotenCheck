import SwiftUI
import KnotenCheckEngine

struct IntersectionSchematicView: View {
    let node: IntersectionNode

    var body: some View {
        GeometryReader { geo in
            let dim  = Dim(size: geo.size)
            let arms = ArmContent(node: node)
            ZStack {
                schematicCanvas(dim: dim, arms: arms)
                labelLayer(dim: dim, arms: arms)
            }
        }
        .aspectRatio(1, contentMode: .fit)
        .background(Color(red: 0.91, green: 0.90, blue: 0.87))
        .clipShape(RoundedRectangle(cornerRadius: 14))
    }

    // MARK: - Canvas

    private func schematicCanvas(dim: Dim, arms: ArmContent) -> some View {
        Canvas { ctx, _ in
            let road = Color(white: 0.60)
            let island = Color(white: 0.78)
            let zebra  = Color.white.opacity(0.90)

            // 1. Arms
            if arms.hasNorth { ctx.fill(Path(dim.northRect), with: .color(road)) }
            if arms.hasSouth { ctx.fill(Path(dim.southRect), with: .color(road)) }
            if arms.hasEast  { ctx.fill(Path(dim.eastRect),  with: .color(road)) }
            if arms.hasWest  { ctx.fill(Path(dim.westRect),  with: .color(road)) }

            // 2. Center box
            ctx.fill(Path(dim.centerRect), with: .color(road))

            // 3. Zebra crossings (drawn before islands so islands clip them)
            if arms.northHasFG { drawZebra(ctx: ctx, dim: dim, side: .north, color: zebra) }
            if arms.southHasFG { drawZebra(ctx: ctx, dim: dim, side: .south, color: zebra) }
            if arms.eastHasFG  { drawZebra(ctx: ctx, dim: dim, side: .east,  color: zebra) }
            if arms.westHasFG  { drawZebra(ctx: ctx, dim: dim, side: .west,  color: zebra) }

            // 4. Bus bays (drawn before islands, extends road surface)
            let busColor = Color(white: 0.56)
            if arms.northHasTransit { ctx.fill(Path(dim.northBusBay), with: .color(busColor)) }
            if arms.southHasTransit { ctx.fill(Path(dim.southBusBay), with: .color(busColor)) }
            if arms.eastHasTransit  { ctx.fill(Path(dim.eastBusBay),  with: .color(busColor)) }
            if arms.westHasTransit  { ctx.fill(Path(dim.westBusBay),  with: .color(busColor)) }

            // 5. Mittelinseln (short refuge island at crossing zone only, on top of zebra)
            if arms.northMittelinsel { ctx.fill(Path(dim.northIsland), with: .color(island)) }
            if arms.southMittelinsel { ctx.fill(Path(dim.southIsland), with: .color(island)) }
            if arms.eastMittelinsel  { ctx.fill(Path(dim.eastIsland),  with: .color(island)) }
            if arms.westMittelinsel  { ctx.fill(Path(dim.westIsland),  with: .color(island)) }

            // 5. Center lines (dashed)
            func dash(_ a: CGPoint, _ b: CGPoint) {
                var p = Path(); p.move(to: a); p.addLine(to: b)
                ctx.stroke(p, with: .color(.white.opacity(0.6)),
                           style: StrokeStyle(lineWidth: 1.5, dash: [7, 5]))
            }
            if arms.hasNorth { dash(dim.nDashStart, dim.nDashEnd) }
            if arms.hasSouth { dash(dim.sDashStart, dim.sDashEnd) }
            if arms.hasEast  { dash(dim.eDashStart, dim.eDashEnd) }
            if arms.hasWest  { dash(dim.wDashStart, dim.wDashEnd) }

            // 6. Directional arrows on arms
            if arms.hasNorth { drawArrow(ctx: ctx, dim: dim, side: .north, rank: arms.northVehicleRank) }
            if arms.hasSouth { drawArrow(ctx: ctx, dim: dim, side: .south, rank: arms.southVehicleRank) }
            if arms.hasEast  { drawArrow(ctx: ctx, dim: dim, side: .east,  rank: arms.eastVehicleRank)  }
            if arms.hasWest  { drawArrow(ctx: ctx, dim: dim, side: .west,  rank: arms.westVehicleRank)  }
        }
    }

    // MARK: - Zebra

    private func drawZebra(ctx: GraphicsContext, dim: Dim, side: Cardinal, color: Color) {
        // Stripes run PARALLEL to the road direction (correct for top-down view):
        // N/S arms: thin vertical stripes spaced horizontally across road width
        // E/W arms: thin horizontal stripes spaced vertically across road height
        let count = 5
        let stripeThick: CGFloat = 4   // width of each stripe
        let gap: CGFloat = 4           // gap between stripes
        let depth: CGFloat = 22        // crossing depth along road direction
        let base: CGFloat = dim.roadW * 0.20   // distance from junction edge
        let total = CGFloat(count) * stripeThick + CGFloat(count - 1) * gap

        switch side {
        case .north:
            let x0 = dim.cx - total / 2
            let y0 = dim.cy - dim.roadW/2 - base - depth
            for j in 0..<count {
                let x = x0 + CGFloat(j) * (stripeThick + gap)
                ctx.fill(Path(CGRect(x: x, y: y0, width: stripeThick, height: depth)), with: .color(color))
            }
        case .south:
            let x0 = dim.cx - total / 2
            let y0 = dim.cy + dim.roadW/2 + base
            for j in 0..<count {
                let x = x0 + CGFloat(j) * (stripeThick + gap)
                ctx.fill(Path(CGRect(x: x, y: y0, width: stripeThick, height: depth)), with: .color(color))
            }
        case .east:
            let y0 = dim.cy - total / 2
            let x0 = dim.cx + dim.roadW/2 + base
            for j in 0..<count {
                let y = y0 + CGFloat(j) * (stripeThick + gap)
                ctx.fill(Path(CGRect(x: x0, y: y, width: depth, height: stripeThick)), with: .color(color))
            }
        case .west:
            let y0 = dim.cy - total / 2
            let x0 = dim.cx - dim.roadW/2 - base - depth
            for j in 0..<count {
                let y = y0 + CGFloat(j) * (stripeThick + gap)
                ctx.fill(Path(CGRect(x: x0, y: y, width: depth, height: stripeThick)), with: .color(color))
            }
        }
    }

    // MARK: - Arrow

    private func drawArrow(ctx: GraphicsContext, dim: Dim, side: Cardinal,
                           rank: ReferenceValues.Rank?) {
        let color: Color = rank == .primary ? Color(red: 0.20, green: 0.50, blue: 0.85)
                                            : Color(red: 0.90, green: 0.55, blue: 0.15)
        let shaft: CGFloat = 5
        let head:  CGFloat = 9
        let armMid: CGFloat = dim.roadW/2 + dim.armLen * 0.55
        let off:   CGFloat = dim.roadW * 0.20

        func tip(_ p: CGPoint, _ dx: CGFloat, _ dy: CGFloat) -> Path {
            var path = Path()
            path.move(to: p)
            path.addLine(to: CGPoint(x: p.x - dy * head/2 - dx * head,
                                     y: p.y + dx * head/2 - dy * head))
            path.addLine(to: CGPoint(x: p.x + dy * head/2 - dx * head,
                                     y: p.y - dx * head/2 - dy * head))
            path.closeSubpath()
            return path
        }

        switch side {
        case .north:
            let x1 = dim.cx - off; let x2 = dim.cx + off
            let yTop = dim.cy - armMid; let yBot = dim.cy - dim.roadW/2 - 4
            for x in [x1, x2] {
                var p = Path()
                p.move(to: CGPoint(x: x, y: yTop))
                p.addLine(to: CGPoint(x: x, y: yBot))
                ctx.stroke(p, with: .color(color), style: StrokeStyle(lineWidth: shaft, lineCap: .round))
                ctx.fill(tip(CGPoint(x: x, y: yTop), 0, -1), with: .color(color))
                ctx.fill(tip(CGPoint(x: x, y: yBot), 0,  1), with: .color(color))
            }
        case .south:
            let x1 = dim.cx - off; let x2 = dim.cx + off
            let yTop = dim.cy + dim.roadW/2 + 4; let yBot = dim.cy + armMid
            for x in [x1, x2] {
                var p = Path()
                p.move(to: CGPoint(x: x, y: yTop))
                p.addLine(to: CGPoint(x: x, y: yBot))
                ctx.stroke(p, with: .color(color), style: StrokeStyle(lineWidth: shaft, lineCap: .round))
                ctx.fill(tip(CGPoint(x: x, y: yTop), 0, -1), with: .color(color))
                ctx.fill(tip(CGPoint(x: x, y: yBot), 0,  1), with: .color(color))
            }
        case .east:
            let y1 = dim.cy - off; let y2 = dim.cy + off
            let xLeft = dim.cx + dim.roadW/2 + 4; let xRight = dim.cx + armMid
            for y in [y1, y2] {
                var p = Path()
                p.move(to: CGPoint(x: xLeft, y: y))
                p.addLine(to: CGPoint(x: xRight, y: y))
                ctx.stroke(p, with: .color(color), style: StrokeStyle(lineWidth: shaft, lineCap: .round))
                ctx.fill(tip(CGPoint(x: xLeft,  y: y), -1, 0), with: .color(color))
                ctx.fill(tip(CGPoint(x: xRight, y: y),  1, 0), with: .color(color))
            }
        case .west:
            let y1 = dim.cy - off; let y2 = dim.cy + off
            let xLeft = dim.cx - armMid; let xRight = dim.cx - dim.roadW/2 - 4
            for y in [y1, y2] {
                var p = Path()
                p.move(to: CGPoint(x: xLeft, y: y))
                p.addLine(to: CGPoint(x: xRight, y: y))
                ctx.stroke(p, with: .color(color), style: StrokeStyle(lineWidth: shaft, lineCap: .round))
                ctx.fill(tip(CGPoint(x: xLeft,  y: y), -1, 0), with: .color(color))
                ctx.fill(tip(CGPoint(x: xRight, y: y),  1, 0), with: .color(color))
            }
        }
    }

    // MARK: - Labels

    private func labelLayer(dim: Dim, arms: ArmContent) -> some View {
        ZStack {
            if arms.hasNorth {
                ArmLabel(vehicle: arms.northVehicleStreams, fg: arms.northFGStreams,
                         hasMI: arms.northMittelinsel, transit: arms.northTransitStreams)
                    .position(x: dim.cx, y: dim.labelN)
            }
            if arms.hasSouth {
                ArmLabel(vehicle: arms.southVehicleStreams, fg: arms.southFGStreams,
                         hasMI: arms.southMittelinsel, transit: arms.southTransitStreams)
                    .position(x: dim.cx, y: dim.labelS)
            }
            if arms.hasEast {
                ArmLabel(vehicle: arms.eastVehicleStreams, fg: arms.eastFGStreams,
                         hasMI: arms.eastMittelinsel, transit: arms.eastTransitStreams)
                    .position(x: dim.labelE, y: dim.cy)
            }
            if arms.hasWest {
                ArmLabel(vehicle: arms.westVehicleStreams, fg: arms.westFGStreams,
                         hasMI: arms.westMittelinsel, transit: arms.westTransitStreams)
                    .position(x: dim.labelW, y: dim.cy)
            }
        }
    }
}

// MARK: - Dim

private struct Dim {
    let cx, cy, roadW, armLen: CGFloat
    init(size: CGSize) {
        let s = min(size.width, size.height)
        cx = size.width / 2
        cy = size.height / 2
        roadW = s * 0.24
        armLen = s * 0.25
    }

    var northRect: CGRect { CGRect(x: cx-roadW/2, y: cy-roadW/2-armLen, width: roadW, height: armLen) }
    var southRect: CGRect { CGRect(x: cx-roadW/2, y: cy+roadW/2,        width: roadW, height: armLen) }
    var eastRect:  CGRect { CGRect(x: cx+roadW/2, y: cy-roadW/2,        width: armLen, height: roadW) }
    var westRect:  CGRect { CGRect(x: cx-roadW/2-armLen, y: cy-roadW/2, width: armLen, height: roadW) }
    var centerRect: CGRect { CGRect(x: cx-roadW/2, y: cy-roadW/2, width: roadW, height: roadW) }

    // Mittelinsel: short refuge island only at the crossing zone (not full arm length).
    // Depth = baseOffset of zebra + 4 stripes + 3 gaps + padding = roadW*0.18 + 20+12+8
    private var iW:    CGFloat { roadW * 0.30 }
    // iDepth covers: base offset (roadW*0.20) + crossing depth (22) + padding (8)
    private var iDepth: CGFloat { roadW * 0.20 + 30 }
    var northIsland: CGRect { CGRect(x: cx-iW/2, y: cy-roadW/2-iDepth, width: iW, height: iDepth) }
    var southIsland: CGRect { CGRect(x: cx-iW/2, y: cy+roadW/2,        width: iW, height: iDepth) }
    var eastIsland:  CGRect { CGRect(x: cx+roadW/2,       y: cy-iW/2, width: iDepth, height: iW) }
    var westIsland:  CGRect { CGRect(x: cx-roadW/2-iDepth, y: cy-iW/2, width: iDepth, height: iW) }

    // Bus bays: small widened section on right side of arm, in the outer half
    private var bayW: CGFloat { roadW * 0.28 }
    private var bayH: CGFloat { armLen * 0.45 }
    var northBusBay: CGRect { CGRect(x: cx+roadW/2, y: cy-roadW/2-armLen,       width: bayW, height: bayH) }
    var southBusBay: CGRect { CGRect(x: cx+roadW/2, y: cy+roadW/2+armLen-bayH,  width: bayW, height: bayH) }
    var eastBusBay:  CGRect { CGRect(x: cx+roadW/2+armLen-bayH, y: cy+roadW/2,  width: bayH, height: bayW) }
    var westBusBay:  CGRect { CGRect(x: cx-roadW/2-armLen,       y: cy+roadW/2, width: bayH, height: bayW) }

    // Dash line endpoints
    var nDashStart: CGPoint { CGPoint(x: cx, y: cy-roadW/2) }
    var nDashEnd:   CGPoint { CGPoint(x: cx, y: cy-roadW/2-armLen) }
    var sDashStart: CGPoint { CGPoint(x: cx, y: cy+roadW/2) }
    var sDashEnd:   CGPoint { CGPoint(x: cx, y: cy+roadW/2+armLen) }
    var eDashStart: CGPoint { CGPoint(x: cx+roadW/2,        y: cy) }
    var eDashEnd:   CGPoint { CGPoint(x: cx+roadW/2+armLen, y: cy) }
    var wDashStart: CGPoint { CGPoint(x: cx-roadW/2,        y: cy) }
    var wDashEnd:   CGPoint { CGPoint(x: cx-roadW/2-armLen, y: cy) }

    // Label positions (outside arms)
    var labelN: CGFloat { cy - roadW/2 - armLen - 22 }
    var labelS: CGFloat { cy + roadW/2 + armLen + 22 }
    var labelE: CGFloat { cx + roadW/2 + armLen + 22 }
    var labelW: CGFloat { cx - roadW/2 - armLen - 22 }
}

// MARK: - Cardinal

private enum Cardinal { case north, south, east, west }

// MARK: - ArmContent

private struct ArmContent {
    var northVehicleStreams: [TrafficStream] = []
    var southVehicleStreams: [TrafficStream] = []
    var eastVehicleStreams:  [TrafficStream] = []
    var westVehicleStreams:  [TrafficStream] = []
    var northFGStreams: [TrafficStream] = []
    var southFGStreams: [TrafficStream] = []
    var eastFGStreams:  [TrafficStream] = []
    var westFGStreams:  [TrafficStream] = []
    var northMittelinsel = false
    var southMittelinsel = false
    var eastMittelinsel  = false
    var westMittelinsel  = false

    var hasNorth: Bool { !northVehicleStreams.isEmpty || !northFGStreams.isEmpty }
    var hasSouth: Bool { !southVehicleStreams.isEmpty || !southFGStreams.isEmpty }
    var hasEast:  Bool { !eastVehicleStreams.isEmpty  || !eastFGStreams.isEmpty  }
    var hasWest:  Bool { !westVehicleStreams.isEmpty  || !westFGStreams.isEmpty  }
    var northHasFG: Bool { !northFGStreams.isEmpty }
    var southHasFG: Bool { !southFGStreams.isEmpty }
    var eastHasFG:  Bool { !eastFGStreams.isEmpty  }
    var westHasFG:  Bool { !westFGStreams.isEmpty  }
    var northVehicleRank: ReferenceValues.Rank? { northVehicleStreams.first?.rank }
    var southVehicleRank: ReferenceValues.Rank? { southVehicleStreams.first?.rank }
    var eastVehicleRank:  ReferenceValues.Rank? { eastVehicleStreams.first?.rank  }
    var westVehicleRank:  ReferenceValues.Rank? { westVehicleStreams.first?.rank  }
    var northHasTransit: Bool { northVehicleStreams.contains { $0.mode.isTransitStop } }
    var southHasTransit: Bool { southVehicleStreams.contains { $0.mode.isTransitStop } }
    var eastHasTransit:  Bool { eastVehicleStreams.contains  { $0.mode.isTransitStop } }
    var westHasTransit:  Bool { westVehicleStreams.contains  { $0.mode.isTransitStop } }
    var northTransitStreams: [TrafficStream] { northVehicleStreams.filter { $0.mode.isTransitStop } }
    var southTransitStreams: [TrafficStream] { southVehicleStreams.filter { $0.mode.isTransitStop } }
    var eastTransitStreams:  [TrafficStream] { eastVehicleStreams.filter  { $0.mode.isTransitStop } }
    var westTransitStreams:  [TrafficStream] { westVehicleStreams.filter  { $0.mode.isTransitStop } }

    init(node: IntersectionNode) {
        // Assign streams to arms using armLabel when available,
        // falling back to rank-based heuristic for unlabelled streams.
        // A/C = Hauptstrasse (west/east), B/D = Nebenstrasse (south/north)
        let labelMap: [String: Cardinal] = ["A": .west, "C": .east, "B": .south, "D": .north]

        let displayStreams = node.streams.filter { !$0.isAuxiliary }
        let labelled   = displayStreams.filter { $0.armLabel != nil }
        let unlabelled = displayStreams.filter { $0.armLabel == nil }

        // Labelled streams go directly to their declared arm
        for s in labelled {
            let cardinal = labelMap[s.armLabel!] ?? .north
            if s.mode == .pedestrian {
                switch cardinal {
                case .north: northFGStreams.append(s)
                case .south: southFGStreams.append(s)
                case .east:  eastFGStreams.append(s)
                case .west:  westFGStreams.append(s)
                }
            } else {
                switch cardinal {
                case .north: northVehicleStreams.append(s)
                case .south: southVehicleStreams.append(s)
                case .east:  eastVehicleStreams.append(s)
                case .west:  westVehicleStreams.append(s)
                }
            }
        }

        // Unlabelled streams: rank-based heuristic
        let vehicles    = unlabelled.filter { $0.mode != .pedestrian }
        let pedestrians = unlabelled.filter { $0.mode == .pedestrian }
        let primary     = vehicles.filter { $0.rank == .primary   }
        let secondary   = vehicles.filter { $0.rank == .secondary }

        for (i, s) in primary.enumerated() {
            if i % 2 == 0 { northVehicleStreams.append(s) } else { southVehicleStreams.append(s) }
        }
        for (i, s) in secondary.enumerated() {
            if i % 2 == 0 { eastVehicleStreams.append(s) } else { westVehicleStreams.append(s) }
        }

        // Unlabelled pedestrians → arms that already have vehicle streams
        let armOrder: [Cardinal] = [.north, .south, .east, .west]
        let preferred = armOrder.filter { arm in
            switch arm {
            case .north: return !northVehicleStreams.isEmpty
            case .south: return !southVehicleStreams.isEmpty
            case .east:  return !eastVehicleStreams.isEmpty
            case .west:  return !westVehicleStreams.isEmpty
            }
        }
        let queue = preferred.isEmpty ? armOrder : preferred
        for (i, fg) in pedestrians.enumerated() {
            switch queue[i % queue.count] {
            case .north: northFGStreams.append(fg)
            case .south: southFGStreams.append(fg)
            case .east:  eastFGStreams.append(fg)
            case .west:  westFGStreams.append(fg)
            }
        }

        // Mittelinsel-Flags werden über ArmConfiguration.hasMittelinsel gesetzt (noch nicht implementiert)
        northMittelinsel = false
        southMittelinsel = false
        eastMittelinsel  = false
        westMittelinsel  = false
    }
}

// MARK: - ArmLabel

private struct ArmLabel: View {
    let vehicle: [TrafficStream]
    let fg: [TrafficStream]
    let hasMI: Bool
    let transit: [TrafficStream]

    var body: some View {
        VStack(spacing: 3) {
            ForEach(vehicle.filter { !$0.mode.isTransitStop }) { s in
                Text(s.name)
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundStyle(.white)
                    .lineLimit(2)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 7)
                    .padding(.vertical, 3)
                    .background(s.rank == .primary
                                ? Color(red: 0.20, green: 0.50, blue: 0.85)
                                : Color(red: 0.90, green: 0.55, blue: 0.15),
                                in: RoundedRectangle(cornerRadius: 6))
            }
            if !fg.isEmpty || hasMI || !transit.isEmpty {
                HStack(spacing: 4) {
                    if !fg.isEmpty {
                        Image(systemName: "figure.walk").font(.system(size: 9))
                    }
                    if hasMI {
                        Image(systemName: "rectangle.split.2x1").font(.system(size: 9))
                    }
                    if !transit.isEmpty {
                        Image(systemName: "bus.fill").font(.system(size: 9))
                    }
                }
                .foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: 90)
    }
}

// MARK: - VehicleMode extension

private extension VehicleMode {
    var isTransitStop: Bool {
        switch self {
        case .transitOneStop_NoOvertake, .transitTwoStops_NoOvertake,
             .transitThreeStops_NoOvertake, .transitFourStops_NoOvertake,
             .transitOneStop_Overtake, .transitTwoStops_Overtake,
             .transitThreeStops_Overtake, .transitFourStops_Overtake:
            return true
        default:
            return false
        }
    }
}
