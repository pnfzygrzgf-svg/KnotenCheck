// Berechnungsblatt — Zusammenstellung nach SN 640 022
// Analog Anhang I in einem Verkehrsgutachten (z.B. Egerkingen)

import type { CSSProperties } from 'react'
import type { SN640022Result, SN640022StreamResult, LevelOfService } from './engine/types'
import type { IntersectionConfiguration, ArmConfiguration } from './engine/armConfiguration'
import { armLabel, armFactor, pctPW } from './engine/armConfiguration'
import kreuzungSvg    from './assets/kreuzung.svg'
import einmuendungSvg from './assets/einmuendung.svg'

// ── Tabellen-Stile ─────────────────────────────────────────────────────────────
const T: CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: 11, marginBottom: 14 }
const TH: CSSProperties = { border: '1px solid #555', padding: '3px 7px', background: '#d8d8d8', fontWeight: 700, textAlign: 'left', whiteSpace: 'nowrap' }
const THC: CSSProperties = { ...TH, textAlign: 'center' }
const TD: CSSProperties = { border: '1px solid #999', padding: '3px 7px' }
const TDR: CSSProperties = { ...TD, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }
const TDC: CSSProperties = { ...TD, textAlign: 'center' }
const SEC: CSSProperties = { fontWeight: 700, fontSize: 11, margin: '12px 0 3px', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#222', borderBottom: '1px solid #aaa', paddingBottom: 2 }

const LOS_BG: Record<LevelOfService, string> = {
  A: '#bbf7d0', B: '#d9f99d', C: '#fef08a', D: '#fed7aa', E: '#fecaca', F: '#f87171',
}

// ── Hilfsfunktionen ────────────────────────────────────────────────────────────

const nr  = (v: number) => isFinite(v) ? Math.round(v).toString() : '—'
const n1  = (v: number) => isFinite(v) ? v.toFixed(1) : '—'
const n3  = (v: number) => isFinite(v) ? v.toFixed(3) : '—'

function wStr(w: number): string {
  if (!isFinite(w)) return '> 80'
  if (w < 1)        return '< 1'
  return Math.round(w).toString()
}

// Fz/h eines Stroms aus der Konfiguration
function streamFzh(num: number, cfg: IntersectionConfiguration): number {
  const a = cfg.arms
  const map: Record<number, number> = {
    1: a[0]?.leftVolume ?? 0,     2: a[0]?.straightVolume ?? 0,  3: a[0]?.rightVolume ?? 0,
    4: a[2]?.leftVolume ?? 0,     5: a[2]?.straightVolume ?? 0,  6: a[2]?.rightVolume ?? 0,
    7: a[1]?.leftVolume ?? 0,     8: a[1]?.straightVolume ?? 0,  9: a[1]?.rightVolume ?? 0,
    10: a[3]?.leftVolume ?? 0,    11: a[3]?.straightVolume ?? 0, 12: a[3]?.rightVolume ?? 0,
  }
  return map[num] ?? 0
}

// ── Ströme je Arm (SN-Reihenfolge) ────────────────────────────────────────────

interface StreamDef { num: number; streifen: number; showIsland: boolean }

function armStreamDefs(armIdx: number, n: number, arm: IntersectionConfiguration['arms'][0]): StreamDef[] {
  const combo = arm.mixedLaneCombination
  if (n === 3) {
    if (armIdx === 0) return [
      { num: 2, streifen: 1, showIsland: false },
      { num: 3, streifen: arm.hasSeparateTurnLane ? 1 : 0, showIsland: true },
    ]
    if (armIdx === 1) return [
      { num: 7, streifen: 1, showIsland: false },
      { num: 8, streifen: 1, showIsland: false },
    ]
    return [  // B (idx=2)
      { num: 4, streifen: 1, showIsland: false },
      { num: 6, streifen: 1, showIsland: true },
    ]
  }
  // 4-armig
  if (armIdx === 0) return [
    { num: 1, streifen: 1, showIsland: false },
    { num: 2, streifen: 1, showIsland: false },
    { num: 3, streifen: arm.hasSeparateTurnLane ? 1 : 0, showIsland: true },
  ]
  if (armIdx === 1) return [
    { num: 7, streifen: 1, showIsland: false },
    { num: 8, streifen: 1, showIsland: false },
    { num: 9, streifen: arm.hasSeparateTurnLane ? 1 : 0, showIsland: true },
  ]
  if (armIdx === 2) return [
    { num: 4, streifen: combo === 'throughAndRight' ? 1 : 0, showIsland: false },
    { num: 5, streifen: 1, showIsland: false },
    { num: 6, streifen: combo === 'leftAndThrough' ? 1 : 0, showIsland: true },
  ]
  return [  // D (idx=3)
    { num: 10, streifen: combo === 'throughAndRight' ? 1 : 0, showIsland: false },
    { num: 11, streifen: 1, showIsland: false },
    { num: 12, streifen: combo === 'leftAndThrough' ? 1 : 0, showIsland: true },
  ]
}

// ── Arm-Reihenfolge: A, B, C, (D) ─────────────────────────────────────────────
// cfg.arms: [0]=A(HS), [1]=C(HS), [2]=B(NS), [3]=D(NS)
// Ausgabe-Reihenfolge: A(0), B(2), C(1), D(3)
const ARM_ORDER_3 = [0, 2, 1]
const ARM_ORDER_4 = [0, 2, 1, 3]

// ── Fussnoten je Strom ─────────────────────────────────────────────────────────
function streamNote(sd: StreamDef, arm: ArmConfiguration, armIdx: number): string {
  const isHS = armIdx < 2
  const parts: string[] = []
  // Fn 2: HS-Geradeausstrom mit separatem Linksabbiegerstreifen
  if ((sd.num === 2 || sd.num === 8) && arm.rightLaneVolume !== undefined && arm.rightLaneVolume > 0) {
    parts.push(`sep. Linksabb.-Str. (Fn 2) · rechter FS: ${arm.rightLaneVolume} Fz/h`)
  }
  if (sd.showIsland) {
    if (isHS && arm.hasSeparateTurnLane) parts.push('sep. Rechtsabb.-Str. (Fn 1)')
    if (arm.hasRightTurnTriangleIsland) {
      parts.push(isHS ? 'Dreiecksinsel (Fn 3)' : 'Dreiecksinsel (Fn 4)')
    } else {
      parts.push('Dreiecksinsel: nein')
    }
  }
  return parts.join(' · ')
}

// ── Hauptkomponente ────────────────────────────────────────────────────────────

interface Props {
  cfg: IntersectionConfiguration
  result: SN640022Result
  onClose: () => void
}

export function Berechnungsblatt({ cfg, result, onClose }: Props) {
  const is3      = cfg.arms.length === 3
  const armOrder = is3 ? ARM_ORDER_3 : ARM_ORDER_4
  const rang2    = result.streams.filter(s => s.rang === 2)
  const rang3    = result.streams.filter(s => s.rang === 3)
  const rang4    = result.streams.filter(s => s.rang === 4)
  const hasFall2 = cfg.arms.some(a => a.vehicleMix !== undefined)
  const today    = new Date().toLocaleDateString('de-CH')

  return (
    <div className="bl-overlay">
      {/* Toolbar — nicht gedruckt */}
      <div className="bl-toolbar no-print" style={{
        position: 'sticky', top: 0, zIndex: 10,
        display: 'flex', gap: 10, padding: '10px 24px',
        background: '#1e3a5f', borderBottom: '2px solid #2d5490',
      }}>
        <button onClick={() => {
          const prev = document.title
          document.title = `KnotenCheck – SN 640 022${cfg.name ? ' – ' + cfg.name : ''}`
          window.addEventListener('afterprint', () => { document.title = prev }, { once: true })
          window.print()
        }}
          style={{ padding: '6px 16px', background: '#fff', color: '#1e3a5f',
                   border: 'none', borderRadius: 5, fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>
          Drucken / Als PDF speichern
        </button>
        <button onClick={onClose}
          style={{ padding: '6px 16px', background: 'transparent', color: '#fff',
                   border: '1px solid #fff5', borderRadius: 5, cursor: 'pointer', fontSize: 13 }}>
          ✕ Schliessen
        </button>
        <span style={{ fontSize: 11, color: '#94a3b8', alignSelf: 'center', marginLeft: 8 }}>
          Im Browser: Drucken → «Als PDF speichern»
        </span>
      </div>

      {/* Druckbares Blatt */}
      <div className="berechnungsblatt" style={{
        maxWidth: 900, margin: '0 auto', padding: '28px 32px',
        background: '#fff', fontFamily: 'Arial, Helvetica, sans-serif', color: '#111',
      }}>

        {/* ── Kopfzeile ──────────────────────────────────────────────────────── */}
        <div style={{ borderBottom: '2px solid #333', paddingBottom: 8, marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>
            Berechnung Leistungsfähigkeit von Knoten ohne Lichtsignalanlage
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
            <div>
              <strong>Bezeichnung:</strong> {cfg.name || '—'} &nbsp;&nbsp;
              <strong>Knotentyp:</strong> {is3 ? 'Einmündung (3-armig)' : 'Kreuzung (4-armig)'}
            </div>
            <div style={{ color: '#555' }}>
              Norm: VSS SN 640 022 (Mai 1999) &nbsp;·&nbsp; {today}
            </div>
          </div>
          <div style={{ fontSize: 10, color: '#444' }}>
            <strong>Hauptstrasse:</strong>&nbsp;
            Arm A{cfg.arms[0]?.streetName ? ` — ${cfg.arms[0].streetName}` : ''} &nbsp;/&nbsp;
            Arm C{cfg.arms[1]?.streetName ? ` — ${cfg.arms[1].streetName}` : ''} &nbsp;&nbsp;
            <strong>Nebenstrasse:</strong>&nbsp;
            Arm B{cfg.arms[2]?.streetName ? ` — ${cfg.arms[2].streetName}` : ''}
            {!is3 && <> &nbsp;/&nbsp; Arm D{cfg.arms[3]?.streetName ? ` — ${cfg.arms[3].streetName}` : ''}</>}
          </div>
        </div>

        {/* ── Stromschema ────────────────────────────────────────────────────── */}
        <div style={SEC} className="bl-sec">Stromschema (Abb. 1)</div>
        <div className="bl-diagram" style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
          <img
            src={is3 ? einmuendungSvg : kreuzungSvg}
            alt={is3 ? 'Stromschema Einmündung' : 'Stromschema Kreuzung'}
            style={{ height: 200, width: 'auto' }}
          />
        </div>

        {/* ── Knotengeometrie ────────────────────────────────────────────────── */}
        <div style={SEC} className="bl-sec">Knotengeometrie</div>
        <table style={T}>
          <thead>
            <tr>
              <th style={TH}>Zufahrt</th>
              <th style={THC}>Strom</th>
              <th style={THC}>Streifen</th>
              <th style={THC}>Längsneigung [%]</th>
              <th style={TH}>Fussnoten / Dreiecksinsel</th>
            </tr>
          </thead>
          <tbody>
            {armOrder.map(armIdx => {
              const arm  = cfg.arms[armIdx]
              const lbl  = armLabel(armIdx)
              const defs = armStreamDefs(armIdx, cfg.arms.length, arm)
              return defs.map((sd, i) => (
                <tr key={sd.num} style={{ background: i % 2 === 0 ? '#f8f8f8' : '#fff' }}>
                  <td style={TD}>{i === 0 ? lbl : ''}</td>
                  <td style={TDC}>{sd.num}</td>
                  <td style={TDC}>{sd.streifen}</td>
                  <td style={TDC}>{arm.gradient.replace('±', '±')}</td>
                  <td style={{ ...TD, fontSize: 10 }}>{streamNote(sd, arm, armIdx)}</td>
                </tr>
              ))
            })}
          </tbody>
        </table>

        {/* ── Knotenbelastungen ──────────────────────────────────────────────── */}
        <div style={SEC} className="bl-sec">Knotenbelastungen</div>
        {hasFall2
          ? <BelastungenFall2 cfg={cfg} armOrder={armOrder} />
          : <BelastungenFall1 cfg={cfg} armOrder={armOrder} />
        }

        {/* ── Grundleistungsfähigkeit ────────────────────────────────────────── */}
        <div style={SEC} className="bl-sec">Grundleistungsfähigkeit</div>
        <table style={T}>
          <thead>
            <tr>
              <th style={THC}>Strom</th>
              <th style={THC} colSpan={2}>Belastungen</th>
              <th style={THC}>Massgebender HS</th>
              <th style={THC}>Grundleistungs-</th>
            </tr>
            <tr>
              <th style={THC}></th>
              <th style={THC}>[Fz/h]</th>
              <th style={THC}>[PWE/h]</th>
              <th style={THC}>q<sub>pi</sub> [Fz/h]</th>
              <th style={THC}>fähigkeit G<sub>i</sub> [PWE/h]</th>
            </tr>
          </thead>
          <tbody>
            {result.streams.map((s, i) => {
              const fzh = streamFzh(s.streamNumber, cfg)
              return (
                <tr key={s.id} style={{ background: i % 2 === 0 ? '#f8f8f8' : '#fff' }}>
                  <td style={TDC}><strong>{s.streamNumber}</strong></td>
                  <td style={TDR}>{nr(fzh)}</td>
                  <td style={TDR}>{n1(s.volumePWE)}</td>
                  <td style={TDR}>{n1(s.qpi)}</td>
                  <td style={TDR}><strong>{nr(s.basicCapacity)}</strong></td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {/* ── LF zweitrangige Ströme ─────────────────────────────────────────── */}
        {rang2.length > 0 && <>
          <div style={SEC} className="bl-sec">Leistungsfähigkeit der zweitrangigen Ströme</div>
          <LFTable streams={rang2} />
        </>}

        {/* ── LF drittrangige Ströme ─────────────────────────────────────────── */}
        {rang3.length > 0 && <>
          <div style={SEC} className="bl-sec">Leistungsfähigkeit der drittrangigen Ströme</div>
          <LFTable streams={rang3} />
        </>}

        {/* ── LF viertrangige Ströme ─────────────────────────────────────────── */}
        {rang4.length > 0 && <>
          <div style={SEC} className="bl-sec">Leistungsfähigkeit der viertrangigen Ströme</div>
          <LFTable streams={rang4} />
        </>}

        {/* ── LF Mischstreifen ───────────────────────────────────────────────── */}
        {result.mixedLanes.length > 0 && <>
          <div style={SEC} className="bl-sec">Leistungsfähigkeit des Mischstromes</div>
          <table style={T}>
            <thead>
              <tr>
                <th style={TH}>Zufahrt / Ströme</th>
                <th style={THC}>Belastungen [PWE/h]</th>
                <th style={THC}>Auslastungsgrad Σa<sub>i</sub></th>
                <th style={THC}>Leistungsfähigkeit L<sub>m</sub> [PWE/h]</th>
              </tr>
            </thead>
            <tbody>
              {result.mixedLanes.map((m, i) => (
                <tr key={m.id} style={{ background: i % 2 === 0 ? '#f8f8f8' : '#fff' }}>
                  <td style={TD}>{m.name}</td>
                  <td style={TDR}>{n1(m.volumeFzh)}</td>
                  <td style={TDR}>{n3(m.utilizationDegree)}</td>
                  <td style={TDR}><strong>{nr(m.capacity)}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
        </>}

        {/* ── Beurteilung Verkehrsqualität ───────────────────────────────────── */}
        <div style={SEC} className="bl-sec">Beurteilung der Verkehrsqualität</div>
        <table style={T}>
          <thead>
            <tr>
              <th style={THC}>Strom / Arm</th>
              <th style={THC}>Belastungsreserve R [PWE/h]</th>
              <th style={THC}>Leistungsfähigkeit L [PWE/h]</th>
              <th style={THC}>Mittl. Wartezeit w [s]</th>
              <th style={THC}>Qualitätsstufe</th>
              <th style={TH}>Vergleich</th>
            </tr>
          </thead>
          <tbody>
            {/* Einzelströme */}
            {result.streams.map((s, i) => {
              const rOk = s.reserve >= 0
              return (
                <tr key={s.id} style={{ background: i % 2 === 0 ? '#f8f8f8' : '#fff' }}>
                  <td style={TDC}>{s.streamNumber} &nbsp;<span style={{ color:'#666', fontSize:10 }}>({s.name})</span></td>
                  <td style={{ ...TDR, color: rOk ? '#166534' : '#991b1b', fontWeight: rOk ? 400 : 700 }}>
                    {nr(s.reserve)}
                  </td>
                  <td style={TDR}>{nr(s.capacity)}</td>
                  <td style={TDR}>{wStr(s.delay)}</td>
                  <td style={{ ...TDC, background: LOS_BG[s.levelOfService], fontWeight: 700 }}>
                    {s.levelOfService}
                  </td>
                  <td style={{ ...TD, fontSize: 10 }}>{losVergleich(s.levelOfService, s.delay)}</td>
                </tr>
              )
            })}
            {/* Mischstreifen */}
            {result.mixedLanes.map((m, i) => {
              const rOk = m.reserve >= 0
              const bg = (result.streams.length + i) % 2 === 0 ? '#f8f8f8' : '#fff'
              return (
                <tr key={m.id} style={{ background: bg }}>
                  <td style={TD}><em>{m.name}</em></td>
                  <td style={{ ...TDR, color: rOk ? '#166534' : '#991b1b', fontWeight: rOk ? 400 : 700 }}>
                    {nr(m.reserve)}
                  </td>
                  <td style={TDR}>{nr(m.capacity)}</td>
                  <td style={TDR}>{wStr(m.delay)}</td>
                  <td style={{ ...TDC, background: LOS_BG[m.levelOfService], fontWeight: 700 }}>
                    {m.levelOfService}
                  </td>
                  <td style={{ ...TD, fontSize: 10 }}>{losVergleich(m.levelOfService, m.delay)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {/* ── Fussnoten ──────────────────────────────────────────────────────── */}
        <div style={{ fontSize: 10, color: '#555', lineHeight: 1.6, borderTop: '1px solid #ccc', paddingTop: 6 }}>
          <div>¹⁾ q₃ bzw. q₉ nicht berücksichtigen, wenn separater Streifen für Rechtsabbieger vorhanden (Fn 1).</div>
          <div>²⁾ Bei mehr als einem Streifen gilt Belastung auf dem rechten Fahrstreifen (Fn 2).</div>
          <div>³⁾ q₃ und q₉ nicht berücksichtigen, wenn Dreiecksinsel vorhanden und mit Kein Vortritt oder Stop belastet (Fn 3).</div>
          <div>⁴⁾ q₆ und q₁₂ entfallen, wenn durch Dreiecksinsel getrennt und mit Kein Vortritt oder Stop belastet (Fn 4).</div>
          <div style={{ marginTop: 4 }}>
            Berechnung nach VSS SN 640 022 (Mai 1999) — KnotenCheck Web (Beta).
            Resultate ersetzen keine Überprüfung durch eine Fachperson.
          </div>
        </div>

      </div>{/* end berechnungsblatt */}
    </div>
  )
}

// ── Hilfsfunktion Beurteilung ──────────────────────────────────────────────────

function losVergleich(los: LevelOfService, w: number): string {
  const wok = isFinite(w) && w <= 45
  if (los === 'A' || los === 'B') return '<< 45 s  sehr gut'
  if (los === 'C') return '< 45 s  gut'
  if (los === 'D') return wok ? '≤ 45 s  ausreichend' : '> 45 s  ausreichend'
  if (los === 'E') return '>> 45 s  kritisch'
  return 'Überlastung'
}

// ── Knotenbelastungen Fall 1 ───────────────────────────────────────────────────

function BelastungenFall1({ cfg, armOrder }: {
  cfg: IntersectionConfiguration; armOrder: number[]
}) {
  // Alle Strom-Nummern ermitteln
  const allStreams: { armIdx: number; def: StreamDef }[] = []
  for (const armIdx of armOrder) {
    const arm  = cfg.arms[armIdx]
    const defs = armStreamDefs(armIdx, cfg.arms.length, arm)
    for (const d of defs) allStreams.push({ armIdx, def: d })
  }

  return (
    <table style={T}>
      <thead>
        <tr>
          <th style={TH}>Zufahrt</th>
          <th style={THC}>Strom</th>
          <th style={THC}>Fz/h</th>
          <th style={THC}>PWE/h</th>
          <th style={{ ...TH, fontSize: 10, color: '#666' }}>
            Umrechnungsfaktor f &nbsp;(Fall 1, Tab. 1)
          </th>
        </tr>
      </thead>
      <tbody>
        {allStreams.map(({ armIdx, def }, i) => {
          const arm   = cfg.arms[armIdx]
          const f     = armFactor(arm)
          const fzh   = streamFzh(def.num, cfg)
          const pwe   = fzh * f
          const lbl   = armLabel(armIdx)
          // Arm-Label nur bei erstem Strom des Arms
          const prevArmIdx = i > 0 ? allStreams[i-1].armIdx : -1
          const showLbl = armIdx !== prevArmIdx

          return (
            <tr key={def.num} style={{ background: i % 2 === 0 ? '#f8f8f8' : '#fff' }}>
              <td style={TD}>{showLbl ? lbl : ''}</td>
              <td style={TDC}>{def.num}</td>
              <td style={TDR}>{fzh}</td>
              <td style={TDR}>{n1(pwe)}</td>
              <td style={{ ...TD, fontSize: 10, color: '#555' }}>
                {showLbl ? `f = ${f.toFixed(2)}  (${arm.gradient})` : ''}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

// ── Knotenbelastungen Fall 2 ───────────────────────────────────────────────────

function BelastungenFall2({ cfg, armOrder }: {
  cfg: IntersectionConfiguration; armOrder: number[]
}) {
  const allStreams: { armIdx: number; def: StreamDef }[] = []
  for (const armIdx of armOrder) {
    const arm  = cfg.arms[armIdx]
    const defs = armStreamDefs(armIdx, cfg.arms.length, arm)
    for (const d of defs) allStreams.push({ armIdx, def: d })
  }

  return (
    <table style={T}>
      <thead>
        <tr>
          <th style={TH}>Zufahrt</th>
          <th style={THC}>Strom</th>
          <th style={THC}>PW [PW/h]</th>
          <th style={THC}>LW [LW/h]</th>
          <th style={THC}>LZ [TR/h]</th>
          <th style={THC}>MR [mot/h]</th>
          <th style={THC}>FR [vél/h]</th>
          <th style={THC}>Fz/h</th>
          <th style={THC}>PWE/h</th>
        </tr>
      </thead>
      <tbody>
        {allStreams.map(({ armIdx, def }, i) => {
          const arm   = cfg.arms[armIdx]
          const f     = armFactor(arm)
          const fzh   = streamFzh(def.num, cfg)
          const mix   = arm.vehicleMix
          const pctpw = mix ? pctPW(mix) : 100
          const lbl   = armLabel(armIdx)
          const prevArmIdx = i > 0 ? allStreams[i-1].armIdx : -1
          const showLbl = armIdx !== prevArmIdx

          const cell = (pct: number) =>
            mix ? n1(fzh * pct / 100) : '—'

          return (
            <tr key={def.num} style={{ background: i % 2 === 0 ? '#f8f8f8' : '#fff' }}>
              <td style={TD}>{showLbl ? lbl : ''}</td>
              <td style={TDC}>{def.num}</td>
              <td style={TDR}>{cell(pctpw)}</td>
              <td style={TDR}>{cell(mix?.pctLW ?? 0)}</td>
              <td style={TDR}>{cell(mix?.pctLZ ?? 0)}</td>
              <td style={TDR}>{cell(mix?.pctMR ?? 0)}</td>
              <td style={TDR}>{cell(mix?.pctFR ?? 0)}</td>
              <td style={TDR}>{fzh}</td>
              <td style={TDR}><strong>{n1(fzh * f)}</strong></td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

// ── LF-Tabelle (generisch für Rang 2/3/4) ─────────────────────────────────────

function LFTable({ streams }: { streams: SN640022StreamResult[] }) {
  return (
    <table style={T}>
      <thead>
        <tr>
          <th style={THC}>Strom</th>
          <th style={THC}>Leistungsfähigkeit L<sub>i</sub> [PWE/h]</th>
          <th style={THC}>Auslastungsgrad a<sub>i</sub></th>
          <th style={THC}>Wahrscheinlichkeit Staufreiheit p<sub>0,i</sub></th>
        </tr>
      </thead>
      <tbody>
        {streams.map((s, i) => {
          const p0 = Math.max(0, 1 - s.utilizationDegree)
          return (
            <tr key={s.id} style={{ background: i % 2 === 0 ? '#f8f8f8' : '#fff' }}>
              <td style={TDC}><strong>{s.streamNumber}</strong></td>
              <td style={TDR}>{nr(s.capacity)}</td>
              <td style={TDR}>{n3(s.utilizationDegree)}</td>
              <td style={TDR}>{n3(p0)}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
