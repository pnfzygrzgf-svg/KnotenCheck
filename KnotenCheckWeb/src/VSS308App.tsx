import { useState, useMemo } from 'react'
import { calculateVSS308 } from './engine/vss2011308Calculator'
import type { ArmInput, ArmResult, LevelOfService, RoadType } from './engine/vss2011308Calculator'
import { IntersectionSchematic } from './IntersectionSchematic'
import einmuendungSvg    from './assets/einmuendung.svg'
import rechtsvorttrittSvg from './assets/rechtsvortritt.svg'

// ── Arm-Labels (gleiche Reihenfolge wie SN 640 022) ───────────────────────────
// [0]=A(HS), [1]=C(HS), [2]=B(NS), [3]=D(NS)
function armLabel(index: number): string {
  return ['A', 'C', 'B', 'D'][index] ?? `${index + 1}`
}

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

function queueText(k: number): string {
  if (!isFinite(k)) return '> 99 Fz'
  return `${k.toFixed(1)} Fz`
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

// ── Knotentyp ─────────────────────────────────────────────────────────────────

type NodeType = '3arm' | '4arm' | 'equal'

function defaultArm(roadType: RoadType, isHS: boolean): ArmInput {
  return {
    name: '',
    roadType,
    right:    isHS ? 100 : 80,
    straight: isHS ? 400 : 0,
    left:     isHS ? 100 : 80,
    fg: 0,
  }
}

function defaultArms(nodeType: NodeType): ArmInput[] {
  if (nodeType === '3arm') return [
    defaultArm('HS', true),   // A
    defaultArm('HS', true),   // C
    defaultArm('NS', false),  // B
  ]
  if (nodeType === 'equal') return [
    defaultArm('equal', false),  // A
    defaultArm('equal', false),  // C
    defaultArm('equal', false),  // B
    defaultArm('equal', false),  // D
  ]
  return [
    defaultArm('HS', true),   // A
    defaultArm('HS', true),   // C
    defaultArm('NS', false),  // B
    defaultArm('NS', false),  // D
  ]
}

// ── ArmCard ───────────────────────────────────────────────────────────────────

function ArmCard({ arm, index, nodeType, result, onChange }: {
  arm: ArmInput
  index: number
  nodeType: NodeType
  result?: ArmResult
  onChange: (a: ArmInput) => void
}) {
  const lbl = armLabel(index)
  const isHS    = arm.roadType === 'HS'
  const isEqual = arm.roadType === 'equal'
  const col = isHS ? '#1d4ed8' : isEqual ? '#4b5563' : '#c2410c'
  const bg  = isHS ? '#eff6ff' : isEqual ? '#f9fafb' : '#fff7ed'
  const bd  = isHS ? '#bfdbfe' : isEqual ? '#e5e7eb' : '#fed7aa'

  const is3arm  = nodeType === '3arm'
  const isNSB3  = is3arm && index === 2  // NS-Arm B im 3-Arm: kein Geradeaus

  const upd = <K extends keyof ArmInput>(k: K, v: ArmInput[K]) =>
    onChange({ ...arm, [k]: v })

  const qTotal = arm.right + arm.straight + arm.left

  return (
    <div style={{ background: '#fff', borderRadius: 10, border: `1.5px solid ${bd}`,
                  overflow: 'hidden', boxShadow: '0 1px 4px #0001' }}>
      {/* Header */}
      <div style={{ background: bg, borderBottom: `1px solid ${bd}`,
                    padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontWeight: 800, fontSize: 17, color: col,
                       background: '#fff', border: `1.5px solid ${bd}`,
                       borderRadius: 6, minWidth: 28, textAlign: 'center', padding: '1px 6px' }}>
          {lbl}
        </span>
        <input
          type="text" placeholder="Strassenname (optional)"
          value={arm.name}
          onChange={e => upd('name', e.target.value)}
          style={{ flex: 1, border: 'none', background: 'transparent', fontSize: 14,
                   fontWeight: 600, color: col, outline: 'none' }}
        />
        <span style={{ fontSize: 11, color: col, fontWeight: 600, opacity: 0.7 }}>
          {isHS ? 'Hauptstrasse (HS)' : isEqual ? 'Gleicher Rang' : 'Nebenstrasse (NS)'}
        </span>
      </div>

      {/* Abbiegeströme */}
      <SectionLabel title="Abbiegeströme [Fz/h]" />
      <Row label="Rechtsabbiegen">
        <NumInput value={arm.right} onChange={v => upd('right', v)} />
      </Row>
      {!isNSB3 && (
        <Row label="Geradeaus">
          <NumInput value={arm.straight} onChange={v => upd('straight', v)} />
        </Row>
      )}
      <Row label="Linksabbiegen">
        <NumInput value={arm.left} onChange={v => upd('left', v)} />
      </Row>

      {/* Fussgänger */}
      <SectionLabel title="Fussgänger" />
      <Row label="Fussgängerstreifen" sub="an dieser Einfahrt">
        <input type="checkbox" checked={arm.fg > 0}
          onChange={e => upd('fg', e.target.checked ? 100 : 0)}
          style={{ width: 16, height: 16, cursor: 'pointer', accentColor: '#1e3a5f' }}
        />
      </Row>
      {arm.fg > 0 && (
        <Row label="Fussgängervolumen" sub="[Fg/h]">
          <NumInput value={arm.fg} onChange={v => upd('fg', v)} />
        </Row>
      )}

      {/* Abgeleitete Werte */}
      {result && (
        <>
          <SectionLabel title="Abgeleitete Werte" />
          <Row label="Q total" sub="[Fz/h]">
            <span style={{ fontSize: 13, color: '#374151', minWidth: 60, textAlign: 'right' }}>
              {qTotal}
            </span>
          </Row>
          <Row label="β" sub="Reduktionsfaktor">
            <span style={{ fontSize: 13, color: '#374151', minWidth: 60, textAlign: 'right' }}>
              {result.beta.toFixed(3)}
            </span>
          </Row>
          <Row label="L (Kapazität)" sub="[Fz/h]">
            <span style={{ fontSize: 13, color: '#374151', minWidth: 60, textAlign: 'right' }}>
              {Math.round(result.capacity)}
            </span>
          </Row>
        </>
      )}
    </div>
  )
}

// ── Ergebnis-Panel ────────────────────────────────────────────────────────────

function ResultCard({ res }: { res: ArmResult }) {
  const lbl = armLabel(res.armIndex)
  const isHS = res.roadType === 'HS'
  const isEq = res.roadType === 'equal'
  const col = isHS ? '#1d4ed8' : isEq ? '#4b5563' : '#c2410c'
  const bd  = isHS ? '#bfdbfe' : isEq ? '#e5e7eb' : '#fed7aa'

  return (
    <div style={{ borderRadius: 8, border: `1px solid ${bd}`,
                  overflow: 'hidden', marginBottom: 8 }}>
      <div style={{ padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 8,
                    background: isHS ? '#eff6ff' : isEq ? '#f9fafb' : '#fff7ed',
                    borderBottom: `1px solid ${bd}` }}>
        <span style={{ fontWeight: 800, color: col, minWidth: 20 }}>{lbl}</span>
        {res.name && <span style={{ fontSize: 12, color: col, flex: 1 }}>{res.name}</span>}
        <LOSBadge los={res.levelOfService} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', fontSize: 12,
                    color: '#374151', background: '#fff' }}>
        {[
          ['Q', `${res.qFz} Fz/h`],
          ['L', `${Math.round(res.capacity)} Fz/h`],
          ['x', <span style={{ color: utilizationColor(res.utilizationDegree), fontWeight: 600 }}>
            {isFinite(res.utilizationDegree) ? res.utilizationDegree.toFixed(2) : '> 1'}
          </span>],
          ['w', delayText(res.delay)],
          ['k', queueText(res.queue)],
          ['β', res.beta.toFixed(3)],
        ].map(([label, val]) => (
          <div key={String(label)} style={{ padding: '4px 10px', borderBottom: '1px solid #f3f4f6',
                          borderRight: '1px solid #f3f4f6' }}>
            <span style={{ color: '#9ca3af', marginRight: 6 }}>{label}</span>
            {typeof val === 'string' ? val : val}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Hauptkomponente ───────────────────────────────────────────────────────────

export default function VSS308App() {
  const [nodeType, setNodeType] = useState<NodeType>('4arm')
  const [arms, setArms]         = useState<ArmInput[]>(defaultArms('4arm'))

  function handleNodeTypeChange(t: NodeType) {
    setNodeType(t)
    setArms(defaultArms(t))
  }

  function updateArm(index: number, arm: ArmInput) {
    setArms(prev => prev.map((a, i) => i === index ? arm : a))
  }

  const calcInput = useMemo(() => ({
    type: nodeType === '3arm' ? '3arm' as const : '4arm' as const,
    arms,
  }), [nodeType, arms])

  const result = useMemo(() => calculateVSS308(calcInput), [calcInput])
  const overall = result.overallLevelOfService

  // Schematik
  const schematic = nodeType === '3arm'
    ? <img src={einmuendungSvg} alt="Einmündung" style={{ width: '100%', height: 'auto' }} />
    : nodeType === 'equal'
    ? <img src={rechtsvorttrittSvg} alt="Rechtsvortritt" style={{ width: '100%', height: 'auto' }} />
    : <IntersectionSchematic armASeparateLane={false} armCSeparateLane={false} />

  const activeArms = nodeType === '3arm' ? arms.slice(0, 3) : arms

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '16px 16px 40px' }}>

      {/* Knotentyp-Auswahl */}
      <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #e5e7eb',
                    padding: '12px 16px', marginBottom: 16,
                    display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginRight: 4 }}>
          Knotentyp:
        </span>
        {([
          ['3arm',  'Einmündung (3-Arm)'],
          ['4arm',  'Kreuzung (4-Arm)'],
          ['equal', 'Gleicher Rang (Rechtsvortritt)'],
        ] as [NodeType, string][]).map(([key, label]) => (
          <button key={key}
            onClick={() => handleNodeTypeChange(key)}
            style={{
              padding: '6px 14px', borderRadius: 6, fontSize: 13, fontWeight: 600,
              cursor: 'pointer', transition: 'background 0.15s',
              background: nodeType === key ? '#1e3a5f' : '#f3f4f6',
              color:      nodeType === key ? '#fff'    : '#374151',
              border: nodeType === key ? '1.5px solid #1e3a5f' : '1.5px solid #e5e7eb',
            }}>
            {label}
          </button>
        ))}
      </div>

      <div className="layout-grid">
        {/* Linke Spalte: Schematik + Arm-Cards */}
        <div>
          {/* Schematik */}
          <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #e5e7eb',
                        padding: 12, marginBottom: 16 }}>
            {schematic}
          </div>

          {/* Arm-Cards */}
          <div className={`arms-grid ${nodeType !== '3arm' ? 'arms-grid-4' : ''}`}>
            {activeArms.map((arm, i) => (
              <ArmCard key={i} arm={arm} index={i} nodeType={nodeType}
                result={result.arms[i]}
                onChange={a => updateArm(i, a)} />
            ))}
          </div>
        </div>

        {/* Rechte Spalte: Ergebnis-Panel */}
        <div className="results-panel">
          <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #e5e7eb',
                        overflow: 'hidden' }}>
            {/* Gesamt-LOS */}
            <div style={{ padding: '14px 16px', borderBottom: '1px solid #e5e7eb',
                          background: LOS_BG[overall] }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em',
                            color: LOS_COLOR[overall], textTransform: 'uppercase', marginBottom: 4 }}>
                Qualitätsstufe Knoten
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 48, fontWeight: 800, color: LOS_COLOR[overall],
                               lineHeight: 1 }}>
                  {overall}
                </span>
                <div style={{ fontSize: 12, color: LOS_COLOR[overall] }}>
                  {overall === 'A' && 'Sehr gut — keine Wartezeiten'}
                  {overall === 'B' && 'Gut — kurze Wartezeiten'}
                  {overall === 'C' && 'Befriedigend'}
                  {overall === 'D' && 'Ausreichend — merkliche Wartezeiten'}
                  {overall === 'E' && 'Mangelhaft — lange Wartezeiten'}
                  {overall === 'F' && 'Überlastet — Stau'}
                </div>
              </div>
            </div>

            {/* Ergebnisse pro Arm */}
            <div style={{ padding: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em',
                            color: '#6b7280', textTransform: 'uppercase', marginBottom: 8 }}>
                Einfahrten
              </div>
              {result.arms.map(r => (
                <ResultCard key={r.armIndex} res={r} />
              ))}
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
              <strong style={{ color: '#334155' }}>Methodik:</strong> VSS 2011/308
              (Menendez/Guler/Puffe). Kapazität: L = S·β.
              β = (1−y<sub>HS</sub>)³ · (1−y<sub>Fg</sub>)³.
              C = 0.5 für Rang 1, C = 1.0 für Rang 2.
              Wartezeit nach Kimber–Hollis, angepasst.
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
