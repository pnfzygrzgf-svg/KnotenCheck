# KnotenCheck

Werkzeug zur Leistungsbeurteilung von ungesteuerten Knoten innerorts. Drei Rechner stehen zur Verfügung, je nach Knotentyp und Normgrundlage.

**Web-Rechner: https://pnfzygrzgf-svg.github.io/KnotenCheck/**

> **Beta** — Resultate mit Vorsicht verwenden und durch eine Fachperson prüfen lassen.

Vibecoding. Don't trust, verify!

---

## Rechner

### SN 640 022 — Einmündung und Kreuzung

Normenkonforme Beurteilung von T-Knoten (3 Arme) und Kreuzungen (4 Arme) mit Haupt- und Nebenstrasse.

**Grundlage:** SN 640 022 (VSS, Mai 1999)

**Funktionen:**
- Längsneigung und Fahrzeugkategorien (Fall 1 / Fall 2, Tab. 1 und 2)
- Fussnoten 1–4: Dreiecksinsel, separater Rechts- und Linksabbiegestreifen
- Mischstreifen-Kombination für NS-Arme (F21)
- Qualitätsstufen A–F mit Wartezeit nach Kimber-Hollis
- Berechnungsblatt (Druckansicht)

---

### SN 640 024a — Kreisverkehr

Beurteilung von Kreisverkehrsanlagen.

**Grundlage:** SN 640 024a

**Funktionen:**
- Abbiegeströme je Zufahrt als Eingabe
- Kapazität, Auslastungsgrad, Wartezeit und Qualitätsstufe je Zufahrt

---

### VSS 2011/308 — Ungesteuerter Knoten (Fz + Fg)

Beurteilung von Einmündungen, Kreuzungen und Rechtsvortritt-Knoten unter Berücksichtigung von Fussgänger*innen.

**Grundlage:** Forschungsbericht VSS 2011/308 — *Verkehrsablauf an ungesteuerten Knoten innerorts*, Menendez / Guler / Puffe, ETH Zürich, September 2015

**Funktionen:**
- Einmündung (T-Knoten), Kreuzung (4 Arme) und Gleicher Rang (Rechtsvortritt)
- Fussgängervolumen am Fussgängerstreifen je Arm
- Pro-Strom-Kapazität nach Kap. 5 (Ein- und Ausfahrts-Fg je Bewegungsrichtung)
- Qualitätsstufen A–F je Strom, je Arm (Mittelwert) sowie Gesamt-QS

---

## Methodik

### SN 640 022

#### Worum geht es?

An einem Knoten ohne Lichtsignalanlage gilt eine klare Vorrangregel: Fahrzeuge auf der Hauptstrasse haben Vortritt, Fahrzeuge von der Nebenstrasse müssen warten. Die SN 640 022 beschreibt ein Verfahren, mit dem man beurteilen kann, ob dieser Knoten für den vorhandenen Verkehr ausreichend leistungsfähig ist — oder ob es zu langen Wartezeiten und Stau kommt.

Das Verfahren gilt für Einmündungen (drei Arme) und Kreuzungen (vier Arme).

#### Was die Norm nicht berücksichtigt

Die SN 640 022 berechnet ausschliesslich die Leistungsfähigkeit für **motorisierten Individualverkehr (MIV)**. Velofahrende und Fussgänger*innen kommen im Berechnungsverfahren nicht vor. Wer die Qualität eines Knotens für den Fuss- und Veloverkehr beurteilen will, braucht andere Methoden — z. B. den Rechner VSS 2011/308 für Fussgänger*innen.

---

#### Schritt 1: Verkehrsströme erfassen und gewichten

Zuerst werden alle Fahrzeugbewegungen am Knoten erfasst: Wer kommt woher, und wohin fährt er? Jede Bewegung — Linksabbiegen, Geradeausfahren, Rechtsabbiegen — wird als eigener «Verkehrsstrom» betrachtet.

Weil ein Lastwagen mehr Platz und Zeit beansprucht als ein Personenwagen, werden alle Fahrzeuge in eine gemeinsame Einheit umgerechnet: **Personenwagen-Einheiten pro Stunde (PWE/h)**. Dabei spielt auch die Strassenneigung eine Rolle — ein Lastwagen an einem Hang entspricht mehr PWE/h als in der Ebene.

---

#### Schritt 2: Rangfolge bestimmen

Die Norm teilt die Verkehrsströme in Ränge ein, je nachdem, wem gegenüber sie Vortritt gewähren müssen. Bei der Kreuzung (4 Arme) gibt es vier Ränge, bei der Einmündung (3 Arme) nur drei:

- **Rang 1** — Hauptstrasse: freie Fahrt, kein Warten
- **Rang 2** — Linksabbieger von der Hauptstrasse, Rechtseinbieger aus der Nebenstrasse: muss einem Konfliktvolumen ausweichen
- **Rang 3** — Nebenstrasse, Querung: muss warten, bis mehrere Ströme frei sind
- **Rang 4** — Nebenstrasse, Linkseinbiegen *(nur Kreuzung)*: muss warten, bis praktisch alle anderen frei sind

Je höher der Rang, desto mehr Fahrzeuge müssen «durchgelassen» werden, bevor man selbst fahren darf — und desto kleiner ist die nutzbare Kapazität.

---

#### Schritt 3: Grundleistungsfähigkeit G ablesen

Für jeden Strom ab Rang 2 wird die **Grundleistungsfähigkeit G** bestimmt. Sie gibt an, wie viele Fahrzeuge pro Stunde maximal einbiegen oder kreuzen könnten, wenn der Nebenstrassen-Strom die einzige Einschränkung wäre.

G hängt davon ab, wie viele Fahrzeuge auf dem Hauptstrom fahren: Je mehr Fahrzeuge den Weg «blockieren», desto seltener gibt es eine freie Lücke — und desto tiefer ist G. Die Werte werden direkt aus einem Diagramm der Norm (Abbildung 2) entnommen.

---

#### Schritt 4: Tatsächliche Leistungsfähigkeit L berechnen

Ströme mit Rang 3 und 4 müssen nicht nur auf einen, sondern auf **mehrere** Vorrangströme gleichzeitig warten. Die tatsächliche Leistungsfähigkeit L ist deshalb kleiner als G: Sie wird mit der Wahrscheinlichkeit multipliziert, dass alle vorrangigen Ströme in dem Moment frei sind.

---

#### Schritt 5: Auslastungsgrad und Reserve berechnen

- **Auslastungsgrad a = Verkehr / Leistungsfähigkeit**  
  Ein Wert von 1,0 bedeutet: Die Kapazitätsgrenze ist erreicht — ab hier entsteht dauerhafter Stau.
- **Belastungsreserve R = Leistungsfähigkeit − Verkehr**

---

#### Schritt 6: Wartezeit berechnen

Die mittlere Wartezeit gibt an, wie lange ein Fahrzeug im Durchschnitt warten muss. Die Formel stammt von Kimber & Hollis (1979) und bildet die Grundlage für die grafische Darstellung in Abbildung 4 der Norm.

---

#### Schritt 7: Qualitätsstufe ablesen

| QS | Wartezeit | Bedeutung |
|---|---|---|
| A | ≤ 10 s | Sehr gut — kaum Wartezeiten |
| B | ≤ 20 s | Gut |
| C | ≤ 30 s | Befriedigend |
| D | ≤ 45 s | Ausreichend — spürbare Wartezeiten |
| E | > 45 s | Mangelhaft — lange Wartezeiten |
| F | Überlastet | Dauerstau — Leistungsfähigkeit überschritten |

---

#### Sonderfall: Mischstreifen

Wenn auf der Nebenstrasse kein separater Abbiegestreifen vorhanden ist, benutzen mehrere Ströme dieselbe Spur. Die Norm berechnet für diesen «Mischstreifen» eine kombinierte Leistungsfähigkeit nach Formel F21 (harmonischer Mittelwert, gewichtet nach Auslastungsgrad). Je stärker die einzelnen Ströme ausgelastet sind, desto tiefer fällt die gemeinsame Leistungsfähigkeit aus.

---

#### Sonderfall: Geometrie

**Mehrere Fahrstreifen auf der Hauptstrasse:** Wer von der Nebenstrasse einbiegt, muss hauptsächlich eine Lücke im nächstgelegenen Fahrstreifen abwarten. Das reduziert das wirksame Konfliktvolumen.

**Dreiecksinsel für Rechtsabbieger:** Eine Dreiecksinsel trennt den Rechtsabbiegestreifen baulich ab. Rechtsabbieger tauchen dann nicht mehr als Teil des Konfliktvolumens der anderen Nebenstrassen-Ströme auf.

---

#### Technische Details

**Grundleistungsfähigkeit G_i — Abbildung 2**

Die SN 640 022 gibt G_i grafisch an (keine algebraische Formel). KnotenCheck liest die Kurven als Wertetabelle ab (Stützpunkte qpi = 0, 200, 400, …, 1800 Fz/h) und interpoliert linear.

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

Stützpunkte abgelesen Mai 2026, inkl. CH-Erhöhung +90 PWE/h gemäss SN 640 022, Abschnitt 9. Stückweise lineare Interpolation statt Exponentialfit, da ein einzelner Fit bei qpi ≥ 1400 um bis zu 40 % vom Normdiagramm abweicht.

**Wartezeit w_i — Abbildung 4 (Kimber & Hollis 1979)**

```
w = 3600/L + 900·T · [(a−1) + √((a−1)² + (3600/L · a) / (450·T))]
```

