import SwiftUI

struct WizardContainerView: View {
    @State private var config = IntersectionConfiguration()
    @State private var showingHelp = false
    @Environment(\.dismiss) private var dismiss
    var onSave: ((NodeEditorViewModel) -> Void)?

    var body: some View {
        NavigationStack {
            ArmConfiguratorView(config: $config)
                .navigationTitle("Knoten konfigurieren")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Abbrechen") { dismiss() }
                    }
                    ToolbarItem(placement: .primaryAction) {
                        HStack {
                            Button(action: { showingHelp = true }) {
                                Image(systemName: "questionmark.circle")
                            }
                            Button("Speichern", action: save)
                                .disabled(config.name.isEmpty || config.arms.isEmpty)
                                .fontWeight(.semibold)
                        }
                    }
                }
                .sheet(isPresented: $showingHelp) {
                    HelpView()
                }
        }
    }

    private func save() {
        let vm = NodeEditorViewModel(configuration: config)
        onSave?(vm)
        dismiss()
    }
}
