import { useState, useMemo } from 'react'
import einmuendungSvg from './assets/einmuendung.svg'
import kreuzungSvg   from './assets/kreuzung.svg'
import { analyzeSN640022 } from './engine/sn640022Calculator'
import {
  defaultIntersection, toSNVolumes, toSNLaneFlags, armLabel, totalVolume,
  pctPW, armFactor,
} from './engine/armConfiguration'
import type {
  IntersectionConfiguration, ArmConfiguration,
  GradientCategory, VehicleCategoryMix,
} from './engine/armConfiguration'
import type { SN640022Result, SN640022StreamResult, SN640022MixedResult, LevelOfService, MixedLaneCombination } from './engine/types'
import './App.css'

// ── Farben ─────────────────────────────────────────────────────────────────────

const LOS_COLOR: Record<LevelOfService, string> = {
  A: '#16a34a', B: '#65a30d', C: '#ca8a04', D: '#ea580c', E: '#dc2626', F: '#7f1d1d',
}
const LOS_BG: Record<LevelOfService, string> = {
  A: '#dcfce7', B: '#ecfccb', C: '#fef9c3', D: '#ffedd5', E: '#fee2e2', F: '#fecaca',
}

// ── Konstanten ─────────────────────────────────────────────────────────────────

const GRADIENT_OPTIONS: { value: GradientCategory; label: string }[] = [
  { value: '+4%', label: '+4 % (stark bergauf)' },
  { value: '+2%', label: '+2 % (mässig bergauf)' },
  { value: '±0%', label: '±0 % (eben)' },
  { value: '-2%', label: '-2 % (mässig bergab)' },
  { value: '-4%', label: '-4 % (stark bergab)' },
]

const MIXED_OPTIONS: { value: MixedLaneCombination; labelB: string; labelD: string; desc: string }[] = [
  { value: 'all',            labelB: 'Alle geteilt (4+5+6)', labelD: 'Alle geteilt (10+11+12)', desc: 'Alle NS-Ströme auf gemeinsamem Streifen' },
  { value: 'leftAndThrough', labelB: 'Links+Kreuzen (4+5)',  labelD: 'Links+Kreuzen (10+11)',   desc: 'Rechtseinbieger auf eigenem Streifen' },
  { value: 'throughAndRight',labelB: 'Kreuzen+Rechts (5+6)', labelD: 'Kreuzen+Rechts (11+12)', desc: 'Linkseinbieger auf eigenem Streifen' },
]

// Bewegungs-Labels je Arm und Knotentyp
function getMovements(index: number, armCount: number): { label: string; key: keyof ArmConfiguration }[] {
  if (armCount === 3) {
    if (index === 0) return [
      { label: 'Geradeaus →C',     key: 'straightVolume' },
      { label: 'Rechtsabbiegen →B', key: 'rightVolume' },
    ]
    if (index === 1) return [
      { label: 'Geradeaus →A',     key: 'straightVolume' },
      { label: 'Linksabbiegen →B', key: 'leftVolume' },
    ]
    return [
      { label: 'Linkseinbiegen →A', key: 'leftVolume' },
      { label: 'Rechtseinbiegen →C', key: 'rightVolume' },
    ]
  }
  if (index === 0) return [
    { label: 'Geradeaus →C',     key: 'straightVolume' },
    { label: 'Rechtsabbiegen →B', key: 'rightVolume' },
    { label: 'Linksabbiegen →D', key: 'leftVolume' },
  ]
  if (index === 1) return [
    { label: 'Geradeaus →A',     key: 'straightVolume' },
    { label: 'Linksabbiegen →B', key: 'leftVolume' },
    { label: 'Rechtsabbiegen →D', key: 'rightVolume' },
  ]
  if (index === 2) return [
    { label: 'Linkseinbiegen →A', key: 'leftVolume' },
    { label: 'Rechtseinbiegen →C', key: 'rightVolume' },
    { label: 'Kreuzen →D',        key: 'straightVolume' },
  ]
  return [
    { label: 'Rechtseinbiegen →A', key: 'rightVolume' },
    { label: 'Linkseinbiegen →C',  key: 'leftVolume' },
    { label: 'Kreuzen →B',         key: 'straightVolume' },
  ]
}

