import { useState, useMemo } from 'react'
import { calculateLSA } from './engine/lsaCalculator'
import type { ArmInput, LSAResult, LevelOfService, StreamResult } from './engine/lsaCalculator'
import { IntersectionSchematic } from './IntersectionSchematic'
import einmuendungSvg from './assets/einmuendung.svg'

// ── Fahrzeugzusammensetzung (VSS 40 023a Ziff. 10.2) ─────────────────────────
interface VehicleMix {
  pctLW: number   // Lastwagen [%]
  pctMR: number   // Motorräder [%]
  pctFR: number   // Leichte Zweiräder [%]
}

function pctPW(mix: VehicleMix): number {
  return Math.max(0, 100 - mix.pctLW - mix.pctMR - mix.pctFR)
}

// PW=1, LW=2, MR=0.5, FR=0.25
function armFactor(mix: VehicleMix | undefined): number {
  if (!mix) return 1.0
  const pw = pctPW(mix)
  const tot = pw + mix.pctLW + mix.pctMR + mix.pctFR
  if (tot <= 0) return 1.0
  return (pw * 1.0 + mix.pctLW * 2.0 + mix.pctMR * 0.5 + mix.pctFR * 0.25) / tot
}

// ── UI-Arm (Fz/h + optionale Zusammensetzung) ─────────────────────────────────
interface UIArmInput {
  name:     string
  left:     number   // [Fz/h]
  straight: number   // [Fz/h]
  right:    number   // [Fz/h]
  mix?:     VehicleMix
}

function toEngineArm(arm: UIArmInput): ArmInput {
  const f = armFactor(arm.mix)
  return {
    name:     arm.name,
    left:     Math.round(arm.left     * f),
    straight: Math.round(arm.straight * f),
    right:    Math.round(arm.right    * f),
  }
}

// ── Farben ────────────────────────────────────────────────────────────────────

const LOS_COLOR: Record<LevelOfService, string> = {
  A: '#16a34a', B: '#65a30d', C: '#ca8a04', D: '#ea580c', E: '#dc2626', F: '#7f1d1d',
}
const LOS_BG: Record<LevelOfService, string> = {
  A: '#dcfce7', B: '#ecfccb', C: '#fef9c3', D: '#ffedd5', E: '#fee2e2', F: '#fecaca',
}

function utilizationColor(x: number): string {
  if (!isFinite(x) || x >= 1) return '#dc2626'
  if (x < 0.70) return '#16a34a'
  if (x < 0.90) return '#ca8a04'
  return '#ea580c'
}

