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

Die normenkonforme Beurteilung. Alle Formeln F1–F25 sind implementiert.

#### Grundleistungsfähigkeit G_i — Abbildung 2

Die SN 640 022 gibt die Grundleistungsfähigkeit G_i für vier Fahrbewegungen grafisch in **Abbildung 2** an (keine algebraische Formel). KnotenCheck liest die Kurven direkt als Wertetabelle ab (Stützpunkte qpi = 0, 200, 400, …, 1800 Fz/h) und interpoliert dazwischen linear. Die Ablesungen erfolgten auf den Gitterlinienpunkten des Normdiagramms.

**Warum stückweise linear statt Exponentialfit?**  
Ein einzelner Exponentialfit `A·e^(−k·qpi)` weicht bei hohen Konfliktvolumen (qpi ≥ 1400) um bis zu 40 % vom Normdiagramm ab. Stückweise Interpolation auf abgelesenen Stützpunkten reduziert den maximalen Fehler auf die Ablesegenauigkeit des Diagramms (typisch ±15 PWE/h). Zwischen zwei Stützpunkten liegt die lineare Interpolation bei konkaven Kurven leicht über dem echten Kurvenwert — das ist konservativ (leicht tiefere G_i-Werte sind möglich, werden aber nicht erzeugt).

**Stützpunkte (abgelesen Mai 2026, inkl. CH-Erhöhung +90 PWE/h gemäss SN 640 022, Abschnitt 9):**

| qpi [Fz/h] | Linksabbiegen HS | Rechtseinbiegen NS | Kreuzen NS | Linkseinbiegen NS |
|---:|---:|---:|---:|---:|
| 0 | 1575 | 1250 | 1000 | 1000 |
| 200 | 1200 | 975 | 800 | 800 |
| 400 | 950 | 750 | 625 | 600 |
| 600 | 775 | 600 | 525 | 475 |
| 800 | 600 | 475 | 425 | 375 |
| 1000 | 500 | 400 | 375 | 300 |
| 1200 | 400 | 325 | 300 | 250 |
| 1400 | 375 | 320 | 300* | 225 |
| 1600 | 300 | 250 | 225 | 200 |
| 1800 | 225 | 200 | 200 | 175 |

*) Wert bei qpi=1400 (Kreuzen NS) mit Normbeispiel Punkt 22 nicht vollständig konsistent — Nachkontrolle ausstehend. Die Normbeispiele implizieren dort ~245 PWE/h.

#### Maximale Leistungsfähigkeit L_i — Formeln F11–F20

Für Rang-2-Ströme: L_i = G_i [F11].  
Für Rang-3-Ströme: L_i = p₀ · G_i [F13–F16], wobei p₀ = 1 − q/L die Wahrscheinlichkeit des staufreien Zustands im vorrangigen Strom ist [F12].  
Für Rang-4-Ströme: L_i = p_z · p₀ · G_i [F19–F20], mit p_z nach Formel F18.

#### Wartezeit w_i — Abbildung 4 (Kimber & Hollis 1979)

Die SN 640 022 gibt die mittlere Wartezeit w_i ebenfalls grafisch an (Abbildung 4, keine algebraische Formel). Die Kurven gehen auf Kimber & Hollis (1979, TRRL Report LR 909) zurück. KnotenCheck verwendet die zugrundeliegende Formel direkt:

```
w = 3600/L + 900·T · [(a−1) + √((a−1)² + (3600/L · a) / (450·T))]
```

mit T = 0.25 h, a = q/L (Auslastungsgrad). Der Term 3600/L ist die Bedienzeit (Zeit zum Auffinden und Nutzen einer Lücke) — er stellt sicher, dass w auch bei a → 0 nie 0 wird, was der Abb. 4 entspricht.

Quellen: Kimber & Hollis (1979), Brilon (2008, TRB), PTV VISUM 2025 (Vorfahrtsgeregelte Knoten, Schritt 8).

#### Korrekturwahrscheinlichkeit p_z — Abbildung 3 / Formel F18

Die SN 640 022 gibt p_z sowohl grafisch (Abb. 3) als auch algebraisch (F18) an. KnotenCheck verwendet Formel F18 direkt:

```
p_z,i = 0.65 · p_y,i − p_y,i / (p_y,i + 3) + 0.6 · √(p_y,i)
```

#### Mischstreifen — Formel F21

```
L_m = Σq_i / Σ(q_i/L_i)
```

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
