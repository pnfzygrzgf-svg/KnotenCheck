import { useState, useMemo, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import {
  calculateLSAV2, defaultLanesAndPhases, armStreamIds, STREAM_LABELS, suggestPhasePlan,
} from './engine/lsaCalculatorV2'
import { exportTool, importTool } from './saveLoad'
import { useToast, Toast } from './Toast'
import { LegendBox, type LegendItem } from './LegendBox'
import { LOS_COLOR, LOS_BG, LOSBadge, NumInput, utilizationColor } from './ui'
import type {
  Lane, PhaseDefinition, LevelOfService, LSAResultV2,
} from './engine/lsaCalculatorV2'
import lsa4ArmSvg from './assets/LSA_4_Arm.svg?url'
import lsa3ArmSvg from './assets/LSA_3_Arm.svg?url'

// ── Fahrzeugzusammensetzung ───────────────────────────────────────────────────
interface VehicleMix { pctLW: number; pctMR: number; pctFR: number }
function pctPW(m: VehicleMix) { return Math.max(0, 100 - m.pctLW - m.pctMR - m.pctFR) }
function armFactor(m?: VehicleMix): number {
  if (!m) return 1
  const pw = pctPW(m), tot = pw + m.pctLW + m.pctMR + m.pctFR
  return tot <= 0 ? 1 : (pw + m.pctLW * 2 + m.pctMR * 0.5 + m.pctFR * 0.25) / tot
}

// ── FGS-Konfiguration ─────────────────────────────────────────────────────────
interface FGSArmConfig { enabled: boolean; volume: number; length: number }
const DEFAULT_FGS: FGSArmConfig = { enabled: false, volume: 0, length: 6 }

// ── UI-Arm-Eingabe ────────────────────────────────────────────────────────────
interface UIArmInput { name: string; left: number; straight: number; right: number; mix?: VehicleMix; vDesign?: 30|50|60 }
interface ArmInput   { name: string; left: number; straight: number; right: number }
function toEngineArm(a: UIArmInput): ArmInput {
  const f = armFactor(a.mix)
  return { name: a.name, left: Math.round(a.left*f), straight: Math.round(a.straight*f), right: Math.round(a.right*f) }
}
function tzFromSpeed(v?: 30|50|60): number {
  if (v === 30) return 3
  if (v === 60) return 5
  return 4  // eigene Staffelung (≈ Gelbzeit VSS 40 837 Tab. 1 + 1 s); Norm-Pauschale: 5 s
}
function defaultArms(n: 3|4): UIArmInput[] {
  if (n === 3) return [
    { name:'', left:0, straight:0, right:0, vDesign:50 },
    { name:'', left:0, straight:0, right:0, vDesign:50 },
    { name:'', left:0, straight:0, right:0, vDesign:50 },
  ]
  return [
    { name:'', left:0, straight:0, right:0, vDesign:50 },
    { name:'', left:0, straight:0, right:0, vDesign:50 },
    { name:'', left:0, straight:0, right:0, vDesign:50 },
    { name:'', left:0, straight:0, right:0, vDesign:50 },
  ]
}

// Ströme → Volumen aus Arm-Eingaben und FGS-Konfiguration
function computeVolumes(
  armCount: 3|4,
  arms: UIArmInput[],
  fgsConfig: Record<string, FGSArmConfig>,
): Record<string,number> {
  const [A,C,B,D] = arms.map(toEngineArm)
  const base: Record<string,number> = armCount === 3 ? {
    q2: A?.straight??0, q3: A?.right??0,
    q4: B?.left??0,     q6: B?.right??0,
    q7: C?.left??0,     q8: C?.straight??0,
  } : {
    q1:A?.left??0,  q2:A?.straight??0, q3:A?.right??0,
    q4:B?.left??0,  q5:B?.straight??0, q6:B?.right??0,
    q7:C?.left??0,  q8:C?.straight??0, q9:C?.right??0,
    q10:D?.left??0, q11:D?.straight??0,q12:D?.right??0,
  }
  const armLabels = armCount === 3 ? ['A','C','B'] : ['A','C','B','D']
  for (const lbl of armLabels) {
    const cfg = fgsConfig[lbl]
    if (cfg?.enabled) base[`fgs-${lbl}`] = cfg.volume
  }
  return base
}

// Bezeichnung Bewegungen pro Arm
type Movement = {id:string; label:string; direction:'left'|'straight'|'right'}
function armMovements(armCount: 3|4, armIdx: number): Movement[] {
  if (armCount === 3) {
    if (armIdx === 0) return [
      {id:'q2',label:'Geradeaus →C',direction:'straight'},
      {id:'q3',label:'Rechts →B',direction:'right'},
    ]
    if (armIdx === 1) return [
      {id:'q7',label:'Links →B',direction:'left'},
      {id:'q8',label:'Geradeaus →A',direction:'straight'},
    ]
    return [
      {id:'q4',label:'Links →A',direction:'left'},
      {id:'q6',label:'Rechts →C',direction:'right'},
    ]
  }
  if (armIdx === 0) return [
    {id:'q1',label:'Links →D',direction:'left'},
    {id:'q2',label:'Geradeaus →C',direction:'straight'},
    {id:'q3',label:'Rechts →B',direction:'right'},
  ]
  if (armIdx === 1) return [
    {id:'q7',label:'Links →B',direction:'left'},
    {id:'q8',label:'Geradeaus →A',direction:'straight'},
    {id:'q9',label:'Rechts →D',direction:'right'},
  ]
  if (armIdx === 2) return [
    {id:'q4',label:'Rechts →A',direction:'right'},
    {id:'q5',label:'Geradeaus →D',direction:'straight'},
    {id:'q6',label:'Links →C',direction:'left'},
  ]
  return [
    {id:'q12',label:'Links →A',direction:'left'},
    {id:'q11',label:'Geradeaus →B',direction:'straight'},
    {id:'q10',label:'Rechts →C',direction:'right'},
  ]
}

// Wartezeit-Format in dichten Ergebnis-Tabellen — bewusst ohne «ca.»-Präfix
function delayText(w:number) {
  if (!isFinite(w)) return '>999 s'
  if (w<1) return '<1 s'
  return `${Math.round(w)} s`
}

// ── Kleine Hilfskomponenten ───────────────────────────────────────────────────
function StepBadge({ n, label }: { n:number|string; label:string }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:12 }}>
      <div style={{ minWidth:26, height:26, borderRadius:13, background:'#1e3a5f',
                    color:'#fff', fontSize:11, fontWeight:800, padding:'0 5px',
                    display:'flex', alignItems:'center', justifyContent:'center',
                    whiteSpace:'nowrap' }}>{n}</div>
      <span style={{ fontSize:15, fontWeight:700, color:'#1e3a5f' }}>{label}</span>
    </div>
  )
}

// ── ArmCard ───────────────────────────────────────────────────────────────────
function ArmCard({ arm, index, armCount, onChange }: {
  arm:UIArmInput; index:number; armCount:3|4; onChange:(a:UIArmInput)=>void
}) {
  const labels = ['A','C','B','D']
  const lbl = labels[index]
  const col = '#1e3a5f'
  const bg  = '#f0f4f8'
  const bd  = '#c3cdd8'
  const moves = armMovements(armCount, index)
  const upd = <K extends keyof UIArmInput>(k:K, v:UIArmInput[K]) => onChange({...arm,[k]:v})
  const updMix = (k:keyof VehicleMix, v:number) => arm.mix && onChange({...arm, mix:{...arm.mix,[k]:v}})
  return (
    <div style={{ background:'#fff', borderRadius:10, border:`1.5px solid ${bd}`, overflow:'hidden' }}>
      <div style={{ background:bg, borderBottom:`1px solid ${bd}`,
                    padding:'8px 12px', display:'flex', alignItems:'center', gap:8 }}>
        <span style={{ fontWeight:800, fontSize:16, color:col, background:'#fff',
                       border:`1.5px solid ${bd}`, borderRadius:5,
                       minWidth:26, textAlign:'center', padding:'1px 5px' }}>{lbl}</span>
        <input type="text" placeholder="Name (optional)" value={arm.name}
          onChange={e => upd('name', e.target.value)}
          style={{ flex:1, border:'none', background:'transparent', fontSize:13,
                   fontWeight:600, color:col, outline:'none' }} />
      </div>
      <div style={{ fontSize:11, fontWeight:700, letterSpacing:'0.06em', color:'#6b7280',
                    background:'#f9fafb', borderBottom:'1px solid #f0f0f0',
                    padding:'4px 12px', textTransform:'uppercase' }}>Fz/h</div>
      {moves.map(m => {
        const num = m.id.replace('q','')
        return (
          <div key={m.id} style={{ display:'flex', alignItems:'center', gap:8,
                                   padding:'6px 12px', borderBottom:'1px solid #f3f4f6' }}>
            <div style={{ flex:1, fontSize:13, color:'#374151' }}>{num}: {m.label}</div>
            <NumInput value={(arm[m.direction as keyof UIArmInput] as number)??0}
              onChange={v => upd(m.direction as keyof UIArmInput, v)} />
          </div>
        )
      })}
      {/* Fahrzeugzusammensetzung */}
      <div style={{ padding:'5px 12px', borderBottom:'1px solid #f3f4f6',
                    display:'flex', alignItems:'center', gap:8, fontSize:12, color:'#6b7280' }}>
        <input type="checkbox" checked={arm.mix!==undefined}
          onChange={e => onChange({...arm, mix: e.target.checked
            ? {pctLW:5,pctMR:2,pctFR:0} : undefined})}
          style={{ cursor:'pointer', accentColor:'#1e3a5f' }} />
        Fahrzeugmix
        {arm.mix && (
          <span style={{ marginLeft:'auto', fontWeight:600, color:'#1e3a5f' }}>
            f = {armFactor(arm.mix).toFixed(3)}
          </span>
        )}
      </div>
      {arm.mix && (
        <div style={{ padding:'4px 12px 8px', display:'flex', flexDirection:'column', gap:3 }}>
          {([['pctLW','LW',2],['pctMR','MR',0.5],['pctFR','FR',0.25]] as const).map(([k,lbl2,f2]) => (
            <div key={k} style={{ display:'flex', alignItems:'center', gap:6, fontSize:12 }}>
              <span style={{ width:100, color:'#6b7280' }}>{lbl2} (f={f2})</span>
              <NumInput value={arm.mix![k]} onChange={v => updMix(k,v)} max={100} width={52} />
              <span style={{ color:'#9ca3af' }}>%</span>
            </div>
          ))}
          <div style={{ fontSize:11, color:'#9ca3af', marginTop:2 }}>
            PW: {pctPW(arm.mix).toFixed(0)}%
          </div>
        </div>
      )}
      {/* Zulässige Geschwindigkeit → Zwischenzeit T_Z (eigene Staffelung, angelehnt an Gelbzeiten VSS 40 837) */}
      <div style={{ padding:'5px 12px 8px', display:'flex', alignItems:'center', gap:5,
                    fontSize:12, color:'#6b7280', borderTop:'1px solid #f3f4f6' }}>
        <span style={{ whiteSpace:'nowrap', marginRight:2 }}>v<sub>zul</sub>:</span>
        {([30, 50, 60] as const).map(v => (
          <button key={v} onClick={() => upd('vDesign', v)}
            style={{ padding:'2px 7px', borderRadius:4, fontSize:11, cursor:'pointer', fontWeight:600,
                     background: (arm.vDesign ?? 50) === v ? '#1e3a5f' : '#f3f4f6',
                     color: (arm.vDesign ?? 50) === v ? '#fff' : '#374151',
                     border: (arm.vDesign ?? 50) === v ? '1.5px solid #1e3a5f' : '1.5px solid #e5e7eb' }}>
            {v} km/h
          </button>
        ))}
        <span style={{ marginLeft:'auto', color:'#9ca3af', fontSize:11 }}>
          T_Z = {tzFromSpeed(arm.vDesign ?? 50)} s
        </span>
      </div>
    </div>
  )
}

