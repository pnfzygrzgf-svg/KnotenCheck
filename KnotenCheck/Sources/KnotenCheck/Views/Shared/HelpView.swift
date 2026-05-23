import SwiftUI

struct HelpView: View {
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                wasSection
                eingabeSection
                armbezeichnungSection
                stromnummernSection
                berechnungSection
                fussgaengerSection
                mittelinselSection
                ergebnisseSection
                methodikSection
                normbasisSection
            }
            .navigationTitle("KnotenCheck – Dokumentation")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.large)
            #endif
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Fertig") { dismiss() }
                }
            }
        }
    }

    // MARK: - Was macht die App

    private var wasSection: some View {
        Section {
            HelpRow(
                icon: "building.columns",
                title: "Zweck",
                text: "KnotenCheck schätzt die Leistungsfähigkeit und Verkehrsqualität an ungesteuerten Strassenknoten ohne Lichtsignalanlage analytisch ab. Das Verfahren gilt für Einmündungen (3-armig) und Kreuzungen (4-armig) mit je einer Fahrspur pro Richtung."
            )
            HelpRow(
                icon: "figure.walk.motion",
                title: "Verkehrsteilnehmer",
                text: "Berücksichtigt werden motorisierte Fahrzeuge (PW, LW, LZ, Motorräder, Fahrräder) und Fussgänger an Querungsstreifen. Tram, Bus und Velo auf eigenen Streifen sind in dieser Version noch nicht implementiert."
            )
            HelpRow(
                icon: "exclamationmark.triangle",
                title: "Gültigkeitsbereich",
                text: "Das Verfahren gilt nicht für Kreisverkehre, lichtsignalgesteuerte Knoten oder Knoten mit mehr als zwei Fahrspuren pro Richtung. Für solche Anlagen sind andere Normverfahren massgebend."
            )
            HelpRow(
                icon: "info.circle",
                title: "Normgrundlage",
                text: "Berechnung nach VSS-Forschungsbericht 2008/301 «Analytisches Schätzverfahren» (ASTRA SBT / VSS 2008/301, Dezember 2009). Bewertung der Verkehrsqualität nach SN 640 022 (Qualitätsstufen A–F). Fussgänger-Vortritt nach SVG Art. 49 und VRV Art. 47."
            )
        } header: {
            Text("Was macht KnotenCheck?")
        }
    }

    // MARK: - Eingabe

    private var eingabeSection: some View {
        Section {
            HelpRow(
                icon: "square.grid.2x2",
                title: "Knotentyp",
                text: "Einmündung (3 Arme: A, B, C) oder Kreuzung (4 Arme: A, B, C, D). A und C sind die Hauptstrassenarme, B und D die Nebenstrassenarme."
            )
            HelpRow(
                icon: "number",
                title: "Verkehrsmengen",
                text: "Für jeden Arm werden die Fahrzeugmengen nach Fahrtrichtung eingegeben: gerade aus, rechts, links — jeweils in Fahrzeugen pro Stunde [Fz/h] für die massgebende Spitzenstunde."
            )
            HelpRow(
                icon: "arrow.up.and.down",
                title: "Längsneigung",
                text: "Neigung der Zufahrt zum Knoten (+bergauf / −bergab). Beeinflusst den Umrechnungsfaktor f [F9/F10], mit dem Fz/h in Personenwagen-Einheiten (PWE/h) umgerechnet werden."
            )
            HelpRow(
                icon: "car.2",
                title: "Fahrzeugzusammensetzung",
                text: "Fall 1 (Standardfall): f aus Tab. 1 der Norm, abhängig von Neigung. Fall 2 (bekannte Zusammensetzung): f = gewichtetes Mittel nach PW, LW, LZ, MR, FR-Anteilen (Tab. 2). Fahrräder (FR) werden als Umrechnungsfaktor berücksichtigt (fFR = 0.25 bei ±0%), nicht als eigener Verkehrsstrom."
            )
            HelpRow(
                icon: "arrow.turn.up.right",
                title: "Separater Abbiegestreifen",
                text: "Separater Linksabbiegestreifen (Fn 2): Linksabbieger haben eigene Spur → NS muss nur dem rechten Fahrstreifen Vortritt geben (F3/F4). Separater Rechtsabbiegestreifen (Fn 1): HS-Rechtsabbieger auf eigener Spur → entlastet NS-Ströme (F3/F5/F7 bzw. F4/F6/F8)."
            )
            HelpRow(
                icon: "figure.walk",
                title: "Fussgängerstreifen",
                text: "Pro Arm kann ein Fussgängerstreifen mit Fussgängervolumen [Fg/h] aktiviert werden. Optional mit Mittelinsel, die den Streifen in zwei selbstständige Hälften teilt (VRV Art. 47 Abs. 3)."
            )
        } header: {
            Text("Eingabegrössen")
        }
    }

    // MARK: - Arm-Bezeichnungen

    private var armbezeichnungSection: some View {
        Section {
            HelpRow(
                icon: "map",
                title: "Arm-Bezeichnungen",
                text: "A und C sind die Hauptstrassen-Arme (gegenüberliegend). B und D sind die Nebenstrassen-Arme. Im Schema: A links, C rechts, B unten, D oben."
            )
            HelpRow(
                icon: "crown",
                title: "Hauptstrasse (A und C)",
                text: "Fahrzeuge auf der Hauptstrasse haben Vortritt. Ausnahme: Linksabbieger von A oder C müssen dem Gegenverkehr auf der Hauptstrasse Vortritt gewähren (Ströme 1 und 7)."
            )
            HelpRow(
                icon: "pause.circle",
                title: "Nebenstrasse (B und D)",
                text: "Alle Fahrzeuge von B oder D sind vortrittsbelastet. Sie müssen warten, bis der gesamte Hauptstrassenverkehr Lücken lässt."
            )
        } header: {
            Text("Arm-Bezeichnungen")
        }
    }

    // MARK: - Stromnummern

    private var stromnummernSection: some View {
        Section {
            HelpRow(
                icon: "arrow.right",
                title: "Von Arm A (HS)",
                text: "Strom 2: gerade → C (mit Vortritt)\nStrom 3: rechts → B (mit Vortritt)\nStrom 1: links → D (ohne Vortritt gegenüber C)"
            )
            HelpRow(
                icon: "arrow.left",
                title: "Von Arm C (HS)",
                text: "Strom 8: gerade → A (mit Vortritt)\nStrom 9: rechts → D (mit Vortritt)\nStrom 7: links → B (ohne Vortritt gegenüber A)"
            )
            HelpRow(
                icon: "arrow.up",
                title: "Von Arm B (NS)",
                text: "Strom 5: gerade → D (ohne Vortritt)\nStrom 6: rechts → C (ohne Vortritt)\nStrom 4: links → A (ohne Vortritt)"
            )
            HelpRow(
                icon: "arrow.down",
                title: "Von Arm D (NS, nur Kreuzung)",
                text: "Strom 11: gerade → B (ohne Vortritt)\nStrom 12: rechts → A (ohne Vortritt)\nStrom 10: links → C (ohne Vortritt)"
            )
            HelpRow(
                icon: "arrow.triangle.turn.up.right.circle",
                title: "Einmündung (3-armig, A/C/B)",
                text: "Von A: Strom 2 gerade→C, Strom 3 rechts→B.\nVon C: Strom 8 gerade→A, Strom 7 links→B.\nVon B: Strom 4 links→A, Strom 6 rechts→C."
            )
            HelpRow(
                icon: "info.circle",
                title: "Richtungskonvention",
                text: "Links und Rechts aus Sicht des Fahrzeuglenkenden beim Verlassen des Arms. «Rechts von A» heisst: Lenker fährt von A nach B (wendet nach rechts Richtung NS-Arm B)."
            )
        } header: {
            Text("SN 640 022 – Ströme 1–12")
        } footer: {
            Text("Ströme 1 und 7 (HS-Linksabbieger) haben Rang 2. Alle NS-Ströme haben Rang 2–4. Vortrittsberechtigte Ströme (Rang 1) werden nicht durch den Knoten eingeschränkt.")
                .font(.caption2)
        }
    }

    // MARK: - Berechnung

    private var berechnungSection: some View {
        Section {
            HelpRow(
                icon: "rectangle.split.2x2",
                title: "Zwei Berechnungspfade",
                text: "SN-Pfad: direkte Berechnung nach SN 640 022 (Ströme 1–12, Formeln F1–F21). Engine-Pfad: konfliktbasierte Berechnung nach VSS 2008/301, notwendig sobald Fussgängerstreifen vorhanden sind."
            )
            HelpRow(
                icon: "1.circle",
                title: "SN-Pfad: Grundleistungsfähigkeit G_i",
                text: "G_i aus Abbildung 2 der SN 640 022, approximiert durch Exponentialfunktionen. Getrennte Kurven für: Linksabbiegen HS (Ströme 1/7), Rechtseinbiegen NS (Ströme 6/12), Kreuzen NS (Ströme 5/11), Linkseinbiegen NS (Ströme 4/10)."
            )
            HelpRow(
                icon: "2.circle",
                title: "SN-Pfad: Massgebende Belastung q_pi",
                text: "Die massgebende Hauptstrombelastung q_pi (Formeln F1–F8) bestimmt die Grundleistungsfähigkeit. Sie erfasst alle vortrittsberechtigten Ströme, die einen gegebenen Strom blockieren. Abhängig von Rang (2–4) und separatem Abbiegestreifen (Fussnoten 1/3)."
            )
            HelpRow(
                icon: "3.circle",
                title: "SN-Pfad: Kapazität L_i und Mischstreifen",
                text: "L_i = G_i für Rang-2-Ströme. L_i = p₀ · G_i für Rang-3-Ströme (p₀ = Wahrscheinlichkeit staufreier Zustand). L_i = p_z · p₀ · G_i für Rang-4-Ströme. NS-Arme bilden Mischstreifen: L_m nach Formel F21."
            )
            HelpRow(
                icon: "person.2",
                title: "Engine-Pfad: Konflikttypen",
                text: "Typ 1: Zweirangig ohne Vortrittswechsel — Standardfall für Fg/Fz.\nTyp 2: Zweirangig mit Vortrittswechsel — wenn Belastung hoch.\nTyp 5/6: Mehrrangig — für HS-Linksabbieger und NS-Ströme.\nTyp 7: Parallele Streifen.\nNicht implementiert: Konflikte mit Tram/Bus, Stau im Abfluss, LSA-Koordination."
            )
            HelpRow(
                icon: "arrow.triangle.2.circlepath",
                title: "Massgebende Leistung",
                text: "Ein Strom kann in mehreren Teilkonflikten auftreten (z.B. NS-Strom kreuzt zwei HS-Ströme). Massgebend ist die kleinste resultierende Kapazität über alle Teilkonflikte (VSS 2008/301, Normempfehlung S. 50)."
            )
        } header: {
            Text("Berechnungsablauf")
        }
    }

    // MARK: - Fussgängerstreifen

    private var fussgaengerSection: some View {
        Section {
            HelpRow(
                icon: "figure.walk",
                title: "Vortritt der Fussgänger",
                text: "Fussgänger an einem Streifen ohne Verkehrsregelung haben immer Vortritt gegenüber Fahrzeugen (SVG Art. 49, VRV Art. 47). Es gibt keinen Vortrittswechsel – Fg bleiben stets Rang 1."
            )
            HelpRow(
                icon: "function",
                title: "Formel",
                text: "Kapazität der Fahrzeuge: L_Fz = S_m2 × (1 − y_fg)²\nMit y_fg = Q_fg / S_m1 = Q_fg / 2500\nS_m2 = 1500 Fz/h\nQuelle: VSS 2008/301, S. 11, Typ 1 ohne Vortrittswechsel"
            )
            HelpRow(
                icon: "tag",
                title: "Beschriftung und Darstellung",
                text: "Jeder Streifen wird mit dem Arm-Buchstaben beschriftet: «Fg A», «Fg B», «Fg C», «Fg D». Im Schema als Zebrastreifen quer zum Arm dargestellt. Ergebnisse zusammengefasst pro Arm."
            )
        } header: {
            Text("Fussgängerstreifen")
        }
    }

    // MARK: - Mittelinsel

    private var mittelinselSection: some View {
        Section {
            HelpRow(
                icon: "island",
                title: "Rechtliche Grundlage",
                text: "VRV Art. 47 Abs. 3: «Bei Fussgängerstreifen ohne Verkehrsregelung, die durch eine Verkehrsinsel unterteilt sind, gilt jeder Teil des Überganges als selbstständiger Streifen.» Fussgänger prüfen auf der Insel den Vortritt neu."
            )
            HelpRow(
                icon: "arrow.left.arrow.right",
                title: "Zwei unabhängige Konflikte",
                text: "K1 (nahe Spur): Fg vs. Fz aus der Gegenrichtung — unabhängiger Typ-1-Konflikt.\nK2 (ferne Spur): Fg vs. Fz der Zufahrt — unabhängiger Typ-1-Konflikt.\nK1 und K2 sind vollständig unabhängig (keine Rückwirkung)."
            )
            HelpRow(
                icon: "gauge.with.needle",
                title: "Wirkung auf die Kapazität",
                text: "Ohne Mittelinsel: Fz beider Richtungen werden durch Fg gleichzeitig blockiert. Mit Mittelinsel: jede Richtung hat ihren eigenen unabhängigen Konflikt — die Kapazität ist bei ungleichmässigen Richtungsvolumen vorteilhafter."
            )
        } header: {
            Text("Fussgängerstreifen mit Mittelinsel")
        }
    }

    // MARK: - Ergebnisse

    private var ergebnisseSection: some View {
        Section {
            HelpRow(
                icon: "gauge.with.needle",
                title: "Auslastungsgrad x = Q / L",
                text: "Verhältnis Belastung [Fz/h] zu Kapazität [Fz/h]. Grün < 70 %, Gelb < 90 %, Orange < 100 %, Rot ≥ 100 % (überlastet)."
            )
            HelpRow(
                icon: "a.circle",
                title: "Qualitätsstufe A–F (SN 640 022)",
                text: "Bewertet nach mittlerer Wartezeit w:\nA  < 10 s\nB  10–15 s\nC  15–25 s\nD  25–45 s\nE  > 45 s\nF  = Überlast (x ≥ 1, Wartezeit theoretisch unbegrenzt)\nMassgebend ist das schlechteste Ergebnis aller vortrittsbelasteten Ströme."
            )
            HelpRow(
                icon: "timer",
                title: "Wartezeit w [s]",
                text: "Mittlere Wartezeit pro Fahrzeug. Berechnet nach Kimber-Hollis (VSS 2008/301, S. 10): w(x,Q) = 900[(x−1) − 4x/Q + √((x−1)² + 8(x+1+2x/Q)·x/Q)]. Steigt bei x nahe 1 stark an."
            )
            HelpRow(
                icon: "car.rear.road.lane",
                title: "Staulänge k [Fz]",
                text: "Mittlere Anzahl wartender Fahrzeuge: k = w · L / 3600. Kann zur Prüfung der Stauraumsituation in angrenzenden Abschnitten verwendet werden."
            )
            HelpRow(
                icon: "list.bullet.rectangle",
                title: "Reserve R [Fz/h]",
                text: "Freie Restkapazität: R = L − Q. Positive Werte zeigen verbleibende Kapazität; bei negativen Werten (Überlast) kann der Strom nicht alle Fahrzeuge abfertigen."
            )
        } header: {
            Text("Ergebnisse")
        }
    }

    // MARK: - Methodik

    private var methodikSection: some View {
        Section {
            HelpRow(
                icon: "function",
                title: "Kapazität Rang 1",
                text: "L₁ = S_m1 — volle maximale Sättigung. Vortrittsberechtigte werden durch den Knoten nicht eingeschränkt. S_m1 für Fahrzeuge: 1800 Fz/h; für Fussgänger: 2500 Fg/h."
            )
            HelpRow(
                icon: "function",
                title: "Kapazität Rang 2 (zweirangig)",
                text: "L₂ = S_m2 × (1 − y₁)²\ny₁ = Q₁ / S_m1 (Sättigungsgrad Rang 1)\nS_m2 für Fahrzeuge: 1500 Fz/h\nDer quadratische Term (1−y₁)² ergibt sich aus dem Zeitanteil für Auffahrt und Abfahrt."
            )
            HelpRow(
                icon: "function",
                title: "Kapazität Rang k (mehrrangig)",
                text: "L_k = S_mk × (1 − Σy_i)²\nΣy_i = Summe der Sättigungsgrade aller Ränge 1 bis k−1.\nGilt für NS-Ströme mit Rang 3 und 4 (kreuzen mehrere HS-Ströme)."
            )
            HelpRow(
                icon: "arrow.2.squarepath",
                title: "Vortrittswechsel",
                text: "Ab x* = y₁ + y₂ verzichten Vortrittsberechtigte auf ihr Recht (oder Vortrittsbelastete erzwingen es). Nach Wechsel: L₁* = S_m1·y₁/(y₁+y₂), L₂* = S_m2·y₂/(y₁+y₂). Auslastungsgrad beider Ströme wird gleich gross. Nicht anwendbar für Fussgänger."
            )
            HelpRow(
                icon: "arrow.triangle.2.circlepath",
                title: "Parallele Streifen",
                text: "Kombinierter Sättigungsgrad: y_a,b = y_a + y_b − y_a·y_b\nKombinierte Sättigung: S_a,b = ΣQ / y_a,b\nFür mehrere parallele Streifen desselben Rangs (z.B. zwei HS-Spuren)."
            )
            HelpRow(
                icon: "f.cursive",
                title: "Umrechnungsfaktor f",
                text: "Fz/h → PWE/h (Personenwagen-Einheiten). Fall 1: f aus Tab. 1 (Neigung, Kategorien unbekannt, z.B. ±0% → f = 1.1). Fall 2: f = Σ(Anteil_i × f_i) / 100 nach bekannten Kategorienanteilen (Tab. 2). Einfluss: Steigungen und schwere Fahrzeuge reduzieren die effektive Kapazität."
            )
        } header: {
            Text("Berechnungsformeln")
        } footer: {
            Text("Alle Formeln aus VSS-Forschungsbericht 2008/301, S. 9–20. Kapazitätskurven aus SN 640 022, Abb. 2.")
                .font(.caption2)
        }
    }

    // MARK: - Normgrundlagen

    private var normbasisSection: some View {
        Section {
            HelpRow(
                icon: "doc.text",
                title: "VSS-Forschungsbericht 2008/301",
                text: "«Verkehrsqualität und Leistungsfähigkeit von komplexen ungesteuerten Knoten: Analytisches Schätzverfahren». Pitzinger / Spacek, ETH Zürich, Dezember 2009 (ASTRA SBT / VSS 2008/301). Enthält alle Kapazitäts-, Wartezeit- und Stauformeln sowie Richtwerte S_m1/S_m2 und Anwendungsbeispiele."
            )
            HelpRow(
                icon: "doc.badge.checkmark",
                title: "SN 640 022 (VSS, 1999)",
                text: "«Leistungsfähigkeit, Verkehrsqualität, Belastbarkeit – Knoten ohne Lichtsignalanlage». Definiert Qualitätsstufen A–F, Strom-Nummernschema 1–12, Grundleistungsfähigkeitskurven (Abb. 2), Berechnungsformeln F1–F21 und Berechnungsbeispiele für Normal-Knoten."
            )
            HelpRow(
                icon: "book.closed",
                title: "SVG / VRV",
                text: "SVG Art. 49 und VRV Art. 6/47: Fussgänger-Vortrittsrecht und Verhalten der Fahrzeuglenkenden an Fussgängerstreifen. VRV Art. 47 Abs. 3: Mittelinsel unterteilt den Streifen in zwei selbstständige Übergänge."
            )
            HelpRow(
                icon: "info.circle",
                title: "Über KnotenCheck",
                text: "KnotenCheck ist ein inoffizielles Hilfsmittel für die ingenieurmässige Abschätzung. Entwickelt für die praktische Anwendung im Schweizer Strassenverkehrswesen. Bei abweichenden Ergebnissen sind der Forschungsbericht und die Norm massgebend."
            )
        } header: {
            Text("Normgrundlagen")
        }
    }
}

// MARK: - HelpRow

private struct HelpRow: View {
    let icon: String
    let title: String
    let text: String

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: icon)
                .frame(width: 28)
                .foregroundStyle(Color.accentColor)
                .padding(.top, 2)
            VStack(alignment: .leading, spacing: 3) {
                Text(title)
                    .font(.subheadline.bold())
                Text(text)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 2)
    }
}
