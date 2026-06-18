# KnotenCheck

Werkzeug zur Leistungsbeurteilung von Knoten innerorts. Fünf Rechner stehen zur Verfügung, je nach Knotentyp und Normgrundlage.

**Web-Rechner: https://pnfzygrzgf-svg.github.io/KnotenCheck/**

> **Beta** — Resultate mit Vorsicht verwenden und durch eine Fachperson prüfen lassen.

Vibecoding. Don't trust, verify!

## Rechner im Überblick

| Rechner | Anwendungsfall | Normgrundlage | Status |
|---|---|---|---|
| [Einmündung & Kreuzung](#einmündung-und-kreuzung-sn-640-022) | Vorfahrtgeregelte T-Knoten (3 Arme) und Kreuzungen (4 Arme) | SN 640 022 | Beta |
| [Kreisverkehr](#kreisverkehr-sn-640-024a) | Kreisel der Typen 1/1, 2/1+ und 2/2 | SN 640 024a · VSS 2005/301 | Beta |
| [Ungesteuerter Knoten mit Fussgänger*innen](#ungesteuerter-knoten-mit-fussgängerinnen-vss-2011308) | Einmündung, Kreuzung und Rechtsvortritt mit Fussgängerstreifen | VSS 2011/308 | Beta |
| [LSA-Knoten](#lsa-knoten-vss-40-023a) | Knoten mit Lichtsignalanlage, freier Fahrstreifen- und Phasenplan | VSS 40 023a u. a. | Alpha |
| [Simulation](#simulation) | Stochastische Simulation vorfahrtgeregelter Knoten: Wartezeit-Verteilungen statt Einzelwert | SN 640 022 · HBS 2015 · VSS 2011/308 | Beta |

## Lokal starten

```bash
cd KnotenCheckWeb
npm install
npm run dev      # http://localhost:5173
npx vitest run   # Unit-Tests gegen Norm-Beispiele
```

Der Web-Rechner ist eine React/TypeScript/Vite-Anwendung. Die Rechenlogik liegt getrennt von der Oberfläche in `KnotenCheckWeb/src/engine/` (reine TypeScript-Module mit Unit-Tests gegen die Norm-Beispiele).

## Datenspeicherung

Alle Berechnungen laufen vollständig im Browser. Nach dem Laden der Seite werden keine Daten gesendet — es gibt keinen Server, dem Eingaben oder Ergebnisse übermittelt werden.

- **Eingaben** existieren nur im Arbeitsspeicher des Browsers und gehen beim Schliessen des Tabs verloren.
- **Speichern / Laden** schreibt eine JSON-Datei auf den lokalen Rechner resp. liest von dort — kein Upload, kein Cloud-Speicher.
- **Tracking** ist nicht eingebaut. GitHub Pages loggt serverseitig Zugriffe (IP, User-Agent), wie es jeder Webserver tut — die App selbst sendet keine Daten.

---

# Methodik

## Einmündung und Kreuzung (SN 640 022)

### Worum geht es?

An einem Knoten ohne Lichtsignalanlage gilt eine klare Vorrangregel: Fahrzeuge auf der Hauptstrasse haben Vortritt, Fahrzeuge von der Nebenstrasse müssen warten. Die SN 640 022 *Leistungsfähigkeit, Verkehrsqualität, Belastbarkeit; Knoten ohne Lichtsignalanlage* beschreibt ein Verfahren, mit dem man beurteilen kann, ob dieser Knoten für den vorhandenen Verkehr ausreichend leistungsfähig ist — oder ob es zu langen Wartezeiten und Stau kommt.

Das Verfahren gilt für Einmündungen (drei Arme) und Kreuzungen (vier Arme).

**Funktionen des Rechners:**
- Umrechnung in PWE/h (Ziffer 8): Neigung + Fahrzeugkategorien, Fall 1 (Tab. 1) / Fall 2 (Tab. 2)
- Dreiecksinsel, separater Rechts- und Linksabbiegestreifen
- Mischstreifen-Kombination für Nebenstrasse
- Qualitätsstufen A–F
- Berechnungsblatt (Druckansicht)

**Was die Norm nicht berücksichtigt:** Die SN 640 022 berechnet ausschliesslich die Leistungsfähigkeit für **motorisierten Individualverkehr (MIV)**. Fussgänger*innen kommen im Berechnungsverfahren nicht vor. Wer die Qualität eines Knotens für den Fussverkehr beurteilen will, braucht andere Methoden — z. B. den Rechner [Ungesteuerter Knoten mit Fussgänger*innen](#ungesteuerter-knoten-mit-fussgängerinnen-vss-2011308).

Der Rechner folgt dem **generellen Vorgehen nach Ziffer 5** der SN 640 022 (sechs Schritte):

### Schritt 1: Regime und Rangfolge festlegen

Zuerst wird das **Regime** des Knotens festgelegt. Dieser Rechner behandelt den **vorfahrtgeregelten** Knoten — Fahrzeuge auf der Hauptstrasse haben Vortritt, Fahrzeuge von der Nebenstrasse warten. (Gleichrangige Knoten mit Rechtsvortritt sind nicht Teil dieses Verfahrens.)

Jede Fahrzeugbewegung — Linksabbiegen, Geradeausfahren, Rechtsabbiegen — wird als eigener «Verkehrsstrom» betrachtet und einem **Rang** zugeordnet, je nachdem, wem gegenüber sie Vortritt gewähren muss. Bei der Kreuzung (4 Arme) gibt es vier Ränge, bei der Einmündung (3 Arme) nur drei:

- **Rang 1** — Hauptstrasse: freie Fahrt, kein Warten
- **Rang 2** — Linksabbieger von der Hauptstrasse, Rechtseinbieger aus der Nebenstrasse: muss einem Konfliktvolumen ausweichen
- **Rang 3** — Nebenstrasse, Querung: muss warten, bis mehrere Ströme frei sind
- **Rang 4** — Nebenstrasse, Linkseinbiegen *(nur Kreuzung)*: muss warten, bis praktisch alle anderen frei sind

Je höher der Rang, desto mehr Fahrzeuge müssen «durchgelassen» werden, bevor man selbst fahren darf — und desto kleiner ist die nutzbare Kapazität.

### Schritt 2: Massgebende Belastungen pro Strom ermitteln

Für jeden Strom wird die **massgebende Belastung** bestimmt: Wer kommt woher und fährt wohin, und wie viele Fahrzeuge pro Stunde?

Weil ein Lastwagen mehr Platz und Zeit beansprucht als ein Personenwagen, wird die **eigene Belastung jedes Stroms** in **Personenwagen-Einheiten pro Stunde (PWE/h)** umgerechnet (Ziffer 8). Dabei spielt auch die Strassenneigung eine Rolle — ein Lastwagen an einem Hang entspricht mehr PWE/h als in der Ebene. Diese PWE-Belastung Q ist später die eigene Nachfrage in Auslastungsgrad und Reserve (Schritt 6).

### Schritt 3: Massgebende Hauptstrombelastungen qpi ermitteln

Für jeden Strom ab Rang 2 wird das **massgebende Hauptstromvolumen qpi** berechnet — die Summe aller vortrittsberechtigten Ströme, denen er ausweichen muss (Formeln F1–F8 je nach Fahrbeziehung). qpi ist die x-Achse von Abbildung 2.

qpi wird in echten **Fahrzeugen pro Stunde (Fz/h)** gezählt — nicht in PWE/h: Jedes Fahrzeug erzeugt im Hauptstrom genau eine Lücke, unabhängig von seiner Grösse. (PWE/h gilt überall sonst — eigene Belastung, G, L, Reserve —, nur qpi bleibt in Fz/h.)

Die Geometrie verändert qpi:
- **Mehrere Fahrstreifen / separater Abbiegestreifen auf der Hauptstrasse:** Wer von der Nebenstrasse einbiegt, muss hauptsächlich eine Lücke im nächstgelegenen Fahrstreifen abwarten — das reduziert das wirksame Konfliktvolumen.
- **Dreiecksinsel für Rechtsabbieger:** Eine Dreiecksinsel trennt den Rechtsabbiegestreifen baulich ab; Rechtsabbieger zählen dann nicht mehr zum Konfliktvolumen der anderen Nebenstrassen-Ströme.

### Schritt 4: Grundleistungsfähigkeit Gi ermitteln

Aus qpi wird für jeden Strom ab Rang 2 die **Grundleistungsfähigkeit G** bestimmt (in **PWE/h**). Sie gibt an, wie viele PWE pro Stunde maximal einbiegen oder kreuzen könnten, wenn der betrachtete Strom die einzige Einschränkung wäre.

Je dichter der Hauptstrom (je grösser qpi), desto seltener gibt es eine freie Lücke — und desto tiefer ist G. Die Werte werden direkt aus einem Diagramm der Norm (Abbildung 2) entnommen (vier Kurven je Manöver; siehe Technische Details).

### Schritt 5: Maximale Leistungsfähigkeit Li bzw. Lm und Wahrscheinlichkeit p₀,ᵢ

- **Rang 2:** L = G (kein vorgelagerter Konflikt).
- **Rang 3 und 4:** Diese Ströme können nur abfliessen, wenn die höherrangigen Ströme keinen Rückstau haben. L ist deshalb kleiner als G: G wird mit der **Wahrscheinlichkeit des staufreien Zustandes p₀,ᵢ** der übergeordneten Ströme multipliziert (bei Rang 4 zusätzlich um die statistische Abhängigkeit korrigiert, Abbildung 3).
- **Mischstreifen Lm:** Benutzen mehrere Nebenstrom-Ströme dieselbe Spur (kein separater Abbiegestreifen), berechnet die Norm eine kombinierte Leistungsfähigkeit Lm nach Formel F21 (nachfragegewichteter harmonischer Mittelwert). Je stärker die einzelnen Ströme ausgelastet sind, desto tiefer fällt Lm aus.

### Schritt 6: Belastungsreserve Ri und mittlere Wartezeit wi

- **Auslastungsgrad a = Q / L** *(beide in PWE/h, dimensionslos)* — ein Wert von 1,0 bedeutet: Die Kapazitätsgrenze ist erreicht, ab hier entsteht dauerhafter Stau.
- **Belastungsreserve R = L − Q** *(in PWE/h)* — negativ = Überlast.
- **Mittlere Wartezeit w:** Die Norm stellt sie nur grafisch dar (Abbildung 4, «nach Kimber, Hollis, 1979»). KnotenCheck berechnet sie mit der zeitabhängigen Wartezeitformel nach Brilon (2008), die die Kurven der Abbildung 4 reproduziert (siehe Technische Details). Aus w folgt die **Qualitätsstufe** nach Tabelle 3:

| QS | Wartezeit | Beurteilung |
|---|---|---|
| A | < 10 s | Sehr gut — die Mehrzahl der Fahrzeuge muss nicht warten |
| B | 10–15 s | Sehr gut — Wartezeiten tolerierbar |
| C | 15–25 s | Gut — spürbarer Anstieg der Wartezeit, Stau ohne nennenswerte Beeinträchtigung |
| D | 25–45 s | Ausreichend — Auslastung nahe der zulässigen Belastung |
| E | > 45 s | Kritisch — instabiler Verkehrszustand, stark streuende Wartezeiten |
| F | — | Überlastung — Zufluss grösser als Leistungsfähigkeit, wachsende Kolonnen |

### Technische Details

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

**Wartezeit w_i — Abbildung 4**

Die Norm gibt die Wartezeit nur als Kurvenschar an (Abbildung 4, «nach Kimber, Hollis, 1979» — Kurven L = 200–1800 PWE/h in 200er-Schritten), ohne Formel und ohne Zeithorizont. KnotenCheck verwendet die zeitabhängige Wartezeitformel inkl. Bedienzeit — das ist die **Wartezeitformel des HBS 2015** (Akçelik/Troutbeck 1991; vgl. Brilon-Vortrag 2016: «d = 1/C + T/4·[(x−1) + √((x−1)² + 8x/(C·T))]»), deren Stau-Term Brilon (2008), TRR 2071, als Gl. 9 (Fall D2+A2) herleitet:

```
w = 3600/L + 900·T · [(a−1) + √((a−1)² + (3600/L · a) / (450·T))]
```

mit T = 1.0 h (Spitzenstunde — die Norm bemisst auf die Spitzenstunde, vgl. Berechnungsbeispiele), a = q/L. T = 1.0 reproduziert die Abb.-4-Kurven: verifiziert an 14 abgelesenen Stützpunkten (Juni 2026, max. Abweichung ≈ 3 s am steilsten Kurvenast, sonst ≤ 2 s) sowie an den Achsenabschnitten bei R = 0 (L = 1400 → ≈ 71 s, L = 1800 → ≈ 62 s) — abgesichert im Unit-Test «Abb. 4 — Wartezeitkurven». Eine freie Kleinste-Quadrate-Schätzung von T über die 14 Stützpunkte ergibt T ≈ 1.04 h (RMSE 1.1 s); T = 0.25 würde die sättigungsnahen Punkte um 6–16 s verfehlen (RMSE 6.4 s).

**Mischstreifen — Formel F21**

```
L_m = Σq_i / Σ(q_i/L_i)
```

---

## Kreisverkehr (SN 640 024a)

### Worum geht es?

An einem Kreisverkehr hat der umlaufende Verkehr auf der Kreiselfahrbahn Vortritt. Einfahrende Fahrzeuge müssen warten, bis eine ausreichend grosse Lücke im Kreisel entsteht. Die SN 640 024a *Leistungsfähigkeit, Verkehrsqualität, Belastbarkeit; Knoten mit Kreisverkehr* (seit der Ausgabe 2019-03 unter der Nummer **VSS 40 024a**) beschreibt ein Verfahren, mit dem die Leistungsfähigkeit und Verkehrsqualität jeder Einfahrt einzeln beurteilt werden kann.

Das Verfahren nach SN 640 024a gilt für Kleinkreisel mit einstreifiger Kreiselfahrbahn und einstreifiger (1/1) oder zweistreifiger Einfahrt auf überbreiter Kreiselfahrbahn (2/1+). Für zweistreifige Kreisel mit zweistreifiger Einfahrt **und** zweistreifiger Kreisfahrbahn (Typ 2/2) wird zusätzlich der VSS-Forschungsbericht 2005/301 *Leistungsfähigkeit zweistreifiger Kreisel* verwendet, der eine empirisch hergeleitete Exponentialformel für die Einfahrtsleistungsfähigkeit liefert.

**Funktionen des Rechners:**
- Kreiseltypen 1/1, 2/1+ und 2/2
- Abbiegeströme je Zufahrt als Eingabe
- PWE-Umrechnung (Tab. 2): Verkehrsmischung pauschal (Motorfahrzeuge) oder detailliert (Fahrzeugkategorien) + Längsneigung
- Kapazität, Auslastungsgrad, Wartezeit und Qualitätsstufe je Zufahrt

### Schritt 1: Verkehrsströme erfassen

Für jede Einfahrt i werden vier Grössen bestimmt:

- **Q_K(i)** — Verkehrsstärke auf der Kreiselfahrbahn auf Höhe der Einfahrt i [PWE/h]
- **Q_E(i)** — Einfahrtsvolumen [PWE/h]
- **Q_A(i)** — Ausfahrtsvolumen [PWE/h]
- **FG(i)** — Fussgänger*innen am Fussgängerstreifen vor Einfahrt und Ausfahrt [FG/h]

Die Umrechnung von Fahrzeugen in PWE erfolgt mit Tabelle 2, wahlweise **pauschal** oder **detailliert** (je Einfahrt einstellbar):
- **Pauschal:** Spalte «Motorfahrzeuge» (1,7 / 1,4 / 1,1 / 1,0 / 0,9 je nach Längsneigung der Einfahrt von +4 % bis −4 %).
- **Detailliert:** gewichtetes Mittel der kategorienweisen Faktoren (Fahrrad/Mofa, Motorrad, PW, LW, LZ) bei der gewählten Neigung; PW = Restanteil. Fahrrad/Mofa nur bei ±0 % definiert.

Die Kreiselfahrbahn Q_K verwendet immer die Werte bei Längsneigung ±0 % (Norm S. 9) — pauschal 1,1, detailliert die jeweilige Mischung bei ±0 %.

### Schritt 2: Ausfahrten-Check (Q_A ≤ L_A)

Bevor die Einfahrten beurteilt werden, prüft die Norm (Ziffer 10), ob der Verkehr den Kreisel überhaupt **verlassen** kann: An jeder Ausfahrt muss das Ausfahrtsvolumen Q_A(i) unter der Ausfahrtsleistungsfähigkeit L_A(i) liegen.

- **Q_A(i)** — Summe aller Bewegungen, die an Arm i den Kreisel verlassen (aus den Abbiegeströmen, mit f der Herkunftsarme gewichtet) [PWE/h]
- **L_A(i)** — Ausfahrtsleistungsfähigkeit: maximal 1400 PWE/h ohne Fussgänger*innen, reduziert durch querenden Fussgängerverkehr je nach Ausfahrtsbreite B (3,5 m / 4,5 m), Abbildung 5, Seite 11.

Ist **Q_A > L_A** an einer Ausfahrt, blockiert stockender Abfluss die Kreiselfahrbahn — gemäss Norm sind dann andere Knotenformen zu prüfen. KnotenCheck weist diesen Fall aus.

### Schritt 3: Einfahrtsleistungsfähigkeit berechnen

Die Grundleistungsfähigkeit L_E(i) hängt linear von der Kreiselfahrbahnbelastung Q_K(i) ab (Abbildung 6, Seite 12):

```
1/1:   L_E = 1141 − 0.578 · Q_K         (SN 640 024a, linear, gültig 0 ≤ Q_K ≤ 1400)
2/1+:  L_E = 1455 − 0.537 · Q_K         (SN 640 024a, linear, gültig 0 ≤ Q_K ≤ 2000)
2/2:   L_E = 1639.9 · e^(−0.0006 · Q_K) (VSS 2005/301, Abb. 4.25, exponentiell)
```

Vorbehalte aus VSS 2005/301 zur 2/2-Kurve: Bei Q_K > 1800 PWE/h beruht sie auf wenigen Messdaten; vorausgesetzt ist eine annähernd gleichmässige Fahrstreifenbelastung in der Einfahrt (50 % ± 10 %) — bei ungleicher Belastung liegt die Leistungsfähigkeit um ca. 100–150 PWE/h tiefer.

Sind querende Fussgänger*innen vorhanden, wird L_E mit dem Korrekturfaktor f_F multipliziert (Abbildung 3, Seite 10 für 1/1, Abbildung 4, Seite 10 für 2/1+). f_F ist kleiner als 1 — querende Fussgänger*innen reduzieren die Einfahrtsleistungsfähigkeit, der Effekt nimmt mit wachsendem Q_K ab. Für Typ 2/2 liefert VSS 2005/301 keinen f_F (zu wenig Fussgänger*innen an den Untersuchungsstandorten); KnotenCheck verwendet die Abb.-4-Kurven (2/1+) analog.

### Schritt 4: Auslastungsgrad und Reserve berechnen

- **Auslastungsgrad X = Q_E / L_E**
- **Belastungsreserve R = L_E − Q_E [PWE/h]**

Als Dimensionierungsrichtwert empfiehlt die Norm R ≥ 100 PWE/h (entspricht Qualitätsstufe D).

### Schritt 5: Wartezeit und Qualitätsstufe

Die mittlere Wartezeit wird in Abhängigkeit von R und L_E bestimmt (Abbildung 7, Seite 15). Die Qualitätsstufen entsprechen Tabelle 3, Seite 14:

| QS | Wartezeit | Bedeutung |
|---|---|---|
| A | ≤ 10 s | Sehr gut — nahezu ungehindert |
| B | ≤ 20 s | Gut |
| C | ≤ 30 s | Zufriedenstellend |
| D | ≤ 45 s | Ausreichend — spürbare Wartezeiten |
| E | > 45 s | Mangelhaft |
| F | Überlastet | Zufluss grösser als Kapazität |

Massgebend für den Gesamtknoten ist der Arm mit der schlechtesten Qualitätsstufe.

### Technische Details

Wie beim Rechner [Einmündung & Kreuzung](#einmündung-und-kreuzung-sn-640-022): Wo die Norm eine Gleichung angibt, wird sie direkt verwendet; wo nur Diagramme vorliegen, werden Stützpunkte abgelesen und interpoliert.

| Abbildung | Inhalt | Im Rechner |
|---|---|---|
| **Abb. 6** | L_E Einfahrtsleistungsfähigkeit | **Formel** (Regressionskurven der Norm) |
| **Abb. 3** | f_F, einstreifige Einfahrt | **abgelesen** (Stützpunkte, bilinear interpoliert) |
| **Abb. 4** | f_F, zweistreifige Einfahrt | **abgelesen** (Stützpunkte, bilinear interpoliert) |
| **Abb. 5** | L_A Ausfahrtsleistungsfähigkeit | **abgelesen** (Stützpunkte, linear interpoliert) |
| **Abb. 7** | w mittlere Wartezeit | **Formel** (zeitabhängig, wie SN 640 022) |

**Einfahrtsleistungsfähigkeit L_E — Abbildung 6 (Formeln):** Die Norm gibt algebraische Regressionskurven an, KnotenCheck verwendet sie direkt:

```
1/1:   L_E = 1141 − 0,578·Q_K         (SN 640 024a, gültig 0 ≤ Q_K ≤ 1400)
2/1+:  L_E = 1455 − 0,537·Q_K         (SN 640 024a, gültig 0 ≤ Q_K ≤ 2000)
2/2:   L_E = 1639,9·e^(−0,0006·Q_K)   (VSS 2005/301, Abb. 4.25)
```

**Korrekturfaktor f_F — Abbildungen 3 und 4 (abgelesen):** f_F ist als Kurvenschar (Parameter FG = 100, 200, 300, 400 FG/h) über Q_K dargestellt. KnotenCheck liest die Kurven als Stützpunkttabellen ab und interpoliert bilinear (in FG und in Q_K); FG = 0 ergibt f_F = 1,0. f_F ist am kleinsten bei Q_K = 0 und steigt mit Q_K gegen 1,0. Startwerte (Q_K = 0):

| FG [FG/h] | Abb. 3 (1-streifig) | Abb. 4 (2-streifig) |
|---:|---:|---:|
| 100 | 0,99 | 0,89 |
| 200 | 0,93 | 0,86 |
| 300 | 0,87 | 0,83 |
| 400 | 0,81 | 0,80 |

Für Typ 2/2 liefert VSS 2005/301 kein f_F (zu wenig Fussgänger*innen an den Messstandorten) — KnotenCheck verwendet die Abb.-4-Kurven (2/1+) analog.

**Ausfahrtsleistungsfähigkeit L_A — Abbildung 5 (abgelesen):** L_A hängt von der querenden Fussgängerzahl FG und der Ausfahrtsbreite B ab (maximal 1400 PWE/h ohne Fussgänger*innen). Stückweise lineare Interpolation der abgelesenen Stützpunkte:

| FG [FG/h] | B = 3,5 m | B = 4,5 m |
|---:|---:|---:|
| 0 | 1400 | 1400 |
| 50 | 1355 | 1340 |
| 100 | 1310 | 1280 |
| 150 | 1270 | 1240 |
| 200 | 1230 | 1190 |
| 250 | 1195 | 1140 |
| 300 | 1160 | 1100 |
| 350 | 1130 | 1055 |
| 400 | 1095 | 1020 |

Die 3,5-m-Stützpunkte decken sich mit Tabelle 5 des Anwendungsbeispiels (FG 100 → 1310, 300 → 1160, 0 → 1400); bei FG 250 ergibt die Kurvenablesung 1195 gegenüber gedruckt 1190 — innerhalb der Ablesetoleranz.

**Wartezeit w — Abbildung 7 (Formel):**

Auch hier gibt die Norm nur Kurven an (Abbildung 7). KnotenCheck verwendet dieselbe zeitabhängige Wartezeitformel wie beim Rechner [Einmündung & Kreuzung](#einmündung-und-kreuzung-sn-640-022) (Brilon 2008, TRR 2071, Gl. 9, Fall D2+A2, plus Bedienzeit):

```
w = 3600/L + 900·T · [(a−1) + √((a−1)² + (3600/L · a) / (450·T))]
```

mit T = 1.0 h (Spitzenstunde), a = Q_E / L_E — derselbe T-Wert, der bei SN 640 022 durch Kurvenablesung der Abb. 4 verifiziert wurde.

---

## Ungesteuerter Knoten mit Fussgänger*innen (VSS 2011/308)

### Worum geht es?

Der Forschungsbericht *Verkehrsablauf an ungesteuerten Knoten innerorts unter Berücksichtigung der verschiedenen Verkehrsarten; Ermittlung repräsentativer Richtwerte und Zusammenhänge* (VSS 2011/308) ist eine empirisch validierte Vereinfachung und Erweiterung der Methodik aus dem Bericht *Verkehrsqualität und Leistungsfähigkeit von komplexen ungesteuerten Knoten: Analytisches Schätzverfahren* (VSS 2008/301). Im Unterschied zur SN 640 022 werden **Fussgänger*innen** als Konfliktgrösse berücksichtigt. Alle Berechnungen erfolgen rein algebraisch — keine Diagramme zum Ablesen.

Der Rechner deckt zweirangige und gleichrangige Knoten ab (Tram und Bus Eigentrasse sind nicht implementiert). Komplexe Knoten mit mehr als zwei Rängen oder Rückstauwirkung von Nachbarknoten sind nicht vollständig abgedeckt.

**Funktionen des Rechners:**
- Einmündung (T-Knoten) und Kreuzung (4 Arme)
- Fussgängervolumen am Fussgängerstreifen je Arm, inkl. Gruppengrösse ρ und Mittelinsel
- Pro-Strom-Kapazität nach Kap. 5 (Ein- und Ausfahrts-Fg je Bewegungsrichtung)
- Qualitätsstufen A–F je Strom, je Arm (Mittelwert) sowie Gesamt-QS

### Methodik (Kap. 5, VSS 2011/308)

Der Rechner folgt dem 5-Schritte-Verfahren nach Kap. 5.1:

**Schritt 1 — Szenario I oder II (Abb. 22/35)**

Das Entscheidungsdiagramm des Berichts (Kap. 5.1.1 bzw. Kap. 8, Schritt 3.1) unterscheidet zwei Fälle: Existiert ein höherrangiger *paralleler* Strom, der die senkrechten Konfliktströme blockiert, verschafft er dem betrachteten Strom Zeitfenster — dann gilt **Szenario II** (Gl. 6). Im Anwendungsbeispiel des Berichts (Kap. 5.2) ist dieser parallele Strom ein **Fussgängerstrom**: `L_Fz1 = S·y_Fg2 + S·(1−y_Fg2)·β`.

KnotenCheck implementiert beide Szenarien:

- **Szenario I** (Gl. 5: `L = S·β`) für **HS-Ströme** (ihre senkrechten Vortrittsströme sind Fussgänger*innen, die von keinem parallelen Modus blockiert werden — analog Berichtsbeispiel `L_Fz2 = S·β`) und für NS-Ströme ohne parallele Fg-Ströme.
- **Szenario II** (Gl. 6: `L = S·y_par + S·(1−y_par)·β`) für **NS-Ströme**, wenn Fussgängerstreifen auf HS-Armen existieren, die der Strom **nicht selbst überfährt**: Solange dort gequert wird (Zeitanteil `y_par = Σ Q_Fg/S_Fg`, auf 1 begrenzt), ist der senkrechte HS-Konfliktverkehr blockiert — der NS-Strom kann einbiegen. Voraussetzung ist vorhandener HS-Verkehr (sonst gibt es nichts zu blockieren). Solche Ströme sind im Ergebnis mit «Sz II» markiert.

Der [Simulationsrechner](#simulation) bildet denselben Effekt mikroskopisch nach («positiver Kapazitätseffekt»: Fussgänger-Sperrzeiten im Hauptstrom erzwingen Lücken).

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

**Schritt 4 — Effektive Kapazität (Gl. 5 / Gl. 6)**

```
Szenario I:   L = S_Modus × β
Szenario II:  L = S_Modus × y_par + S_Modus × (1 − y_par) × β
```

Sättigungsflüsse (Tab. 8 / Tab. 13, VSS 2011/308): S_m1 = 1750 Fz/h (Rang 1), S_m2 = 1650 Fz/h (Rang 2), S_Fg = 900·ρ Fg/h

**Fussgänger-Sättigungsfluss S_Fg und Gruppengrösse ρ (Tab. 9, Gl. 4)**

Fussgänger*innen, die gemeinsam queren, blockieren ein Fahrzeug gleich lang wie eine Einzelperson — zählen aber als ein einziges Ereignis. Daher steigt der Sättigungsfluss proportional zur mittleren Gruppengrösse ρ (Anzahl gemeinsam querender Fg im Schnitt):

```
S_Fg = 900 · ρ [Fg/h]
```

| ρ | S_Fg | Typische Situation |
|---|---|---|
| 1 | 900 Fg/h | Einzelne Fg, Wohngebiet |
| 2 | 1800 Fg/h | Paarweise, mässig belebte Strasse |
| 3 | 2700 Fg/h | Gruppen à 3, Innenstadt |
| 4 | 3600 Fg/h | Grosse Gruppen, sehr belebte Lage |
| 5 | 4500 Fg/h | Sehr grosse Gruppen, Spitzenlage |

ρ wird vor Ort bestimmt (Beobachtung). Bei Unsicherheit: ρ = 1 (konservativ, kleinste Kapazität). Der Wert beeinflusst y_Fg = Q_Fg / S_Fg und damit β = (1 − y_Fg)³ für alle Fahrzeugströme, die den Fussgängerstreifen passieren (Ein- und Ausfahrt).

**Mittelinsel:** Ist der Fussgängerstreifen durch eine Verkehrsinsel geteilt, gilt rechtlich jede Hälfte als selbständiger Streifen (Art. 47 Abs. 3 VRV) — ein Fahrzeug muss nur den Fussgänger*innen auf seiner Fahrbahnhälfte Vortritt gewähren. KnotenCheck halbiert dann das wirksame Fussgängervolumen (Q_Fg × 0.5). Das ist eine eigene Modellannahme; VSS 2011/308 behandelt Mittelinseln nicht.

**Schritt 5 — Wartezeit und Stau (Gl. 1, S. 62)**

```
w = 900 × [(x−1) − 4C·(x/Q) + √((x−1)² + 8C·(x + 1 + 2C·(x/Q)) / (Q/x))]
```
mit `x = Q/L`, `C = 0.5` (Rang 1) oder `1.0` (Rang 2 / gleicher Rang)

```
k = w [s] × L / 3600
```

**Qualitätsstufen:** gleiche Schwellen wie SN 640 024a (A ≤ 10 s, B ≤ 20 s, C ≤ 30 s, D ≤ 45 s, E > 45 s, F = Überlast)

### Ergebnis-Darstellung

- **Einfahrten:** volumengewichteter Mittelwert von β, L und w über alle Bewegungsrichtungen des Arms
- **Ströme:** Einzelwerte je Bewegungsrichtung (Q, β, L, x, w, QS)

---

## LSA-Knoten (VSS 40 023a)

### Worum geht es?

An einem Knoten mit Lichtsignalanlage (LSA) regelt die Signalisierung, wer wann fahren darf. Die VSS 40 023a *Leistungsfähigkeit, Verkehrsqualität, Belastbarkeit; Knoten mit Lichtsignalanlagen* beschreibt ein Verfahren, mit dem man beurteilen kann, ob die Signalsteuerung ausreichend Kapazität bietet oder ob es zu langen Wartezeiten kommt.

**Funktionen des Rechners:**
- 3-armiger (T-Knoten) und 4-armiger Knoten
- Fahrzeugkategorien und zulässige Geschwindigkeit
- Freier Fahrstreifenplan: Ströme je Arm auf bis zu zwei Fahrstreifen aufteilbar
- Freier Phasenplan: Fahrstreifen beliebig auf 2–5 Phasen verteilen
- Fussgängerstreifen je Phase: Querungslänge als Eingabe
- Ziel-VQS und Umlaufzeit Z als Eingabe
- Wartezeit und VQS je Fahrstreifen (A–F) sowie je Knotenstrom (Auslastung, L-95-Rückstau, Wartezeit); Gesamt-VQS
- Geometrische Konfliktprüfung: Warnungen bei unverträglichen Strömen in einer Phase

**Was der Rechner nicht berücksichtigt:**

- **ÖV-Privilegierung**: Beeinflussung der LSA durch Tram oder Bus
- **Koordination** mehrerer Knoten (grüne Welle): Der Rechner geht von einer isolierten LSA aus (C = 0,5)
- **Signalplanprüfung**: Mindestsperrzeit (VSS 40 837 Ziff. 19: ≥ 2 s), Mindestfreigabezeit, Zwischenzeitberechnung aus Räumweg und Einfahrweg (SN 640 838) — diese Parameter gehören zur *signaltechnischen* Ausarbeitung eines konkreten Signalprogramms, nicht zur Leistungsfähigkeitsabschätzung (siehe unten)
- **Reduktionsfaktoren** für Fahrstreifenbreite, Längsneigung, Haltestellen, Parkierung (VSS 40 835) — für Normalverhältnisse ist S = 1800 PWE/h die normativ vorgesehene Vereinfachung (VSS 40 023a Ziff. 11.3)

### Schritt 1: Verkehrsströme erfassen und gewichten

Für jeden Arm werden die Abbiegeströme (links, geradeaus, rechts) in Fahrzeugen pro Stunde erfasst. Weil ein Lastwagen mehr Fahrbahnzeit beansprucht als ein Personenwagen, werden alle Fahrzeuge in **Personenwagen-Einheiten pro Stunde (PWE/h)** umgerechnet (Ziff. 10.2):

| Fahrzeugkategorie | Faktor |
|---|---|
| Personenwagen (PW) | 1,0 |
| Lastwagen (LW) | 2,0 |
| Motorrad (MR) | 0,5 |
| Fahrrad (FR) | 0,25 |

### Schritt 2: Fahrstreifenplan festlegen

Jeder Arm erhält einen oder zwei Fahrstreifen (FS1, FS2). Jeder Strom wird einem Fahrstreifen zugewiesen. Die **kritische Verkehrsstärke Q_krit eines Fahrstreifens** ist die grösste Verkehrsstärke der zugeordneten Ströme:

```
Q_krit(FS) = max(Q_i) aller Ströme auf diesem FS
```

Fahrstreifen mit mehreren Strömen (z. B. Geradeaus + Rechtsabbiegen) haben eine tiefere Q_krit als ein Fahrstreifen mit einem dominanten Strom.

### Schritt 3: Phasenplan festlegen

Die Fahrstreifen werden Phasen zugeordnet. Jede Phase gibt an, welche Fahrstreifen gleichzeitig «grün» haben.

Die **kritische Verkehrsstärke pro Phase** ergibt sich aus den exklusiven Fahrstreifen (Fahrstreifen, die nur in dieser Phase vorkommen):

```
Q_krit(Phase) = max(Q_krit(FS)) über alle exklusiven FS der Phase
```

Falls alle Fahrstreifen einer Phase auch in anderen Phasen vorkommen (reine Überlappungsphase), werden alle Fahrstreifen der Phase als Kandidaten verwendet.

**Überlappungsphasen:** Ein Fahrstreifen kann in mehreren Phasen grün sein (z. B. Rechtsabbieger überlappt mit Phase 1 und Phase 2). Solche Fahrstreifen erhalten einen effektiven Grünzeitanteil λ_effektiv = Σ λ aller Phasen, in denen sie grün sind.

### Schritt 4: Umlaufzeit Z und Zwischenzeit T_Z bestimmen

Die **Zwischenzeit T_Z** (Verlustzeit zwischen zwei Grünphasen) setzt die VSS 40 023a pauschal mit **5 s pro Phase** an (Ziff. 11.2, Grundlage der Tab. 2). Die Norm lässt abweichend ermittelte Zwischenzeiten ausdrücklich zu («In diesem Fall sind ΣtGr und Σλkrit entsprechend anzupassen»). KnotenCheck bietet dafür eine geschwindigkeitsabhängige Staffelung an — eine **eigene Annahme**, angelehnt an die Gelbzeiten der VSS 40 837 (Tab. 1: 2/3/4/5 s bei ≤30 / 40–50 / 60 / ≥70 km/h) zuzüglich rund einer Sekunde:

| v_zul | T_Z (KnotenCheck) |
|---|---|
| ≤ 30 km/h | 3 s |
| 40–50 km/h | 4 s |
| ≥ 60 km/h | 5 s (= Norm-Pauschale) |

Als knoteneinheitliches T_Z wird das Maximum über alle Arme verwendet (konservativste Annahme). T_Z bestimmt die verfügbare Gesamtgrünzeit:

> **Hinweis:** T_Z ist ein *Verlustzeitparameter* für die Leistungsfähigkeitsberechnung — kein physischer Signalanzeigewert. Die tatsächliche Signalübergangszeit (Gelb + Sperrzeit ≥ 2 s + Rot/Gelb) ist deutlich länger (typisch 5–8 s je nach Geschwindigkeit). T_Z bündelt Anlauf- und Räumverlust zu einem Netto-Schätzwert. Die Mindestsperrzeit nach VSS 40 837 Ziff. 19 (≥ 2 s) gilt für die signaltechnische Ausarbeitung (SN 640 838) und ist im Kapazitätsrechner nicht relevant.

```
tGrSum = Z - n · T_Z
```

Die Summe der kritischen Verkehrsstärken aller Phasen bestimmt die Umlaufzeit:

```
ΣQ_krit = Q_krit(Phase 1) + Q_krit(Phase 2) + …
```

Aus **Tabelle 2** der Norm wird die kleinste Umlaufzeit Z gewählt, für die qKritMax > ΣQ_krit gilt. qKritMax wird dabei nicht direkt aus der Tabelle abgelesen, sondern dynamisch aus T_Z berechnet:

```
qKritMax(Z, n, T_Z) = ((Z - n · T_Z) / Z) · 1800 PWE/h
```

Bei Z = 120 s, 2 Phasen und T_Z = 5 s ergibt sich qKritMax = (110/120) · 1800 = 1650 PWE/h (entspricht Tab. 2 der Norm). Mit T_Z = 3 s wären es (114/120) · 1800 = 1710 PWE/h — die Anlage kann mehr Verkehr aufnehmen.

### Schritt 5: Grünzeiten verteilen

Die Gesamtgrünzeit (tGrSum = Z - n·T_Z) wird proportional zu den Q_krit-Werten der Phasen aufgeteilt:

```
t_Gr(Phase i) = tGrSum · Q_krit(Phase i) / ΣQ_krit
```

**Mindestgrünzeit:**

| Fall | t_Gr_min | Quelle |
|---|---|---|
| Ohne Fussgängerstreifen | 4 s | VSS 40 837 |
| Mit Fussgängerstreifen (Querungslänge L) | max(5 s, (2/3·L) / 1,2 m·s⁻¹) | VSS 40 837 + HB LSA Stadt Bern V 2.1, Anhang G |

Der Mindestwert von 5 s für Phasen mit Fussgängerstreifen ist dem Berechnungstool des Handbuchs Lichtsignalanlagen (HB LSA), Tiefbauamt Stadt Bern, V 2.1, Anhang G entnommen.

Liegt Q_krit einer Phase unter Q_krit_min = (t_Gr_min / Z) · 1800, wird eine Warnung ausgegeben: Der Fussgängerstreifen erzwingt eine längere Grünzeit als dem Kfz-Volumen entspricht.

### Schritt 6: Auslastungsgrad und Wartezeit

Für jeden Fahrstreifen wird der Auslastungsgrad X und die mittlere Wartezeit w_m berechnet (Ziff. 12):

```
X    = Q / L        mit L = λ · S
                    Kfz: S = 1800 PWE/h (Ziff. 11.3)
                    FGS: S = 8000 Fg/h  (VSS 40 834, Ziff. 5)
w₁   = Z · (1−λ)² / (2 · (1−λ·X))
w₀   = 900 · [(X−1) − 2C·(X/Q) + √((X−1)² + 4C·(X+1+C·X/Q) / (Q/X))]   C = 0,5
w_m  = w₁ + w₀
```

Formel nach Kimber & Hollis (1979), *Traffic Queues and Delays at Road Junctions*, TRRL Report LR 909.

Für Kfz-Fahrstreifen wird zusätzlich der 95%-Rückstau berechnet (VSS 40 023a, Ziff. 11.5):

```
ST_RE95        = 1.691 · √(PWE_mr + PWE_GE) + (PWE_mr + PWE_GE)
Rückstau [m]   = ST_RE95 × 6 m/PWE
```

mit PWE_mr = Q · (Z − t_Gr) / 3600 (Ankünfte während Rotphase) und PWE_GE = w₀ · Q/3600 · X (bestehender Rückstau).

### Schritt 7: Verkehrsqualitätsstufe ablesen

| VQS | Wartezeit | Bedeutung |
|---|---|---|
| A | ≤ 20 s | Sehr gut |
| B | ≤ 35 s | Gut |
| C | ≤ 50 s | Befriedigend |
| D | ≤ 70 s | Ausreichend |
| E | ≤ 100 s | Mangelhaft |
| F | > 100 s / Überlast | Ungenügend |

### Geometrische Konfliktprüfung

Der Rechner prüft, ob geometrisch unverträgliche Ströme innerhalb derselben Phase zusammen grün sind.

Beispiele für unverträgliche Paare (4-Arm):
- q2 (A→C) mit q5 (B→D): Geradenströme senkrechter Arme kreuzen sich
- q1 (A→D) mit q6 (B→C): Linksabbieger zweier benachbarter Arme kreuzen sich

### Verhältnis zu VSS 40 835

VSS 40 835 definiert die Kapazität als:

```
l = s_p · g / Z     mit g = G + 1 s (angezeigte Grünzeit + 1 Sekunde)
```

wobei s_p = s · ∏f (ideale Sättigung s = 2000 PWE/h, multipliziert mit Reduktionsfaktoren für Fahrstreifenbreite, Neigung, Haltestellen, Parkierung etc.).

VSS 40 023a übernimmt zwar den Wert s_p = S = 1800 PWE/h für Normalverhältnisse (Ziffer 11.3), verwendet aber die **angezeigte** Grünzeit G direkt — kein +1 s. Das ist kein Fehler: Die Tab.-2-Werte der Norm (z. B. Z = 60 s, 2 Phasen → tGrSum = 50 s, qKritMax = 1500 PWE/h) sind exakt konsistent mit L = 1800 · G/Z. Würde man +1 s pro Phase addieren, ergäben sich qKritMax-Werte, die Tab. 2 widersprechen.

Die +1 s aus VSS 40 835 gehören zum Rahmen s = 2000 + ∏f und sind nicht auf das vereinfachte VSS-40-023a-Modell mit S = 1800 übertragbar. Die Reduktionsfaktoren (∏f) von VSS 40 835 sind ebenfalls nicht implementiert: Für einen ersten Nachweis mit Normalverhältnissen ist S = 1800 PWE/h die normativ vorgesehene Vereinfachung.

### Technische Details

**Tabelle 2 und dynamisches T_Z (VSS 40 023a / VSS 40 837)**

KnotenCheck nutzt Tabelle 2 nur für die Umlaufzeiten Z (45–120 s). qKritMax und tGrSum werden **nicht** aus den Tabellenwerten abgelesen, sondern für das gewählte T_Z dynamisch berechnet:

```
tGrSum   = Z - n · T_Z
qKritMax = (tGrSum / Z) · 1800 PWE/h
```

Die Spalten p2/p3/p4 der Norm (tGrSum, lambdaSum, qKritMax) entsprechen dem Normfall T_Z = 5 s (Ziff. 11.2: «pauschal 5 s pro Phase»). Durch die Eingabe von v_zul je Arm wird T_Z nach der obigen Staffelung (eigene Annahme, angelehnt an die Gelbzeiten der VSS 40 837) bestimmt und knoteneinheitlich als Maximum verwendet, sodass qKritMax konsistent für das gewählte T_Z berechnet wird.

**Beispiel qKritMax bei 2 Phasen:**

| Z [s] | T_Z = 3 s | T_Z = 4 s | T_Z = 5 s (Norm-Tab. 2) |
|---:|---:|---:|---:|
| 45 | 1560 | 1480 | 1400 |
| 60 | 1620 | 1560 | 1500 |
| 90 | 1680 | 1640 | 1600 |
| 120 | 1710 | 1680 | 1650 |

---

## Simulation

### Worum geht es?

Die analytische SN-640-022-Berechnung gibt für jeden Nebenstrom eine einzige Zahl aus: die mittlere Wartezeit nach Kimber & Hollis. Diese Zahl sagt nichts darüber aus, wie stark die Wartezeiten streuen — ob ein Fahrzeug mal 3 s und mal 80 s wartet, oder ob alle Fahrzeuge gleichmässig 20 s warten, ergibt denselben Mittelwert. Sie sagt nichts darüber aus, was in der Stunde davor oder danach passiert — und sie kennt keine Fussgänger*innen.

Die Simulation ergänzt den analytischen Rechner um vier Aspekte:

1. **Wartezeit-Verteilungen** — Mittelwert, Standardabweichung, Perzentile (P50, P85, P95) und Histogramm je Strom
2. **Fussgänger*innen an Fussgängerstreifen** — erzeugen Sperrzeiten im Hauptstrom, die dem NS-Verkehr Lücken schenken (positiver Kapazitätseffekt möglich)
3. **Mehrere Zeitintervalle** — Rückstau am Ende eines Intervalls wird in das nächste übertragen (Carry-over-Queue)
4. **Konfigurierbare t_c / t_f** — Standardwerte durch eigene Grenzzeitlücken ersetzen

### Grundlagen

- **SN 640 022** liefert: Ränge der Verkehrsströme, qpi-Konfliktstromberechnung (F1–F8), Fahrzeugkategorien (PCE). Die SN 640 022 definiert t_c und t_f nicht — sie arbeitet mit Kapazitätskurven (Abb. 2). Die SN 640 022 kennt keine Fussgänger*innen.
- **HBS 2015, Kap. S5, Tabelle S5-5 (Zeichen 205 StVO)** liefert die Grenzzeitlücken t_c und Folgezeitlücken t_f je Manöver.
- **Troutbeck & Brilon (FHWA 1997, Kap. 8)** liefert die Gap-Acceptance-Theorie: Erlang-Verteilung für Fahrerstreuung, Cowan-M3-Headwaymodell für Kolonnenbildung.
- **VSS 2011/308** liefert die Gruppengrösse ρ — sie steuert die *Häufigkeit* der Fussgänger-Sperrungen (eine Gruppe quert gemeinsam = ein Ereignis für ρ Personen), konsistent mit `S_Fg = 900·ρ` der Norm.
- **VSS 40 240** liefert die Gehgeschwindigkeit v_FG = 0.80 m/s (konservativ für ältere Menschen und Menschen mit Behinderung); sie bestimmt die *Dauer* einer Sperrung aus der Fahrbahnbreite. Die Halbierung bei Mittelinseln stützt sich auf Art. 47 Abs. 3 VRV (jede Streifenhälfte gilt als selbständiger Streifen); der Mittelinsel-Schwellenwert ab 8.5 m auf VSS 40 241.


### User-Eingaben und ihre Wirkung

| Eingabe | Wirkung |
|---|---|
| **Knotentyp** (3/4 Arme) | Bestimmt welche Ströme existieren und welche qpi-Formeln gelten |
| **Volumen je Arm/Richtung** | Bestimmt qpi (Konfliktvolumen) und Ankunftsrate der NS-Fahrzeuge |
| **Geometrie-Flags** | Modifizieren qpi (z. B. separater Abbiegestreifen reduziert wirksames Konfliktvolumen) |
| **Fussgänger fg, ρ, Fahrbahnbreite, Mittelinsel** | Je Arm konfigurierbar. HS-Streifen fügen Sperrzeiten in den Konfliktstrom ein → erzwungene Lücken für NS-Einbieger. Zusätzlich sperrt jeder Streifen die Ströme direkt, die ihn am Abfahrts- oder Ankunftsarm überfahren. **ρ** steuert die Häufigkeit (fg/ρ), **Fahrbahnbreite** (Standard 8 m) die Dauer (Breite/0.80 m/s), **Mittelinsel** halbiert die Dauer |
| **Mehrere Zeitintervalle** | Fahrzeuge, die am Ende eines Intervalls noch warten, werden als Rückstau ins nächste übertragen |
| **Anzahl Läufe** | Mehr Läufe = stabilere Statistik, längere Rechenzeit |
| **Cowan M3 / Exponential** | Kolonnenbildung im HS ein-/ausschalten; Cowan ist bei qpi > 600 Fz/h deutlich realistischer |
| **Erlang-Ordnung k** | k=1: alle Fahrer gleich (deterministisch). k=2 (Standard): deutliche Fahrerstreuung um t_c. k=3: geringere Streuung als k=2 (Varianz = t_c²/k) |
| **Stauraum** | Begrenzt wartende Fahrzeuge; Überschuss wird verworfen (modelliert kurze Aufstellfläche) |
| **t_c / t_f-Override** | Eigene Grenz-/Folgezeitlücken je Manövertyp, z. B. für Kalibrierung auf Feldmessungen |

### Ablauf

**Grundidee: Lückenakzeptanz.** Ein Fahrzeug, das von der Nebenstrasse einbiegen will, beobachtet den vortrittsberechtigten Hauptstrom und fährt erst los, wenn die Zeitlücke zwischen zwei Hauptstrom-Fahrzeugen gross genug ist. «Gross genug» heisst: mindestens so lang wie die **Grenzzeitlücke t_c**. Folgen mehrere wartende Fahrzeuge in derselben Lücke nach, brauchen sie untereinander die kürzere **Folgezeitlücke t_f**. Die ganze Simulation besteht im Kern darin, diesen Vorgang für jedes einzelne Fahrzeug nachzuspielen — die folgenden Schritte liefern jeweils einen Baustein dazu.

**Schritt 1 — Strom-Topologie und qpi (aus SN 640 022)**

Die Ränge und Konfliktvolumen qpi werden nach den SN-640-022-Formeln F1–F8 berechnet: welcher Strom muss welchem anderen Vortritt lassen, und wie gross ist das massgebende Hauptstromvolumen je Nebenstrom. qpi kodiert bereits alle Rangabhängigkeiten.

*Verkehrlich:* qpi ist die Menge an Hauptstromverkehr, der ein bestimmter Nebenstrom Vortritt gewähren muss. Je grösser qpi, desto dichter der Hauptstrom — und desto seltener entsteht eine Lücke, die zum Einbiegen reicht. Ein separater Abbiegestreifen oder eine Dreiecksinsel nimmt einzelne Ströme aus diesem Konfliktvolumen heraus und erleichtert so das Einbiegen.

*Zu den Einheiten — Fz/h vs. PWE/h:* PWE/h (Personenwagen-Einheiten) ist das *gewichtete* Verkehrsvolumen, bei dem schwere Fahrzeuge mehr zählen als ein Personenwagen (ein Lastwagen ≈ 1.5–2 PWE, weil er mehr Platz und Zeit braucht; Umrechnung mit den Faktoren aus Tab. 1/2 der SN 640 022, inkl. Längsneigung). Die Simulation nutzt bewusst beide Grössen: Das **Konfliktvolumen qpi rechnet in Fz/h** (echte Fahrzeuge), denn jedes reale Fahrzeug erzeugt genau eine Zeitlücke im Hauptstrom — und die Abb.-2-Kurven der Norm sind ebenfalls über Fz/h definiert. Die **eigene Belastung des Nebenstroms und die Kapazität rechnen in PWE/h** (gewichtet). Beide Werte werden vor der Simulation aus derselben Eingabe gebildet und je an der passenden Stelle verwendet.

**Schritt 2 — Hauptstrom-Zeitlücken generieren (Cowan M3)**

Statt zufälliger Ankünfte (Exponentialverteilung) verwendet der Rechner standardmässig das Cowan-M3-Modell: Es unterscheidet *freie* Fahrzeuge (ausreichend Abstand) von *gebundenen* Fahrzeugen in Kolonnen (Mindestabstand t_m = 1.8 s). Bei qpi > 600 Fz/h bilden sich realistische Kolonnen mit grösseren freien Lücken dazwischen. *(Cowan 1975; Troutbeck & Brilon, FHWA 1997, Kap. 8, Gl. 8.21–8.23)*

```
alpha  = e^(−A · qpi/3600)              [Anteil freier Fahrzeuge; A = 7.0]
lambda = alpha · qpi/3600 / (1 − tm · qpi/3600)

Gebunden (1−alpha): h = tm = 1.8 s
Frei     (alpha):   h = tm + Exp(lambda)
```

(A = 7.0 ist der mittlere Wert der publizierten Spanne A = 6–9 aus Gl. 8.23.)

*Verkehrlich:* Echter Verkehr kommt nicht gleichmässig getröpfelt, sondern in **Kolonnen** (Pulks) — etwa wenn eine vorgelagerte Ampel mehrere Fahrzeuge gleichzeitig losschickt. Innerhalb einer Kolonne fahren die Fahrzeuge dicht hintereinander (kein Abstand, der zum Einbiegen reicht); zwischen den Kolonnen entstehen dafür grosse Lücken. Das einfache Exponentialmodell tut so, als käme jedes Fahrzeug für sich zufällig an — es übersieht diese Lücken und unterschätzt bei viel Verkehr die Einbiegechancen. Cowan M3 bildet die Realität ab: **α** ist der Anteil «freier» Fahrzeuge (Kolonnenführer mit echtem Abstand); er sinkt mit steigendem Verkehr, weil sich dann mehr Fahrzeuge in Kolonnen einreihen. **t_m = 1.8 s** ist der Drängelabstand *innerhalb* einer Kolonne. **Exp(λ)** ist der zufällige Zusatzabstand *zwischen* den freien Fahrzeugen. Genau diese grossen Zwischen-Kolonnen-Lücken nutzt der wartende Nebenstrom.

**Schritt 2b — Fussgänger*innen-Blocking-Events (optional)**

Sind Fussgänger*innen an einem HS-Fussgängerstreifen konfiguriert, werden Sperrzeiten in den Konfliktstrom eingefügt. Fussgänger*innen-**Gruppen** kommen Poisson-verteilt; jede Gruppe blockiert den HS für die Querungsdauer:

```
Häufigkeit:  λ = (fg / ρ) / 3600                              [Gruppen/s]
Dauer:       t_block = Fahrbahnbreite / 0.80 m/s × (Mittelinsel ? 0.5 : 1)   [s]
             Standard: 8 m → 10 s   (mit Mittelinsel 5 s)
```

*Verkehrlich:* Quert eine Fussgängergruppe den Hauptstrassen-Streifen, muss der Hauptstrom anhalten. Für den wartenden Nebenstrom ist das ein **Geschenk**: Während der Hauptstrom steht, entsteht eine erzwungene Lücke zum Einbiegen (sofern t_block ≥ t_c). Zwei Grössen bestimmen den Effekt getrennt: **Die Dauer** einer Sperre ist die Zeit, die Fussgänger*innen zum Queren brauchen — Fahrbahnbreite geteilt durch die Gehgeschwindigkeit 0.80 m/s (VSS 40 240, bewusst langsam für ältere Menschen und Menschen mit Behinderung). Die **Gruppengrösse ρ** verlängert die Sperre *nicht* (eine Gruppe quert gemeinsam), sondern macht Sperrungen *seltener*: Bei fg = 100 Fg/h und ρ = 1 gibt es 100 Sperrungen pro Stunde, bei ρ = 2 nur noch 50. Eine **Mittelinsel** halbiert die Sperrdauer, weil nur noch die halbe Fahrbahn am Stück gequert wird (Art. 47 Abs. 3 VRV). Standardmässig wird mit 8 m Fahrbahnbreite gerechnet (→ 10 s); alternativ lässt sich eine eigene Breite eingeben (ab 8.5 m weist die Norm VSS 40 241 eine Mittelinsel an).

Während t_block ist der HS gesperrt — eine erzwungene Lücke für wartende NS-Fahrzeuge. HS-Fahrzeuge, die in dieser Zeit ankämen, stauen sich danach als Cluster (Mindestabstand t_m). Der NS-Einbieger kann die Sperrzeit nutzen, wenn t_block ≥ t_c. Dieser **positive Kapazitätseffekt** tritt bei stark belasteten HS-Strassen auf und ist der Grund, weshalb Fussgängerstreifen auf der Hauptstrasse bei hohem HS-Volumen die Einbiege-Qualität verbessern können.

Zusätzlich wirkt jeder Fussgängerstreifen als **Direktsperre**: Jeder Fahrzeugstrom wird an seinem Abfahrts- **und** Ankunftsarm durch den dortigen Streifen blockiert — fällt die Abfahrt in eine Sperrzeit, wird sie ans Ende der Sperre verschoben. Das gilt auch für Streifen an den Nebenstrassen-Armen B und D.

**Schritt 3 — Grenzzeitlücke pro Fahrer ziehen (Erlang)**

Jeder Fahrer hat einen persönlichen t_c-Wert, gezogen aus einer Erlang-Verteilung um den Nominalwert (HBS 2015 S5, Tabelle S5-5). Das modelliert Fahrerstreuung: aggressive Fahrer akzeptieren kürzere Lücken, vorsichtige brauchen längere. Erlang-verteilte, fahrerkonsistente t_c-Werte folgen dem Ansatz von Brilon, Troutbeck & Koenig (1999); dort wird für t_c eine verschobene Erlang-Verteilung mit k=5 verwendet — der Default k=2 in KnotenCheck ist eine eigene Wahl mit grösserer Streuung. Gezogene Werte werden auf minimal 1.0 s begrenzt.

*Verkehrlich:* Nicht jeder Fahrer braucht dieselbe Lücke — der forsche fädelt schon in eine knappe 4-Sekunden-Lücke ein, der vorsichtige wartet auf 8 Sekunden. Würde die Simulation für alle denselben festen t_c verwenden, wäre dieses reale Verhalten verfälscht. Stattdessen erhält jedes Fahrzeug einen eigenen, zufällig gezogenen t_c-Wert. Die **Erlang-Ordnung k** steuert dabei, wie stark die Fahrer sich unterscheiden: kleines k = breite Streuung (sehr unterschiedliche Fahrer), grosses k = alle ähnlich (bei k → ∞ wieder ein fester Wert). Jeder Fahrer behält seinen einmal gezogenen Wert bis zur Abfahrt — er ist in sich konsistent.

**Schritt 4 — Lückensuche**

```
Lücke < tc_i  → zu klein, ablehnen
Lücke ≥ tc_i  → einfahren
Wartezeit = Abfahrtszeit − Ankunftszeit
```

*Verkehrlich:* Das ist die eigentliche Lückenakzeptanz-Entscheidung aus der Grundidee, jetzt pro Fahrzeug durchgespielt. Das Fahrzeug prüft die ankommenden Hauptstrom-Lücken der Reihe nach: zu kleine lässt es verstreichen, die erste ausreichend grosse nutzt es zum Einfahren. Die Wartezeit ist schlicht die Zeit zwischen Ankunft an der Haltlinie und Abfahrt.

Die Folgezeitlücke t_f wirkt an zwei Stellen: (1) ein Fahrzeug, das mindestens eine Lücke ablehnen musste (Einfädeln hinter einem Konfliktfahrzeug), fährt mit t_f-Aufschlag ab; (2) ein Fahrzeug, das bei Ankunft bereits hinter einem Vorgänger ansteht (Warteschlange), darf frühestens t_f nach dessen Abfahrt einfahren. Dadurch fliesst eine Warteschlange auch in einer grossen Hauptstromlücke nur mit dem Sättigungsabfluss 3600/t_f je Lücke ab — entsprechend der Definition der Folgezeitlücke als Kopffolge wartender Fahrzeuge in derselben Lücke (Troutbeck & Brilon, FHWA 1997, Kap. 8.4.1). Nur ein **frei** einfahrendes Fahrzeug (Server bei Ankunft frei, ausreichende Lücke ab Ankunft) fährt ohne t_f-Aufschlag ab — das vermeidet eine Überschätzung der Wartezeit bei gering belasteten Strömen.

**Schritt 5 — Gemeinsame Haltlinie (NS-Arme simultan)**

Die NS-Ströme eines Arms (z. B. Arm B: Ströme 4, 5, 6) teilen eine gemeinsame Haltlinie und werden **simultan** simuliert: Ein kombinierter Poisson-Prozess erzeugt Fahrzeuge mit der Gesamtrate aller Ströme; jedes Fahrzeug wird proportional zu den Einzelvolumen einem Strom zugewiesen. Wenn Strom 4 (Linkseinbieger, hoher qpi) die Haltlinie blockiert, wartet auch der nachfolgende Strom-6-Rechtseinbieger — auch wenn dieser selbst eine freie Lücke hätte.

*Verkehrlich:* An einer gemeinsamen Haltlinie steht nur ein Fahrzeug vorne — wer dahinter steht, kommt erst dran, wenn der Vordermann weg ist. Ein Linkseinbieger, der lange auf seine Lücke wartet, hält damit auch den Rechtseinbieger hinter sich auf, obwohl dieser längst hätte fahren können. In der Realität lösen getrennte Abbiegestreifen dieses Problem — **die Simulation modelliert jedoch immer eine einzige gemeinsame Haltlinie je Nebenstrassen-Arm**, unabhängig von der Spuraufteilung. Die Geometrie-Flags (separater Abbiegestreifen, Dreiecksinsel) wirken in der Simulation nur über das Konfliktvolumen qpi, nicht über die Haltlinien-Gruppierung. Wer getrennte Spuren abbilden will, beurteilt die betroffenen Ströme im analytischen SN-640-022-Rechner (Mischstreifen-Kombination).

**Schritt 6 — Stauraum (optional)**

Ist ein maximaler Stauraum gesetzt, werden Fahrzeuge bei vollem Aufstellbereich abgewiesen (modelliert kurze Aufstellflächen).

*Verkehrlich:* Hat die Nebenstrasse nur eine kurze Aufstellfläche vor der Haltlinie (z. B. eine kurze Abbiegetasche), passen dort nur wenige Fahrzeuge hinein. Ist sie voll, kann kein weiteres nachrücken — es blockiert dann andernorts (z. B. die durchgehende Spur). Diese Option begrenzt die Warteschlange entsprechend.

**Schritt 7 — Läufe wiederholen**

Die Schritte 2–6 werden für die konfigurierte Anzahl Läufe wiederholt (Standard 150–200). Aus den gesammelten Wartezeiten aller Läufe werden Statistiken berechnet: Mittelwert, ±σ, P50, P85, P95, Histogramm.

**Schritt 8 — Carry-over (mehrere Zeitintervalle)**

Fahrzeuge, die am Intervallende noch warten, werden als Anfangsrückstau ins nächste Intervall übertragen. So wirkt sich eine überlastete Spitzenstunde auf die Folgestunde aus.

*Verkehrlich:* Stau verschwindet nicht pünktlich mit dem Stundenende. Wer um 17:59 noch in der Schlange steht, steht um 18:00 immer noch da — und verlängert die Wartezeiten der Folgestunde. Eine Betrachtung von genau einer Stunde (wie die Analytik) übersieht das; mehrere aneinandergereihte Intervalle geben den Rückstau realistisch weiter.

**Was die Simulation nicht macht:**
- Keine t_c/t_f-Schätzung aus Felddaten — Werte (HBS 2015) sind vorgegeben, überschreibbar
- Kein Fahrzeugfolgemodell — Fahrzeuge sind Punkte ohne Länge
- Keine LSA-Koordination — benachbarte Ampeln erzeugen keine Platoons
- G_i und L_i aus SN 640 022 werden nicht verwendet — nur qpi
- Keine getrennte Haltlinie je Spur — alle NS-Ströme eines Arms teilen immer eine gemeinsame Haltlinie (die Mischstreifen-Kombination F21 wird in der Simulation nicht abgebildet und ist daher ausgeblendet)

### Mehrere Zeitintervalle und Carry-over

Statt einer einzigen Stunde können bis zu 6 aufeinanderfolgende Zeitintervalle mit je eigener Verkehrsbelastung simuliert werden (15 / 30 / 45 / 60 Minuten je Intervall). Die Geometrie (Neigung, Abbiegestreifen, Inseln, Fahrzeugmix) stammt dabei einheitlich aus der Basis-Konfiguration — je Intervall variieren nur die Verkehrsmengen.

**Carry-over-Mechanismus:** Am Ende jedes Intervalls zählt die Simulation, wie viele Fahrzeuge noch auf eine Abfahrtslücke warten. Diese werden als Warteschlange an den Beginn des nächsten Intervalls übergeben. Damit wirkt sich Überlast in der Spitzenstunde auf die Wartezeiten in der Folgestunde aus — ein Effekt, den die einstündige Analytik vollständig ignoriert.

Die Ausgabe zeigt pro Intervall Mittelwert, P85 und QS in einer Ganglinie-Tabelle sowie die Anzahl der Carry-over-Fahrzeuge.

### Grenzzeitlücken t_c und Folgezeitlücken t_f

**Standardwerte** — HBS 2015, Kapitel S5 (Stadtstrassen), Tabelle S5-5, Zeichen 205 StVO (Vorfahrt gewähren):

| Manöver | Ströme | t_c [s] | t_f [s] |
|---|---|---:|---:|
| Linksabbiegen HS | 1, 7 | 5.5 | 2.8 |
| Rechtseinbiegen NS | 6, 12 | 5.9 | 3.0 |
| Kreuzen NS | 5, 11 | 6.7 | 3.3 |
| Linkseinbiegen NS | 4, 10 | 6.5 | 3.2 |

Quelle: Brilon, W. (2016): [HBS 2015 — L5 & S5: Knotenpunkte ohne Lichtsignalanlage – Vortrag](https://silo.tips/download/hbs-l5-s5-knotenpunkte-ohne-lichtsignalanlage-vorfahrt-werner-brilon). Vortrag VSVI Baden-Württemberg, 23.02.2016.

**Voreinstellung «SN 640 022 (implizit)»:** Alternativ können äquivalente Zeitlücken gewählt werden, die aus den Abb.-2-Kurven der SN 640 022 rückgerechnet sind — per Siegloch-Fit `G − 90 = 3600/t_f · e^(−qpi·(t_c − t_f/2)/3600)` auf die digitalisierten Stützpunkte (Genauigkeit ±0.2–0.4 s, Restabweichung der Kurven 6–13 %, abgesichert im Unit-Test «Preset SN 640 022»):

| Manöver | t_c [s] | t_f [s] |
|---|---:|---:|
| Linksabbiegen HS | 5.8 | 2.5 |
| Rechtseinbiegen NS | 6.1 | 3.3 |
| Kreuzen NS | 6.4 | 4.0 |
| Linkseinbiegen NS | 6.9 | 4.1 |

Die t_f entsprechen der Verfahrensgeneration der Norm-Quellen ([6] FGSV-Merkblatt, [7] BMV Heft 669 — nahe HBS 2001). Zu beachten: Gap-Acceptance mit diesen Lücken bildet die Abb.-2-Kurven **ohne** die CH-Erhöhung von +90 PWE/h ab (Abschnitt 9 der Norm) — die Simulation rechnet mit diesem Preset entsprechend konservativ.

**Benutzerdefinierte Werte:** In den erweiterten Einstellungen können t_c und t_f je Manövertyp überschrieben werden. Das ermöglicht die Kalibrierung auf eigene Feldmessungen.

### Ausgabe

Pro Nebenstrom (Ränge 2–4):

| Kennwert | Bedeutung |
|---|---|
| **Mittelwert** | Mittlere Wartezeit aller simulierten Fahrzeuge [s] |
| **±σ** | Standardabweichung [s] |
| **P50** | Median: 50 % der Fahrzeuge warten kürzer |
| **P85** | 85 % der Fahrzeuge warten kürzer — üblicher Planungswert |
| **P95** | 95 % der Fahrzeuge warten kürzer |
| **n** | Stichprobengrösse (Fahrzeuge über alle Läufe) |
| **Histogramm** | Verteilung in Bins 0–10 / 10–20 / 20–30 / 30–45 / 45–60 / 60–90 / 90–120 / >120 s |

Bei mehreren Intervallen zeigt eine Ganglinie-Tabelle die Entwicklung über den Zeitverlauf und den Carry-over-Rückstau. Einen Vergleich mit dem analytischen Rechner zeigt die Simulation nicht an — die beiden Verfahren beantworten unterschiedliche Fragen (Verteilung vs. Norm-Nachweis).

### Streuung der Wartezeiten

Auch wenn der analytische Mittelwert stimmt, streuen real beobachtete Wartezeiten stark: Brilon (2008, TRR 2071) zeigt per Simulation, dass die Standardabweichung der mittleren Wartezeit zwischen 15-Minuten-Intervallen typisch bei **σ ≈ 0.7 × Mittelwert** liegt — bei Auslastung x < 0.8 sogar darüber. Ein analytisch ermittelter Mittelwert von 20 s kann in der Praxis also ein 15-Minuten-Intervall mit 10 s und eines mit 30 s umfassen; empirische Validierung von Wartezeitformeln ist entsprechend schwierig. Die Simulation macht diese Streuung sichtbar (±σ, P50/P85/P95, Histogramm) — der analytische Rechner nicht.

*Verkehrlich:* Die **Standardabweichung σ** ist ein Mass dafür, wie weit die einzelnen Wartezeiten um den Mittelwert schwanken. σ ≈ 0.7 × Mittelwert heisst: Die tatsächlichen Wartezeiten liegen typisch um rund 70 % des Mittelwerts darüber oder darunter — ein Mittelwert von 20 s ist also kein verlässlicher Einzelwert, sondern die Mitte einer breiten Spanne. Genau deshalb gibt die Simulation nicht nur eine Zahl aus, sondern die ganze Verteilung: Der **P85-Wert** (85 % der Fahrzeuge warten kürzer) ist für die Planung oft aussagekräftiger als der Mittelwert, weil er die ungünstigen Fälle einschliesst.

### Technische Umsetzung

**Dateien:**
- `KnotenCheckWeb/src/engine/stochasticSN640022.ts` — Engine (Simulation, Statistik, Multi-Intervall)
- `KnotenCheckWeb/src/SimulationApp.tsx` — eigenständiger 5. Rechner

Konfigurierbar per `StochasticConfig`:

| Parameter | Default | Bedeutung |
|---|---|---|
| `runs` | 150 (Web-UI: 200) | Anzahl Simulationsläufe |
| `T` | 3600 | Simulationsdauer [s] (bei Multi-Intervall je Intervall) |
| `erlangK` | 2 | Erlang-Ordnung für t_c (1 = deterministisch) |
| `useCowan` | true | Cowan M3 statt Exponential |
| `cowanA` | 7.0 | Platoon-Faktor A |
| `cowanTm` | 1.8 | Mindestabstand t_m [s] |
| `storageB` | ∞ | Arm-B-Stauraum [Fz] |
| `storageD` | ∞ | Arm-D-Stauraum [Fz] |
| `gapOverrides` | `{}` | t_c / t_f je Manövertyp überschreiben |
| `pedestrians` | — | Fussgänger*innen-Blocking-Events je Arm A/B/C/D: fg [Fg/h], ρ (Häufigkeit fg/ρ), fahrbahnbreite [m] (Dauer Breite/0.80 m/s; default 8 m), mittelinsel (halbiert) |

Multi-Intervall-API: `runStochasticSN640022Multi(intervals, flags, config)` — nimmt ein Array von `SimInterval`-Objekten (`label`, `volumes`, `T`) und gibt `StochasticMultiResult` zurück (pro Intervall: Ergebnis + Carry-over-Zähler).

**Literatur:**
- Troutbeck, R.J. & Brilon, W. — [*Unsignalized Intersection Theory*](https://www.fhwa.dot.gov/publications/research/operations/tft/chap8.pdf). In: Gartner, Messer, Rathi (Hrsg.), Revised Monograph on Traffic Flow Theory, FHWA, 1997, Kap. 8.
- Cowan, R.J. (1975) — *Useful headway models*. Transportation Research 9(6), 371–375.
- Brilon, W., Troutbeck, R.J. & Koenig, R. (1999) — [*Useful estimation procedures for critical gaps*](https://www.academia.edu/105237389/Useful_estimation_procedures_for_critical_gaps). Transportation Research Part A 33(3–4), 161–186.

---

# Grundlagen

- SN 640 022 — Leistungsfähigkeit, Verkehrsqualität, Belastbarkeit; Knoten ohne Lichtsignalanlage
- SN 640 024a / VSS 40 024a (Ausgabe 2019-03) — Leistungsfähigkeit, Verkehrsqualität, Belastbarkeit; Knoten mit Kreisverkehr
- VSS 40 023a — Leistungsfähigkeit, Verkehrsqualität, Belastbarkeit; Knoten mit Lichtsignalanlagen
- VSS 40 834 — Lichtsignalanlagen; Phasentrennung
- VSS 40 835 — Lichtsignalanlagen; Abschätzen der Leistungsfähigkeit
- VSS 40 837 — Lichtsignalanlagen; Übergangszeiten und Mindestzeiten
- VSS-Forschungsbericht 2005/301 — [*Leistungsfähigkeit zweistreifiger Kreisel*](https://www.mobilityplatform.ch/de/1279.html) (PDF kostenlos herunterladbar)
- VSS-Forschungsbericht 2008/301 — [*Verkehrsqualität und Leistungsfähigkeit von komplexen ungesteuerten Knoten: Analytisches Schätzverfahren*](https://www.mobilityplatform.ch/de/1287.html) (PDF kostenlos herunterladbar)
- VSS-Forschungsbericht 2011/308 — [*Verkehrsablauf an ungesteuerten Knoten innerorts unter Berücksichtigung der verschiedenen Verkehrsarten; Ermittlung repräsentativer Richtwerte und Zusammenhänge*](https://www.mobilityplatform.ch/de/1528.html) (PDF kostenlos herunterladbar)
- [Handbuch Lichtsignalanlagen (HB LSA)](https://www.bern.ch/themen/planen-und-bauen/bern-baut/arbeitshilfen/handbuch-lichtsignalanlagen), Tiefbauamt Stadt Bern, V 2.1, Anhang G
- Brilon, W. (2008) — [*Delay at Unsignalized Intersections*](https://www.researchgate.net/publication/245563035_Delay_at_Unsignalized_Intersections). Transportation Research Record No. 2071, S. 98–108 (zeitabhängige Wartezeitformel der Rechner SN 640 022 und Kreisverkehr)
- Kimber, R.M. & Hollis, E.M. (1979) — *Traffic Queues and Delays at Road Junctions*. TRRL Laboratory Report LR 909 (theoretischer Ursprung; in den Normen als Quelle der Wartezeitkurven genannt)

Die Normdokumente sind nicht Teil dieses Repositories (Urheberrecht VSS).

# Lizenz und Haftung

[Creative Commons Attribution-NonCommercial 4.0 International (CC BY-NC 4.0)](LICENSE) — Nutzung, Veränderung und Weitergabe erlaubt, **kommerzielle Nutzung ist untersagt**. Bei Weitergabe muss der Urheber genannt werden.

Copyright (C) 2026 pnfzygrzgf-svg

Die Berechnungen dienen der Plausibilisierung. Sie ersetzen keine Überprüfung durch eine Fachperson.
