import { useState, useMemo, useEffect, useRef, useCallback, type ReactNode } from 'react'
import UebernahmeHinweis from './karte/UebernahmeHinweis'
import BelastungsVergleich from './karte/BelastungsVergleich'
import { querschnitteKnoten } from './karte/vergleich'
import { kartenBezugAus, kartenBezugLesen, lsaTempo, type KartenBezug, type KnotenUebernahme, type UebernahmeArm } from './karte/rechner'
import { Abschnitt, BerichtKopf, BerichtRahmen, Gesamtergebnis, Herkunft, HerkunftLegende, HinweisListe, QuellenAbschnitt } from './bericht/Bericht'
import { kartenHerkunft, schaetzArt, stromArt, type HerkunftArt } from './bericht/herkunft'
import type { ArmStroeme } from './engine/armmengen'
import ArmmengenSchaetzung from './schaetzung/ArmmengenSchaetzung'
import { schaetzungGilt, schaetzungLesen, type Schaetzung } from './schaetzung/schaetzung'
import { HerkunftMarke } from './HerkunftMarke'
import { GRUNDLAGEN } from './hilfeTexte'
import { createPortal } from 'react-dom'
import {
  calculateLSAV2, defaultLanesAndPhases, armStreamIds, armMovements, STREAM_LABELS, suggestPhasePlan,
  tzFor, tzFromSpeed, tzModeFromFile, Z_PRACTICAL, TZ_NORM,
} from './engine/lsaCalculatorV2'
import { exportTool, importTool } from './saveLoad'
import { conform, conformFixed, oneOf, wahl } from './engine/conform'
import { offenLsa } from './engine/offeneAngaben'
import { useIsActiveModule } from './activeModule'
import { Meldung } from './Meldung'
import { LOS_BG, LOS_COLOR, utilizationColor } from './uiHelpers'
import { useMeldung } from './useMeldung'
import { HilfeUnten, SoFunktionierts, type LegendItem } from './Hilfe'
import { LOSBadge, NumInput, OffeneAngaben, BerichtKnopf } from './ui'
import type {
  Lane, PhaseDefinition, LevelOfService, LSAResultV2, OverlapIssue, TzMode, DesignSpeed,
} from './engine/lsaCalculatorV2'
import lsa4ArmSvg from './assets/LSA_4_Arm.svg?url'
import lsa3ArmSvg from './assets/LSA_3_Arm.svg?url'
import { RechnerFuss } from './Fusszeile'

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
const DEFAULT_FGS: FGSArmConfig = { enabled: false, volume: 0, length: 0 }

// ── UI-Arm-Eingabe ────────────────────────────────────────────────────────────
interface UIArmInput { name: string; left: number; straight: number; right: number; mix?: VehicleMix; vDesign?: DesignSpeed }
interface ArmInput   { name: string; left: number; straight: number; right: number }
function toEngineArm(a: UIArmInput): ArmInput {
  const f = armFactor(a.mix)
  return { name: a.name, left: Math.round(a.left*f), straight: Math.round(a.straight*f), right: Math.round(a.right*f) }
}
function defaultArms(n: 3|4): UIArmInput[] {
  return Array.from({ length: n }, () => ({ name:'', left:0, straight:0, right:0 }))
}

// Ströme → Volumen aus Arm-Eingaben und FGS-Konfiguration
function computeVolumes(
  armCount: 3|4,
  arms: UIArmInput[],
  fgsConfig: Record<string, FGSArmConfig>,
): Record<string,number> {
  // Zuordnung Eingabefeld → Strom aus derselben Definition wie die Beschriftung
  const base: Record<string,number> = {}
  for (let i = 0; i < armCount; i++) {
    const arm = arms[i] ? toEngineArm(arms[i]) : undefined
    for (const m of armMovements(armCount, i)) base[m.id] = arm?.[m.direction] ?? 0
  }
  const armLabels = armCount === 3 ? ['A','C','B'] : ['A','C','B','D']
  for (const lbl of armLabels) {
    const cfg = fgsConfig[lbl]
    if (cfg?.enabled) base[`fgs-${lbl}`] = cfg.volume
  }
  return base
}

// Wartezeit-Format in dichten Ergebnis-Tabellen — bewusst ohne «ca.»-Präfix
function delayText(w:number) {
  if (!isFinite(w)) return '>999 s'
  if (w<1) return '<1 s'
  return `${Math.round(w)} s`
}

// Zwischenzeit in Worten: Pauschale der Norm oder gekennzeichnete Annahme
function tzText(tZ: number, mode: TzMode): string {
  return mode === 'norm'
    ? `T_Z = ${tZ} s je Phase (Norm-Pauschale, Ziffer 11.2, Seite 10)`
    : `T_Z = ${tZ} s je Phase (Annahme: nach zulässiger Geschwindigkeit gestaffelt, grösster Wert aller Arme; Norm-Pauschale ${TZ_NORM} s je Phase, Ziffer 11.2, Seite 10)`
}

const xText = (x: number) => isFinite(x) ? x.toFixed(2).replace('.', ',') : 'über 1'

function overlapText(i: OverlapIssue): string {
  const parts = i.X >= 1 ? [`überlastet (X = ${xText(i.X)})`] : []
  if (i.pathExceeded)
    parts.push(`kritischer Pfad überschritten (${Math.round(i.pathSum)} von ${Math.round(i.pathMax)} PWE/h)`)
  return `${i.label}: ${parts.join(', ')}`
}
const OVERLAP_NOTE = 'Der Fahrstreifen ist in mehreren Phasen grün und zählt darum nicht zu ΣQ_krit '
  + '(Ziffer 10.4.2, Seite 9); sein Grün folgt den Phasen (Ziffer 11.3, Seite 10). '
  + 'Die Reserve gilt hier nicht: Phasenplan oder Grünzeiten anpassen.'

function fgsOverloadText(r: LSAResultV2): string {
  const names = r.lanes.filter(l => r.fgsOverloaded.includes(l.laneId))
    .map(l => `${l.label} (X = ${xText(l.X)})`).join(', ')
  return `Fussgängerstreifen überlastet: ${names}. Die Qualitätsstufe gilt nur für den Motorfahrzeugverkehr; `
    + 'für den Fussverkehr reicht die Grünzeit nicht.'
}

function zTargetText(r: LSAResultV2, targetLos: LevelOfService): string {
  const frame = `${Z_PRACTICAL.min} bis ${Z_PRACTICAL.max} s`
  const head = `Mit der kleinsten passenden Umlaufzeit (Z = ${r.Z} s) wird die Ziel-VQS ${targetLos} nicht erreicht.`
  return r.zForTarget
    ? `${head} Bei Z = ${r.zForTarget.Z} s wird sie erreicht (VQS ${r.zForTarget.los}). Für die Praxis gelten ${frame} (Ziffer 10.4.3, Seite 9).`
    : `${head} Auch keine andere Umlaufzeit von ${frame} erreicht sie (Ziffer 10.4.3, Seite 9).`
}

// ── Herkunft der Eingaben ─────────────────────────────────────────────────────
// Für Bildschirm und Druckblatt: aus der Karte (K) oder dem Modell (M), solange der Wert noch gleich ist wie bei der Übernahme

/** Strassenname aus der Karte, nur wenn einer da ist */
function nameArt(u: UebernahmeArm | undefined, name: string | undefined): HerkunftArt | null {
  return name ? kartenHerkunft(u?.name, name) : null
}
/** Fahrzeugmix aus dem Modell; der Rechner führt LW und LZ zusammen als LW-Anteil */
function mixArt(u: UebernahmeArm | undefined, m: VehicleMix | undefined): HerkunftArt | null {
  const s = u?.schwerverkehr
  return s && m && m.pctLW === s.lw + s.lz && m.pctMR === 0 && m.pctFR === 0 ? 'M' : null
}
/** Tempo aus der Karte, auf 30/50/60 km/h gestaffelt übernommen */
function tempoArt(u: UebernahmeArm | undefined, v: DesignSpeed | undefined): HerkunftArt | null {
  return kartenHerkunft(u?.tempo !== undefined ? lsaTempo(u.tempo) : undefined, v)
}
/** Fahrstreifenplan eines Arms aus der Karte: alle Zuordnungen noch wie die aus den Fahrstreifen abgeleitete */
function fahrstreifenArt(laneAus: Record<string, 1|2>, moveLane: Record<string, 1|2>, armCount: 3|4, arm: number): HerkunftArt | null {
  return armStreamIds(armCount, arm).every(id => laneAus[id] !== undefined && laneAus[id] === moveLane[id]) ? 'K' : null
}
/** Fussgängerstreifen aus der Karte, solange er eingeschaltet ist */
function fgsArt(u: UebernahmeArm | undefined, enabled: boolean | undefined): HerkunftArt | null {
  return kartenHerkunft(u?.fgs ? true : undefined, enabled)
}

// ── Kleine Hilfskomponenten ───────────────────────────────────────────────────
function StepBadge({ n, label }: { n:number|string; label:string }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:12 }}>
      <div style={{ minWidth:26, height:26, borderRadius:13, background:'#1e3a5f',
                    color:'#fff', fontSize:12, fontWeight:800, padding:'0 5px',
                    display:'flex', alignItems:'center', justifyContent:'center',
                    whiteSpace:'nowrap' }}>{n}</div>
      <span style={{ fontSize:15, fontWeight:700, color:'var(--accent)' }}>{label}</span>
    </div>
  )
}

