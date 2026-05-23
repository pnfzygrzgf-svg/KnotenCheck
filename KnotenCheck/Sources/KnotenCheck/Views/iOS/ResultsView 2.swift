import SwiftUI
import KnotenCheckEngine

struct ResultsView: View {
    @State var vm: NodeEditorViewModel
    var nodeModel: NodeModel? = nil
    @State private var showingEdit = false
    @State private var showGraph = false
    @State private var showExtended = false

    var body: some View {
        NavigationStack {
            Group {
                if vm.isCalculating {
                    ProgressView("Berechne…")
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if vm.hasResult {
                    resultContent
                } else {
                    calculatePrompt
                }
            }
            .navigationTitle(vm.node.name)
            .navigationBarTitleDisplayMode(.large)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    HStack {
                        Button(action: { showingEdit = true }) {
                            Image(systemName: "slider.horizontal.3")
                        }
                        if vm.hasResult {
                            ShareLink(
                                item: exportText,
                                subject: Text("KnotenCheck Ergebnis"),
                                message: Text(vm.node.name)
                            )
                        }
                    }
                }
            }
            .sheet(isPresented: $showingEdit) {
                editSheet
            }
            .task {
                guard !vm.hasResult, vm.canCalculate else { return }
                await vm.calculate()
                nodeModel?.lastLOS = vm.overallLOS.rawValue
            }
        }
    }

    // MARK: - Edit sheet

    @ViewBuilder
    private var editSheet: some View {
        if let cfg = vm.configuration {
            ArmConfiguratorEditSheet(config: $vm.configuration.unwrapped(cfg)) {
                if let c = vm.configuration { nodeModel?.save(configuration: c) }
                Task { await vm.calculate(); nodeModel?.lastLOS = vm.overallLOS.rawValue }
            }
        } else {
            EditVolumesSheet(vm: vm) {
                nodeModel?.save(node: vm.node)
                Task { await vm.calculate(); nodeModel?.lastLOS = vm.overallLOS.rawValue }
            }
        }
    }

    // MARK: - Subviews

    private var diagramToggle: some View {
        Picker("Ansicht", selection: $showGraph) {
            Label("Schema", systemImage: "road.lanes").tag(false)
            Label("Graph",  systemImage: "circle.grid.3x3").tag(true)
        }
        .pickerStyle(.segmented)
        .padding(.horizontal, 4)
    }

    private var resultContent: some View {
        ScrollView {
            VStack(spacing: 16) {
                diagramToggle

                if showGraph {
                    ConflictGraphView(node: vm.node)
                        .padding(.horizontal, 4)
                } else if let cfg = vm.configuration {
                    ArmConfigSchematicView(config: cfg)
                        .frame(height: 300)
                        .padding(.horizontal, 4)
                } else {
                    IntersectionSchematicView(node: vm.node)
                        .padding(.horizontal, 4)
                }

                // SN 640 022 / Erweitert toggle (nur wenn SN-Ergebnis vorhanden)
                if vm.snResult != nil {
                    Picker("Berechnung", selection: $showExtended) {
                        Text("SN 640 022").tag(false)
                        Text("Erweitert").tag(true)
                    }
                    .pickerStyle(.segmented)
                    .padding(.horizontal, 4)
                }

                if !showExtended, let sn = vm.snResult {
                    SNResultsSection(result: sn)
                } else {
                    vssResultsSection
                }

                Button(action: {
                    Task { await vm.calculate(); nodeModel?.lastLOS = vm.overallLOS.rawValue }
                }) {
                    Label("Neu berechnen", systemImage: "arrow.clockwise")
                }
                .buttonStyle(.bordered)
                .padding(.top, 4)
            }
            .padding()
        }
    }

    private var vssResultsSection: some View {
        VStack(spacing: 12) {
            overallCard

            if let warning = vm.convergenceWarning {
                warningBanner(warning)
            }

            if let err = vm.calculationService.errorMessage {
                warningBanner(err)
            }

            if vm.calculationService.result == nil {
                Text("Erweiterte Berechnung nicht verfügbar.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .center)
                    .padding()
            } else {
                ForEach(vm.displayStreams) { stream in
                    StreamResultCard(stream: stream, vm: vm)
                }
            }
        }
    }

    private var overallCard: some View {
        HStack {
            VStack(alignment: .leading, spacing: 4) {
                Text("Gesamtbewertung")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Text(vm.overallLOS.label)
                    .font(.headline)
            }
            Spacer()
            LOSBadge(los: vm.overallLOS)
                .scaleEffect(1.4)
        }
        .padding()
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16))
    }

    private func warningBanner(_ text: String) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundStyle(.orange)
            Text(text)
                .font(.caption)
                .foregroundStyle(.primary)
        }
        .padding()
        .background(Color.orange.opacity(0.1), in: RoundedRectangle(cornerRadius: 12))
    }

    private var calculatePrompt: some View {
        ScrollView {
            VStack(spacing: 20) {
                diagramToggle

                if showGraph {
                    ConflictGraphView(node: vm.node)
                        .padding(.horizontal, 4)
                } else if let cfg = vm.configuration {
                    ArmConfigSchematicView(config: cfg)
                        .frame(height: 300)
                        .padding(.horizontal, 4)
                } else {
                    IntersectionSchematicView(node: vm.node)
                        .padding(.horizontal, 4)
                }

                if let cfg = vm.configuration {
                    let total = cfg.arms.reduce(0.0) { $0 + $1.totalVolume }
                    Text("\(cfg.armCount)-armiger Knoten · \(Int(total)) Fz/h total")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                if !vm.canCalculate {
                    Text("Mindestens ein Arm mit Verkehr erforderlich.")
                        .font(.caption)
                        .foregroundStyle(.orange)
                }

                Button(action: {
                    Task { await vm.calculate(); nodeModel?.lastLOS = vm.overallLOS.rawValue }
                }) {
                    Label("Jetzt berechnen", systemImage: "play.fill")
                        .frame(maxWidth: 280)
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
                .disabled(!vm.canCalculate)
            }
            .padding()
        }
    }

    // MARK: - Export

    private var exportText: String {
        var lines = ["KnotenCheck – \(vm.node.name)", ""]
        lines.append("Gesamtbewertung: LOS \(vm.overallLOS.rawValue) – \(vm.overallLOS.label)")
        lines.append("")
        if let sn = vm.snResult {
            lines.append("== SN 640 022 ==")
            for m in sn.mixedLanes {
                lines.append("\(m.name): \(Int(m.volumeFzh)) Fz/h, L=\(Int(m.capacity)) PWE/h, a=\(Int(m.utilizationDegree * 100))%, LOS \(m.levelOfService.rawValue)")
            }
        } else {
            for stream in vm.displayStreams {
                lines.append("\(stream.name):")
                lines.append("  Auslastung: \(vm.utilizationPercent(for: stream.id))%")
                lines.append("  \(vm.delayText(for: stream.id))")
                lines.append("  Stau: \(vm.queueText(for: stream.id))")
                lines.append("")
            }
        }
        return lines.joined(separator: "\n")
    }
}

// MARK: - ArmConfiguratorEditSheet

struct ArmConfiguratorEditSheet: View {
    @Binding var config: IntersectionConfiguration
    let onSave: () -> Void
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ArmConfiguratorView(config: $config)
                .navigationTitle("Mengen anpassen")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Abbrechen") { dismiss() }
                    }
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Speichern") { onSave(); dismiss() }
                            .fontWeight(.semibold)
                    }
                }
        }
    }
}

