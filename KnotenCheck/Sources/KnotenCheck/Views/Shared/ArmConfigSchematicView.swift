import SwiftUI
import KnotenCheckEngine

/// Knotenschema im SN-640-022-Stil — Linienzeichnung wie in der Norm.
/// HS horizontal (A links, C rechts), NS vertikal (B unten, D oben).
/// Rote Pfeile = Verkehrsströme; Nummer und Volumen werden angezeigt.
struct ArmConfigSchematicView: View {
    let config: IntersectionConfiguration

    var body: some View {
        GeometryReader { geo in
            let lay = Lay(geo.size, n: config.armCount)
            ZStack {
                Canvas { ctx, _ in
                    ctx.fill(Path(CGRect(origin: .zero, size: geo.size)), with: .color(.white))
                    drawRoads(ctx: ctx, lay: lay)
                    drawCenterLines(ctx: ctx, lay: lay)
                    drawYieldMarkers(ctx: ctx, lay: lay)
                    drawGeometryFeatures(ctx: ctx, lay: lay)
                    for a in arrows(lay: lay) { drawArrow(ctx: ctx, a: a) }
                }
                ForEach(arrows(lay: lay), id: \.number) { a in streamLabel(a) }
                signs(lay: lay)
                armLetters(lay: lay)
            }
        }
        .aspectRatio(config.armCount == 3 ? 4.5 / 3 : 1, contentMode: .fit)
        // ↑ Seitenverhältnis: Einmündung = 4.5:3 (breit), Kreuzung = 1:1
        .background(Color.white)
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .overlay(RoundedRectangle(cornerRadius: 12)
            .stroke(Color.gray.opacity(0.25), lineWidth: 0.5))
    }

    // MARK: - Layout

    struct Lay {
        let w, h, jx, jy, rh, al: CGFloat
        // rh = half road width (= 1 lane width)
        // Kreuzung NS arms use 1 or 2 lanes depending on mixedLane

        init(_ size: CGSize, n: Int) {
            w = size.width; h = size.height
            let s = min(w, h)
            rh = s * 0.08             // ← Halbe Strassenbreite (grösser = breitere Strasse)
            al = s * 0.30             // ← Armlänge ab Kreuzungspunkt
            jx = w / 2
            jy = n == 3 ? h * 0.60 : h / 2  // ← Kreuzungspunkt vertikal (0.60 = 60% von oben)
        }

        // HS
        var hsTop:    CGFloat { jy - rh }
        var hsBottom: CGFloat { jy + rh }
        // NS arm B
        var bLeft:    CGFloat { jx - rh }
        var bRight:   CGFloat { jx + rh }
        var bTop:     CGFloat { jy + rh }
        var bBottom:  CGFloat { h }
        // NS arm D
        var dTop:     CGFloat { 0 }
        var dBottom:  CGFloat { jy - rh }
        // Arm endpoints
        var axEnd:    CGFloat { 0 }               // A left edge
        var cxEnd:    CGFloat { w }               // C right edge
    }

    // MARK: - Colors / strokes

    private let edgeW: CGFloat    = 1.4
    private let centerW: CGFloat  = 2.2
    private let arrowW: CGFloat   = 1.4
    private let streamColor       = Color(red: 0.78, green: 0, blue: 0)
    private let roadEdge          = Color.black
    private let centerColor       = Color.black

    // MARK: - Roads (white fill, black border)

