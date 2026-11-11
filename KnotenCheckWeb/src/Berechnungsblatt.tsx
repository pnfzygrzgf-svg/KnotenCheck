// Berechnungsblatt — Zusammenstellung nach SN 640 022, im Gerüst der Berichte (bericht/Bericht.tsx)
// Die Rechenschritte folgen Anhang I eines Verkehrsgutachtens (z.B. Egerkingen)

import type { CSSProperties, ReactNode } from 'react'
import type { SN640022Result, SN640022StreamResult, LevelOfService } from './engine/types'
import type { IntersectionConfiguration, ArmConfiguration } from './engine/armConfiguration'
import { ausserhalbAbb2, ausserhalbAbb4, DIAGRAMM_HINWEIS, WARTEZEIT_HINWEIS } from './engine/sn640022Calculator'
import { armLabel, armFactor, pctPW, RECHTSABBIEGER_HINWEIS, SN022_GRENZEN, starkeRechtsabbieger } from './engine/armConfiguration'
import type { KartenBezug, KnotenUebernahme } from './karte/rechner'
import { Abschnitt, BerichtKopf, BerichtRahmen, Gesamtergebnis, Herkunft, HerkunftLegende, HinweisListe, QuellenAbschnitt } from './bericht/Bericht'
import { kartenHerkunft, schaetzArt, stromHerkunft, svHerkunft, type HerkunftArt } from './bericht/herkunft'
import { schaetzungGilt, type Schaetzung } from './schaetzung/schaetzung'
import { GRUNDLAGEN } from './hilfeTexte'
import kreuzungSvg    from './assets/kreuzung.svg'
import einmuendungSvg from './assets/einmuendung.svg'

