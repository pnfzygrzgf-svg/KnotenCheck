// Ergebnis-Panel der Stochastik-Simulation (Wartezeit-Verteilungen je Strom)

import { HIST_EDGES } from './engine/stochasticSN640022'
import type { StochasticSN640022Result } from './engine/stochasticSN640022'
import type { LevelOfService } from './engine/types'
import { classifyLOS } from './engine/levelOfService'
import { LOSBadge } from './ui'
import { streamMovementName } from './ArmCard'

// Farbe je Histogramm-Bin (an HIST_EDGES gekoppelt)
export const HIST_LOS_COLOR: string[] = [
  '#16a34a', '#65a30d', '#ca8a04', '#ea580c', '#dc2626', '#dc2626', '#7f1d1d', '#7f1d1d',
]

export function SimHistBar({ freq, label }: { freq: number[]; label: string }) {
  const maxFreq = Math.max(...freq, 0.01)
  const binLabels = HIST_EDGES.slice(0, -1).map((lo, i) => {
    const hi = HIST_EDGES[i + 1]
    return hi === Infinity ? `>${lo}s` : `${lo}–${hi}s`
  })
  return (
    <div>
      <div style={{ fontSize: 10, color: '#9ca3af', marginBottom: 3 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 36 }}>
        {freq.map((f, i) => (
          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column',
                                alignItems: 'center', gap: 1 }}>
            <div title={binLabels[i]} style={{
              width: '100%', borderRadius: '2px 2px 0 0',
              height: `${Math.max(2, (f / maxFreq) * 32)}px`,
              background: HIST_LOS_COLOR[i] + 'cc',
            }} />
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 2, marginTop: 2 }}>
        {binLabels.map((lbl, i) => (
          <div key={i} style={{ flex: 1, fontSize: 8, color: '#9ca3af',
                                textAlign: 'center', lineHeight: 1.2,
                                overflow: 'hidden', whiteSpace: 'nowrap' }}>
            {lbl}
          </div>
        ))}
      </div>
    </div>
  )
}

// QS aus simulierter mittlerer Wartezeit — Tab.-3-Schwellen der SN 640 022;
// Auslastungsgrad ist in der Simulation nicht definiert, daher 0.
export function simLOS(mean: number): LevelOfService {
  return classifyLOS(mean, 0)
}

export function StochasticPanel({ result }: { result: StochasticSN640022Result }) {
  const streams = result.streams.filter(s => s.stats !== null)

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 8 }}>
        {result.runs} Simulationsläufe · {Math.round(result.durationMs)} ms
      </div>

      {streams.map(s => {
        const st = s.stats!
        const los = simLOS(st.mean)

        return (
          <div key={s.streamNumber} style={{
            marginBottom: 10, padding: '10px 12px', borderRadius: 7,
            background: '#fff', border: '1px solid #e5e7eb',
          }}>
            {/* Kopf */}
            <div style={{ display: 'flex', justifyContent: 'space-between',
                          alignItems: 'center', marginBottom: 6 }}>
              <div>
                <span style={{ fontWeight: 700, fontSize: 13 }}>
                  {streamMovementName(s.streamNumber)}
                </span>
                <span style={{ fontSize: 11, color: '#9ca3af', marginLeft: 8 }}>
                  Rg {s.rang} · qpi = {Math.round(s.qpi)} Fz/h
                </span>
              </div>
              <LOSBadge los={los} />
            </div>

            {/* Kennwerte */}
            <div style={{ display: 'flex', gap: 16, fontSize: 12,
                          color: '#374151', marginBottom: 8, flexWrap: 'wrap' }}>
              <div>
                <span style={{ color: '#9ca3af' }}>Mittelwert </span>
                <strong>{Math.round(st.mean)} s</strong>
              </div>
              <div>
                <span style={{ color: '#9ca3af' }}>±σ </span>
                <strong>{Math.round(st.stdDev)} s</strong>
              </div>
              <div>
                <span style={{ color: '#9ca3af' }}>P50 </span>
                <strong>{Math.round(st.p50)} s</strong>
              </div>
              <div>
                <span style={{ color: '#9ca3af' }}>P85 </span>
                <strong>{Math.round(st.p85)} s</strong>
              </div>
              <div>
                <span style={{ color: '#9ca3af' }}>P95 </span>
                <strong>{Math.round(st.p95)} s</strong>
              </div>
              <div>
                <span style={{ color: '#9ca3af' }}>n = </span>
                <strong>{st.n.toLocaleString()}</strong>
              </div>
            </div>

            {/* Histogramm */}
            <SimHistBar freq={st.freq} label="Verteilung der Wartezeiten" />
          </div>
        )
      })}

      <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 4 }}>
        Histogramm-Farben: grün = QS A–B (&lt;20 s) · gelb/orange = QS C–D · rot = QS E–F (&gt;45 s)
      </div>
    </div>
  )
}
