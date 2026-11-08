// Rechner Einmündung & Kreuzung nach SN 640 022 (vorfahrtgeregelt)

import { useState, useMemo, useCallback } from 'react'
import UebernahmeHinweis from './karte/UebernahmeHinweis'
import BelastungsVergleich from './karte/BelastungsVergleich'
import { querschnitteKnoten } from './karte/vergleich'
import { intersectionAus, kartenBezugAus, kartenBezugLesen, type KnotenUebernahme } from './karte/rechner'
import { createPortal } from 'react-dom'
import { Berechnungsblatt } from './Berechnungsblatt'
import { KnotenDiagramm } from './KnotenDiagramm'
import { analyzeSN640022 } from './engine/sn640022Calculator'
import {
  defaultIntersection, toSNVolumes, toSNRawVolumes, toSNLaneFlags,
  conformIntersection, offeneArmAngaben,
} from './engine/armConfiguration'
import type { IntersectionConfiguration, ArmConfiguration } from './engine/armConfiguration'
import type { SN640022Result, SN640022StreamResult, SN640022MixedResult } from './engine/types'
import { exportTool, importTool } from './saveLoad'
import { useIsActiveModule } from './activeModule'
import { HilfeUnten, SoFunktionierts, type LegendItem } from './Hilfe'
import { Meldung } from './Meldung'
import { LOS_BG, LOS_COLOR, delayText, streamMovementName, utilizationColor } from './uiHelpers'
import { useMeldung } from './useMeldung'
import { LOSBadge, OffeneAngaben, UtilBar, ToggleBtn, ToolbarBtn, BerichtKnopf } from './ui'
import { ArmCard } from './ArmCard'
import { RechnerFuss } from './Fusszeile'

// ── Ergebnis-Karten ───────────────────────────────────────────────────────────

function MixedCard({ m }: { m: SN640022MixedResult }) {
  const empty = m.volumeFzh <= 0   // ohne Verkehr keine Beurteilung
  const col = utilizationColor(m.utilizationDegree)
  const pct = Math.min(999, Math.round(m.utilizationDegree * 100))
  const mvs = m.streamNumbers.map(streamMovementName).join(' · ')
  return (
    <div style={{ padding: '12px 14px', background: '#fff', borderRadius: 8,
                  border: '1px solid var(--kachel-rand)', marginBottom: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
        <div>
          <span style={{ fontWeight: 700, fontSize: 14 }}>{m.name}</span>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 8 }}>{mvs}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: col }}>{pct} %</span>
          {empty ? <NoTraffic /> : <LOSBadge los={m.levelOfService} />}
        </div>
      </div>
      <UtilBar value={m.utilizationDegree} />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-muted)' }}>
        <div>
          <span style={{ color: 'var(--text-muted)' }}>Lm </span>
          <strong>{Math.round(m.capacity)} PWE/h</strong>
        </div>
        <div>
          <span style={{ color: 'var(--text-muted)' }}>Reserve </span>
          <strong style={{ color: m.reserve < 0 ? '#dc2626' : '#16a34a' }}>{Math.round(m.reserve)}</strong>
        </div>
        <div>
          <span style={{ color: 'var(--text-muted)' }}>Wartezeit </span>
          <strong>{empty ? '–' : delayText(m.delay)}</strong>
        </div>
      </div>
    </div>
  )
}

// Ströme ohne Verkehr haben keine Wartezeit und keine Qualitätsstufe (Ziff. 17, S. 9)
function NoTraffic() {
  return <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>kein Verkehr</span>
}

function StreamRow({ s }: { s: SN640022StreamResult }) {
  const empty = s.volumePWE <= 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '8px 14px', borderBottom: '1px solid var(--kachel-rand)' }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 500 }}>{streamMovementName(s.streamNumber)}</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {s.name} · L = {Math.round(s.capacity)} PWE/h{empty ? '' : ` · ${delayText(s.delay)}`}
        </div>
      </div>
      {empty ? <NoTraffic /> : <LOSBadge los={s.levelOfService} />}
    </div>
  )
}

// ── Legende ───────────────────────────────────────────────────────────────────

