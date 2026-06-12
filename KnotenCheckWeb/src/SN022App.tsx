// Rechner Einmündung & Kreuzung nach SN 640 022 (vorfahrtgeregelt)

import { useState, useMemo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Berechnungsblatt } from './Berechnungsblatt'
import einmuendungSvg from './assets/einmuendung.svg'
import kreuzungSvg    from './assets/kreuzung.svg'
import { analyzeSN640022 } from './engine/sn640022Calculator'
import {
  defaultIntersection, toSNVolumes, toSNRawVolumes, toSNLaneFlags,
} from './engine/armConfiguration'
import type { IntersectionConfiguration, ArmConfiguration } from './engine/armConfiguration'
import type { SN640022Result, SN640022StreamResult, SN640022MixedResult } from './engine/types'
import { exportTool, importTool } from './saveLoad'
import { LegendBox, type LegendItem } from './LegendBox'
import { useToast, Toast } from './Toast'
import {
  LOS_COLOR, LOS_BG, LOSBadge, UtilBar, delayText, utilizationColor,
  ToggleBtn, ToolbarBtn,
} from './ui'
import { ArmCard, streamMovementName } from './ArmCard'

// ── Ergebnis-Karten ───────────────────────────────────────────────────────────

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

// ── Legende ───────────────────────────────────────────────────────────────────

const LEGEND_ITEMS: LegendItem[] = [
  { abbr: 'Fz/h',      desc: 'Fahrzeuge pro Stunde — Roheingabe' },
  { abbr: 'PWE/h',     desc: 'Personenwageneinheiten/h — umgerechnet mit PW=1, LW=2, MR=0.5, FR=0.25' },
  { abbr: 'S',         desc: 'Strom-Nummer nach SN 640 022 (q1–q12)' },
  { abbr: 'Bewegung',  desc: 'Bewegungsrichtung, z.B. A→C = Geradeaus von Arm A nach Arm C' },
  { abbr: 'Rg',        desc: 'Rang — 1=Hauptstrasse (Vortritt), 2=HS-Linksabbieger oder NS, 3=NS mit vorgelagertem Rang-2-Konflikt, 4=NS-Linkseinbieger mit Rang-3-Konflikt (Ziffer 6, SN 640 022)' },
  { abbr: 'qpi',  unit: 'Fz/h',  desc: 'Massgebende Hauptstrombelastung — ermittelt nach Ziffer 7 (SN 640 022, S. 3) aus den vorfahrtsberechtigten Begleitströmen je Fahrtbeziehung; x-Achse von Abb. 2' },
  { abbr: 'G',    unit: 'PWE/h', desc: 'Grundleistungsfähigkeit — abgelesen aus Abb. 2 «Grundleistungsfähigkeiten der verschiedenen Fahrbeziehungen» (SN 640 022, S. 5) bei gegebenem qpi; vier Kurven je Manöver: Linksabbiegen HS · Rechtseinbiegen NS · Kreuzen NS · Linkseinbiegen NS' },
  { abbr: 'L',    unit: 'PWE/h', desc: 'Leistungsfähigkeit — für Rang-2-Ströme L = G; für Rang-3/4-Ströme L = p₀ · G, wobei p₀ die Wahrscheinlichkeit des staufreien Zustands des übergeordneten Stroms ist' },
  { abbr: 'p₀',        desc: 'Wahrscheinlichkeit staufreier Zustand — p₀ = 1 − a_i des übergeordneten Stroms; reduziert G bei Rang-3/4-Strömen zu L = p₀ · G [F12, F13, SN 640 022]' },
  { abbr: 'Lm',   unit: 'PWE/h', desc: 'Leistungsfähigkeit Mischstreifen — Kapazität eines gemeinsamen Fahrstreifens für mehrere NS-Ströme auf der Nebenstrasse (Ziffer 11, SN 640 022)' },
  { abbr: 'R',    unit: 'PWE/h', desc: 'Reserve = L − Q; negativ = Überlast' },
  { abbr: 'a',         desc: 'Auslastungsgrad = Q / L (dimensionslos)' },
  { abbr: 'w',    unit: 's',     desc: 'Mittlere Wartezeit — nach Kimber-Hollis (SN 640 022)' },
  { abbr: 'QS',        desc: 'Qualitätsstufe A–F nach Tab. 3 (SN 640 022): A <10s · B 10–15s · C 15–25s · D 25–45s · E >45s · F Überlast' },
]

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

