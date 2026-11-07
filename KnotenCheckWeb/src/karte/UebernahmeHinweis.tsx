// Hinweis oben im Rechner nach der Übernahme aus der Karte: Was kam mit, was fehlt noch. Die Zuordnung der Arme steht hier ausdrücklich,
// weil eine falsche Reihenfolge alle Abbiegeströme vertauscht.

import { useState } from 'react'
import { belegtFuer, type KnotenUebernahme, type RechnerKey } from './rechner'

export default function UebernahmeHinweis({ u, rechner }: { u: KnotenUebernahme; rechner: RechnerKey }) {
  const [zu, setZu] = useState(false)
  if (zu) return null
  const zeilen = [...belegtFuer(u, rechner), ...u.hinweise]
  return (
    <div role="status" className="hinweis" style={{ marginBottom: 14, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      <div style={{ flex: 1 }}>
        <strong>Aus der Karte übernommen: {u.name}.</strong>{' '}
        Armzahl, Reihenfolge und Namen stammen aus OpenStreetMap, {u.arme.some(a => a.stroeme) ? 'die Abbiegeströme sind Modellwerte: bitte alles prüfen.' : 'die Abbiegeströme fehlen: bitte eingeben oder auf der Karte den Vorschlag aus dem Modell wählen, und alles prüfen.'}
        <div style={{ marginTop: 4 }}>{u.arme.map(a => `${a.label}: ${a.name} (${a.himmel})`).join(' · ')}</div>
        {zeilen.length > 0 && (
          <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>{zeilen.map(h => <li key={h}>{h}</li>)}</ul>
        )}
      </div>
      <button onClick={() => setZu(true)} aria-label="Hinweis schliessen"
        style={{ border: 0, background: 'none', cursor: 'pointer', fontSize: 15, color: 'var(--text-strong)', lineHeight: 1 }}>✕</button>
    </div>
  )
}