    private func drawRoads(ctx: GraphicsContext, lay: Lay) {
        func edge(_ a: CGPoint, _ b: CGPoint) {
            stroke(ctx, a, b, w: edgeW, color: roadEdge)
        }

        // HS top & bottom edges (full width)
        edge(.init(x: 0, y: lay.hsTop),    .init(x: lay.w, y: lay.hsTop))
        edge(.init(x: 0, y: lay.hsBottom), .init(x: lay.w, y: lay.hsBottom))

        // Erase HS edges inside junction box
        ctx.fill(Path(CGRect(x: lay.bLeft, y: lay.hsTop,
                             width: 2*lay.rh, height: 2*lay.rh)), with: .color(.white))

        // NS arm B left & right edges
        edge(.init(x: lay.bLeft,  y: lay.bTop), .init(x: lay.bLeft,  y: lay.bBottom))
        edge(.init(x: lay.bRight, y: lay.bTop), .init(x: lay.bRight, y: lay.bBottom))

        // NS arm D (4-arm)
        if config.armCount == 4 {
            edge(.init(x: lay.bLeft,  y: lay.dTop), .init(x: lay.bLeft,  y: lay.dBottom))
            edge(.init(x: lay.bRight, y: lay.dTop), .init(x: lay.bRight, y: lay.dBottom))
            // Erase HS edges inside D junction
            ctx.fill(Path(CGRect(x: lay.bLeft, y: lay.hsTop,
                                 width: 2*lay.rh, height: 2*lay.rh)), with: .color(.white))
        }

        // 2-lane NS arm B: center separator when streams have separate lanes
        if nsArmBhas2Lanes {
            stroke(ctx, .init(x: lay.jx, y: lay.bTop), .init(x: lay.jx, y: lay.bBottom),
                   w: edgeW, color: roadEdge)
        }
        if nsArmDhas2Lanes {
            stroke(ctx, .init(x: lay.jx, y: lay.dTop), .init(x: lay.jx, y: lay.dBottom),
                   w: edgeW, color: roadEdge)
        }
    }

    /// Arm B shows as 2-lane when streams have dedicated separate approach lanes.
    /// Triggered by mixedLaneCombination != .all (Kreuzung) or future flag (Einmündung).
    private var nsArmBhas2Lanes: Bool {
        guard config.arms.count > 2 else { return false }
        if config.armCount == 4 {
            return config.arms[2].mixedLaneCombination != .all
        }
        return false
    }
    private var nsArmDhas2Lanes: Bool {
        guard config.armCount == 4, config.arms.count > 3 else { return false }
        return config.arms[3].mixedLaneCombination != .all
    }

    // MARK: - Center lines (dashed)

    private func drawCenterLines(ctx: GraphicsContext, lay: Lay) {
        let hsStyle = StrokeStyle(lineWidth: centerW, dash: [11, 7])
        let nsStyle = StrokeStyle(lineWidth: 1.1, dash: [6, 5])

        func dashed(_ a: CGPoint, _ b: CGPoint, style: StrokeStyle) {
            var p = Path(); p.move(to: a); p.addLine(to: b)
            ctx.stroke(p, with: .color(centerColor), style: style)
        }

        // HS center (skip junction zone)
        dashed(.init(x: 0, y: lay.jy), .init(x: lay.bLeft - 2, y: lay.jy), style: hsStyle)
        dashed(.init(x: lay.bRight + 2, y: lay.jy), .init(x: lay.w, y: lay.jy), style: hsStyle)

        // NS arm B center (skip where solid separator drawn)
        if !nsArmBhas2Lanes {
            dashed(.init(x: lay.jx, y: lay.bTop + 3), .init(x: lay.jx, y: lay.bBottom - 4), style: nsStyle)
        }
        // NS arm D center
        if config.armCount == 4 && !nsArmDhas2Lanes {
            dashed(.init(x: lay.jx, y: lay.dTop + 4), .init(x: lay.jx, y: lay.dBottom - 3), style: nsStyle)
        }
    }

    // MARK: - Yield markers ▼ / ▲

    private func drawYieldMarkers(ctx: GraphicsContext, lay: Lay) {
        let ts: CGFloat = 4.2; let th = ts * 1.65
        let spacing: CGFloat = ts * 2.3
        let count = nsArmBhas2Lanes ? 5 : 4
        let totalW = CGFloat(count - 1) * spacing

        func tri(_ cx: CGFloat, _ cy: CGFloat, down: Bool) {
            var p = Path()
            if down {
                p.move(to: .init(x: cx, y: cy + th))
                p.addLine(to: .init(x: cx - ts, y: cy))
                p.addLine(to: .init(x: cx + ts, y: cy))
            } else {
                p.move(to: .init(x: cx, y: cy - th))
                p.addLine(to: .init(x: cx - ts, y: cy))
                p.addLine(to: .init(x: cx + ts, y: cy))
            }
            p.closeSubpath()
            ctx.fill(p, with: .color(.black))
        }

        let yB = lay.hsBottom + 6
        for i in 0..<count {
            tri(lay.jx - totalW/2 + CGFloat(i)*spacing, yB, down: true)
        }
        if config.armCount == 4 {
            let yD = lay.hsTop - 6
            let countD = nsArmDhas2Lanes ? 5 : 4
            let totalWD = CGFloat(countD - 1) * spacing
            for i in 0..<countD {
                tri(lay.jx - totalWD/2 + CGFloat(i)*spacing, yD, down: false)
            }
        }
    }

