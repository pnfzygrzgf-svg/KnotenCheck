import Foundation
import SwiftUI
import KnotenCheckEngine

@MainActor
@Observable
final class NodeEditorViewModel {
    var node: IntersectionNode
    var configuration: IntersectionConfiguration?
    var calculationService = CalculationService()
    var wizardStep: Int = 0
    var showingAddStream = false

    init(name: String = "Neuer Knoten") {
        self.node = IntersectionNode(name: name)
    }

    init(node: IntersectionNode) {
        self.node = node
    }

    init(configuration: IntersectionConfiguration) {
        self.configuration = configuration
        self.node = configuration.toIntersectionNode()
    }

    // MARK: - Streams

    func addStream(name: String, rank: ReferenceValues.Rank, mode: VehicleMode, volume: Double, armLabel: String? = nil) {
        var stream = TrafficStream(name: name, rank: rank, mode: mode, volume: volume)
        stream.armLabel = armLabel
        node.streams.append(stream)
    }

    /// Nur anzuzeigende Ströme (keine Hilfsströme wie Mischstreifen-Teilströme).
    var displayStreams: [TrafficStream] {
        node.streams.filter { !$0.isAuxiliary }
    }

    func removeStream(at offsets: IndexSet) {
        let idsToRemove = offsets.map { node.streams[$0].id }
        node.streams.remove(atOffsets: offsets)
        // Referenzen bereinigen
        for i in node.streams.indices {
            node.streams[i].dominatingStreamIDs.removeAll { idsToRemove.contains($0) }
        }
        node.conflictGroups.removeAll { group in
            group.streamIDs.allSatisfy { idsToRemove.contains($0) }
        }
    }

    func updateVolume(for streamID: UUID, volume: Double) {
        guard let i = node.streams.firstIndex(where: { $0.id == streamID }) else { return }
        node.streams[i].volume = volume
    }

    // MARK: - Konflikte

    func addConflictGroup(streamIDs: [UUID], type: ConflictType, rankOverrides: [UUID: ReferenceValues.Rank] = [:]) {
        let group = ConflictGroup(streamIDs: streamIDs, conflictType: type, rankOverrides: rankOverrides)
        node.conflictGroups.append(group)
    }

    func removeConflictGroup(at offsets: IndexSet) {
        node.conflictGroups.remove(atOffsets: offsets)
    }

    // MARK: - Berechnung

    func calculate() async {
        if let cfg = configuration {
            node = cfg.toIntersectionNode()
        }
        await calculationService.calculate(
            node: node,
            snVolumes: configuration?.toSNVolumes(),
            snLaneFlags: configuration?.snLaneFlags ?? .init()
        )
    }

    var canCalculate: Bool {
        configuration != nil || (!node.streams.isEmpty && !node.conflictGroups.isEmpty)
    }

    var snResult: SN640022Result? { calculationService.snResult }

    /// Norm S. 12: Fussgänger verzichten nicht auf Vortritt → Type 2 ist für FG-Konflikte unzulässig.
    var configurationWarnings: [String] {
        node.conflictGroups.compactMap { group in
            guard group.conflictType == .twoRankWithSwitch else { return nil }
            let hasPedestrian = group.streamIDs.compactMap { id in
                node.streams.first { $0.id == id }
            }.contains { $0.mode == .pedestrian }
            guard hasPedestrian else { return nil }
            return "Konflikt enthält Fussgänger mit Typ «Zweirangig mit Vortrittswechsel» — laut Norm verzichten FG nicht auf Vortritt. Bitte auf Typ 1 ändern."
        }
    }

    // MARK: - Ergebnis-Hilfsfunktionen (für UI)

    func result(for streamID: UUID) -> StreamResult? {
        calculationService.result?.streamResults.first { $0.id == streamID }
    }

    func utilizationColor(for streamID: UUID) -> Color {
        guard let x = result(for: streamID)?.utilizationDegree else { return .secondary }
        switch x {
        case ..<0.70: return .green
        case ..<0.90: return .yellow
        case ..<1.00: return .orange
        default:      return .red
        }
    }

    func statusLabel(for streamID: UUID) -> String {
        guard let r = result(for: streamID) else { return "Nicht berechnet" }
        switch r.levelOfService {
        case .A: return "Sehr gut – Wartezeit unter 10 s"
        case .B: return "Sehr gut – Wartezeit 10–15 s"
        case .C: return "Gut – Wartezeit 15–25 s"
        case .D: return "Ausreichend – Wartezeit 25–45 s"
        case .E: return "Kritisch – Wartezeit über 45 s"
        case .F: return "Überlastet – dauerhafter Stau"
        }
    }

    func delayText(for streamID: UUID) -> String {
        guard let w = result(for: streamID)?.delay else { return "—" }
        if w.isInfinite { return "> 999 s" }
        return "ca. \(Int(w)) s Wartezeit"
    }

    func queueText(for streamID: UUID) -> String {
        guard let k = result(for: streamID)?.queueLength else { return "—" }
        if k.isInfinite { return "∞" }
        return "ca. \(Int(k.rounded())) Fahrzeuge"
    }

    func utilizationPercent(for streamID: UUID) -> Int {
        guard let x = result(for: streamID)?.utilizationDegree, x.isFinite else { return 0 }
        return min(150, Int(x * 100))
    }

    var overallLOS: LevelOfService {
        snResult?.overallLevelOfService ?? calculationService.result?.worstLevelOfService ?? .A
    }

    var hasResult: Bool { calculationService.result != nil || snResult != nil }
    var isCalculating: Bool { calculationService.isCalculating }
    var convergenceWarning: String? {
        guard let r = calculationService.result, !r.converged else { return nil }
        return "Iteration nicht konvergiert (\(r.iterationCount) Schritte). Ergebnis ist Näherung."
    }
}
