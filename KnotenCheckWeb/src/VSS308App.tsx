import { useState, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { calculateVSS308 } from './engine/vss2011308Calculator'
import type { ArmInput, ArmResult, StreamResult, LevelOfService, RoadType } from './engine/vss2011308Calculator'
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
      <div style={{ background: bg, borderBottom: `1px solid ${bd}`, padding: '10px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <span style={{ fontWeight: 800, fontSize: 17, color: col,
                         background: '#fff', border: `1.5px solid ${bd}`,
                         borderRadius: 6, minWidth: 28, textAlign: 'center', padding: '1px 6px' }}>
            {lbl}
          </span>
          <span style={{ fontSize: 11, color: col, fontWeight: 600, opacity: 0.7 }}>
            {isHS ? 'Hauptstrasse (HS)' : isEqual ? 'Gleicher Rang' : 'Nebenstrasse (NS)'}
          </span>
        </div>
        <input
          type="text" placeholder="Strassenname (optional)"
          value={arm.name}
          onChange={e => upd('name', e.target.value)}
          style={{ width: '100%', border: `1px solid ${bd}`, background: '#fff', fontSize: 13,
                   fontWeight: 600, color: col, outline: 'none', borderRadius: 5,
                   padding: '4px 8px', boxSizing: 'border-box' }}
        />
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

      {/* Fussgänger*innen */}
      <SectionLabel title="Fussgänger*innen" />
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

// ── Ströme-Tabelle (Kap. 5 — pro Bewegungsrichtung) ──────────────────────────

function StreamsTable({ streams }: { streams: StreamResult[] }) {
  const visible = streams.filter(s => s.Q > 0 && s.toArmIndex >= 0)
  if (visible.length === 0) return null

  return (
    <div style={{ padding: '0 12px 12px' }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em',
                    color: '#6b7280', textTransform: 'uppercase', marginBottom: 6 }}>
        Ströme
      </div>
      <div style={{ borderRadius: 6, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <thead>
            <tr style={{ background: '#f9fafb' }}>
              {['Strom', 'Q', 'β', 'L', 'x', 'w', 'LOS'].map(h => (
                <th key={h} style={{
                  padding: '4px 7px', textAlign: h === 'Strom' ? 'left' : 'right',
                  borderBottom: '1px solid #e5e7eb', color: '#6b7280', fontWeight: 700,
                }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map(s => {
              const col = s.roadType === 'HS' ? '#1d4ed8' : s.roadType === 'NS' ? '#c2410c' : '#4b5563'
              return (
                <tr key={s.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '3px 7px', fontWeight: 700, color: col }}>{s.id}</td>
                  <td style={{ padding: '3px 7px', textAlign: 'right', color: '#374151' }}>{s.Q}</td>
                  <td style={{ padding: '3px 7px', textAlign: 'right', color: '#374151' }}>{s.beta.toFixed(3)}</td>
                  <td style={{ padding: '3px 7px', textAlign: 'right', color: '#374151' }}>{Math.round(s.capacity)}</td>
                  <td style={{ padding: '3px 7px', textAlign: 'right' }}>
                    <span style={{ color: utilizationColor(s.utilizationDegree), fontWeight: 600 }}>
                      {isFinite(s.utilizationDegree) ? s.utilizationDegree.toFixed(2) : '>1'}
                    </span>
                  </td>
                  <td style={{ padding: '3px 7px', textAlign: 'right', color: '#374151' }}>{delayText(s.delay)}</td>
                  <td style={{ padding: '3px 7px', textAlign: 'right' }}>
                    <LOSBadge los={s.levelOfService} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Bewertungsblatt (Druckansicht) ────────────────────────────────────────────

const NODE_TYPE_LABEL: Record<NodeType, string> = {
  '3arm':  'Einmündung (T-Knoten, 3 Arme)',
  '4arm':  'Kreuzung (4 Arme)',
  'equal': 'Gleicher Rang — Rechtsvortritt (4 Arme)',
}

const LOS_DESC: Record<LevelOfService, string> = {
  A: 'Sehr gut — keine Wartezeiten',
  B: 'Gut — kurze Wartezeiten',
  C: 'Befriedigend',
  D: 'Ausreichend — merkliche Wartezeiten',
  E: 'Mangelhaft — lange Wartezeiten',
  F: 'Überlastet — Stau',
}

function VSS308PrintSheet({ nodeName, nodeType, arms, result }: {
  nodeName: string
  nodeType: NodeType
  arms: ArmInput[]
  result: ReturnType<typeof calculateVSS308>
}) {
  const date    = new Date().toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const overall = result.overallLevelOfService
  const losRank = ['A','B','C','D','E','F']

  const worstArm = result.arms.reduce((w, r) =>
    losRank.indexOf(r.levelOfService) > losRank.indexOf(w.levelOfService) ? r : w,
    result.arms[0])

  const visibleStreams = result.streams.filter(s => s.Q > 0 && s.toArmIndex >= 0)

  const th: React.CSSProperties = {
    padding: '3px 6px', border: '1px solid #bbb', background: '#ececec',
    fontSize: 9, fontWeight: 700, textAlign: 'right', whiteSpace: 'nowrap',
  }
  const thL: React.CSSProperties = { ...th, textAlign: 'left' }
  const td: React.CSSProperties  = { padding: '3px 6px', border: '1px solid #ddd', fontSize: 10, textAlign: 'right' }
  const tdL: React.CSSProperties = { ...td, textAlign: 'left' }

  const roadLabel = (rt: RoadType) =>
    rt === 'HS' ? 'HS' : rt === 'NS' ? 'NS' : 'Gleich'

  return (
    <div style={{ lineHeight: 1.4 }}>

      {/* Kopfzeile */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end',
                    borderBottom: '2.5px solid #1e3a5f', paddingBottom: 6, marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 800, color: '#1e3a5f', letterSpacing: '-0.3px' }}>
            Bewertungsblatt Ungesteuerter Knoten
          </div>
          <div style={{ fontSize: 10, color: '#555', marginTop: 2 }}>
            VSS 2011/308 — Verkehrsablauf an ungesteuerten Knoten innerorts (Menendez/Guler/Puffe)
          </div>
        </div>
        <div style={{ textAlign: 'right', fontSize: 9, color: '#777' }}>
          <div style={{ fontWeight: 700 }}>KnotenCheck</div>
          <div>{date}</div>
        </div>
      </div>

      {/* Objekt */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 12 }}>
        <tbody>
          <tr>
            <td style={{ ...thL, width: '22%' }}>Bezeichnung</td>
            <td style={tdL}>{nodeName || '—'}</td>
          </tr>
          <tr>
            <td style={{ ...thL, width: '22%' }}>Knotentyp</td>
            <td style={tdL}>{NODE_TYPE_LABEL[nodeType]}</td>
          </tr>
        </tbody>
      </table>

      {/* Eingaben */}
      <div style={{ fontWeight: 700, fontSize: 10, color: '#1e3a5f', textTransform: 'uppercase',
                    letterSpacing: '0.06em', marginBottom: 3 }}>Eingaben</div>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 12 }}>
        <thead>
          <tr>
            <th style={thL}>Arm</th>
            <th style={thL}>Bezeichnung</th>
            <th style={th}>Typ</th>
            <th style={th}>Rechts<br/>[Fz/h]</th>
            {nodeType !== '3arm' && <th style={th}>Gerade<br/>[Fz/h]</th>}
            <th style={th}>Links<br/>[Fz/h]</th>
            <th style={th}>FG<br/>[Fg/h]</th>
          </tr>
        </thead>
        <tbody>
          {arms.map((arm, i) => (
            <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#f7f7f7' }}>
              <td style={tdL}><strong>{armLabel(i)}</strong></td>
              <td style={tdL}>{arm.name || '—'}</td>
              <td style={{ ...td, textAlign: 'center', fontWeight: 600 }}>{roadLabel(arm.roadType)}</td>
              <td style={td}>{arm.right}</td>
              {nodeType !== '3arm' && <td style={td}>{arm.straight}</td>}
              <td style={td}>{arm.left}</td>
              <td style={td}>{arm.fg || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Ergebnisse pro Arm */}
      <div style={{ fontWeight: 700, fontSize: 10, color: '#1e3a5f', textTransform: 'uppercase',
                    letterSpacing: '0.06em', marginBottom: 3 }}>Ergebnisse — Einfahrten (Mittelwert)</div>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 12 }}>
        <thead>
          <tr>
            <th style={thL}>Arm</th>
            <th style={th}>Q<br/>[Fz/h]</th>
            <th style={th}>S<br/>[Fz/h]</th>
            <th style={th}>β</th>
            <th style={th}>L<br/>[Fz/h]</th>
            <th style={th}>x</th>
            <th style={th}>w<br/>[s]</th>
            <th style={th}>k<br/>[Fz]</th>
            <th style={{ ...th, textAlign: 'center' }}>LOS</th>
          </tr>
        </thead>
        <tbody>
          {result.arms.map((r, i) => (
            <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#f7f7f7' }}>
              <td style={tdL}>
                <strong>{armLabel(r.armIndex)}</strong>
                {r.name ? ` — ${r.name}` : ''}
              </td>
              <td style={td}>{r.qFz}</td>
              <td style={td}>{r.saturation}</td>
              <td style={td}>{r.beta.toFixed(3)}</td>
              <td style={td}>{Math.round(r.capacity)}</td>
              <td style={{ ...td, fontWeight: 600,
                           color: r.utilizationDegree >= 1 ? '#b91c1c'
                             : r.utilizationDegree >= 0.9 ? '#c2410c' : '#374151' }}>
                {isFinite(r.utilizationDegree) ? r.utilizationDegree.toFixed(2) : '> 1'}
              </td>
              <td style={td}>{isFinite(r.delay) ? `ca. ${Math.round(r.delay)} s` : '> 999 s'}</td>
              <td style={td}>{isFinite(r.queue) ? r.queue.toFixed(1) : '—'}</td>
              <td style={{ ...td, textAlign: 'center', fontWeight: 800,
                           background: LOS_BG[r.levelOfService], color: LOS_COLOR[r.levelOfService] }}>
                {r.levelOfService}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Ströme */}
      {visibleStreams.length > 0 && (<>
        <div style={{ fontWeight: 700, fontSize: 10, color: '#1e3a5f', textTransform: 'uppercase',
                      letterSpacing: '0.06em', marginBottom: 3 }}>Ströme (Kap. 5)</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 14 }}>
          <thead>
            <tr>
              <th style={thL}>Strom</th>
              <th style={th}>Typ</th>
              <th style={th}>Q<br/>[Fz/h]</th>
              <th style={th}>β</th>
              <th style={th}>L<br/>[Fz/h]</th>
              <th style={th}>x</th>
              <th style={th}>w<br/>[s]</th>
              <th style={{ ...th, textAlign: 'center' }}>LOS</th>
            </tr>
          </thead>
          <tbody>
            {visibleStreams.map((s, i) => (
              <tr key={s.id} style={{ background: i % 2 === 0 ? '#fff' : '#f7f7f7' }}>
                <td style={{ ...tdL, fontWeight: 700,
                             color: s.roadType === 'HS' ? '#1d4ed8'
                               : s.roadType === 'NS' ? '#c2410c' : '#4b5563' }}>
                  {s.id}
                </td>
                <td style={{ ...td, textAlign: 'center' }}>{roadLabel(s.roadType)}</td>
                <td style={td}>{s.Q}</td>
                <td style={td}>{s.beta.toFixed(3)}</td>
                <td style={td}>{Math.round(s.capacity)}</td>
                <td style={{ ...td, fontWeight: 600,
                             color: s.utilizationDegree >= 1 ? '#b91c1c'
                               : s.utilizationDegree >= 0.9 ? '#c2410c' : '#374151' }}>
                  {isFinite(s.utilizationDegree) ? s.utilizationDegree.toFixed(2) : '> 1'}
                </td>
                <td style={td}>{isFinite(s.delay) ? `ca. ${Math.round(s.delay)} s` : '> 999 s'}</td>
                <td style={{ ...td, textAlign: 'center', fontWeight: 800,
                             background: LOS_BG[s.levelOfService], color: LOS_COLOR[s.levelOfService] }}>
                  {s.levelOfService}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </>)}

      {/* Gesamtbeurteilung */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14,
                    border: `2px solid ${LOS_COLOR[overall]}`, borderRadius: 5,
                    padding: '8px 14px', marginBottom: 12,
                    background: LOS_BG[overall] }}>
        <div style={{ fontSize: 36, fontWeight: 800, color: LOS_COLOR[overall],
                      lineHeight: 1, minWidth: 32, textAlign: 'center' }}>
          {overall}
        </div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#111' }}>
            Gesamtbeurteilung: Qualitätsstufe {overall}
          </div>
          <div style={{ fontSize: 10, color: '#444', marginTop: 1 }}>{LOS_DESC[overall]}</div>
          <div style={{ fontSize: 9, color: '#666', marginTop: 2 }}>
            Massgebender Arm: {armLabel(worstArm.armIndex)}
            {worstArm.name ? ` — ${worstArm.name}` : ''}
            {' '}(LOS {worstArm.levelOfService}
            {isFinite(worstArm.delay) ? `, ca. ${Math.round(worstArm.delay)} s` : ', Überlast'})
          </div>
        </div>
      </div>

      {/* Methodik */}
      <div style={{ background: '#f5f5f5', border: '1px solid #ccc', borderRadius: 3,
                    padding: '6px 10px', fontSize: 8.5, color: '#444', lineHeight: 1.6,
                    marginBottom: 10 }}>
        <strong style={{ color: '#222' }}>Methodik (VSS 2011/308, Kap. 5):</strong>
        {' '}Pro Strom: β = ∏(1 − y_i)³ über alle senkrechten Rang-1-Ströme (HS-Fz und/oder Fg, Ein- und Ausfahrt).
        L = S × β (Szenario I). S = 1750 Fz/h (HS), 1650 Fz/h (NS).
        Wartezeit nach Gl. 1 (S. 62): C = 0.5 (Rang 1), C = 1.0 (Rang 2 / gleicher Rang).
        Einfahrten-Werte: Volumen-gewichtete Mittel. LOS: A ≤10 s · B ≤20 s · C ≤30 s · D ≤45 s · E &gt;45 s · F Überlast.
      </div>

      {/* Fusszeile */}
      <div style={{ borderTop: '1px solid #bbb', paddingTop: 5,
                    display: 'flex', justifyContent: 'space-between', fontSize: 8, color: '#888' }}>
        <span>Berechnung nach VSS 2011/308. Die Ergebnisse ersetzen keine Überprüfung durch eine Fachperson.</span>
        <span>KnotenCheck · pnfzygrzgf-svg.github.io/KnotenCheck</span>
      </div>

    </div>
  )
}

// ── Legende ───────────────────────────────────────────────────────────────────

const LEGEND_ITEMS: { abbr: string; unit?: string; desc: string }[] = [
  { abbr: 'Fz/h',   desc: 'Fahrzeuge pro Stunde — Roheingabe Abbiegeströme' },
  { abbr: 'Fg/h',   desc: 'Fussgänger*innen pro Stunde am Fussgängerstreifen dieser Einfahrt' },
  { abbr: 'HS',     desc: 'Hauptstrasse — Rang 1, hat Vortritt gegenüber NS-Fahrzeugen' },
  { abbr: 'NS',     desc: 'Nebenstrasse — Rang 2, muss Rang-1-Ströme und Fussgänger*innen abwarten' },
  { abbr: 'Q',  unit: 'Fz/h', desc: 'Belastung eines Stroms — Summe aller Fahrzeuge in dieser Bewegungsrichtung pro Stunde' },
  { abbr: 'S',  unit: 'Fz/h', desc: 'Sättigungsfluss — theoretisches Maximum ohne Konflikte: 1750 Fz/h für HS (Rang 1), 1650 Fz/h für NS (Rang 2)' },
  { abbr: 'β',      desc: 'Reduktionsfaktor — Produkt aller β_i = (1 − y_i)³ über senkrechte Rang-1-Ströme (HS-Fz und/oder Fussgänger*innen); Kap. 5, Gl. 12 (VSS 2011/308)' },
  { abbr: 'L',  unit: 'Fz/h', desc: 'Kapazität des Stroms — L = S × β (Szenario I, Kap. 5)' },
  { abbr: 'x',      desc: 'Auslastungsgrad = Q / L; x ≥ 1 bedeutet Überlast' },
  { abbr: 'w',  unit: 's',    desc: 'Mittlere Wartezeit — nach Gl. 1 (VSS 2011/308, S. 62); C = 0.5 für Rang 1, C = 1.0 für Rang 2 und gleichen Rang' },
  { abbr: 'k',  unit: 'Fz',   desc: 'Staulänge = w × L / 3600 — mittlere Anzahl wartender Fahrzeuge' },
  { abbr: 'LOS',    desc: 'Qualitätsstufe A–F nach VSS 2011/308: A ≤10s · B ≤20s · C ≤30s · D ≤45s · E >45s · F Überlast' },
]

// ── Hauptkomponente ───────────────────────────────────────────────────────────

export default function VSS308App() {
  const [nodeName, setNodeName]   = useState('')
  const [nodeType, setNodeType]   = useState<NodeType>('4arm')
  const [arms, setArms]           = useState<ArmInput[]>(defaultArms('4arm'))
  const [showLegend, setShowLegend] = useState(false)

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
    <>
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '16px 16px 40px' }}>

      {/* Bezeichnung + Knotentyp-Auswahl */}
      <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #e5e7eb',
                    padding: '12px 16px', marginBottom: 16,
                    display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <input type="text" value={nodeName}
          onChange={e => setNodeName(e.target.value)}
          placeholder="Bezeichnung des Knotens"
          style={{ flexBasis: '100%', padding: '5px 10px', borderRadius: 5,
                   border: '1px solid #d1d5db', fontSize: 14, fontWeight: 600,
                   color: '#1e293b' }} />
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
        {/* Linke Spalte: Arm-Cards */}
        <div>
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

            {/* Schematik */}
            <div style={{ padding: 12, borderBottom: '1px solid #e5e7eb', background: '#fafafa' }}>
              {schematic}
            </div>

            {/* Drucken */}
            <div style={{ padding: '10px 12px', borderBottom: '1px solid #e5e7eb' }}>
              <button onClick={() => {
                const prev = document.title
                document.title = `KnotenCheck – VSS 2011/308${nodeName ? ' – ' + nodeName : ''}`
                window.addEventListener('afterprint', () => { document.title = prev }, { once: true })
                window.print()
              }}
                style={{ width: '100%', padding: '7px 0', borderRadius: 6,
                         border: '1px solid #1e3a5f', background: '#1e3a5f', color: '#fff',
                         fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                Bewertungsblatt (Druckansicht)
              </button>
            </div>

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
                Einfahrten (Mittelwert)
              </div>
              {result.arms.map(r => (
                <ResultCard key={r.armIndex} res={r} />
              ))}
            </div>

            {/* Ströme-Tabelle */}
            <StreamsTable streams={result.streams} />

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
              <strong style={{ color: '#334155' }}>Methodik:</strong> VSS 2011/308 Kap. 5
              (Menendez/Guler/Puffe). Pro Strom: β = ∏(1−y<sub>Fg</sub>)³
              für alle senkrechten Fg-Ströme (Ein- und Ausfahrt).
              L = S·β (Szenario I). Einfahrten-Werte sind Volumen-gewichtete Mittel.
              C = 0.5 für Rang 1, C = 1.0 für Rang 2.
            </div>

            {/* Legende */}
            <div style={{ margin: '0 12px 12px' }}>
              <button onClick={() => setShowLegend(v => !v)}
                style={{ width: '100%', textAlign: 'left', padding: '7px 12px',
                         borderRadius: 6, border: '1px solid #e2e8f0', background: '#f8fafc',
                         fontSize: 11, fontWeight: 600, color: '#475569', cursor: 'pointer',
                         display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>Legende — Abkürzungen</span>
                <span style={{ fontSize: 10, color: '#94a3b8' }}>{showLegend ? '▲' : '▼'}</span>
              </button>
              {showLegend && (
                <div style={{ border: '1px solid #e2e8f0', borderTop: 'none',
                              borderRadius: '0 0 6px 6px', background: '#fff', overflow: 'hidden' }}>
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
          </div>
        </div>
      </div>
    </div>

    {createPortal(
      <div className="print-portal" style={{ padding: '14mm 16mm', background: '#fff',
                                             fontFamily: 'system-ui, Arial, sans-serif' }}>
        <VSS308PrintSheet
          nodeName={nodeName}
          nodeType={nodeType}
          arms={activeArms}
          result={result}
        />
      </div>,
      document.body
    )}
    </>
  )
}