    // MARK: - Geometry features (Fn 2, 3, 4, Fg)

    private func drawGeometryFeatures(ctx: GraphicsContext, lay: Lay) {
        drawTriangleIslands(ctx: ctx, lay: lay)
        drawHatchedMedian(ctx: ctx, lay: lay)
        drawPedestrianCrossings(ctx: ctx, lay: lay)
    }

    private func drawTriangleIslands(ctx: GraphicsContext, lay: Lay) {
        let leg = lay.rh * 0.70
        let fill   = Color(white: 0.55)
        let border = Color(white: 0.30)

        func tri(_ pts: [CGPoint]) {
            var p = Path(); p.move(to: pts[0])
            pts.dropFirst().forEach { p.addLine(to: $0) }
            p.closeSubpath()
            ctx.fill(p, with: .color(fill))
            ctx.stroke(p, with: .color(border), lineWidth: 0.8)
        }

        if config.arms.indices.contains(0) && config.arms[0].hasRightTurnTriangleIsland {
            let cx = lay.bLeft; let cy = lay.hsBottom
            tri([.init(x: cx, y: cy), .init(x: cx-leg, y: cy), .init(x: cx, y: cy+leg)])
        }
        if config.arms.indices.contains(1) && config.arms[1].hasRightTurnTriangleIsland {
            let cx = lay.bRight; let cy = lay.hsTop
            tri([.init(x: cx, y: cy), .init(x: cx+leg, y: cy), .init(x: cx, y: cy-leg)])
        }
        if config.arms.indices.contains(2) && config.arms[2].hasRightTurnTriangleIsland {
            let cx = lay.bRight; let cy = lay.hsBottom
            tri([.init(x: cx, y: cy), .init(x: cx+leg, y: cy), .init(x: cx, y: cy+leg)])
        }
        if config.armCount == 4 && config.arms.indices.contains(3) && config.arms[3].hasRightTurnTriangleIsland {
            let cx = lay.bLeft; let cy = lay.hsTop
            tri([.init(x: cx, y: cy), .init(x: cx-leg, y: cy), .init(x: cx, y: cy-leg)])
        }
    }

    private func drawHatchedMedian(ctx: GraphicsContext, lay: Lay) {
        let iH: CGFloat = lay.rh * 0.40
        let margin: CGFloat = lay.rh * 0.55
        let fill   = Color(white: 0.80)
        let stripe = Color(white: 0.55)
        let sp: CGFloat = 4.5; let lw: CGFloat = 1.0

        func hatchH(_ rect: CGRect) {
            ctx.fill(Path(rect), with: .color(fill))
            ctx.stroke(Path(rect), with: .color(Color(white: 0.45)), lineWidth: 0.6)
            var off: CGFloat = -rect.height
            while off < rect.width + rect.height {
                let ax = rect.minX + off; let bx = ax + rect.height
                let cax = max(ax, rect.minX); let cbx = min(bx, rect.maxX)
                guard cax < cbx else { off += sp; continue }
                let t0 = (cax - ax) / rect.height; let t1 = (cbx - ax) / rect.height
                var p = Path()
                p.move(to: .init(x: cax, y: rect.minY + t0 * rect.height))
                p.addLine(to: .init(x: cbx, y: rect.minY + t1 * rect.height))
                ctx.stroke(p, with: .color(stripe), style: StrokeStyle(lineWidth: lw))
                off += sp
            }
        }

        if config.arms.indices.contains(0) && config.arms[0].rightLaneVolume != nil {
            let r = CGRect(x: lay.axEnd + margin, y: lay.jy + lay.rh * 0.10,
                           width: lay.al - margin * 1.5, height: iH)
            hatchH(r)
        }
        if config.arms.indices.contains(1) && config.arms[1].rightLaneVolume != nil {
            let r = CGRect(x: lay.bRight + margin, y: lay.jy - lay.rh * 0.10 - iH,
                           width: lay.al - margin * 1.5, height: iH)
            hatchH(r)
        }
    }

