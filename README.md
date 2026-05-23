# KnotenCheck

Werkzeug zur Leistungsbeurteilung von Vortrittregelungen nach **SN 640 022** (VSS, Mai 1999).

**Web-Rechner: https://pnfzygrzgf-svg.github.io/KnotenCheck/**

## Funktionen

- T-Knoten (3 Arme) und Kreuzungen (4 Arme)
- Längsneigung und Fahrzeugkategorien (Fall 1 / Fall 2, Tab. 1 und 2)
- Fussnoten 1–4: Dreiecksinsel, separater Rechts- und Linksabbiegestreifen
- Mischstreifen-Kombination für NS-Arme (F21)
- Qualitätsstufen A–F mit Wartezeit nach Kimber-Hollis

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

GNU General Public License v3.0 — Nutzung, Veränderung und Weitergabe erlaubt, jedoch muss abgeleiteter Code ebenfalls unter GPL v3 veröffentlicht werden. Eine kommerzielle Nutzung ohne Offenlegung des Quellcodes ist nicht gestattet. Siehe [LICENSE](LICENSE).

Copyright (C) 2026 pnfzygrzgf-svg

Die Berechnungen dienen der Plausibilisierung. Sie ersetzen keine normenkonforme Überprüfung durch eine Fachperson. Kein amtliches Dokument. Keine Gewähr für die Richtigkeit der Ergebnisse.