// ── Schritt 2: Fahrstreifenplan-Editor ────────────────────────────────────────
function LanePlanSection({ armCount, volumes, moveLane, onChange, fgsConfig, onFgsChange }: {
  armCount: 3|4
  volumes: Record<string,number>
  moveLane: Record<string,1|2>
  onChange: (ml:Record<string,1|2>) => void
  fgsConfig: Record<string, FGSArmConfig>
  onFgsChange: (lbl:string, cfg:FGSArmConfig) => void
}) {
  const armLabels = armCount===3 ? ['A','C','B'] : ['A','C','B','D']
  const col = '#1e3a5f'
  const bd  = '#c3cdd8'
  const bg  = '#f0f4f8'

  return (
    <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(240px,1fr))', gap:12 }}>
      {armLabels.map((lbl,armIdx) => {
        const moves = armMovements(armCount, armIdx)
        const fs1Q = Math.max(0,...moves.filter(m=>(moveLane[m.id]??1)===1).map(m=>volumes[m.id]??0))
        const fs2Moves = moves.filter(m=>moveLane[m.id]===2)
        const fs2Q = fs2Moves.length>0 ? Math.max(0,...fs2Moves.map(m=>volumes[m.id]??0)) : null
        const fgs = fgsConfig[lbl] ?? DEFAULT_FGS

        return (
          <div key={lbl} style={{ background:'#fff', borderRadius:10,
                                   border:`1.5px solid ${bd}`, overflow:'hidden' }}>
            <div style={{ background:bg, borderBottom:`1px solid ${bd}`,
                          padding:'7px 12px', display:'flex', alignItems:'center', gap:8 }}>
              <span style={{ fontWeight:800, fontSize:15, color:col, background:'#fff',
                             border:`1.5px solid ${bd}`, borderRadius:5,
                             padding:'1px 6px' }}>{lbl}</span>
            </div>

            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
              <thead>
                <tr style={{ background:'#f9fafb' }}>
                  <th style={{ padding:'4px 8px', textAlign:'left', fontWeight:600, color:'#6b7280' }}>Bewegung</th>
                  <th style={{ padding:'4px 8px', textAlign:'right', fontWeight:600, color:'#6b7280' }}>PWE/h</th>
                  <th style={{ padding:'4px 8px', textAlign:'center', fontWeight:600, color:'#6b7280' }}>FS1</th>
                  <th style={{ padding:'4px 8px', textAlign:'center', fontWeight:600, color:'#6b7280' }}>FS2</th>
                </tr>
              </thead>
              <tbody>
                {moves.map(m => {
                  const num = m.id.replace('q','')
                  const q = volumes[m.id]??0
                  const onFS2 = moveLane[m.id]===2
                  return (
                    <tr key={m.id} style={{ borderTop:'1px solid #f3f4f6' }}>
                      <td style={{ padding:'5px 8px', color:'#374151' }}>
                        {num}. {m.label}
                        <span style={{ fontSize:10, color:'#9ca3af', marginLeft:4 }}>{m.id}</span>
                      </td>
                      <td style={{ padding:'5px 8px', textAlign:'right',
                                   color: q>0?'#374151':'#d1d5db', fontWeight: q>0?600:400 }}>
                        {q}
                      </td>
                      <td style={{ padding:'5px 8px', textAlign:'center' }}>
                        <input type="radio" name={`fs-${lbl}-${m.id}`}
                          checked={!onFS2} onChange={() => {
                            const n = {...moveLane}; delete n[m.id]; onChange(n)
                          }} style={{ accentColor:'#1e3a5f', cursor:'pointer' }} />
                      </td>
                      <td style={{ padding:'5px 8px', textAlign:'center' }}>
                        <input type="radio" name={`fs-${lbl}-${m.id}`}
                          checked={onFS2} onChange={() => onChange({...moveLane,[m.id]:2})}
                          style={{ accentColor:'#1e3a5f', cursor:'pointer' }} />
                      </td>
                    </tr>
                  )
                })}
                {/* FGS-Zeile */}
                <tr style={{ borderTop:'2px solid #f0f0f0', background: fgs.enabled ? '#f0fdf4' : '#fafafa' }}>
                  <td colSpan={4} style={{ padding:'6px 8px' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                      <label style={{ display:'flex', alignItems:'center', gap:5, cursor:'pointer',
                                      fontSize:12, fontWeight:600, color:'#374151', whiteSpace:'nowrap' }}>
                        <input type="checkbox" checked={fgs.enabled}
                          onChange={e => onFgsChange(lbl, {...fgs, enabled:e.target.checked})}
                          style={{ cursor:'pointer', accentColor:'#15803d' }} />
                        FGS
                      </label>
                      {fgs.enabled && (<>
                        <NumInput value={fgs.volume}
                          onChange={v => onFgsChange(lbl, {...fgs, volume:v})}
                          width={60} />
                        <span style={{ fontSize:11, color:'#6b7280' }}>Fg/h</span>
                        <NumInput value={fgs.length}
                          onChange={v => onFgsChange(lbl, {...fgs, length:v})}
                          max={50} width={46} />
                        <span style={{ fontSize:11, color:'#6b7280' }}>m</span>
                      </>)}
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>

            <div style={{ padding:'6px 10px', display:'flex', gap:10, fontSize:11,
                          borderTop:'1px solid #f3f4f6', background:'#fafafa' }}>
              <span style={{ color:'#6b7280' }}>
                FS1: <strong>{fs1Q} PWE/h</strong>
              </span>
              {fs2Q !== null && (
                <span style={{ color:'#6b7280' }}>
                  FS2: <strong>{fs2Q} PWE/h</strong>
                </span>
              )}
              {fgs.enabled && (
                <span style={{ color:'#15803d' }}>
                  FGS: <strong>{fgs.volume} Fg/h</strong>
                </span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Phasen-State ──────────────────────────────────────────────────────────────
interface PhaseState { id:number; selectedLaneIds:string[] }

// ── Schritt 3: Phasenplan-Editor ──────────────────────────────────────────────
function PhasePlanSection({ lanes, phaseStates, onChange, onApplyDefault, onSuggestMinimal, result }: {
  lanes: Lane[]
  phaseStates: PhaseState[]
  onChange: (ps:PhaseState[]) => void
  onApplyDefault: () => void
  onSuggestMinimal: () => void
  result: LSAResultV2 | null
}) {
  let nextId = Math.max(0, ...phaseStates.map(p=>p.id)) + 1

  function toggle(phaseId:number, laneId:string) {
    onChange(phaseStates.map(ph => ph.id !== phaseId ? ph : {
      ...ph,
      selectedLaneIds: ph.selectedLaneIds.includes(laneId)
        ? ph.selectedLaneIds.filter(id=>id!==laneId)
        : [...ph.selectedLaneIds, laneId],
    }))
  }
  function addPhase() {
    onChange([...phaseStates, {id:nextId, selectedLaneIds:[]}])
  }
  function removePhase(id:number) {
    if (phaseStates.length<=1) return
    onChange(phaseStates.filter(ph=>ph.id!==id))
  }

  const ARM_COLORS = ['#1e3a5f','#1e3a5f','#1e3a5f','#1e3a5f']
  const ARM_LABELS = ['A','C','B','D']

  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:6, flexWrap:'wrap' }}>
        <button onClick={onApplyDefault}
          title="Lädt einen fixen Standard-Phasenplan (Hauptstrasse A+C | Nebenstrasse B+D) — unabhängig von den eingegebenen Verkehrsstärken. Nützlich als Ausgangspunkt."
          style={{ padding:'5px 12px', fontSize:12, borderRadius:6, cursor:'pointer',
                   background:'#f3f4f6', border:'1px solid #d1d5db', color:'#374151',
                   fontWeight:600 }}>
          Vorschlag laden
        </button>
        <button onClick={onSuggestMinimal}
          title="Berechnet die kleinstmögliche Phasenzahl, die alle aktiven Fahrstreifen konfliktfrei trennt — basierend auf den eingegebenen Verkehrsstärken (nur Ströme mit Q &gt; 0)."
          style={{ padding:'5px 12px', fontSize:12, borderRadius:6, cursor:'pointer',
                   background:'#eff6ff', border:'1px solid #bfdbfe', color:'#1d4ed8',
                   fontWeight:600 }}>
          Minimaler Phasenplan
        </button>
      </div>
      <div style={{ display:'flex', gap:20, marginBottom:10, flexWrap:'wrap' }}>
        <span style={{ fontSize:11, color:'#6b7280' }}>
          <span style={{ fontWeight:600 }}>Vorschlag laden:</span> Fixer Standard HS (A+C) | NS (B{lanes.some(l=>l.armIndex===3)?'+D':''}), unabhängig von Verkehrsstärken
        </span>
        <span style={{ fontSize:11, color:'#6b7280' }}>
          <span style={{ fontWeight:600 }}>Minimaler Phasenplan:</span> Kleinstmögliche Phasenzahl für aktive Ströme (Backtracking-Coloring, Ziffer 11 VSS 40 023a)
        </span>
      </div>

      <div style={{ overflowX:'auto' }}>
        <table style={{ borderCollapse:'collapse', fontSize:12, minWidth:400 }}>
          <thead>
            <tr>
              <th style={{ padding:'6px 10px', textAlign:'left', background:'#f9fafb',
                           border:'1px solid #e5e7eb', color:'#6b7280', fontWeight:600, width:70 }}>
                Phase
              </th>
              {lanes.map(l => {
                const armIdx = l.armIndex
                const col = l.isFGS ? '#15803d' : (ARM_COLORS[armIdx] ?? '#374151')
                const lbl = ARM_LABELS[armIdx] ?? '?'
                const colLabel = l.isFGS ? 'FGS' : l.id.includes('FS2') ? 'FS2' : 'FS1'
                const unitLabel = l.isFGS ? 'Fg/h' : 'PWE/h'
                const qk = result?.lanes.find(r=>r.laneId===l.id)?.qKrit ?? 0
                return (
                  <th key={l.id} style={{ padding:'5px 8px', textAlign:'center',
                                          background: l.isFGS ? '#f0fdf4' : '#f9fafb',
                                          border:'1px solid #e5e7eb', minWidth:72 }}>
                    <div style={{ fontWeight:700, color:col, fontSize:11 }}>
                      {lbl} {colLabel}
                    </div>
                    {!l.isFGS && l.streamIds.length > 0 && (
                      <div style={{ fontSize:10, color:'#6b7280', fontWeight:400 }}>
                        {l.streamIds.map(s=>s.replace('q','')).join(', ')}
                      </div>
                    )}
                    <div style={{ fontSize:10, color:'#9ca3af' }}>{qk} {unitLabel}</div>
                  </th>
                )
              })}
              <th style={{ padding:'5px 8px', background:'#f9fafb',
                           border:'1px solid #e5e7eb', width:24 }}></th>
            </tr>
          </thead>
          <tbody>
            {phaseStates.map((ph, pi) => {
              const pr = result?.phases[pi]
              const bg = pi%2===0 ? '#fff' : '#fafafa'
              return (
                <tr key={ph.id}>
                  <td style={{ padding:'6px 10px', border:'1px solid #e5e7eb',
                                background:bg, fontWeight:700, color:'#374151' }}>
                    <div>{pi+1}</div>
                    {pr && (
                      <div style={{ fontSize:10, color:'#9ca3af', marginTop:2 }}>
                        Q={Math.round(pr.qKrit)}
                      </div>
                    )}
                  </td>
                  {lanes.map(l => (
                    <td key={l.id} style={{ padding:'0', textAlign:'center',
                                            border:'1px solid #e5e7eb', background:bg }}>
                      <label style={{ display:'block', padding:'10px 8px', cursor:'pointer' }}>
                        <input type="checkbox"
                          checked={ph.selectedLaneIds.includes(l.id)}
                          onChange={() => toggle(ph.id, l.id)}
                          style={{ cursor:'pointer',
                                   accentColor: l.isFGS ? '#15803d' : '#1e3a5f',
                                   width:14, height:14 }} />
                      </label>
                    </td>
                  ))}
                  <td style={{ padding:'4px 6px', border:'1px solid #e5e7eb', background:bg,
                                textAlign:'center' }}>
                    <button onClick={() => removePhase(ph.id)} title="Phase entfernen"
                      style={{ background:'none', border:'none', cursor:'pointer',
                               color:'#9ca3af', fontSize:14, lineHeight:1,
                               padding:'2px 4px', borderRadius:3 }}>×</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Phase-Infos unterhalb der Tabelle */}
      {result && (
        <div style={{ marginTop:8, display:'flex', gap:8, flexWrap:'wrap' }}>
          {result.phases.map((pr, i) => {
            const below = pr.belowMinGreen
            return (
              <div key={pr.id} style={{
                padding:'6px 10px', borderRadius:8, fontSize:11,
                border: below ? '1px solid #fca5a5' : '1px solid #e5e7eb',
                background: below ? '#fff5f5' : '#f8fafc',
                minWidth:160,
              }}>
                <div style={{ fontWeight:700, color:'#374151', marginBottom:3 }}>Phase {i+1}</div>
                <div style={{ color:'#6b7280' }}>Q_krit: <strong>{Math.round(pr.qKrit)} PWE/h</strong></div>
                <div style={{ color:'#6b7280' }}>
                  t_Gr_min: <strong>{pr.tGrMin.toFixed(1)} s</strong>
                  {pr.tGrMin > 4 && <span style={{ color:'#15803d' }}> (FGS)</span>}
                </div>
                <div style={{ color:'#6b7280' }}>Q_krit_min: <strong>{Math.round(pr.qKritMin)} PWE/h</strong></div>
                <div style={{ color:'#6b7280' }}>
                  t_Gr: <strong>{pr.tGr.toFixed(1)} s</strong>
                  {'  '}λ: <strong>{(pr.lambda*100).toFixed(1)}%</strong>
                </div>
                {below && (
                  <div style={{ color:'#dc2626', fontWeight:600, marginTop:3 }}>
                    ⚠ Q_krit &lt; Q_krit_min
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Konflikte */}
      {result && result.conflicts.length > 0 && (
        <div style={{ marginTop:10, padding:'8px 12px', borderRadius:8,
                      background:'#fffbeb', border:'1px solid #fbbf24', fontSize:12 }}>
          <div style={{ fontWeight:700, color:'#92400e', marginBottom:4 }}>
            ⚠ Unverträgliche Ströme in selber Phase:
          </div>
          {result.conflicts.map((c,i) => {
            const phIdx = phaseStates.findIndex(ph=>ph.id===c.phaseId)
            return (
              <div key={i} style={{ color:'#92400e' }}>
                Phase {phIdx+1}: {c.streamA} ({STREAM_LABELS[c.streamA]??c.streamA})
                {' '}↔{' '}{c.streamB} ({STREAM_LABELS[c.streamB]??c.streamB})
              </div>
            )
          })}
        </div>
      )}

      <button onClick={addPhase}
        style={{ marginTop:10, padding:'5px 14px', fontSize:12, borderRadius:6,
                 cursor:'pointer', background:'#eff6ff', border:'1px solid #bfdbfe',
                 color:'#1d4ed8', fontWeight:600 }}>
        + Phase hinzufügen
      </button>
    </div>
  )
}

// ── Ergebnis-Panel ────────────────────────────────────────────────────────────
function ResultsPanelV2({ result, targetLos, onTargetLos, onPrint }: {
  result: LSAResultV2
  targetLos: LevelOfService
  onTargetLos: (l:LevelOfService) => void
  onPrint: () => void
}) {
  const { Z, zIsManual, sumQKrit, maxQKrit, overloaded, lanes, overallLos, meetsTargetLos } = result
  const reserve = maxQKrit - sumQKrit
  const activeVehLanes = lanes.filter(l=>l.qKrit>0 && !l.isFGS)
  const activeFgsLanes = lanes.filter(l=>l.qKrit>0 && l.isFGS)

  return (
    <div style={{ background:'#fff', borderRadius:10, border:'1px solid #e5e7eb', overflow:'hidden' }}>

      {/* Bewertungsblatt + Schritt 4+5 Label */}
      <div style={{ padding:'10px 14px 0', borderBottom:'none' }}>
        <button onClick={onPrint}
          style={{ display:'block', width:'100%', marginBottom:10, padding:'7px 0', borderRadius:6,
                   fontSize:12, cursor:'pointer', border:'1px solid #1e3a5f',
                   background:'#1e3a5f', color:'#fff', fontWeight:600 }}>
          Bewertungsblatt (Druckansicht)
        </button>
        <StepBadge n="4/5" label="Leistungsfähigkeit L und Verkehrsqualität beurteilen" />
        <p style={{ fontSize:12, color:'#6b7280', margin:'-6px 0 8px' }}>
          Schritt 4: L, λ, X und w_m je Fahrstreifen (Ziffer 11.3, 12). Schritt 5: VQS zugeordnet vs. tatsächlich (Tab. 4).
          Annahmen: S = 1800 PWE/h, T_Z = {result.tZ} s/Phase. <strong>Ohne ÖV-Privilegierung</strong> (Ziffer 11.4).
        </p>
      </div>

      {/* Gesamt-VQS */}
      <div style={{ padding:'12px 14px', borderBottom:'1px solid #e5e7eb',
                    background:LOS_BG[overallLos] }}>
        <div style={{ fontSize:11, fontWeight:700, letterSpacing:'0.06em', textTransform:'uppercase',
                      color:LOS_COLOR[overallLos], marginBottom:4 }}>Qualitätsstufe Knoten</div>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <span style={{ fontSize:46, fontWeight:800, color:LOS_COLOR[overallLos], lineHeight:1 }}>
            {overallLos}
          </span>
          <div style={{ fontSize:12, color:LOS_COLOR[overallLos] }}>
            {overallLos==='A' && 'Sehr gut — sehr kurze Wartezeiten'}
            {overallLos==='B' && 'Gut — kurze Wartezeiten'}
            {overallLos==='C' && 'Zufriedenstellend'}
            {overallLos==='D' && 'Ausreichend — beträchtliche Wartezeiten'}
            {overallLos==='E' && 'Mangelhaft — lange Wartezeiten'}
            {overallLos==='F' && 'Völlig ungenügend — Überlast'}
          </div>
        </div>
        <div style={{ marginTop:8, fontSize:12 }}>
          Ziel-VQS:{' '}
          {(['A','B','C','D','E','F'] as LevelOfService[]).map(los => (
            <button key={los} onClick={() => onTargetLos(los)}
              style={{ marginLeft:4, padding:'2px 8px', borderRadius:5, fontSize:12,
                       cursor:'pointer', fontWeight:700,
                       background: targetLos===los ? LOS_BG[los] : '#f3f4f6',
                       color: targetLos===los ? LOS_COLOR[los] : '#9ca3af',
                       border: targetLos===los ? `1.5px solid ${LOS_COLOR[los]}` : '1.5px solid #e5e7eb' }}>
              {los}
            </button>
          ))}
          {!meetsTargetLos && (
            <span style={{ marginLeft:8, color:'#dc2626', fontWeight:600 }}>
              ✗ Ziel nicht erreicht
            </span>
          )}
          {meetsTargetLos && (
            <span style={{ marginLeft:8, color:'#16a34a', fontWeight:600 }}>✓</span>
          )}
        </div>
      </div>

      {/* Kennzahlen */}
      <div style={{ padding:'10px 14px', borderBottom:'1px solid #e5e7eb',
                    display:'flex', gap:16, flexWrap:'wrap', fontSize:13 }}>
        {[
          ['Umlaufzeit Z', `${Z} s${zIsManual ? ' ✎' : ''}`, overloaded ? '#dc2626' : '#1e3a5f'],
          ['ΣQ_krit', `${Math.round(sumQKrit)} PWE/h`, overloaded ? '#dc2626' : '#374151'],
          ['Reserve', overloaded ? '—' : `+${Math.round(reserve)} PWE/h`,
           overloaded ? '#dc2626' : reserve>100 ? '#16a34a' : '#ca8a04'],
        ].map(([lbl,val,col]) => (
          <div key={String(lbl)} style={{ textAlign:'center' }}>
            <div style={{ fontSize:20, fontWeight:800, color:String(col) }}>{val}</div>
            <div style={{ fontSize:10, color:'#6b7280' }}>{lbl}</div>
          </div>
        ))}
      </div>

      {overloaded && (
        <div style={{ margin:'8px 12px', padding:'8px 12px', borderRadius:6,
                      background:'#fee2e2', border:'1px solid #fca5a5',
                      fontSize:12, color:'#991b1b' }}>
          ΣQ_krit = {Math.round(sumQKrit)} übersteigt Z = 120 s-Grenzwert ({maxQKrit} PWE/h).
          Knoten überlastet oder mehr Fahrstreifen nötig.
        </div>
      )}

      {/* Kfz-Fahrstreifen-Tabelle */}
      {activeVehLanes.length > 0 && (
        <div style={{ padding:'8px 12px 4px' }}>
          <div style={{ fontSize:11, fontWeight:700, letterSpacing:'0.06em',
                        color:'#6b7280', textTransform:'uppercase', marginBottom:8 }}>
            Fahrstreifen (Kfz)
          </div>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
            <thead>
              <tr style={{ background:'#f9fafb', color:'#6b7280', fontWeight:700 }}>
                {['Fahrstreifen','Q_krit','λ','L','X','w_m','ST_RE95','VQS'].map(h => (
                  <th key={h} style={{ padding:'4px 8px', textAlign: h==='Fahrstreifen'?'left':'right',
                                       borderBottom:'1px solid #e5e7eb' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {activeVehLanes.map(l => (
                <tr key={l.laneId}
                  style={{ borderBottom:'1px solid #f3f4f6',
                           background: l.isCritical ? '#fffbeb' : undefined }}>
                  <td style={{ padding:'4px 8px', color:'#374151' }}>
                    <div style={{ fontWeight: l.isCritical ? 700 : 400 }}>
                      {l.label}
                    </div>
                    <div style={{ fontSize:10, color:'#9ca3af' }}>
                      {l.streamIds.map(id => `${id} ${STREAM_LABELS[id]??''}`).join(' · ')}
                    </div>
                    {l.isCritical && (
                      <span style={{ fontSize:9, color:'#b45309', background:'#fef3c7',
                                     padding:'1px 4px', borderRadius:3 }}>krit.</span>
                    )}
                  </td>
                  <td style={{ padding:'4px 8px', textAlign:'right' }}>
                    {Math.round(l.qKrit)}{' '}
                    <span style={{ fontSize:10, color:'#9ca3af' }}>PWE/h</span>
                  </td>
                  <td style={{ padding:'4px 8px', textAlign:'right' }}>
                    {(l.lambda*100).toFixed(1)}%
                  </td>
                  <td style={{ padding:'4px 8px', textAlign:'right' }}>{Math.round(l.L)}</td>
                  <td style={{ padding:'4px 8px', textAlign:'right',
                               color:utilizationColor(l.X), fontWeight:600 }}>
                    {isFinite(l.X)?l.X.toFixed(2):'>1'}
                  </td>
                  <td style={{ padding:'4px 8px', textAlign:'right' }}>{delayText(l.wm)}</td>
                  <td style={{ padding:'4px 8px', textAlign:'right' }}>
                    {isFinite(l.queueM)
                      ? <><strong>{Math.round(l.queueM)}</strong> <span style={{ fontSize:10, color:'#9ca3af' }}>m</span></>
                      : <span style={{ color:'#dc2626' }}>—</span>}
                  </td>
                  <td style={{ padding:'4px 8px', textAlign:'right' }}>
                    <span style={{ display:'inline-flex', alignItems:'center', gap:3 }}>
                      <LOSBadge los={l.los} />
                      {!l.meetsTarget && (
                        <span style={{ fontSize:10, color:'#dc2626' }}>✗</span>
                      )}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* FGS-Tabelle */}
      {activeFgsLanes.length > 0 && (
        <div style={{ padding:'4px 12px 12px' }}>
          <div style={{ fontSize:11, fontWeight:700, letterSpacing:'0.06em',
                        color:'#15803d', textTransform:'uppercase', marginBottom:8 }}>
            Fussgängerstreifen
          </div>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
            <thead>
              <tr style={{ background:'#f0fdf4', color:'#6b7280', fontWeight:700 }}>
                {['FGS','Q','λ','L (Fg/h)','X','w_m','VQS'].map(h => (
                  <th key={h} style={{ padding:'4px 8px', textAlign: h==='FGS'?'left':'right',
                                       borderBottom:'1px solid #bbf7d0' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {activeFgsLanes.map(l => (
                <tr key={l.laneId} style={{ borderBottom:'1px solid #f0fdf4' }}>
                  <td style={{ padding:'4px 8px', color:'#15803d', fontWeight:600 }}>
                    {l.label}
                  </td>
                  <td style={{ padding:'4px 8px', textAlign:'right' }}>
                    {Math.round(l.qKrit)}{' '}
                    <span style={{ fontSize:10, color:'#9ca3af' }}>Fg/h</span>
                  </td>
                  <td style={{ padding:'4px 8px', textAlign:'right' }}>
                    {(l.lambda*100).toFixed(1)}%
                  </td>
                  <td style={{ padding:'4px 8px', textAlign:'right' }}>{Math.round(l.L)}</td>
                  <td style={{ padding:'4px 8px', textAlign:'right',
                               color:utilizationColor(l.X), fontWeight:600 }}>
                    {isFinite(l.X)?l.X.toFixed(2):'>1'}
                  </td>
                  <td style={{ padding:'4px 8px', textAlign:'right' }}>{delayText(l.wm)}</td>
                  <td style={{ padding:'4px 8px', textAlign:'right' }}>
                    <span style={{ display:'inline-flex', alignItems:'center', gap:3 }}>
                      <LOSBadge los={l.los} />
                      {!l.meetsTarget && (
                        <span style={{ fontSize:10, color:'#dc2626' }}>✗</span>
                      )}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ fontSize:10, color:'#6b7280', marginTop:4 }}>
            S = 8000 Fg/h (VSS 40 834) · VQS nach VSS 40 023a Tab. 4 · Gesamturteil nur Kfz
          </div>
        </div>
      )}

      {/* VQS pro Strom */}
      {result.streams.filter(s => !s.isFGS).length > 0 && (
        <div style={{ padding:'4px 12px 12px' }}>
          <div style={{ fontSize:11, fontWeight:700, letterSpacing:'0.06em',
                        color:'#6b7280', textTransform:'uppercase', marginBottom:8 }}>
            VQS pro Strom (Kfz)
          </div>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
            <thead>
              <tr style={{ background:'#f9fafb', color:'#6b7280', fontWeight:700 }}>
                {['Strom','Fahrstreifen','Ausl.','L-95','Wz','VQS'].map((h,i) => (
                  <th key={h} style={{ padding:'4px 8px', textAlign: i<2 ? 'left' : 'right',
                                       borderBottom:'1px solid #e5e7eb', whiteSpace:'nowrap' }}>
                    {h === 'Ausl.' ? 'Ausl. [%]' : h === 'L-95' ? 'L-95 [m]' : h === 'Wz' ? 'Wz [s]' : h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.streams.filter(s => !s.isFGS).map(s => (
                <tr key={`${s.laneId}-${s.streamId}`} style={{ borderBottom:'1px solid #f3f4f6' }}>
                  <td style={{ padding:'4px 8px', color:'#374151' }}>
                    <span style={{ fontFamily:'monospace', color:'#1e3a5f', marginRight:6 }}>{s.streamId}</span>
                    <span style={{ color:'#6b7280', fontSize:11 }}>{STREAM_LABELS[s.streamId] ?? s.streamId}</span>
                  </td>
                  <td style={{ padding:'4px 8px', color:'#6b7280', fontSize:11 }}>{s.laneLabel}</td>
                  <td style={{ padding:'4px 8px', textAlign:'right',
                               color: utilizationColor(s.X), fontWeight:600 }}>
                    {isFinite(s.X) ? `${(s.X * 100).toFixed(0)}` : '>100'}
                  </td>
                  <td style={{ padding:'4px 8px', textAlign:'right' }}>
                    {isFinite(s.queueM)
                      ? <><strong>{Math.round(s.queueM)}</strong></>
                      : <span style={{ color:'#dc2626' }}>—</span>}
                  </td>
                  <td style={{ padding:'4px 8px', textAlign:'right' }}>{delayText(s.wm)}</td>
                  <td style={{ padding:'4px 8px', textAlign:'right' }}>
                    <span style={{ display:'inline-flex', alignItems:'center', gap:3 }}>
                      <LOSBadge los={s.los} />
                      {!s.meetsTarget && <span style={{ fontSize:10, color:'#dc2626' }}>✗</span>}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Methodik */}
      <div style={{ margin:'0 12px 12px', padding:'9px 11px', borderRadius:8,
                    background:'#f8fafc', border:'1px solid #e2e8f0',
                    fontSize:11, color:'#475569', lineHeight:1.65 }}>
        <div style={{ fontWeight:700, color:'#1e293b', marginBottom:4 }}>
          Methodik (VSS 40 023a)
        </div>
        <div><strong>Grundlagen:</strong> VSS 40 023a — <em>Knoten mit Lichtsignalanlagen, Leistungsfähigkeit und Verkehrsqualität</em> (VSS); VSS 40 837 — <em>Lichtsignalanlagen, Signalzeiten</em> (VSS); VSS 40 834 — <em>Lichtsignalanlagen, Phasentrennung</em> (VSS); Handbuch Lichtsignalanlagen (HB LSA), Tiefbauamt Stadt Bern, V 2.1, Anhang G — Mindestfreigabezeit FGS mind. 5 s</div>
        <div><strong>Fz → PWE</strong> nach Ziff. 10.2: PW = 1,0 · LW = 2,0 · MR = 0,5 · FR = 0,25</div>
        <div><strong>Q_krit</strong> pro Phase = max Q der exklusiven Kfz-Fahrstreifen (Ziff. 11.2); S = 1800 PWE/h (Ziff. 11.3); FGS sind unkritisch (S = 8000 Fg/h, VSS 40 834)</div>
        <div><strong>Z</strong> aus Tab. 2: kleinste Umlaufzeit, bei der qKritMax &gt; ΣQ_krit; Grünzeiten proportional zu Q_krit</div>
        <div><strong>ST_RE95</strong> = 1,691·√(PWE_mr+PWE_GE) + (PWE_mr+PWE_GE); × 6 m/PWE (Ziff. 11.5); PWE_mr = Q·t_r/3600; PWE_GE = w₀·Q·X/3600</div>
        <div><strong>t_Gr_min</strong> nach VSS 40 837: FZ = 4 s; FGS = max(5 s, 2/3·L / 1,2 m·s⁻¹)</div>
        <div><strong>w_m</strong> = w₁ + w₀ (Ziff. 12): w₁ = Z·(1−λ)² / (2·(1−λ·X)); w₀ nach Gl. (6), C = 0,5 (isolierte LSA)</div>
        <div><strong>VQS</strong> nach Tab. 4: A ≤ 20 s · B ≤ 35 s · C ≤ 50 s · D ≤ 70 s · E ≤ 100 s · F = Überlast</div>
        <div style={{ marginTop:4, color:'#94a3b8', fontSize:10.5 }}>Ohne ÖV-Privilegierung (Ziffer 11.4). Ergebnisse ersetzen keine Überprüfung durch eine Fachperson.</div>
      </div>
    </div>
  )
}

// ── Auswertungsblatt (Druckansicht) ───────────────────────────────────────────
function LSAPrintSheet({ nodeName, armCount, arms, volumes, moveLane, fgsConfig, lanes, phaseStates, result, targetLos }: {
  nodeName: string
  armCount: 3 | 4
  arms: UIArmInput[]
  volumes: Record<string, number>
  moveLane: Record<string, 1|2>
  fgsConfig: Record<string, FGSArmConfig>
  lanes: Lane[]
  phaseStates: PhaseState[]
  result: LSAResultV2
  targetLos: LevelOfService
}) {
  const date = new Date().toLocaleDateString('de-CH', { day:'2-digit', month:'2-digit', year:'numeric' })
  const armLabels = armCount === 3 ? ['A','C','B'] : ['A','C','B','D']
  const overall = result.overallLos
  const reserve = result.maxQKrit - result.sumQKrit
  const activeVehLanes = result.lanes.filter(l => l.qKrit > 0 && !l.isFGS)
  const activeFgsLanes = result.lanes.filter(l => l.qKrit > 0 && l.isFGS)

  const th: React.CSSProperties = { padding:'3px 6px', border:'1px solid #bbb', background:'#ececec', fontSize:9, fontWeight:700, textAlign:'right', whiteSpace:'nowrap' }
  const thL: React.CSSProperties = { ...th, textAlign:'left' }
  const td: React.CSSProperties = { padding:'3px 6px', border:'1px solid #ddd', fontSize:10, textAlign:'right' }
  const tdL: React.CSSProperties = { ...td, textAlign:'left' }

  const LOS_DESC: Record<LevelOfService, string> = {
    A:'Sehr gut — sehr kurze Wartezeiten', B:'Gut — kurze Wartezeiten',
    C:'Zufriedenstellend', D:'Ausreichend — beträchtliche Wartezeiten',
    E:'Mangelhaft — lange Wartezeiten', F:'Völlig ungenügend — Überlast',
  }

  return (
    <div style={{ lineHeight:1.4 }}>

      {/* Kopfzeile */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-end',
                    borderBottom:'2.5px solid #1e3a5f', paddingBottom:6, marginBottom:14 }}>
        <div>
          <div style={{ fontSize:17, fontWeight:800, color:'#1e3a5f', letterSpacing:'-0.3px' }}>
            Bewertungsblatt LSA-Knoten
          </div>
          <div style={{ fontSize:10, color:'#555', marginTop:2 }}>
            VSS 40 023a — Knoten mit Lichtsignalanlagen, Leistungsfähigkeit und Verkehrsqualität
          </div>
        </div>
        <div style={{ textAlign:'right', fontSize:9, color:'#777' }}>
          <div style={{ fontWeight:700 }}>KnotenCheck</div>
          <div>{date}</div>
        </div>
      </div>

      {/* Objekt */}
      <table style={{ width:'100%', borderCollapse:'collapse', marginBottom:12 }}>
        <tbody>
          <tr>
            <td style={{ ...thL, width:'18%' }}>Bezeichnung</td>
            <td style={{ ...tdL, width:'34%' }}>{nodeName||'—'}</td>
            <td style={{ ...thL, width:'16%' }}>Knotentyp</td>
            <td style={{ ...tdL, width:'20%' }}>{armCount===3?'Einmündung (3-Arm)':'Kreuzung (4-Arm)'}</td>
            <td style={{ ...thL, width:'6%' }}>Ziel-VQS</td>
            <td style={tdL}>{targetLos}</td>
          </tr>
        </tbody>
      </table>

      {/* Verkehrsstärken */}
      <div style={{ fontWeight:700, fontSize:10, color:'#1e3a5f', textTransform:'uppercase',
                    letterSpacing:'0.06em', marginBottom:3 }}>Eingaben — Verkehrsstärken [PWE/h]</div>
      <table style={{ width:'100%', borderCollapse:'collapse', marginBottom:12 }}>
        <thead>
          <tr>
            <th style={thL}>Arm</th>
            <th style={thL}>Strom</th>
            <th style={thL}>Richtung</th>
            <th style={th}>Q [PWE/h]</th>
            <th style={th}>FS</th>
          </tr>
        </thead>
        <tbody>
          {armLabels.flatMap((lbl, armIdx) => {
            const moves = armMovements(armCount, armIdx)
            const fgs = fgsConfig[lbl]
            const rows: React.ReactElement[] = moves.map((m, mi) => (
              <tr key={m.id} style={{ background: mi%2===0?'#fff':'#f7f7f7' }}>
                {mi === 0 && (
                  <td style={{ ...tdL, fontWeight:700 }} rowSpan={moves.length + (fgs?.enabled ? 1 : 0)}>
                    {lbl} ({armIdx<2?'HS':'NS'}){arms[armIdx]?.name ? ` — ${arms[armIdx].name}` : ''}
                  </td>
                )}
                <td style={{ ...tdL, fontFamily:'monospace', color:'#1e3a5f' }}>{m.id}</td>
                <td style={tdL}>{m.label}</td>
                <td style={{ ...td, fontWeight:600 }}>{volumes[m.id]??0}</td>
                <td style={td}>{moveLane[m.id]===2?'FS2':'FS1'}</td>
              </tr>
            ))
            if (fgs?.enabled) {
              rows.push(
                <tr key={`fgs-${lbl}`} style={{ background:'#f0fdf4' }}>
                  <td style={{ ...tdL, fontFamily:'monospace', color:'#15803d' }}>{`fgs-${lbl}`}</td>
                  <td style={{ ...tdL, color:'#15803d' }}>Fussgänger ({fgs.length} m)</td>
                  <td style={{ ...td, color:'#15803d', fontWeight:600 }}>{fgs.volume} Fg/h</td>
                  <td style={{ ...td, color:'#15803d' }}>—</td>
                </tr>
              )
            }
            return rows
          })}
        </tbody>
      </table>

      {/* Phasenplan */}
      <div style={{ fontWeight:700, fontSize:10, color:'#1e3a5f', textTransform:'uppercase',
                    letterSpacing:'0.06em', marginBottom:3 }}>Phasenplan</div>
      <table style={{ width:'100%', borderCollapse:'collapse', marginBottom:12 }}>
        <thead>
          <tr>
            <th style={{ ...thL, width:40 }}>Phase</th>
            {lanes.map(l => (
              <th key={l.id} style={{ ...th, textAlign:'center', fontSize:8, minWidth:44 }}>
                {l.label}
              </th>
            ))}
            <th style={th}>Q_krit<br/>[PWE/h]</th>
            <th style={th}>t_Gr_min<br/>[s]</th>
            <th style={th}>t_Gr<br/>[s]</th>
            <th style={th}>λ [%]</th>
          </tr>
        </thead>
        <tbody>
          {phaseStates.map((ph, pi) => {
            const pr = result.phases[pi]
            return (
              <tr key={ph.id} style={{ background: pi%2===0?'#fff':'#f7f7f7' }}>
                <td style={{ ...tdL, fontWeight:700 }}>{pi+1}</td>
                {lanes.map(l => {
                  const active = ph.selectedLaneIds.includes(l.id)
                  return (
                    <td key={l.id} style={{ ...td, textAlign:'center',
                                            color: active ? (l.isFGS?'#15803d':'#1d4ed8') : '#d1d5db',
                                            fontWeight: active ? 700 : 400 }}>
                      {active ? '✓' : '—'}
                    </td>
                  )
                })}
                <td style={td}>{pr ? Math.round(pr.qKrit) : '—'}</td>
                <td style={td}>{pr ? pr.tGrMin.toFixed(1) : '—'}</td>
                <td style={{ ...td, fontWeight:600 }}>{pr ? pr.tGr.toFixed(1) : '—'}</td>
                <td style={td}>{pr ? (pr.lambda*100).toFixed(1)+'%' : '—'}</td>
              </tr>
            )
          })}
          <tr style={{ background:'#ececec' }}>
            <td style={{ ...tdL, fontWeight:700, fontSize:9 }}>Z = {result.Z} s</td>
            {lanes.map(l => <td key={l.id} style={td}></td>)}
            <td style={{ ...td, fontWeight:700 }}>Σ {Math.round(result.sumQKrit)}</td>
            <td colSpan={3} style={td}></td>
          </tr>
        </tbody>
      </table>

      {/* Ergebnisse Kfz */}
      {activeVehLanes.length > 0 && (<>
        <div style={{ fontWeight:700, fontSize:10, color:'#1e3a5f', textTransform:'uppercase',
                      letterSpacing:'0.06em', marginBottom:3 }}>Ergebnisse — Fahrstreifen (Kfz)</div>
        <table style={{ width:'100%', borderCollapse:'collapse', marginBottom:12 }}>
          <thead>
            <tr>
              <th style={thL}>Fahrstreifen</th>
              <th style={th}>Q_krit<br/>[PWE/h]</th>
              <th style={th}>λ [%]</th>
              <th style={th}>L [PWE/h]</th>
              <th style={th}>X</th>
              <th style={th}>w_m [s]</th>
              <th style={th}>ST_RE95 [m]</th>
              <th style={{ ...th, textAlign:'center' }}>VQS</th>
            </tr>
          </thead>
          <tbody>
            {activeVehLanes.map((l, i) => (
              <tr key={l.laneId} style={{ background: i%2===0?'#fff':'#f7f7f7' }}>
                <td style={{ ...tdL, fontWeight: l.isCritical?700:400 }}>
                  {l.label}
                  {l.isCritical && <span style={{ fontSize:8, marginLeft:4, color:'#b45309' }}>★ krit.</span>}
                </td>
                <td style={td}>{Math.round(l.qKrit)}</td>
                <td style={td}>{(l.lambda*100).toFixed(1)}%</td>
                <td style={td}>{Math.round(l.L)}</td>
                <td style={{ ...td, fontWeight:600,
                             color: !isFinite(l.X)||l.X>=1?'#b91c1c':l.X>=0.9?'#c2410c':'#374151' }}>
                  {isFinite(l.X) ? l.X.toFixed(2) : '>1'}
                </td>
                <td style={td}>{delayText(l.wm)}</td>
                <td style={td}>{isFinite(l.queueM) ? `${Math.round(l.queueM)} m` : '—'}</td>
                <td style={{ ...td, textAlign:'center', fontWeight:800,
                             background:LOS_BG[l.los], color:LOS_COLOR[l.los] }}>
                  {l.los}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </>)}

      {/* VQS pro Strom */}
      {result.streams.filter(s => !s.isFGS).length > 0 && (<>
        <div style={{ fontWeight:700, fontSize:10, color:'#1e3a5f', textTransform:'uppercase',
                      letterSpacing:'0.06em', marginBottom:3 }}>VQS pro Strom (Kfz)</div>
        <table style={{ width:'100%', borderCollapse:'collapse', marginBottom:12 }}>
          <thead>
            <tr>
              <th style={thL}>Strom</th>
              <th style={thL}>Richtung</th>
              <th style={thL}>Fahrstreifen</th>
              <th style={th}>Ausl. [%]</th>
              <th style={th}>L-95 [m]</th>
              <th style={th}>Wz [s]</th>
              <th style={{ ...th, textAlign:'center' }}>VQS</th>
            </tr>
          </thead>
          <tbody>
            {result.streams.filter(s => !s.isFGS).map((s, i) => (
              <tr key={`${s.laneId}-${s.streamId}`} style={{ background: i%2===0?'#fff':'#f7f7f7' }}>
                <td style={{ ...tdL, fontFamily:'monospace', color:'#1e3a5f' }}>{s.streamId}</td>
                <td style={tdL}>{STREAM_LABELS[s.streamId] ?? s.streamId}</td>
                <td style={tdL}>{s.laneLabel}</td>
                <td style={{ ...td, fontWeight:600,
                             color: !isFinite(s.X)||s.X>=1?'#b91c1c':s.X>=0.9?'#c2410c':'#374151' }}>
                  {isFinite(s.X) ? `${(s.X*100).toFixed(0)}` : '>100'}
                </td>
                <td style={td}>{isFinite(s.queueM) ? `${Math.round(s.queueM)} m` : '—'}</td>
                <td style={td}>{delayText(s.wm)}</td>
                <td style={{ ...td, textAlign:'center', fontWeight:800,
                             background:LOS_BG[s.los], color:LOS_COLOR[s.los] }}>
                  {s.los}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </>)}

      {/* Ergebnisse FGS */}
      {activeFgsLanes.length > 0 && (<>
        <div style={{ fontWeight:700, fontSize:10, color:'#15803d', textTransform:'uppercase',
                      letterSpacing:'0.06em', marginBottom:3 }}>Ergebnisse — Fussgängerstreifen</div>
        <table style={{ width:'100%', borderCollapse:'collapse', marginBottom:12 }}>
          <thead>
            <tr>
              <th style={thL}>FGS</th>
              <th style={th}>Q [Fg/h]</th>
              <th style={th}>λ [%]</th>
              <th style={th}>L [Fg/h]</th>
              <th style={th}>X</th>
              <th style={th}>w_m [s]</th>
              <th style={{ ...th, textAlign:'center' }}>VQS</th>
            </tr>
          </thead>
          <tbody>
            {activeFgsLanes.map((l, i) => (
              <tr key={l.laneId} style={{ background: i%2===0?'#f0fdf4':'#fff' }}>
                <td style={{ ...tdL, color:'#15803d', fontWeight:600 }}>{l.label}</td>
                <td style={td}>{Math.round(l.qKrit)}</td>
                <td style={td}>{(l.lambda*100).toFixed(1)}%</td>
                <td style={td}>{Math.round(l.L)}</td>
                <td style={{ ...td, fontWeight:600 }}>{isFinite(l.X) ? l.X.toFixed(2) : '>1'}</td>
                <td style={td}>{delayText(l.wm)}</td>
                <td style={{ ...td, textAlign:'center', fontWeight:800,
                             background:LOS_BG[l.los], color:LOS_COLOR[l.los] }}>
                  {l.los}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </>)}

      {/* Gesamtbeurteilung */}
      <div style={{ display:'flex', alignItems:'center', gap:14,
                    border:`2px solid ${LOS_COLOR[overall]}`, borderRadius:5,
                    padding:'8px 14px', marginBottom:12, background:LOS_BG[overall] }}>
        <div style={{ fontSize:36, fontWeight:800, color:LOS_COLOR[overall], lineHeight:1,
                      minWidth:32, textAlign:'center' }}>
          {overall}
        </div>
        <div>
          <div style={{ fontSize:12, fontWeight:700, color:'#111' }}>
            Gesamtbeurteilung: Qualitätsstufe {overall}
          </div>
          <div style={{ fontSize:10, color:'#444', marginTop:1 }}>{LOS_DESC[overall]}</div>
          <div style={{ fontSize:9, color:'#666', marginTop:2 }}>
            Z = {result.Z} s · ΣQ_krit = {Math.round(result.sumQKrit)} PWE/h
            {!result.overloaded && ` · Reserve = +${Math.round(reserve)} PWE/h`}
            {result.overloaded && ' · Überlastet'}
            {' · '}Ziel-VQS {targetLos}: {result.meetsTargetLos ? '✓' : '✗'}
          </div>
        </div>
      </div>

      {/* Konflikte */}
      {result.conflicts.length > 0 && (
        <div style={{ marginBottom:10, padding:'6px 10px', borderRadius:4,
                      background:'#fffbeb', border:'1px solid #fbbf24', fontSize:9 }}>
          <strong>Konflikte:</strong>{' '}
          {result.conflicts.map((c, i) => (
            <span key={i}>{i > 0 ? ' · ' : ''}{c.streamA}↔{c.streamB}</span>
          ))}
        </div>
      )}

      {/* Methodik */}
      <div style={{ background:'#f5f5f5', border:'1px solid #ccc', borderRadius:3,
                    padding:'6px 10px', fontSize:8.5, color:'#444', lineHeight:1.6, marginBottom:10 }}>
        <strong style={{ color:'#222' }}>Methodik:</strong>
        {' '}Fz → PWE: PW=1,0 · LW=2,0 · MR=0,5 · FR=0,25 (Ziff. 10.2).
        Q_krit pro Phase = max Q exklusiver Kfz-Fahrstreifen (Ziff. 11.2); S = 1800 PWE/h.
        Z aus Tab. 2 (kleinste Umlaufzeit, bei der alle Q_krit gedeckt sind).
        w_m = w₁ + w₀ (Ziff. 12, C = 0,5); ST_RE95 nach Ziff. 11.5.
        VQS nach Tab. 4: A ≤20 s · B ≤35 s · C ≤50 s · D ≤70 s · E ≤100 s · F Überlast. Ohne ÖV-Privilegierung.
      </div>

      {/* Fusszeile */}
      <div style={{ borderTop:'1px solid #bbb', paddingTop:5,
                    display:'flex', justifyContent:'space-between', fontSize:8, color:'#888' }}>
        <span>Berechnung nach VSS 40 023a. Die Ergebnisse ersetzen keine Überprüfung durch eine Fachperson.</span>
        <span>KnotenCheck · pnfzygrzgf-svg.github.io/KnotenCheck</span>
      </div>
    </div>
  )
}

// ── Legende ───────────────────────────────────────────────────────────────────

const LEGEND_ITEMS: LegendItem[] = [
  { abbr: 'Fz/h',    desc: 'Fahrzeuge pro Stunde — Roheingabe Abbiegeströme' },
  { abbr: 'PWE/h',   desc: 'Personenwageneinheiten/h — umgerechnet gemäss Ziffer 10.2: PW=1, LW=2, MR=0.5, FR=0.25' },
  { abbr: 'Q',  unit: 'PWE/h', desc: 'Verkehrsstärke des Knotenstroms resp. Fahrstreifens in PWE/h (Ziffer 9, VSS 40 023a)' },
  { abbr: 'S',  unit: 'PWE/h', desc: 'Fahrstreifensättigung — Richtwert 1800 PWE/h für durchschnittliche Verhältnisse (Ziffer 11.3, VSS 40 023a)' },
  { abbr: 'λ',       desc: 'Grünzeitanteil — Anteil der nutzbaren Grünzeit an der Umlaufzeit Z; λ = t_Gr · Z⁻¹ (Ziffer 11.3, VSS 40 023a)' },
  { abbr: 'X',       desc: 'Auslastungsgrad — X = Q · L⁻¹; massgebend ist das Maximum je Phase (Ziffer 11.3, VSS 40 023a)' },
  { abbr: 'L',  unit: 'PWE/h', desc: 'Leistungsfähigkeit des Fahrstreifens — L = λ · S (Ziffer 11.3, VSS 40 023a)' },
  { abbr: 'w_m', unit: 's',   desc: 'Mittlere Wartezeit pro Motorfahrzeug — deterministischer Anteil w₁ und stochastischer Anteil w₀; w_m = w₁ + w₀ (Ziffer 12, VSS 40 023a)' },
  { abbr: 'VQS',     desc: 'Verkehrsqualitätsstufe A–F nach Tab. 4 (VSS 40 023a): A ≤20s · B ≤35s · C ≤50s · D ≤70s · E ≤100s · F >100s' },
  { abbr: 'Z',  unit: 's',    desc: 'Umlaufzeit — Gesamtdauer eines Signalprogramm-Umlaufs; praktisch 60–90 s (Ziffer 10.4.3); automatisch aus Tab. 2 oder manuell' },
  { abbr: 'ΣQ_krit', unit: 'PWE/h', desc: 'Summe der kritischen Verkehrsstärken — grösster unverträglicher Strom je Phase, summiert; massgebend für Wahl der Umlaufzeit Z (Ziffer 11.1, VSS 40 023a)' },
  { abbr: 'T_Z', unit: 's',   desc: 'Zwischenzeit je Phase — Norm-Pauschale 5 s/Phase (VSS 40 023a, Ziffer 11.2); die geschwindigkeitsabhängige Staffelung 3/4/5 s ist eine eigene Annahme, angelehnt an die Gelbzeiten der VSS 40 837' },
  { abbr: 'FGS',     desc: 'Fussgängerstreifen — LSA-gesicherter Fussgängerübergang; Mindestgrünzeit t_Gr_min = max(5 s, ⅔·L / 1,2 m·s⁻¹) — ⅔·L mit 1,2 m/s nach VSS 40 837 Tab. 1, Mindestwert 5 s nach HB LSA Bern V 2.1, Anhang G' },
]

// ── Hauptkomponente ───────────────────────────────────────────────────────────
export default function LSAApp() {
  const [nodeName,    setNodeName]    = useState('')
  const [armCount,    setArmCount]    = useState<3|4>(4)
  const [arms,        setArms]        = useState<UIArmInput[]>(defaultArms(4))
  const [moveLane,    setMoveLane]    = useState<Record<string,1|2>>({})
  const [fgsConfig,   setFgsConfig]   = useState<Record<string, FGSArmConfig>>({})
  const [phaseStates, setPhaseStates] = useState<PhaseState[]>([])
  const [targetLos,   setTargetLos]   = useState<LevelOfService>('D')
  const [manualZ,     setManualZ]     = useState<number>(0)

  const skipArmCountEffect = useRef(false)
  const [showGrundlagen, setShowGrundlagen] = useState(false)
  const { msg: toastMsg, show: showToast } = useToast()

  // Volumen aus Arm-Eingaben + FGS
  const volumes = useMemo(
    () => computeVolumes(armCount, arms, fgsConfig),
    [armCount, arms, fgsConfig],
  )

  // Fahrstreifen aus FS-Zuordnung + aktive FGS-Lanes
  const lanes = useMemo<Lane[]>(() => {
    const armLabels = armCount===3 ? ['A','C','B'] : ['A','C','B','D']
    const result: Lane[] = []
    for (let i=0; i<armLabels.length; i++) {
      const lbl = armLabels[i]
      const streams = armStreamIds(armCount, i)
      const fs1 = streams.filter(s=>(moveLane[s]??1)===1)
      const fs2 = streams.filter(s=>moveLane[s]===2)
      if (fs1.length>0) result.push({
        id:`${lbl}-FS1`, armIndex:i,
        label:`Arm ${lbl}${fs2.length>0?' FS1':''}`,
        streamIds:fs1,
      })
      if (fs2.length>0) result.push({
        id:`${lbl}-FS2`, armIndex:i,
        label:`Arm ${lbl} FS2`,
        streamIds:fs2,
      })
      const fgs = fgsConfig[lbl]
      if (fgs?.enabled) result.push({
        id: `fgs-${lbl}`,
        armIndex: i,
        label: `FGS Arm ${lbl}`,
        streamIds: [`fgs-${lbl}`],
        isFGS: true,
        fgLength: fgs.length,
      })
    }
    return result
  }, [armCount, moveLane, fgsConfig])

  // Phasen aus Phase-States (ungültige Lane-IDs herausfiltern)
  const phases = useMemo<PhaseDefinition[]>(() => {
    const validIds = new Set(lanes.map(l=>l.id))
    return phaseStates.map(ph => ({
      id: ph.id,
      laneIds: ph.selectedLaneIds.filter(id=>validIds.has(id)),
    }))
  }, [phaseStates, lanes])

  // Minimaler Phasenplan via Backtracking-Coloring
  function applyMinimalPlan() {
    const suggested = suggestPhasePlan(lanes, volumes, armCount)
    if (suggested.length === 0) return
    setPhaseStates(suggested.map(ph => ({ id: ph.id, selectedLaneIds: ph.laneIds })))
  }

  // Standard-Vorschlag laden
  function applyDefault() {
    const { lanes: defLanes, phases: defPhases } = defaultLanesAndPhases(armCount)
    const armLabels = armCount===3 ? ['A','C','B'] : ['A','C','B','D']
    const defToReal: Record<string,string> = {}
    defLanes.forEach((dl,i) => { defToReal[dl.id] = `${armLabels[i]}-FS1` })
    setPhaseStates(defPhases.map(dp => ({
      id: dp.id,
      selectedLaneIds: dp.laneIds.map(id=>defToReal[id]).filter(Boolean),
    })))
  }

  // Beim Start und bei armCount-Änderung: Vorschlag laden
  useEffect(() => {
    if (skipArmCountEffect.current) { skipArmCountEffect.current = false; return }
    setFgsConfig({})
    setArms(defaultArms(armCount))
    setMoveLane({})
    const { lanes: defLanes, phases: defPhases } = defaultLanesAndPhases(armCount)
    const armLabels = armCount===3 ? ['A','C','B'] : ['A','C','B','D']
    const defToReal: Record<string,string> = {}
    defLanes.forEach((dl,i) => { defToReal[dl.id] = `${armLabels[i]}-FS1` })
    setPhaseStates(defPhases.map(dp => ({
      id: dp.id,
      selectedLaneIds: dp.laneIds.map(id=>defToReal[id]).filter(Boolean),
    })))
  }, [armCount])

  const handleExport = () =>
    exportTool({
      tool: 'lsa', filePrefix: 'LSA',
      name: nodeName, showToast,
      data: { nodeName, armCount, arms, moveLane, fgsConfig, phaseStates, targetLos, manualZ },
    })

  const handleImport = () =>
    importTool<{
      nodeName: string; armCount: 3|4; arms: UIArmInput[]
      moveLane: Record<string,1|2>; fgsConfig: Record<string, FGSArmConfig>
      phaseStates: PhaseState[]; targetLos: LevelOfService; manualZ: number
    }>('lsa', d => {
      const newCount = d.armCount ?? 4
      if (newCount !== armCount) skipArmCountEffect.current = true
      setNodeName(d.nodeName ?? '')
      setArmCount(newCount)
      setArms(d.arms ?? defaultArms(newCount))
      setMoveLane(d.moveLane ?? {})
      setFgsConfig(d.fgsConfig ?? {})
      setPhaseStates(d.phaseStates ?? [])
      setTargetLos(d.targetLos ?? 'D')
      setManualZ(d.manualZ ?? 0)
    }, showToast)

  function handleReset() {
    setNodeName('')
    setArms(defaultArms(armCount))
    setMoveLane({})
    setFgsConfig({})
    const { lanes: defLanes, phases: defPhases } = defaultLanesAndPhases(armCount)
    const armLabels = armCount===3 ? ['A','C','B'] : ['A','C','B','D']
    const defToReal: Record<string,string> = {}
    defLanes.forEach((dl,i) => { defToReal[dl.id] = `${armLabels[i]}-FS1` })
    setPhaseStates(defPhases.map(dp => ({ id: dp.id, selectedLaneIds: dp.laneIds.map(id=>defToReal[id]).filter(Boolean) })))
    setTargetLos('D')
    setManualZ(0)
    showToast('Zurückgesetzt')
  }

  // FS-Zuordnung ändern + Phasen synchron halten
  function handleMoveLaneChange(newMoveLane: Record<string, 1|2>) {
    const armLabels = armCount===3 ? ['A','C','B'] : ['A','C','B','D']
    setMoveLane(newMoveLane)
    const phaseUpdates: Array<{lbl: string; create: boolean}> = []
    for (let i=0; i<armLabels.length; i++) {
      const lbl = armLabels[i]
      const streams = armStreamIds(armCount, i)
      const hadFs2 = streams.some(s => moveLane[s] === 2)
      const willHaveFs2 = streams.some(s => (newMoveLane[s] ?? 1) === 2)
      if (!hadFs2 && willHaveFs2) phaseUpdates.push({ lbl, create: true })
      else if (hadFs2 && !willHaveFs2) phaseUpdates.push({ lbl, create: false })
    }
    if (phaseUpdates.length === 0) return
    setPhaseStates(prev => {
      let next = prev
      for (const { lbl, create } of phaseUpdates) {
        const fs1Id = `${lbl}-FS1`
        const fs2Id = `${lbl}-FS2`
        if (create) {
          next = next.map(ph => ({
            ...ph,
            selectedLaneIds: ph.selectedLaneIds.includes(fs1Id) && !ph.selectedLaneIds.includes(fs2Id)
              ? [...ph.selectedLaneIds, fs2Id]
              : ph.selectedLaneIds,
          }))
        } else {
          next = next.map(ph => ({
            ...ph,
            selectedLaneIds: ph.selectedLaneIds.filter(id => id !== fs2Id),
          }))
        }
      }
      return next
    })
  }

  // FGS-Konfiguration ändern; bei Deaktivierung Lane aus Phasen entfernen
  function handleFgsChange(armLbl: string, cfg: FGSArmConfig) {
    const prevEnabled = (fgsConfig[armLbl] ?? DEFAULT_FGS).enabled
    setFgsConfig(prev => ({ ...prev, [armLbl]: cfg }))
    if (prevEnabled && !cfg.enabled) {
      const fgsId = `fgs-${armLbl}`
      setPhaseStates(prev => prev.map(ph => ({
        ...ph,
        selectedLaneIds: ph.selectedLaneIds.filter(id => id !== fgsId),
      })))
    }
  }

  // Zwischenzeit: Maximum über alle Arme (eigene Staffelung nach v_zul)
  const tZ = useMemo(
    () => Math.max(...arms.map(a => tzFromSpeed(a.vDesign ?? 50))),
    [arms],
  )

  // Berechnung
  const result = useMemo<LSAResultV2|null>(() => {
    if (lanes.length===0 || phases.length===0) return null
    return calculateLSAV2({ armCount, volumes, lanes, phases, targetLos, manualZ: manualZ > 0 ? manualZ : undefined, tZ })
  }, [armCount, volumes, lanes, phases, targetLos, tZ])

  return (
    <>
    <div style={{ maxWidth:1200, margin:'0 auto', padding:'16px 16px 40px' }}>


      {/* ── Kopfzeile ─── */}
      <div style={{ background:'#fff', borderRadius:10, border:'1px solid #e5e7eb',
                    padding:'10px 16px', marginBottom:16,
                    display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
        <input type="text" value={nodeName} onChange={e => setNodeName(e.target.value)}
          placeholder="Bezeichnung des Knotens"
          style={{ flex:1, minWidth:200, padding:'5px 10px', borderRadius:5,
                   border:'1px solid #d1d5db', fontSize:14, fontWeight:600, color:'#1e293b' }} />
        <button onClick={handleExport}
          style={{ padding:'4px 12px', borderRadius:6, fontSize:12, cursor:'pointer',
                   border:'1px solid #d1d5db', background:'#f9fafb', color:'#374151', whiteSpace:'nowrap' }}>
          Speichern
        </button>
        <button onClick={handleImport}
          style={{ padding:'4px 12px', borderRadius:6, fontSize:12, cursor:'pointer',
                   border:'1px solid #d1d5db', background:'#f9fafb', color:'#374151', whiteSpace:'nowrap' }}>
          Laden
        </button>
        <button onClick={handleReset}
          style={{ padding:'4px 8px', fontSize:11, cursor:'pointer',
                   background:'none', border:'none', color:'#9ca3af',
                   textDecoration:'underline', whiteSpace:'nowrap' }}>
          Zurücksetzen
        </button>
      </div>

      {/* ── Grundlagen ─── */}
      <div style={{ background:'#f8fafc', borderRadius:10, border:'1px solid #e2e8f0', marginBottom:16 }}>
        <button onClick={() => setShowGrundlagen(v => !v)}
          style={{ width:'100%', display:'flex', alignItems:'center', justifyContent:'space-between',
                   padding:'10px 16px', background:'none', border:'none', cursor:'pointer',
                   fontSize:11, fontWeight:700, letterSpacing:'0.06em', color:'#64748b',
                   textTransform:'uppercase' }}>
          <span>Grundlagen und Normen</span>
          <span style={{ fontSize:10, color:'#94a3b8' }}>{showGrundlagen ? '▲' : '▼'}</span>
        </button>
        {showGrundlagen && (
          <div style={{ padding:'0 16px 12px', fontSize:12, color:'#475569',
                        display:'flex', flexDirection:'column', gap:3 }}>
            {([
              ['VSS SN 640 023a', 'Knoten mit Lichtsignalanlagen — Leistungsfähigkeit und Verkehrsqualität'],
              ['VSS 40 837',  'Lichtsignalanlagen — Übergangszeiten und Mindestzeiten (Gelbzeiten Tab. 1; Basis der T_Z-Staffelung)'],
              ['VSS SN 640 834',  'Lichtsignalanlagen — Phasentrennung (S = 8000 Fg/h für FGS)'],
              ['VSS SN 640 835',  'Lichtsignalanlagen — Leistungsfähigkeit (Korrekturfaktoren; nicht implementiert)'],
              ['HB LSA Bern V 2.1', 'Anhang G — Mindestfreigabezeit FGS ≥ 5 s'],
            ] as [string,string][]).map(([norm, desc]) => (
              <div key={norm} style={{ display:'flex', gap:6, alignItems:'baseline', flexWrap:'wrap' }}>
                <span style={{ fontWeight:700, color:'#1e3a5f', whiteSpace:'nowrap', minWidth:170 }}>{norm}</span>
                <span style={{ color:'#94a3b8' }}>—</span>
                <span>{desc}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Schritt 1 ─── */}
      <div style={{ background:'#fff', borderRadius:10, border:'1px solid #e5e7eb',
                    padding:'14px 16px', marginBottom:16 }}>
        <StepBadge n={1} label="Massgebende Verkehrsstärken je Knotenstrom bestimmen" />
        <p style={{ fontSize:12, color:'#6b7280', margin:'0 0 12px' }}>
          Stündliche Spitzenstunden-Verkehrsstärken Q [Fz/h] je Knotenstrom eingeben und in PWE umrechnen (Ziffer 9, VSS 40 023a). Schwerverkehr (LW, MR, FR) wird gemäss Ziffer 10.2 berücksichtigt.
        </p>
        <div style={{ display:'flex', gap:16, alignItems:'flex-start', marginBottom:14, flexWrap:'wrap' }}>
          <div style={{ flex:'1 1 auto' }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
              <span style={{ fontSize:13, fontWeight:600, color:'#374151' }}>Knotentyp:</span>
              {([3,4] as const).map(n => (
                <button key={n} onClick={()=>setArmCount(n)}
                  style={{ padding:'5px 14px', borderRadius:6, fontSize:13, fontWeight:600,
                           cursor:'pointer',
                           background:armCount===n?'#1e3a5f':'#f3f4f6',
                           color:armCount===n?'#fff':'#374151',
                           border:armCount===n?'1.5px solid #1e3a5f':'1.5px solid #e5e7eb' }}>
                  {n===3?'Einmündung (3-Arm)':'Kreuzung (4-Arm)'}
                </button>
              ))}
            </div>
            <div className={`arms-grid${armCount===4?' arms-grid-4':''}`}>
              {arms.map((arm,i) => (
                <ArmCard key={i} arm={arm} index={i} armCount={armCount}
                  onChange={a => setArms(prev=>prev.map((x,j)=>j===i?a:x))} />
              ))}
            </div>
          </div>
          <div style={{ flex:'0 0 auto', textAlign:'center' }}>
            <img
              src={armCount === 4 ? lsa4ArmSvg : lsa3ArmSvg}
              alt={armCount === 4 ? 'Knotengeometrie 4-Arm' : 'Knotengeometrie 3-Arm'}
              style={{
                width: 280,
                height: 'auto',
                objectFit:'contain',
                border:'1px solid #e5e7eb', borderRadius:8,
                background:'#fff', padding:6,
              }}
            />
            <div style={{ fontSize:10, color:'#6b7280', marginTop:4 }}>
              Arme A–{armCount===4?'D':'C'} · Ströme {armCount===4?'q1–q12':'q2–q8'} · fgs_A–{armCount===4?'D':'C'}
            </div>
          </div>
        </div>
      </div>

      {/* ── Schritt 2 ─── */}
      <div style={{ background:'#fff', borderRadius:10, border:'1px solid #e5e7eb',
                    padding:'14px 16px', marginBottom:16 }}>
        <StepBadge n={2} label="Fahrstreifenplan — Knotenströme zuordnen" />
        <p style={{ fontSize:12, color:'#6b7280', margin:'0 0 12px' }}>
          Anzahl Fahrstreifen festlegen und Knotenströme den Fahrstreifen zuordnen (Ziffer 9.3).
          Bewegungen auf FS1 oder FS2 aufteilen. FGS: Fussgängerstreifen mit Querungslänge aktivieren.
        </p>
        <LanePlanSection armCount={armCount} volumes={volumes}
          moveLane={moveLane} onChange={handleMoveLaneChange}
          fgsConfig={fgsConfig} onFgsChange={handleFgsChange} />
      </div>

      {/* ── Schritt 3 + Ergebnisse ─── */}
      <div className="layout-grid">
        <div style={{ background:'#fff', borderRadius:10, border:'1px solid #e5e7eb',
                      padding:'14px 16px' }}>
          <StepBadge n={3} label="Phasenplan — ΣQkrit und Umlaufzeit Z festlegen" />
          <p style={{ fontSize:12, color:'#6b7280', margin:'0 0 8px' }}>
            Fahrstreifen den Phasen zuordnen (☑ = Grün in dieser Phase, Ziffer 11 VSS 40 023a).
            Daraus werden ΣQkrit, Umlaufzeit Z und Leistungsfähigkeit L je Fahrstreifen berechnet.
            FGS-Lanes (grün) manuell zuweisen.
          </p>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10,
                        padding:'6px 10px', borderRadius:6, background:'#f8fafc',
                        border:'1px solid #e2e8f0', fontSize:12 }}>
            <span style={{ color:'#374151', fontWeight:600 }}>Umlaufzeit Z:</span>
            <input type="number" min={30} max={200} step={1}
              value={manualZ || ''}
              placeholder="Auto (Tab. 2)"
              onChange={e => setManualZ(Math.max(0, Number(e.target.value) || 0))}
              style={{ width:90, padding:'3px 7px', borderRadius:4, fontSize:12,
                       border: manualZ > 0 ? '1.5px solid #1e3a5f' : '1px solid #d1d5db',
                       fontWeight: manualZ > 0 ? 700 : 400 }} />
            <span style={{ color:'#9ca3af' }}>s</span>
            {manualZ > 0 && (
              <button onClick={() => setManualZ(0)}
                style={{ padding:'2px 8px', fontSize:11, borderRadius:4, cursor:'pointer',
                         background:'#f3f4f6', border:'1px solid #d1d5db', color:'#6b7280' }}>
                Auto
              </button>
            )}
            <span style={{ color: manualZ > 0 ? '#1e3a5f' : '#9ca3af', marginLeft:4 }}>
              {manualZ > 0 ? 'Manuell — überschreibt Tab. 2' : 'Leer = automatisch aus Tab. 2 (kleinste passende Z)'}
            </span>
            <span style={{ marginLeft:'auto', color:'#475569', whiteSpace:'nowrap' }}>
              T_Z = <strong>{tZ}</strong> s/Phase
            </span>
          </div>
          <PhasePlanSection lanes={lanes} phaseStates={phaseStates}
            onChange={setPhaseStates} onApplyDefault={applyDefault}
            onSuggestMinimal={applyMinimalPlan}
            result={result} />
        </div>

        <div className="results-panel">
          {result
            ? <ResultsPanelV2 result={result} targetLos={targetLos}
                onTargetLos={setTargetLos}
                onPrint={() => {
                  const prev = document.title
                  document.title = `KnotenCheck – VSS 40 023a${nodeName ? ' – ' + nodeName : ''}`
                  window.addEventListener('afterprint', () => { document.title = prev }, { once: true })
                  window.print()
                }} />
            : <div style={{ padding:20, color:'#9ca3af', fontSize:13 }}>
                Fahrstreifen und Phasen definieren, um Ergebnisse zu sehen.
              </div>
          }
        </div>
      </div>

      <LegendBox items={LEGEND_ITEMS} />

      <footer style={{ fontSize: 11, color: '#9ca3af', textAlign: 'center', marginTop: 24, lineHeight: 2 }}>
        <div>
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

    {result && createPortal(
      <div className="print-portal" style={{ padding:'14mm 16mm', background:'#fff',
                                             fontFamily:'system-ui, Arial, sans-serif' }}>
        <LSAPrintSheet
          nodeName={nodeName}
          armCount={armCount}
          arms={arms}
          volumes={volumes}
          moveLane={moveLane}
          fgsConfig={fgsConfig}
          lanes={lanes}
          phaseStates={phaseStates}
          result={result}
          targetLos={targetLos}
        />
      </div>,
      document.body
    )}
    <Toast msg={toastMsg} />
    </>
  )
}