    private func drawPedestrianCrossings(ctx: GraphicsContext, lay: Lay) {
        let sw: CGFloat = lay.rh * 0.14; let sg = sw * 0.65
        let n = 4; let depth = CGFloat(n)*sw + CGFloat(n-1)*sg
        let gap: CGFloat = 4
        let col = Color.yellow

        func stripesH(_ x0: CGFloat, _ y0: CGFloat, _ h: CGFloat) {
            for i in 0..<n {
                ctx.fill(Path(CGRect(x: x0 + CGFloat(i)*(sw+sg), y: y0, width: sw, height: h)), with: .color(col))
            }
        }
        func stripesV(_ x0: CGFloat, _ y0: CGFloat, _ w: CGFloat) {
            for i in 0..<n {
                ctx.fill(Path(CGRect(x: x0, y: y0 + CGFloat(i)*(sw+sg), width: w, height: sw)), with: .color(col))
            }
        }

        if config.arms.indices.contains(0) && config.arms[0].hasPedestrianCrossing {
            stripesH(lay.bLeft - gap - depth, lay.hsTop, lay.rh * 2)
        }
        if config.arms.indices.contains(1) && config.arms[1].hasPedestrianCrossing {
            stripesH(lay.bRight + gap, lay.hsTop, lay.rh * 2)
        }
        if config.arms.indices.contains(2) && config.arms[2].hasPedestrianCrossing {
            stripesV(lay.bLeft, lay.bTop + gap, lay.rh * 2)
        }
        if config.armCount == 4 && config.arms.indices.contains(3) && config.arms[3].hasPedestrianCrossing {
            stripesV(lay.bLeft, lay.dBottom - gap - depth, lay.rh * 2)
        }
    }

    // MARK: - Stream arrows

    struct Arrow {
        let number: Int
        let volume: Double
        let from, to: CGPoint
        let labelPos: CGPoint
        let labelRight: Bool   // true = label to the right of arrow; false = left
    }