function streamMovementName(n: number): string {
  const map: Record<number, string> = {
    1: 'Linksabbiegen HS (A→D)', 7: 'Linksabbiegen HS (C→B)',
    4: 'Linkseinbiegen NS (B→A)', 6: 'Rechtseinbiegen NS (B→C)', 5: 'Kreuzen NS (B→D)',
    10: 'Linkseinbiegen NS (D→C)', 12: 'Rechtseinbiegen NS (D→A)', 11: 'Kreuzen NS (D→B)',
  }
  return map[n] ?? `Strom ${n}`
}

// ── Kleine Hilfskomponenten ────────────────────────────────────────────────────

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
               border: '1px solid #d1d5db', fontSize: 13 }}
    />
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

function Ckbx({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <input type="checkbox" checked={checked}
      onChange={e => onChange(e.target.checked)}
      style={{ width: 16, height: 16, cursor: 'pointer', flexShrink: 0, accentColor: '#1e3a5f' }}
    />
  )
}

// ── ArmCard ────────────────────────────────────────────────────────────────────

function ArmCard({ arm, index, isHS, armCount, onChange }: {
  arm: ArmConfiguration; index: number; isHS: boolean; armCount: number
  onChange: (a: ArmConfiguration) => void
}) {
  const lbl  = armLabel(index)
  const col  = isHS ? '#1d4ed8' : '#c2410c'
  const bg   = isHS ? '#eff6ff' : '#fff7ed'
  const bd   = isHS ? '#bfdbfe' : '#fed7aa'
  const f    = armFactor(arm)
  const tot  = totalVolume(arm)
  const mix  = arm.vehicleMix

  const upd = <K extends keyof ArmConfiguration>(k: K, v: ArmConfiguration[K]) =>
    onChange({ ...arm, [k]: v })
  const updMix = (k: keyof VehicleCategoryMix, v: number) =>
    mix && onChange({ ...arm, vehicleMix: { ...mix, [k]: v } })

  const pw = mix ? pctPW(mix) : null
  const pwOk = pw === null || pw >= 0

  const movements = getMovements(index, armCount)
  const isNS4arm  = !isHS && armCount === 4

  return (
    <div style={{ border: `1px solid ${bd}`, borderRadius: 8, overflow: 'hidden', background: '#fff' }}>

      {/* Kopfzeile */}
      <div style={{ background: bg, padding: '10px 14px', display: 'flex',
                    alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <span style={{ fontWeight: 700, fontSize: 15, color: col }}>Arm {lbl}</span>
          <span style={{ fontSize: 11, color: '#6b7280', marginLeft: 8 }}>
            {Math.round(tot)} Fz/h · f = {f.toFixed(2)}
          </span>
        </div>
        <span style={{ fontSize: 11, color: col, background: isHS ? '#dbeafe' : '#ffedd5',
                       padding: '2px 8px', borderRadius: 12, fontWeight: 600 }}>
          {isHS ? 'Hauptstrasse' : 'Nebenstrasse'}
        </span>
      </div>

      {/* Verkehrsmengen */}
      <SectionLabel title="Verkehrsmengen" />
      {movements.map(m => (
        <Row key={m.key} label={m.label}>
          <NumInput value={arm[m.key] as number} onChange={v => upd(m.key, v)} />
          <span style={{ fontSize: 11, color: '#9ca3af', width: 30 }}>Fz/h</span>
        </Row>
      ))}

      {/* Längsneigung */}
      <SectionLabel title="Längsneigung" />
      <Row label="Neigung der Zufahrt"
           sub={`Umrechnungsfaktor f = ${f.toFixed(2)}  (${mix ? 'Fall 2, Tab. 2' : 'Fall 1, Tab. 1'})`}>
        <select value={arm.gradient}
          onChange={e => upd('gradient', e.target.value as GradientCategory)}
          style={{ fontSize: 13, padding: '3px 6px', borderRadius: 4,
                   border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer' }}>
          {GRADIENT_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </Row>
      <Row label="Fahrzeugkategorien bekannt (Fall 2)"
           sub="Aktiv: f nach Tab. 2 / F10.  Inaktiv: f pauschal nach Tab. 1 / F9.">
        <Ckbx checked={mix !== undefined}
          onChange={on => upd('vehicleMix', on ? { pctLW: 0, pctLZ: 0, pctMR: 0, pctFR: 0 } : undefined)} />
      </Row>
      {mix && (
        <>
          {([
            { key: 'pctLW' as const, label: 'LW – Lastwagen' },
            { key: 'pctLZ' as const, label: 'LZ – Lastzüge' },
            { key: 'pctMR' as const, label: 'MR – Motorräder' },
            ...(arm.gradient === '±0%' ? [{ key: 'pctFR' as const, label: 'FR – Fahrräder' }] : []),
          ]).map(r => (
            <Row key={r.key} label={r.label}>
              <NumInput value={mix[r.key]} onChange={v => updMix(r.key, v)} min={0} max={100} width={60} />
              <span style={{ fontSize: 11, color: '#9ca3af', width: 16 }}>%</span>
            </Row>
          ))}
          <Row label="PW – Personenwagen" sub="Ergibt sich aus den übrigen Anteilen">
            <span style={{ fontSize: 13, fontWeight: 600, color: pwOk ? '#374151' : '#dc2626' }}>
              {pw !== null ? Math.round(pw) : 0} %
            </span>
            {!pwOk && <span style={{ fontSize: 11, color: '#dc2626', marginLeft: 4 }}>Summe &gt; 100 %</span>}
          </Row>
        </>
      )}

      {/* Geometrie / Fussnoten */}
      <SectionLabel title="Geometrie (Fussnoten)" />
      {isHS ? (
        <>
          <Row label="Fn 1: Rechtsabbieger auf separatem Streifen"
               sub="q3 resp. q9 entfällt aus NS-Konfliktformeln F3–F8">
            <Ckbx checked={arm.hasSeparateTurnLane} onChange={v => upd('hasSeparateTurnLane', v)} />
          </Row>
          <Row label="Fn 3: Dreiecksinsel für HS-Rechtsabbieger"
               sub="Zusätzlich: q3 / q9 entfällt aus F1, F2, F5, F6">
            <Ckbx checked={arm.hasRightTurnTriangleIsland} onChange={v => upd('hasRightTurnTriangleIsland', v)} />
          </Row>
          <Row label="Fn 2: Separater Linksabbiegestreifen HS"
               sub="NS muss nur dem rechten Fahrstreifen Vortritt geben (F3/F4)">
            <Ckbx checked={arm.rightLaneVolume !== undefined}
              onChange={on => upd('rightLaneVolume', on ? 0 : undefined)} />
          </Row>
          {arm.rightLaneVolume !== undefined && (
            <Row label="Belastung rechter Fahrstreifen">
              <NumInput value={arm.rightLaneVolume} onChange={v => upd('rightLaneVolume', v)} />
              <span style={{ fontSize: 11, color: '#9ca3af', width: 30 }}>Fz/h</span>
            </Row>
          )}
        </>
      ) : (
        <>
          <Row label="Fn 4: Dreiecksinsel für NS-Rechtsabbieger"
               sub="q6 / q12 entfällt aus Linkseinbieger-Konfliktformel F7/F8">
            <Ckbx checked={arm.hasRightTurnTriangleIsland} onChange={v => upd('hasRightTurnTriangleIsland', v)} />
          </Row>
          {isNS4arm && (
            <>
              <div style={{ padding: '7px 14px 4px', borderBottom: '1px solid #f3f4f6' }}>
                <div style={{ fontSize: 13, color: '#374151' }}>Mischstreifen-Kombination</div>
                <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 1 }}>
                  Welche NS-Ströme teilen dieselbe Wartelinie [F21]
                </div>
              </div>
              {MIXED_OPTIONS.map(o => (
                <div key={o.value} onClick={() => upd('mixedLaneCombination', o.value)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10,
                           padding: '6px 14px', cursor: 'pointer',
                           borderBottom: '1px solid #f3f4f6',
                           background: arm.mixedLaneCombination === o.value ? '#f0f9ff' : '#fff' }}>
                  <input type="radio" readOnly checked={arm.mixedLaneCombination === o.value}
                    style={{ flexShrink: 0, accentColor: '#1e3a5f' }} />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: arm.mixedLaneCombination === o.value ? 600 : 400 }}>
                      {index === 2 ? o.labelB : o.labelD}
                    </div>
                    <div style={{ fontSize: 11, color: '#9ca3af' }}>{o.desc}</div>
                  </div>
                </div>
              ))}
            </>
          )}
        </>
      )}

      {/* Fussgänger */}
      <SectionLabel title="Fussgänger" />
      <Row label="Fussgängerstreifen vorhanden"
           sub="Wirkt nur im erweiterten Schätzverfahren — nicht im SN 640 022-Ergebnis">
        <Ckbx checked={arm.hasPedestrianCrossing} onChange={v => upd('hasPedestrianCrossing', v)} />
      </Row>
      {arm.hasPedestrianCrossing && (
        <>
          <Row label="Fussgänger-Volumen">
            <NumInput value={arm.pedestrianVolume} onChange={v => upd('pedestrianVolume', v)} />
            <span style={{ fontSize: 11, color: '#9ca3af', width: 30 }}>Fg/h</span>
          </Row>
          <Row label="Mittelinsel vorhanden"
               sub="Jede Strassenhälfte gilt als eigener Streifen (VRV Art. 47 Abs. 3)">
            <Ckbx checked={arm.hasMittelinsel} onChange={v => upd('hasMittelinsel', v)} />
          </Row>
        </>
      )}
    </div>
  )
}