mit T = 0.25 h, a = q/L.

**Mischstreifen — Formel F21**

```
L_m = Σq_i / Σ(q_i/L_i)
```

---

### SN 640 024a

#### Worum geht es?

An einem Kreisverkehr hat der umlaufende Verkehr auf der Kreiselfahrbahn Vortritt. Einfahrende Fahrzeuge müssen warten, bis eine ausreichend grosse Lücke im Kreisel entsteht. Die SN 640 024a beschreibt ein Verfahren, mit dem die Leistungsfähigkeit und Verkehrsqualität jeder Einfahrt einzeln beurteilt werden kann.

Das Verfahren gilt für Kleinkreisel mit einstreifiger Kreiselfahrbahn und einstreifiger (1/1) oder zweistreifiger Einfahrt auf überbreiter Kreiselfahrbahn (2/1+). Nicht anwendbar auf Kreisel mit zwei- oder mehrstreifig markierter Kreiselfahrbahn oder zweistreifigen Ausfahrten mit Fussgängerstreifen.

---

#### Schritt 1: Verkehrsströme erfassen

Für jede Einfahrt i werden vier Grössen bestimmt:

- **Q_K(i)** — Verkehrsstärke auf der Kreiselfahrbahn auf Höhe der Einfahrt i [PWE/h]
- **Q_E(i)** — Einfahrtsvolumen [PWE/h]
- **Q_A(i)** — Ausfahrtsvolumen [PWE/h]
- **FG(i)** — Fussgänger*innen am Fussgängerstreifen vor Einfahrt und Ausfahrt [FG/h]

Die Umrechnung von Fahrzeugen in PWE erfolgt mit den Faktoren aus Tabelle 2 (abhängig von Fahrzeugkategorie und Längsneigung der Einfahrt).

---

#### Schritt 2: Einfahrtsleistungsfähigkeit berechnen

Die Grundleistungsfähigkeit L_E(i) hängt linear von der Kreiselfahrbahnbelastung Q_K(i) ab (Abbildung 6, Regressionsformeln):

```
1/1:   L_E = 1141 − 0.578 · Q_K    (0 ≤ Q_K ≤ 1400 PWE/h)
2/1+:  L_E = 1455 − 0.537 · Q_K    (0 ≤ Q_K ≤ 2000 PWE/h)
```

Sind querende Fussgänger*innen vorhanden, wird L_E mit dem Korrekturfaktor f_F multipliziert (Abbildung 3 für 1/1, Abbildung 4 für 2/1+). f_F ist kleiner als 1 — querende Fussgänger*innen reduzieren die Einfahrtsleistungsfähigkeit, der Effekt nimmt mit wachsendem Q_K ab.

---

#### Schritt 3: Auslastungsgrad und Reserve berechnen

- **Auslastungsgrad X = Q_E / L_E**
- **Belastungsreserve R = L_E − Q_E [PWE/h]**

Als Dimensionierungsrichtwert empfiehlt die Norm R ≥ 100 PWE/h (entspricht Qualitätsstufe D).

---

#### Schritt 4: Wartezeit und Qualitätsstufe

Die mittlere Wartezeit wird in Abhängigkeit von R und L_E bestimmt (Abbildung 7). Die Qualitätsstufen entsprechen Tabelle 3:

| QS | Wartezeit | Bedeutung |
|---|---|---|
| A | ≤ 10 s | Sehr gut — nahezu ungehindert |
| B | ≤ 20 s | Gut |
| C | ≤ 30 s | Zufriedenstellend |
| D | ≤ 45 s | Ausreichend — spürbare Wartezeiten |
| E | > 45 s | Mangelhaft |
| F | Überlastet | Zufluss grösser als Kapazität |

Massgebend für den Gesamtknoten ist der Arm mit der schlechtesten Qualitätsstufe.

---

#### Technische Details

**Einfahrtsleistungsfähigkeit L_E — Abbildung 6**

Die Norm gibt algebraische Regressionskurven an (keine Diagramm-Ablesung). KnotenCheck verwendet die Formeln direkt.

**Korrekturfaktor f_F — Abbildungen 3 und 4**

f_F ist als Kurvenschar (Parameter FG = 100, 200, 300, 400 FG/h) in Abhängigkeit von Q_K dargestellt. KnotenCheck liest die Kurven als Stützpunkttabellen ab und interpoliert bilinear in der FG- und Q_K-Dimension.

**Wartezeit w — Abbildung 7 (Kimber & Hollis)**

```
w = 3600/L + 900·T · [(a−1) + √((a−1)² + (3600/L · a) / (450·T))]
```

mit T = 1.0 h (Betrachtungshorizont 1 Stunde), a = Q_E / L_E.

*Hinweis: Bei SN 640 022 gilt T = 0.25 h (Viertelstunde). Der unterschiedliche T-Wert ist in der Norm begründet.*

