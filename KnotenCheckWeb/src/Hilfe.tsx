// Hilfe je Rechner wie in den anderen Rechnern: oben «So funktioniert's», unten Legende, Grundlagen und Quellen, Datenschutz

import type { ReactNode } from 'react'
import type { BerichtQuelle, RechnerKey } from './karte/rechner'

export interface LegendItem {
  abbr: string
  unit?: string
  desc: string
}

const SO: Record<RechnerKey, { schritte: ReactNode[]; grenzen: ReactNode }> = {
  sn022: {
    schritte: [
      <><b>Knotentyp:</b> T-Knoten (3 Arme) oder Kreuzung (4 Arme) wählen. A und C sind die Hauptstrasse, B und D die Nebenstrasse.</>,
      <><b>Arme:</b> je Arm die Ströme in Fz/h der Spitzenstunde eingeben, dazu Fall 1 oder Fall 2 für die Fahrzeugarten und die Neigung der Zufahrt.</>,
      <><b>Bauliche Merkmale:</b> Rechtsabbiegestreifen, Dreiecksinsel und Linksabbiegestreifen ankreuzen, an der Nebenstrasse die Aufteilung der Fahrstreifen wählen.</>,
      <><b>Ergebnis:</b> rechts das Knotenbild mit der Qualitätsstufe je Strom und die Gesamtstufe. «Bericht / PDF» zeigt das Berechnungsblatt.</>,
    ],
    grenzen: <>Die Norm kennt nur den Motorfahrzeugverkehr. Für Fussgänger*innen gibt es den Rechner «Ungesteuerter Knoten mit Fussgänger*innen» und die Simulation.</>,
  },
  vss308: {
    schritte: [
      <><b>Knotentyp:</b> Einmündung (3 Arme) oder Kreuzung (4 Arme) wählen. A und C sind die Hauptstrasse.</>,
      <><b>Arme:</b> je Arm die Abbiegeströme in Fz/h der Spitzenstunde eingeben.</>,
      <><b>Fussgänger*innen:</b> je Arm angeben, ob es einen Fussgängerstreifen gibt, dazu Fussgänger*innen je Stunde, Gruppengrösse und Mittelinsel.</>,
      <><b>Ergebnis:</b> Qualitätsstufe je Strom, je Arm und für den Knoten. «Bericht / PDF» zeigt das Bewertungsblatt.</>,
    ],
    grenzen: <>Nur Knoten mit Haupt- und Nebenstrasse; kein Rechtsvortritt, kein Tram oder Bus auf eigenem Trassee, keine Rückstaus von Nachbarknoten.</>,
  },
  sn024a: {
    schritte: [
      <><b>Arme:</b> 3 oder 4 Arme wählen, dann je Einfahrt den Kreiseltyp: 1/1, 2/1+ oder 2/2. Ein Knopf setzt einen Typ für alle Arme.</>,
      <><b>Ströme:</b> je Arm die Abbiegeströme in Fz/h der Spitzenstunde eingeben, dazu Verkehrsmischung und Längsneigung.</>,
      <><b>Ergebnis:</b> Leistungsfähigkeit, Auslastung, Wartezeit und Qualitätsstufe je Einfahrt, dazu die Prüfung der Ausfahrten. «Bericht / PDF» zeigt das Bewertungsblatt.</>,
    ],
    grenzen: <>Beim Typ 2/2 stützt sich die Rechnung auf wenige Messdaten; Werte ausserhalb der Kurven der Norm sind hochgerechnet und gekennzeichnet.</>,
  },
  lsa: {
    schritte: [
      <><b>Verkehrsstärken:</b> Knotentyp wählen und je Arm die Ströme in Fz/h der Spitzenstunde eingeben, bei Bedarf mit Fahrzeugmix.</>,
      <><b>Fahrstreifenplan:</b> die Ströme jedes Arms auf einen oder zwei Fahrstreifen verteilen, Fussgängerstreifen mit Querungslänge einschalten.</>,
      <><b>Phasenplan:</b> Fahrstreifen den Phasen zuordnen oder einen Vorschlag laden; Umlaufzeit, Zwischenzeit und Ziel-Verkehrsqualität wählen.</>,
      <><b>Ergebnis:</b> Auslastung, Wartezeit und Verkehrsqualität je Fahrstreifen und Strom, dazu Warnungen bei unverträglichen Strömen in derselben Phase. «Bericht / PDF» zeigt das Bewertungsblatt.</>,
    ],
    grenzen: <>Eine einzelne Anlage ohne Koordination und ohne ÖV-Bevorzugung; keine Abminderung für Fahrstreifenbreite, Neigung oder Haltestellen. Der Rechner ersetzt keine Signalplanung.</>,
  },
  simulation: {
    schritte: [
      <><b>Knotentyp und Arme:</b> wie bei «Einmündung &amp; Kreuzung», dazu je Arm die Fussgänger*innen am Fussgängerstreifen.</>,
      <><b>Zeitintervalle:</b> wahlweise mehrere Intervalle; ein Rückstau am Ende eines Intervalls geht ins nächste über.</>,
      <><b>Erweiterte Einstellungen:</b> Anzahl Läufe, Lückenmodell und eigene Grenz- und Folgezeitlücken.</>,
      <><b>Simulation starten:</b> Das Ergebnis zeigt je Strom die Verteilung der Wartezeiten mit Mittelwert, Streuung und Perzentilen. «Bericht / PDF» druckt das Ergebnis.</>,
    ],
    grenzen: <>Die Simulation ergänzt den Rechner «Einmündung &amp; Kreuzung», sie ersetzt ihn nicht. Jeder Lauf streut, darum weichen die Zahlen bei jedem Start leicht ab.</>,
  },
}

