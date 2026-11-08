// Startseite wie in den anderen Rechnern: Logo, Knopf, Rechner, Querverweise, Datenspeicherung, Fusszeile

import heroImg from './assets/KnotenCheck.png'
import veloLogo from './assets/VeloroutenCheck.svg'
import fgsLogo from './assets/fgsCheck.svg'
import sichtLogo from './assets/SichtweitenCheck.svg'
import { Lizenzzeile } from './Fusszeile'
import { MARKE } from './marke'
import type { RechnerKey } from './karte/rechner'

const RECHNER = [
  {
    key: 'sn022',
    title: 'Einmündung & Kreuzung',
    desc: 'Vorfahrtgeregelte Einmündung oder Kreuzung.',
    badge: 'Beta' as const,
  },
  {
    key: 'vss308',
    title: 'Ungesteuerter Knoten mit Fussgänger*innen',
    desc: 'Vorfahrtgeregelte Knoten mit Fussgängerstreifen.',
    badge: 'Beta' as const,
  },
  {
    key: 'sn024a',
    title: 'Kreisverkehr',
    desc: 'Ein- und zweistreifige Kreisel.',
    badge: 'Beta' as const,
  },
  {
    key: 'lsa',
    title: 'LSA-Knoten',
    desc: 'LSA-Knoten mit konfigurierbarem Fahrstreifen- und Phasenplan.',
    badge: 'Alpha' as const,
  },
  {
    key: 'simulation',
    title: 'Simulation',
    desc: 'Zeigt, wie Wartezeiten an einem Vorfahrtknoten verteilt sind — nicht als einzelne Zahl, sondern als vollständiges Bild aus Hunderten simulierter Stunden.',
    badge: 'Beta' as const,
  },
] as const

function Querverweis({ href, bild, titel, text }: { href: string; bild: string; titel: string; text: string }) {
  return (
    <a className="start-kachel" href={href} target="_blank" rel="noopener noreferrer">
      <img src={bild} alt="" width={56} height={56} />
      <span>
        <span className="start-kachel-titel">{titel}&nbsp;↗</span><br />
        <span className="start-kachel-text">{text}</span>
      </span>
    </a>
  )
}

export default function Startseite({ onSelect, onKarte }: { onSelect: (r: RechnerKey) => void; onKarte: () => void }) {
  return (
    <main className="start">
      <img className="start-logo" src={heroImg} alt="" aria-hidden="true" title="Zur Karte" onClick={onKarte} />
      <h1 className="start-titel">KnotenCheck</h1>
      <p className="start-untertitel">Werkzeug zur Leistungsbeurteilung von Knoten innerorts <span className="marke">{MARKE} v{__APP_VERSION__}</span></p>
      <div className="start-knopf-zeile">
        <button className="start-knopf" onClick={onKarte}>Zur Karte →</button>
      </div>
      <p className="start-untertitel">Knoten auf der Karte wählen oder direkt einen Rechner öffnen.</p>

      <div className="start-raster">
        {RECHNER.map(r => (
          <button key={r.key} className="start-rechner" onClick={() => onSelect(r.key)}>
            <span className="start-rechner-kopf">
              <span className="start-kachel-titel">{r.title}</span>
              <span className="start-reife">{r.badge}</span>
            </span>
            <span className="start-kachel-text">{r.desc}</span>
          </button>
        ))}
      </div>

      <Querverweis href="https://fgscheck.ch/" bild={fgsLogo} titel="fgsCheck" text="Sichtprüfung an Fussgängerstreifen." />
      <Querverweis href="https://sichtweitencheck.ch/" bild={sichtLogo} titel="SichtweitenCheck" text="Sichtprüfung an Knoten und Grundstückzufahrten." />
      <Querverweis href="https://veloroutencheck.ch/" bild={veloLogo} titel="VeloroutenCheck" text="Qualität der Veloinfrastruktur bewerten." />

      <div className="start-spende">
        <div className="start-spende-text">
          <div className="start-spende-titel">KnotenCheck unterstützen</div>
          <div className="start-spende-hinweis">Der Rechner ist frei nutzbar und quelloffen. Wer die Weiterentwicklung unterstützen möchte, kann über Ko-fi spenden.</div>
        </div>
        <a className="start-spende-knopf" href="https://ko-fi.com/pnfzygrzgfsvg" target="_blank" rel="noopener noreferrer">Über Ko-fi unterstützen ↗</a>
      </div>

      <div className="start-daten">
        <div className="start-daten-titel">Datenspeicherung</div>
        <div>Alle Berechnungen laufen im Browser. Eingaben und Ergebnisse werden an keinen Server übermittelt.</div>
        <ul>
          <li>Eingaben existieren nur im Arbeitsspeicher des Browsers und gehen beim Schliessen des Tabs verloren. Die Karte merkt sich im Browser nur Ausschnitt und Ebenenwahl.</li>
          <li>«Fall speichern» schreibt eine Datei auf deinen Rechner, «Fall laden» liest sie von dort, ohne Upload.</li>
          <li>Erst wenn du die Karte öffnest, holt der Browser Daten direkt bei den Diensten: swisstopo und Bund (geo.admin.ch), OpenStreetMap (Overpass), geodienste.ch
            und je nach Ort und eingeschalteten Ebenen die Geodatendienste von Städten und Kantonen. Gesendet werden Koordinaten, der Suchbegriff der Ortssuche und die
            OSM-Nummer des Knotens, keine Eingaben und Ergebnisse. Die Dienste sehen technisch die IP-Adresse. Für «Bericht / PDF» holt der Browser dann auch das Luftbild des Ausschnitts bei swisstopo. Die vollständige Liste steht auf der Karte unter «Datenschutz».</li>
          <li>Nutzungsstatistik: Seitenaufrufe werden mit GoatCounter gezählt, ohne Cookies und ohne Speicherung der IP-Adresse. GitHub Pages protokolliert Zugriffe wie jeder Webserver.</li>
        </ul>
      </div>

      <p className="start-fuss"><Lizenzzeile vibecoding={false} /></p>
    </main>
  )
}