const LEGEND_ITEMS: LegendItem[] = [
  { abbr: 'Fz/h',      desc: 'Fahrzeuge pro Stunde — Roheingabe' },
  { abbr: 'PWE/h',     desc: 'Personenwageneinheiten/h — umgerechnet nach Neigung und Fahrzeugart (Ziff. 8, S. 4); in der Ebene PW = 1, LW = 1.5, LZ = 2, MR = 0.5, FR = 0.25' },
  { abbr: 'S',         desc: 'Strom-Nummer nach SN 640 022 (q1–q12)' },
  { abbr: 'Bewegung',  desc: 'Bewegungsrichtung, z.B. A→C = Geradeaus von Arm A nach Arm C' },
  { abbr: 'Rg',        desc: 'Rang — 1=Hauptstrasse (Vortritt), 2=HS-Linksabbieger oder NS, 3=NS mit vorgelagertem Rang-2-Konflikt, 4=NS-Linkseinbieger mit Rang-3-Konflikt (Ziffer 6, SN 640 022)' },
  { abbr: 'qpi',  unit: 'Fz/h',  desc: 'Massgebende Hauptstrombelastung — ermittelt nach Ziffer 7 (SN 640 022, S. 3) aus den vorfahrtsberechtigten Begleitströmen je Fahrtbeziehung; x-Achse von Abb. 2' },
  { abbr: 'G',    unit: 'PWE/h', desc: 'Grundleistungsfähigkeit — abgelesen aus Abb. 2 «Grundleistungsfähigkeiten der verschiedenen Fahrbeziehungen» (SN 640 022, S. 5) bei gegebenem qpi; vier Kurven je Manöver: Linksabbiegen HS · Rechtseinbiegen NS · Kreuzen NS · Linkseinbiegen NS' },
  { abbr: 'L',    unit: 'PWE/h', desc: 'Leistungsfähigkeit — für Rang-2-Ströme L = G; für Rang-3/4-Ströme L = p₀ · G, wobei p₀ die Wahrscheinlichkeit des staufreien Zustands des übergeordneten Stroms ist' },
  { abbr: 'p₀',        desc: 'Wahrscheinlichkeit staufreier Zustand — p₀ = 1 − a_i des übergeordneten Stroms; reduziert G bei Rang-3/4-Strömen zu L = p₀ · G (Ziff. 11, S. 6, SN 640 022)' },
  { abbr: 'Lm',   unit: 'PWE/h', desc: 'Leistungsfähigkeit Mischstreifen — Kapazität eines gemeinsamen Fahrstreifens für mehrere NS-Ströme auf der Nebenstrasse (Ziff. 13, S. 7, SN 640 022)' },
  { abbr: 'Q',    unit: 'PWE/h', desc: 'Verkehrsnachfrage (eigene Belastung) des Stroms — gewichtete Nachfrage dieses Stroms; entspricht qᵢ der SN 640 022 (nicht zu verwechseln mit qpi)' },
  { abbr: 'R',    unit: 'PWE/h', desc: 'Reserve = L − Q; negativ = Überlast' },
  { abbr: 'a',         desc: 'Auslastungsgrad = Q / L (dimensionslos)' },
  { abbr: 'w',    unit: 's',     desc: 'Mittlere Wartezeit — nach Kimber-Hollis (SN 640 022)' },
  { abbr: 'QS',        desc: 'Qualitätsstufe A–F nach Tab. 3 (SN 640 022): A <10s · B 10–15s · C 15–25s · D 25–45s · E >45s · F Überlast' },
]

// ── Ergebnis-Panel ────────────────────────────────────────────────────────────