// ── ArmCard ───────────────────────────────────────────────────────────────────
function ArmCard({ arm, index, armCount, tzMode, onChange, herkunft, schaetzung }: {
  arm:UIArmInput; index:number; armCount:3|4; tzMode:TzMode|null; onChange:(a:UIArmInput)=>void
  /** Arm der Übernahme aus der Karte, für die Marken «Karte» und «Modell» */
  herkunft?: UebernahmeArm
  /** Aus Armmengen geschätzte Ströme dieses Arms */
  schaetzung?: ArmStroeme
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
    <div style={{ background:'#fff', borderRadius:12, border:`1.5px solid ${bd}`, overflow:'hidden' }}>
      <div style={{ background:bg, borderBottom:`1px solid ${bd}`,
                    padding:'8px 12px', display:'flex', alignItems:'center', gap:8 }}>
        <span style={{ fontWeight:800, fontSize:15, color:col, background:'#fff',
                       border:`1.5px solid ${bd}`, borderRadius:5,
                       minWidth:26, textAlign:'center', padding:'1px 5px' }}>{lbl}</span>
        <input type="text" placeholder="Name (optional)" value={arm.name}
          onChange={e => upd('name', e.target.value)}
          style={{ flex:1, minWidth:0, border:'none', background:'transparent', fontSize:14,
                   fontWeight:600, color:col, outline:'none' }} />
        <HerkunftMarke art={nameArt(herkunft, arm.name)} />
      </div>
      <div style={{ fontSize:12, fontWeight:700, letterSpacing:'0.06em', color:'var(--text-muted)',
                    background:'#f9fafb', borderBottom:'1px solid var(--kachel-rand)',
                    padding:'4px 12px', textTransform:'uppercase' }}>Fz/h</div>
      {moves.map(m => {
        const num = m.id.replace('q','')
        return (
          <div key={m.id} style={{ display:'flex', alignItems:'center', gap:8,
                                   padding:'6px 12px', borderBottom:'1px solid var(--kachel-rand)' }}>
            <div style={{ flex:1, fontSize:14, color:'var(--text)' }}>{num}: {m.label}</div>
            <HerkunftMarke art={schaetzArt(schaetzung, m.direction, arm[m.direction]) ?? stromArt(herkunft, m.direction, arm[m.direction])} />
            <NumInput live value={(arm[m.direction as keyof UIArmInput] as number)??0}
              onChange={v => upd(m.direction as keyof UIArmInput, v)} />
          </div>
        )
      })}
      {/* Fahrzeugzusammensetzung */}
      <div style={{ padding:'5px 12px', borderBottom:'1px solid var(--kachel-rand)',
                    display:'flex', alignItems:'center', gap:8, fontSize:12, color:'var(--text-muted)' }}>
        <input type="checkbox" checked={arm.mix!==undefined}
          onChange={e => onChange({...arm, mix: e.target.checked
            ? {pctLW:0,pctMR:0,pctFR:0} : undefined})}
          style={{ cursor:'pointer', accentColor:'#1e3a5f' }} />
        Fahrzeugmix
        {arm.mix && (
          <span style={{ marginLeft:'auto', fontWeight:600, color:'var(--accent)' }}>
            f = {armFactor(arm.mix).toFixed(3)}
          </span>
        )}
      </div>
      {arm.mix && (
        <div style={{ padding:'4px 12px 8px', display:'flex', flexDirection:'column', gap:3 }}>
          {([['pctLW','LW',2],['pctMR','MR',0.5],['pctFR','FR',0.25]] as const).map(([k,lbl2,f2]) => (
            <div key={k} style={{ display:'flex', alignItems:'center', gap:6, fontSize:12 }}>
              <span style={{ width:100, color:'var(--text-muted)' }}>{lbl2} (f={f2})</span>
              {k === 'pctLW' && <HerkunftMarke art={mixArt(herkunft, arm.mix)} />}
              <NumInput live value={arm.mix![k]} onChange={v => updMix(k,v)} max={100} width={52} />
              <span style={{ color:'var(--text-muted)' }}>%</span>
            </div>
          ))}
          <div style={{ fontSize:12, color:'var(--text-muted)', marginTop:2 }}>
            PW: {pctPW(arm.mix).toFixed(0)}%
          </div>
        </div>
      )}
      {/* Annahme: zulässige Geschwindigkeit → Zwischenzeit T_Z (angelehnt an Gelbzeiten VSS 40 837 Ziffer 16, Seite 5) */}
      {tzMode === 'staffel' && <div style={{ padding:'5px 12px 8px', display:'flex', alignItems:'center', gap:5,
                    fontSize:12, color:'var(--text-muted)', borderTop:'1px solid var(--kachel-rand)' }}>
        <span style={{ whiteSpace:'nowrap', marginRight:2 }}>v<sub>zul</sub>:</span>
        {([30, 50, 60] as const).map(v => (
          <button key={v} onClick={() => upd('vDesign', v)}
            className={`knopf klein${arm.vDesign === v ? '' : ' zweit'}`}>
            {v} km/h
          </button>
        ))}
        <HerkunftMarke art={tempoArt(herkunft, arm.vDesign)} />
        <span style={{ marginLeft:'auto', color:'var(--text-muted)', fontSize:12 }}>
          T_Z = {arm.vDesign ? tzFromSpeed(arm.vDesign) : '–'} s
        </span>
      </div>}
    </div>
  )
}