---

### VSS 2011/308

#### Worum geht es?

Der Forschungsbericht VSS 2011/308 ist eine empirisch validierte Vereinfachung und Erweiterung der Methodik aus VSS 2008/301. Im Unterschied zur SN 640 022 werden **Fussgänger*innen** als Konfliktgrösse berücksichtigt. Alle Berechnungen erfolgen rein algebraisch — keine Diagramme zum Ablesen.

Der Rechner deckt zweirangige und gleichrangige Knoten ab (kein Tram, kein Bus). Komplexe Knoten mit mehr als zwei Rängen oder Rückstauwirkung von Nachbarknoten sind nicht vollständig abgedeckt (Schritt 3, LSA-Korrektur, ist nicht implementiert — konservativ).

#### Methodik (Kap. 5, VSS 2011/308)

Der Rechner folgt dem 5-Schritte-Verfahren nach Kap. 5.1:

**Schritt 1 — Szenario I oder II (Abb. 22)**

Entscheidungsdiagramm: Gibt es einen höheren *parallelen* Strom (Tram, Bus)? Bei reinen Fz/Fg-Knoten lautet die Antwort immer Nein → **Szenario I** für alle Ströme.

**Schritt 2 — β berechnen (Abb. 23, Gl. 12)**

Für jeden senkrechten, höherrangigen Strom `i`:

```
βᵢ = (1 − yᵢ)³     (abbiegende Fz oder Fg)
β  = ∏ βᵢ           (Produkt über alle senkrechten Ströme)
```

Die Berechnung erfolgt **pro Bewegungsrichtung** (A→C, B→A, etc.):

| Strom | β |
|---|---|
| HS (Rang 1) | `(1 − y_FgEinfahrt)³ × (1 − y_FgAusfahrt)³` |
| NS (Rang 2) | `(1 − y_HS)³ × (1 − y_FgEinfahrt)³ × (1 − y_FgAusfahrt)³` |
| Gleicher Rang | `y_this / (y_this + y_partner)` |

Ein HS-Fahrzeug, das von A nach C fährt, passiert den Fussgängerstreifen bei Arm A (Einfahrt) **und** den Fussgängerstreifen bei Arm C (Ausfahrt). Beide gehen in das β des Stroms A→C ein.

**Schritt 3 — LSA-Korrektur (Gl. 13)**

Nur nötig bei vorgelagertem Lichtsignal: `β_neu = β × 1 / (1 − yᵢΦ)²`. **Nicht implementiert** — der Rechner nimmt keinen LSA stromaufwärts an (konservativ).

**Schritt 4 — Effektive Kapazität (Gl. 5)**

```
L = S_Modus × β
```

Sättigungsflüsse: S_m1 = 1750 Fz/h (Rang 1), S_m2 = 1650 Fz/h (Rang 2), S_Fg = 900 Fg/h (empirisch, Tab. 8/13)

**Schritt 5 — Wartezeit und Stau (Gl. 1–3, Abschnitt 2.3)**

```
w = 900 × [(x−1) − 4C·(x/Q) + √((x−1)² + 8C·(x + 1 + 2C·(x/Q)) / (Q/x))]
```
mit `x = Q/L`, `C = 0.5` (Rang 1) oder `1.0` (Rang 2 / gleicher Rang)

```
k = w [s] × L / 3600
```

**Qualitätsstufen:** identisch zu SN 640 022 (A ≤ 10 s, B ≤ 20 s, C ≤ 30 s, D ≤ 45 s, E > 45 s, F = Überlast)

#### Ergebnis-Darstellung

- **Einfahrten:** volumengewichteter Mittelwert von β, L und w über alle Bewegungsrichtungen des Arms
- **Ströme:** Einzelwerte je Bewegungsrichtung (Q, β, L, x, w, QS)

---

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
npx vitest run   # Unit-Tests gegen Norm-Beispiele
```

## Grundlagen

- SN 640 022, VSS, Mai 1999
- SN 640 024a, VSS
- VSS-Forschungsbericht 2011/308 (Menendez / Guler / Puffe, ETH Zürich, September 2015)

Die Normdokumente sind nicht Teil dieses Repositories (Urheberrecht VSS).

## Lizenz und Haftung

[Creative Commons Attribution-NonCommercial 4.0 International (CC BY-NC 4.0)](LICENSE) — Nutzung, Veränderung und Weitergabe erlaubt, **kommerzielle Nutzung ist untersagt**. Bei Weitergabe muss der Urheber genannt werden.

Copyright (C) 2026 pnfzygrzgf-svg

Die Berechnungen dienen der Plausibilisierung. Sie ersetzen keine normenkonforme Überprüfung durch eine Fachperson. Kein amtliches Dokument. Keine Gewähr für die Richtigkeit der Ergebnisse.
