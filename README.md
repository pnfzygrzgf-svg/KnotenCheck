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

## Methodik — SN 640 022 verständlich erklärt

### Worum geht es?

An einem Knoten ohne Lichtsignalanlage gilt eine klare Vorrangregel: Fahrzeuge auf der Hauptstrasse haben Vortritt, Fahrzeuge von der Nebenstrasse müssen warten. Die Schweizer Norm SN 640 022 beschreibt ein Verfahren, mit dem man beurteilen kann, ob dieser Knoten für den vorhandenen Verkehr ausreichend leistungsfähig ist — oder ob es zu langen Wartezeiten und Stau kommt.

Das Verfahren gilt für Einmündungen (drei Arme) und Kreuzungen (vier Arme).

---

### Was die Norm nicht berücksichtigt: Velos und Fussgänger

Die SN 640 022 berechnet ausschliesslich die Leistungsfähigkeit für **motorisierten Individualverkehr (MIV)**. Velofahrende und Fussgängerinnen und Fussgänger kommen im Berechnungsverfahren nicht vor — weder als eigene Ströme, noch als Einflussgrösse auf die Kapazität der Motorfahrzeuge.

Das hat weitreichende Konsequenzen: Wie lange Velofahrende an einer Einmündung warten müssen, wie sicher eine Querung für Fussgängerinnen und Fussgänger ist, oder ob der Knoten überhaupt für alle Verkehrsteilnehmenden funktioniert — all das lässt sich mit diesem Verfahren nicht beurteilen. Die Norm bewertet einen Knoten allein aus der Perspektive des Autoverkehrs.

Wer die Qualität eines Knotens für den Fuss- und Veloverkehr beurteilen will, braucht andere Methoden und Normen.

---

### Schritt 1: Verkehrsströme erfassen und gewichten

Zuerst werden alle Fahrzeugbewegungen am Knoten erfasst: Wer kommt woher, und wohin fährt er? Jede Bewegung — Linksabbiegen, Geradeausfahren, Rechtsabbiegen — wird als eigener «Verkehrsstrom» betrachtet.

Weil ein Lastwagen mehr Platz und Zeit beansprucht als ein Personenwagen, werden alle Fahrzeuge in eine gemeinsame Einheit umgerechnet: **Personenwagen-Einheiten pro Stunde (PWE/h)**. Dabei spielt auch die Strassenneigung eine Rolle — ein Lastwagen an einem Hang entspricht mehr PWE/h als in der Ebene.

---

### Schritt 2: Rangfolge bestimmen

Die Norm teilt die Verkehrsströme in **vier Ränge** ein, je nachdem, wem gegenüber sie Vortritt gewähren müssen:

- **Rang 1** — Hauptstrasse: freie Fahrt, kein Warten
- **Rang 2** — Nebenstrasse, einfaches Einbiegen oder Linksabbiegen von der Hauptstrasse: muss einem Konfliktvolumen ausweichen
- **Rang 3** — Nebenstrasse, Querung: muss warten, bis mehrere Ströme frei sind
- **Rang 4** — Nebenstrasse, Linkseinbiegen: muss warten, bis praktisch alle anderen frei sind

Je höher der Rang, desto mehr Fahrzeuge müssen «durchgelassen» werden, bevor man selbst fahren darf — und desto kleiner ist die nutzbare Kapazität.

---

### Schritt 3: Grundleistungsfähigkeit G ablesen

Für jeden Strom ab Rang 2 wird die **Grundleistungsfähigkeit G** bestimmt. Sie gibt an, wie viele Fahrzeuge pro Stunde maximal einbiegen oder kreuzen könnten, wenn der Nebenstrassen-Strom die einzige Einschränkung wäre.

G hängt davon ab, wie viele Fahrzeuge auf dem Hauptstrom fahren: Je mehr Fahrzeuge den Weg «blockieren», desto seltener gibt es eine freie Lücke — und desto tiefer ist G. Die Werte werden direkt aus einem Diagramm der Norm (Abbildung 2) entnommen.

---

### Schritt 4: Tatsächliche Leistungsfähigkeit L berechnen

Ströme mit Rang 3 und 4 müssen nicht nur auf einen, sondern auf **mehrere** Vorrangströme gleichzeitig warten. Die tatsächliche Leistungsfähigkeit L ist deshalb kleiner als G: Sie wird mit der Wahrscheinlichkeit multipliziert, dass alle vorrangigen Ströme in dem Moment frei sind.

Wenn zwei Fahrzeuge am selben Stau «feststecken», beeinflusst dieser Stau ausserdem den nächsthöheren Rang — auch das berücksichtigt die Norm.

---

### Schritt 5: Auslastungsgrad und Reserve berechnen

