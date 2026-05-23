import SwiftUI
import KnotenCheckEngine

struct ArmConfiguratorView: View {
    @Binding var config: IntersectionConfiguration

    var body: some View {
        ScrollView {
            VStack(spacing: 12) {
                ConfigSchematic(config: config)
                ConfigNameField(name: $config.name)
                ConfigArmCountPicker(config: $config)
                ArmRoleNote(armCount: config.armCount)
                ForEach(Array(config.arms.enumerated()), id: \.element.id) { i, _ in
                    ArmCard(arm: armBinding(index: i),
                            label: config.label(for: i),
                            isHS: i < 2,
                            movements: config.movements(for: i))
                }
            }
            .padding(.horizontal)
            .padding(.vertical, 12)
        }
    }

    private func armBinding(index: Int) -> Binding<ArmConfiguration> {
        Binding(
            get: { config.arms.indices.contains(index) ? config.arms[index] : ArmConfiguration() },
            set: { if config.arms.indices.contains(index) { config.arms[index] = $0 } }
        )
    }
}

// MARK: - Schematic preview

private struct ConfigSchematic: View {
    let config: IntersectionConfiguration
    var body: some View {
        ArmConfigSchematicView(config: config)
            .frame(height: config.hasDetailedLaneConfig ? 380 : 300)
            .animation(.easeInOut(duration: 0.25), value: config.hasDetailedLaneConfig)
    }
}

// MARK: - Name field

private struct ConfigNameField: View {
    @Binding var name: String
    var body: some View {
        HStack {
            Text("Name").font(.subheadline.bold())
            Spacer()
            TextField("z.B. Limmatplatz", text: $name)
                .multilineTextAlignment(.trailing)
                .autocorrectionDisabled()
        }
        .padding()
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12))
    }
}

// MARK: - Arm count

private struct ConfigArmCountPicker: View {
    @Binding var config: IntersectionConfiguration
    var body: some View {
        HStack {
            Text("Knotentyp").font(.subheadline.bold())
            Spacer()
            Picker("Typ", selection: armCountBinding) {
                Text("T-Knoten (3)").tag(3)
                Text("Kreuzung (4)").tag(4)
            }
            .pickerStyle(.segmented)
            .frame(width: 200)
        }
        .padding()
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12))
    }

    private var armCountBinding: Binding<Int> {
        Binding(get: { config.armCount },
                set: { config.setArmCount($0) })
    }
}

// MARK: - Arm role note

private struct ArmRoleNote: View {
    let armCount: Int
    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: "info.circle")
                .foregroundStyle(.secondary)
                .font(.caption)
            Text(armCount == 3
                 ? "A, C = Hauptstrasse (Vortritt) · B = Nebenstrasse (wartepflichtig) — Rollen gemäss SN 640 022 fix."
                 : "A, C = Hauptstrasse (Vortritt) · B, D = Nebenstrasse (wartepflichtig) — Rollen gemäss SN 640 022 fix.")
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
        .padding(.horizontal, 4)
    }
}

// MARK: - Arm card

private struct ArmCard: View {
    @Binding var arm: ArmConfiguration
    let label: String
    let isHS: Bool          // positionsbasiert: Arm A (i=0) und C (i=1) sind immer HS
    let movements: [IntersectionConfiguration.Movement]

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ArmHeader(label: label, isHS: isHS, totalVolume: arm.totalVolume)
            Divider()
            ArmGradientRow(gradient: $arm.gradient, vehicleMix: $arm.vehicleMix)
            if isHS {
                Divider()
                ArmSeparateLaneRow(hasSeparateLane: $arm.hasSeparateTurnLane)
                Divider()
                ArmTriangleIslandRow(hasIsland: $arm.hasRightTurnTriangleIsland, isHS: true)
                Divider()
                ArmRightLaneRow(rightLaneVolume: $arm.rightLaneVolume)
            } else {
                Divider()
                ArmTriangleIslandRow(hasIsland: $arm.hasRightTurnTriangleIsland, isHS: false)
                // Mischstreifen-Kombination: nur bei 4-armiger Kreuzung (3 Bewegungen)
                if movements.count == 3 {
                    Divider()
                    ArmMixedLaneRow(combination: $arm.mixedLaneCombination)
                }
            }
            Divider()
            ArmMovementsSection(arm: $arm, movements: movements)
            Divider()
            ArmPedestrianRow(arm: $arm)
        }
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12))
    }
}

