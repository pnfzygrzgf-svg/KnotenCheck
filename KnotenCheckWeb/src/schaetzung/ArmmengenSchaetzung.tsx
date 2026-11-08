// Eingabe der gezählten Armmengen in allen Rechnern; «Schätzen und übernehmen» setzt die Abbiegeströme des Rechners.

import { useState } from 'react'
import { FAHRBEZIEHUNGEN, zielIndex, type Fahrbeziehung, type Richtung } from '../engine/armmengen'
import { leereArmMengen, schaetzen, type ArmMengenEingabe, type ArmmengenEingabe, type Modus, type Schaetzung } from './schaetzung'

const FB_KURZ: Record<Fahrbeziehung, string> = { left: 'links', straight: 'geradeaus', right: 'rechts' }
const RICHTUNG_TEXT: Record<Richtung, string> = { beide: 'beide Richtungen', zu: 'nur zum Knoten (Einbahn)', weg: 'nur vom Knoten weg (Einbahn)' }

function Zahl({ wert, onChange, label }: { wert: number | null; onChange: (x: number | null) => void; label: string }) {
  return <input type="number" inputMode="decimal" min={0} max={20000} value={wert ?? ''} aria-label={label}
    onChange={e => { const t = e.target.value; const n = Number(t); onChange(t === '' || !Number.isFinite(n) || n < 0 ? null : n) }}
    style={{ width: 80, textAlign: 'right', padding: '3px 6px' }} />
}