// MARK: - SNResultsSection

struct SNResultsSection: View {
    let result: SN640022Result

    var body: some View {
        VStack(spacing: 12) {
            // Gesamtbewertung
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Gesamtbewertung · SN 640 022")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Text(result.overallLevelOfService.label)
                        .font(.headline)
                }
                Spacer()
                LOSBadge(los: result.overallLevelOfService)
                    .scaleEffect(1.4)
            }
            .padding()
            .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16))

            // Mischstreifen (pro Arm)
            ForEach(result.mixedLanes) { m in
                SNMixedLaneCard(mixed: m)
            }

            // Rang-2 Ströme (Rang 3+4 sind im Mischstreifen enthalten)
            let rang2 = result.streams.filter { $0.rang == 2 }
            if !rang2.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Linksabbieger Hauptstrasse")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .padding(.horizontal, 4)
                    ForEach(rang2) { s in
                        SNStreamRow(stream: s)
                    }
                }
            }
        }
    }
}

private func snStreamMovement(_ n: Int) -> String {
    switch n {
    case 1:  return "Linksabbiegen HS (A→D)"
    case 3:  return "Linksabbiegen HS (A→B)"
    case 4:  return "Rechtseinbiegen NS (B→A)"
    case 5:  return "Kreuzen NS (B→D)"
    case 6:  return "Linkseinbiegen NS (B→C)"
    case 7:  return "Rechtseinbiegen NS (C→B)"
    case 9:  return "Linksabbiegen HS (C→D)"
    case 10: return "Rechtseinbiegen NS (D→C)"
    case 11: return "Kreuzen NS (D→B)"
    case 12: return "Linkseinbiegen NS (D→A)"
    default: return "Strom \(n)"
    }
}