function delayText(w: number): string {
  if (!isFinite(w)) return '> 999 s'
  if (w < 1) return '< 1 s'
  return `${Math.round(w)} s`
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

function NumInput({ value, onChange, min = 0, max = 9999, width = 72 }: {
  value: number; onChange: (v: number) => void; min?: number; max?: number; width?: number
}) {
  return (
    <input type="number" min={min} max={max} value={value}
      onChange={e => onChange(Math.max(min, Math.min(max, Number(e.target.value) || 0)))}
      style={{ width, textAlign: 'right', padding: '3px 6px', borderRadius: 4,
               border: '1px solid #d1d5db', fontSize: 13 }} />
  )
}

function SectionLabel({ title }: { title: string }) {
  return (
    <div style={{ padding: '5px 14px', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em',
                  color: '#6b7280', background: '#f9fafb', borderBottom: '1px solid #f0f0f0',
                  textTransform: 'uppercase' }}>{title}</div>
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

// ── Bewegungen je Arm und Topologie ──────────────────────────────────────────

type Movement = { key: keyof UIArmInput; label: string }

function getMovements(armIndex: number, armCount: 3 | 4): Movement[] {
  if (armCount === 3) {
    if (armIndex === 0) return [
      { key: 'straight', label: 'Geradeaus →C' },
      { key: 'right',    label: 'Rechtsabbiegen →B' },
    ]
    if (armIndex === 1) return [
      { key: 'straight', label: 'Geradeaus →A' },
      { key: 'left',     label: 'Linksabbiegen →B' },
    ]
    return [
      { key: 'left',  label: 'Linkseinbiegen →A' },
      { key: 'right', label: 'Rechtseinbiegen →C' },
    ]
  }
  if (armIndex === 0) return [
    { key: 'straight', label: 'Geradeaus →C' },
    { key: 'right',    label: 'Rechtsabbiegen →B' },
    { key: 'left',     label: 'Linksabbiegen →D' },
  ]
  if (armIndex === 1) return [
    { key: 'straight', label: 'Geradeaus →A' },
    { key: 'left',     label: 'Linksabbiegen →B' },
    { key: 'right',    label: 'Rechtsabbiegen →D' },
  ]
  if (armIndex === 2) return [
    { key: 'left',     label: 'Linkseinbiegen →A' },
    { key: 'right',    label: 'Rechtseinbiegen →C' },
    { key: 'straight', label: 'Kreuzen →D' },
  ]
  return [
    { key: 'right',    label: 'Rechtseinbiegen →A' },
    { key: 'left',     label: 'Linkseinbiegen →C' },
    { key: 'straight', label: 'Kreuzen →B' },
  ]
}

function armLabel(index: number): string {
  return ['A', 'C', 'B', 'D'][index] ?? `${index + 1}`
}

// ── ArmCard ───────────────────────────────────────────────────────────────────

function ArmCard({ arm, index, armCount, onChange }: {
  arm: UIArmInput; index: number; armCount: 3 | 4; onChange: (a: UIArmInput) => void
}) {
  const lbl   = armLabel(index)
  const isHS  = index < 2
  const col   = isHS ? '#1d4ed8' : '#c2410c'
  const bg    = isHS ? '#eff6ff' : '#fff7ed'
  const bd    = isHS ? '#bfdbfe' : '#fed7aa'
  const moves = getMovements(index, armCount)
  const upd   = <K extends keyof UIArmInput>(k: K, v: UIArmInput[K]) => onChange({ ...arm, [k]: v })
  const f     = armFactor(arm.mix)

  const updMix = (k: keyof VehicleMix, v: number) =>
    arm.mix && onChange({ ...arm, mix: { ...arm.mix, [k]: v } })

  return (
    <div style={{ background: '#fff', borderRadius: 10, border: `1.5px solid ${bd}`,
                  overflow: 'hidden', boxShadow: '0 1px 4px #0001' }}>
      <div style={{ background: bg, borderBottom: `1px solid ${bd}`,
                    padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontWeight: 800, fontSize: 17, color: col,
                       background: '#fff', border: `1.5px solid ${bd}`,
                       borderRadius: 6, minWidth: 28, textAlign: 'center', padding: '1px 6px' }}>
          {lbl}
        </span>
        <input type="text" placeholder="Strassenname (optional)" value={arm.name}
          onChange={e => upd('name', e.target.value)}
          style={{ flex: 1, border: 'none', background: 'transparent', fontSize: 14,
                   fontWeight: 600, color: col, outline: 'none' }} />
        <span style={{ fontSize: 11, color: col, fontWeight: 600, opacity: 0.7 }}>
          {isHS ? 'HS' : 'NS'}
        </span>
      </div>

      <SectionLabel title="Knotenströme [Fz/h]" />
      {moves.map(m => (
        <Row key={m.key} label={m.label}>
          <NumInput value={(arm[m.key] as number) ?? 0}
            onChange={v => upd(m.key, v)} />
        </Row>
      ))}

      {/* Fahrzeugzusammensetzung */}
      <SectionLabel title="Fahrzeugzusammensetzung" />
      <Row label="Gemischter Verkehr" sub="LW / MR / FR angeben">
        <input type="checkbox" checked={arm.mix !== undefined}
          onChange={e => onChange({ ...arm, mix: e.target.checked
            ? { pctLW: 5, pctMR: 2, pctFR: 0 } : undefined })}
          style={{ width: 16, height: 16, cursor: 'pointer', accentColor: '#1e3a5f' }} />
      </Row>
      {arm.mix && (
        <>
          {([
            { key: 'pctLW' as const, label: 'Lastwagen LW',       sub: 'f = 2.0 PWE' },
            { key: 'pctMR' as const, label: 'Motorräder MR',       sub: 'f = 0.5 PWE' },
            { key: 'pctFR' as const, label: 'Leichte Zweiräder FR', sub: 'f = 0.25 PWE' },
          ]).map(({ key, label, sub }) => (
            <Row key={key} label={label} sub={sub}>
              <NumInput value={arm.mix![key]} onChange={v => updMix(key, v)} max={100} width={60} />
              <span style={{ fontSize: 12, color: '#9ca3af', minWidth: 16 }}>%</span>
            </Row>
          ))}
          <Row label="Personenwagen PW" sub={`${pctPW(arm.mix).toFixed(0)} % · f = 1.0 PWE`}>
            <span style={{ fontSize: 13, color: '#6b7280', minWidth: 72, textAlign: 'right' }}>
              {pctPW(arm.mix).toFixed(0)} %
            </span>
          </Row>
          <Row label="Umrechnungsfaktor f" sub="Fz/h × f = PWE/h">
            <span style={{ fontSize: 13, fontWeight: 700, color: '#1e3a5f',
                           minWidth: 72, textAlign: 'right' }}>
              {f.toFixed(3)}
            </span>
          </Row>
        </>
      )}
    </div>
  )
}

// ── Streams-Tabelle ───────────────────────────────────────────────────────────

function StreamTable({ streams }: { streams: StreamResult[] }) {
  const active = streams.filter(s => s.Q > 0)
  if (active.length === 0) return null

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
      <thead>
        <tr style={{ background: '#f9fafb', color: '#6b7280', fontWeight: 700 }}>
          {['Strom', 'Q', 'λ', 'L', 'X', 'w_m', 'QS'].map(h => (
            <th key={h} style={{ padding: '5px 8px', textAlign: 'right',
                                  borderBottom: '1px solid #e5e7eb',
                                  ...(h === 'Strom' ? { textAlign: 'left' } : {}) }}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {active.map(s => (
          <tr key={s.id} style={{ borderBottom: '1px solid #f3f4f6',
                                   background: s.isCritical ? '#fffbeb' : undefined }}>
            <td style={{ padding: '4px 8px', fontWeight: s.isCritical ? 700 : 400,
                         color: '#374151' }}>
              {s.id}
              <span style={{ fontSize: 10, color: '#9ca3af', marginLeft: 4 }}>
                {s.label}
              </span>
              {s.isCritical && (
                <span style={{ fontSize: 9, marginLeft: 4, color: '#b45309',
                               background: '#fef3c7', padding: '1px 4px', borderRadius: 3 }}>
                  krit.
                </span>
              )}
            </td>
            <td style={{ padding: '4px 8px', textAlign: 'right' }}>{s.Q}</td>
            <td style={{ padding: '4px 8px', textAlign: 'right' }}>
              {(s.lambda * 100).toFixed(1)}%
            </td>
            <td style={{ padding: '4px 8px', textAlign: 'right' }}>
              {Math.round(s.L)}
            </td>
            <td style={{ padding: '4px 8px', textAlign: 'right',
                         color: utilizationColor(s.X), fontWeight: 600 }}>
              {isFinite(s.X) ? s.X.toFixed(2) : '>1'}
            </td>
            <td style={{ padding: '4px 8px', textAlign: 'right' }}>
              {delayText(s.wm)}
            </td>
            <td style={{ padding: '4px 8px', textAlign: 'right' }}>
              <LOSBadge los={s.los} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ── Ergebnis-Panel ────────────────────────────────────────────────────────────

function ResultsPanel({ result }: { result: LSAResult }) {
  const { Z, sumQKrit, maxQKrit, overloaded, phases, streams, overallLos } = result
  const reserve = maxQKrit - sumQKrit

  return (
    <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #e5e7eb',
                  overflow: 'hidden' }}>

      {/* Gesamt-LOS */}
      <div style={{ padding: '14px 16px', borderBottom: '1px solid #e5e7eb',
                    background: LOS_BG[overallLos] }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em',
                      color: LOS_COLOR[overallLos], textTransform: 'uppercase', marginBottom: 4 }}>
          Qualitätsstufe Knoten
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 48, fontWeight: 800, color: LOS_COLOR[overallLos], lineHeight: 1 }}>
            {overallLos}
          </span>
          <div style={{ fontSize: 12, color: LOS_COLOR[overallLos] }}>
            {overallLos === 'A' && 'Sehr gut — sehr kurze Wartezeiten'}
            {overallLos === 'B' && 'Gut — kurze Wartezeiten'}
            {overallLos === 'C' && 'Zufriedenstellend'}
            {overallLos === 'D' && 'Ausreichend — beträchtliche Wartezeiten'}
            {overallLos === 'E' && 'Mangelhaft — lange Wartezeiten'}
            {overallLos === 'F' && 'Völlig ungenügend — Überlast'}
          </div>
        </div>
      </div>

      {/* Umlaufzeit + ΣQ_krit */}
      <div style={{ padding: '10px 14px', borderBottom: '1px solid #e5e7eb',
                    display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13 }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: overloaded ? '#dc2626' : '#1e3a5f' }}>
            {Z} s
          </div>
          <div style={{ color: '#6b7280', fontSize: 11 }}>Umlaufzeit Z</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: overloaded ? '#dc2626' : '#374151' }}>
            {Math.round(sumQKrit)}
          </div>
          <div style={{ color: '#6b7280', fontSize: 11 }}>ΣQ<sub>krit</sub> [PWE/h]</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 22, fontWeight: 800,
                        color: overloaded ? '#dc2626' : reserve > 100 ? '#16a34a' : '#ca8a04' }}>
            {overloaded ? '—' : `+${Math.round(reserve)}`}
          </div>
          <div style={{ color: '#6b7280', fontSize: 11 }}>Reserve [PWE/h]</div>
        </div>
      </div>

      {overloaded && (
        <div style={{ margin: '8px 12px', padding: '8px 12px', borderRadius: 6,
                      background: '#fee2e2', border: '1px solid #fca5a5',
                      fontSize: 12, color: '#991b1b' }}>
          ΣQ<sub>krit</sub> = {Math.round(sumQKrit)} übersteigt Tabelle-2-Grenzwert
          bei Z = 120 s ({maxQKrit} PWE/h). Knoten überlastet oder mehr Fahrstreifen nötig.
        </div>
      )}

      {/* Phasenübersicht */}
      <div style={{ padding: '8px 12px', borderBottom: '1px solid #e5e7eb' }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em',
                      color: '#6b7280', textTransform: 'uppercase', marginBottom: 8 }}>
          Phasen
        </div>
        {phases.map((ph, i) => (
          <div key={i} style={{ borderRadius: 8, border: '1px solid #e5e7eb',
                                 marginBottom: 6, overflow: 'hidden' }}>
            <div style={{ padding: '6px 10px', background: '#f8fafc',
                          borderBottom: '1px solid #e5e7eb',
                          fontSize: 11, fontWeight: 700, color: '#374151' }}>
              {ph.label}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr',
                          fontSize: 12, padding: '4px 0' }}>
              {[
                ['Q_krit', `${Math.round(ph.qKrit)} PWE/h`],
                ['t_Gr',   `${ph.tGr.toFixed(1)} s`],
                ['λ',      `${(ph.lambda * 100).toFixed(1)}%`],
                ['L',      `${Math.round(ph.L)} PWE/h`],
              ].map(([lbl, val]) => (
                <div key={String(lbl)} style={{ padding: '3px 8px', textAlign: 'center',
                                                borderRight: '1px solid #f3f4f6' }}>
                  <div style={{ color: '#9ca3af', fontSize: 10 }}>{lbl}</div>
                  <div style={{ fontWeight: 600, color: '#374151' }}>{val}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Knotenströme */}
      <div style={{ padding: '8px 12px 12px' }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em',
                      color: '#6b7280', textTransform: 'uppercase', marginBottom: 8 }}>
          Knotenströme
        </div>
        <StreamTable streams={streams} />
      </div>

      {/* Beta-Hinweis */}
      <div style={{ margin: '0 12px 8px', padding: '7px 12px', borderRadius: 6,
                    background: '#fff7ed', border: '1px solid #fed7aa',
                    fontSize: 11, color: '#92400e', fontWeight: 600 }}>
        ⚠ Beta — Resultate mit Vorsicht verwenden.
      </div>

      {/* Methodik-Hinweis */}
      <div style={{ margin: '0 12px 12px', padding: '10px 12px', borderRadius: 8,
                    background: '#f8fafc', border: '1px solid #e2e8f0',
                    fontSize: 11, color: '#64748b', lineHeight: 1.6 }}>
        <strong style={{ color: '#334155' }}>Methodik:</strong> VSS 40 023a, Ziffer 11–12.
        Z aus Tab. 2 (ΣQ<sub>krit</sub> &lt; Q<sub>krit,max</sub>).
        Grünzeiten proportional zu Q<sub>krit</sub> je Phase.
        L = λ·S (S = 1800 PWE/h).
        w<sub>m</sub> = w<sub>1</sub> + w<sub>0</sub>, C = 0,5.
        Umrechnung Fz→PWE nach Ziff. 10.2 (PW=1, LW=2, MR=0.5, FR=0.25).
        Ohne ÖV-Privilegierung, Phasentrennung vollständig.
      </div>
    </div>
  )
}

// ── Standard-Arme ─────────────────────────────────────────────────────────────

function defaultArms(armCount: 3 | 4): UIArmInput[] {
  if (armCount === 3) return [
    { name: '', left: 0,   straight: 400, right: 100 },
    { name: '', left: 100, straight: 400, right: 0 },
    { name: '', left: 200, straight: 0,   right: 150 },
  ]
  return [
    { name: '', left: 100, straight: 400, right: 100 },
    { name: '', left: 100, straight: 400, right: 100 },
    { name: '', left: 150, straight: 200, right: 100 },
    { name: '', left: 150, straight: 200, right: 100 },
  ]
}

// ── Hauptkomponente ───────────────────────────────────────────────────────────

export default function LSAApp() {
  const [armCount,   setArmCount]   = useState<3 | 4>(4)
  const [phaseCount, setPhaseCount] = useState<2 | 3>(3)
  const [arms, setArms]             = useState<UIArmInput[]>(defaultArms(4))

  function handleArmCount(n: 3 | 4) {
    setArmCount(n)
    setArms(defaultArms(n))
  }

  function updateArm(index: number, arm: UIArmInput) {
    setArms(prev => prev.map((a, i) => i === index ? arm : a))
  }

  const result = useMemo<LSAResult>(() =>
    calculateLSA({ armCount, phaseCount, arms: arms.map(toEngineArm) }),
    [armCount, phaseCount, arms]
  )

  const schematic = armCount === 3
    ? <img src={einmuendungSvg} alt="Einmündung" style={{ width: '100%', height: 'auto' }} />
    : <IntersectionSchematic armASeparateLane={false} armCSeparateLane={false} />

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '16px 16px 40px' }}>

      {/* Knotentyp + Phasenplan */}
      <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #e5e7eb',
                    padding: '12px 16px', marginBottom: 16,
                    display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>Knotentyp:</span>
          {([3, 4] as const).map(n => (
            <button key={n} onClick={() => handleArmCount(n)}
              style={{
                padding: '5px 14px', borderRadius: 6, fontSize: 13, fontWeight: 600,
                cursor: 'pointer',
                background: armCount === n ? '#1e3a5f' : '#f3f4f6',
                color:      armCount === n ? '#fff'    : '#374151',
                border: armCount === n ? '1.5px solid #1e3a5f' : '1.5px solid #e5e7eb',
              }}>
              {n === 3 ? 'Einmündung (3-Arm)' : 'Kreuzung (4-Arm)'}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>Phasenplan:</span>
          {([2, 3] as const).map(n => (
            <button key={n} onClick={() => setPhaseCount(n)}
              style={{
                padding: '5px 14px', borderRadius: 6, fontSize: 13, fontWeight: 600,
                cursor: 'pointer',
                background: phaseCount === n ? '#1e3a5f' : '#f3f4f6',
                color:      phaseCount === n ? '#fff'    : '#374151',
                border: phaseCount === n ? '1.5px solid #1e3a5f' : '1.5px solid #e5e7eb',
              }}>
              {n}-phasig
            </button>
          ))}
        </div>

        <span style={{ fontSize: 11, color: '#9ca3af', marginLeft: 'auto' }}>
          Eingabe in Fz/h · Umrechnung in PWE/h per Arm · vollständige Phasentrennung · ohne ÖV
        </span>
      </div>

      <div className="layout-grid">
        {/* Linke Spalte: Schematik + Arm-Cards */}
        <div>
          <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #e5e7eb',
                        padding: 12, marginBottom: 16 }}>
            {schematic}
          </div>
          <div className={`arms-grid${armCount === 4 ? ' arms-grid-4' : ''}`}>
            {arms.map((arm, i) => (
              <ArmCard key={i} arm={arm} index={i} armCount={armCount}
                onChange={a => updateArm(i, a)} />
            ))}
          </div>
        </div>

        {/* Rechte Spalte: Ergebnis-Panel */}
        <div className="results-panel">
          <ResultsPanel result={result} />
        </div>
      </div>
    </div>
  )
}
