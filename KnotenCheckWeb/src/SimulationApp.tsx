import { useState, useCallback } from 'react'
import einmuendungSvg from './assets/einmuendung.svg'
import kreuzungSvg    from './assets/kreuzung.svg'
import {
  runStochasticSN640022, runStochasticSN640022Multi, GAP_PARAMS, GAP_PARAMS_SN640022,
  pedBlockingTime, V_FG, DEFAULT_FAHRBAHNBREITE, MITTELINSEL_GRENZE_M,
} from './engine/stochasticSN640022'
import type {
  StochasticConfig, StochasticSN640022Result, StochasticMultiResult,
  GapOverrides, PedestrianConfig, PedestrianLegConfig, SimInterval,
} from './engine/stochasticSN640022'
import {
  defaultIntersection, toSNVolumes, toSNRawVolumes, toSNLaneFlags,
} from './engine/armConfiguration'
import type { ArmConfiguration, IntersectionConfiguration } from './engine/armConfiguration'
import { exportTool, importTool } from './saveLoad'
import { useToast, Toast } from './Toast'
import { LegendBox, type LegendItem } from './LegendBox'
import { NumInput, Row, Ckbx, LOSBadge, ToggleBtn, ToolbarBtn } from './ui'
import { ArmCard, streamMovementName } from './ArmCard'
import { StochasticPanel, simLOS } from './StochasticPanel'

// ── Legende ───────────────────────────────────────────────────────────────────

const LEGEND_ITEMS: LegendItem[] = [
  { abbr: 'Fz/h',      desc: 'Fahrzeuge pro Stunde — Roheingabe' },
  { abbr: 'PWE/h',     desc: 'Personenwageneinheiten pro Stunde — umgerechnet mit f (Tab. 1/2, SN 640 022)' },
  { abbr: 'qpi', unit: 'Fz/h', desc: 'Massgebende Hauptstrombelastung — nach SN 640 022 F1–F8; bestimmt wie viele Konfliktereignisse pro Sekunde im Hauptstrom generiert werden' },
  { abbr: 'Rg',        desc: 'Rang — 1 = Hauptstrasse (kein Warten), 2 = HS-Linksabbieger / NS-Rechtseinbieger, 3 = NS-Kreuzen, 4 = NS-Linkseinbiegen' },
  { abbr: 't_c', unit: 's', desc: 'Grenzzeitlücke — Mindestzeitlücke im Hauptstrom, die ein Fahrer als ausreichend akzeptiert; je Manöver aus HBS 2015, Kap. S5, Tabelle S5-5 (Zeichen 205)' },
  { abbr: 't_f', unit: 's', desc: 'Folgezeitlücke — Mindestabstand zwischen zwei aufeinanderfolgenden Fahrzeugen, die in derselben Hauptstromlücke einfahren; aus HBS 2015, Kap. S5, Tabelle S5-5' },
  { abbr: 'w',   unit: 's', desc: 'Simulierte mittlere Wartezeit — Mittelwert aller Wartezeiten (Abfahrtszeit − Ankunftszeit) über alle Fahrzeuge und alle Simulationsläufe' },
  { abbr: '±σ',  unit: 's', desc: 'Standardabweichung der Wartezeiten — Mass für die Streuung; hohe σ bedeutet stark schwankende Wartezeiten zwischen einzelnen Fahrzeugen' },
  { abbr: 'P50', unit: 's', desc: 'Median — 50 % der Fahrzeuge warten kürzer als dieser Wert' },
  { abbr: 'P85', unit: 's', desc: '85. Perzentil — 85 % der Fahrzeuge warten kürzer; üblicher Planungswert für Dimensionierung' },
  { abbr: 'P95', unit: 's', desc: '95. Perzentil — 95 % der Fahrzeuge warten kürzer; Mass für die Spitzenbelastung' },
  { abbr: 'n',          desc: 'Stichprobengrösse — Anzahl aller simulierten Fahrzeuge über sämtliche Simulationsläufe' },
]

// ── Typen ─────────────────────────────────────────────────────────────────────

interface SimIntervalInput {
  id:    string
  label: string
  T:     15 | 30 | 45 | 60  // Minuten
  arms:  ArmConfiguration[]
}

function defaultInterval(armCount: 3 | 4, label: string): SimIntervalInput {
  return {
    id:    crypto.randomUUID(),
    label,
    T:     60,
    arms:  defaultIntersection(armCount).arms,
  }
}

// Intervalle tragen nur die Verkehrsmengen; Neigung, Fahrzeugmix und Geometrie
// (und damit die SN-Lane-Flags) stammen einheitlich aus den Basis-Armen. So sind
// die je Intervall erzeugten Volumen konsistent mit den verwendeten Flags.
function mergeIntervalArms(
  base: ArmConfiguration[], ivArms: ArmConfiguration[],
): ArmConfiguration[] {
  return base.map((b, i) => {
    const iv = ivArms[i]
    return iv
      ? { ...b, leftVolume: iv.leftVolume,
                straightVolume: iv.straightVolume,
                rightVolume: iv.rightVolume }
      : b
  })
}