export default function ArmmengenSchaetzung({ labels, namen, kreisel, hauptstrasse = false, stand, onAnwenden }: {
  labels: readonly string[]
  namen?: readonly string[]
  kreisel: boolean
  /** A und C sind Hauptstrasse, B und D Nebenstrasse: eigene Startanteile je Strasse */
  hauptstrasse?: boolean
  stand: Schaetzung | null
  onAnwenden: (s: Schaetzung) => void
}) {
  const n = labels.length
  const eingabeAus = (s: Schaetzung | null): ArmmengenEingabe =>
    s?.eingabe.arme.length === n ? s.eingabe : { modus: 'gerichtet', arme: leereArmMengen(n) }
  const [eingabe, setEingabe] = useState<ArmmengenEingabe>(() => eingabeAus(stand))
  // Keine Vorgabe: Die Art der Zählung wählt man selbst
  const [gewaehlt, setGewaehlt] = useState(!!stand)
  const [meldung, setMeldung] = useState<string | null>(null)
  // Kommt ein anderer Stand von aussen (Datei geladen, Rechner zurückgesetzt), zeigt das Formular dessen Mengen.
  // Die eigene Übernahme ist schon bekannt und lässt laufende Eingaben stehen.
  const [bekannt, setBekannt] = useState(stand)
  if (stand !== bekannt) {
    setBekannt(stand)
    setEingabe(eingabeAus(stand))
    setGewaehlt(!!stand)
    setMeldung(null)
  }
  const arme = eingabe.arme.length === n ? eingabe.arme : leereArmMengen(n)
  const setArm = (i: number, a: Partial<ArmMengenEingabe>) => { setMeldung(null); setEingabe(e => ({ ...e, arme: arme.map((x, k) => (k === i ? { ...x, ...a } : x)) })) }
  const setModus = (modus: Modus) => { setMeldung(null); setGewaehlt(true); setEingabe(e => ({ ...e, modus, arme })) }

  function anwenden() {
    const r = schaetzen({ ...eingabe, arme }, labels, kreisel, hauptstrasse)
    if ('fehler' in r) { setMeldung(r.fehler); return }
    setMeldung(null)
    setBekannt(r.schaetzung)
    onAnwenden(r.schaetzung)
  }

  const th = { textAlign: 'left' as const, fontWeight: 600, fontSize: 12, color: 'var(--text-muted)', padding: '4px 8px' }
  const td = { padding: '4px 8px', verticalAlign: 'middle' as const }
  return (
    <details className="kachel" style={{ padding: '12px 20px', marginBottom: 16 }} open={!!stand}>
      <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: 14, color: 'var(--text)' }}>Abbiegeströme aus gezählten Armmengen schätzen</summary>
      <p className="klein" style={{ margin: '8px 0' }}>Wer je Arm gezählt hat, bekommt hier einen Vorschlag für die Abbiegeströme: feste Anteile links, geradeaus und
        rechts{hauptstrasse && !kreisel ? ', an Haupt- und Nebenstrasse verschieden' : ''}, auf die gezählten Mengen ausgeglichen. Es sind Schätzwerte, nicht gezählt; eine Knotenstromzählung ist genauer. Mengen in Fz/h für die
        Stunde, die gerechnet wird.</p>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13, marginBottom: 8 }}>
        <label><input type="radio" checked={gewaehlt && eingabe.modus === 'gerichtet'} onChange={() => setModus('gerichtet')} /> Zu- und Wegfahrt je Arm</label>
        <label><input type="radio" checked={gewaehlt && eingabe.modus === 'querschnitt'} onChange={() => setModus('querschnitt')} /> Nur Querschnitt (beide Richtungen zusammen)</label>
      </div>
      {gewaehlt && eingabe.modus === 'querschnitt' && <p className="klein" style={{ margin: '0 0 8px', color: '#92400e' }}>Ohne Richtungen werden beide je zur Hälfte
        angenommen. Der Vorschlag ist dann deutlich ungenauer; wenn möglich Zu- und Wegfahrt getrennt eingeben.</p>}
      {gewaehlt && <><div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              <th style={th}>Arm</th>
              {eingabe.modus === 'gerichtet' ? <><th style={th}>Zufahrt [Fz/h]</th><th style={th}>Wegfahrt [Fz/h]</th></>
                : <><th style={th}>Querschnitt [Fz/h]</th><th style={th}>Richtung</th></>}
              <th style={th}>Fahrbeziehung ausgeschlossen</th>
            </tr>
          </thead>
          <tbody>
            {labels.map((l, i) => {
              const a = arme[i], name = namen?.[i]
              return (
                <tr key={l}>
                  <td style={td}><b>{l}</b>{name ? <span className="klein"> {name}</span> : null}</td>
                  {eingabe.modus === 'gerichtet' ? <>
                    <td style={td}><Zahl wert={a.zu} onChange={x => setArm(i, { zu: x })} label={`Arm ${l} Zufahrt`} /></td>
                    <td style={td}><Zahl wert={a.weg} onChange={x => setArm(i, { weg: x })} label={`Arm ${l} Wegfahrt`} /></td>
                  </> : <>
                    <td style={td}><Zahl wert={a.q} onChange={x => setArm(i, { q: x })} label={`Arm ${l} Querschnitt`} /></td>
                    <td style={td}>
                      <select value={a.richtung} onChange={e => setArm(i, { richtung: e.target.value as Richtung })} aria-label={`Arm ${l} Richtung`}>
                        {(Object.keys(RICHTUNG_TEXT) as Richtung[]).map(r => <option key={r} value={r}>{RICHTUNG_TEXT[r]}</option>)}
                      </select>
                    </td>
                  </>}
                  <td style={td}>
                    {FAHRBEZIEHUNGEN.filter(f => zielIndex(labels, i, f, kreisel) !== null).map(f => (
                      <label key={f} style={{ marginRight: 10, whiteSpace: 'nowrap' }}>
                        <input type="checkbox" checked={a.verboten.includes(f)}
                          onChange={e => setArm(i, { verboten: e.target.checked ? [...a.verboten, f] : a.verboten.filter(x => x !== f) })} /> {FB_KURZ[f]}
                      </label>
                    ))}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div style={{ marginTop: 10, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" className="knopf" onClick={anwenden}>Schätzen und übernehmen</button>
        <span className="klein">Überschreibt die Abbiegeströme aller Arme.</span>
      </div></>}
      {meldung && <p className="klein" style={{ color: '#b91c1c', marginBottom: 0 }}>{meldung}</p>}
      {stand && !meldung && <p className="klein" style={{ marginBottom: 0 }}><span className="herkunft-marke herkunft-marke-S">geschätzt</span> {stand.text}</p>}
    </details>
  )
}
