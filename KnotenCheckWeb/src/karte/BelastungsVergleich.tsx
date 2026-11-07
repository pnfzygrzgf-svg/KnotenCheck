// Vergleich neben den Eingaben: Querschnitt aus den eingegebenen Strömen gegen Modell und Zählung. Keine Wirkung auf die Rechnung.

import { abweichung, ABWEICHUNG_HOCH, ABWEICHUNG_TIEF, lokalTitel, type ArmVergleich, type Querschnitt } from './vergleich'

const zahl = (x: number | null) => (x === null ? '–' : x.toLocaleString('de-CH'))
const TH = { padding: '3px 8px', textAlign: 'right', fontWeight: 600, color: 'var(--text-muted)', fontSize: 12 } as const
const TD = { padding: '3px 8px', textAlign: 'right', borderTop: '1px solid var(--kachel-rand)' } as const
const GRUPPE = { ...TH, textAlign: 'center', borderBottom: '1px solid var(--border)' } as const
const LOKAL = { borderLeft: '1px solid var(--border)' } as const
const faktor = (x: number) => String(x).replace('.', ',')

export default function BelastungsVergleich({ vergleich, querschnitte }: { vergleich: ArmVergleich[]; querschnitte: Querschnitt[] }) {
  if (!vergleich.some(v => v.dtv !== null || v.lokalDtv !== null)) return null
  const lokal = [...new Set(vergleich.map(v => v.lokalQuelle).filter(q => q))]
  return (
    <details style={{ background: '#fff', border: '1px solid var(--kachel-rand)', borderRadius: 8, padding: '8px 12px', marginBottom: 14, fontSize: 14, textAlign: 'left' }}>
      <summary style={{ cursor: 'pointer', fontWeight: 600, color: 'var(--accent)' }}>Belastung zum Vergleich (ohne Wirkung auf die Rechnung)</summary>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 6 }}>
          <thead>
            <tr>
              <th rowSpan={2} style={{ ...TH, textAlign: 'left', verticalAlign: 'bottom' }}>Arm</th>
              <th rowSpan={2} style={{ ...TH, verticalAlign: 'bottom' }}>Eingabe [Fz/h]</th>
              <th colSpan={3} style={GRUPPE}>Modell NPVM (Bund)</th>
              <th style={{ ...GRUPPE, ...LOKAL }}>{lokalTitel(vergleich)}</th>
            </tr>
            <tr>
              <th style={TH}>Morgen [Fz/h]</th><th style={TH}>Abend [Fz/h]</th><th style={TH}>DTV [Fz/Tag]</th>
              <th style={{ ...TH, ...LOKAL }}>DTV [Fz/Tag]</th>
            </tr>
          </thead>
          <tbody>
            {vergleich.map((v, i) => {
              const q = querschnitte[i]?.summe ?? 0
              const a = abweichung(q, v)
              return (
                <tr key={v.label}>
                  <td style={{ ...TD, textAlign: 'left' }}>{v.label} {v.name}</td>
                  <td style={{ ...TD, fontWeight: a ? 700 : 400, color: a ? '#b45309' : undefined }}
                    title={a ? `Eingabe ${a === 'hoch' ? 'deutlich über' : 'deutlich unter'} dem Modell` : undefined}>{q > 0 ? zahl(q) : '–'}</td>
                  <td style={TD}>{zahl(v.msp)}</td><td style={TD}>{zahl(v.asp)}</td><td style={TD}>{zahl(v.dtv)}</td><td style={{ ...TD, ...LOKAL }} title={v.lokalQuelle ?? undefined}>{zahl(v.lokalDtv)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
        Eingabe: Summe der eingegebenen Ströme je Arm, zum Knoten und vom Knoten weg. Modell: NPVM des Bundes, berechnet, nicht gezählt;
        Morgen 7–8 Uhr, Abend 17–18 Uhr.{lokal.length > 0 && ` Lokal: ${lokal.join(', ')}.`} Alle Werte gelten für beide Richtungen zusammen, bei getrennten Fahrbahnen je Fahrbahn.
        Hervorgehoben ist eine Eingabe unter dem {faktor(ABWEICHUNG_TIEF)}-Fachen des tieferen oder über dem {faktor(ABWEICHUNG_HOCH)}-Fachen des höheren Stundenwerts (Annahme).
        Das ist ein Hinweis zum Nachschauen, kein Fehler: Auch das Modell kann falsch liegen.
      </p>
    </details>
  )
}
