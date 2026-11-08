// Hilfe je Rechner wie in den anderen Rechnern: oben «So funktioniert's», unten Legende, Grundlagen und Quellen, Datenschutz

import type { BerichtQuelle, RechnerKey } from './karte/rechner'
import { GRUNDLAGEN, SO } from './hilfeTexte'

export interface LegendItem {
  abbr: string
  unit?: string
  desc: string
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
          <li>Die Rechner selbst rufen keine Dienste auf. Nur die Karte holt Daten; was sie dabei sendet, steht auf der Karte unter «Datenschutz». Kommt der Knoten von der Karte, holt «Bericht / PDF» zusätzlich das Luftbild des Ausschnitts bei swisstopo (wms.geo.admin.ch); gesendet wird nur der Ausschnitt in Koordinaten.</li>
          <li>Nutzungsstatistik: Seitenaufrufe werden mit GoatCounter gezählt, ohne Cookies und ohne Speicherung der IP-Adresse. GitHub Pages protokolliert Zugriffe wie jeder Webserver.</li>
        </ul>
      </details>
    </div>
  )
}
