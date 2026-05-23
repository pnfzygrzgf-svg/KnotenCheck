import SwiftUI
import KnotenCheckEngine

struct StreamResultCard: View {
    let stream: TrafficStream
    let vm: NodeEditorViewModel

    var body: some View {
        // Ergebnis einmal nachschlagen — verhindert 5× lineare Suche pro Render
        let r       = vm.result(for: stream.id)
        let x       = r?.utilizationDegree ?? 0
        let color   = utilizationColor(x)
        let percent = min(150, Int(x * 100))

        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Image(systemName: iconName(for: stream.mode))
                    .foregroundStyle(color)
                Text(stream.name)
                    .font(.headline)
                Spacer()
                Text("\(percent)%")
                    .font(.title3).bold()
                    .foregroundStyle(color)
            }

            CapacityGauge(value: Double(percent) / 100.0, color: color)

            HStack {
                Text(losLabel(r?.levelOfService))
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Spacer()
                Text(delayText(r?.delay))
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            if let k = r?.queueLength, k > 0, k.isFinite {
                Text("Stau: ca. \(Int(k.rounded())) Fz")
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
            }
        }
        .padding(12)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12))
    }

    private func utilizationColor(_ x: Double) -> Color {
        switch x {
        case ..<0.70: return .green
        case ..<0.90: return .yellow
        case ..<1.00: return .orange
        default:      return .red
        }
    }

    private func losLabel(_ los: LevelOfService?) -> String {
        switch los {
        case .A: return "Sehr gut – Wartezeit unter 10 s"
        case .B: return "Sehr gut – Wartezeit 10–15 s"
        case .C: return "Gut – Wartezeit 15–25 s"
        case .D: return "Ausreichend – Wartezeit 25–45 s"
        case .E: return "Kritisch – Wartezeit über 45 s"
        case .F: return "Überlastet – dauerhafter Stau"
        case nil: return "Nicht berechnet"
        }
    }

    private func delayText(_ w: Double?) -> String {
        guard let w else { return "—" }
        return w.isInfinite ? "> 999 s" : "ca. \(Int(w)) s"
    }

    private func iconName(for mode: VehicleMode) -> String {
        switch mode {
        case .motorVehicle:  return "car.fill"
        case .pedestrian:    return "figure.walk"
        case .tramOwnTrack:  return "tram.fill"
        default:             return "bus.fill"
        }
    }
}