private struct ArmHeader: View {
    let label: String
    let isHS: Bool
    let totalVolume: Double

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 1) {
                Text("Arm \(label)").font(.subheadline.bold())
                Text("\(Int(totalVolume)) Fz/h gesamt")
                    .font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
            Text(isHS ? "Hauptstrasse" : "Nebenstrasse")
                .font(.caption)
                .foregroundStyle(.white)
                .padding(.horizontal, 8).padding(.vertical, 3)
                .background(isHS ? Color.blue : Color.orange, in: Capsule())
        }
        .padding(.horizontal).padding(.vertical, 10)
    }
}

private struct ArmMovementsSection: View {
    @Binding var arm: ArmConfiguration
    let movements: [IntersectionConfiguration.Movement]

    var body: some View {
        VStack(spacing: 0) {
            ForEach(Array(movements.enumerated()), id: \.offset) { idx, mv in
                if idx > 0 { Divider() }
                ArmMovementRow(label: mv.name,
                               volume: Binding(
                                   get: { arm[keyPath: mv.keyPath] },
                                   set: { arm[keyPath: mv.keyPath] = $0 }
                               ),
                               hasConflict: !mv.yieldsTo.isEmpty)
            }
        }
    }
}

private struct ArmMovementRow: View {
    let label: String
    @Binding var volume: Double
    let hasConflict: Bool

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 1) {
                Text(label).font(.subheadline)
                if hasConflict {
                    Text("Vortritt abwarten")
                        .font(.caption2).foregroundStyle(.orange)
                }
            }
            Spacer()
            DoubleTextField(value: $volume, width: 72)
            Text("Fz/h").font(.caption).foregroundStyle(.secondary)
        }
        .padding(.horizontal).padding(.vertical, 8)
    }
}

private struct ArmTriangleIslandRow: View {
    @Binding var hasIsland: Bool
    let isHS: Bool

    var body: some View {
        Toggle(isOn: $hasIsland) {
            VStack(alignment: .leading, spacing: 1) {
                Text("Dreiecksinsel für Rechtsabbieger").font(.subheadline)
                Text(isHS
                     ? "HS-Rechtsabbieger (A→B resp. C→D) haben zwar Vortritt, müssen aber an der Dreiecksinsel anhalten oder Vortritt gewähren (Zeichen «Kein Vortritt» oder «Stop» auf der Insel). Sie behindern damit den HS-Linksabbieger und die NS-Kreuzungsströme nicht mehr — q3 resp. q9 entfällt in F1, F2, F5, F6 (Fn 3)."
                     : "NS-Rechtsabbieger (B→C resp. D→A) werden durch eine Dreiecksinsel vom übrigen Verkehr getrennt und müssen anhalten oder Vortritt gewähren. Sie entfallen aus der NS-Linkseinbieger-Formel: q12 in F7, q6 in F8 (Fn 4).")
                    .font(.caption2).foregroundStyle(.secondary)
            }
        }
        .padding(.horizontal).padding(.vertical, 8)
    }
}

private struct ArmRightLaneRow: View {
    @Binding var rightLaneVolume: Double?