const GRUNDLAGEN: Record<RechnerKey, ReactNode[]> = {
  sn022: [
    <>SN 640 022 «Leistungsfähigkeit, Verkehrsqualität, Belastbarkeit; Knoten ohne Lichtsignalanlage» (VSS, Mai 1999). Vorgehen nach Ziffer 5, Seite 2.</>,
  ],
  vss308: [
    <>VSS 2011/308 «Verkehrsablauf an ungesteuerten Knoten innerorts unter Berücksichtigung der verschiedenen Verkehrsarten; Ermittlung repräsentativer Richtwerte und Zusammenhänge» (2015).</>,
    <>VSS 2008/301 «Verkehrsqualität und Leistungsfähigkeit von komplexen ungesteuerten Knoten: Analytisches Schätzverfahren» (2009).</>,
  ],
  sn024a: [
    <>VSS 40 024a (früher SN 640 024a) «Leistungsfähigkeit, Verkehrsqualität, Belastbarkeit; Knoten mit Kreisverkehr».</>,
    <>VSS 2005/301 «Leistungsfähigkeit zweistreifiger Kreisel», für den Typ 2/2.</>,
  ],
  lsa: [
    <>VSS 40 023a: Leistungsfähigkeit, Verkehrsqualität, Belastbarkeit; Knoten mit Lichtsignalanlagen.</>,
    <>VSS 40 837: Übergangszeiten und Mindestzeiten (Gelbzeiten Ziffer 16, Seite 5; Grundlage der wählbaren Staffelung der Zwischenzeit).</>,
    <>VSS 40 834: Phasentrennung (S = 8000 Fg/h für Fussgängerstreifen, Ziffer 4, Seite 3).</>,
    <>SN 640 835: Leistungsfähigkeit (Korrekturfaktoren; nicht umgesetzt).</>,
    <>Handbuch LSA Bern V 2.1, Anhang G: Mindestfreigabezeit Fussgängerstreifen ≥ 5 s.</>,
  ],
  simulation: [
    <>SN 640 022: Rangfolge der Ströme, massgebende Hauptstrombelastung, Fahrzeugkategorien.</>,
    <>HBS 2015, Kapitel S5, Tabelle S5-3: Grenz- und Folgezeitlücken.</>,
    <>Troutbeck &amp; Brilon (FHWA 1997, Kapitel 8): Lückenannahme, Cowan-M3-Modell.</>,
    <>VSS 2011/308: Gruppengrösse der Fussgänger*innen.</>,
    <>VSS 40 240: Gehgeschwindigkeit 0,8 m/s. Art. 47 Abs. 3 VRV: Mittelinsel teilt den Streifen; VSS 40 241: Mittelinsel ab 8,5 m.</>,
  ],
}

/** Kurzanleitung oben im Rechner, zugeklappt */
export function SoFunktionierts({ rechner }: { rechner: RechnerKey }) {
  const s = SO[rechner]
  return (
    <details className="kachel hilfe">
      <summary>So funktioniert's</summary>
      <ol>{s.schritte.map((x, i) => <li key={i}>{x}</li>)}</ol>
      <p><b>Grenzen:</b> {s.grenzen}</p>
    </details>
  )
}

/** Unten im Rechner: Legende, Grundlagen und Quellen (mit den Quellen der Vorbelegung aus der Karte), Datenschutz */
export function HilfeUnten({ rechner, legende, quellen }: { rechner: RechnerKey; legende: LegendItem[]; quellen?: BerichtQuelle[] }) {
  return (
    <div className="hilfe-unten">
      <details className="kachel hilfe">
        <summary>Legende</summary>
        <dl className="legende">
          {legende.map(l => (
            <div key={l.abbr}>
              <dt>{l.abbr}{l.unit && <span className="einheit"> [{l.unit}]</span>}</dt>
              <dd>{l.desc}</dd>
            </div>
          ))}
        </dl>
      </details>
      <details className="kachel hilfe">
        <summary>Grundlagen und Quellen</summary>
        <ul>{GRUNDLAGEN[rechner].map((g, i) => <li key={i}>{g}</li>)}</ul>
        {quellen && quellen.length > 0 && <>
          <p><b>Vorbelegung aus der Karte:</b></p>
          <ul>
            {quellen.map(q => (
              <li key={q.quelle + q.fuer}>
                {q.url ? <a href={q.url} target="_blank" rel="noopener noreferrer">{q.quelle}</a> : q.quelle}
                {q.fuer && <>: {q.fuer}</>}. {[q.anbieter, q.stand && `Stand ${q.stand}`, q.lizenz].filter(Boolean).join(', ')}.
              </li>
            ))}
          </ul>
        </>}
      </details>
      <details className="kachel hilfe">
        <summary>Datenschutz</summary>
        <ul>
          <li>Die Rechnung läuft im Browser. Eingaben und Ergebnisse gehen an keinen Server.</li>
          <li>Eingaben bleiben nur, solange der Tab offen ist. «Fall speichern» schreibt eine Datei auf deinen Rechner, «Fall laden» liest sie von dort, ohne Upload.</li>
          <li>Die Rechner selbst rufen keine Dienste auf. Nur die Karte holt Daten; was sie dabei sendet, steht auf der Karte unter «Datenschutz».</li>
          <li>Nutzungsstatistik: Seitenaufrufe werden mit GoatCounter gezählt, ohne Cookies und ohne Speicherung der IP-Adresse. GitHub Pages protokolliert Zugriffe wie jeder Webserver.</li>
        </ul>
      </details>
    </div>
  )
}