// ── Ergebnisse ────────────────────────────────────────────────────────────────

function delayText(w: number): string {
  if (!isFinite(w)) return '> 999 s'
  if (w < 1)        return '< 1 s'
  return `ca. ${Math.round(w)} s`
}

function utilizationColor(a: number): string {
  if (a < 0.70) return '#16a34a'
  if (a < 0.90) return '#ca8a04'
  if (a < 1.00) return '#ea580c'
  return '#dc2626'
}

function UtilBar({ value }: { value: number }) {
  const pct = Math.min(1, value)
  const col = utilizationColor(value)
  return (
    <div style={{ height: 6, borderRadius: 3, background: '#e5e7eb', overflow: 'hidden', margin: '6px 0' }}>
      <div style={{ height: '100%', width: `${pct * 100}%`, background: col, borderRadius: 3,
                    transition: 'width 0.3s' }} />
    </div>
  )
}

function MixedCard({ m }: { m: SN640022MixedResult }) {
  const col = utilizationColor(m.utilizationDegree)
  const pct = Math.min(999, Math.round(m.utilizationDegree * 100))
  const mvs = m.streamNumbers.map(streamMovementName).join(' · ')
  return (
    <div style={{ padding: '12px 14px', background: '#fff', borderRadius: 8,
                  border: '1px solid #e5e7eb', marginBottom: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
        <div>
          <span style={{ fontWeight: 700, fontSize: 14 }}>{m.name}</span>
          <span style={{ fontSize: 11, color: '#9ca3af', marginLeft: 8 }}>{mvs}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: col }}>{pct} %</span>
          <LOSBadge los={m.levelOfService} />
        </div>
      </div>
      <UtilBar value={m.utilizationDegree} />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#6b7280' }}>
        <div>
          <span style={{ color: '#9ca3af' }}>Lm </span>
          <strong>{Math.round(m.capacity)} PWE/h</strong>
        </div>
        <div>
          <span style={{ color: '#9ca3af' }}>Reserve </span>
          <strong style={{ color: m.reserve < 0 ? '#dc2626' : '#16a34a' }}>{Math.round(m.reserve)}</strong>
        </div>
        <div>
          <span style={{ color: '#9ca3af' }}>Wartezeit </span>
          <strong>{delayText(m.delay)}</strong>
        </div>
      </div>
    </div>
  )
}

