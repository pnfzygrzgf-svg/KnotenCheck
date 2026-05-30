import { useState, useMemo } from 'react'
import { calculateRoundabout, computeQKfromTurnings } from './engine/roundaboutCalculator'
import type { RoundaboutType, LevelOfService, EntryResult } from './engine/roundaboutCalculator'
import kreiselSvg from './assets/Kreisel.svg'

// ── Tab. 2: PW-Äquivalente (Motorfahrzeuge pauschal, ohne Fahrrad/Mofa) ───────
export type GradientPCE = '+4%' | '+2%' | '±0%' | '-2%' | '-4%'

const PCE_ENTRY: Record<GradientPCE, number> = {
  '+4%': 1.7, '+2%': 1.4, '±0%': 1.1, '-2%': 1.0, '-4%': 0.9,
}
const PCE_RING = 1.1  // Kreiselfahrbahn: immer ±0%

const GRADIENT_OPTIONS: { value: GradientPCE; label: string }[] = [
  { value: '+4%', label: '+4 % (stark bergauf)' },
  { value: '+2%', label: '+2 % (mässig bergauf)' },
  { value: '±0%', label: '±0 % (eben / pauschal)' },
  { value: '-2%', label: '-2 % (mässig bergab)' },
  { value: '-4%', label: '-4 % (stark bergab)' },
]

// ── Farben ────────────────────────────────────────────────────────────────────

const LOS_COLOR: Record<LevelOfService, string> = {
  A: '#16a34a', B: '#65a30d', C: '#ca8a04', D: '#ea580c', E: '#dc2626', F: '#7f1d1d',
}
const LOS_BG: Record<LevelOfService, string> = {
  A: '#dcfce7', B: '#ecfccb', C: '#fef9c3', D: '#ffedd5', E: '#fee2e2', F: '#fecaca',
}

function delayText(w: number): string {
  if (!isFinite(w)) return '> 999 s'
  if (w < 1) return '< 1 s'
  return `ca. ${Math.round(w)} s`
}

function utilizationColor(x: number): string {
  if (x < 0.70) return '#16a34a'
  if (x < 0.90) return '#ca8a04'
  if (x < 1.00) return '#ea580c'
  return '#dc2626'
}

// ── Kleine Hilfskomponenten ───────────────────────────────────────────────────

function LOSBadge({ los }: { los: LevelOfService }) {
  return (
    <span style={{
      display: 'inline-block', minWidth: 28, textAlign: 'center',
      padding: '2px 8px', borderRadius: 6, fontWeight: 700, fontSize: 13,
      color: LOS_COLOR[los], background: LOS_BG[los],
      border: `1px solid ${LOS_COLOR[los]}44`,
    }}>{los}</span>
  )
}

function NumInput({ value, onChange, min = 0, max = 9999, width = 80 }: {
  value: number; onChange: (v: number) => void; min?: number; max?: number; width?: number
}) {
  return (
    <input type="number" min={min} max={max} value={value}
      onChange={e => onChange(Math.max(min, Math.min(max, Number(e.target.value) || 0)))}
      style={{ width, textAlign: 'right', padding: '3px 6px', borderRadius: 4,
               border: '1px solid #d1d5db', fontSize: 13 }}
    />
  )
}

function Row({ label, sub, children }: { label: string; sub?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8,
                  padding: '7px 14px', borderBottom: '1px solid #f3f4f6' }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, color: '#374151' }}>{label}</div>
        {sub && <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 1 }}>{sub}</div>}
      </div>
      {children}
    </div>
  )
}

function SectionLabel({ title }: { title: string }) {
  return (
    <div style={{ padding: '5px 14px', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em',
                  color: '#6b7280', background: '#f9fafb', borderBottom: '1px solid #f0f0f0',
                  textTransform: 'uppercase' }}>
      {title}
    </div>
  )
}

