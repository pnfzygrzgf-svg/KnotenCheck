// Gemeinsames Gerüst der Druckblätter wie in den anderen Rechnern: Vorschau mit «Drucken / Als PDF speichern», Kopf mit Ort,
// danach Ergebnis, Fachteile, Eingaben, Annahmen und Hinweise, Quellen. Die Blätter hängen am body (Portal), Stile in bericht.css.

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import BerichtQuellen from '../karte/BerichtQuellen'
import type { BerichtQuelle, KartenBezug } from '../karte/rechner'
import { Lizenzzeile } from '../Fusszeile'
import { MARKE } from '../marke'
import type { HerkunftArt } from './herkunft'
import { ausschnitt, bildPixel, kartenGeometrie, massstab, svgAbbildung, VB, wmsBildUrl } from './kartenbild'

/** Bilder im Blatt melden, solange sie laden; «Drucken» wartet darauf */
const Laden = createContext<(laedt: boolean) => void>(() => {})
const BILD_ZEITGRENZE_MS = 20000   // danach drucken ohne Luftbild

export function BerichtRahmen({ dokumentTitel, onClose, children, bereit = true, wartet }: {
  dokumentTitel: string; onClose: () => void; children: ReactNode
  /** false, solange etwas für das Blatt noch lädt (zum Beispiel der Kartenausschnitt) */
  bereit?: boolean; wartet?: string
}) {
  const [bildLaedt, setBildLaedt] = useState(false)
  const frei = bereit && !bildLaedt
  const drucken = () => {
    const vorher = document.title
    document.title = dokumentTitel
    window.addEventListener('afterprint', () => { document.title = vorher }, { once: true })
    window.print()
  }
  return (
    <div className="bl-overlay">
      <div className="bl-toolbar no-print">
        <button className="bl-drucken" onClick={drucken} disabled={!frei}>Drucken / Als PDF speichern</button>
        <button className="bl-schliessen" onClick={onClose}>✕ Schliessen</button>
        <span className="bl-tipp">{frei ? 'Im Browser: Drucken → «Als PDF speichern»' : bildLaedt ? 'Luftbild lädt …' : (wartet ?? 'Wird vorbereitet …')}</span>
      </div>
      <Laden.Provider value={setBildLaedt}>
        <div className="berechnungsblatt bericht">{children}<footer className="bericht-fuss"><Lizenzzeile vibecoding={false} /></footer></div>
      </Laden.Provider>
    </div>
  )
}

/** Kopf: Titel, Angaben zum Knoten, Ort aus der Karte, Datum und Version; darunter optional das Kartenbild */
export function BerichtKopf({ titel, angaben, norm, karte, bild }: {
  titel: string; angaben: ReactNode; norm: string; karte?: KartenBezug | null; bild?: ReactNode
}) {
  const heute = new Date().toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric' })
  return (
    <header className="bericht-kopf">
      <div className="bericht-titelzeile">
        <h1>{titel}</h1>
        <div className="bericht-stand">KnotenCheck {MARKE} v{__APP_VERSION__} · {heute}</div>
      </div>
      <div className="bericht-angaben">{angaben}</div>
      <div className="bericht-angaben"><b>Grundlage:</b> {norm}</div>
      {karte && <div className="bericht-angaben">
        <b>Ort:</b> {karte.lat.toFixed(5)}, {karte.lon.toFixed(5)} (WGS84) · OSM-Knoten{' '}
        <a href={`https://www.openstreetmap.org/node/${karte.osmKnoten}`}>{karte.osmKnoten}</a>
      </div>}
      {bild ?? (karte && <Kartenausschnitt karte={karte} />)}
    </header>
  )
}

export function Abschnitt({ titel, children, untertitel }: { titel: string; children: ReactNode; untertitel?: ReactNode }) {
  return (
    <section className="bericht-abschnitt">
      <h2 className="bl-sec">{titel}</h2>
      {untertitel && <p className="bericht-unter">{untertitel}</p>}
      {children}
    </section>
  )
}

/** Gesamtergebnis als Kasten mit der Qualitätsstufe */
export function Gesamtergebnis({ stufe, text, farbe }: { stufe: string | null; text: ReactNode; farbe?: string }) {
  return (
    <div className="bericht-gesamt" style={farbe ? { background: farbe } : undefined}>
      <span className="bericht-gesamt-stufe">{stufe ?? '–'}</span>
      <span>{text}</span>
    </div>
  )
}

export function HinweisListe({ hinweise }: { hinweise: ReactNode[] }) {
  if (!hinweise.length) return null
  return (
    <Abschnitt titel="Annahmen und Hinweise">
      <ul className="bericht-hinweise">{hinweise.map((h, i) => <li key={i}>{h}</li>)}</ul>
    </Abschnitt>
  )
}