function StreamRow({ s }: { s: SN640022StreamResult }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '8px 14px', borderBottom: '1px solid #f3f4f6' }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 500 }}>{streamMovementName(s.streamNumber)}</div>
        <div style={{ fontSize: 11, color: '#9ca3af' }}>
          {s.name} · L = {Math.round(s.capacity)} PWE/h · {delayText(s.delay)}
        </div>
      </div>
      <LOSBadge los={s.levelOfService} />
    </div>
  )
}

function ResultsPanel({ result }: { result: SN640022Result }) {
  const [showDetails, setShowDetails] = useState(false)
  const rang2 = result.streams.filter(s => s.rang === 2)

  return (
    <div>
      {/* Gesamtbeurteilung */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '14px 16px', borderRadius: 10, marginBottom: 16,
                    background: LOS_BG[result.overallLevelOfService],
                    border: `1px solid ${LOS_COLOR[result.overallLevelOfService]}44` }}>
        <div>
          <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 2 }}>Gesamtbeurteilung · SN 640 022</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#1e293b' }}>
            Qualitätsstufe {result.overallLevelOfService}
          </div>
          <div style={{ fontSize: 11, color: '#6b7280', marginTop: 1 }}>
            (schlechtester Strom resp. Mischstreifen)
          </div>
        </div>
        <LOSBadge los={result.overallLevelOfService} />
      </div>

      {/* Mischstreifen */}
      {result.mixedLanes.length > 0 && (
        <>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#6b7280',
                        textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
            Mischstreifen
          </div>
          {result.mixedLanes.map(m => <MixedCard key={m.id} m={m} />)}
        </>
      )}

      {/* HS-Linksabbieger (Rang 2) */}
      {rang2.length > 0 && (
        <>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#6b7280',
                        textTransform: 'uppercase', letterSpacing: '0.05em',
                        marginTop: 16, marginBottom: 8 }}>
            Linksabbieger Hauptstrasse
          </div>
          <div style={{ background: '#fff', borderRadius: 8, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
            {rang2.map(s => <StreamRow key={s.id} s={s} />)}
          </div>
        </>
      )}

      {/* Detailtabelle (toggle) */}
      <button onClick={() => setShowDetails(d => !d)}
        style={{ marginTop: 20, width: '100%', padding: '7px', borderRadius: 6,
                 fontSize: 12, cursor: 'pointer', border: '1px solid #d1d5db',
                 background: '#f9fafb', color: '#374151' }}>
        {showDetails ? 'Detailtabelle ausblenden' : 'Detailtabelle einblenden'}
      </button>

      {showDetails && (
        <div style={{ marginTop: 10, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: '#1e3a5f', color: '#fff' }}>
                {['S','Bewegung','Rg','qpi','G','L','R','a','w [s]','QS'].map(h => (
                  <th key={h} style={{ padding: '6px 8px', textAlign: 'center',
                                       fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.streams.map((s, i) => (
                <tr key={s.id} style={{ background: i % 2 === 0 ? '#f8fafc' : '#fff',
                                        borderBottom: '1px solid #e5e7eb' }}>
                  <td style={{ padding: '5px 8px', textAlign: 'center', fontWeight: 700 }}>{s.streamNumber}</td>
                  <td style={{ padding: '5px 8px', color: '#4b5563', whiteSpace: 'nowrap' }}>{s.name}</td>
                  <td style={{ padding: '5px 8px', textAlign: 'center', color: '#6b7280' }}>{s.rang}</td>
                  <td style={{ padding: '5px 8px', textAlign: 'right' }}>{Math.round(s.qpi)}</td>
                  <td style={{ padding: '5px 8px', textAlign: 'right' }}>{Math.round(s.basicCapacity)}</td>
                  <td style={{ padding: '5px 8px', textAlign: 'right', fontWeight: 600 }}>{Math.round(s.capacity)}</td>
                  <td style={{ padding: '5px 8px', textAlign: 'right',
                               color: s.reserve < 0 ? '#dc2626' : '#16a34a' }}>{Math.round(s.reserve)}</td>
                  <td style={{ padding: '5px 8px', textAlign: 'right' }}>{s.utilizationDegree.toFixed(3)}</td>
                  <td style={{ padding: '5px 8px', textAlign: 'right' }}>
                    {isFinite(s.delay) ? Math.round(s.delay) : '∞'}
                  </td>
                  <td style={{ padding: '5px 8px', textAlign: 'center' }}>
                    <LOSBadge los={s.levelOfService} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Hauptapp ──────────────────────────────────────────────────────────────────

export default function App() {
  const [cfg, setCfg] = useState<IntersectionConfiguration>(defaultIntersection(3))

  const result = useMemo<SN640022Result | null>(() => {
    const v = toSNVolumes(cfg)
    if (!v) return null
    return analyzeSN640022(v, toSNLaneFlags(cfg))
  }, [cfg])

  const setArm = (i: number, arm: ArmConfiguration) =>
    setCfg(prev => { const arms = [...prev.arms]; arms[i] = arm; return { ...prev, arms } })

  const setArmCount = (n: 3 | 4) =>
    setCfg(prev => prev.arms.length === n ? prev : defaultIntersection(n))

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9', fontFamily: 'system-ui, sans-serif' }}>

      {/* Header */}
      <header style={{ background: '#1e3a5f', color: '#fff', padding: '0 24px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex',
                      alignItems: 'center', height: 56, gap: 16 }}>
          <span style={{ fontWeight: 800, fontSize: 20, letterSpacing: '-0.5px' }}>KnotenCheck</span>
          <span style={{ fontSize: 12, opacity: 0.6, marginTop: 1 }}>nach SN 640 022</span>
          <div style={{ flex: 1 }} />
          <input
            value={cfg.name}
            onChange={e => setCfg(p => ({ ...p, name: e.target.value }))}
            placeholder="Name des Knotens…"
            style={{ fontSize: 13, padding: '4px 10px', borderRadius: 6,
                     border: '1px solid #fff3', background: '#ffffff18',
                     color: '#fff', width: 200, outline: 'none' }}
          />
        </div>
      </header>

      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '20px 16px' }}>

        {/* Knotentyp */}
        <div style={{ background: '#fff', borderRadius: 10, padding: '12px 20px',
                      marginBottom: 16, boxShadow: '0 1px 3px #0001',
                      display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontWeight: 600, fontSize: 14, color: '#374151' }}>Knotentyp</span>
          {([3, 4] as const).map(n => (
            <button key={n} onClick={() => setArmCount(n)}
              style={{ padding: '5px 18px', borderRadius: 6, fontSize: 13, cursor: 'pointer',
                       fontWeight: cfg.arms.length === n ? 700 : 400,
                       background: cfg.arms.length === n ? '#1e3a5f' : '#f3f4f6',
                       color: cfg.arms.length === n ? '#fff' : '#374151',
                       border: cfg.arms.length === n ? '1px solid #1e3a5f' : '1px solid #d1d5db' }}>
              {n === 3 ? 'T-Knoten (3 Arme)' : 'Kreuzung (4 Arme)'}
            </button>
          ))}
          <span style={{ fontSize: 12, color: '#9ca3af' }}>
            A, C = Hauptstrasse · B{cfg.arms.length === 4 ? ', D' : ''} = Nebenstrasse
          </span>
        </div>

        {/* Arme + Ergebnisse */}
        <div style={{ display: 'grid',
                      gridTemplateColumns: 'minmax(0, 1fr) minmax(280px, 420px)',
                      gap: 16, alignItems: 'start' }}>

          {/* Arm-Karten */}
          <div style={{ display: 'grid',
                        gridTemplateColumns: cfg.arms.length === 4 ? '1fr 1fr' : '1fr',
                        gap: 12 }}>
            {cfg.arms.map((arm, i) => (
              <ArmCard key={arm.id} arm={arm} index={i} isHS={i < 2}
                armCount={cfg.arms.length}
                onChange={a => setArm(i, a)} />
            ))}
          </div>

          {/* Ergebnisse (sticky) */}
          <div style={{ background: '#fff', borderRadius: 10, padding: 20,
                        boxShadow: '0 1px 3px #0001', position: 'sticky', top: 16 }}>

            {/* Schematik */}
            <div style={{ marginBottom: 16, borderRadius: 8, overflow: 'hidden',
                          border: '1px solid #e5e7eb', background: '#fafafa' }}>
              <img
                src={cfg.arms.length === 3 ? einmuendungSvg : kreuzungSvg}
                alt={cfg.arms.length === 3 ? 'T-Knoten Schema' : 'Kreuzung Schema'}
                style={{ width: '100%', height: 'auto', display: 'block',
                         maxHeight: 280, objectFit: 'contain', padding: 8 }}
              />
            </div>

            {result
              ? <ResultsPanel result={result} />
              : <p style={{ color: '#9ca3af', textAlign: 'center', padding: 32 }}>
                  Bitte Verkehrsmengen eingeben.
                </p>
            }
          </div>
        </div>

        <p style={{ fontSize: 11, color: '#9ca3af', textAlign: 'center', marginTop: 24 }}>
          Berechnung nach SN 640 022 (VSS, Mai 1999) und VSS-Forschungsbericht 2008/301.
          Umrechnungsfaktor f = 1.1 (Fall 1, ±0% Neigung). Kein amtliches Dokument.
        </p>
      </main>
    </div>
  )
}
