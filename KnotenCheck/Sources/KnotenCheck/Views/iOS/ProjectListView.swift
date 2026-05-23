import SwiftUI
import SwiftData
import KnotenCheckEngine

struct ProjectListView: View {
    @Query(sort: \NodeModel.createdAt, order: .reverse) private var nodes: [NodeModel]
    @Environment(\.modelContext) private var context
    @State private var showingWizard = false
    @State private var showingHelp   = false
    @State private var newNode: NodeModel?

    var body: some View {
        NavigationStack {
            Group {
                if nodes.isEmpty { emptyState } else { nodeList }
            }
            .navigationTitle("KnotenCheck")
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button { showingWizard = true } label: {
                        Label("Neuer Knoten", systemImage: "plus")
                    }
                }
                ToolbarItem(placement: .secondaryAction) {
                    Button { showingHelp = true } label: {
                        Label("Anleitung", systemImage: "questionmark.circle")
                    }
                }
            }
            .sheet(isPresented: $showingWizard) {
                WizardContainerView(onSave: saveNew)
            }
            .sheet(isPresented: $showingHelp) {
                HelpView()
            }
            .navigationDestination(item: $newNode) { node in
                NodeDestination(nodeModel: node)
            }
        }
    }

    // MARK: - Node list

    private var nodeList: some View {
        List {
            ForEach(nodes) { node in
                NavigationLink(destination: NodeDestination(nodeModel: node)) {
                    NodeRow(node: node)
                }
            }
            .onDelete { offsets in
                offsets.map { nodes[$0] }.forEach { context.delete($0) }
            }
        }
        .listStyle(.insetGrouped)
    }

    // MARK: - Empty state

    private var emptyState: some View {
        VStack(spacing: 24) {
            Image(systemName: "road.lanes")
                .font(.system(size: 64))
                .foregroundStyle(.secondary)
            VStack(spacing: 8) {
                Text("Noch kein Knoten")
                    .font(.title2.bold())
                Text("Tippe auf + um deinen ersten\nKnoten zu analysieren.")
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }
            Button { showingWizard = true } label: {
                Label("Ersten Knoten erstellen", systemImage: "plus.circle.fill")
                    .frame(maxWidth: 280)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
        }
        .padding()
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - Save

    private func saveNew(_ vm: NodeEditorViewModel) {
        let model = NodeModel(name: vm.node.name)
        if let cfg = vm.configuration {
            model.save(configuration: cfg)
        } else {
            model.save(node: vm.node)
        }
        context.insert(model)
        newNode = model
    }
}

// MARK: - NodeRow

private struct NodeRow: View {
    let node: NodeModel

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: node.armCount == 3 ? "arrow.triangle.branch" : "plus.circle.fill")
                .font(.title3)
                .foregroundStyle(Color.accentColor)
                .frame(width: 32)

            VStack(alignment: .leading, spacing: 3) {
                Text(node.name)
                    .font(.headline)
                Text(typeLabel + " · " + node.createdAt.formatted(date: .abbreviated, time: .omitted))
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Spacer()

            if let raw = node.lastLOS, let los = LevelOfService(rawValue: raw) {
                LOSBadge(los: los)
            }
        }
        .padding(.vertical, 4)
    }

    private var typeLabel: String {
        switch node.armCount {
        case 3: return "T-Knoten"
        case 4: return "Kreuzung"
        default: return "Knoten"
        }
    }
}

// MARK: - NodeDestination

struct NodeDestination: View {
    let nodeModel: NodeModel

    var body: some View {
        if let cfg = nodeModel.loadConfiguration() {
            ResultsView(vm: NodeEditorViewModel(configuration: cfg), nodeModel: nodeModel)
        } else if let node = nodeModel.loadNode() {
            ResultsView(vm: NodeEditorViewModel(node: node), nodeModel: nodeModel)
        } else {
            ContentUnavailableView(
                "Fehler beim Laden",
                systemImage: "exclamationmark.triangle",
                description: Text("Die Konfiguration dieses Knotens konnte nicht gelesen werden.")
            )
        }
    }
}