function ResultsPanel({ result }: {
  result: SN640022Result
}) {
  const [showDetails, setShowDetails] = useState(false)
  const rang2 = result.streams.filter(s => s.rang === 2)
  const overall = result.overallLevelOfService
  const isT = result.streams.length === 3

  return (
    <div>
      {/* Beta-Hinweis — in beiden Tabs */}
      <div className="hinweis klein" style={{ marginBottom: 14 }}>
        ⚠ Beta — Resultate mit Vorsicht verwenden.
      </div>

      {/* Gesamtbeurteilung */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '14px 16px', borderRadius: 12, marginBottom: 16,
                    background: overall ? LOS_BG[overall] : '#f3f4f6',
                    border: `1px solid ${overall ? LOS_COLOR[overall] + '44' : 'var(--kachel-rand)'}` }}>
        <div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 2 }}>Gesamtbeurteilung · SN 640 022</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-strong)' }}>
            {overall ? `Qualitätsstufe ${overall}` : 'Keine Beurteilung'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 1 }}>
            {overall
              ? '(schlechtester belasteter Strom resp. Mischstreifen)'
              : 'Ohne Verkehr gibt es nichts zu beurteilen.'}
          </div>
        </div>
        {overall && <LOSBadge los={overall} />}
      </div>

      {/* Mischstreifen */}
      {result.mixedLanes.length > 0 && (
        <>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)',
                        textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
            Mischstreifen
          </div>
          {result.mixedLanes.map(m => <MixedCard key={m.id} m={m} />)}
          <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: 8 }}>
            <strong>Annahme:</strong> {isT
              ? 'Links- und Rechtseinbieger teilen sich einen Fahrstreifen.'
              : 'Mindestens zwei Ströme je Nebenstrassen-Arm teilen sich einen Fahrstreifen.'}{' '}
            Die Norm kennt Mischstreifen nur, wenn Fahrstreifen im Knotenbereich von mehreren
            Strömen benutzt werden (Ziff. 12, S. 7). Bei getrennten Streifen sind die Einzelströme
            massgebend, die Gesamtstufe ist dann zu streng.
          </div>
        </>
      )}

      {/* HS-Linksabbieger (Rang 2) */}
      {rang2.length > 0 && (
        <>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)',
                        textTransform: 'uppercase', letterSpacing: '0.05em',
                        marginTop: 16, marginBottom: 8 }}>
            Rang 2: Linksabbieger Hauptstrasse, Rechtseinbieger Nebenstrasse
          </div>
          <div style={{ background: '#fff', borderRadius: 8, border: '1px solid var(--kachel-rand)', overflow: 'hidden' }}>
            {rang2.map(s => <StreamRow key={s.id} s={s} />)}
          </div>
        </>
      )}

      {/* Detailtabelle (toggle) */}
      <button onClick={() => setShowDetails(d => !d)}
        className="knopf zweit breit" style={{ marginTop: 20 }}>
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
                                        borderBottom: '1px solid var(--kachel-rand)' }}>
                  <td style={{ padding: '5px 8px', textAlign: 'center', fontWeight: 700 }}>{s.streamNumber}</td>
                  <td style={{ padding: '5px 8px', color: 'var(--text)', whiteSpace: 'nowrap' }}>{s.name}</td>
                  <td style={{ padding: '5px 8px', textAlign: 'center', color: 'var(--text-muted)' }}>{s.rang}</td>
                  <td style={{ padding: '5px 8px', textAlign: 'right' }}>{Math.round(s.qpi)}</td>
                  <td style={{ padding: '5px 8px', textAlign: 'right' }}>{Math.round(s.basicCapacity)}</td>
                  <td style={{ padding: '5px 8px', textAlign: 'right', fontWeight: 600 }}>{Math.round(s.capacity)}</td>
                  <td style={{ padding: '5px 8px', textAlign: 'right',
                               color: s.reserve < 0 ? '#dc2626' : '#16a34a' }}>{Math.round(s.reserve)}</td>
                  <td style={{ padding: '5px 8px', textAlign: 'right' }}>{s.utilizationDegree.toFixed(3)}</td>
                  <td style={{ padding: '5px 8px', textAlign: 'right' }}>
                    {s.volumePWE <= 0 ? '–' : isFinite(s.delay) ? Math.round(s.delay) : '∞'}
                  </td>
                  <td style={{ padding: '5px 8px', textAlign: 'center' }}>
                    {s.volumePWE <= 0 ? '–' : <LOSBadge los={s.levelOfService} />}
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

