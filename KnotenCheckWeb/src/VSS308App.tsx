import { useState, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { calculateVSS308 } from './engine/vss2011308Calculator'
import type { ArmInput, ArmResult, StreamResult, LevelOfService, RoadType } from './engine/vss2011308Calculator'
import kreuzungSvg       from './assets/kreuzung.svg'
import einmuendungSvg    from './assets/einmuendung.svg'
import rechtsvorttrittSvg from './assets/rechtsvortritt.svg'
import { exportTool, importTool } from './saveLoad'
import { LegendBox, type LegendItem } from './LegendBox'
import { useToast, Toast } from './Toast'
import {
  LOS_COLOR, LOS_BG, LOSBadge, NumInput, Row, SectionLabel,
  delayText, utilizationColor,
} from './ui'

// ── Arm-Labels (gleiche Reihenfolge wie SN 640 022) ───────────────────────────
// [0]=A(HS), [1]=C(HS), [2]=B(NS), [3]=D(NS)
function armLabel(index: number): string {
  return ['A', 'C', 'B', 'D'][index] ?? `${index + 1}`
}

function queueText(k: number): string {
  if (!isFinite(k)) return '> 99 Fz'
  return `${k.toFixed(1)} Fz`
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
    rho: 1,
    mittelinsel: false,
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
  const isNSB3  = is3arm && index === 2  // Arm B im 3-Arm: kein Geradeaus
  const isHSA3  = is3arm && index === 0  // Arm A im 3-Arm: kein Linksabbiegen
  const isHSC3  = is3arm && index === 1  // Arm C im 3-Arm: kein Rechtsabbiegen

  const upd = <K extends keyof ArmInput>(k: K, v: ArmInput[K]) =>
    onChange({ ...arm, [k]: v })

  const qTotal = (isHSA3 ? 0 : arm.left) + (isNSB3 ? 0 : arm.straight) + (isHSC3 ? 0 : arm.right)

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
      {!isHSA3 && (
        <Row label="Linksabbiegen">
          <NumInput live value={arm.left} onChange={v => upd('left', v)} />
        </Row>
      )}
      {!isNSB3 && (
        <Row label="Geradeaus">
          <NumInput live value={arm.straight} onChange={v => upd('straight', v)} />
        </Row>
      )}
      {!isHSC3 && (
        <Row label="Rechtsabbiegen">
          <NumInput live value={arm.right} onChange={v => upd('right', v)} />
        </Row>
      )}

      {/* Fussgänger*innen */}
      <SectionLabel title="Fussgänger*innen" />
      <Row label="Fussgängerstreifen" sub="an dieser Einfahrt">
        <input type="checkbox" checked={arm.fg > 0}
          onChange={e => upd('fg', e.target.checked ? 100 : 0)}
          style={{ width: 16, height: 16, cursor: 'pointer', accentColor: '#1e3a5f' }}
        />
      </Row>
      {arm.fg > 0 && (
        <>
          <Row label="Fussgängervolumen" sub="[Fg/h]">
            <NumInput live value={arm.fg} onChange={v => upd('fg', v)} />
          </Row>
          <Row label="Mittelinsel am Fussgängerstreifen" sub="Art. 47 Abs. 3 VRV">
            <input type="checkbox" checked={arm.mittelinsel ?? false}
              onChange={e => upd('mittelinsel', e.target.checked)}
              style={{ width: 16, height: 16, cursor: 'pointer', accentColor: '#1e3a5f' }}
            />
          </Row>
          {arm.mittelinsel && (
            <div style={{ margin: '2px 14px 8px', padding: '9px 11px', borderRadius: 6,
                          background: '#fefce8', border: '1px solid #fde047',
                          fontSize: 11, color: '#713f12', lineHeight: 1.65 }}>
              <strong style={{ color: '#78350f', display: 'block', marginBottom: 3 }}>
                Wirkung der Mittelinsel (Art. 47 Abs. 3 VRV)
              </strong>
              Bei Fussgängerstreifen ohne Verkehrsregelung, die durch eine Verkehrsinsel unterteilt
              sind, gilt jeder Teil des Überganges als selbständiger Streifen. Fahrzeuge müssen
              Fussgänger*innen, die die Mittelinsel noch nicht erreicht haben, keinen Vortritt
              gewähren.
              <br /><br />
              <strong style={{ color: '#78350f' }}>Beispiel:</strong> Ein Fahrzeug fährt von Arm A
              nach Arm C. An der Ausfahrt C warten Fg auf der gegenüberliegenden Seite —
              sie haben die Mittelinsel noch nicht erreicht. Das Fahrzeug muss nicht warten.
              <br /><br />
              <strong style={{ color: '#78350f' }}>Rechnerisch:</strong> Da die Verteilung
              der Fg auf beide Hälften unbekannt ist, wird konservativ{' '}
              <strong>Q_Fg / 2 = {arm.fg / 2} Fg/h</strong> als wirksames Volumen eingesetzt.
              <br /><br />
              <strong style={{ color: '#78350f' }}>Aktivieren wenn:</strong> Eine physische Insel
              den Fussgängerstreifen sichtbar in zwei Hälften teilt, sodass Fussgänger*innen
              in zwei Etappen queren können.
            </div>
          )}
          <div style={{ padding: '8px 14px', borderBottom: '1px solid #f3f4f6' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between',
                          alignItems: 'center', marginBottom: 5 }}>
              <span style={{ fontSize: 13, color: '#374151' }}>Gruppengrösse ρ</span>
              <span style={{ fontSize: 11, color: '#9ca3af' }}>
                {arm.mittelinsel
                  ? `Q wirksam = ${arm.fg}/2 = ${arm.fg / 2} Fg/h · S_Fg = ${900 * (arm.rho ?? 1)} Fg/h`
                  : `S_Fg = 900 × ${arm.rho ?? 1} = ${900 * (arm.rho ?? 1)} Fg/h`}
              </span>
            </div>
            <select
              value={arm.rho ?? 1}
              onChange={e => upd('rho', Number(e.target.value))}
              style={{ width: '100%', fontSize: 12, padding: '4px 6px', borderRadius: 4,
                       border: '1px solid #d1d5db', cursor: 'pointer', color: '#374151',
                       boxSizing: 'border-box' }}
            >
              {[
                [1, 'Einzeln — ruhige Lage'],
                [2, 'Paarweise — mässig belebt'],
                [3, 'Gruppen à 3 — Innenstadt'],
                [4, 'Grosse Gruppen — sehr belebt'],
                [5, 'Sehr grosse Gruppen — Spitzenlage'],
              ].map(([r, label]) => (
                <option key={r} value={r}>ρ = {r} — {label} ({900 * (r as number)} Fg/h)</option>
              ))}
            </select>
          </div>
          <div style={{ margin: '2px 14px 10px', padding: '9px 11px', borderRadius: 6,
                        background: '#f0f9ff', border: '1px solid #bae6fd',
                        fontSize: 11, color: '#075985', lineHeight: 1.65 }}>
            <strong style={{ color: '#0c4a6e', display: 'block', marginBottom: 3 }}>
              Warum ρ (rho)?
            </strong>
            Mehrere Fussgänger*innen, die gemeinsam queren, blockieren ein Fahrzeug genauso lang wie
            ein Einzelner — das Ereignis ist aber seltener, weil eine Gruppe als ein
            einziges Ereignis zählt. Daher steigt der Sättigungsfluss proportional:{' '}
            <strong>S_Fg = 900 · ρ</strong> [Fg/h] (Gl. 4, Tab. 9, VSS 2011/308).
            <br />
            Je höher ρ → desto grösser S_Fg → desto kleiner y_Fg = Q / S_Fg → desto
            kleiner die Kapazitätsreduktion β = (1 − y_Fg)³ → desto mehr Kapazität
            bleibt für Fahrzeuge.
            <br /><br />
            <strong style={{ color: '#0c4a6e' }}>Wie bestimmen?</strong> ρ wird vor Ort
            beobachtet: wie viele Fg queren im Schnitt gleichzeitig? Typische Richtwerte
            (Tab. 9): ρ = 1 Wohngebiet · ρ = 2–3 Innenstadt · ρ = 4–5 stark belebte
            Lagen. Bei Unsicherheit: ρ = 1 wählen (konservativ, kleinste Kapazität).
          </div>
        </>
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
                  <td style={{ padding: '3px 7px', fontWeight: 700, color: col }}>
                    {s.id}{s.scenario === 'II' && <span title="Szenario II: paralleler Fg-Strom blockiert den Konfliktverkehr (Gl. 6)" style={{ marginLeft: 4, fontSize: 9, color: '#16a34a', fontWeight: 600 }}>Sz II</span>}
                  </td>
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
            <th style={th}>Links<br/>[Fz/h]</th>
            {nodeType !== '3arm' && <th style={th}>Gerade<br/>[Fz/h]</th>}
            <th style={th}>Rechts<br/>[Fz/h]</th>
            <th style={th}>FG<br/>[Fg/h]</th>
            <th style={th}>ρ</th>
          </tr>
        </thead>
        <tbody>
          {arms.map((arm, i) => (
            <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#f7f7f7' }}>
              <td style={tdL}><strong>{armLabel(i)}</strong></td>
              <td style={tdL}>{arm.name || '—'}</td>
              <td style={{ ...td, textAlign: 'center', fontWeight: 600 }}>{roadLabel(arm.roadType)}</td>
              <td style={td}>{arm.left}</td>
              {nodeType !== '3arm' && <td style={td}>{arm.straight}</td>}
              <td style={td}>{arm.right}</td>
              <td style={td}>
                {arm.fg
                  ? arm.mittelinsel ? `${arm.fg} (½)` : arm.fg
                  : '—'}
              </td>
              <td style={td}>{arm.fg > 0 ? (arm.rho ?? 1) : '—'}</td>
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

      {/* Überlast-Hinweis Druckblatt */}
      {result.arms.some(r => !isFinite(r.delay)) && (
        <div style={{ marginBottom: 12, padding: '6px 10px', borderRadius: 3,
                      background: '#fef2f2', border: '1px solid #fca5a5',
                      fontSize: 8.5, color: '#7f1d1d', lineHeight: 1.6 }}>
          <strong>Überlast (x ≥ 1) — Wartezeit nicht berechenbar:</strong>
          {' '}Die Formel (Gl. 1) gilt nur für ungesättigte Zustände (x &lt; 1).
          Einfahrten mit x ≥ 1 sind methodisch nicht auswertbar (VSS 2011/308, S. 87).
        </div>
      )}

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
                  {s.id}{s.scenario === 'II' ? ' (Sz II)' : ''}
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
        L = S·β (Szenario I, Gl. 5); NS-Ströme mit parallelen vortrittsberechtigten Fg-Strömen (Streifen auf nicht überfahrenen HS-Armen, Marker «Sz II»): L = S·y_par + S·(1−y_par)·β (Szenario II, Gl. 6). S_Fz = 1750 Fz/h (HS), 1650 Fz/h (NS). S_Fg = 900·ρ Fg/h (ρ = mittlere Gruppengrösse, Tab. 9).
        Wartezeit nach Gl. 1 (S. 62): C = 0.5 (Rang 1), C = 1.0 (Rang 2 / gleicher Rang).
        Einfahrten-Werte: Volumen-gewichtete Mittel. LOS: A ≤10 s · B ≤20 s · C ≤30 s · D ≤45 s · E &gt;45 s · F Überlast.
      </div>

      {/* Fusszeile */}
      <div style={{ borderTop: '1px solid #bbb', paddingTop: 5,
                    display: 'flex', justifyContent: 'space-between', fontSize: 8, color: '#888' }}>
        <span>Berechnung nach VSS 2011/308 (2015) und VSS 2008/301 (2009). Die Ergebnisse ersetzen keine Überprüfung durch eine Fachperson.</span>
        <span>© 2026 pnfzygrzgf-svg · KnotenCheck · CC BY-NC 4.0</span>
      </div>

    </div>
  )
}

// ── Legende ───────────────────────────────────────────────────────────────────

const LEGEND_ITEMS: LegendItem[] = [
  { abbr: 'Fz/h',   desc: 'Fahrzeuge pro Stunde — Roheingabe Abbiegeströme' },
  { abbr: 'Fg/h',   desc: 'Fussgänger*innen pro Stunde am Fussgängerstreifen dieser Einfahrt — Gesamtvolumen, unabhängig davon ob eine Mittelinsel vorhanden ist' },
  { abbr: 'MI',     desc: 'Mittelinsel (Verkehrsinsel) am Fussgängerstreifen — teilt den Streifen in zwei selbständige Teile (Art. 47 Abs. 3 VRV). Fahrzeuge müssen Fg, die die Insel noch nicht erreicht haben, keinen Vortritt gewähren. Rechnerisch: wirksames Q_Fg = Q_Fg / 2 (konservative Annahme gleichmässiger Verteilung auf beide Hälften).' },
  { abbr: 'HS',     desc: 'Hauptstrasse — Rang 1, hat Vortritt gegenüber NS-Fahrzeugen' },
  { abbr: 'NS',     desc: 'Nebenstrasse — Rang 2, muss Rang-1-Ströme und Fussgänger*innen abwarten' },
  { abbr: 'Q',  unit: 'Fz/h', desc: 'Belastung eines Stroms — Summe aller Fahrzeuge in dieser Bewegungsrichtung pro Stunde' },
  { abbr: 'S',       desc: 'Sättigungsfluss — empirische Richtwerte (Tab. 13, VSS 2011/308): Fahrzeuge Rang 1 = 1750 Fz/h, Rang 2 = 1650 Fz/h; Fussgänger*innen = 900·ρ Fg/h (ρ = mittlere Anzahl gemeinsam querender Fg, Tab. 9); Tram = 340 T/h; Bus = 600 B/h' },
  { abbr: 'ρ',       desc: 'Mittlere Gruppengrösse gemeinsam querender Fussgänger*innen — bestimmt den Fg-Sättigungsfluss S_Fg = 900·ρ [Fg/h] (Gl. 4, Tab. 9, VSS 2011/308). Grundidee: Mehrere Fg, die gleichzeitig queren, blockieren ein Fahrzeug genauso lang wie einer allein — das Ereignis ist aber seltener. Mit steigendem ρ sinkt y_Fg = Q/S_Fg und damit β = (1−y_Fg)³ wird grösser → mehr Kapazität für Fahrzeuge. Bestimmung durch Vor-Ort-Beobachtung. Richtwerte: ρ=1 Wohngebiet · ρ=2–3 Innenstadt · ρ=4–5 stark belebte Lagen. Konservativ: ρ=1.' },
  { abbr: 'y',       desc: 'Sättigungsgrad = Q / S — Auslastung des Stroms relativ zur Sättigung; Grundgrösse für die β-Berechnung (Abkürzungsverz., VSS 2011/308)' },
  { abbr: 'β',      desc: 'Reduktionsfaktor — Π aller β_i der senkrechten Ströme (Gl. 12); β_i je Verkehrsart (Abb. 23): Bus/Tram = (1−y_i)¹ · Abbieg. Fz/Fg = (1−y_i)³ · Kreisverkehr = (1−y_i)² · Gleicher Rang = y_i/(y₁+y_i) (Kap. 5, VSS 2011/308)' },
  { abbr: 'L',  unit: 'Fz/h', desc: 'Kapazität des Stroms — Szenario I: L = S × β (Gl. 5); Szenario II (paralleler vortrittsberechtigter Fg-Strom blockiert den Konfliktverkehr): L = S·y_par + S·(1−y_par)·β (Gl. 6, Abb. 22/35, Kap. 5)' },
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
  const { msg: toastMsg, show: showToast } = useToast()

  function handleNodeTypeChange(t: NodeType) {
    setNodeType(t)
    setArms(defaultArms(t))
  }

  function updateArm(index: number, arm: ArmInput) {
    setArms(prev => prev.map((a, i) => i === index ? arm : a))
  }

  const handleExport = () =>
    exportTool({
      tool: 'vss308', filePrefix: 'VSS308',
      name: nodeName, showToast,
      data: { nodeName, nodeType, arms },
    })

  const handleImport = () =>
    importTool<{ nodeName: string; nodeType: NodeType; arms: ArmInput[] }>(
      'vss308', d => {
        setNodeName(d.nodeName ?? '')
        // 'equal' (Gleicher Rang) ist vorerst ausgeblendet → auf '4arm' abbilden,
        // damit ältere gespeicherte Dateien nicht in einem unerreichbaren Modus landen.
        const nt: NodeType = d.nodeType === 'equal' ? '4arm' : (d.nodeType ?? '4arm')
        setNodeType(nt)
        setArms((nt === d.nodeType ? (d.arms ?? defaultArms(nt)) : defaultArms(nt)).map(a => ({ ...a, rho: a.rho ?? 1, mittelinsel: a.mittelinsel ?? false })))
      }, showToast)

  function handleReset() {
    setNodeName('')
    setArms(prev => prev.map(arm => ({ ...arm, name: '', right: 0, straight: 0, left: 0, fg: 0 })))
    showToast('Zurückgesetzt')
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
    : <img src={kreuzungSvg} alt="Kreuzung" style={{ width: '100%', height: 'auto', display: 'block' }} />

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
          // 'Gleicher Rang (Rechtsvortritt)' vorerst ausgeblendet — das Modell ist
          // noch nicht belastbar (lastunabhängige Kapazität, fragwürdige Paarung,
          // inkonsistente Überlast-Anzeige, Fussgänger nicht berücksichtigt).
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
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
          <button onClick={handleExport}
            style={{ padding: '4px 12px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
                     border: '1px solid #d1d5db', background: '#f9fafb', color: '#374151' }}>
            Speichern
          </button>
          <button onClick={handleImport}
            style={{ padding: '4px 12px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
                     border: '1px solid #d1d5db', background: '#f9fafb', color: '#374151' }}>
            Laden
          </button>
          <button onClick={handleReset}
            style={{ padding: '4px 8px', fontSize: 11, cursor: 'pointer',
                     background: 'none', border: 'none', color: '#9ca3af',
                     textDecoration: 'underline' }}>
            Zurücksetzen
          </button>
        </div>
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

            {/* Überlast-Warnung */}
            {result.arms.some(r => !isFinite(r.delay)) && (
              <div style={{ margin: '0 12px 8px', padding: '10px 12px', borderRadius: 6,
                            background: '#fef2f2', border: '1.5px solid #fca5a5',
                            fontSize: 11, color: '#7f1d1d', lineHeight: 1.65 }}>
                <strong style={{ display: 'block', marginBottom: 3 }}>
                  Überlast — Wartezeit nicht berechenbar (x ≥ 1)
                </strong>
                Die Wartezeit-Formel (Gl. 1, VSS 2011/308) gilt ausschliesslich für{' '}
                <strong>ungesättigte Zustände (x &lt; 1)</strong>. Bei übersättigten
                Einfahrten (x ≥ 1) bricht die Formel methodisch zusammen —
                «&gt; 999 s» ist kein berechneter Wert, sondern zeigt an, dass das
                Modell in diesem Bereich nicht anwendbar ist. Die Ergebnisse dieser
                Einfahrten sind nicht interpretierbar (VSS 2011/308, S. 87).
              </div>
            )}

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
              (Menendez/Guler/Puffe). Pro Strom: β = ∏(1−y<sub>i</sub>)³
              über alle senkrechten Rang-1-Ströme (HS-Fz + Fg Ein-/Ausfahrt).
              S_Fg = 900·ρ (bei Mittelinsel Q_Fg/2, Art. 47 Abs. 3 VRV). L = S·β (Szenario I, Gl. 5); für NS-Ströme mit parallelen vortrittsberechtigten Fg-Strömen (Fussgängerstreifen auf HS-Armen, die der Strom nicht überfährt) gilt L = S·y_par + S·(1−y_par)·β (Szenario II, Gl. 6, Abb. 22/35) — der Streifen blockiert den HS-Konfliktverkehr und verschafft dem NS-Strom Zeitfenster.
              Einfahrten-Werte: Volumen-gewichtetes Mittel.
              C = 0.5 (Rang 1), C = 1.0 (Rang 2 / gleicher Rang).
            </div>

          </div>
        </div>
      </div>

      <LegendBox items={LEGEND_ITEMS} />

      <footer style={{ fontSize: 11, color: '#9ca3af', textAlign: 'center', marginTop: 24, lineHeight: 2 }}>
        <div>
          Berechnung nach «Verkehrsablauf an ungesteuerten Knoten innerorts unter Berücksichtigung
          der verschiedenen Verkehrsarten; Ermittlung repräsentativer Richtwerte und Zusammenhänge»
          (2015) und «Verkehrsqualität und Leistungsfähigkeit von komplexen ungesteuerten Knoten:
          Analytisches Schätzverfahren» (2009).
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
    <Toast msg={toastMsg} />
    </>
  )
}