function UtilBar({ value }: { value: number }) {
  const col = utilizationColor(value)
  return (
    <div style={{ height: 6, borderRadius: 3, background: '#e5e7eb', overflow: 'hidden', margin: '6px 0' }}>
      <div style={{ height: '100%', width: `${Math.min(1, value) * 100}%`, background: col,
                    borderRadius: 3, transition: 'width 0.3s' }} />
    </div>
  )
}

// ── Arm-Eingabe ────────────────────────────────────────────────────────────────

interface ArmInput {
  name: string
  right: number      // 1. Ausfahrt (Rechtsabbieger)  [Fz/h]
  straight: number   // 2. Ausfahrt (Geradeaus)        [Fz/h] — nur 4-Arm
  left: number       // 3. Ausfahrt (Linksabbieger)    [Fz/h]
  fg: number         // Fussgängerquerungen            [FG/h]
  gradient: GradientPCE
}

function defaultArm(): ArmInput {
  return { name: '', right: 0, straight: 0, left: 0, fg: 0, gradient: '±0%' }
}

function ArmCard({ arm, index, armCount, qkFzh, onChange }: {
  arm: ArmInput
  index: number
  armCount: 3 | 4
  qkFzh: number
  onChange: (a: ArmInput) => void
}) {
  const upd = <K extends keyof ArmInput>(k: K, v: ArmInput[K]) => onChange({ ...arm, [k]: v })
  const pce    = PCE_ENTRY[arm.gradient]
  const qeFzh  = arm.right + arm.straight + arm.left
  const qePWE  = Math.round(qeFzh * pce)
  const qkPWE  = Math.round(qkFzh * PCE_RING)

  return (
    <div style={{ border: '1px solid #c7d2e2', borderRadius: 8, overflow: 'hidden', background: '#fff' }}>
      {/* Kopf */}
      <div style={{ background: '#f0f6ff', padding: '10px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontWeight: 700, fontSize: 15, color: '#1d4ed8' }}>Kreiselarm {index + 1}</span>
          <span style={{ fontSize: 11, color: '#6b7280' }}>
            f = {pce.toFixed(1)} · Q_E = {qePWE} PWE/h
          </span>
        </div>
        <input type="text" value={arm.name}
          onChange={e => upd('name', e.target.value)}
          placeholder={`Strassenname Arm ${index + 1}`}
          style={{ width: '100%', padding: '3px 8px', borderRadius: 4,
                   border: '1px solid #bfdbfe', fontSize: 12,
                   background: '#ffffffaa', color: '#374151' }} />
      </div>

      {/* Abbiegeströme */}
      <SectionLabel title={`Abbiegeströme Arm ${index + 1} (Abb. 10)`} />
      <Row label="1. Ausfahrt — rechts" sub={`→ Arm ${(index) % armCount + 1}`}>
        <NumInput value={arm.right} onChange={v => upd('right', v)} />
        <span style={{ fontSize: 11, color: '#9ca3af', width: 36 }}>Fz/h</span>
      </Row>
      {armCount === 4 && (
        <Row label="2. Ausfahrt — geradeaus" sub={`→ Arm ${(index + 1) % armCount + 1}`}>
          <NumInput value={arm.straight} onChange={v => upd('straight', v)} />
          <span style={{ fontSize: 11, color: '#9ca3af', width: 36 }}>Fz/h</span>
        </Row>
      )}
      <Row label={armCount === 4 ? '3. Ausfahrt — links' : '2. Ausfahrt — links'}
           sub={`→ Arm ${(index + (armCount === 4 ? 2 : 1)) % armCount + 1}`}>
        <NumInput value={arm.left} onChange={v => upd('left', v)} />
        <span style={{ fontSize: 11, color: '#9ca3af', width: 36 }}>Fz/h</span>
      </Row>

      {/* Fussgänger */}
      <Row label="Fussgängerquerungen FG"
           sub="Einfluss via f_F (Abb. 3/4). 0 = kein Einfluss">
        <NumInput value={arm.fg} onChange={v => upd('fg', v)} />
        <span style={{ fontSize: 11, color: '#9ca3af', width: 36 }}>FG/h</span>
      </Row>

      {/* Längsneigung */}
      <SectionLabel title="Längsneigung Einfahrt (Tab. 2)" />
      <Row label="Neigung"
           sub="Bestimmt den PW-Äquivalentfaktor für Q_E. Q_K verwendet immer ±0%">
        <select value={arm.gradient}
          onChange={e => upd('gradient', e.target.value as GradientPCE)}
          style={{ fontSize: 13, padding: '3px 6px', borderRadius: 4,
                   border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer' }}>
          {GRADIENT_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </Row>

      {/* Abgeleitete Werte */}
      <SectionLabel title="Abgeleitete Werte" />
      <Row label="Einfahrtsvolumen Q_E"
           sub={`${qeFzh} Fz/h × ${pce.toFixed(1)} (Tab. 2)`}>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#374151', whiteSpace: 'nowrap' }}>
          {qePWE} PWE/h
        </span>
      </Row>
      <Row label="Kreisfahrbahnbelastung Q_K"
           sub={`${Math.round(qkFzh)} Fz/h × ${PCE_RING.toFixed(1)} — aus Abbiegeströmen`}>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#374151', whiteSpace: 'nowrap' }}>
          {qkPWE} PWE/h
        </span>
      </Row>
    </div>
  )
}

// ── Ergebnis-Karte pro Arm ────────────────────────────────────────────────────

function EntryCard({ e, arm, armNumber }: { e: EntryResult; arm: ArmInput; armNumber: number }) {
  const col = utilizationColor(e.utilizationDegree)
  const pct = Math.min(999, Math.round(e.utilizationDegree * 100))
  const overflow = !isFinite(e.delay)

  return (
    <div style={{ background: '#fff', borderRadius: 8, border: '1px solid #e5e7eb',
                  marginBottom: 10, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '10px 14px', borderBottom: '1px solid #f3f4f6' }}>
        <div>
          <span style={{ fontWeight: 700, fontSize: 14, color: '#1e293b' }}>Arm {armNumber}</span>
          {arm.name && <span style={{ fontSize: 12, color: '#6b7280', marginLeft: 8 }}>{arm.name}</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: col }}>{pct} %</span>
          <LOSBadge los={e.levelOfService} />
        </div>
      </div>

      <div style={{ padding: '4px 14px 0' }}>
        <UtilBar value={e.utilizationDegree} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 8px',
                    padding: '8px 14px 10px', fontSize: 12, color: '#6b7280' }}>
        <div>
          <span style={{ color: '#9ca3af' }}>Q_E </span>
          <strong style={{ color: '#374151' }}>{e.qe} PWE/h</strong>
        </div>
        <div>
          <span style={{ color: '#9ca3af' }}>Q_K </span>
          <strong style={{ color: '#374151' }}>{e.qk} PWE/h</strong>
        </div>
        <div>
          <span style={{ color: '#9ca3af' }}>L_E (ohne FG) </span>
          <strong>{Math.round(e.leBase)}</strong>
        </div>
        <div>
          <span style={{ color: '#9ca3af' }}>f_F </span>
          <strong>{e.fF.toFixed(3)}</strong>
        </div>
        <div>
          <span style={{ color: '#9ca3af' }}>L_E (mit FG) </span>
          <strong>{Math.round(e.capacity)} PWE/h</strong>
        </div>
        <div>
          <span style={{ color: '#9ca3af' }}>Reserve R </span>
          <strong style={{ color: e.reserve < 0 ? '#dc2626' : '#16a34a' }}>
            {overflow ? '— (Überlast)' : `${Math.round(e.reserve)} PWE/h`}
          </strong>
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <span style={{ color: '#9ca3af' }}>Wartezeit </span>
          <strong style={{ color: overflow ? '#dc2626' : undefined }}>{delayText(e.delay)}</strong>
          {arm.fg > 0 && (
            <span style={{ marginLeft: 8, color: '#9ca3af' }}>(FG = {arm.fg} FG/h)</span>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Legende ───────────────────────────────────────────────────────────────────

const LEGEND_ITEMS: { abbr: string; unit?: string; desc: string }[] = [
  { abbr: 'Fz/h',    desc: 'Fahrzeuge pro Stunde — Roheingabe Abbiegeströme' },
  { abbr: 'FG/h',    desc: 'Fussgänger pro Stunde am Fussgängerstreifen der Einfahrt' },
  { abbr: 'PWE/h',   desc: 'Personenwageneinheiten pro Stunde — umgerechnet mit dem PW-Äquivalentfaktor f (Tab. 2)' },
  { abbr: 'f',       desc: 'PW-Äquivalentfaktor für die Einfahrt — abhängig von der Längsneigung (Tab. 2); Kreiselfahrbahn Q_K verwendet immer f = 1,1' },
  { abbr: 'Q_E', unit: 'PWE/h', desc: 'Einfahrtsvolumen — Summe aller Abbiegeströme des Arms, umgerechnet mit f (Tab. 2)' },
  { abbr: 'Q_K', unit: 'PWE/h', desc: 'Kreisfahrbahnbelastung — Querschnittsbelastung unmittelbar vor der Einfahrt, berechnet aus den Abbiegeströmen aller Arme (Abb. 10)' },
  { abbr: 'L_E', unit: 'PWE/h', desc: 'Leistungsfähigkeit der Einfahrt — aus Abb. 6: 1141 − 0,578·Q_K (Typ 1/1) resp. 1455 − 0,537·Q_K (Typ 2/1+); mit Fussgänger: L_E × f_F' },
  { abbr: 'f_F',     desc: 'Fussgängerkorrekturfaktor — Reduktion der Einfahrtskapazität durch querenden Fussgängerverkehr; bilinear interpoliert aus Abb. 3 (Typ 1/1) resp. Abb. 4 (Typ 2/1+)' },
  { abbr: 'R',  unit: 'PWE/h', desc: 'Reserve = L_E − Q_E; negativ bedeutet Überlast' },
  { abbr: 'VQS',     desc: 'Verkehrsqualitätsstufe A–F nach Tab. 3 (SN 640 024a): A ≤10s · B ≤20s · C ≤30s · D ≤45s · E >45s · F Überlast' },
]

// ── Hauptkomponente ───────────────────────────────────────────────────────────

export default function RoundaboutApp() {
  const [type, setType]         = useState<RoundaboutType>('1/1')
  const [armCount, setArmCount] = useState<3 | 4>(4)
  const [nodeName, setNodeName] = useState('')
  const [showLegend, setShowLegend] = useState(false)
  const [arms, setArms]         = useState<ArmInput[]>([
    defaultArm(), defaultArm(), defaultArm(), defaultArm(),
  ])

  const setArm = (i: number, arm: ArmInput) =>
    setArms(prev => { const a = [...prev]; a[i] = arm; return a })

  const activeArms = arms.slice(0, armCount)

  // Q_K aus Abbiegeströmen (Fz/h) — Formel: Abb. 10 / Herleitung Ring-Querschnitt
  const qkFzh = useMemo(() => computeQKfromTurnings(
    activeArms.map(a => a.right),
    activeArms.map(a => a.straight),
    activeArms.map(a => a.left),
    armCount,
  ), [armCount, JSON.stringify(activeArms.map(a => [a.right, a.straight, a.left]))])

  const result = useMemo(() => {
    const qe = activeArms.map(a =>
      Math.round((a.right + a.straight + a.left) * PCE_ENTRY[a.gradient])
    )
    const qk = qkFzh.map(v => Math.round(v * PCE_RING))
    const fg = activeArms.map(a => a.fg)
    if (qe.every(v => v === 0)) return null
    return calculateRoundabout({ type, qe, qk, fg })
  }, [type, armCount, JSON.stringify(activeArms), JSON.stringify(qkFzh)])

  const overall = result?.overallLevelOfService

  return (
    <main style={{ maxWidth: 1100, margin: '0 auto', padding: '20px 16px' }}>

      {/* Knoten-Konfiguration */}
      <div style={{ background: '#fff', borderRadius: 10, padding: '12px 20px',
                    marginBottom: 16, boxShadow: '0 1px 3px #0001',
                    display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <input type="text" value={nodeName}
          onChange={e => setNodeName(e.target.value)}
          placeholder="Bezeichnung des Kreisverkehrs"
          style={{ flexBasis: '100%', padding: '5px 10px', borderRadius: 5,
                   border: '1px solid #d1d5db', fontSize: 14, fontWeight: 600, color: '#1e293b' }} />

        <span style={{ fontWeight: 600, fontSize: 14, color: '#374151' }}>Typ</span>
        {(['1/1', '2/1+'] as const).map(t => (
          <button key={t} onClick={() => setType(t)}
            style={{ padding: '5px 18px', borderRadius: 6, fontSize: 13, cursor: 'pointer',
                     fontWeight: type === t ? 700 : 400,
                     background: type === t ? '#1e3a5f' : '#f3f4f6',
                     color: type === t ? '#fff' : '#374151',
                     border: type === t ? '1px solid #1e3a5f' : '1px solid #d1d5db' }}>
            {t === '1/1' ? 'Typ 1/1 — einstreifig' : 'Typ 2/1+ — zweistreifige Einfahrt'}
          </button>
        ))}

        <span style={{ fontWeight: 600, fontSize: 14, color: '#374151', marginLeft: 8 }}>Arme</span>
        {([3, 4] as const).map(n => (
          <button key={n} onClick={() => setArmCount(n)}
            style={{ padding: '5px 18px', borderRadius: 6, fontSize: 13, cursor: 'pointer',
                     fontWeight: armCount === n ? 700 : 400,
                     background: armCount === n ? '#1e3a5f' : '#f3f4f6',
                     color: armCount === n ? '#fff' : '#374151',
                     border: armCount === n ? '1px solid #1e3a5f' : '1px solid #d1d5db' }}>
            {n} Arme
          </button>
        ))}
      </div>

      {/* Hauptlayout */}
      <div className="layout-grid">

        {/* Arm-Karten */}
        <div className={`arms-grid${armCount === 4 ? ' arms-grid-4' : ''}`}>
          {activeArms.map((arm, i) => (
            <ArmCard key={i} arm={arm} index={i} armCount={armCount}
                     qkFzh={qkFzh[i]} onChange={a => setArm(i, a)} />
          ))}
        </div>

        {/* Ergebnisse (sticky) */}
        <div className="results-panel"
             style={{ background: '#fff', borderRadius: 10, padding: 20,
                      boxShadow: '0 1px 3px #0001' }}>

          {/* Schematik */}
          <div style={{ marginBottom: 16, borderRadius: 8, overflow: 'hidden',
                        border: '1px solid #e5e7eb', background: '#fafafa', padding: 8 }}>
            <img src={kreiselSvg} alt="Kreisverkehr Schema"
              style={{ width: '100%', height: 'auto', display: 'block',
                       maxHeight: 260, objectFit: 'contain' }} />
          </div>

          {/* Beta-Hinweis */}
          <div style={{ marginBottom: 14, padding: '7px 12px', borderRadius: 6,
                        background: '#fff7ed', border: '1px solid #fed7aa',
                        fontSize: 11, color: '#92400e', fontWeight: 600 }}>
            ⚠ Beta — Resultate mit Vorsicht verwenden.
          </div>

          {overall && (
            <>
              {/* Gesamtbeurteilung */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            padding: '14px 16px', borderRadius: 10, marginBottom: 16,
                            background: LOS_BG[overall],
                            border: `1px solid ${LOS_COLOR[overall]}44` }}>
                <div>
                  <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 2 }}>
                    Gesamtbeurteilung · SN 640 024a
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#1e293b' }}>
                    Qualitätsstufe {overall}
                  </div>
                  <div style={{ fontSize: 11, color: '#6b7280', marginTop: 1 }}>
                    (schlechteste Einfahrt)
                  </div>
                </div>
                <LOSBadge los={overall} />
              </div>

              <div style={{ fontSize: 12, fontWeight: 600, color: '#6b7280',
                            textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                Einfahrten
              </div>
              {result!.entries.map((e, i) => (
                <EntryCard key={i} e={e} arm={activeArms[i]} armNumber={i + 1} />
              ))}

              {/* Methodik */}
              <div style={{ marginTop: 16, padding: '10px 13px', borderRadius: 8,
                            background: '#f8fafc', border: '1px solid #e2e8f0',
                            fontSize: 11, color: '#475569', lineHeight: 1.65 }}>
                <div style={{ fontWeight: 700, color: '#1e293b', marginBottom: 4 }}>
                  Methodik (SN 640 024a)
                </div>
                <div><strong>Eingabe</strong> Abbiegeströme pro Arm (Abb. 10): 1./2./3. Ausfahrt [Fz/h]</div>
                <div><strong>Q_E</strong> = Summe Abbiegeströme × f (Tab. 2, Längsneigung)</div>
                <div><strong>Q_K</strong> = Querschnitt vor Einfahrt, berechnet aus Abbiegeströmen × 1,1</div>
                <div><strong>L_E</strong> nach Abb. 6: 1141 − 0,578·Q_K (1/1) resp. 1455 − 0,537·Q_K (2/1+)</div>
                <div><strong>f_F</strong> nach Abb. 3/4 — bilinear interpoliert</div>
                <div><strong>Wartezeit</strong> nach Kimber &amp; Hollis (Ref. [10]), T = 1,0 h</div>
                <div><strong>VQS</strong> nach Tab. 3: A ≤ 10 s · B ≤ 20 s · C ≤ 30 s · D ≤ 45 s · E &gt; 45 s · F = Überlast</div>
              </div>
            </>
          )}

          {/* Legende */}
          <div style={{ marginTop: 12 }}>
            <button onClick={() => setShowLegend(v => !v)}
              style={{ width: '100%', textAlign: 'left', padding: '7px 12px',
                       borderRadius: 6, border: '1px solid #e2e8f0', background: '#f8fafc',
                       fontSize: 11, fontWeight: 600, color: '#475569', cursor: 'pointer',
                       display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>Legende — Abkürzungen</span>
              <span style={{ fontSize: 10, color: '#94a3b8' }}>{showLegend ? '▲' : '▼'}</span>
            </button>
            {showLegend && (
              <div style={{ border: '1px solid #e2e8f0', borderTop: 'none', borderRadius: '0 0 6px 6px',
                            background: '#fff', overflow: 'hidden' }}>
                {LEGEND_ITEMS.map(item => (
                  <div key={item.abbr}
                    style={{ display: 'flex', gap: 8, padding: '6px 12px',
                             borderBottom: '1px solid #f1f5f9', alignItems: 'baseline' }}>
                    <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 12,
                                   color: '#1e40af', whiteSpace: 'nowrap', minWidth: 60 }}>
                      {item.abbr}{item.unit && <span style={{ fontWeight: 400, color: '#94a3b8' }}> [{item.unit}]</span>}
                    </span>
                    <span style={{ fontSize: 11, color: '#475569', lineHeight: 1.5 }}>{item.desc}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {!overall && (
            <p style={{ color: '#9ca3af', textAlign: 'center', padding: 32 }}>
              Bitte Abbiegeströme eingeben.
            </p>
          )}
        </div>
      </div>

      <footer style={{ fontSize: 11, color: '#9ca3af', textAlign: 'center', marginTop: 24, lineHeight: 2 }}>
        Berechnung nach SN 640 024a (VSS). Die Ergebnisse ersetzen keine Überprüfung durch eine Fachperson.
      </footer>
    </main>
  )
}