    private func arrows(lay: Lay) -> [Arrow] {
        guard config.arms.count >= 2 else { return [] }
        var out: [Arrow] = []
        let n = config.armCount
        let a0 = config.arms[0]
        let a1 = config.arms[1]

        let arrowLen = lay.bLeft * 0.28  // ← Pfeillänge Geradeausströme

        // Pfeil-Startpunkte: im mittleren Drittel des jeweiligen Arms
        let ax0 = lay.w * 0.22  // ← Startpunkt x Arm-A-Pfeile
        let cx0 = lay.w * 0.78  // ← Startpunkt x Arm-C-Pfeile

        // Vertikale Y-Positionen innerhalb der HS:
        //   yTop  = Geradeaus/aufwärts-Richtung (und Linksabbieger in Kreuzung)
        //   yMid  = Geradeaus-Richtung in Kreuzung
        //   yTurn = Abbiegeströme zu Arm B (Einmündung: unter yTop, Kreuzung: noch weiter unten)
        let yTop  = lay.jy - lay.rh * (n == 3 ? 0.50 : 0.72)
        let yMid  = lay.jy - lay.rh * 0.18
        let yTurn = lay.jy + lay.rh * (n == 3 ? 0.30 : 0.72)  // ← Startpunkt Abbiegeströme 3/7

        // Abbiegeströme 3/7 enden tief in Arm B → steiler Winkel (~30–38°)
        let b3end = CGPoint(x: lay.bLeft + lay.rh * 0.15, y: lay.bTop + lay.rh * 1.8)
        let b7end = CGPoint(x: lay.bRight - lay.rh * 0.15, y: lay.bTop + lay.rh * 1.8)

        // Arm-B-Ströme starten klar unterhalb des Eintritts von Strom 3/7
        let by0 = lay.bTop + lay.rh * 3.8  // ← Startpunkt y Arm-B-Pfeile

        // ── Arm A (fährt →) ───────────────────────────────────────────────────
        if n == 4 {
            // Stream 1 (A→D, Linksabbieger HS): oben → biegt steil zu Arm D
            out.append(Arrow(number: 1, volume: a0.leftVolume,
                             from: .init(x: ax0, y: yTop),
                             to:   .init(x: lay.bLeft - lay.rh * 0.15, y: lay.jy - lay.rh * 2.5),
                             labelPos: .init(x: ax0 - 8, y: yTop), labelRight: false))
        }
        // Stream 2 (A→C, gerade)
        let s2y = n == 3 ? yTop : yMid
        out.append(Arrow(number: 2, volume: a0.straightVolume,
                         from: .init(x: ax0, y: s2y),
                         to:   .init(x: ax0 + arrowLen, y: s2y),
                         labelPos: .init(x: ax0 - 8, y: s2y), labelRight: false))
        // Stream 3 (A→B, Rechtsabbieger): biegt zu Arm B → steiler Winkel
        out.append(Arrow(number: 3, volume: a0.rightVolume,
                         from: .init(x: ax0, y: yTurn),
                         to:   b3end,
                         labelPos: .init(x: ax0 - 8, y: yTurn), labelRight: false))

        // ── Arm C (fährt ←) ───────────────────────────────────────────────────
        if n == 4 {
            // Stream 9 (C→D, Rechtsabbieger): oben → biegt steil zu Arm D
            out.append(Arrow(number: 9, volume: a1.rightVolume,
                             from: .init(x: cx0, y: yTop),
                             to:   .init(x: lay.bRight + lay.rh * 0.15, y: lay.jy - lay.rh * 2.5),
                             labelPos: .init(x: cx0 + 8, y: yTop), labelRight: true))
        }
        // Stream 8 (C→A, gerade)
        let s8y = n == 3 ? yTop : yMid
        out.append(Arrow(number: 8, volume: a1.straightVolume,
                         from: .init(x: cx0, y: s8y),
                         to:   .init(x: cx0 - arrowLen, y: s8y),
                         labelPos: .init(x: cx0 + 8, y: s8y), labelRight: true))
        // Stream 7 (C→B, Linksabbieger): biegt zu Arm B
        out.append(Arrow(number: 7, volume: a1.leftVolume,
                         from: .init(x: cx0, y: yTurn),
                         to:   b7end,
                         labelPos: .init(x: cx0 + 8, y: yTurn), labelRight: true))

        // ── Arm B (fährt ↑) ───────────────────────────────────────────────────
        if config.arms.count > 2 {
            let a2 = config.arms[2]

            // 1-spurig: sym. links/rechts der Mitte; 2-spurig: eigene Streifen
            let off4: CGFloat = nsArmBhas2Lanes ? -lay.rh * 0.55 : -lay.rh * 0.28
            let off6: CGFloat = nsArmBhas2Lanes ? +lay.rh * 0.55 : +lay.rh * 0.28

            // Pfeilspitzen in HS: unterhalb Mittellinie, links/rechts des Arms
            let b4end = CGPoint(x: lay.bLeft - lay.rh * 0.15, y: lay.jy + lay.rh * 0.45)
            let b6end = CGPoint(x: lay.bRight + lay.rh * 0.15, y: lay.jy + lay.rh * 0.45)

            // Stream 4 (B→A, Linkseinbiegen)
            out.append(Arrow(number: 4, volume: a2.leftVolume,
                             from: .init(x: lay.jx + off4, y: by0),
                             to:   b4end,
                             labelPos: .init(x: lay.jx + off4 - 9, y: by0 + 4), labelRight: false))
            // Stream 5 (B→D, Kreuzen, 4-armig) — leicht rechts der Mittellinie
            if n == 4 {
                let x5 = lay.jx + lay.rh * 0.28  // ← x Strom 5 (versetzt von Mittellinie)
                out.append(Arrow(number: 5, volume: a2.straightVolume,
                                 from: .init(x: x5, y: by0),
                                 to:   .init(x: x5, y: lay.dBottom - lay.rh * 1.5),
                                 labelPos: .init(x: x5 + 7, y: by0 + 4), labelRight: true))
            }
            // Stream 6 (B→C, Rechtseinbiegen)
            out.append(Arrow(number: 6, volume: a2.rightVolume,
                             from: .init(x: lay.jx + off6, y: by0),
                             to:   b6end,
                             labelPos: .init(x: lay.jx + off6 + 9, y: by0 + 4), labelRight: true))
        }

        // ── Arm D (fährt ↓, 4-armig) ─────────────────────────────────────────
        if n == 4 && config.arms.count > 3 {
            let a3 = config.arms[3]
            let dy0 = lay.dBottom - lay.rh * 3.8  // ← Startpunkt y Arm-D-Pfeile

            let off12: CGFloat = nsArmDhas2Lanes ? +lay.rh * 0.55 : -lay.rh * 0.28
            let off10: CGFloat = nsArmDhas2Lanes ? -lay.rh * 0.55 : +lay.rh * 0.28

            // Pfeilspitzen in HS: oberhalb Mittellinie, links/rechts des Arms
            let d12end = CGPoint(x: lay.bLeft - lay.rh * 0.15, y: lay.jy - lay.rh * 0.45)
            let d10end = CGPoint(x: lay.bRight + lay.rh * 0.15, y: lay.jy - lay.rh * 0.45)
            let x11    = lay.jx - lay.rh * 0.28  // ← Strom 11 links der Mittellinie

            // Stream 12 (D→A, Rechtseinbiegen)
            out.append(Arrow(number: 12, volume: a3.rightVolume,
                             from: .init(x: lay.jx + off12, y: dy0),
                             to:   d12end,
                             labelPos: .init(x: lay.jx + off12 - 9, y: dy0 - 4), labelRight: false))
            // Stream 11 (D→B, Kreuzen) — leicht links der Mittellinie
            out.append(Arrow(number: 11, volume: a3.straightVolume,
                             from: .init(x: x11, y: dy0),
                             to:   .init(x: x11, y: lay.bTop + lay.rh * 1.5),
                             labelPos: .init(x: x11 - 7, y: dy0 - 4), labelRight: false))
            // Stream 10 (D→C, Linkseinbiegen)
            out.append(Arrow(number: 10, volume: a3.leftVolume,
                             from: .init(x: lay.jx + off10, y: dy0),
                             to:   d10end,
                             labelPos: .init(x: lay.jx + off10 + 9, y: dy0 - 4), labelRight: true))
        }

        return out
    }