/** Quellen: Normen und Berichte des Rechners, dann die Datenquellen der Vorbelegung aus der Karte */
export function QuellenAbschnitt({ normen, daten }: { normen: ReactNode[]; daten: readonly BerichtQuelle[] }) {
  return (
    <Abschnitt titel="Quellen">
      <ul className="bericht-hinweise">{normen.map((n, i) => <li key={i}>{n}</li>)}</ul>
      <BerichtQuellen zeilen={daten} ohneTitel />
    </Abschnitt>
  )
}

/** Zeichen der Herkunft hinter einem Wert */
export function Herkunft({ art }: { art: HerkunftArt | null }) {
  return art ? <sup className={`herkunft herkunft-${art}`} title={art === 'M' ? 'Modellwert, nicht gezählt' : 'aus der Karte'}>{art}</sup> : null
}

/** Erklärung der Zeichen unter einer Tabelle; nur die Zeichen, die vorkommen */
export function HerkunftLegende({ arten }: { arten: readonly (HerkunftArt | null)[] }) {
  const da = new Set(arten.filter(Boolean))
  if (!da.size) return null
  return (
    <p className="bericht-unter">
      {da.has('M') && <><sup className="herkunft herkunft-M">M</sup> Modellwert des NPVM, berechnet, nicht gezählt. </>}
      {da.has('K') && <><sup className="herkunft herkunft-K">K</sup> aus der Karte übernommen (OpenStreetMap oder amtliche Daten). </>}
      Ohne Zeichen: von Hand eingegeben oder geändert.
    </p>
  )
}

/** Luftbild mit Knoten und Armen, nur wenn der Knoten von der Karte kommt; Zeichnung in LV95 über einem WMS-Bild */
function Kartenausschnitt({ karte }: { karte: KartenBezug }) {
  const melde = useContext(Laden)
  const g = kartenGeometrie(karte)
  const box = g ? ausschnitt([g.knoten, ...g.arme.flatMap(a => a.linie)]) : null
  const url = box ? wmsBildUrl(box, bildPixel(box).breite, bildPixel(box).hoehe) : null
  const [stand, setStand] = useState<'laedt' | 'ok' | 'ohne'>('laedt')
  useEffect(() => {
    if (!url) return
    melde(true)
    const t = setTimeout(() => { setStand(s => (s === 'laedt' ? 'ohne' : s)); melde(false) }, BILD_ZEITGRENZE_MS)
    return () => { clearTimeout(t); melde(false) }
  }, [url, melde])
  if (!g || !box || !url) return null
  const { xy, vh, s } = svgAbbildung(box)
  const fertig = (ok: boolean) => { setStand(ok ? 'ok' : 'ohne'); melde(false) }
  const balken = massstab(box[2] - box[0])
  return (
    <figure className="bericht-karte">
      <div className="bericht-karte-bild" style={{ aspectRatio: `${VB} / ${vh}` }}>
        {stand !== 'ohne' && <img src={url} alt="" onLoad={() => fertig(true)} onError={() => fertig(false)} />}
        {stand === 'ohne' && <div className="bericht-ohne-bild">ohne Luftbild</div>}
        <svg viewBox={`0 0 ${VB} ${vh}`} aria-label="Knoten und Arme">
          {g.arme.map(a => <polyline key={a.label + 'r'} points={a.linie.map(p => xy(p).join(',')).join(' ')} className="bk-arm-rand" />)}
          {g.arme.map(a => <polyline key={a.label} points={a.linie.map(p => xy(p).join(',')).join(' ')} className="bk-arm" />)}
          {g.arme.map(a => { const [x, y] = xy(a.linie[a.linie.length - 1]); return (
            <g key={a.label + 's'}><circle cx={x} cy={y} r={22} className="bk-schild" /><text x={x} y={y + 8} className="bk-schild-text">{a.label}</text></g>) })}
          <circle cx={xy(g.knoten)[0]} cy={xy(g.knoten)[1]} r={10} className="bk-knoten" />
          <g transform={`translate(20 ${vh - 24})`}>
            <rect x={-6} y={-24} width={balken * s + 12} height={34} rx={4} className="bk-massstab-grund" />
            <line x1={0} y1={0} x2={balken * s} y2={0} className="bk-massstab" />
            <text x={balken * s / 2} y={-8} className="bk-massstab-text">{balken} m</text>
          </g>
        </svg>
      </div>
      <figcaption>Luftbild SWISSIMAGE © swisstopo; Arme aus OpenStreetMap (ODbL). Norden oben.</figcaption>
    </figure>
  )
}
