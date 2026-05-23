import SwiftUI

/// TextField für Double-Werte. Schreibt das Ergebnis ins Binding erst beim Verlassen
/// des Feldes (Blur), nicht auf jeden Tastendruck — verhindert unnötige View-Neuzeichnungen.
struct DoubleTextField: View {
    @Binding var value: Double
    var allowDecimals: Bool = false
    var width: CGFloat = 72

    @State private var text: String = ""
    @FocusState private var focused: Bool

    var body: some View {
        TextField("0", text: $text)
            .keyboardType(allowDecimals ? .decimalPad : .numberPad)
            .multilineTextAlignment(.trailing)
            .frame(width: width)
            .focused($focused)
            .onAppear { syncFromValue() }
            .onChange(of: value) { syncFromValue() }
            .onChange(of: focused) { if !focused { commit() } }
            .onSubmit { commit() }
    }

    private func syncFromValue() {
        guard !focused else { return }
        text = value == 0 ? "" : (allowDecimals ? "\(value)" : "\(Int(value))")
    }

    private func commit() {
        let normalized = text.replacingOccurrences(of: ",", with: ".")
        if text.isEmpty {
            if value != 0 { value = 0 }
            return
        }
        if let v = Double(normalized) {
            if v != value { value = v }
            text = allowDecimals ? "\(v)" : "\(Int(v))"
        } else {
            text = value == 0 ? "" : (allowDecimals ? "\(value)" : "\(Int(value))")
        }
    }
}