    private func drawArrow(ctx: GraphicsContext, a: Arrow) {
        let col = a.volume > 0 ? streamColor : streamColor.opacity(0.25)
        let lw  = arrowW

        var shaft = Path(); shaft.move(to: a.from); shaft.addLine(to: a.to)
        ctx.stroke(shaft, with: .color(col), style: StrokeStyle(lineWidth: lw, lineCap: .round))

        let dx = a.to.x - a.from.x; let dy = a.to.y - a.from.y
        let ang = atan2(dy, dx)
        let hl: CGFloat = 7.5; let ha: CGFloat = 0.44
        var head = Path()
        head.move(to: a.to)
        head.addLine(to: .init(x: a.to.x - hl*cos(ang-ha), y: a.to.y - hl*sin(ang-ha)))
        head.move(to: a.to)
        head.addLine(to: .init(x: a.to.x - hl*cos(ang+ha), y: a.to.y - hl*sin(ang+ha)))
        ctx.stroke(head, with: .color(col), style: StrokeStyle(lineWidth: lw, lineCap: .round))
    }

    // MARK: - Stream labels (number + volume)

    private func streamLabel(_ a: Arrow) -> some View {
        let volText = a.volume > 0 ? "\(Int(a.volume))" : ""
        return VStack(spacing: 0) {
            Text("\(a.number)")
                .font(.system(size: 10, weight: .bold))    // ← Schriftgrösse Stromnummer
            if !volText.isEmpty {
                Text(volText)
                    .font(.system(size: 8.5, weight: .regular))  // ← Schriftgrösse Volumen [Fz/h]
            }
        }
        .foregroundStyle(streamColor)
        .position(a.labelPos)
    }

    // MARK: - Traffic signs

    private func signs(lay: Lay) -> some View {
        Canvas { ctx, _ in
            // Arm A: Vortritt-Signal ◇ — leicht nach innen, Linie zeigt nach links (weg vom A-Label)
            drawVortritt(ctx: ctx, at: .init(x: lay.w * 0.13, y: lay.jy + lay.rh * 0.40),
                         lineDir: .left)
            // Arm C: Vortritt-Signal ◇ — rechts vom Arm, oberhalb HS-Oberkante
            drawVortritt(ctx: ctx, at: .init(x: lay.w * 0.92, y: lay.hsTop - lay.rh * 2.5),
                         lineDir: .right)
            // Arm B: Kein-Vortritt-Signal ▽ — rechts vom Arm B
            drawKeinVortritt(ctx: ctx, at: .init(x: lay.bRight + lay.rh * 2.2,
                                                  y: lay.bTop + (lay.bBottom - lay.bTop) * 0.42))
            // Arm D: Kein-Vortritt-Signal ▽ — links vom Arm D
            if config.armCount == 4 {
                drawKeinVortritt(ctx: ctx, at: .init(x: lay.bLeft - lay.rh * 2.2,
                                                      y: lay.dBottom - (lay.dBottom - lay.dTop) * 0.42))
            }
        }
    }