export default function SN022App({ uebernahme }: { uebernahme?: KnotenUebernahme }) {
  const isActive = useIsActiveModule()  // Druckblatt nur im sichtbaren Modul
  const [cfg, setCfg] = useState<IntersectionConfiguration>(() => uebernahme ? intersectionAus(uebernahme) : defaultIntersection(3))
  const [armGewaehlt, setArmGewaehlt] = useState(!!uebernahme)   // Knotentyp hat keinen Startwert
  const [karte, setKarte] = useState(() => uebernahme ? kartenBezugAus(uebernahme, 'sn022') : null)
  const [showBl, setShowBl] = useState(false)
  const openBl  = useCallback(() => setShowBl(true),  [])
  const closeBl = useCallback(() => setShowBl(false), [])
  const { meldung, melden, schliessen: meldungZu } = useMeldung()

  const handleExport = () =>
    exportTool({ tool: 'sn022', filePrefix: 'SN022', name: cfg.name, data: { ...cfg, ...(karte ? { karte } : {}) }, melden })

  const handleImport = () =>
    importTool('sn022', data => { setCfg(conformIntersection(data)); setArmGewaehlt(true); setKarte(kartenBezugLesen(data.karte)) }, melden)

  function handleReset() {
    setCfg(defaultIntersection(3))
    setArmGewaehlt(false)
    melden('Zurückgesetzt')
  }

  const offen = armGewaehlt ? offeneArmAngaben(cfg.arms) : ['Knotentyp']
  const fertig = offen.length === 0
  const result = useMemo(() => {
    if (!fertig) return null
    const v   = toSNVolumes(cfg)
    const raw = toSNRawVolumes(cfg)
    if (!v || !raw) return null
    return analyzeSN640022(v, toSNLaneFlags(cfg), raw)
  }, [cfg, fertig])

  // Daten fürs dynamische Knotenschema (Einmündung)
  // Volumen aus der Eingabe (alle Bewegungen, Fz/h) — result.streams enthält nur Rang ≥ 2
  const diagFlags = toSNLaneFlags(cfg)
  const [armA, armC, armB, armD] = cfg.arms
  const diagVols = {
    q1: armA?.leftVolume,     q2: armA?.straightVolume, q3: armA?.rightVolume,
    q7: armC?.leftVolume,     q8: armC?.straightVolume, q9: armC?.rightVolume,
    q4: armB?.leftVolume,     q5: armB?.straightVolume, q6: armB?.rightVolume,
    q10: armD?.leftVolume,    q11: armD?.straightVolume, q12: armD?.rightVolume,
  }
  // Ströme ohne Verkehr bleiben im Schema ohne Qualitätsfarbe
  const losNo = (n: number) => {
    const s = result?.streams.find(x => x.streamNumber === n)
    return s && s.volumePWE > 0 ? s.levelOfService : undefined
  }
  const diagLos = losNo
  const diagLosAll = {
    q1: losNo(1), q2: losNo(2), q3: losNo(3), q4: losNo(4), q5: losNo(5), q6: losNo(6),
    q7: losNo(7), q8: losNo(8), q9: losNo(9), q10: losNo(10), q11: losNo(11), q12: losNo(12),
  }

  // Knotenbild mit den Qualitätsstufen: am Bildschirm und im Druckblatt
  const knotenbild = cfg.arms.length === 3 ? (
              <KnotenDiagramm
                volumes={diagVols}
                separateLaneA={diagFlags.armASeparateLane}
                islandA={diagFlags.armATriangleIsland}
                leftLaneC={diagFlags.armCLeftLane}
                losByStream={result ? {
                  q2: diagLos(2), q3: diagLos(3), q4: diagLos(4),
                  q6: diagLos(6), q7: diagLos(7), q8: diagLos(8),
                } : undefined}
              />
            ) : (
              <KnotenDiagramm
                armCount={4}
                volumes={diagVols}
                losByStream={result ? diagLosAll : undefined}
                separateLaneA={diagFlags.armASeparateLane}
                islandA={diagFlags.armATriangleIsland}
                leftLaneA={diagFlags.armALeftLane}
                separateLaneC={diagFlags.armCSeparateLane}
                islandC={diagFlags.armCTriangleIsland}
                leftLaneC={diagFlags.armCLeftLane}
                islandB={diagFlags.armBRightIsland}
                islandD={diagFlags.armDRightIsland}
              />
            )

  const setArm = (i: number, arm: ArmConfiguration) =>
    setCfg(prev => { const arms = [...prev.arms]; arms[i] = arm; return { ...prev, arms } })

  const setArmCount = (n: 3 | 4) => {
    setArmGewaehlt(true)
    setCfg(prev => prev.arms.length === n ? prev : defaultIntersection(n))
  }

  return (
    <>
    <main style={{ maxWidth: 1280, margin: '0 auto', padding: '20px 16px' }}>
      <Meldung text={meldung} onClose={meldungZu} />
      {uebernahme && <UebernahmeHinweis u={uebernahme} rechner="sn022" />}
      <SoFunktionierts rechner="sn022" />
      {karte && <BelastungsVergleich vergleich={karte.vergleich}
        querschnitte={querschnitteKnoten(cfg.arms.map(a => ({ left: a.leftVolume, straight: a.straightVolume, right: a.rightVolume })))} />}

      {/* Knotentyp */}
      <div className="kachel" style={{ padding: '12px 20px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <input type="text" value={cfg.name}
          onChange={e => setCfg(prev => ({ ...prev, name: e.target.value }))}
          placeholder="Bezeichnung des Knotens"
          style={{ flexBasis: '100%', padding: '5px 10px', borderRadius: 5,
                   border: '1px solid var(--border)', fontSize: 14, fontWeight: 600,
                   color: 'var(--text-strong)' }} />
        <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)' }}>Knotentyp</span>
        {([3, 4] as const).map(n => (
          <ToggleBtn key={n} active={armGewaehlt && cfg.arms.length === n} onClick={() => setArmCount(n)}>
            {n === 3 ? 'T-Knoten (3 Arme)' : 'Kreuzung (4 Arme)'}
          </ToggleBtn>
        ))}
        {armGewaehlt && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          A, C = Hauptstrasse · B{cfg.arms.length === 4 ? ', D' : ''} = Nebenstrasse
        </span>}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
          <BerichtKnopf onClick={openBl} bereit={!!result} />
          <ToolbarBtn onClick={handleExport}>Fall speichern</ToolbarBtn>
          <ToolbarBtn onClick={handleImport}>Fall laden</ToolbarBtn>
          <button onClick={handleReset}
            className="knopf zweit">
            zurücksetzen
          </button>
        </div>
      </div>

      {!armGewaehlt && <OffeneAngaben liste={offen} />}

      {/* Arme + Ergebnisse */}
      {armGewaehlt && <div className="layout-grid">

        {/* Arm-Karten */}
        <div className={`arms-grid${cfg.arms.length === 4 ? ' arms-grid-4' : ''}`}>
          {cfg.arms.map((arm, i) => (
            <ArmCard key={arm.id} arm={arm} index={i} isHS={i < 2} herkunft={uebernahme?.arme[i]}
              armCount={cfg.arms.length} live
              opposingHSSeparateLane={
                i === 2 ? (cfg.arms[0]?.hasSeparateTurnLane ?? false)
              : i === 3 ? (cfg.arms[1]?.hasSeparateTurnLane ?? false)
              : false
              }
              onChange={a => setArm(i, a)} />
          ))}
        </div>

        {/* Ergebnisse (sticky auf Desktop, static auf Mobile) */}
        <div className="results-panel kachel"
             style={{ padding: 20 }}>

          {/* Schematik */}
          <div style={{ marginBottom: 16, borderRadius: 8, overflow: 'hidden',
                        border: '1px solid var(--kachel-rand)', background: '#fafafa', padding: 8 }}>
            {knotenbild}
          </div>

          {result
            ? <ResultsPanel result={result} />
            : <OffeneAngaben liste={offen} />
          }

        </div>
      </div>}

      <HilfeUnten rechner="sn022" legende={LEGEND_ITEMS} quellen={karte?.quellen} />

      <RechnerFuss>
        Berechnung nach SN 640 022. Leistungsfähigkeit, Verkehrsqualität, Belastbarkeit.
        Knoten ohne Lichtsignalanlage (VSS, Mai 1999).
        Die Ergebnisse ersetzen keine Überprüfung durch eine Fachperson.
      </RechnerFuss>
    </main>
    {isActive && result && showBl && createPortal(
      <Berechnungsblatt cfg={cfg} result={result} onClose={closeBl} karte={karte} uebernahme={uebernahme} knotenbild={knotenbild} />,
      document.body
    )}
    </>
  )
}