Jetzt werden die tatsächlichen Verkehrsstärken mit der berechneten Leistungsfähigkeit verglichen:

- **Auslastungsgrad a = Verkehr / Leistungsfähigkeit**  
  Ein Wert von 0,5 bedeutet: Der Strom ist zu 50 % ausgelastet.  
  Ein Wert von 1,0 bedeutet: Die Kapazitätsgrenze ist erreicht — ab hier entsteht dauerhafter Stau.

- **Belastungsreserve R = Leistungsfähigkeit − Verkehr**  
  Wie viele Fahrzeuge pro Stunde könnten noch zusätzlich abgewickelt werden?

---

### Schritt 6: Wartezeit berechnen

Die mittlere Wartezeit gibt an, wie lange ein Fahrzeug im Durchschnitt warten muss, bevor es einbiegen oder kreuzen kann. Sie setzt sich aus zwei Teilen zusammen:

1. **Bedienzeit:** Selbst ohne Warteschlange braucht ein Fahrzeug eine gewisse Zeit, um eine geeignete Lücke im Verkehr zu finden und zu nutzen.
2. **Wartezeit durch Stau:** Je höher der Auslastungsgrad, desto länger steht das Fahrzeug in der Warteschlange.

Die Formel stammt von Kimber & Hollis (1979) und bildet die Grundlage für die grafische Darstellung in Abbildung 4 der Norm.

---

### Schritt 7: Qualitätsstufe ablesen

Aus Auslastungsgrad und Wartezeit ergibt sich die **Qualitätsstufe (QS)** — vergleichbar mit Schulnoten von A bis F:

| QS | Wartezeit | Bedeutung |
|---|---|---|
| A | ≤ 10 s | Sehr gut — kaum Wartezeiten |
| B | ≤ 20 s | Gut |
| C | ≤ 30 s | Befriedigend |
| D | ≤ 45 s | Ausreichend — spürbare Wartezeiten |
| E | > 45 s | Mangelhaft — lange Wartezeiten |
| F | Überlastet | Dauerstau — Leistungsfähigkeit überschritten |

---

### Sonderfall: Mischstreifen

Wenn auf der Nebenstrasse kein separater Abbiegestreifen vorhanden ist, benutzen mehrere Ströme (z. B. Geradeausfahrer und Linksabbieger) dieselbe Spur. Die Norm berechnet für diesen «Mischstreifen» eine kombinierte Leistungsfähigkeit — massgebend ist der am stärksten belastete Strom.

---

### Einfluss von Geometrie: Mehrspurigkeit und Dreiecksinsel

Die Geometrie des Knotens wirkt sich direkt auf die Leistungsfähigkeit aus. Die Norm berücksichtigt zwei wichtige Sonderfälle:

**Mehrere Fahrstreifen auf der Hauptstrasse**  
Wer von der Nebenstrasse einbiegt, muss in erster Linie eine Lücke im nächstgelegenen Fahrstreifen der Hauptstrasse abwarten. Wenn die Hauptstrasse zwei Spuren hat, zählt für das Konfliktvolumen deshalb nur die rechte Spur — die Fahrzeuge auf der linken Spur sind für den Einbiegevorgang weniger relevant. Das reduziert das wirksame Konfliktvolumen und erhöht damit die Grundleistungsfähigkeit G.

Auf der Nebenstrasse gilt ähnliches: Gibt es einen **separaten Rechtsabbiegestreifen**, können Rechtsabbieger unabhängig von den Geradeausfahrern und Linksabbiegern abfliessen. Ihre Wartezeit wird separat berechnet, und sie behindern die anderen Ströme nicht mehr.

**Dreiecksinsel für Rechtsabbieger**  
Eine Dreiecksinsel ist eine bauliche Verkehrsinsel, die den Rechtsabbiegestreifen vom übrigen Fahrverkehr trennt. Wenn diese Insel mit einem «Kein Vortritt»- oder «Stop»-Signal versehen ist, behandelt die Norm die Rechtsabbieger als eigenständigen, untergeordneten Strom. Sie tauchen dann nicht mehr als Teil des Konfliktvolumens der anderen Nebenstrassen-Ströme auf — was deren Leistungsfähigkeit erhöht.

---

## Berechnungsverfahren (technisch)

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
| 1400 | 375 | 320 | 225 | 225 |
| 1600 | 300 | 250 | 225 | 200 |
| 1800 | 225 | 200 | 200 | 175 |

Hinweis: Die Kurven «Kreuzen» und «Linkseinbiegen» schneiden sich in Abb. 2 bei qpi≈50. Ab qpi>50 liegt Kreuzen über Linkseinbiegen; bei qpi=1400 sind beide ≈225 (innerhalb der Ablesegenauigkeit).

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