    private enum LineDir { case left, right }

    private func drawVortritt(ctx: GraphicsContext, at c: CGPoint, lineDir: LineDir) {
        let s: CGFloat = 9    // half-size of diamond
        var outer = Path()
        outer.move(to: .init(x: c.x, y: c.y - s))
        outer.addLine(to: .init(x: c.x + s, y: c.y))
        outer.addLine(to: .init(x: c.x, y: c.y + s))
        outer.addLine(to: .init(x: c.x - s, y: c.y))
        outer.closeSubpath()
        ctx.fill(outer, with: .color(.white))
        ctx.stroke(outer, with: .color(.black), lineWidth: 1.3)

        // Inner gray diamond
        let si = s * 0.55
        var inner = Path()
        inner.move(to: .init(x: c.x, y: c.y - si))
        inner.addLine(to: .init(x: c.x + si, y: c.y))
        inner.addLine(to: .init(x: c.x, y: c.y + si))
        inner.addLine(to: .init(x: c.x - si, y: c.y))
        inner.closeSubpath()
        ctx.fill(inner, with: .color(Color(white: 0.50)))

        // Post line
        let lineLen: CGFloat = 13
        var post = Path()
        if lineDir == .left {
            post.move(to: .init(x: c.x - s, y: c.y))
            post.addLine(to: .init(x: c.x - s - lineLen, y: c.y))
        } else {
            post.move(to: .init(x: c.x + s, y: c.y))
            post.addLine(to: .init(x: c.x + s + lineLen, y: c.y))
        }
        ctx.stroke(post, with: .color(.black), lineWidth: 1.3)
    }

    private func drawKeinVortritt(ctx: GraphicsContext, at c: CGPoint) {
        let s: CGFloat = 9
        var tri = Path()
        tri.move(to: .init(x: c.x, y: c.y + s * 1.5))    // bottom tip
        tri.addLine(to: .init(x: c.x - s, y: c.y - s * 0.5))
        tri.addLine(to: .init(x: c.x + s, y: c.y - s * 0.5))
        tri.closeSubpath()
        ctx.fill(tri, with: .color(.white))
        ctx.stroke(tri, with: .color(.black), lineWidth: 1.3)
        // Post
        var post = Path()
        post.move(to: .init(x: c.x, y: c.y + s * 1.5))
        post.addLine(to: .init(x: c.x, y: c.y + s * 1.5 + 11))
        ctx.stroke(post, with: .color(.black), lineWidth: 1.3)
    }

    // MARK: - Arm letters

    private func armLetters(lay: Lay) -> some View {
        let lc = streamColor
        let fs = Font.system(size: 13, weight: .bold)  // ← Schriftgrösse Arm-Buchstaben
        return ZStack {
            // A und C: auf der HS-Mittellinie, an den äusseren Enden
            Text("A").font(fs).foregroundStyle(lc)
                .position(x: 10, y: lay.jy)                  // ← x und y anpassen
            Text("C").font(fs).foregroundStyle(lc)
                .position(x: lay.w - 10, y: lay.jy)          // ← x und y anpassen
            // B: am unteren Ende von Arm B
            Text("B").font(fs).foregroundStyle(lc)
                .position(x: lay.jx, y: lay.bBottom - 10)    // ← x und y anpassen
            if config.armCount == 4 {
                // D: am oberen Ende von Arm D
                Text("D").font(fs).foregroundStyle(lc)
                    .position(x: lay.jx, y: lay.dTop + 10)   // ← x und y anpassen
            }
        }
    }

    // MARK: - Utility

    private func stroke(_ ctx: GraphicsContext, _ a: CGPoint, _ b: CGPoint,
                        w: CGFloat, color: Color) {
        var p = Path(); p.move(to: a); p.addLine(to: b)
        ctx.stroke(p, with: .color(color), style: StrokeStyle(lineWidth: w))
    }
}

#Preview("Einmündung") {
      ArmConfigSchematicView(config: IntersectionConfiguration(armCount: 3))
          .frame(width: 400, height: 260)
          .padding()
  }

  #Preview("Kreuzung") {
      ArmConfigSchematicView(config: IntersectionConfiguration(armCount: 4))
          .frame(width: 360, height: 360)
          .padding()
  }