    var body: some View {
        VStack(spacing: 0) {
            Toggle(isOn: Binding(
                get: { rightLaneVolume != nil },
                set: { rightLaneVolume = $0 ? 0 : nil }
            )) {
                VStack(alignment: .leading, spacing: 1) {
                    Text("Separater Linksabbiegestreifen (HS)").font(.subheadline)
                    Text("Linksabbieger (Strom 1 resp. 7) haben eine eigene Spur und stehen dem Geradeaus- und Rechtsabbieger-Verkehr nicht im Weg. Die NS muss nur dem rechten Fahrstreifen Vortritt geben (Fn 2, F3/F4).")
                        .font(.caption2).foregroundStyle(.secondary)
                }
            }
            .padding(.horizontal).padding(.vertical, 8)
            if rightLaneVolume != nil {
                Divider()
                HStack {
                    Text("Belastung rechter Fahrstreifen").font(.subheadline)
                    Spacer()
                    DoubleTextField(value: Binding(
                        get: { rightLaneVolume ?? 0 },
                        set: { rightLaneVolume = $0 }
                    ), width: 72)
                    Text("Fz/h").font(.caption).foregroundStyle(.secondary)
                }
                .padding(.horizontal).padding(.vertical, 8)
            }
        }
    }
}

private struct ArmSeparateLaneRow: View {
    @Binding var hasSeparateLane: Bool
    var body: some View {
        Toggle(isOn: $hasSeparateLane) {
            VStack(alignment: .leading, spacing: 1) {
                Text("HS-Rechtsabbieger auf separatem Streifen (Fn 1)").font(.subheadline)
                Text("Der HS-Rechtsabbieger (A→B resp. C→D) fährt auf einer eigenen Spur ab und kreuzt den NS-Bereich nicht mehr. Entlastet alle NS-Ströme: q3f resp. q9f = 0 in F3–F8. SN 640 022 Fussnote 1.")
                    .font(.caption2).foregroundStyle(.secondary)
            }
        }
        .padding(.horizontal).padding(.vertical, 8)
    }
}

private struct ArmMixedLaneRow: View {
    @Binding var combination: SN640022LaneFlags.MixedLaneCombination

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                VStack(alignment: .leading, spacing: 1) {
                    Text("Mischstreifen-Kombination").font(.subheadline)
                    Text("Welche NS-Ströme teilen dieselbe Wartelinie (SN 640 022, Abschn. 13, [F21]).")
                        .font(.caption2).foregroundStyle(.secondary)
                }
                Spacer()
            }
            .padding(.horizontal).padding(.top, 8).padding(.bottom, 4)
            Picker("Mischstreifen", selection: $combination) {
                Text("Alle geteilt (4+5+6 / 10+11+12)").tag(SN640022LaneFlags.MixedLaneCombination.all)
                Text("Links + Kreuzen (4+5 / 10+11) — Rechtseinbieger separat").tag(SN640022LaneFlags.MixedLaneCombination.leftAndThrough)
                Text("Kreuzen + Rechts (5+6 / 11+12) — Linkseinbieger separat").tag(SN640022LaneFlags.MixedLaneCombination.throughAndRight)
            }
            .pickerStyle(.inline)
            .padding(.horizontal, 4).padding(.bottom, 4)
        }
    }
}


private struct ArmGradientRow: View {
    @Binding var gradient: GradientCategory
    @Binding var vehicleMix: VehicleCategoryMix?

    private var effectiveF: Double {
        vehicleMix?.effectiveFactor(gradient: gradient) ?? gradient.fFz
    }
    private var fall2Active: Bool { vehicleMix != nil }

