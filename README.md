# KnotenCheck

Werkzeug zur Leistungsbeurteilung von Vortrittregelungen nach **SN 640 022** (VSS, Mai 1999).

**Web-Rechner: https://pnfzygrzgf-svg.github.io/KnotenCheck/**

## Funktionen

- T-Knoten (3 Arme) und Kreuzungen (4 Arme)
- Längsneigung und Fahrzeugkategorien (Fall 1 / Fall 2, Tab. 1 und 2)
- Fussnoten 1–4: Dreiecksinsel, separater Rechts- und Linksabbiegestreifen
- Mischstreifen-Kombination für NS-Arme (F21)
- Qualitätsstufen A–F mit Wartezeit nach Kimber-Hollis
- Zwei Berechnungsverfahren: SN 640 022 und analytisches Schätzverfahren (Teilimplementierung)

## Berechnungsverfahren

KnotenCheck bietet zwei Tabs. Die Resultate sind **nicht identisch** — das ist gewollt, da es sich um grundlegend verschiedene Methoden handelt.

### SN 640 022

Die offizielle Schweizer Norm berechnet die Grundleistungsfähigkeit mit empirisch kalibrierten Exponentialkurven:

**G_i = a · e^(−b · qpi)**

qpi ist die Summe der spezifisch definierten Konfliktströme je Bewegung (Formeln F1–F8). Die Parameter wurden an Schweizer Messdaten kalibriert. Dieses Verfahren ist für die normenkonforme Beurteilung massgebend.

### Erweitert — Analytisches Schätzverfahren

Basierend auf ausgewählten Teilen des VSS-Forschungsberichts 2008/301 (Pitzinger/Spacek, ETH Zürich, Dezember 2009). Der Bericht beschreibt ein allgemeines Konflikttyp-Verfahren für komplexe ungesteuerte Knoten. KnotenCheck implementiert davon **nur einen Teil**:

**Implementiert:**
- Typ 1 — Zweirangiger Konflikt ohne Vortrittswechsel: `L₂ = S_m · (1 − y₁)²` (für alle Fahrzeug- und Fussgängerkonflikte am Standard-Knoten)
- Mischstreifen-Aggregation: `x_M = Σ(qᵢ/Lᵢ)`, `L_M = Q_M / x_M`
- Wartezeit nach Kimber-Hollis, Staulänge

**Nicht implementiert** (im Bericht vorhanden):
- Typ 2 — Zweirangig mit Vortrittswechsel
- Typen 5/6/7 — Mehrrangige und parallele Konflikte
- Konflikt mit Lichtsignalanlage im Zufluss oder Stau im Abfluss
- Tram, Bus auf Eigentrasse

**Warum unterscheiden sich die Resultate?** SN 640 022 verwendet arm-spezifische Konfliktstrommassen (z.B. qp4 = q2 + q3 + q8 + q7), während dieses Verfahren das gesamte Arm-Volumen als Konfliktgrösse einsetzt — ein grundlegend anderer Ansatz. Beide sind methodisch korrekt, messen aber unterschiedliche Dinge.

## Repo-Struktur

| Ordner | Inhalt |
|---|---|
| `KnotenCheckEngine/` | Swift Package — Berechnungslogik SN 640 022 |
| `KnotenCheck/` | iOS-App (SwiftUI) |
| `KnotenCheckWeb/` | Web-Rechner (React, TypeScript, Vite) |

## Lokal starten

```bash
cd KnotenCheckWeb
npm install
npm run dev      # http://localhost:5173
npx vitest run   # 21 Unit-Tests gegen Norm-Beispiele
```

## Grundlagen

- SN 640 022, VSS, Mai 1999
- VSS-Forschungsbericht 2008/301 (Pitzinger/Spacek, ETH Zürich, 2009)

Die Normdokumente sind nicht Teil dieses Repositories (Urheberrecht VSS).

## Lizenz und Haftung

[Creative Commons Attribution-NonCommercial 4.0 International (CC BY-NC 4.0)](LICENSE) — Nutzung, Veränderung und Weitergabe erlaubt, **kommerzielle Nutzung ist untersagt**. Bei Weitergabe muss der Urheber genannt werden.

Copyright (C) 2026 pnfzygrzgf-svg

Die Berechnungen dienen der Plausibilisierung. Sie ersetzen keine normenkonforme Überprüfung durch eine Fachperson. Kein amtliches Dokument. Keine Gewähr für die Richtigkeit der Ergebnisse.