// ── Tabellen-Stile ─────────────────────────────────────────────────────────────
const T: CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: 11, marginBottom: 14 }
const TH: CSSProperties = { border: '1px solid #555', padding: '3px 7px', background: '#d8d8d8', fontWeight: 700, textAlign: 'left', whiteSpace: 'nowrap' }
const THC: CSSProperties = { ...TH, textAlign: 'center' }
const TD: CSSProperties = { border: '1px solid #999', padding: '3px 7px' }
const TDR: CSSProperties = { ...TD, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }
const TDC: CSSProperties = { ...TD, textAlign: 'center' }

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
  // Fn 2 (S. 3): mehrere Streifen auf der Hauptstrasse, es zählt der rechte Fahrstreifen
  if ((sd.num === 2 || sd.num === 8) && arm.rightLaneVolume !== undefined) {
    parts.push(`mehrstreifig (Fn 2) · rechter FS: ${Math.min(arm.rightLaneVolume, arm.straightVolume)} Fz/h`)
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
// Reihenfolge wie in den Berichten der anderen Rechner: Ort, Ergebnis, Rechenschritte, Eingaben, Annahmen und Hinweise, Quellen

interface Props {
  cfg: IntersectionConfiguration
  result: SN640022Result
  onClose: () => void
  karte?: KartenBezug | null
  uebernahme?: KnotenUebernahme
  schaetzung?: Schaetzung | null
  knotenbild?: ReactNode
}

const RICHTUNG = [['left', 'links'], ['straight', 'geradeaus'], ['right', 'rechts']] as const
const VOLUMEN = { left: 'leftVolume', straight: 'straightVolume', right: 'rightVolume' } as const
// Am dreiarmigen Knoten fehlt je Arm eine Richtung (Reihenfolge der Konfiguration: A, C, B)
const OHNE_3: Record<number, 'left' | 'straight' | 'right'> = { 0: 'left', 1: 'right', 2: 'straight' }

export function Berechnungsblatt({ cfg, result, onClose, karte, uebernahme, schaetzung, knotenbild }: Props) {
  const is3      = cfg.arms.length === 3
  const armOrder = is3 ? ARM_ORDER_3 : ARM_ORDER_4
  const rang2    = result.streams.filter(s => s.rang === 2)
  const rang3    = result.streams.filter(s => s.rang === 3)
  const rang4    = result.streams.filter(s => s.rang === 4)
  const hasFall2 = cfg.arms.some(a => a.vehicleMix !== undefined)
  const overall  = result.overallLevelOfService
  const herkunft: (HerkunftArt | null)[] = []
  const merke = (h: HerkunftArt | null) => { herkunft.push(h); return h }

  const hinweise: ReactNode[] = [
    ...(karte?.belegt ?? []),
    ...(schaetzung && schaetzungGilt(schaetzung, cfg.arms.map(a => ({ left: a.leftVolume, straight: a.straightVolume, right: a.rightVolume }))) ? [schaetzung.text] : []),
    ...(result.mixedLanes.length ? [<><b>Annahme:</b> {is3 ? 'Links- und Rechtseinbieger teilen sich einen Fahrstreifen.'
      : 'Mindestens zwei Ströme je Nebenstrassen-Arm teilen sich einen Fahrstreifen.'} Die Norm kennt Mischstreifen nur, wenn Fahrstreifen im
      Knotenbereich von mehreren Strömen benutzt werden (Ziffer 12, Seite 7). Bei getrennten Streifen sind die Einzelströme massgebend, die
      Gesamtstufe ist dann zu streng.</>] : []),
    ...starkeRechtsabbieger(cfg.arms).map(RECHTSABBIEGER_HINWEIS),
    ...(result.streams.some(s => ausserhalbAbb2(s.qpi) || ausserhalbAbb4(s.volumePWE, s.capacity)) || result.mixedLanes.some(m => ausserhalbAbb4(m.volumeFzh, m.capacity)) ? [DIAGRAMM_HINWEIS] : []),
    WARTEZEIT_HINWEIS,
    SN022_GRENZEN,
    'Die Ergebnisse ersetzen keine Überprüfung durch eine Fachperson.',
  ]

  return (
    <BerichtRahmen dokumentTitel={`KnotenCheck – SN 640 022${cfg.name ? ' – ' + cfg.name : ''}`} onClose={onClose}>
      <BerichtKopf
        titel="Leistungsfähigkeit eines Knotens ohne Lichtsignalanlage"
        angaben={<>
          <b>Bezeichnung:</b> {cfg.name || '—'} · <b>Knotentyp:</b> {is3 ? 'Einmündung (3-armig)' : 'Kreuzung (4-armig)'}<br />
          <b>Hauptstrasse:</b> Arm A{cfg.arms[0]?.streetName ? ` (${cfg.arms[0].streetName})` : ''}, Arm C{cfg.arms[1]?.streetName ? ` (${cfg.arms[1].streetName})` : ''} ·{' '}
          <b>Nebenstrasse:</b> Arm B{cfg.arms[2]?.streetName ? ` (${cfg.arms[2].streetName})` : ''}
          {!is3 && <>, Arm D{cfg.arms[3]?.streetName ? ` (${cfg.arms[3].streetName})` : ''}</>}
        </>}
        norm="SN 640 022 «Leistungsfähigkeit, Verkehrsqualität, Belastbarkeit; Knoten ohne Lichtsignalanlage» (VSS, Mai 1999)"
        karte={karte} />

      {/* ── Ergebnis ───────────────────────────────────────────────────────── */}
      <Abschnitt titel="Ergebnis">
        <div className="bericht-zwei">
          <div>
            <Gesamtergebnis stufe={overall} farbe={overall ? LOS_BG[overall] : undefined}
              text={overall ? <>Qualitätsstufe {overall}: schlechtester belasteter Strom bzw. Mischstreifen</> : 'Ohne Verkehr gibt es nichts zu beurteilen.'} />
          </div>
          {knotenbild && <div className="bericht-bild">{knotenbild}</div>}
        </div>
        <h3>Verkehrsqualität je Strom und Mischstreifen</h3>
        <table style={T}>
          <thead>
            <tr>
              <th style={THC}>Strom / Arm</th>
              <th style={THC}>Belastungsreserve R [PWE/h]</th>
              <th style={THC}>Leistungsfähigkeit L [PWE/h]</th>
              <th style={THC}>Mittl. Wartezeit w [s]</th>
              <th style={THC}>Qualitätsstufe</th>
              <th style={TH}>Vergleich mit 45 s (Stufe D, wie in den Beispielen der Norm)</th>
            </tr>
          </thead>
          <tbody>
            {result.streams.map((s, i) => {
              const rOk = s.reserve >= 0
              return (
                <tr key={s.id} style={{ background: i % 2 === 0 ? '#f8f8f8' : '#fff' }}>
                  <td style={TDC}>{s.streamNumber} &nbsp;<span style={{ color:'#666', fontSize:10 }}>({s.name})</span></td>
                  <td style={{ ...TDR, color: rOk ? '#166534' : '#991b1b', fontWeight: rOk ? 400 : 700 }}>{nr(s.reserve)}</td>
                  <td style={TDR}>{nr(s.capacity)}</td>
                  <td style={TDR}>{s.volumePWE > 0 ? wStr(s.delay) : '–'}{ausserhalbAbb4(s.volumePWE, s.capacity) ? '*' : ''}</td>
                  {s.volumePWE > 0
                    ? <td style={{ ...TDC, background: LOS_BG[s.levelOfService], fontWeight: 700 }}>{s.levelOfService}</td>
                    : <td style={TDC}>–</td>}
                  <td style={{ ...TD, fontSize: 10 }}>{s.volumePWE > 0 ? losVergleich(s.levelOfService, s.delay) : 'kein Verkehr'}</td>
                </tr>
              )
            })}
            {result.mixedLanes.map((m, i) => {
              const rOk = m.reserve >= 0
              const bg = (result.streams.length + i) % 2 === 0 ? '#f8f8f8' : '#fff'
              return (
                <tr key={m.id} style={{ background: bg }}>
                  <td style={TD}><em>{m.name}</em></td>
                  <td style={{ ...TDR, color: rOk ? '#166534' : '#991b1b', fontWeight: rOk ? 400 : 700 }}>{nr(m.reserve)}</td>
                  <td style={TDR}>{nr(m.capacity)}</td>
                  <td style={TDR}>{m.volumeFzh > 0 ? wStr(m.delay) : '–'}{ausserhalbAbb4(m.volumeFzh, m.capacity) ? '*' : ''}</td>
                  {m.volumeFzh > 0
                    ? <td style={{ ...TDC, background: LOS_BG[m.levelOfService], fontWeight: 700 }}>{m.levelOfService}</td>
                    : <td style={TDC}>–</td>}
                  <td style={{ ...TD, fontSize: 10 }}>{m.volumeFzh > 0 ? losVergleich(m.levelOfService, m.delay) : 'kein Verkehr'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Abschnitt>

      {/* ── Rechenschritte ─────────────────────────────────────────────────── */}
      <Abschnitt titel="Rechenschritte nach SN 640 022">
        <h3>Stromschema (Abb. 1)</h3>
        <div className="bl-diagram" style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
          <img src={is3 ? einmuendungSvg : kreuzungSvg} alt={is3 ? 'Stromschema Einmündung' : 'Stromschema Kreuzung'} style={{ height: 180, width: 'auto' }} />
        </div>

        <h3>Knotengeometrie</h3>
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
                  <td style={TDC}>{arm.gradient}</td>
                  <td style={{ ...TD, fontSize: 10 }}>{streamNote(sd, arm, armIdx)}</td>
                </tr>
              ))
            })}
          </tbody>
        </table>

        <h3>Knotenbelastungen</h3>
        {hasFall2 ? <BelastungenFall2 cfg={cfg} armOrder={armOrder} /> : <BelastungenFall1 cfg={cfg} armOrder={armOrder} />}

        <h3>Grundleistungsfähigkeit</h3>
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
            {result.streams.map((s, i) => (
              <tr key={s.id} style={{ background: i % 2 === 0 ? '#f8f8f8' : '#fff' }}>
                <td style={TDC}><strong>{s.streamNumber}</strong></td>
                <td style={TDR}>{nr(streamFzh(s.streamNumber, cfg))}</td>
                <td style={TDR}>{n1(s.volumePWE)}</td>
                <td style={TDR}>{n1(s.qpi)}</td>
                <td style={TDR}><strong>{nr(s.basicCapacity)}</strong>{ausserhalbAbb2(s.qpi) ? '*' : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {rang2.length > 0 && <><h3>Leistungsfähigkeit der zweitrangigen Ströme</h3><LFTable streams={rang2} px={result.px} /></>}
        {rang3.length > 0 && <><h3>Leistungsfähigkeit der drittrangigen Ströme</h3><LFTable streams={rang3} /></>}
        {rang4.length > 0 && <><h3>Leistungsfähigkeit der viertrangigen Ströme</h3><LFTable streams={rang4} /></>}

        {result.mixedLanes.length > 0 && <>
          <h3>Leistungsfähigkeit des Mischstromes</h3>
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

        <div style={{ fontSize: 10, color: '#555', lineHeight: 1.6 }}>
          <div>¹⁾ q₃ bzw. q₉ nicht berücksichtigen, wenn separater Streifen für Rechtsabbieger vorhanden (Fn 1).</div>
          <div>²⁾ Bei mehr als einem Streifen gilt Belastung auf dem rechten Fahrstreifen (Fn 2).</div>
          <div>³⁾ q₃ und q₉ nicht berücksichtigen, wenn Dreiecksinsel vorhanden und mit Kein Vortritt oder Stop belastet (Fn 3).</div>
          <div>⁴⁾ q₆ und q₁₂ entfallen, wenn durch Dreiecksinsel getrennt und mit Kein Vortritt oder Stop belastet (Fn 4).</div>
        </div>
      </Abschnitt>

      {/* ── Eingaben ───────────────────────────────────────────────────────── */}
      <Abschnitt titel="Eingaben">
        <table style={T}>
          <thead>
            <tr>
              <th style={TH}>Arm</th>
              <th style={TH}>Strasse</th>
              <th style={THC}>links [Fz/h]</th>
              <th style={THC}>geradeaus [Fz/h]</th>
              <th style={THC}>rechts [Fz/h]</th>
              <th style={THC}>Fahrzeugarten</th>
              <th style={THC}>Längsneigung</th>
              <th style={TH}>Bauliche Merkmale</th>
            </tr>
          </thead>
          <tbody>
            {armOrder.map((armIdx, i) => {
              const arm = cfg.arms[armIdx], u = uebernahme?.arme[armIdx], hs = armIdx < 2
              const merkmale = hs
                ? [arm.hasSeparateTurnLane && 'Rechtsabbiegestreifen', arm.hasRightTurnTriangleIsland && 'Dreiecksinsel',
                   arm.hasLeftTurnLane && 'Linksabbiegestreifen', arm.rightLaneVolume !== undefined && `mehrstreifig, rechter Fahrstreifen ${arm.rightLaneVolume} Fz/h`]
                : [arm.mixedLaneCombination && `Fahrstreifen: ${MISCH_TEXT[arm.mixedLaneCombination]}`, arm.hasRightTurnTriangleIsland && 'Dreiecksinsel']
              return (
                <tr key={arm.id} style={{ background: i % 2 === 0 ? '#f8f8f8' : '#fff' }}>
                  <td style={TD}>{armLabel(armIdx)}</td>
                  <td style={TD}>{arm.streetName || '—'}<Herkunft art={merke(kartenHerkunft(u?.name, arm.streetName))} /></td>
                  {RICHTUNG.map(([r]) => is3 && OHNE_3[armIdx] === r
                    ? <td key={r} style={TDC}>–</td>
                    : <td key={r} style={TDR}>{arm[VOLUMEN[r]]}<Herkunft art={merke(schaetzArt(schaetzung?.stroeme[armIdx], r, arm[VOLUMEN[r]]) ?? stromHerkunft(uebernahme, armIdx, r, arm[VOLUMEN[r]]))} /></td>)}
                  <td style={TDC}>{arm.vehicleMix
                    ? <>Fall 2: LW {arm.vehicleMix.pctLW} %, LZ {arm.vehicleMix.pctLZ} %, MR {arm.vehicleMix.pctMR} %, FR {arm.vehicleMix.pctFR} %<Herkunft art={merke(svHerkunft(uebernahme, armIdx, arm.vehicleMix.pctLW, arm.vehicleMix.pctLZ))} /></>
                    : 'Fall 1'}</td>
                  <td style={TDC}>{arm.gradient ?? '—'}<Herkunft art={merke(kartenHerkunft(u?.neigung, arm.gradient))} /></td>
                  <td style={{ ...TD, fontSize: 10 }}>{merkmale.filter(Boolean).join(', ') || '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <HerkunftLegende arten={herkunft} unbekannt={!!karte && !karte.herkunft} />
      </Abschnitt>

      <HinweisListe hinweise={hinweise} />
      <QuellenAbschnitt normen={GRUNDLAGEN.sn022} daten={karte?.quellen ?? []} />
    </BerichtRahmen>
  )
}

const MISCH_TEXT = { all: 'alle Ströme auf einem Streifen', leftAndThrough: 'links und kreuzen gemeinsam, rechts eigener Streifen',
  throughAndRight: 'kreuzen und rechts gemeinsam, links eigener Streifen' } as const

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
          const f     = armFactor(arm) ?? 1
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
          const f     = armFactor(arm) ?? 1
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

function LFTable({ streams, px }: { streams: SN640022StreamResult[]
  /** p_x der Kreuzung: steht unter der Tabelle der zweitrangigen Ströme, wie im Normbeispiel (S. 13) */
  px?: number }) {
  // p0,i* steht nur da, wenn ein Linksabbiegestreifen fehlt (Ziff. 14, S. 7–8); p_y und p_z nur bei den Strömen 5 und 11 der Kreuzung
  const showStar = streams.some(s => s.p0Star !== undefined)
  const showPy = streams.some(s => s.py !== undefined)
  return (
    <>
    <table style={T}>
      <thead>
        <tr>
          <th style={THC}>Strom</th>
          <th style={THC}>Leistungsfähigkeit L<sub>i</sub> [PWE/h]</th>
          <th style={THC}>Auslastungsgrad a<sub>i</sub></th>
          <th style={THC}>Wahrscheinlichkeit Staufreiheit p<sub>0,i</sub></th>
          {showStar && <th style={THC}>p<sub>0,i</sub>* (Rückstau Hauptstrasse)</th>}
          {showPy && <th style={THC}>p<sub>y,i</sub> [F17]</th>}
          {showPy && <th style={THC}>p<sub>z,i</sub> [F18]</th>}
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
              {showStar && <td style={TDR}>{s.p0Star !== undefined ? n3(s.p0Star) : '—'}</td>}
              {showPy && <td style={TDR}>{s.py !== undefined ? n3(s.py) : '—'}</td>}
              {showPy && <td style={TDR}>{s.pz !== undefined ? n3(s.pz) : '—'}</td>}
            </tr>
          )
        })}
      </tbody>
    </table>
    {px !== undefined && <p className="bericht-unter">p<sub>x</sub> = p<sub>0,1</sub> · p<sub>0,7</sub> = {n3(px)} [F14], Seite 6{showStar ? '; wo der Linksabbiegestreifen fehlt, mit p₀* statt p₀ (Ziffer 14, Seiten 7–8)' : ''}.
      Damit L<sub>5</sub> = p<sub>x</sub> · G<sub>5</sub> und L<sub>11</sub> = p<sub>x</sub> · G<sub>11</sub> [F15, F16]; L<sub>4</sub> = p<sub>z,11</sub> · p<sub>0,12</sub> · G<sub>4</sub> und L<sub>10</sub> = p<sub>z,5</sub> · p<sub>0,6</sub> · G<sub>10</sub> [F19, F20].</p>}
    </>
  )
}