    var body: some View {
        VStack(spacing: 0) {
            // Gradient + f label
            HStack {
                VStack(alignment: .leading, spacing: 1) {
                    Text("Längsneigung der Zufahrt").font(.subheadline)
                    Text("(+) bergauf zum Knoten  ·  (−) bergab zum Knoten")
                        .font(.caption2).foregroundStyle(.secondary)
                    Text("Umrechnungsfaktor f = \(String(format: "%.2f", effectiveF))  (\(fall2Active ? "Fall 2, Tab. 2" : "Fall 1, Tab. 1"))")
                        .font(.caption2).foregroundStyle(.secondary)
                }
                Spacer()
                Picker("Neigung", selection: $gradient) {
                    ForEach(GradientCategory.allCases, id: \.self) { g in
                        Text(g.label).tag(g)
                    }
                }
                .pickerStyle(.menu)
                .onChange(of: gradient) {
                    if gradient != .zero { vehicleMix?.pctFR = 0 }
                }
            }
            .padding(.horizontal).padding(.vertical, 8)

            Divider()

            // Fall 2 toggle
            Toggle(isOn: Binding(
                get: { vehicleMix != nil },
                set: { vehicleMix = $0 ? VehicleCategoryMix() : nil }
            )) {
                VStack(alignment: .leading, spacing: 1) {
                    Text("Fahrzeugkategorien bekannt (Fall 2)").font(.subheadline)
                    Text("Aktiv: f nach Tab. 2 / Formel F10 (Anteile LW, LZ, MR, FR). Inaktiv: f pauschal nach Tab. 1 / Formel F9 (Kategorien unbekannt).")
                        .font(.caption2).foregroundStyle(.secondary)
                }
            }
            .padding(.horizontal).padding(.vertical, 8)

            // Vehicle mix inputs
            if var mix = vehicleMix {
                Divider()
                VehicleMixSection(
                    mix: Binding(get: { vehicleMix ?? mix }, set: { vehicleMix = $0 }),
                    gradient: gradient
                )
            }
        }
    }
}

private struct VehicleMixSection: View {
    @Binding var mix: VehicleCategoryMix
    let gradient: GradientCategory

    var body: some View {
        VStack(spacing: 0) {
            pctRow("LW (Lastwagen)",  pct: $mix.pctLW)
            Divider()
            pctRow("LZ (Lastzüge)",   pct: $mix.pctLZ)
            Divider()
            pctRow("MR (Motorräder)", pct: $mix.pctMR)
            if gradient == .zero {
                Divider()
                pctRow("FR (Fahrräder)", pct: $mix.pctFR)
            }
            Divider()
            HStack {
                VStack(alignment: .leading, spacing: 1) {
                    Text("PW (Personenwagen)").font(.subheadline)
                    if !mix.isValid {
                        Text("Summe > 100 %").font(.caption2).foregroundStyle(.red)
                    }
                }
                Spacer()
                Text("\(Int(mix.pctPW.rounded())) %")
                    .font(.subheadline)
                    .foregroundStyle(mix.isValid ? Color.secondary : Color.red)
            }
            .padding(.horizontal).padding(.vertical, 8)
        }
    }

    private func pctRow(_ label: String, pct: Binding<Double>) -> some View {
        HStack {
            Text(label).font(.subheadline)
            Spacer()
            DoubleTextField(value: pct, allowDecimals: true, width: 60)
            Text("%").font(.caption).foregroundStyle(.secondary)
        }
        .padding(.horizontal).padding(.vertical, 8)
    }
}

private struct ArmPedestrianRow: View {
    @Binding var arm: ArmConfiguration

    var body: some View {
        VStack(spacing: 0) {
            Toggle(isOn: $arm.hasPedestrianCrossing) {
                VStack(alignment: .leading, spacing: 1) {
                    Text("Fussgängerstreifen").font(.subheadline)
                    Text("Fg haben Vortritt (Rang 1) gegenüber Fz dieses Arms. Wirkt nur im Schätzverfahren (Tab «Erweitert») — nicht im SN 640 022-Ergebnis.")
                        .font(.caption2).foregroundStyle(.secondary)
                }
            }
            .padding(.horizontal).padding(.vertical, 8)

            if arm.hasPedestrianCrossing {
                Divider()
                HStack {
                    Text("Fussgänger").font(.subheadline)
                    Spacer()
                    DoubleTextField(value: $arm.pedestrianVolume, width: 72)
                    Text("Fg/h").font(.caption).foregroundStyle(.secondary)
                }
                .padding(.horizontal).padding(.vertical, 8)
                Divider()
                Toggle(isOn: $arm.hasMittelinsel) {
                    VStack(alignment: .leading, spacing: 1) {
                        Text("Mittelinsel").font(.subheadline)
                        Text("Jede Strassenhälfte gilt als eigenständiger Streifen (VRV Art. 47 Abs. 3)")
                            .font(.caption2).foregroundStyle(.secondary)
                    }
                }
                .padding(.horizontal).padding(.vertical, 8)
            }
        }
    }
}