private struct SNMixedLaneCard: View {
    let mixed: SN640022MixedResult

    var body: some View {
        let color = utilizationColor(mixed.utilizationDegree)
        let pct   = min(150, Int(mixed.utilizationDegree * 100))
        let movements = mixed.streamNumbers.map { snStreamMovement($0) }.joined(separator: " · ")

        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Image(systemName: "car.2.fill")
                    .foregroundStyle(color)
                VStack(alignment: .leading, spacing: 1) {
                    Text(mixed.armLabel)
                        .font(.headline)
                    Text(movements)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Text("\(pct)%")
                    .font(.title3).bold()
                    .foregroundStyle(color)
                LOSBadge(los: mixed.levelOfService)
            }

            CapacityGauge(value: min(1.5, mixed.utilizationDegree), color: color)

            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Leistungsfähigkeit")
                        .font(.caption2).foregroundStyle(.secondary)
                    Text("\(Int(mixed.capacity)) PWE/h")
                        .font(.caption)
                }
                Spacer()
                VStack(alignment: .trailing, spacing: 2) {
                    Text("Wartezeit")
                        .font(.caption2).foregroundStyle(.secondary)
                    Text(delayText(mixed.delay))
                        .font(.caption)
                }
            }

            Text("Reserve \(Int(mixed.reserve)) PWE/h")
                .font(.caption2)
                .foregroundStyle(.tertiary)
        }
        .padding(12)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12))
    }
}

private struct SNStreamRow: View {
    let stream: SN640022StreamResult

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(stream.movementDescription)
                    .font(.subheadline)
                Text("\(stream.name)  ·  L=\(Int(stream.capacity)) PWE/h  ·  \(delayText(stream.delay))")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            LOSBadge(los: stream.levelOfService)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 10))
    }
}

private func utilizationColor(_ x: Double) -> Color {
    switch x {
    case ..<0.70: return .green
    case ..<0.90: return .yellow
    case ..<1.00: return .orange
    default:      return .red
    }
}

private func delayText(_ w: Double) -> String {
    if w.isInfinite { return "> 999 s" }
    if w == 0       { return "< 1 s" }
    return "ca. \(Int(w)) s"
}

// MARK: - Optional Binding helper

extension Binding {
    func unwrapped<T>(_ fallback: T) -> Binding<T> where Value == T? {
        Binding<T>(
            get: { self.wrappedValue ?? fallback },
            set: { self.wrappedValue = $0 }
        )
    }
}

// MARK: - EditVolumesSheet

struct EditVolumesSheet: View {
    @Bindable var vm: NodeEditorViewModel
    let onSave: () -> Void
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    ForEach(vm.node.streams.indices.filter { !vm.node.streams[$0].isAuxiliary }, id: \.self) { i in
                        VolumeRow(stream: $vm.node.streams[i])
                    }
                } header: {
                    Text("Verkehrsmengen (Fz/h)")
                } footer: {
                    Text("Busvolumen auf gemischten Fahrspuren im MFZ-Strom einrechnen.")
                }
            }
            .formStyle(.grouped)
            .navigationTitle("Mengen anpassen")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Abbrechen") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Speichern") { onSave(); dismiss() }
                }
            }
        }
    }
}

private struct VolumeRow: View {
    @Binding var stream: TrafficStream

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(stream.name)
                Text(stream.mode.displayName)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            DoubleTextField(value: $stream.volume, width: 80)
            Text("Fz/h")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }
}