// ── Fussgänger*innen-Felder (Footer in ArmCard) ───────────────────────────────

type PedArmKey = 'armA' | 'armC' | 'armB' | 'armD'

export function defaultLeg(): PedestrianLegConfig {
  return { enabled: false, fg: 0, rho: 1, mittelinsel: false }
}

function PedFooter({ leg, isHS, onChange }: {
  leg:      PedestrianLegConfig
  isHS:     boolean
  onChange: (l: PedestrianLegConfig) => void
}) {
  const bd = isHS ? '#bfdbfe' : '#fed7aa'
  const bg = isHS ? '#eff6ff' : '#fff7ed'
  return (
    <div style={{ borderTop: `1px solid ${bd}`, background: leg.enabled ? bg : '#fafafa' }}>
      {/* Toggle-Zeile */}
      <div style={{ padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <input type="checkbox" checked={leg.enabled}
          onChange={e => onChange({ ...leg, enabled: e.target.checked })}
          style={{ width: 14, height: 14, cursor: 'pointer', accentColor: '#15803d', flexShrink: 0 }} />
        <span style={{ fontSize: 12, fontWeight: 600,
                       color: leg.enabled ? '#15803d' : '#9ca3af' }}>
          Fussgängerstreifen
        </span>
        {!isHS && leg.enabled && (
          <span style={{ fontSize: 10, color: '#9ca3af', marginLeft: 'auto' }}>
            nur Direktsperre (kein Gap-Effekt)
          </span>
        )}
      </div>

      {/* Eingabefelder */}
      {leg.enabled && (() => {
        const breitMode = leg.fahrbahnbreite !== undefined
        const breite    = leg.fahrbahnbreite ?? DEFAULT_FAHRBAHNBREITE
        const tBlock    = pedBlockingTime(leg)
        const freq      = leg.rho > 0 ? leg.fg / leg.rho : leg.fg   // Sperrungen/h
        return (
        <>
          <Row label="Fussgänger*innen" sub="VSS 2011/308 · Fg/h am Fussgängerstreifen">
            <NumInput value={leg.fg} onChange={v => onChange({ ...leg, fg: v })} max={2000} live />
            <span style={{ fontSize: 11, color: '#9ca3af', width: 30 }}>Fg/h</span>
          </Row>
          <Row label="Gruppengrösse ρ" sub="steuert die Häufigkeit der Sperrungen (fg/ρ), nicht die Dauer">
            <select value={leg.rho}
              onChange={e => onChange({ ...leg, rho: Number(e.target.value) })}
              style={{ fontSize: 13, padding: '3px 6px', borderRadius: 4,
                       border: '1px solid #d1d5db', background: '#fff' }}>
              {[1, 2, 3, 4, 5].map(r => (
                <option key={r} value={r}>
                  {r} {r === 1 ? '(Einzeln)' : r === 2 ? '(Paar)' : r >= 4 ? '(Gruppe)' : ''}
                </option>
              ))}
            </select>
          </Row>
          <Row label="Eigene Fahrbahnbreite" sub={`aus = Standard ${DEFAULT_FAHRBAHNBREITE} m; bestimmt die Sperrdauer`}>
            <Ckbx checked={breitMode}
              onChange={v => onChange({ ...leg, fahrbahnbreite: v ? DEFAULT_FAHRBAHNBREITE : undefined })} />
          </Row>
          {breitMode && (
            <Row label="Fahrbahnbreite" sub={`Querung mit v_FG = ${V_FG.toFixed(2)} m/s (VSS 40 240)`}>
              <NumInput value={breite} onChange={v => onChange({ ...leg, fahrbahnbreite: v })} max={30} live />
              <span style={{ fontSize: 11, color: '#9ca3af', width: 30 }}>m</span>
            </Row>
          )}
          {breitMode && breite >= MITTELINSEL_GRENZE_M && (
            <div style={{ margin: '0 14px 8px', padding: '6px 9px', borderRadius: 5,
                          background: '#fef3c7', border: '1px solid #fde047',
                          fontSize: 10, color: '#854d0e', lineHeight: 1.5 }}>
              Ab {MITTELINSEL_GRENZE_M} m Fahrbahnbreite ist gemäss VSS 40 241 eine Mittelinsel erforderlich.
            </div>
          )}
          <Row label="Mittelinsel" sub="Art. 47 Abs. 3 VRV — Streifen baulich geteilt → halbe Breite">
            <Ckbx checked={leg.mittelinsel} onChange={v => onChange({ ...leg, mittelinsel: v })} />
          </Row>
          <div style={{ padding: '4px 14px 8px', fontSize: 10, color: '#6b7280' }}>
            Sperrzeit: {breite} m / {V_FG.toFixed(2)} m/s{leg.mittelinsel ? ' × 0.5 (Mittelinsel)' : ''} ={' '}
            <strong>{tBlock.toFixed(1)} s</strong> je Gruppe · ≈ <strong>{Math.round(freq)}</strong> Sperrungen/h
          </div>
        </>
        )
      })()}
    </div>
  )
}

// ── Gap-Konfiguration (tc/tf) ─────────────────────────────────────────────────

type GapKey = 'mainLeft' | 'sideRight' | 'sideCross' | 'sideLeft'
const GAP_LABELS: Record<GapKey, string> = {
  mainLeft:  'HS-Linksabbieger (Ström 1, 7)',
  sideRight: 'NS-Rechtseinbiegen (Ström 6, 12)',
  sideCross: 'NS-Kreuzen (Ström 5, 11)',
  sideLeft:  'NS-Linkseinbiegen (Ström 4, 10)',
}

function GapConfigSection({ overrides, onChange }: {
  overrides: GapOverrides
  onChange: (o: GapOverrides) => void
}) {
  const keys: GapKey[] = ['mainLeft', 'sideRight', 'sideCross', 'sideLeft']
  const preset: 'hbs' | 'sn' | 'custom' =
    keys.every(k => overrides[k] === undefined) ? 'hbs'
    : keys.every(k => overrides[k]?.tc === GAP_PARAMS_SN640022[k].tc
                   && overrides[k]?.tf === GAP_PARAMS_SN640022[k].tf) ? 'sn'
    : 'custom'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <ToggleBtn small active={preset === 'hbs'} onClick={() => onChange({})}>
          HBS 2015 (Standard)
        </ToggleBtn>
        <ToggleBtn small active={preset === 'sn'} onClick={() => onChange({
          mainLeft:  { ...GAP_PARAMS_SN640022.mainLeft },
          sideRight: { ...GAP_PARAMS_SN640022.sideRight },
          sideCross: { ...GAP_PARAMS_SN640022.sideCross },
          sideLeft:  { ...GAP_PARAMS_SN640022.sideLeft },
        })}>
          SN 640 022 (implizit)
        </ToggleBtn>
        {preset === 'custom' && (
          <span style={{ fontSize: 10, color: '#9ca3af' }}>benutzerdefiniert</span>
        )}
      </div>
      {preset === 'sn' && (
        <div style={{ fontSize: 10, color: '#9ca3af', lineHeight: 1.5 }}>
          Äquivalente Zeitlücken, rückgerechnet aus den Abb.-2-Kurven der SN 640 022
          (Siegloch-Fit, ±0.2–0.4 s). Ohne die CH-Erhöhung von +90 PWE/h —
          die Simulation rechnet mit diesem Preset konservativ.
        </div>
      )}
      {keys.map(k => {
        const def  = GAP_PARAMS[k]
        const ov   = overrides[k] ?? {}
        const tcV  = ov.tc ?? def.tc
        const tfV  = ov.tf ?? def.tf
        return (
          <div key={k}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#374151', marginBottom: 3 }}>
              {GAP_LABELS[k]}
              <span style={{ color: '#9ca3af', fontWeight: 400, marginLeft: 6 }}>
                (Default: tc={def.tc} s, tf={def.tf} s)
              </span>
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                <span style={{ color: '#374151', width: 22 }}>tc</span>
                <input type="number" step="0.1" min="1" max="12"
                  value={tcV}
                  onChange={e => onChange({ ...overrides, [k]: { ...ov, tc: Number(e.target.value) } })}
                  style={{ width: 60, padding: '2px 5px', borderRadius: 4,
                           border: '1px solid #d1d5db', fontSize: 12, textAlign: 'right' }} />
                <span style={{ color: '#9ca3af' }}>s</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                <span style={{ color: '#374151', width: 22 }}>tf</span>
                <input type="number" step="0.1" min="0.5" max="8"
                  value={tfV}
                  onChange={e => onChange({ ...overrides, [k]: { ...ov, tf: Number(e.target.value) } })}
                  style={{ width: 60, padding: '2px 5px', borderRadius: 4,
                           border: '1px solid #d1d5db', fontSize: 12, textAlign: 'right' }} />
                <span style={{ color: '#9ca3af' }}>s</span>
              </label>
              {(ov.tc !== undefined || ov.tf !== undefined) && (
                <button onClick={() => {
                  const n = { ...overrides }
                  delete n[k]
                  onChange(n)
                }} style={{ fontSize: 10, color: '#9ca3af', background: 'none',
                            border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
                  Reset
                </button>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Zeitintervalle-Section ────────────────────────────────────────────────────

function IntervalCard({ iv, baseArms, armCount, index, onUpdate, onRemove }: {
  iv: SimIntervalInput; baseArms: ArmConfiguration[]; armCount: 3 | 4; index: number
  onUpdate: (iv: SimIntervalInput) => void
  onRemove: () => void
}) {
  const [expanded, setExpanded] = useState(index === 0)
  // Anzeige mit Basis-Geometrie; nur die Verkehrsmengen sind je Intervall editierbar.
  const arms = mergeIntervalArms(baseArms, iv.arms)
  const setArm = (i: number, arm: ArmConfiguration) => {
    const next = [...arms]; next[i] = arm
    onUpdate({ ...iv, arms: next })
  }
  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden',
                  marginBottom: 8, background: '#fff' }}>
      <div style={{ background: '#f8fafc', padding: '8px 14px', display: 'flex',
                    alignItems: 'center', gap: 8, cursor: 'pointer' }}
           onClick={() => setExpanded(e => !e)}>
        <span style={{ fontSize: 12, color: '#9ca3af', width: 20 }}>{index + 1}.</span>
        <input type="text" value={iv.label}
          onClick={e => e.stopPropagation()}
          onChange={e => onUpdate({ ...iv, label: e.target.value })}
          placeholder="Zeitraum (z.B. 07:30–08:00)"
          style={{ flex: 1, padding: '2px 8px', borderRadius: 4,
                   border: '1px solid #d1d5db', fontSize: 12, color: '#374151' }} />
        <select value={iv.T} onClick={e => e.stopPropagation()}
          onChange={e => onUpdate({ ...iv, T: Number(e.target.value) as 15|30|45|60 })}
          style={{ fontSize: 12, padding: '2px 6px', borderRadius: 4,
                   border: '1px solid #d1d5db', background: '#fff' }}>
          {([15, 30, 45, 60] as const).map(t => (
            <option key={t} value={t}>{t} min</option>
          ))}
        </select>
        {index > 0 && (
          <button onClick={e => { e.stopPropagation(); onRemove() }}
            style={{ fontSize: 11, color: '#dc2626', background: 'none',
                     border: 'none', cursor: 'pointer' }}>✕</button>
        )}
        <span style={{ fontSize: 11, color: '#9ca3af' }}>{expanded ? '▲' : '▼'}</span>
      </div>
      {expanded && (
        <div style={{ padding: '8px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {arms.map((arm, i) => (
            <ArmCard key={arm.id} arm={arm} index={i} isHS={i < 2}
              armCount={armCount} geometryLocked hideMixedLane live
              opposingHSSeparateLane={i >= 2 ? (baseArms[i === 2 ? 0 : 1]?.hasSeparateTurnLane ?? false) : false}
              onChange={a => setArm(i, a)} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Multi-Intervall-Ergebnis ───────────────────────────────────────────────────

function MultiIntervalPanel({ result }: { result: StochasticMultiResult }) {
  const [activeTab, setActiveTab] = useState(0)
  const iv = result.intervals

  return (
    <div>
      {/* Tab-Leiste */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 12, flexWrap: 'wrap' }}>
        {iv.map((r, i) => (
          <ToggleBtn key={i} small active={activeTab === i} onClick={() => setActiveTab(i)}>
            {r.label}
          </ToggleBtn>
        ))}
      </div>

      {/* Ganglinie-Tabelle */}
      <div style={{ marginBottom: 16, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <thead>
            <tr style={{ background: '#1e3a5f', color: '#fff' }}>
              <th style={{ padding: '5px 8px', textAlign: 'left' }}>Intervall</th>
              <th style={{ padding: '5px 8px', textAlign: 'left' }}>Strom</th>
              <th style={{ padding: '5px 8px', textAlign: 'right' }}>Mittelw. [s]</th>
              <th style={{ padding: '5px 8px', textAlign: 'right' }}>P85 [s]</th>
              <th style={{ padding: '5px 8px', textAlign: 'center' }}>QS</th>
              <th style={{ padding: '5px 8px', textAlign: 'right' }}>Carry-over</th>
            </tr>
          </thead>
          <tbody>
            {iv.map((r, iIdx) =>
              r.result.streams.filter(s => s.stats !== null).map((s, sIdx) => (
                <tr key={`${iIdx}-${s.streamNumber}`}
                  style={{ background: sIdx % 2 === 0 ? '#f8fafc' : '#fff',
                           borderBottom: '1px solid #e5e7eb',
                           fontWeight: iIdx === activeTab ? 600 : 400 }}>
                  {sIdx === 0 && (
                    <td rowSpan={r.result.streams.filter(x => x.stats !== null).length}
                      style={{ padding: '4px 8px', verticalAlign: 'middle',
                               borderRight: '1px solid #e5e7eb', color: iIdx === activeTab ? '#1e3a5f' : '#6b7280',
                               fontWeight: iIdx === activeTab ? 700 : 400 }}>
                      {r.label}
                    </td>
                  )}
                  <td style={{ padding: '4px 8px', color: '#374151', whiteSpace: 'nowrap' }}>
                    {streamMovementName(s.streamNumber)}
                  </td>
                  <td style={{ padding: '4px 8px', textAlign: 'right' }}>
                    {s.stats ? Math.round(s.stats.mean) : '–'}
                  </td>
                  <td style={{ padding: '4px 8px', textAlign: 'right' }}>
                    {s.stats ? Math.round(s.stats.p85) : '–'}
                  </td>
                  <td style={{ padding: '4px 8px', textAlign: 'center' }}>
                    <LOSBadge los={simLOS(s.stats!.mean)} />
                  </td>
                  {sIdx === 0 && (
                    <td rowSpan={r.result.streams.filter(x => x.stats !== null).length}
                      style={{ padding: '4px 8px', textAlign: 'right', verticalAlign: 'middle',
                               color: r.carryOver > 0 ? '#ea580c' : '#6b7280' }}>
                      {r.carryOver > 0 ? `${r.carryOver} Fz` : '–'}
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Detail-Panel für aktives Tab */}
      <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280',
                    textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
        Detail: {iv[activeTab]?.label}
      </div>
      {iv[activeTab] && <StochasticPanel result={iv[activeTab].result} />}

      <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 8 }}>
        Carry-over: Fahrzeuge, die am Ende eines Intervalls noch warten und ins nächste übergehen.
        Gesamtlaufzeit: {Math.round(result.totalDurationMs)} ms
      </div>
    </div>
  )
}

// ── Hauptkomponente ───────────────────────────────────────────────────────────

export default function SimulationApp() {
  const [nodeName,    setNodeName]    = useState('Neue Simulation')
  const [armCount,    setArmCount]    = useState<3 | 4>(3)
  const [baseArms,    setBaseArms]    = useState<ArmConfiguration[]>(() => defaultIntersection(3).arms)
  const [pedestrians, setPedestrians] = useState<PedestrianConfig>({
    armA: { enabled: false, fg: 0, rho: 1, mittelinsel: false },
    armC: { enabled: false, fg: 0, rho: 1, mittelinsel: false },
  })
  const [gapOverrides,  setGapOverrides]  = useState<GapOverrides>({})
  const [useIntervals,  setUseIntervals]  = useState(false)
  const [intervals,     setIntervals]     = useState<SimIntervalInput[]>(() => [
    defaultInterval(3, 'Spitzenstunde'),
  ])
  const [simConfig,     setSimConfig]     = useState<StochasticConfig>({
    runs: 200, useCowan: true, erlangK: 2,
  })
  const [result,        setResult]        = useState<
    StochasticSN640022Result | StochasticMultiResult | null
  >(null)
  const [running,       setRunning]       = useState(false)
  const [showAdvanced,  setShowAdvanced]  = useState(false)
  const [showGapConfig, setShowGapConfig] = useState(false)
  const { msg: toastMsg, show: showToast } = useToast()

  // ── Arm-Count wechseln ────────────────────────────────────────────────────

  function handleArmCount(n: 3 | 4) {
    if (armCount === n) return
    setArmCount(n)
    setBaseArms(defaultIntersection(n).arms)
    setIntervals([defaultInterval(n, 'Spitzenstunde')])
    setResult(null)
  }

  // ── Arm-Update ────────────────────────────────────────────────────────────

  const setArm = useCallback((i: number, arm: ArmConfiguration) => {
    setBaseArms(prev => { const a = [...prev]; a[i] = arm; return a })
  }, [])

  // ── Simulation starten ────────────────────────────────────────────────────

  function handleRun() {
    setRunning(true)
    setTimeout(() => {
      try {
        const fullConfig: StochasticConfig = { ...simConfig, gapOverrides, pedestrians }

        if (useIntervals && intervals.length >= 1) {
          // Volumen je Intervall mit Basis-Geometrie kombinieren → konsistent mit den
          // aus baseArms abgeleiteten Lane-Flags.
          const ivs: SimInterval[] = intervals.map(iv => {
            const icfg: IntersectionConfiguration = {
              name: '', arms: mergeIntervalArms(baseArms, iv.arms),
            }
            return {
              label:      iv.label,
              volumes:    toSNVolumes(icfg)!,
              rawVolumes: toSNRawVolumes(icfg) ?? undefined,
              T:          iv.T * 60,
            }
          })
          const flags = toSNLaneFlags({ name: '', arms: baseArms })
          setResult(runStochasticSN640022Multi(ivs, flags, fullConfig))
        } else {
          const icfg: IntersectionConfiguration = { name: '', arms: baseArms }
          const volumes = toSNVolumes(icfg)
          const raw     = toSNRawVolumes(icfg)
          const flags   = toSNLaneFlags(icfg)
          if (volumes && raw) {
            setResult(runStochasticSN640022(volumes, flags, raw, fullConfig))
          }
        }
      } finally {
        setRunning(false)
      }
    }, 10)
  }

  // ── Save / Load ───────────────────────────────────────────────────────────

  interface SimSaveData {
    armCount: 3|4; baseArms: ArmConfiguration[]; pedestrians: PedestrianConfig
    gapOverrides: GapOverrides; useIntervals: boolean
    intervals: SimIntervalInput[]; simConfig: StochasticConfig
  }

  const handleExport = () =>
    exportTool({
      tool: 'simulation', filePrefix: 'Simulation',
      name: nodeName, fallbackName: 'simulation', showToast,
      data: { armCount, baseArms, pedestrians, gapOverrides, useIntervals, intervals, simConfig },
    })

  const handleImport = () =>
    importTool<SimSaveData>('simulation', (d, name) => {
      setNodeName(name || 'Simulation')
      setArmCount(d.armCount)
      setBaseArms(d.baseArms)
      setPedestrians(d.pedestrians)
      setGapOverrides(d.gapOverrides)
      setUseIntervals(d.useIntervals)
      setIntervals(d.intervals)
      setSimConfig(d.simConfig)
      setResult(null)
    }, showToast)

  // ── Intervalle verwalten ──────────────────────────────────────────────────

  function addInterval() {
    setIntervals(prev => [
      ...prev,
      defaultInterval(armCount, `Intervall ${prev.length + 1}`),
    ])
  }

  function updateInterval(id: string, iv: SimIntervalInput) {
    setIntervals(prev => prev.map(x => x.id === id ? iv : x))
  }

  function removeInterval(id: string) {
    setIntervals(prev => prev.filter(x => x.id !== id))
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const isMultiResult = result !== null && 'intervals' in result

  return (
    <main style={{ maxWidth: 1200, margin: '0 auto', padding: '20px 16px',
                   fontFamily: 'system-ui, sans-serif' }}>
      <Toast msg={toastMsg} />


      {/* ── Header ── */}
      <div style={{ background: '#fff', borderRadius: 10, padding: '12px 20px',
                    marginBottom: 16, boxShadow: '0 1px 3px #0001',
                    display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <input type="text" value={nodeName} onChange={e => setNodeName(e.target.value)}
          placeholder="Bezeichnung der Simulation"
          style={{ flexBasis: '100%', padding: '5px 10px', borderRadius: 5,
                   border: '1px solid #d1d5db', fontSize: 14, fontWeight: 600, color: '#1e293b' }} />

        <span style={{ fontWeight: 600, fontSize: 14, color: '#374151' }}>Knotentyp</span>
        {([3, 4] as const).map(n => (
          <ToggleBtn key={n} active={armCount === n} onClick={() => handleArmCount(n)}>
            {n === 3 ? 'T-Knoten (3 Arme)' : 'Kreuzung (4 Arme)'}
          </ToggleBtn>
        ))}

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
          <ToolbarBtn onClick={handleExport}>Speichern</ToolbarBtn>
          <ToolbarBtn onClick={handleImport}>Laden</ToolbarBtn>
        </div>
      </div>

      {/* ── Layout: Input | Ergebnisse ── */}
      <div className="layout-grid">

        {/* ─── Input-Panel ─── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Arm-Cards mit FG-Eingabe als Footer */}
          <div style={{ fontSize: 12, fontWeight: 600, color: '#6b7280',
                        textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
            {useIntervals ? 'Basis-Geometrie (Geometrie-Flags)' : 'Verkehrsbelastung'}
          </div>
          {baseArms.map((arm, i) => {
            const pedKey: PedArmKey = i === 0 ? 'armA' : i === 1 ? 'armC' : i === 2 ? 'armB' : 'armD'
            const leg = pedestrians[pedKey] ?? defaultLeg()
            return (
              <ArmCard key={arm.id} arm={arm} index={i} isHS={i < 2}
                armCount={armCount} hideMixedLane live
                opposingHSSeparateLane={i >= 2 ? (baseArms[i === 2 ? 0 : 1]?.hasSeparateTurnLane ?? false) : false}
                onChange={a => setArm(i, a)}
                footer={
                  <PedFooter leg={leg} isHS={i < 2}
                    onChange={l => setPedestrians(prev => ({ ...prev, [pedKey]: l }))} />
                } />
            )
          })}

          {/* Zeitintervalle-Toggle */}
          <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden',
                        background: '#fff' }}>
            <div style={{ background: '#f8fafc', padding: '8px 14px',
                          display: 'flex', alignItems: 'center', gap: 10 }}>
              <Ckbx checked={useIntervals} onChange={v => {
                setUseIntervals(v)
                if (v && intervals.length < 2) {
                  // Erstes Intervall mit den bereits erfassten Basis-Volumen seeden,
                  // damit die Eingaben beim Umschalten nicht verloren gehen.
                  setIntervals(prev => [
                    { ...prev[0], arms: baseArms.map(a => ({ ...a })) },
                    defaultInterval(armCount, 'Spitzenstunde'),
                  ])
                }
              }} />
              <div>
                <span style={{ fontWeight: 700, fontSize: 14, color: '#1e293b' }}>
                  Mehrere Zeitintervalle
                </span>
                <span style={{ fontSize: 11, color: '#6b7280', marginLeft: 8 }}>
                  Mit Carry-over-Queue zwischen Intervallen
                </span>
              </div>
            </div>
            {useIntervals && (
              <div style={{ padding: '10px 12px' }}>
                {intervals.map((iv, i) => (
                  <IntervalCard key={iv.id} iv={iv} baseArms={baseArms} armCount={armCount} index={i}
                    onUpdate={updated => updateInterval(iv.id, updated)}
                    onRemove={() => removeInterval(iv.id)} />
                ))}
                {intervals.length < 6 && (
                  <button onClick={addInterval}
                    style={{ width: '100%', padding: '6px', borderRadius: 6, fontSize: 12,
                             cursor: 'pointer', border: '1px dashed #d1d5db',
                             background: '#f9fafb', color: '#6b7280' }}>
                    + Zeitintervall hinzufügen
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Erweiterte Sim-Parameter */}
          <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden',
                        background: '#fff' }}>
            <button onClick={() => setShowAdvanced(a => !a)}
              style={{ width: '100%', padding: '8px 14px', background: '#f8fafc',
                       border: 'none', cursor: 'pointer', textAlign: 'left',
                       display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontWeight: 700, fontSize: 13, color: '#374151' }}>
                Erweiterte Einstellungen
              </span>
              <span style={{ fontSize: 11, color: '#9ca3af' }}>
                {showAdvanced ? '▲' : '▼'}
              </span>
            </button>
            {showAdvanced && (
              <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>

                {/* Simulationsläufe */}
                <div>
                  <div style={{ fontWeight: 600, color: '#374151', fontSize: 12, marginBottom: 4 }}>
                    Anzahl Simulationsläufe
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {([50, 100, 200, 500] as const).map(n => (
                      <ToggleBtn key={n} small active={simConfig.runs === n}
                        onClick={() => setSimConfig(c => ({ ...c, runs: n }))}>
                        {n}
                      </ToggleBtn>
                    ))}
                  </div>
                </div>

                {/* Zeitlücken-Modell */}
                <div>
                  <div style={{ fontWeight: 600, color: '#374151', fontSize: 12, marginBottom: 4 }}>
                    Zeitlückenverteilung Hauptstrom
                  </div>
                  {[
                    { val: true,  label: 'Cowan M3',    desc: 'Kolonnenbildung (realistischer bei qpi > 600 Fz/h)' },
                    { val: false, label: 'Exponential', desc: 'Einfachstes Modell, identisch mit SN 640 022-Annahme' },
                  ].map(o => (
                    <label key={String(o.val)}
                      style={{ display: 'flex', alignItems: 'flex-start', gap: 8,
                               cursor: 'pointer', marginBottom: 3 }}>
                      <input type="radio" checked={(simConfig.useCowan ?? true) === o.val}
                        onChange={() => setSimConfig(c => ({ ...c, useCowan: o.val }))}
                        style={{ marginTop: 2, flexShrink: 0 }} />
                      <span style={{ fontSize: 12 }}>
                        <strong>{o.label}</strong>
                        <span style={{ color: '#9ca3af', marginLeft: 6 }}>{o.desc}</span>
                      </span>
                    </label>
                  ))}
                </div>

                {/* Erlang k */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 12, color: '#374151', fontWeight: 600 }}>
                    Erlang-Ordnung k (tc)
                  </span>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {([1, 2, 3] as const).map(k => (
                      <ToggleBtn key={k} small active={(simConfig.erlangK ?? 2) === k}
                        onClick={() => setSimConfig(c => ({ ...c, erlangK: k }))}>
                        {k === 1 ? 'k=1 (deterministisch)' : `k=${k}`}
                      </ToggleBtn>
                    ))}
                  </div>
                </div>

                {/* Stauraum */}
                <div>
                  <div style={{ fontWeight: 600, color: '#374151', fontSize: 12, marginBottom: 4 }}>
                    Stauraum Nebenstrasse
                    <span style={{ fontWeight: 400, color: '#9ca3af', marginLeft: 6 }}>leer = unbegrenzt</span>
                  </div>
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    {(['B', 'D'] as const).slice(0, armCount === 3 ? 1 : 2).map(arm => (
                      <label key={arm} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ color: '#374151', fontSize: 12 }}>Arm {arm}</span>
                        <input type="number" min={1} max={99}
                          value={
                            (arm === 'B' ? simConfig.storageB : simConfig.storageD) === undefined ||
                            !isFinite((arm === 'B' ? simConfig.storageB : simConfig.storageD) ?? Infinity)
                              ? '' : (arm === 'B' ? simConfig.storageB : simConfig.storageD)
                          }
                          placeholder="∞"
                          onChange={e => {
                            const v = e.target.value === '' ? Infinity : Number(e.target.value)
                            setSimConfig(c => arm === 'B' ? { ...c, storageB: v } : { ...c, storageD: v })
                          }}
                          style={{ width: 56, padding: '3px 6px', borderRadius: 4,
                                   border: '1px solid #d1d5db', fontSize: 12, textAlign: 'right' }} />
                        <span style={{ color: '#9ca3af', fontSize: 12 }}>Fz</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* tc/tf Override */}
                <div>
                  <button onClick={() => setShowGapConfig(g => !g)}
                    style={{ fontSize: 11, color: '#6b7280', background: 'none',
                             border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}>
                    {showGapConfig ? '▲ Grenz-/Folgezeitlücken ausblenden' : '▼ Grenz-/Folgezeitlücken (tc/tf) anpassen'}
                  </button>
                  {showGapConfig && (
                    <div style={{ marginTop: 8, padding: '10px 12px', borderRadius: 6,
                                  background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                      <GapConfigSection overrides={gapOverrides} onChange={setGapOverrides} />
                      {Object.keys(gapOverrides).length > 0 && (
                        <button onClick={() => setGapOverrides({})}
                          style={{ marginTop: 8, fontSize: 11, color: '#dc2626',
                                   background: 'none', border: 'none', cursor: 'pointer',
                                   textDecoration: 'underline' }}>
                          Alle tc/tf zurücksetzen
                        </button>
                      )}
                    </div>
                  )}
                </div>

              </div>
            )}
          </div>
        </div>

        {/* ─── Ergebnis-Panel ─── */}
        <div>
          {/* Run-Button */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <button onClick={handleRun} disabled={running}
              style={{ flex: 1, padding: '10px 0', borderRadius: 8, fontSize: 14,
                       cursor: running ? 'wait' : 'pointer',
                       border: '1px solid #1e3a5f',
                       background: running ? '#e5e7eb' : '#1e3a5f',
                       color: running ? '#9ca3af' : '#fff', fontWeight: 700 }}>
              {running ? 'Simulation läuft…' : result ? 'Neu starten' : 'Simulation starten'}
            </button>
            {result && (
              <span style={{ fontSize: 11, color: '#6b7280' }}>
                {isMultiResult
                  ? `${(result as StochasticMultiResult).intervals.length} Intervalle · ${Math.round((result as StochasticMultiResult).totalDurationMs)} ms`
                  : `${(result as StochasticSN640022Result).runs} Läufe · ${Math.round((result as StochasticSN640022Result).durationMs)} ms`
                }
              </span>
            )}
          </div>

          {/* Leer-Zustand */}
          {!result && !running && (
            <div style={{ padding: '16px', borderRadius: 10, background: '#f8fafc',
                          border: '1px solid #e2e8f0', textAlign: 'center', color: '#64748b',
                          fontSize: 13 }}>
              <img
                src={armCount === 3 ? einmuendungSvg : kreuzungSvg}
                alt={armCount === 3 ? 'T-Knoten Schema' : 'Kreuzung Schema'}
                style={{ width: '100%', maxHeight: 220, objectFit: 'contain',
                         marginBottom: 12, display: 'block' }}
              />
              Simulation starten um Wartezeit-Verteilungen, Histogramme und Percentile (P50/P85/P95)
              je Verkehrsstrom zu berechnen.
              {pedestrians.armA.enabled || pedestrians.armC.enabled ? (
                <div style={{ marginTop: 8, fontSize: 11, color: '#15803d' }}>
                  Fussgänger*innen aktiv — Blocking-Events werden simuliert.
                </div>
              ) : null}
              {Object.keys(gapOverrides).length > 0 ? (
                <div style={{ marginTop: 4, fontSize: 11, color: '#b45309' }}>
                  Benutzerdefinierte tc/tf-Werte aktiv.
                </div>
              ) : null}
            </div>
          )}

          {/* Konfiguration-Zusammenfassung (immer sichtbar wenn nicht leer) */}
          {result && (
            <div style={{ padding: '8px 12px', borderRadius: 6, background: '#f0f9ff',
                          border: '1px solid #bae6fd', fontSize: 11, color: '#0369a1',
                          marginBottom: 12, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <span>
                Modell: {(simConfig.useCowan ?? true) ? 'Cowan M3' : 'Exponential'}
              </span>
              <span>·</span>
              <span>Erlang k={simConfig.erlangK ?? 2}</span>
              {(pedestrians.armA.enabled || pedestrians.armC.enabled) && (
                <><span>·</span><span style={{ color: '#15803d' }}>Fussgänger*innen aktiv</span></>
              )}
              {Object.keys(gapOverrides).length > 0 && (
                <><span>·</span><span style={{ color: '#b45309' }}>tc/tf angepasst</span></>
              )}
              {isMultiResult && (
                <><span>·</span><span>{(result as StochasticMultiResult).intervals.length} Intervalle</span></>
              )}
            </div>
          )}

          {/* Ergebnis-Anzeige */}
          {result && !isMultiResult && (
            <StochasticPanel result={result as StochasticSN640022Result} />
          )}
          {result && isMultiResult && (
            <MultiIntervalPanel result={result as StochasticMultiResult} />
          )}
        </div>
      </div>

      <LegendBox items={LEGEND_ITEMS} />

      <footer style={{ fontSize: 11, color: '#9ca3af', textAlign: 'center', marginTop: 24, lineHeight: 2 }}>
        <div>
          Stochastische Simulation auf Basis der SN 640 022 (Strom-Topologie, Konfliktvolumen)
          mit Grenz-/Folgezeitlücken nach HBS 2015. Die Ergebnisse ersetzen keine Überprüfung
          durch eine Fachperson.
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
  )
}
