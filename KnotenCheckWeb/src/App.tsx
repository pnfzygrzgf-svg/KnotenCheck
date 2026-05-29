import { useState, useMemo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Berechnungsblatt } from './Berechnungsblatt'
import RoundaboutApp from './RoundaboutApp'
import VSS308App from './VSS308App'
import LSAApp from './LSAApp'
import einmuendungSvg from './assets/einmuendung.svg'
import kreuzungSvg    from './assets/kreuzung.svg'
import { analyzeSN640022 } from './engine/sn640022Calculator'
import {
  defaultIntersection, toSNVolumes, toSNRawVolumes, toSNLaneFlags, armLabel, totalVolume,
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

function MixedLaneHint({ index, arm, opposingHSSeparateLane }: {
  index: number; arm: ArmConfiguration; opposingHSSeparateLane: boolean
}) {
  const isB = index === 2
  const streams = isB
    ? { right: '6 (B→C)', left: '4 (B→A)', through: '5 (B→D)', leftThrough: '4+5', throughRight: '5+6', all: '4+5+6' }
    : { right: '12 (D→A)', left: '10 (D→C)', through: '11 (D→B)', leftThrough: '10+11', throughRight: '11+12', all: '10+11+12' }
  const opposingArm = isB ? 'A' : 'C'

  // Bestimme kontextabhängige Empfehlung
  let recommendation: { combo: string; reason: string } | null = null
  if (arm.hasRightTurnTriangleIsland) {
    recommendation = {
      combo: `Links+Kreuzen (${streams.leftThrough})`,
      reason: `Fn 4 (Dreiecksinsel) ist aktiv: Der NS-Rechtsabbieger (Strom ${streams.right}) wartet an einer baulich getrennten Haltlinie und gehört nicht zum Mischstreifen.`,
    }
  } else if (opposingHSSeparateLane) {
    if (isB) {
      recommendation = {
        combo: `Links+Kreuzen (${streams.leftThrough})`,
        reason: `Arm A hat Fn 1 (separater Rechtsabbiegestreifen): Strom ${streams.right} muss nur dem rechten Fahrstreifen von A Vortritt geben und erhält dadurch deutlich mehr Kapazität als Strom ${streams.left} und ${streams.through}. Das Berechnungsbeispiel Punkt 22 der Norm (S. 13) wählt in diesem Fall Links+Kreuzen — der Rechtseinbieger wird separat beurteilt.`,
      }
    } else {
      recommendation = {
        combo: `Kreuzen+Rechts (${streams.throughRight})`,
        reason: `Arm C hat Fn 1 (separater Rechtsabbiegestreifen): Strom ${streams.right} muss nur dem rechten Fahrstreifen von C Vortritt geben und erhält mehr Kapazität. Das Berechnungsbeispiel Punkt 22 der Norm (S. 13) wählt in diesem Fall Kreuzen+Rechts — der Linkseinbieger (Strom ${streams.left}) wird separat beurteilt.`,
      }
    }
  }

  return (
    <div style={{ margin: '0 14px 10px', padding: '10px 12px', borderRadius: 6,
                  background: '#f8fafc', border: '1px solid #e2e8f0', fontSize: 11,
                  color: '#475569', lineHeight: 1.6 }}>
      <div style={{ fontWeight: 600, color: '#334155', marginBottom: 6 }}>
        Was bedeuten die Optionen? (SN 640 022, Abschn. 13, F21)
      </div>
      <div style={{ marginBottom: 4 }}>
        <strong>Formel F21:</strong> L_m = Σqᵢ / Σaᵢ — harmonisches Mittel der Einzelströme.
        Ein stark belasteter Strom senkt die Mischstreamkapazität der gesamten Gruppe.
        Deshalb ist wichtig, nur Ströme zusammenzufassen die wirklich hinter derselben Haltlinie warten.
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: recommendation ? 8 : 0 }}>
        <div>
          <strong>Alle ({streams.all}):</strong> Der NS-Arm hat einen einzigen Fahrstreifen.
          Linkseinbiegen, Kreuzen und Rechtseinbiegen teilen dieselbe Haltlinie — alle drei Ströme werden gemeinsam beurteilt.
        </div>
        <div>
          <strong>Links+Kreuzen ({streams.leftThrough}):</strong> Zwei Fahrstreifen auf dem NS-Arm.
          Linker Streifen: Linkseinbiegen + Kreuzen.
          Rechter Streifen: nur Rechtseinbiegen (Strom {streams.right} wird separat beurteilt).
        </div>
        <div>
          <strong>Kreuzen+Rechts ({streams.throughRight}):</strong> Zwei Fahrstreifen auf dem NS-Arm.
          Linker Streifen: nur Linkseinbiegen (Strom {streams.left} separat).
          Rechter Streifen: Kreuzen + Rechtseinbiegen gemeinsam.
        </div>
      </div>
      {recommendation && (
        <div style={{ marginTop: 6, padding: '8px 10px', borderRadius: 5,
                      background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1e40af' }}>
          <span style={{ fontWeight: 700 }}>Empfehlung: {recommendation.combo}</span>
          <br />{recommendation.reason}
        </div>
      )}
      {!recommendation && (
        <div style={{ marginTop: 4, color: '#64748b' }}>
          <strong>Standard:</strong> Keine besonderen geometrischen Bedingungen erkannt.
          Wählen Sie «Alle» wenn der NS-Arm einstreifig ist — andernfalls entsprechend der Fahrstreifenmarkierung auf dem Arm {opposingArm} gegenüber.
        </div>
      )}
    </div>
  )
}

function ArmCard({ arm, index, isHS, armCount, opposingHSSeparateLane, onChange }: {
  arm: ArmConfiguration; index: number; isHS: boolean; armCount: number
  opposingHSSeparateLane: boolean
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
      <div style={{ background: bg, padding: '10px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
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
        <input type="text" value={arm.streetName}
          onChange={e => upd('streetName', e.target.value)}
          placeholder="Strassenname"
          style={{ width: '100%', padding: '3px 8px', borderRadius: 4,
                   border: `1px solid ${bd}`, fontSize: 12,
                   background: '#ffffffaa', color: '#374151' }} />
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
              <MixedLaneHint index={index} arm={arm} opposingHSSeparateLane={opposingHSSeparateLane} />
            </>
          )}
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

// ── Ergebnis-Panel ────────────────────────────────────────────────────────────

function ResultsPanel({ result, onShowBerechnungsblatt }: {
  result: SN640022Result
  onShowBerechnungsblatt: () => void
}) {
  const [showDetails, setShowDetails] = useState(false)
  const rang2 = result.streams.filter(s => s.rang === 2)

  return (
    <div>
      {/* Berechnungsblatt-Button */}
      <button onClick={onShowBerechnungsblatt}
        style={{ width: '100%', marginBottom: 12, padding: '7px 0', borderRadius: 6,
                 fontSize: 12, cursor: 'pointer', border: '1px solid #1e3a5f',
                 background: '#1e3a5f', color: '#fff', fontWeight: 600 }}>
        Berechnungsblatt (Druckansicht)
      </button>

      {/* Beta-Hinweis — in beiden Tabs */}
      <div style={{ marginBottom: 14, padding: '7px 12px', borderRadius: 6,
                    background: '#fff7ed', border: '1px solid #fed7aa',
                    fontSize: 11, color: '#92400e', fontWeight: 600 }}>
        ⚠ Beta — Resultate mit Vorsicht verwenden.
      </div>

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
  const [mode, setMode] = useState<'sn022' | 'sn024a' | 'vss308' | 'lsa'>('sn022')
  const [cfg, setCfg] = useState<IntersectionConfiguration>(defaultIntersection(3))
  const [showBl, setShowBl] = useState(false)
  const openBl  = useCallback(() => setShowBl(true),  [])
  const closeBl = useCallback(() => setShowBl(false), [])

  const result = useMemo<SN640022Result | null>(() => {
    const v   = toSNVolumes(cfg)     // PWE/h — Auslastung, Reserve, Wartezeit
    const raw = toSNRawVolumes(cfg)  // Fz/h  — qpi für G-Funktionen (Abb. 2)
    if (!v || !raw) return null
    return analyzeSN640022(v, toSNLaneFlags(cfg), raw)
  }, [cfg])


  const setArm = (i: number, arm: ArmConfiguration) =>
    setCfg(prev => { const arms = [...prev.arms]; arms[i] = arm; return { ...prev, arms } })

  const setArmCount = (n: 3 | 4) =>
    setCfg(prev => prev.arms.length === n ? prev : defaultIntersection(n))

  return (
    <>
    <div style={{ minHeight: '100vh', background: '#f1f5f9', fontFamily: 'system-ui, sans-serif' }}>

      {/* Header */}
      <header style={{ background: '#1e3a5f', color: '#fff', padding: '0 24px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex',
                      alignItems: 'center', height: 56, gap: 16 }}>
          <span style={{ fontWeight: 800, fontSize: 20, letterSpacing: '-0.5px' }}>KnotenCheck</span>

          {/* Modus-Toggle */}
          <div style={{ display: 'flex', gap: 2, background: '#ffffff22', borderRadius: 6, padding: 2 }}>
            {([
              { key: 'sn022',  label: 'SN 640 022',  sub: '(Einmündung, Kreuzung)' },
              { key: 'sn024a', label: 'SN 640 024a', sub: 'Kreisverkehr' },
              { key: 'vss308', label: 'VSS 2011/308', sub: '(Ungesteuerter Knoten)' },
              { key: 'lsa',    label: 'SN 640 023a',  sub: '(LSA-Knoten)' },
            ] as const).map(m => (
              <button key={m.key} onClick={() => setMode(m.key)}
                style={{ padding: '4px 12px', borderRadius: 5, fontSize: 12, cursor: 'pointer',
                         border: 'none', fontWeight: mode === m.key ? 700 : 400,
                         background: mode === m.key ? '#fff' : 'transparent',
                         color: mode === m.key ? '#1e3a5f' : '#ffffffbb' }}>
                {m.label}
                <span style={{ fontSize: 10, opacity: 0.7, marginLeft: 4 }}>{m.sub}</span>
              </button>
            ))}
          </div>

          <div style={{ flex: 1 }} />
          <nav style={{ display: 'flex', gap: 12, fontSize: 12, opacity: 0.75 }}>
            <a href="https://github.com/pnfzygrzgf-svg/KnotenCheck"
               target="_blank" rel="noopener noreferrer"
               style={{ color: '#fff', textDecoration: 'none' }}>
              Quellcode: GitHub
            </a>
            <span style={{ opacity: 0.5 }}>·</span>
            <a href="https://creativecommons.org/licenses/by-nc/4.0/"
               target="_blank" rel="noopener noreferrer"
               style={{ color: '#fff', textDecoration: 'none' }}>
              Lizenz: CC BY-NC 4.0
            </a>
          </nav>
        </div>
      </header>

      {mode === 'sn024a' && <RoundaboutApp />}
      {mode === 'vss308' && <VSS308App />}
      {mode === 'lsa'    && <LSAApp />}
      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '20px 16px',
                     display: mode === 'sn022' ? undefined : 'none' }}>

        {/* Knotentyp */}
        <div style={{ background: '#fff', borderRadius: 10, padding: '12px 20px',
                      marginBottom: 16, boxShadow: '0 1px 3px #0001',
                      display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <input type="text" value={cfg.name}
            onChange={e => setCfg(prev => ({ ...prev, name: e.target.value }))}
            placeholder="Bezeichnung des Knotens"
            style={{ flexBasis: '100%', padding: '5px 10px', borderRadius: 5,
                     border: '1px solid #d1d5db', fontSize: 14, fontWeight: 600,
                     color: '#1e293b' }} />
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
        <div className="layout-grid">

          {/* Arm-Karten */}
          <div className={`arms-grid${cfg.arms.length === 4 ? ' arms-grid-4' : ''}`}>
            {cfg.arms.map((arm, i) => (
              <ArmCard key={arm.id} arm={arm} index={i} isHS={i < 2}
                armCount={cfg.arms.length}
                opposingHSSeparateLane={
                  i === 2 ? (cfg.arms[0]?.hasSeparateTurnLane ?? false)
                : i === 3 ? (cfg.arms[1]?.hasSeparateTurnLane ?? false)
                : false
                }
                onChange={a => setArm(i, a)} />
            ))}
          </div>

          {/* Ergebnisse (sticky auf Desktop, static auf Mobile) */}
          <div className="results-panel"
               style={{ background: '#fff', borderRadius: 10, padding: 20,
                        boxShadow: '0 1px 3px #0001' }}>

            {/* Schematik */}
            <div style={{ marginBottom: 16, borderRadius: 8, overflow: 'hidden',
                          border: '1px solid #e5e7eb', background: '#fafafa', padding: 8 }}>
              {cfg.arms.length === 3 ? (
                <img src={einmuendungSvg} alt="T-Knoten Schema"
                  style={{ width: '100%', height: 'auto', display: 'block',
                           maxHeight: 280, objectFit: 'contain' }} />
              ) : (
                <img
                  src={cfg.arms.length === 3 ? einmuendungSvg : kreuzungSvg}
                  alt={cfg.arms.length === 3 ? 'T-Knoten Schema' : 'Kreuzung Schema'}
                  style={{ width: '100%', height: 'auto', display: 'block' }}
                />
              )}
            </div>

            {result
              ? <ResultsPanel result={result} onShowBerechnungsblatt={openBl} />
              : <p style={{ color: '#9ca3af', textAlign: 'center', padding: 32 }}>
                  Bitte Verkehrsmengen eingeben.
                </p>
            }

          </div>
        </div>

        <footer style={{ fontSize: 11, color: '#9ca3af', textAlign: 'center', marginTop: 24, lineHeight: 2 }}>
          <div>
            Berechnung nach SN 640 022 (VSS, Mai 1999).
            Die Ergebnisse ersetzen keine Überprüfung durch eine Fachperson.
          </div>
          <div>
            © 2026 pnfzygrzgf-svg · Quellcode:{' '}
            <a href="https://github.com/pnfzygrzgf-svg/KnotenCheck"
               target="_blank" rel="noopener noreferrer"
               style={{ color: '#9ca3af', textDecoration: 'underline' }}>
              GitHub
            </a>
            {' '}· Lizenz:{' '}
            <a href="https://creativecommons.org/licenses/by-nc/4.0/"
               target="_blank" rel="noopener noreferrer"
               style={{ color: '#9ca3af', textDecoration: 'underline' }}>
              CC BY-NC 4.0
            </a>
            {' '}— kommerzielle Nutzung untersagt.
          </div>
        </footer>
      </main>
    </div>
    {result && showBl && createPortal(
      <Berechnungsblatt cfg={cfg} result={result} onClose={closeBl} />,
      document.body
    )}
    </>
  )
}