// ── Hauptkomponente ───────────────────────────────────────────────────────────

export default function SN022App() {
  const [cfg, setCfg] = useState<IntersectionConfiguration>(defaultIntersection(3))
  const [showBl, setShowBl] = useState(false)
  const openBl  = useCallback(() => setShowBl(true),  [])
  const closeBl = useCallback(() => setShowBl(false), [])
  const { msg: toastMsg, show: showToast } = useToast()

  const handleExport = () =>
    exportTool({ tool: 'sn022', filePrefix: 'SN022', name: cfg.name, data: cfg, showToast })

  const handleImport = () =>
    importTool<IntersectionConfiguration>('sn022', data => setCfg(data), showToast)

  function handleReset() {
    setCfg(prev => ({
      ...prev,
      name: '',
      arms: prev.arms.map(arm => ({
        ...arm,
        streetName: '',
        leftVolume: 0, straightVolume: 0, rightVolume: 0,
        vehicleMix: undefined, rightLaneVolume: undefined,
      })),
    }))
    showToast('Zurückgesetzt')
  }

  const result = useMemo(() => {
    const v   = toSNVolumes(cfg)
    const raw = toSNRawVolumes(cfg)
    if (!v || !raw) return null
    return analyzeSN640022(v, toSNLaneFlags(cfg), raw)
  }, [cfg])

  const setArm = (i: number, arm: ArmConfiguration) =>
    setCfg(prev => { const arms = [...prev.arms]; arms[i] = arm; return { ...prev, arms } })

  const setArmCount = (n: 3 | 4) =>
    setCfg(prev => prev.arms.length === n ? prev : defaultIntersection(n))

  return (
    <>
    <main style={{ maxWidth: 1100, margin: '0 auto', padding: '20px 16px' }}>

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
          <ToggleBtn key={n} active={cfg.arms.length === n} onClick={() => setArmCount(n)}>
            {n === 3 ? 'T-Knoten (3 Arme)' : 'Kreuzung (4 Arme)'}
          </ToggleBtn>
        ))}
        <span style={{ fontSize: 12, color: '#9ca3af' }}>
          A, C = Hauptstrasse · B{cfg.arms.length === 4 ? ', D' : ''} = Nebenstrasse
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
          <ToolbarBtn onClick={handleExport}>Speichern</ToolbarBtn>
          <ToolbarBtn onClick={handleImport}>Laden</ToolbarBtn>
          <button onClick={handleReset}
            style={{ padding: '4px 8px', fontSize: 11, cursor: 'pointer',
                     background: 'none', border: 'none', color: '#9ca3af',
                     textDecoration: 'underline' }}>
            Zurücksetzen
          </button>
        </div>
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
            <img
              src={cfg.arms.length === 3 ? einmuendungSvg : kreuzungSvg}
              alt={cfg.arms.length === 3 ? 'T-Knoten Schema' : 'Kreuzung Schema'}
              style={{ width: '100%', height: 'auto', display: 'block',
                       maxHeight: 280, objectFit: 'contain' }}
            />
          </div>

          {result
            ? <ResultsPanel result={result} onShowBerechnungsblatt={openBl} />
            : <p style={{ color: '#9ca3af', textAlign: 'center', padding: 32 }}>
                Bitte Verkehrsmengen eingeben.
              </p>
          }

        </div>
      </div>

      <LegendBox items={LEGEND_ITEMS} />

      <footer style={{ fontSize: 11, color: '#9ca3af', textAlign: 'center', marginTop: 24, lineHeight: 2 }}>
        <div>
          Berechnung nach SN 640 022. Leistungsfähigkeit, Verkehrsqualität, Belastbarkeit.
          Knoten ohne Lichtsignalanlage (VSS, Mai 1999).
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
    {result && showBl && createPortal(
      <Berechnungsblatt cfg={cfg} result={result} onClose={closeBl} />,
      document.body
    )}
    <Toast msg={toastMsg} />
    </>
  )
}
