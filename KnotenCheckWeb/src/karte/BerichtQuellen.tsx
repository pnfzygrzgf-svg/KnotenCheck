// Quellen im Druckblatt: Quelle | Für | Anbieter | Stand | Lizenz wie in den anderen Rechnern, nur was der Rechner aus der Karte übernommen hat.
// Kartenebenen stehen nicht darin, sie wirken nicht auf die Rechnung.

import type { CSSProperties } from 'react'
import type { BerichtQuelle } from './rechner'

const TITEL: CSSProperties = { fontWeight: 700, fontSize: 11, margin: '14px 0 3px', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#333' }
const TABELLE: CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: 10, marginBottom: 4 }
const KOPF: CSSProperties = { border: '1px solid #555', padding: '2px 6px', background: '#d8d8d8', fontWeight: 700, textAlign: 'left' }
const ZELLE: CSSProperties = { border: '1px solid #999', padding: '2px 6px', verticalAlign: 'top' }

export default function BerichtQuellen({ zeilen }: { zeilen: readonly BerichtQuelle[] }) {
  if (!zeilen.length) return null
  return (
    <section style={{ breakInside: 'avoid' }}>
      <div style={TITEL}>Quellen</div>
      <table style={TABELLE}>
        <thead><tr>{['Quelle', 'Für', 'Anbieter', 'Stand', 'Lizenz'].map(t => <th key={t} style={KOPF}>{t}</th>)}</tr></thead>
        <tbody>{zeilen.map(z => <tr key={z.quelle}>
          <td style={ZELLE}>{z.url ? <a href={z.url}>{z.quelle}</a> : z.quelle}</td><td style={ZELLE}>{z.fuer}</td><td style={ZELLE}>{z.anbieter}</td>
          <td style={ZELLE}>{z.stand}</td><td style={ZELLE}>{z.lizenz}</td>
        </tr>)}</tbody>
      </table>
      <div style={{ fontSize: 9, color: '#555' }}>Vorbelegung aus der Karte. Von Hand geänderte Werte sind hier nicht vermerkt. Abbiegeströme sind Eingaben.</div>
    </section>
  )
}