// ── Schritt 2: Fahrstreifenplan-Editor ────────────────────────────────────────
function LanePlanSection({ armCount, volumes, moveLane, onChange, fgsConfig, onFgsChange, uebernahme, laneAus }: {
  armCount: 3|4
  volumes: Record<string,number>
  moveLane: Record<string,1|2>
  onChange: (ml:Record<string,1|2>) => void
  fgsConfig: Record<string, FGSArmConfig>
  onFgsChange: (lbl:string, cfg:FGSArmConfig) => void
  /** Übernahme aus der Karte und die daraus abgeleitete Zuordnung, für die Marke «Karte» */
  uebernahme?: KnotenUebernahme
  laneAus: Record<string,1|2>
}) {
  const armLabels = armCount===3 ? ['A','C','B'] : ['A','C','B','D']
  const col = '#1e3a5f'
  const bd  = '#c3cdd8'
  const bg  = '#f0f4f8'

  return (
    <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(240px,1fr))', gap:12 }}>
      {armLabels.map((lbl,armIdx) => {
        const moves = armMovements(armCount, armIdx)
        const sumQ = (ms: typeof moves) => ms.reduce((q,m)=>q+(volumes[m.id]??0),0)
        const fs1Q = sumQ(moves.filter(m=>moveLane[m.id]===1))
        const fs2Moves = moves.filter(m=>moveLane[m.id]===2)
        const fs2Q = fs2Moves.length>0 ? sumQ(fs2Moves) : null
        const fgs = fgsConfig[lbl] ?? DEFAULT_FGS

        return (
          <div key={lbl} style={{ background:'#fff', borderRadius:12,
                                   border:`1.5px solid ${bd}`, overflow:'hidden' }}>
            <div style={{ background:bg, borderBottom:`1px solid ${bd}`,
                          padding:'7px 12px', display:'flex', alignItems:'center', gap:8 }}>
              <span style={{ fontWeight:800, fontSize:15, color:col, background:'#fff',
                             border:`1.5px solid ${bd}`, borderRadius:5,
                             padding:'1px 6px' }}>{lbl}</span>
              <HerkunftMarke art={fahrstreifenArt(laneAus, moveLane, armCount, armIdx)} />
            </div>

            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
              <thead>
                <tr style={{ background:'#f9fafb' }}>
                  <th style={{ padding:'4px 8px', textAlign:'left', fontWeight:600, color:'var(--text-muted)' }}>Bewegung</th>
                  <th style={{ padding:'4px 8px', textAlign:'right', fontWeight:600, color:'var(--text-muted)' }}>PWE/h</th>
                  <th style={{ padding:'4px 8px', textAlign:'center', fontWeight:600, color:'var(--text-muted)' }}>FS1</th>
                  <th style={{ padding:'4px 8px', textAlign:'center', fontWeight:600, color:'var(--text-muted)' }}>FS2</th>
                </tr>
              </thead>
              <tbody>
                {moves.map(m => {
                  const num = m.id.replace('q','')
                  const q = volumes[m.id]??0
                  return (
                    <tr key={m.id} style={{ borderTop:'1px solid var(--kachel-rand)' }}>
                      <td style={{ padding:'5px 8px', color:'var(--text)' }}>
                        {num}. {m.label}
                        <span style={{ fontSize:12, color:'var(--text-muted)', marginLeft:4 }}>{m.id}</span>
                      </td>
                      <td style={{ padding:'5px 8px', textAlign:'right',
                                   color: q>0?'var(--text)':'#d1d5db', fontWeight: q>0?600:400 }}>
                        {q}
                      </td>
                      <td style={{ padding:'5px 8px', textAlign:'center' }}>
                        <input type="radio" name={`fs-${lbl}-${m.id}`}
                          checked={moveLane[m.id]===1} onChange={() => onChange({...moveLane,[m.id]:1})}
                          style={{ accentColor:'#1e3a5f', cursor:'pointer' }} />
                      </td>
                      <td style={{ padding:'5px 8px', textAlign:'center' }}>
                        <input type="radio" name={`fs-${lbl}-${m.id}`}
                          checked={moveLane[m.id]===2} onChange={() => onChange({...moveLane,[m.id]:2})}
                          style={{ accentColor:'#1e3a5f', cursor:'pointer' }} />
                      </td>
                    </tr>
                  )
                })}
                {/* FGS-Zeile */}
                <tr style={{ borderTop:'2px solid var(--kachel-rand)', background: fgs.enabled ? '#f0fdf4' : '#fafafa' }}>
                  <td colSpan={4} style={{ padding:'6px 8px' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                      <label style={{ display:'flex', alignItems:'center', gap:5, cursor:'pointer',
                                      fontSize:12, fontWeight:600, color:'var(--text)', whiteSpace:'nowrap' }}>
                        <input type="checkbox" checked={fgs.enabled}
                          onChange={e => onFgsChange(lbl, {...fgs, enabled:e.target.checked})}
                          style={{ cursor:'pointer', accentColor:'#15803d' }} />
                        FGS
                      </label>
                      <HerkunftMarke art={fgsArt(uebernahme?.arme[armIdx], fgs.enabled)} />
                      {fgs.enabled && (<>
                        <NumInput live value={fgs.volume}
                          onChange={v => onFgsChange(lbl, {...fgs, volume:v})}
                          width={60} />
                        <span style={{ fontSize:12, color:'var(--text-muted)' }}>Fg/h</span>
                        <NumInput live value={fgs.length}
                          onChange={v => onFgsChange(lbl, {...fgs, length:v})}
                          max={50} width={46} />
                        <span style={{ fontSize:12, color:'var(--text-muted)' }}>m</span>
                      </>)}
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>

            <div style={{ padding:'6px 10px', display:'flex', gap:10, fontSize:12,
                          borderTop:'1px solid var(--kachel-rand)', background:'#fafafa' }}>
              <span style={{ color:'var(--text-muted)' }}>
                FS1: <strong>{fs1Q} PWE/h</strong>
              </span>
              {fs2Q !== null && (
                <span style={{ color:'var(--text-muted)' }}>
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
  const nextId = Math.max(0, ...phaseStates.map(p=>p.id)) + 1

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
          className="knopf zweit">
          Vorschlag laden
        </button>
        <button onClick={onSuggestMinimal}
          title="Berechnet die kleinstmögliche Phasenzahl, die alle aktiven Fahrstreifen konfliktfrei trennt — basierend auf den eingegebenen Verkehrsstärken (nur Ströme mit Q &gt; 0)."
          className="knopf zweit">
          Minimaler Phasenplan
        </button>
      </div>
      <div style={{ display:'flex', gap:20, marginBottom:10, flexWrap:'wrap' }}>
        <span style={{ fontSize:12, color:'var(--text-muted)' }}>
          <span style={{ fontWeight:600 }}>Vorschlag laden:</span> Fixer Standard HS (A+C) | NS (B{lanes.some(l=>l.armIndex===3)?'+D':''}), unabhängig von Verkehrsstärken
        </span>
        <span style={{ fontSize:12, color:'var(--text-muted)' }}>
          <span style={{ fontWeight:600 }}>Minimaler Phasenplan:</span> Kleinstmögliche Phasenzahl für aktive Ströme (Ziffer 11, Seite 9)
        </span>
      </div>

      <div style={{ overflowX:'auto' }}>
        <table style={{ borderCollapse:'collapse', fontSize:12, minWidth:400 }}>
          <thead>
            <tr>
              <th style={{ padding:'6px 10px', textAlign:'left', background:'#f9fafb',
                           border:'1px solid var(--kachel-rand)', color:'var(--text-muted)', fontWeight:600, width:70 }}>
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
                                          border:'1px solid var(--kachel-rand)', minWidth:72 }}>
                    <div style={{ fontWeight:700, color:col, fontSize:12 }}>
                      {lbl} {colLabel}
                    </div>
                    {!l.isFGS && l.streamIds.length > 0 && (
                      <div style={{ fontSize:12, color:'var(--text-muted)', fontWeight:400 }}>
                        {l.streamIds.map(s=>s.replace('q','')).join(', ')}
                      </div>
                    )}
                    <div style={{ fontSize:12, color:'var(--text-muted)' }}>{qk} {unitLabel}</div>
                  </th>
                )
              })}
              <th style={{ padding:'5px 8px', background:'#f9fafb',
                           border:'1px solid var(--kachel-rand)', width:24 }}></th>
            </tr>
          </thead>
          <tbody>
            {phaseStates.map((ph, pi) => {
              const pr = result?.phases[pi]
              const bg = pi%2===0 ? '#fff' : '#fafafa'
              return (
                <tr key={ph.id}>
                  <td style={{ padding:'6px 10px', border:'1px solid var(--kachel-rand)',
                                background:bg, fontWeight:700, color:'var(--text)' }}>
                    <div>{pi+1}</div>
                    {pr && (
                      <div style={{ fontSize:12, color:'var(--text-muted)', marginTop:2 }}>
                        Q={Math.round(pr.qKrit)}
                      </div>
                    )}
                  </td>
                  {lanes.map(l => (
                    <td key={l.id} style={{ padding:'0', textAlign:'center',
                                            border:'1px solid var(--kachel-rand)', background:bg }}>
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
                  <td style={{ padding:'4px 6px', border:'1px solid var(--kachel-rand)', background:bg,
                                textAlign:'center' }}>
                    <button onClick={() => removePhase(ph.id)} title="Phase entfernen"
                      style={{ background:'none', border:'none', cursor:'pointer',
                               color:'var(--text-muted)', fontSize:14, lineHeight:1,
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
            if (pr.empty) return (
              <div key={pr.id} style={{ padding:'6px 10px', borderRadius:8, fontSize:12,
                                        border:'1px dashed var(--border)', background:'#f9fafb',
                                        color:'var(--text-muted)', minWidth:160 }}>
                <div style={{ fontWeight:700, color:'var(--text-muted)', marginBottom:3 }}>Phase {i+1}</div>
                Leer (kein Fahrstreifen mit Verkehr) — wird nicht berücksichtigt
              </div>
            )
            return (
              <div key={pr.id} style={{
                padding:'6px 10px', borderRadius:8, fontSize:12,
                border: below ? '1px solid #fca5a5' : '1px solid var(--kachel-rand)',
                background: below ? '#fff5f5' : '#f8fafc',
                minWidth:160,
              }}>
                <div style={{ fontWeight:700, color:'var(--text)', marginBottom:3 }}>Phase {i+1}</div>
                <div style={{ color:'var(--text-muted)' }}>Q_krit: <strong>{Math.round(pr.qKrit)} PWE/h</strong></div>
                <div style={{ color:'var(--text-muted)' }}>
                  t_Gr_min: <strong>{pr.tGrMin.toFixed(1)} s</strong>
                  {pr.tGrMin > 4 && <span style={{ color:'#15803d' }}> (FGS)</span>}
                </div>
                <div style={{ color:'var(--text-muted)' }}>Q_krit_min: <strong>{Math.round(pr.qKritMin)} PWE/h</strong></div>
                <div style={{ color:'var(--text-muted)' }}>
                  t_Gr: <strong>{pr.tGr.toFixed(1)} s</strong>
                  {'  '}λ: <strong>{(pr.lambda*100).toFixed(1)}%</strong>
                </div>
                {pr.minGreenGoverns && !below && (
                  <div style={{ color:'var(--text-muted)', marginTop:3 }}>
                    Mindestgrünzeit massgebend (Q_krit &lt; Q_krit_min)
                  </div>
                )}
                {below && (
                  <div style={{ color:'#dc2626', fontWeight:600, marginTop:3 }}>
                    ⚠ t_Gr &lt; t_Gr_min (Überlast)
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Konflikte */}
      {result && result.conflicts.length > 0 && (
        <div className="hinweis klein" style={{ marginTop:10 }}>
          <div style={{ fontWeight:700, marginBottom:4 }}>
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
        className="knopf zweit" style={{ marginTop:10 }}>
        + Phase hinzufügen
      </button>
    </div>
  )
}

// ── Ergebnis-Panel ────────────────────────────────────────────────────────────
function ResultsPanelV2({ result, targetLos, tzMode, onTargetLos, onManualZ }: {
  result: LSAResultV2
  targetLos: LevelOfService
  tzMode: TzMode
  onTargetLos: (l:LevelOfService) => void
  onManualZ: (z:number) => void
}) {
  const { Z, zIsManual, zRaised, zAboveMax, sumQKrit, maxQKrit, overloaded, lanes, overallLos, meetsTargetLos,
          overlapIssues, fgsOverloaded, zForTarget } = result
  const reserve = maxQKrit - sumQKrit
  const activeVehLanes = lanes.filter(l=>l.qKrit>0 && !l.isFGS)
  const activeFgsLanes = lanes.filter(l=>l.qKrit>0 && l.isFGS)
  const lanesNoGreen = activeVehLanes.filter(l=>l.lambda===0)
  const reserveInvalid = overloaded || overlapIssues.length>0 || lanesNoGreen.length>0

  return (
    <div className="kachel" style={{ overflow:'hidden' }}>

      {/* Bewertungsblatt + Schritt 4+5 Label */}
      <div style={{ padding:'10px 14px 0', borderBottom:'none' }}>
        <StepBadge n="4/5" label="Leistungsfähigkeit L und Verkehrsqualität beurteilen" />
        <p style={{ fontSize:12, color:'var(--text-muted)', margin:'-6px 0 8px' }}>
          Schritt 4: L, λ, X und w_m je Fahrstreifen (Ziffern 11.3 und 12, Seiten 10 und 13). Schritt 5: VQS zugeordnet vs. tatsächlich (Tab. 4, Seite 14).
          Grundlagen: S = 1800 PWE/h, {tzText(result.tZ, tzMode)}. <strong>Ohne ÖV-Privilegierung</strong> (Ziffer 11.4, Seiten 11–12).
        </p>
      </div>

      {/* Gesamt-VQS */}
      <div style={{ padding:'12px 14px', borderBottom:'1px solid var(--kachel-rand)',
                    background:LOS_BG[overallLos] }}>
        <div style={{ fontSize:12, fontWeight:700, letterSpacing:'0.06em', textTransform:'uppercase',
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
                       color: targetLos===los ? LOS_COLOR[los] : 'var(--text-muted)',
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
        {fgsOverloaded.length>0 && (
          <div style={{ marginTop:8, fontSize:12, fontWeight:700, color:'#991b1b' }}>
            {fgsOverloadText(result)}
          </div>
        )}
      </div>

      {/* Kennzahlen */}
      <div style={{ padding:'10px 14px', borderBottom:'1px solid var(--kachel-rand)',
                    display:'flex', gap:16, flexWrap:'wrap', fontSize:14 }}>
        {[
          ['Umlaufzeit Z', `${Z} s${zIsManual ? ' ✎' : ''}`, overloaded ? '#dc2626' : '#1e3a5f'],
          ['ΣQ_krit', `${Math.round(sumQKrit)} PWE/h`, overloaded ? '#dc2626' : '#374151'],
          ['Reserve', reserveInvalid ? '—' : `+${Math.round(reserve)} PWE/h`,
           reserveInvalid ? '#dc2626' : reserve>100 ? '#16a34a' : '#ca8a04'],
        ].map(([lbl,val,col]) => (
          <div key={String(lbl)} style={{ textAlign:'center' }}>
            <div style={{ fontSize:20, fontWeight:800, color:String(col) }}>{val}</div>
            <div style={{ fontSize:12, color:'var(--text-muted)' }}>{lbl}</div>
          </div>
        ))}
      </div>

      {overloaded && (
        <div className="fehlerbox klein" style={{ margin:'8px 12px' }}>
          ΣQ_krit = {Math.round(sumQKrit)} PWE/h erreicht oder übersteigt die maximale kritische
          Verkehrsstärke bei Z = {Z} s ({Math.round(maxQKrit)} PWE/h){zIsManual ? '' : ', der grössten Umlaufzeit nach Tab. 2'}.
          Knoten überlastet oder mehr Fahrstreifen nötig.
        </div>
      )}
      {overlapIssues.length>0 && (
        <div className="fehlerbox klein" style={{ margin:'8px 12px' }}>
          {overlapIssues.map(i => <div key={i.laneId}><strong>{overlapText(i)}</strong></div>)}
          <div style={{ marginTop:3 }}>{OVERLAP_NOTE}</div>
        </div>
      )}
      {lanesNoGreen.length>0 && (
        <div className="fehlerbox klein" style={{ margin:'8px 12px' }}>
          Ohne Grün: {lanesNoGreen.map(l=>l.label).join(', ')}. Der Fahrstreifen ist in keiner Phase eingetragen.
        </div>
      )}
      {!zIsManual && !meetsTargetLos && !overloaded && (
        <div className="hinweis klein" style={{ margin:'8px 12px' }}>
          {zTargetText(result, targetLos)}
          {zForTarget && (
            <button onClick={() => onManualZ(zForTarget.Z)}
              className="knopf zweit klein" style={{ marginLeft:8 }}>
              Z = {zForTarget.Z} s übernehmen
            </button>
          )}
        </div>
      )}
      {zRaised && (
        <div className="hinweis klein" style={{ margin:'8px 12px' }}>
          Die manuelle Umlaufzeit ist kürzer als Zwischenzeiten plus Mindestgrünzeiten aller Phasen —
          gerechnet wird mit dem Minimum Z = {Z} s.
        </div>
      )}
      {zAboveMax && (
        <div className="hinweis klein" style={{ margin:'8px 12px' }}>
          Z = {Z} s liegt über 120 s — solche Umlaufzeiten sind nach Ziffer 10.4.3, Seite 9 nicht zu verwenden
          (u. a. zu lange Wartezeiten für Fussgänger*innen).
        </div>
      )}

      {/* Kfz-Fahrstreifen-Tabelle */}
      {activeVehLanes.length > 0 && (
        <div style={{ padding:'8px 12px 4px' }}>
          <div style={{ fontSize:12, fontWeight:700, letterSpacing:'0.06em',
                        color:'var(--text-muted)', textTransform:'uppercase', marginBottom:8 }}>
            Fahrstreifen (Kfz)
          </div>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
            <thead>
              <tr style={{ background:'#f9fafb', color:'var(--text-muted)', fontWeight:700 }}>
                {['Fahrstreifen','Q_krit','λ','L','X','w_m','ST_RE95','VQS'].map(h => (
                  <th key={h} style={{ padding:'4px 8px', textAlign: h==='Fahrstreifen'?'left':'right',
                                       borderBottom:'1px solid var(--kachel-rand)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {activeVehLanes.map(l => (
                <tr key={l.laneId}
                  style={{ borderBottom:'1px solid var(--kachel-rand)',
                           background: l.isCritical ? '#fffbeb' : undefined }}>
                  <td style={{ padding:'4px 8px', color:'var(--text)' }}>
                    <div style={{ fontWeight: l.isCritical ? 700 : 400 }}>
                      {l.label}
                    </div>
                    <div style={{ fontSize:12, color:'var(--text-muted)' }}>
                      {l.streamIds.map(id => `${id} ${STREAM_LABELS[id]??''}`).join(' · ')}
                    </div>
                    {l.isCritical && (
                      <span style={{ fontSize:12, color:'#b45309', background:'#fef3c7',
                                     padding:'1px 4px', borderRadius:3 }}>krit.</span>
                    )}
                  </td>
                  <td style={{ padding:'4px 8px', textAlign:'right' }}>
                    {Math.round(l.qKrit)}{' '}
                    <span style={{ fontSize:12, color:'var(--text-muted)' }}>PWE/h</span>
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
                      ? <><strong>{Math.round(l.queueM)}</strong> <span style={{ fontSize:12, color:'var(--text-muted)' }}>m</span></>
                      : <span style={{ color:'#dc2626' }}>—</span>}
                  </td>
                  <td style={{ padding:'4px 8px', textAlign:'right' }}>
                    <span style={{ display:'inline-flex', alignItems:'center', gap:3 }}>
                      <LOSBadge los={l.los} />
                      {!l.meetsTarget && (
                        <span style={{ fontSize:12, color:'#dc2626' }}>✗</span>
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
          <div style={{ fontSize:12, fontWeight:700, letterSpacing:'0.06em',
                        color:'#15803d', textTransform:'uppercase', marginBottom:8 }}>
            Fussgängerstreifen
          </div>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
            <thead>
              <tr style={{ background:'#f0fdf4', color:'var(--text-muted)', fontWeight:700 }}>
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
                    <span style={{ fontSize:12, color:'var(--text-muted)' }}>Fg/h</span>
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
                        <span style={{ fontSize:12, color:'#dc2626' }}>✗</span>
                      )}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ fontSize:12, color:'var(--text-muted)', marginTop:4 }}>
            S = 8000 Fg/h (VSS 40 834, Ziffer 4, Seite 3). Annahme: Wartezeit und VQS mit den Formeln für Motorfahrzeuge;
            Tab. 4 (Seite 14) gilt für den Individualverkehr, der Fussverkehr ist separat zu beurteilen (Ziffer 12, Seite 13).
            Gesamturteil nur Kfz.
          </div>
        </div>
      )}

      {/* VQS pro Strom */}
      {result.streams.filter(s => !s.isFGS).length > 0 && (
        <div style={{ padding:'4px 12px 12px' }}>
          <div style={{ fontSize:12, fontWeight:700, letterSpacing:'0.06em',
                        color:'var(--text-muted)', textTransform:'uppercase', marginBottom:8 }}>
            VQS pro Strom (Kfz)
          </div>
          <div style={{ fontSize:12, color:'var(--text-muted)', marginBottom:6 }}>
            Auslastung, Rückstau, Wartezeit und VQS sind die Werte des Fahrstreifens — die Ströme eines
            Fahrstreifens teilen Grünzeit und Rückstau (Ziffer 9.3, Seite 8).
          </div>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
            <thead>
              <tr style={{ background:'#f9fafb', color:'var(--text-muted)', fontWeight:700 }}>
                {['Strom','Fahrstreifen','Ausl.','L-95','Wz','VQS'].map((h,i) => (
                  <th key={h} style={{ padding:'4px 8px', textAlign: i<2 ? 'left' : 'right',
                                       borderBottom:'1px solid var(--kachel-rand)', whiteSpace:'nowrap' }}>
                    {h === 'Ausl.' ? 'Ausl. [%]' : h === 'L-95' ? 'L-95 [m]' : h === 'Wz' ? 'Wz [s]' : h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.streams.filter(s => !s.isFGS).map(s => (
                <tr key={`${s.laneId}-${s.streamId}`} style={{ borderBottom:'1px solid var(--kachel-rand)' }}>
                  <td style={{ padding:'4px 8px', color:'var(--text)' }}>
                    <span style={{ fontFamily:'monospace', color:'var(--accent)', marginRight:6 }}>{s.streamId}</span>
                    <span style={{ color:'var(--text-muted)', fontSize:12 }}>{STREAM_LABELS[s.streamId] ?? s.streamId}</span>
                  </td>
                  <td style={{ padding:'4px 8px', color:'var(--text-muted)', fontSize:12 }}>{s.laneLabel}</td>
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
                      {!s.meetsTarget && <span style={{ fontSize:12, color:'#dc2626' }}>✗</span>}
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
                    background:'#f8fafc', border:'1px solid var(--kachel-rand)',
                    fontSize:12, color:'var(--text)', lineHeight:1.65 }}>
        <div style={{ fontWeight:700, color:'var(--text-strong)', marginBottom:4 }}>
          Methodik (VSS 40 023a)
        </div>
        <div><strong>Grundlagen:</strong> VSS 40 023a — <em>Leistungsfähigkeit, Verkehrsqualität, Belastbarkeit; Knoten mit Lichtsignalanlagen</em>; VSS 40 837 — <em>Lichtsignalanlagen; Übergangszeiten und Mindestzeiten</em>; VSS 40 834 — <em>Lichtsignalanlagen; Phasentrennung</em>; Handbuch Lichtsignalanlagen (HB LSA), Tiefbauamt Stadt Bern, V 2.1, Anhang G — Mindestfreigabezeit FGS mind. 5 s</div>
        <div><strong>Fz → PWE</strong> nach Ziffer 10.2, Seite 8: PW = 1,0 · LW = 2,0 · MR = 0,5 · FR = 0,25</div>
        <div><strong>Q_krit</strong>: Verkehrsstärke eines Fahrstreifens = Summe seiner Ströme (Ziffer 9.3, Seite 8); pro Phase der grösste exklusive Kfz-Fahrstreifen (Ziffern 10.4.1 und 11.1, Seiten 8–9); S = 1800 PWE/h (Ziffer 11.3, Seite 10). Annahme: FGS gehen nicht in Q_krit ein, ihre Mindestgrünzeit wirkt über Q_krit_min; VSS 40 834 führt Q_krit auch für FGS (S = 8000 Fg/h, Ziffer 4, Seite 3; mindestens 800 Fg/h, Ziffer 7, Seite 8)</div>
        <div><strong>Z</strong> aus Tab. 2, Seite 10: kleinste Umlaufzeit, bei der qKritMax &gt; ΣQ_krit; Grünzeiten proportional zu Q_krit</div>
        <div><strong>ST_RE95</strong> = 1,691·√(PWE_mr+PWE_GE) + (PWE_mr+PWE_GE); × 6 m/PWE (Ziffer 11.5, Seiten 12–13); PWE_mr = Q·t_r/3600; PWE_GE = w₀·Q/(3600·X) wie in Tab. 7, Tab. 10 und Abb. 15 (Seiten 20, 22, 28); der Druck auf Seite 13 nennt ·X</div>
        <div><strong>t_Gr_min</strong> nach VSS 40 837 (Ziffer 18, Seite 6): FZ = 4 s; FGS = max(5 s, 2/3·L / 1,2 m·s⁻¹). Die 5 s stammen aus dem HB LSA Stadt Bern (Tabelle 53, Seite 151), die Norm nennt 4 s</div>
        <div><strong>w_m</strong> = w₁ + w₀ (Ziffer 12, Seite 13): w₁ = Z·(1−λ)² / (2·(1−λ·X)); w₀ nach der Formel auf Seite 13, C = 0,5 (isolierte LSA)</div>
        <div><strong>VQS</strong> nach Tab. 4, Seite 14: A ≤ 20 s · B ≤ 35 s · C ≤ 50 s · D ≤ 70 s · E ≤ 100 s · F = Überlast</div>
        <div style={{ marginTop:4, color:'var(--text-muted)', fontSize:12 }}>Ohne ÖV-Privilegierung (Ziffer 11.4, Seiten 11–12). Ergebnisse ersetzen keine Überprüfung durch eine Fachperson.</div>
      </div>
    </div>
  )
}

// ── Auswertungsblatt (Druckansicht) ───────────────────────────────────────────
// Gerüst wie in den anderen Rechnern (bericht/Bericht.tsx): Kopf, Ergebnis, Rechenschritte, Eingaben, Annahmen und Hinweise, Quellen
const LOS_DESC: Record<LevelOfService, string> = {
  A:'Sehr gut — sehr kurze Wartezeiten', B:'Gut — kurze Wartezeiten',
  C:'Zufriedenstellend', D:'Ausreichend — beträchtliche Wartezeiten',
  E:'Mangelhaft — lange Wartezeiten', F:'Völlig ungenügend — Überlast',
}
const RICHTUNGEN = [['left', 'links'], ['straight', 'geradeaus'], ['right', 'rechts']] as const

const th: React.CSSProperties = { padding:'3px 6px', border:'1px solid #bbb', background:'#ececec', fontSize:9, fontWeight:700, textAlign:'right', whiteSpace:'nowrap' }
const thL: React.CSSProperties = { ...th, textAlign:'left' }
const td: React.CSSProperties = { padding:'3px 6px', border:'1px solid #ddd', fontSize:10, textAlign:'right' }
const tdL: React.CSSProperties = { ...td, textAlign:'left' }
const tab: React.CSSProperties = { width:'100%', borderCollapse:'collapse', marginBottom:10 }
const xFarbe = (X: number) => !isFinite(X) || X >= 1 ? '#b91c1c' : X >= 0.9 ? '#c2410c' : '#374151'

export function LSAPrintSheet({ nodeName, armCount, arms, volumes, moveLane, fgsConfig, lanes, phaseStates, result, targetLos, tzMode,
  manualZ = 0, onClose, karte, uebernahme, schaetzung }: {
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
  tzMode: TzMode
  /** von Hand gewählte Umlaufzeit [s]; 0 = automatisch aus Tab. 2 */
  manualZ?: number
  onClose: () => void
  karte?: KartenBezug | null
  uebernahme?: KnotenUebernahme
  schaetzung?: Schaetzung | null
}) {
  const armLabels = armCount === 3 ? ['A','C','B'] : ['A','C','B','D']
  const overall = result.overallLos
  const reserve = result.maxQKrit - result.sumQKrit
  const activeVehLanes = result.lanes.filter(l => l.qKrit > 0 && !l.isFGS)
  const activeFgsLanes = result.lanes.filter(l => l.qKrit > 0 && l.isFGS)
  const lanesNoGreen = activeVehLanes.filter(l => l.lambda === 0)
  const reserveInvalid = result.overloaded || result.overlapIssues.length > 0 || lanesNoGreen.length > 0
  const vehStreams = result.streams.filter(s => !s.isFGS)
  const laneLabel = (id: string) => lanes.find(l => l.id === id)?.label ?? id
  const phaseNr = (id: number) => phaseStates.findIndex(ph => ph.id === id) + 1

  // Herkunft: Werte aus der Karte oder dem Modell, solange sie noch gleich sind wie bei der Übernahme
  const herkunft: (HerkunftArt | null)[] = []
  const merke = (h: HerkunftArt | null) => { herkunft.push(h); return h }
  const laneAus = uebernahme ? moveLaneAus(uebernahme) : {}
  const uArm = (i: number) => uebernahme?.arme[i]
  const knotenNameArt = merke(kartenHerkunft(uebernahme?.name, nodeName))

  const warnungen: ReactNode[] = [
    ...result.overlapIssues.map(i => <b>{overlapText(i)}</b>),
    ...(result.overlapIssues.length > 0 ? [OVERLAP_NOTE] : []),
    ...(result.overloaded ? [<>ΣQ_krit = {Math.round(result.sumQKrit)} PWE/h erreicht oder übersteigt die maximale kritische Verkehrsstärke
      bei Z = {result.Z} s ({Math.round(result.maxQKrit)} PWE/h){result.zIsManual ? '' : ', der grössten Umlaufzeit nach Tab. 2'}.
      Knoten überlastet oder mehr Fahrstreifen nötig.</>] : []),
    ...(lanesNoGreen.length > 0 ? [`Ohne Grün: ${lanesNoGreen.map(l => l.label).join(', ')}. Der Fahrstreifen ist in keiner Phase eingetragen.`] : []),
    ...(result.fgsOverloaded.length > 0 ? [<b>{fgsOverloadText(result)}</b>] : []),
    ...(result.conflicts.length > 0 ? [<><b>Unverträgliche Ströme in derselben Phase:</b>{' '}
      {result.conflicts.map(c => `Phase ${phaseNr(c.phaseId)}: ${c.streamA}↔${c.streamB}`).join(' · ')}</>] : []),
    ...(!result.zIsManual && !result.meetsTargetLos && !result.overloaded ? [zTargetText(result, targetLos)] : []),
    ...(result.zRaised ? [`Die gewählte Umlaufzeit ist kürzer als Zwischenzeiten plus Mindestgrünzeiten aller Phasen; gerechnet wird mit dem Minimum Z = ${result.Z} s.`] : []),
    ...(result.zAboveMax ? [`Z = ${result.Z} s liegt über 120 s; solche Umlaufzeiten sind nach Ziffer 10.4.3, Seite 9 nicht zu verwenden (u. a. zu lange Wartezeiten für Fussgänger*innen).`] : []),
  ]

  const hinweise: ReactNode[] = [
    ...(karte?.belegt ?? []),
    ...(schaetzung && schaetzungGilt(schaetzung, arms) ? [schaetzung.text] : []),
    ...(tzMode === 'staffel' ? [<><b>Annahme:</b> Die Zwischenzeit ist nach der zulässigen Geschwindigkeit gestaffelt (3/4/5 s, angelehnt an die
      Gelbzeiten der VSS 40 837, Ziffer 16, Seite 5), massgebend ist der grösste Wert aller Arme. Die Norm-Pauschale beträgt {TZ_NORM} s je Phase
      (Ziffer 11.2, Seite 10).</>] : []),
    <><b>Annahme:</b> Fussgängerstreifen gehen nicht in Q_krit ein, ihre Mindestgrünzeit wirkt über Q_krit_min; VSS 40 834 führt Q_krit auch
      für Fussgängerstreifen (S = 8000 Fg/h, Ziffer 4, Seite 3; mindestens 800 Fg/h, Ziffer 7, Seite 8).</>,
    <>Mindestgrünzeit t_Gr_min nach VSS 40 837 (Ziffer 18, Seite 6): Fahrzeuge 4 s; Fussgängerstreifen max(5 s, 2/3·L / 1,2 m·s⁻¹). Die 5 s
      stammen aus dem HB LSA Stadt Bern (Tabelle 53, Seite 151), die Norm nennt 4 s.</>,
    ...(activeFgsLanes.length > 0 ? [<><b>Annahme:</b> Wartezeit und VQS der Fussgängerstreifen mit den Formeln für Motorfahrzeuge
      (S = 8000 Fg/h, VSS 40 834, Ziffer 4, Seite 3); Tab. 4 (Seite 14) gilt für den Individualverkehr, der Fussverkehr ist separat zu
      beurteilen (Ziffer 12, Seite 13). Die Gesamtstufe gilt nur für den Motorfahrzeugverkehr.</>] : []),
    'Ohne ÖV-Privilegierung (Ziffer 11.4, Seiten 11–12).',
    'Die Ergebnisse ersetzen keine Überprüfung durch eine Fachperson.',
  ]

  return (
    <BerichtRahmen dokumentTitel={`KnotenCheck – VSS 40 023a${nodeName ? ' – ' + nodeName : ''}`} onClose={onClose}>
      <BerichtKopf
        titel="Bewertungsblatt LSA-Knoten"
        angaben={<>
          <b>Bezeichnung:</b> {nodeName || '—'}<Herkunft art={knotenNameArt} /> · <b>Knotentyp:</b> {armCount === 3 ? 'Einmündung (3-Arm)' : 'Kreuzung (4-Arm)'}<br />
          <b>Hauptstrasse:</b> {[0, 1].map(i => `Arm ${armLabels[i]}${arms[i]?.name ? ` (${arms[i].name})` : ''}`).join(', ')} ·{' '}
          <b>Nebenstrasse:</b> {armLabels.slice(2).map((lbl, j) => `Arm ${lbl}${arms[j + 2]?.name ? ` (${arms[j + 2].name})` : ''}`).join(', ')}
        </>}
        norm="VSS 40 023a «Leistungsfähigkeit, Verkehrsqualität, Belastbarkeit; Knoten mit Lichtsignalanlagen»"
        karte={karte} />

      {/* ── Ergebnis ───────────────────────────────────────────────────────── */}
      <Abschnitt titel="Ergebnis">
        <Gesamtergebnis stufe={overall} farbe={LOS_BG[overall]}
          text={<>
            <b>Qualitätsstufe {overall}:</b> {LOS_DESC[overall]}. Massgebend ist der schlechteste Kfz-Fahrstreifen; Stufen nach Tab. 4, Seite 14.<br />
            Z = {result.Z} s · ΣQ_krit = {Math.round(result.sumQKrit)} PWE/h
            {reserveInvalid ? ' · Überlastet' : ` · Reserve = +${Math.round(reserve)} PWE/h`}
            {' · '}Ziel-VQS {targetLos}: {result.meetsTargetLos ? 'erreicht ✓' : 'nicht erreicht ✗'}
          </>} />
        {warnungen.length > 0 && (
          <ul className="bericht-hinweise" style={{ color:'#991b1b' }}>{warnungen.map((w, i) => <li key={i}>{w}</li>)}</ul>
        )}

        {activeVehLanes.length > 0 && (<>
          <h3>Fahrstreifen (Kfz)</h3>
          <table style={tab}>
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
                  <td style={{ ...td, fontWeight:600, color:xFarbe(l.X) }}>{isFinite(l.X) ? l.X.toFixed(2) : '>1'}</td>
                  <td style={td}>{delayText(l.wm)}</td>
                  <td style={td}>{isFinite(l.queueM) ? `${Math.round(l.queueM)} m` : '—'}</td>
                  <td style={{ ...td, textAlign:'center', fontWeight:800, background:LOS_BG[l.los], color:LOS_COLOR[l.los] }}>{l.los}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>)}

        {vehStreams.length > 0 && (<>
          <h3>VQS je Strom (Kfz)</h3>
          <p className="bericht-unter">
            Auslastung, L-95, Wartezeit und VQS = Werte des Fahrstreifens (Ströme teilen Grünzeit und Rückstau, Ziffer 9.3, Seite 8).
          </p>
          <table style={tab}>
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
              {vehStreams.map((s, i) => (
                <tr key={`${s.laneId}-${s.streamId}`} style={{ background: i%2===0?'#fff':'#f7f7f7' }}>
                  <td style={{ ...tdL, fontFamily:'monospace', color:'#1e3a5f' }}>{s.streamId}</td>
                  <td style={tdL}>{STREAM_LABELS[s.streamId] ?? s.streamId}</td>
                  <td style={tdL}>{s.laneLabel}</td>
                  <td style={{ ...td, fontWeight:600, color:xFarbe(s.X) }}>{isFinite(s.X) ? `${(s.X*100).toFixed(0)}` : '>100'}</td>
                  <td style={td}>{isFinite(s.queueM) ? `${Math.round(s.queueM)} m` : '—'}</td>
                  <td style={td}>{delayText(s.wm)}</td>
                  <td style={{ ...td, textAlign:'center', fontWeight:800, background:LOS_BG[s.los], color:LOS_COLOR[s.los] }}>{s.los}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>)}

        {activeFgsLanes.length > 0 && (<>
          <h3>Fussgängerstreifen</h3>
          <table style={tab}>
            <thead>
              <tr>
                <th style={thL}>Fussgängerstreifen</th>
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
                  <td style={{ ...td, textAlign:'center', fontWeight:800, background:LOS_BG[l.los], color:LOS_COLOR[l.los] }}>{l.los}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>)}
      </Abschnitt>

      {/* ── Rechenschritte ─────────────────────────────────────────────────── */}
      <Abschnitt titel="Rechenschritte nach VSS 40 023a">
        <h3>Knotenströme</h3>
        <div className="bl-diagram" style={{ display:'flex', justifyContent:'center', marginBottom:8 }}>
          <img src={armCount === 4 ? lsa4ArmSvg : lsa3ArmSvg} alt={armCount === 4 ? 'Knotenströme Kreuzung' : 'Knotenströme Einmündung'}
            style={{ height:160, width:'auto' }} />
        </div>

        <h3>Massgebende Verkehrsstärken (Ziffern 9 und 10.2, Seiten 7–8)</h3>
        <table style={tab}>
          <thead>
            <tr>
              <th style={thL}>Arm</th>
              <th style={thL}>Strom</th>
              <th style={thL}>Richtung</th>
              <th style={th}>Q [Fz/h]</th>
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
                  <td style={td}>{arms[armIdx]?.[m.direction] ?? 0}</td>
                  <td style={{ ...td, fontWeight:600 }}>{volumes[m.id]??0}</td>
                  <td style={td}>{moveLane[m.id] ? `FS${moveLane[m.id]}` : '–'}</td>
                </tr>
              ))
              if (fgs?.enabled) {
                rows.push(
                  <tr key={`fgs-${lbl}`} style={{ background:'#f0fdf4' }}>
                    <td style={{ ...tdL, fontFamily:'monospace', color:'#15803d' }}>{`fgs-${lbl}`}</td>
                    <td style={{ ...tdL, color:'#15803d' }}>Fussgänger ({fgs.length} m)</td>
                    <td style={td}>—</td>
                    <td style={{ ...td, color:'#15803d', fontWeight:600 }}>{fgs.volume} Fg/h</td>
                    <td style={{ ...td, color:'#15803d' }}>—</td>
                  </tr>
                )
              }
              return rows
            })}
          </tbody>
        </table>
        <p className="bericht-unter">
          Fz → PWE: PW=1,0 · LW=2,0 · MR=0,5 · FR=0,25 (Ziffer 10.2, Seite 8). Die Verkehrsstärke eines Fahrstreifens ist die Summe seiner
          Ströme (Ziffer 9.3, Seite 8).
        </p>

        <h3>Phasenplan, kritische Verkehrsstärken und Grünzeiten</h3>
        <table style={tab}>
          <thead>
            <tr>
              <th style={thL}>Phase</th>
              <th style={thL}>Grün für</th>
              <th style={th}>Q_krit<br/>[PWE/h]</th>
              <th style={th}>Q_krit_min<br/>[PWE/h]</th>
              <th style={th}>t_Gr_min<br/>[s]</th>
              <th style={th}>t_Gr<br/>[s]</th>
              <th style={th}>λ [%]</th>
              <th style={thL}>Bemerkung</th>
            </tr>
          </thead>
          <tbody>
            {phaseStates.map((ph, pi) => {
              const pr = result.phases[pi]
              const bem = !pr ? '' : pr.empty ? 'ohne Verkehr, zählt nicht' : pr.belowMinGreen ? 't_Gr < t_Gr_min (Überlast)'
                : pr.minGreenGoverns ? 'Mindestgrünzeit massgebend' : ''
              return (
                <tr key={ph.id} style={{ background: pi%2===0?'#fff':'#f7f7f7' }}>
                  <td style={{ ...tdL, fontWeight:700 }}>{pi+1}</td>
                  <td style={tdL}>{ph.selectedLaneIds.filter(id => lanes.some(l => l.id === id)).map(laneLabel).join(', ') || '—'}</td>
                  <td style={td}>{pr ? Math.round(pr.qKrit) : '—'}</td>
                  <td style={td}>{pr ? Math.round(pr.qKritMin) : '—'}</td>
                  <td style={td}>{pr ? pr.tGrMin.toFixed(1) : '—'}</td>
                  <td style={{ ...td, fontWeight:600 }}>{pr ? pr.tGr.toFixed(1) : '—'}</td>
                  <td style={td}>{pr ? (pr.lambda*100).toFixed(1)+'%' : '—'}</td>
                  <td style={{ ...tdL, fontSize:9 }}>{bem}</td>
                </tr>
              )
            })}
            <tr style={{ background:'#ececec' }}>
              <td style={{ ...tdL, fontWeight:700, fontSize:9 }} colSpan={2}>Z = {result.Z} s</td>
              <td style={{ ...td, fontWeight:700 }}>Σ {Math.round(result.sumQKrit)}</td>
              <td colSpan={5} style={td}></td>
            </tr>
          </tbody>
        </table>
        <p className="bericht-unter">
          Q_krit: pro Phase der grösste exklusive Kfz-Fahrstreifen, mindestens Q_krit_min (Ziffern 10.4.1 und 11.1, Seiten 8–9); S = 1800 PWE/h
          (Ziffer 11.3, Seite 10). Grünzeiten proportional zu Q_krit.
        </p>

        <h3>Umlaufzeit und Zwischenzeit</h3>
        <ul className="bericht-hinweise">
          <li>Umlaufzeit Z = {result.Z} s, {result.zIsManual ? 'von Hand gewählt' : 'aus Tab. 2, Seite 10 (kleinste Umlaufzeit, bei der alle Q_krit gedeckt sind)'}.
            Grösste kritische Verkehrsstärke bei dieser Umlaufzeit {Math.round(result.maxQKrit)} PWE/h, ΣQ_krit = {Math.round(result.sumQKrit)} PWE/h
            {reserveInvalid ? ', keine Reserve.' : `, Reserve = +${Math.round(reserve)} PWE/h.`}</li>
          <li>Zwischenzeit: {tzText(result.tZ, tzMode)}.</li>
        </ul>

        <h3>Leistungsfähigkeit, Wartezeit und Verkehrsqualität</h3>
        <ul className="bericht-hinweise">
          <li>L = λ · S, X = Q / L (Ziffer 11.3, Seite 10).</li>
          <li>w_m = w₁ + w₀ (Ziffer 12, Seite 13, C = 0,5).</li>
          <li>ST_RE95 nach Ziffer 11.5 mit PWE_GE = w₀·Q/(3600·X) wie Tab. 7, Tab. 10 und Abb. 15 (Seiten 20, 22, 28; der Druck auf Seite 13 nennt ·X).</li>
          <li>VQS nach Tab. 4, Seite 14: A ≤20 s · B ≤35 s · C ≤50 s · D ≤70 s · E ≤100 s · F Überlast.</li>
        </ul>
      </Abschnitt>

      {/* ── Eingaben ───────────────────────────────────────────────────────── */}
      <Abschnitt titel="Eingaben">
        <h3>Verkehrsstärken je Arm [Fz/h]</h3>
        <table style={tab}>
          <thead>
            <tr>
              <th style={thL}>Arm</th>
              <th style={thL}>Strasse</th>
              {RICHTUNGEN.map(([r, t]) => <th key={r} style={th}>{t}</th>)}
              <th style={thL}>Fahrzeugmix</th>
              <th style={th}>v_zul [km/h]</th>
            </tr>
          </thead>
          <tbody>
            {armLabels.map((lbl, i) => {
              const arm = arms[i], dirs = new Set(armMovements(armCount, i).map(m => m.direction))
              return (
                <tr key={lbl} style={{ background: i%2===0?'#fff':'#f7f7f7' }}>
                  <td style={{ ...tdL, fontWeight:700 }}>{lbl} ({i<2?'HS':'NS'})</td>
                  <td style={tdL}>{arm?.name || '—'}<Herkunft art={merke(nameArt(uArm(i), arm?.name))} /></td>
                  {RICHTUNGEN.map(([r]) => dirs.has(r)
                    ? <td key={r} style={td}>{arm?.[r] ?? 0}<Herkunft art={merke(schaetzArt(schaetzung?.stroeme[i], r, arm?.[r] ?? 0) ?? stromArt(uArm(i), r, arm?.[r] ?? 0))} /></td>
                    : <td key={r} style={td}>–</td>)}
                  <td style={tdL}>{arm?.mix
                    ? <>LW {arm.mix.pctLW} %, MR {arm.mix.pctMR} %, FR {arm.mix.pctFR} %<Herkunft art={merke(mixArt(uArm(i), arm.mix))} /></>
                    : 'nur PW'}</td>
                  <td style={td}>{arm?.vDesign ?? '–'}<Herkunft art={merke(tempoArt(uArm(i), arm?.vDesign))} /></td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {tzMode === 'norm' && <p className="bericht-unter">Die zulässige Geschwindigkeit wird für die Pauschale der Zwischenzeit nicht verwendet.</p>}

        <h3>Fahrstreifenplan und Fussgängerstreifen</h3>
        <table style={tab}>
          <thead>
            <tr>
              <th style={thL}>Arm</th>
              <th style={thL}>FS1</th>
              <th style={thL}>FS2</th>
              <th style={thL}>Fussgängerstreifen</th>
            </tr>
          </thead>
          <tbody>
            {armLabels.map((lbl, i) => {
              const ids = armStreamIds(armCount, i), fgs = fgsConfig[lbl]
              const fs = (n: 1 | 2) => ids.filter(id => moveLane[id] === n).map(id => `${id} ${STREAM_LABELS[id] ?? ''}`).join(', ') || '—'
              const fsH = merke(fahrstreifenArt(laneAus, moveLane, armCount, i))
              return (
                <tr key={lbl} style={{ background: i%2===0?'#fff':'#f7f7f7' }}>
                  <td style={{ ...tdL, fontWeight:700 }}>{lbl}</td>
                  <td style={tdL}>{fs(1)}<Herkunft art={fsH} /></td>
                  <td style={tdL}>{fs(2)}</td>
                  <td style={tdL}>{fgs?.enabled
                    ? <>ja<Herkunft art={merke(fgsArt(uArm(i), true))} />, {fgs.volume} Fg/h, Querungslänge {fgs.length} m</>
                    : 'nein'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>

        <h3>Steuerung</h3>
        <ul className="bericht-hinweise">
          <li>Ziel-VQS: {targetLos}</li>
          <li>Umlaufzeit: {manualZ > 0 ? `von Hand gewählt, Z = ${manualZ} s${result.zRaised ? ` (gerechnet mit dem Minimum Z = ${result.Z} s)` : ''}` : 'automatisch aus Tab. 2, Seite 10'}</li>
          <li>Zwischenzeit: {tzMode === 'norm' ? 'Norm-Pauschale' : 'nach zulässiger Geschwindigkeit gestaffelt (Annahme)'}, T_Z = {result.tZ} s je Phase</li>
        </ul>
        <HerkunftLegende arten={herkunft} />
      </Abschnitt>

      <HinweisListe hinweise={hinweise} />
      <QuellenAbschnitt normen={GRUNDLAGEN.lsa} daten={karte?.quellen ?? []} />
    </BerichtRahmen>
  )
}

// ── Legende ───────────────────────────────────────────────────────────────────

const LEGEND_ITEMS: LegendItem[] = [
  { abbr: 'Fz/h',    desc: 'Fahrzeuge pro Stunde — Roheingabe Abbiegeströme' },
  { abbr: 'PWE/h',   desc: 'Personenwageneinheiten/h — umgerechnet gemäss Ziffer 10.2, Seite 8: PW=1, LW=2, MR=0.5, FR=0.25' },
  { abbr: 'Q',  unit: 'PWE/h', desc: 'Verkehrsstärke des Knotenstroms resp. Fahrstreifens in PWE/h (Ziffer 9, Seiten 7–8, VSS 40 023a)' },
  { abbr: 'S',  unit: 'PWE/h', desc: 'Fahrstreifensättigung — Richtwert 1800 PWE/h für durchschnittliche Verhältnisse (Ziffer 11.3, Seite 10, VSS 40 023a)' },
  { abbr: 'λ',       desc: 'Grünzeitanteil — Anteil der nutzbaren Grünzeit an der Umlaufzeit Z; λ = t_Gr · Z⁻¹ (Ziffer 11.3, Seite 10, VSS 40 023a)' },
  { abbr: 'X',       desc: 'Auslastungsgrad — X = Q · L⁻¹ (Ziffer 11.3, Seite 10, VSS 40 023a)' },
  { abbr: 'L',  unit: 'PWE/h', desc: 'Leistungsfähigkeit des Fahrstreifens — L = λ · S (Ziffer 11.3, Seite 10, VSS 40 023a)' },
  { abbr: 'w_m', unit: 's',   desc: 'Mittlere Wartezeit pro Motorfahrzeug — deterministischer Anteil w₁ und stochastischer Anteil w₀; w_m = w₁ + w₀ (Ziffer 12, Seite 13, VSS 40 023a)' },
  { abbr: 'VQS',     desc: 'Verkehrsqualitätsstufe A–F nach Tab. 4, Seite 14 (VSS 40 023a): A ≤20s · B ≤35s · C ≤50s · D ≤70s · E ≤100s · F >100s' },
  { abbr: 'Z',  unit: 's',    desc: 'Umlaufzeit — Gesamtdauer eines Signalprogramm-Umlaufs; praktisch 60–90 s (Ziffer 10.4.3, Seite 9); automatisch aus Tab. 2, Seite 10, oder manuell' },
  { abbr: 'ΣQ_krit', unit: 'PWE/h', desc: 'Summe der kritischen Verkehrsstärken — grösste unverträgliche Fahrstreifenbelastung je Phase (Summe der Ströme des Fahrstreifens, Ziffer 9.3, Seite 8), mindestens Q_krit_min (Mindestgrünzeit, Ziffer 10.4.1, Seiten 8–9), summiert; massgebend für Wahl der Umlaufzeit Z (Ziffer 11.1, Seite 9, VSS 40 023a)' },
  { abbr: 'T_Z', unit: 's',   desc: 'Zwischenzeit je Phase — Vorgabe ist die Norm-Pauschale 5 s/Phase (VSS 40 023a, Ziffer 11.2, Seite 10). Wählbar als Annahme: Staffelung 3/4/5 s nach zulässiger Geschwindigkeit, angelehnt an die Gelbzeiten der VSS 40 837 (Ziffer 16, Seite 5)' },
  { abbr: 'FGS',     desc: 'Fussgängerstreifen — LSA-gesicherter Fussgängerübergang; Mindestgrünzeit t_Gr_min = max(5 s, ⅔·L / 1,2 m·s⁻¹) — ⅔·L mit 1,2 m/s nach VSS 40 837 (Ziffer 18, Seite 6), Mindestwert 5 s nach HB LSA Bern V 2.1, Anhang G' },
]

// ── Hauptkomponente ───────────────────────────────────────────────────────────
// Aus der Karte: Namen übernommen, Ströme leer, ausser sie wurden aus dem Modell gewählt
function armsAus(u: KnotenUebernahme): UIArmInput[] {
  return defaultArms(u.armCount).map((a, i) => {
    const v = u.arme[i]
    return { ...a, name: v.name, ...v.stroeme, ...(v.tempo ? { vDesign: lsaTempo(v.tempo) } : {}),
      ...(v.schwerverkehr ? { mix: { pctLW: v.schwerverkehr.lw + v.schwerverkehr.lz, pctMR: 0, pctFR: 0 } } : {}) }
  })
}
function fgsAus(u: KnotenUebernahme): Record<string, FGSArmConfig> {
  return Object.fromEntries(u.arme.filter(a => a.fgs).map(a => [a.label, { ...DEFAULT_FGS, enabled: true }]))
}
// Ein Fahrstreifen: alle Ströme auf FS1. Zwei mit Abbiegeangabe in OSM: FS1 ist der rechte, FS2 der linke. Sonst bleibt die Zuordnung offen
function moveLaneAus(u: KnotenUebernahme): Record<string, 1|2> {
  const aus: Record<string, 1|2> = {}
  u.arme.forEach((a, i) => {
    const s = a.streifen
    if (s?.anzahl === 1) for (const m of armMovements(u.armCount, i)) aus[m.id] = 1
    if (s?.anzahl !== 2 || !s.spuren) return
    for (const m of armMovements(u.armCount, i))
      aus[m.id] = s.spuren[0].includes(m.direction) && !s.spuren[1].includes(m.direction) ? 2 : 1
  })
  return aus
}

export default function LSAApp({ uebernahme: kartenUebernahme }: { uebernahme?: KnotenUebernahme }) {
  const isActive = useIsActiveModule()  // Druckblatt nur im sichtbaren Modul
  // Die Übernahme aus der Karte gilt, bis man zurücksetzt oder eine Datei lädt
  const [mitKarte, setMitKarte] = useState(true)
  const uebernahme = mitKarte ? kartenUebernahme : undefined
  const [nodeName,    setNodeName]    = useState(uebernahme?.name ?? '')
  const [armCount,    setArmCount]    = useState<3|4>(uebernahme?.armCount ?? 4)
  const [armGewaehlt, setArmGewaehlt] = useState(!!uebernahme)   // Knotentyp hat keinen Startwert
  const [arms,        setArms]        = useState<UIArmInput[]>(() => uebernahme ? armsAus(uebernahme) : defaultArms(4))
  const [moveLane,    setMoveLane]    = useState<Record<string,1|2>>(() => uebernahme ? moveLaneAus(uebernahme) : {})
  const [fgsConfig,   setFgsConfig]   = useState<Record<string, FGSArmConfig>>(() => uebernahme ? fgsAus(uebernahme) : {})
  const [phaseStates, setPhaseStates] = useState<PhaseState[]>([])
  const [targetLos,   setTargetLos]   = useState<LevelOfService|null>(null)
  const [manualZ,     setManualZ]     = useState<number>(0)
  const [tzMode,      setTzMode]      = useState<TzMode|null>(null)
  const [loadHint,    setLoadHint]    = useState<string|null>(null)

  const skipArmCountEffect = useRef(false)
  const letzteArmzahl = useRef(armCount)
  const [karte, setKarte] = useState(() => uebernahme ? kartenBezugAus(uebernahme, 'lsa') : null)
  const [schaetzung, setSchaetzung] = useState<Schaetzung | null>(null)
  const [showBl, setShowBl] = useState(false)
  const openBl  = useCallback(() => setShowBl(true),  [])
  const closeBl = useCallback(() => setShowBl(false), [])
  const { meldung, melden, schliessen: meldungZu } = useMeldung()

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
      const fs1 = streams.filter(s=>moveLane[s]===1)
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

  // Bei armCount-Änderung: Eingaben leeren, der Phasenplan bleibt offen. Beim Start nichts tun:
  // Die Werte aus der Karte stehen schon im Zustand, und im StrictMode läuft der Effekt dort zweimal
  useEffect(() => {
    if (letzteArmzahl.current === armCount) return
    letzteArmzahl.current = armCount
    if (skipArmCountEffect.current) { skipArmCountEffect.current = false; return }
    setFgsConfig({})
    setArms(defaultArms(armCount))
    setMoveLane({})
    setPhaseStates([])
  }, [armCount])

  const handleExport = () =>
    exportTool({
      tool: 'lsa', filePrefix: 'LSA',
      name: nodeName, melden,
      data: { lsaSchema: 3, nodeName, armCount, arms, moveLane, fgsConfig, phaseStates, targetLos, manualZ, tzMode, ...(karte ? { karte } : {}), ...(schaetzung ? { schaetzung } : {}) },
    })

  const handleImport = () =>
    importTool('lsa', d => {
      const newCount = oneOf<3|4>([3, 4], d.armCount, 4)
      const leer = d.leereFelder === true
      const tempi: readonly DesignSpeed[] = [30, 50, 60]
      let loadedArms = conformFixed(defaultArms(newCount), d.arms).map(a => ({
        ...a,
        mix: a.mix ? conform<VehicleMix>({ pctLW:0, pctMR:0, pctFR:0 }, a.mix) : undefined,
        vDesign: leer ? wahl(tempi, a.vDesign) ?? undefined : oneOf(tempi, a.vDesign, 50),
      }))
      // Dateien vor lsaSchema 2: 4-Arm-Zeilen 4/6 (Arm B) und 10/12 (Arm D) waren mit
      // vertauschtem Links/Rechts beschriftet und gespeichert. Werte beim Zielarm belassen.
      const schema = typeof d.lsaSchema === 'number' ? d.lsaSchema : 1
      if (newCount === 4 && schema < 2)
        loadedArms = loadedArms.map((a, i) => i >= 2 ? { ...a, left: a.right, right: a.left } : a)
      // FS-Zuordnung: nur Werte 1/2; FGS je Arm gegen die Vorlage; Phasen mit Lane-ID-Listen
      const moveLane: Record<string,1|2> = {}
      for (const [k, v] of Object.entries(conform<Record<string, unknown>>({}, d.moveLane)))
        if (v === 1 || v === 2) moveLane[k] = v
      // Ältere Dateien nannten nur FS2, die übrigen Ströme lagen auf FS1
      if (!leer) for (let i = 0; i < newCount; i++) for (const s of armStreamIds(newCount, i)) moveLane[s] ??= 1
      const fgsConfig: Record<string, FGSArmConfig> = {}
      const fgsRaw = typeof d.fgsConfig === 'object' && d.fgsConfig !== null ? d.fgsConfig as Record<string, unknown> : {}
      for (const lbl of ['A','B','C','D'])
        if (fgsRaw[lbl] !== undefined) fgsConfig[lbl] = conform(leer ? DEFAULT_FGS : { ...DEFAULT_FGS, length: 6 }, fgsRaw[lbl])
      const phaseStates: PhaseState[] = (Array.isArray(d.phaseStates) ? d.phaseStates : [])
        .filter((ph): ph is Record<string, unknown> => typeof ph === 'object' && ph !== null)
        .map((ph, i) => ({
          id: conform(i + 1, ph.id),
          selectedLaneIds: (Array.isArray(ph.selectedLaneIds) ? ph.selectedLaneIds : [])
            .filter((id): id is string => typeof id === 'string'),
        }))
      if (newCount !== armCount) skipArmCountEffect.current = true
      setNodeName(typeof d.nodeName === 'string' ? d.nodeName : '')
      setKarte(kartenBezugLesen(d.karte))
      setMitKarte(false)
      setArmCount(newCount)
      setArmGewaehlt(true)
      setArms(loadedArms)
      setSchaetzung(schaetzungLesen(d.schaetzung, newCount))
      setMoveLane(moveLane)
      setFgsConfig(fgsConfig)
      setPhaseStates(phaseStates)
      const stufen: readonly LevelOfService[] = ['A','B','C','D','E','F']
      setTargetLos(leer ? wahl(stufen, d.targetLos) : oneOf(stufen, d.targetLos, 'D'))
      setManualZ(conform(0, d.manualZ))
      // Dateien ohne Angabe wurden nach Tempo gestaffelt gerechnet: Resultate bleiben, mit Hinweis
      const newMode = leer ? wahl<TzMode>(['norm', 'staffel'], d.tzMode) : tzModeFromFile(d.tzMode, loadedArms.map(a => a.vDesign))
      setTzMode(newMode)
      setLoadHint(d.tzMode === undefined && newMode === 'staffel'
        ? `Ältere Datei: Die Zwischenzeit bleibt wie gespeichert nach Tempo gestaffelt `
          + `(T_Z = ${tzFor('staffel', loadedArms.map(a => a.vDesign))} s, Annahme), damit die Resultate gleich bleiben. `
          + `Die Norm-Pauschale beträgt ${TZ_NORM} s je Phase (Ziffer 11.2, Seite 10); die Umschaltung liegt bei der Umlaufzeit.`
        : null)
    }, melden)

  function handleReset() {
    setNodeName('')
    setArms(defaultArms(armCount))
    setMoveLane({})
    setFgsConfig({})
    setPhaseStates([])
    setTargetLos(null)
    setManualZ(0)
    setTzMode(null)
    setLoadHint(null)
    setArmGewaehlt(false)
    setSchaetzung(null)
    setKarte(null)
    setMitKarte(false)
    melden('Zurückgesetzt')
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
      const willHaveFs2 = streams.some(s => newMoveLane[s] === 2)
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

  // Zwischenzeit: Norm-Pauschale oder Annahme (Staffelung, Maximum über alle Arme)
  // Marken «Karte» und «Modell» an den Feldern, nur solange die Armzahl noch die der Übernahme ist
  const herkunftU = uebernahme?.armCount === armCount ? uebernahme : undefined
  const laneAus = useMemo(() => herkunftU ? moveLaneAus(herkunftU) : {}, [herkunftU])
  const tZ = useMemo(() => (tzMode ? tzFor(tzMode, arms.map(a => a.vDesign)) : null), [tzMode, arms])

  const offen = armGewaehlt
    ? offenLsa({ armCount, arms, moveLane, fgs: fgsConfig, tzMode, targetLos, phasenplan: phases.some(p => p.laneIds.length > 0) })
    : ['Knotentyp']
  const fertig = offen.length === 0

  // Berechnung
  const result = useMemo<LSAResultV2|null>(() => {
    if (!fertig || tZ === null || targetLos === null || lanes.length===0 || phases.length===0) return null
    return calculateLSAV2({ armCount, volumes, lanes, phases, targetLos, manualZ: manualZ > 0 ? manualZ : undefined, tZ })
  }, [armCount, volumes, lanes, phases, targetLos, tZ, manualZ, fertig])

  return (
    <>
    <div style={{ maxWidth:1280, margin:'0 auto', padding:'16px 16px 40px' }}>
      <Meldung text={meldung} onClose={meldungZu} />
      {uebernahme && <UebernahmeHinweis u={uebernahme} rechner="lsa" />}
      <SoFunktionierts rechner="lsa" />
      {karte && <BelastungsVergleich vergleich={karte.vergleich} querschnitte={querschnitteKnoten(arms)} />}


      {/* ── Kopfzeile ─── */}
      <div className="kachel" style={{ padding:'10px 16px', marginBottom:16, display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
        <input type="text" value={nodeName} onChange={e => setNodeName(e.target.value)}
          placeholder="Bezeichnung des Knotens"
          style={{ flex:1, minWidth:200, padding:'5px 10px', borderRadius:5,
                   border:'1px solid var(--border)', fontSize:14, fontWeight:600, color:'var(--text-strong)' }} />
        <BerichtKnopf onClick={openBl} bereit={!!(result?.hasVehicleTraffic && targetLos && tzMode)} />
        <button onClick={handleExport}
          className="knopf zweit" style={{ whiteSpace:'nowrap' }}>
          Fall speichern
        </button>
        <button onClick={handleImport}
          className="knopf zweit" style={{ whiteSpace:'nowrap' }}>
          Fall laden
        </button>
        <button onClick={handleReset}
          className="knopf zweit" style={{ whiteSpace:'nowrap' }}>
          zurücksetzen
        </button>
      </div>

      {/* ── Schritt 1 ─── */}
      <div className="kachel" style={{ padding:'14px 16px', marginBottom:16 }}>
        <StepBadge n={1} label="Massgebende Verkehrsstärken je Knotenstrom bestimmen" />
        <p style={{ fontSize:12, color:'var(--text-muted)', margin:'0 0 12px' }}>
          Stündliche Spitzenstunden-Verkehrsstärken Q [Fz/h] je Knotenstrom eingeben und in PWE umrechnen (Ziffer 9, Seiten 7–8, VSS 40 023a). Schwerverkehr (LW, MR, FR) wird gemäss Ziffer 10.2, Seite 8 berücksichtigt.
        </p>
        <div style={{ display:'flex', gap:16, alignItems:'flex-start', marginBottom:14, flexWrap:'wrap' }}>
          <div style={{ flex:'1 1 auto' }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
              <span style={{ fontSize:14, fontWeight:600, color:'var(--text)' }}>Knotentyp:</span>
              {([3,4] as const).map(n => (
                <button key={n} onClick={()=>{ if (n !== armCount) setSchaetzung(null); setArmCount(n); setArmGewaehlt(true) }}
                  className={`knopf${armGewaehlt && armCount === n ? '' : ' zweit'}`}>
                  {n===3?'Einmündung (3-Arm)':'Kreuzung (4-Arm)'}
                </button>
              ))}
            </div>
            {!armGewaehlt && <OffeneAngaben liste={offen} />}
            {armGewaehlt && <ArmmengenSchaetzung key={armCount} labels={arms.map((_, i) => ['A', 'C', 'B', 'D'][i])} namen={arms.map(a => a.name)}
              kreisel={false} stand={schaetzung} onAnwenden={s => {
                setSchaetzung(s)
                setArms(prev => prev.map((a, i) => (i < s.stroeme.length ? { ...a, ...s.stroeme[i] } : a)))
              }} />}
            {armGewaehlt && <div className={`arms-grid${armCount===4?' arms-grid-4':''}`}>
              {arms.map((arm,i) => (
                <ArmCard key={i} arm={arm} index={i} armCount={armCount} tzMode={tzMode} herkunft={herkunftU?.arme[i]} schaetzung={schaetzung?.stroeme[i]}
                  onChange={a => setArms(prev=>prev.map((x,j)=>j===i?a:x))} />
              ))}
            </div>}
          </div>
          {armGewaehlt && <div style={{ flex:'0 0 auto', textAlign:'center' }}>
            <img
              src={armCount === 4 ? lsa4ArmSvg : lsa3ArmSvg}
              alt={armCount === 4 ? 'Knotengeometrie 4-Arm' : 'Knotengeometrie 3-Arm'}
              style={{
                width: 280,
                height: 'auto',
                objectFit:'contain',
                border:'1px solid var(--kachel-rand)', borderRadius:8,
                background:'#fff', padding:6,
              }}
            />
            <div style={{ fontSize:12, color:'var(--text-muted)', marginTop:4 }}>
              Arme A–{armCount===4?'D':'C'} · Ströme {armCount===4?'q1–q12':'q2–q8'} · fgs_A–{armCount===4?'D':'C'}
            </div>
          </div>}
        </div>
      </div>

      {armGewaehlt && <>
      {/* ── Schritt 2 ─── */}
      <div className="kachel" style={{ padding:'14px 16px', marginBottom:16 }}>
        <StepBadge n={2} label="Fahrstreifenplan — Knotenströme zuordnen" />
        <p style={{ fontSize:12, color:'var(--text-muted)', margin:'0 0 12px' }}>
          Anzahl Fahrstreifen festlegen und Knotenströme den Fahrstreifen zuordnen (Ziffer 9.3, Seite 8).
          Bewegungen auf FS1 oder FS2 aufteilen. FGS: Fussgängerstreifen mit Querungslänge aktivieren.
          Die Verkehrsstärke eines Fahrstreifens ist die Summe der zugeordneten Ströme (Ziffer 9.3, Seite 8); ein Mischfahrstreifen muss alle seine Ströme abwickeln.
        </p>
        <LanePlanSection armCount={armCount} volumes={volumes}
          moveLane={moveLane} onChange={handleMoveLaneChange}
          fgsConfig={fgsConfig} onFgsChange={handleFgsChange}
          uebernahme={herkunftU} laneAus={laneAus} />
      </div>

      {/* ── Schritt 3 + Ergebnisse ─── */}
      <div className="layout-grid">
        <div className="kachel" style={{ padding:'14px 16px' }}>
          <StepBadge n={3} label="Phasenplan — ΣQkrit und Umlaufzeit Z festlegen" />
          <p style={{ fontSize:12, color:'var(--text-muted)', margin:'0 0 8px' }}>
            Fahrstreifen den Phasen zuordnen (☑ = Grün in dieser Phase, Ziffer 11, Seite 9).
            Daraus werden ΣQkrit, Umlaufzeit Z und Leistungsfähigkeit L je Fahrstreifen berechnet.
            FGS-Lanes (grün) manuell zuweisen.
          </p>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10,
                        padding:'6px 10px', borderRadius:6, background:'#f8fafc',
                        border:'1px solid var(--kachel-rand)', fontSize:12 }}>
            <span style={{ color:'var(--text)', fontWeight:600 }}>Umlaufzeit Z:</span>
            <input type="number" min={30} max={200} step={1}
              value={manualZ || ''}
              placeholder="Auto (Tab. 2)"
              onChange={e => setManualZ(Math.max(0, Number(e.target.value) || 0))}
              style={{ width:90, padding:'3px 7px', borderRadius:4, fontSize:12,
                       border: manualZ > 0 ? '1.5px solid var(--accent)' : '1px solid var(--border)',
                       fontWeight: manualZ > 0 ? 700 : 400 }} />
            <span style={{ color:'var(--text-muted)' }}>s</span>
            {manualZ > 0 && (
              <button onClick={() => setManualZ(0)}
                className="knopf zweit klein">
                Auto
              </button>
            )}
            <span style={{ color: manualZ > 0 ? 'var(--accent)' : 'var(--text-muted)', marginLeft:4 }}>
              {manualZ > 0 ? 'Manuell — überschreibt Tab. 2' : 'Leer = automatisch aus Tab. 2 (kleinste passende Z)'}
            </span>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10, flexWrap:'wrap',
                        padding:'6px 10px', borderRadius:6, background:'#f8fafc',
                        border:'1px solid var(--kachel-rand)', fontSize:12 }}>
            <span style={{ color:'var(--text)', fontWeight:600 }}>Zwischenzeit:</span>
            {([
              ['norm', `${TZ_NORM} s je Phase (Norm-Pauschale, Ziffer 11.2, Seite 10)`],
              ['staffel', `Annahme: nach Tempo gestaffelt, 3/4/5 s (Norm-Pauschale ${TZ_NORM} s)`],
            ] as const).map(([mode, label]) => (
              <label key={mode} style={{ display:'flex', alignItems:'center', gap:4, cursor:'pointer', color:'var(--text)' }}>
                <input type="radio" name="lsa-tz-mode" checked={tzMode===mode}
                  onChange={() => { setTzMode(mode); setLoadHint(null) }}
                  style={{ accentColor:'#1e3a5f', cursor:'pointer' }} />
                {label}
              </label>
            ))}
            <span style={{ marginLeft:'auto', color:'var(--text)', whiteSpace:'nowrap' }}>
              T_Z = <strong>{tZ ?? '–'}</strong> s/Phase
            </span>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:10, flexWrap:'wrap',
                        padding:'6px 10px', borderRadius:6, background:'#f8fafc',
                        border:'1px solid var(--kachel-rand)', fontSize:12 }}>
            <span style={{ color:'var(--text)', fontWeight:600 }}>Ziel-VQS:</span>
            {(['A','B','C','D','E','F'] as LevelOfService[]).map(los => (
              <button key={los} onClick={() => setTargetLos(los)}
                style={{ padding:'2px 8px', borderRadius:5, fontSize:12, cursor:'pointer', fontWeight:700,
                         background: targetLos===los ? LOS_BG[los] : '#f3f4f6',
                         color: targetLos===los ? LOS_COLOR[los] : 'var(--text-muted)',
                         border: targetLos===los ? `1.5px solid ${LOS_COLOR[los]}` : '1.5px solid #e5e7eb' }}>
                {los}
              </button>
            ))}
          </div>
          {loadHint && (
            <div className="hinweis klein" style={{ marginBottom:10 }}>
              {loadHint}
            </div>
          )}
          <PhasePlanSection lanes={lanes} phaseStates={phaseStates}
            onChange={setPhaseStates} onApplyDefault={applyDefault}
            onSuggestMinimal={applyMinimalPlan}
            result={result} />
        </div>

        <div className="results-panel">
          {result?.hasVehicleTraffic && targetLos && tzMode
            ? <ResultsPanelV2 result={result} targetLos={targetLos} tzMode={tzMode}
                onTargetLos={setTargetLos} onManualZ={setManualZ}  />
            : <OffeneAngaben liste={offen.length > 0 ? offen : ['Verkehrsmengen']} />
          }
        </div>
      </div>
      </>}

      <HilfeUnten rechner="lsa" legende={LEGEND_ITEMS} quellen={karte?.quellen} />

      <RechnerFuss>
        Die Ergebnisse ersetzen keine Überprüfung durch eine Fachperson.
      </RechnerFuss>
    </div>

    {isActive && result?.hasVehicleTraffic && targetLos && tzMode && showBl && createPortal(
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
        tzMode={tzMode}
        manualZ={manualZ}
        onClose={closeBl}
        karte={karte}
        uebernahme={uebernahme}
        schaetzung={schaetzung}
      />,
      document.body
    )}
    </>
  )
}
