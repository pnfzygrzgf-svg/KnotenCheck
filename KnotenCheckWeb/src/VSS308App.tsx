import { useState, useMemo, useCallback, type CSSProperties, type ReactNode } from 'react'
import UebernahmeHinweis from './karte/UebernahmeHinweis'
import BelastungsVergleich from './karte/BelastungsVergleich'
import { querschnitteKnoten } from './karte/vergleich'
import { bestaetigtLesen, herkunftAus, kartenBezugAus, kartenBezugLesen, offeneModellAngaben, type KartenBezug, type KnotenUebernahme, type UebernahmeArm } from './karte/rechner'
import ModellLuecken from './karte/ModellLuecken'
import { createPortal } from 'react-dom'
import { calculateVSS308, normalizeArm308 } from './engine/vss2011308Calculator'
import { conformFixed, oneOf, wahl } from './engine/conform'
import { offenVss308 } from './engine/offeneAngaben'
import type { ArmInput, ArmResult, StreamResult, LevelOfService, RoadType } from './engine/vss2011308Calculator'
import { QUERUNG_ERGEBNIS, QUERUNG_LABEL, resolveQuerung, type Querung } from './engine/querung'
import rechtsvorttrittSvg from './assets/rechtsvortritt.svg'
import { KnotenDiagramm, type StreamKey, type Los } from './KnotenDiagramm'
import { exportTool, importTool } from './saveLoad'
import { useIsActiveModule } from './activeModule'
import { HilfeUnten, SoFunktionierts, type LegendItem } from './Hilfe'
import { Meldung } from './Meldung'
import { LOS_BG, LOS_COLOR, delayText, utilizationColor } from './uiHelpers'
import { useMeldung } from './useMeldung'
import { LeereWahl, LOSBadge, NumInput, OffeneAngaben, Row, SectionLabel, BerichtKnopf } from './ui'
import { RechnerFuss } from './Fusszeile'
import { Abschnitt, BerichtKopf, BerichtRahmen, Gesamtergebnis, Herkunft, HerkunftLegende, HinweisListe, QuellenAbschnitt } from './bericht/Bericht'
import { kartenHerkunft, schaetzArt, stromArt, stromHerkunft, type HerkunftArt } from './bericht/herkunft'
import type { ArmStroeme } from './engine/armmengen'
import ArmmengenSchaetzung from './schaetzung/ArmmengenSchaetzung'
import { schaetzungGilt, schaetzungLesen, type Schaetzung } from './schaetzung/schaetzung'
import { HerkunftMarke } from './HerkunftMarke'
import { GRUNDLAGEN } from './hilfeTexte'

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

// Leerer Arm: Querung und Gruppengrösse bleiben offen, bis sie gewählt sind
function defaultArm(roadType: RoadType): ArmInput {
  return { name: '', roadType, right: 0, straight: 0, left: 0, fg: 0, mittelinsel: false }
}

function defaultArms(nodeType: NodeType): ArmInput[] {
  if (nodeType === '3arm') return [
    defaultArm('HS'),   // A
    defaultArm('HS'),   // C
    defaultArm('NS'),   // B
  ]
  if (nodeType === 'equal') return [
    defaultArm('equal'),  // A
    defaultArm('equal'),  // C
    defaultArm('equal'),  // B
    defaultArm('equal'),  // D
  ]
  return [
    defaultArm('HS'),   // A
    defaultArm('HS'),   // C
    defaultArm('NS'),   // B
    defaultArm('NS'),   // D
  ]
}

// ── ArmCard ───────────────────────────────────────────────────────────────────

function ArmCard({ arm, index, nodeType, result, onChange, herkunft, schaetzung }: {
  arm: ArmInput
  index: number
  nodeType: NodeType
  result?: ArmResult
  onChange: (a: ArmInput) => void
  /** Arm der Kartenübernahme (gleicher Index); Marken zeigen, welche Werte noch übernommen sind */
  herkunft?: UebernahmeArm
  /** Aus Armmengen geschätzte Ströme dieses Arms */
  schaetzung?: ArmStroeme
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

  // Querung: an NS-Armen auch Trottoirüberfahrt (gerechnet wie Fussgängerstreifen)
  const isNS     = arm.roadType === 'NS'
  const querung  = arm.querung === undefined ? null : resolveQuerung(arm.querung, arm.fg > 0, isNS)
  const isTUe    = querung === 'trottoirueberfahrt'
  const querungOptionen: Querung[] = isNS ? ['keine', 'fgs', 'trottoirueberfahrt'] : ['keine', 'fgs']
  const setQuerung = (q: Querung) => onChange({
    ...arm,
    querung: q,
    fg: q === 'keine' ? 0 : arm.fg,
    mittelinsel: q === 'trottoirueberfahrt' ? false : arm.mittelinsel,
  })

  // Querung und Mittelinsel gelten als übernommen, solange der Fussgängerstreifen aus der Karte noch gewählt ist
  const fgsAusKarte = !!herkunft?.fgs && arm.querung === 'fgs'
  const inselAusKarte = fgsAusKarte && !!arm.mittelinsel === herkunft?.fgs?.insel

  const qTotal = (isHSA3 ? 0 : arm.left) + (isNSB3 ? 0 : arm.straight) + (isHSC3 ? 0 : arm.right)

  return (
    <div style={{ background: '#fff', borderRadius: 12, border: `1.5px solid ${bd}`,
                  overflow: 'hidden', boxShadow: '0 1px 4px #0001' }}>
      {/* Header */}
      <div style={{ background: bg, borderBottom: `1px solid ${bd}`, padding: '10px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <span style={{ fontWeight: 800, fontSize: 15, color: col,
                         background: '#fff', border: `1.5px solid ${bd}`,
                         borderRadius: 6, minWidth: 28, textAlign: 'center', padding: '1px 6px' }}>
            {lbl}
          </span>
          <span style={{ fontSize: 12, color: col, fontWeight: 600, opacity: 0.7 }}>
            {isHS ? 'Hauptstrasse (HS)' : isEqual ? 'Gleicher Rang' : 'Nebenstrasse (NS)'}
          </span>
        </div>
        {arm.name && kartenHerkunft(herkunft?.name, arm.name) && <div style={{ fontSize: 12, marginBottom: 4 }}>Strassenname<HerkunftMarke art="K" /></div>}
        <input
          type="text" placeholder="Strassenname (optional)"
          value={arm.name}
          onChange={e => upd('name', e.target.value)}
          style={{ width: '100%', border: `1px solid ${bd}`, background: '#fff', fontSize: 14,
                   fontWeight: 600, color: col, outline: 'none', borderRadius: 5,
                   padding: '4px 8px', boxSizing: 'border-box' }}
        />
      </div>

      {/* Abbiegeströme */}
      <SectionLabel title="Abbiegeströme [Fz/h]" />
      {!isHSA3 && (
        <Row label="Linksabbiegen">
          <HerkunftMarke art={schaetzArt(schaetzung, 'left', arm.left) ?? stromArt(herkunft, 'left', arm.left)} />
          <NumInput live value={arm.left} onChange={v => upd('left', v)} />
        </Row>
      )}
      {!isNSB3 && (
        <Row label="Geradeaus">
          <HerkunftMarke art={schaetzArt(schaetzung, 'straight', arm.straight) ?? stromArt(herkunft, 'straight', arm.straight)} />
          <NumInput live value={arm.straight} onChange={v => upd('straight', v)} />
        </Row>
      )}
      {!isHSC3 && (
        <Row label="Rechtsabbiegen">
          <HerkunftMarke art={schaetzArt(schaetzung, 'right', arm.right) ?? stromArt(herkunft, 'right', arm.right)} />
          <NumInput live value={arm.right} onChange={v => upd('right', v)} />
        </Row>
      )}

      {/* Fussgänger*innen */}
      <SectionLabel title="Fussgänger*innen" />
      <Row label="Querung" sub="an dieser Einfahrt">
        <HerkunftMarke art={fgsAusKarte ? 'K' : null} />
        <select
          value={querung ?? ''}
          onChange={e => setQuerung(e.target.value as Querung)}
          style={{ fontSize: 12, padding: '4px 6px', borderRadius: 4,
                   border: '1px solid var(--border)', cursor: 'pointer', color: 'var(--text)' }}
        >
          {querung === null && <LeereWahl />}
          {querungOptionen.map(q => (
            <option key={q} value={q}>{QUERUNG_LABEL[q]}</option>
          ))}
        </select>
      </Row>
      {querung !== null && querung !== 'keine' && (
        <>
          <Row label={isTUe ? 'Fussgänger*innen auf der Trottoirüberfahrt' : 'Fussgängervolumen'} sub="[Fg/h]">
            <NumInput live value={arm.fg} onChange={v => upd('fg', v)} />
          </Row>
          {isTUe && (
            <div className="hinweis klein" style={{ margin: '2px 14px 8px' }}>
              <strong>Trottoirüberfahrt:</strong> Fussgänger*innen
              haben Vortritt (VRV Art. 41 Abs. 2). Gerechnet wie ein Fussgängerstreifen über die
              Nebenstrasse – Annahme, VSS 2011/308 kennt die Trottoirüberfahrt nicht.
            </div>
          )}
          {!isTUe && (
            <Row label="Mittelinsel am Fussgängerstreifen" sub="Art. 47 Abs. 3 VRV">
              <HerkunftMarke art={inselAusKarte ? 'K' : null} />
              <input type="checkbox" checked={arm.mittelinsel ?? false}
                onChange={e => upd('mittelinsel', e.target.checked)}
                style={{ width: 16, height: 16, cursor: 'pointer', accentColor: '#1e3a5f' }}
              />
            </Row>
          )}
          {!isTUe && arm.mittelinsel && (
            <div className="hinweis klein" style={{ margin: '2px 14px 8px' }}>
              <strong style={{ display: 'block', marginBottom: 3 }}>
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
              der Fg auf beide Hälften unbekannt ist, wird als Näherung{' '}
              <strong>Q_Fg / 2 = {arm.fg / 2} Fg/h</strong> als wirksames Volumen eingesetzt.
              <br /><br />
              <strong style={{ color: '#78350f' }}>Aktivieren wenn:</strong> Eine physische Insel
              den Fussgängerstreifen sichtbar in zwei Hälften teilt, sodass Fussgänger*innen
              in zwei Etappen queren können.
            </div>
          )}
          <div style={{ padding: '8px 14px', borderBottom: '1px solid var(--kachel-rand)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between',
                          alignItems: 'center', marginBottom: 5 }}>
              <span style={{ fontSize: 14, color: 'var(--text)' }}>Gruppengrösse ρ</span>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {!isTUe && arm.mittelinsel
                  ? `Q wirksam = ${arm.fg}/2 = ${arm.fg / 2} Fg/h · S_Fg = ${arm.rho ? 900 * arm.rho : '–'} Fg/h`
                  : `S_Fg = 900 × ${arm.rho ?? '–'} = ${arm.rho ? 900 * arm.rho : '–'} Fg/h`}
              </span>
            </div>
            <select
              value={arm.rho ?? ''}
              onChange={e => upd('rho', Number(e.target.value))}
              style={{ width: '100%', fontSize: 12, padding: '4px 6px', borderRadius: 4,
                       border: '1px solid var(--border)', cursor: 'pointer', color: 'var(--text)',
                       boxSizing: 'border-box' }}
            >
              {arm.rho === undefined && <LeereWahl />}
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
                        fontSize: 12, color: '#075985', lineHeight: 1.65 }}>
            <strong style={{ color: '#0c4a6e', display: 'block', marginBottom: 3 }}>
              Warum ρ (rho)?
            </strong>
            Mehrere Fussgänger*innen, die gemeinsam queren, blockieren ein Fahrzeug genauso lang wie
            ein Einzelner — das Ereignis ist aber seltener, weil eine Gruppe als ein
            einziges Ereignis zählt. Daher steigt der Sättigungsfluss proportional:{' '}
            <strong>S_Fg = 900 · ρ</strong> [Fg/h] (Gl. 4, S. 36; Tab. 9, S. 37, VSS 2011/308).
            <br />
            Je höher ρ → desto grösser S_Fg → desto kleiner y_Fg = Q / S_Fg → desto
            kleiner die Kapazitätsreduktion β = (1 − y_Fg)³ → desto mehr Kapazität
            bleibt für Fahrzeuge.
            <br /><br />
            <strong style={{ color: '#0c4a6e' }}>Wie bestimmen?</strong> ρ wird vor Ort
            beobachtet: wie viele Fg queren im Schnitt gleichzeitig? Annahme als Richtwert:
            ρ = 1 Wohngebiet · ρ = 2–3 Innenstadt · ρ = 4–5 stark belebte Lagen; der Bericht
            nennt keine Lagen, nur Anzahl, ρ und S (Tab. 9, S. 37). Bei Unsicherheit: ρ = 1
            wählen (konservativ, kleinste Kapazität).
          </div>
        </>
      )}

      {/* Abgeleitete Werte */}
      {result && (
        <>
          <SectionLabel title="Abgeleitete Werte" />
          <Row label="Q total" sub="[Fz/h]">
            <span style={{ fontSize: 14, color: 'var(--text)', minWidth: 60, textAlign: 'right' }}>
              {qTotal}
            </span>
          </Row>
          <Row label="β" sub="Reduktionsfaktor">
            <span style={{ fontSize: 14, color: 'var(--text)', minWidth: 60, textAlign: 'right' }}>
              {result.beta.toFixed(3)}
            </span>
          </Row>
          <Row label="L (Kapazität)" sub="[Fz/h]">
            <span style={{ fontSize: 14, color: 'var(--text)', minWidth: 60, textAlign: 'right' }}>
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
        {res.qFz > 0
          ? <LOSBadge los={res.levelOfService} />
          : <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 'auto' }}>kein Verkehr</span>}
      </div>
      {res.querung !== 'keine' && (
        <div style={{ padding: '4px 12px', fontSize: 12, color: 'var(--text-muted)', background: '#fff',
                      borderBottom: '1px solid var(--kachel-rand)' }}>
          Querung: {QUERUNG_ERGEBNIS[res.querung]}
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', fontSize: 12,
                    color: 'var(--text)', background: '#fff' }}>
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
          <div key={String(label)} style={{ padding: '4px 10px', borderBottom: '1px solid var(--kachel-rand)',
                          borderRight: '1px solid var(--kachel-rand)' }}>
            <span style={{ color: 'var(--text-muted)', marginRight: 6 }}>{label}</span>
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
      <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.06em',
                    color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>
        Ströme
      </div>
      <div style={{ borderRadius: 6, border: '1px solid var(--kachel-rand)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: '#f9fafb' }}>
              {['Strom', 'Q', 'β', 'L', 'x', 'w', 'LOS'].map(h => (
                <th key={h} style={{
                  padding: '4px 7px', textAlign: h === 'Strom' ? 'left' : 'right',
                  borderBottom: '1px solid var(--kachel-rand)', color: 'var(--text-muted)', fontWeight: 700,
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
                <tr key={s.id} style={{ borderBottom: '1px solid var(--kachel-rand)' }}>
                  <td style={{ padding: '3px 7px', fontWeight: 700, color: col }}>
                    {s.id}{s.scenario === 'II' && <span title="Szenario II: paralleler Fg-Strom blockiert den Konfliktverkehr (Gl. 6)" style={{ marginLeft: 4, fontSize: 12, color: '#16a34a', fontWeight: 600 }}>Sz II</span>}
                  </td>
                  <td style={{ padding: '3px 7px', textAlign: 'right', color: 'var(--text)' }}>{s.Q}</td>
                  <td style={{ padding: '3px 7px', textAlign: 'right', color: 'var(--text)' }}>{s.beta.toFixed(3)}</td>
                  <td style={{ padding: '3px 7px', textAlign: 'right', color: 'var(--text)' }}>{Math.round(s.capacity)}</td>
                  <td style={{ padding: '3px 7px', textAlign: 'right' }}>
                    <span style={{ color: utilizationColor(s.utilizationDegree), fontWeight: 600 }}>
                      {isFinite(s.utilizationDegree) ? s.utilizationDegree.toFixed(2) : '>1'}
                    </span>
                  </td>
                  <td style={{ padding: '3px 7px', textAlign: 'right', color: 'var(--text)' }}>{delayText(s.delay)}</td>
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
// Gerüst wie in den Berichten der anderen Rechner: Ort, Ergebnis, Rechenschritte, Eingaben, Annahmen und Hinweise, Quellen

const NODE_TYPE_LABEL: Record<NodeType, string> = {
  '3arm':  'Einmündung (T-Knoten, 3 Arme)',
  '4arm':  'Kreuzung (4 Arme)',
  'equal': 'Gleicher Rang — Rechtsvortritt (4 Arme)',
}

// Beurteilung nach SN 640 022, Tab. 3 (S. 10)
const LOS_DESC: Record<LevelOfService, string> = {
  A: 'Sehr gut — ausgezeichnete Verkehrsqualität',
  B: 'Sehr gut — gute Verkehrsbedingungen',
  C: 'Gut — befriedigende Qualität',
  D: 'Ausreichend',
  E: 'Kritisch — mangelhafte Qualität',
  F: 'Überlastung — völlig ungenügender Zustand',
}

const BL_TH: CSSProperties = {
  padding: '3px 6px', border: '1px solid #bbb', background: '#ececec',
  fontSize: 9, fontWeight: 700, textAlign: 'right', whiteSpace: 'nowrap',
}
const BL_THL: CSSProperties = { ...BL_TH, textAlign: 'left' }
const BL_TD: CSSProperties  = { padding: '3px 6px', border: '1px solid #ddd', fontSize: 10, textAlign: 'right' }
const BL_TDL: CSSProperties = { ...BL_TD, textAlign: 'left' }
const BL_T: CSSProperties = { width: '100%', borderCollapse: 'collapse', marginBottom: 12 }

const roadLabel = (rt: RoadType) => rt === 'HS' ? 'HS' : rt === 'NS' ? 'NS' : 'Gleich'
const xFarbe = (x: number) => x >= 1 ? '#b91c1c' : x >= 0.9 ? '#c2410c' : '#374151'

// Im 3-Arm gibt es A-links, C-rechts und B-geradeaus nicht (Reihenfolge des Rechners: A, C, B)
const OHNE_3: Record<number, 'left' | 'straight' | 'right'> = { 0: 'left', 1: 'right', 2: 'straight' }
const RICHTUNGEN = ['left', 'straight', 'right'] as const

export function Bewertungsblatt308({ nodeName, nodeType, arms, result, onClose, karte, uebernahme, schaetzung, knotenbild }: {
  nodeName: string
  nodeType: NodeType
  arms: ArmInput[]
  result: ReturnType<typeof calculateVSS308>
  onClose: () => void
  karte?: KartenBezug | null
  /** Vorbelegung aus der Karte; Arme in derselben Reihenfolge wie im Rechner (armsAus) */
  uebernahme?: KnotenUebernahme
  schaetzung?: Schaetzung | null
  knotenbild?: ReactNode
}) {
  const overall = result.overallLevelOfService
  const noTraffic = result.arms.every(a => a.qFz <= 0)
  const losRank = ['A','B','C','D','E','F']
  const worstArm = result.arms.reduce((w, r) =>
    losRank.indexOf(r.levelOfService) > losRank.indexOf(w.levelOfService) ? r : w,
    result.arms[0])
  const visibleStreams = result.streams.filter(s => s.Q > 0 && s.toArmIndex >= 0)
  const normArms = arms.map(normalizeArm308)
  const is3 = nodeType === '3arm'
  const mitFg = normArms.some(a => a.querung !== 'keine')
  const herkunft: (HerkunftArt | null)[] = []
  const merke = (h: HerkunftArt | null) => { herkunft.push(h); return h }
  const armName = (i: number) => `Arm ${armLabel(i)}${arms[i]?.name ? ` (${arms[i].name})` : ''}`

  const hinweise: ReactNode[] = [
    ...(karte?.belegt ?? []),
    ...(schaetzung && schaetzungGilt(schaetzung, arms) ? [schaetzung.text] : []),
    <><b>Annahme Einfahrten:</b> Jede Einfahrt gilt als Mischstreifen (analog SN 640 022, Ziff. 13, S. 7): x = Σ Q/L, L = ΣQ/x; nur β ist volumengewichtet. Der Arm rechnet mit C = 1, sobald ein belasteter Strom nachrangig ist, zum Beispiel ein Linksabbieger der Hauptstrasse: C = 0,5 setzt eine feste Bedienzeit voraus (VSS 2011/308, Ziffer 4.2, Seite 51).</>,
    ...(normArms.some(a => a.querung === 'trottoirueberfahrt') ? [<><b>Annahme Trottoirüberfahrt:</b> Fussgänger*innen haben Vortritt
      (VRV Art. 41 Abs. 2). Gerechnet wie ein Fussgängerstreifen über die Nebenstrasse (ohne Mittelinsel), VSS 2011/308 kennt die
      Trottoirüberfahrt nicht.</>] : []),
    ...(normArms.some(a => a.querung !== 'keine' && a.mittelinsel) ? [<><b>Annahme Mittelinsel:</b> Eine Mittelinsel teilt den Fussgängerstreifen in
      zwei selbständige Teile (Art. 47 Abs. 3 VRV). Weil die Verteilung auf beide Hälften unbekannt ist, wirkt die Hälfte der
      Fussgänger*innen (Q_Fg / 2).</>] : []),
    'Der Rechner ist eine Beta-Fassung: Resultate mit Vorsicht verwenden.',
    'Die Ergebnisse ersetzen keine Überprüfung durch eine Fachperson.',
  ]

  return (
    <BerichtRahmen dokumentTitel={`KnotenCheck – VSS 2011/308${nodeName ? ' – ' + nodeName : ''}`} onClose={onClose}>
      <BerichtKopf
        titel="Bewertungsblatt Ungesteuerter Knoten"
        angaben={<>
          <b>Bezeichnung:</b> {nodeName || '—'} · <b>Knotentyp:</b> {NODE_TYPE_LABEL[nodeType]}<br />
          <b>Hauptstrasse:</b> {armName(0)}, {armName(1)} · <b>Nebenstrasse:</b> {armName(2)}{!is3 && <>, {armName(3)}</>}
        </>}
        norm="VSS 2011/308 «Verkehrsablauf an ungesteuerten Knoten innerorts» (Menendez/Guler/Puffe, 2015) und VSS 2008/301 «Verkehrsqualität und Leistungsfähigkeit von komplexen ungesteuerten Knoten: Analytisches Schätzverfahren» (2009)"
        karte={karte} />

      {/* ── Ergebnis ───────────────────────────────────────────────────────── */}
      <Abschnitt titel="Ergebnis">
        <div className="bericht-zwei">
          <div>
            <Gesamtergebnis stufe={noTraffic ? null : overall} farbe={noTraffic ? undefined : LOS_BG[overall]}
              text={noTraffic ? 'Gesamtbeurteilung: keine (kein Verkehr)' : <>
                <b>Qualitätsstufe {overall}:</b> {LOS_DESC[overall]}<br />
                Massgebender Arm: {armLabel(worstArm.armIndex)}{worstArm.name ? ` — ${worstArm.name}` : ''}
                {' '}(LOS {worstArm.levelOfService}{isFinite(worstArm.delay) ? `, ca. ${Math.round(worstArm.delay)} s` : ', Überlast'})
              </>} />
          </div>
          {knotenbild && <div className="bericht-bild">{knotenbild}</div>}
        </div>

        <h3>Einfahrten (Arm als Mischstreifen)</h3>
        <table style={BL_T}>
          <thead>
            <tr>
              <th style={BL_THL}>Arm</th>
              <th style={BL_TH}>Q<br/>[Fz/h]</th>
              <th style={BL_TH}>S<br/>[Fz/h]</th>
              <th style={BL_TH}>β</th>
              <th style={BL_TH}>L<br/>[Fz/h]</th>
              <th style={BL_TH}>x</th>
              <th style={BL_TH}>w<br/>[s]</th>
              <th style={BL_TH}>k<br/>[Fz]</th>
              <th style={{ ...BL_TH, textAlign: 'center' }}>LOS</th>
            </tr>
          </thead>
          <tbody>
            {result.arms.map((r, i) => (
              <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#f7f7f7' }}>
                <td style={BL_TDL}><strong>{armLabel(r.armIndex)}</strong>{r.name ? ` — ${r.name}` : ''}</td>
                <td style={BL_TD}>{r.qFz}</td>
                <td style={BL_TD}>{r.saturation}</td>
                <td style={BL_TD}>{r.beta.toFixed(3)}</td>
                <td style={BL_TD}>{Math.round(r.capacity)}</td>
                <td style={{ ...BL_TD, fontWeight: 600, color: xFarbe(r.utilizationDegree) }}>
                  {isFinite(r.utilizationDegree) ? r.utilizationDegree.toFixed(2) : '> 1'}
                </td>
                <td style={BL_TD}>{isFinite(r.delay) ? `ca. ${Math.round(r.delay)} s` : '> 999 s'}</td>
                <td style={BL_TD}>{isFinite(r.queue) ? r.queue.toFixed(1) : '—'}</td>
                <td style={{ ...BL_TD, textAlign: 'center', fontWeight: 800,
                             background: LOS_BG[r.levelOfService], color: LOS_COLOR[r.levelOfService] }}>
                  {r.levelOfService}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {result.arms.some(r => !isFinite(r.delay)) && (
          <div style={{ marginBottom: 12, padding: '6px 10px', borderRadius: 3,
                        background: '#fef2f2', border: '1px solid #fca5a5',
                        fontSize: 10, color: '#7f1d1d', lineHeight: 1.6 }}>
            <strong>Überlast (x ≥ 1) — Wartezeit nicht berechenbar:</strong>
            {' '}Die Formel (Gl. 1) gilt nur für ungesättigte Zustände (x &lt; 1).
            Einfahrten mit x ≥ 1 sind methodisch nicht auswertbar (VSS 2011/308, S. 87).
          </div>
        )}
      </Abschnitt>

      {/* ── Rechenschritte ─────────────────────────────────────────────────── */}
      <Abschnitt titel="Rechenschritte nach VSS 2011/308">
        {visibleStreams.length > 0 && <>
          <h3>Ströme (Kap. 5)</h3>
          <table style={BL_T}>
            <thead>
              <tr>
                <th style={BL_THL}>Strom</th>
                <th style={BL_TH}>Typ</th>
                <th style={BL_TH}>Q<br/>[Fz/h]</th>
                <th style={BL_TH}>β</th>
                <th style={BL_TH}>L<br/>[Fz/h]</th>
                <th style={BL_TH}>x</th>
                <th style={BL_TH}>w<br/>[s]</th>
                <th style={{ ...BL_TH, textAlign: 'center' }}>LOS</th>
              </tr>
            </thead>
            <tbody>
              {visibleStreams.map((s, i) => (
                <tr key={s.id} style={{ background: i % 2 === 0 ? '#fff' : '#f7f7f7' }}>
                  <td style={{ ...BL_TDL, fontWeight: 700,
                               color: s.roadType === 'HS' ? '#1d4ed8' : s.roadType === 'NS' ? '#c2410c' : '#4b5563' }}>
                    {s.id}{s.scenario === 'II' ? ' (Sz II)' : ''}
                  </td>
                  <td style={{ ...BL_TD, textAlign: 'center' }}>{roadLabel(s.roadType)}</td>
                  <td style={BL_TD}>{s.Q}</td>
                  <td style={BL_TD}>{s.beta.toFixed(3)}</td>
                  <td style={BL_TD}>{Math.round(s.capacity)}</td>
                  <td style={{ ...BL_TD, fontWeight: 600, color: xFarbe(s.utilizationDegree) }}>
                    {isFinite(s.utilizationDegree) ? s.utilizationDegree.toFixed(2) : '> 1'}
                  </td>
                  <td style={BL_TD}>{isFinite(s.delay) ? `ca. ${Math.round(s.delay)} s` : '> 999 s'}</td>
                  <td style={{ ...BL_TD, textAlign: 'center', fontWeight: 800,
                               background: LOS_BG[s.levelOfService], color: LOS_COLOR[s.levelOfService] }}>
                    {s.levelOfService}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {visibleStreams.some(s => s.scenario === 'II') && <p className="bericht-unter">
            Sz II: Szenario II, ein paralleler vortrittsberechtigter Fussgängerstrom blockiert den Konfliktverkehr (Gl. 6, S. 61).
          </p>}
        </>}

        {mitFg && <>
          <h3>Fussgänger*innen je Arm</h3>
          <table style={BL_T}>
            <thead>
              <tr>
                <th style={BL_THL}>Arm</th>
                <th style={BL_THL}>Querung</th>
                <th style={BL_TH}>Q<sub>Fg</sub><br/>[Fg/h]</th>
                <th style={BL_TH}>Q wirksam<br/>[Fg/h]</th>
                <th style={BL_TH}>ρ</th>
                <th style={BL_TH}>S<sub>Fg</sub> = 900·ρ<br/>[Fg/h]</th>
              </tr>
            </thead>
            <tbody>
              {normArms.map((a, i) => a.querung === 'keine' ? null : (
                <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#f7f7f7' }}>
                  <td style={BL_TDL}><strong>{armLabel(i)}</strong></td>
                  <td style={BL_TDL}>{QUERUNG_ERGEBNIS[a.querung]}</td>
                  <td style={BL_TD}>{a.fg}</td>
                  <td style={BL_TD}>{a.mittelinsel ? `${a.fg / 2} (½, Mittelinsel)` : a.fg}</td>
                  <td style={BL_TD}>{a.fg > 0 ? (a.rho ?? 1) : '—'}</td>
                  <td style={BL_TD}>{a.fg > 0 ? 900 * (a.rho ?? 1) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>}

        <h3>Vorgehen (VSS 2011/308, Kap. 5)</h3>
        <p className="bericht-unter">
          Pro Strom: β = ∏(1 − y_i)³ über alle senkrechten vortrittsberechtigten Ströme (HS-Fz und/oder Fg, Ein- und Ausfahrt); y_HS = Summe Q/S aller HS-Ströme. HS-Linksabbieger: zusätzlich (1 − y_gegen)³ aus Geradeaus + Rechts des gegenüberliegenden HS-Arms (Tab. 25, S. 58).
          L = S·β (Szenario I, Gl. 5, S. 60); NS-Ströme und HS-Linksabbieger mit parallelen vortrittsberechtigten Fg-Strömen (Streifen auf nicht überfahrenen HS-Armen, Marker «Sz II»): L = S·y_par + S·(1−y_par)·β (Szenario II, Gl. 6, S. 61). S_Fg = 900·ρ Fg/h (ρ = mittlere Gruppengrösse, Tab. 9, S. 37).
          S und C (Gl. 1, S. 18; wiederholt auf S. 62): HS-Ströme ohne Fg S = 1750 Fz/h, C = 0.5 (Rang 1); wer Fg Vortritt gewährt, HS-Linksabbieger und NS-Ströme S = 1650 Fz/h, C = 1 (Tab. 26, S. 68). Der Linksabbieger der Nebenstrasse wartet an der Kreuzung auch auf den Gegenverkehr der gegenüberliegenden Nebenstrasse: Faktor (1−y)³ mit y = Q/1650 (Annahme nach Gl. 12, S. 61, und Tab. 25, S. 58).
          Einfahrten als Mischstreifen (siehe Annahmen). Qualitätsstufen nach SN 640 022, Tab. 3 (Seite 10), auf die der Bericht verweist (Seite 86): A &lt;10 s · B 10–15 s · C 15–25 s · D 25–45 s · E &gt;45 s · F Überlast.
        </p>
      </Abschnitt>

      {/* ── Eingaben ───────────────────────────────────────────────────────── */}
      <Abschnitt titel="Eingaben">
        <table style={BL_T}>
          <thead>
            <tr>
              <th style={BL_THL}>Arm</th>
              <th style={BL_THL}>Strasse</th>
              <th style={BL_TH}>Typ</th>
              <th style={BL_TH}>Links<br/>[Fz/h]</th>
              <th style={BL_TH}>Gerade<br/>[Fz/h]</th>
              <th style={BL_TH}>Rechts<br/>[Fz/h]</th>
              <th style={BL_THL}>Querung</th>
              <th style={BL_TH}>Fg<br/>[Fg/h]</th>
              <th style={BL_TH}>ρ</th>
              <th style={BL_TH}>Mittelinsel</th>
            </tr>
          </thead>
          <tbody>
            {normArms.map((arm, i) => {
              const u = uebernahme?.arme[i]
              const fgsAusKarte = !!u?.fgs && arm.querung === 'fgs'
              return (
                <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#f7f7f7' }}>
                  <td style={BL_TDL}><strong>{armLabel(i)}</strong></td>
                  <td style={BL_TDL}>{arm.name || '—'}<Herkunft art={merke(arm.name ? kartenHerkunft(u?.name, arm.name) : null)} /></td>
                  <td style={{ ...BL_TD, textAlign: 'center', fontWeight: 600 }}>{roadLabel(arm.roadType)}</td>
                  {RICHTUNGEN.map(r => is3 && OHNE_3[i] === r
                    ? <td key={r} style={BL_TD}>—</td>
                    : <td key={r} style={BL_TD}>{arm[r]}<Herkunft art={merke(schaetzArt(schaetzung?.stroeme[i], r, arm[r]) ?? stromHerkunft(uebernahme, i, r, arm[r]))} /></td>)}
                  <td style={BL_TDL}>{arm.querung === 'keine' ? '—' : QUERUNG_ERGEBNIS[arm.querung]}<Herkunft art={merke(fgsAusKarte ? 'K' : null)} /></td>
                  <td style={BL_TD}>{arm.fg || '—'}</td>
                  <td style={BL_TD}>{arm.fg > 0 ? (arm.rho ?? 1) : '—'}</td>
                  <td style={{ ...BL_TD, textAlign: 'center' }}>{arm.querung === 'fgs'
                    ? <>{arm.mittelinsel ? 'ja' : 'nein'}<Herkunft art={merke(fgsAusKarte && !!arm.mittelinsel === u?.fgs?.insel ? 'K' : null)} /></>
                    : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <HerkunftLegende arten={herkunft} unbekannt={!!karte && !karte.herkunft} />
      </Abschnitt>

      <HinweisListe hinweise={hinweise} />
      <QuellenAbschnitt normen={GRUNDLAGEN.vss308} daten={karte?.quellen ?? []} />
    </BerichtRahmen>
  )
}

// ── Legende ───────────────────────────────────────────────────────────────────

const LEGEND_ITEMS: LegendItem[] = [
  { abbr: 'Fz/h',   desc: 'Fahrzeuge pro Stunde — Roheingabe Abbiegeströme' },
  { abbr: 'Fg/h',   desc: 'Fussgänger*innen pro Stunde am Fussgängerstreifen dieser Einfahrt — Gesamtvolumen, unabhängig davon ob eine Mittelinsel vorhanden ist' },
  { abbr: 'MI',     desc: 'Mittelinsel (Verkehrsinsel) am Fussgängerstreifen — teilt den Streifen in zwei selbständige Teile (Art. 47 Abs. 3 VRV). Fahrzeuge müssen Fg, die die Insel noch nicht erreicht haben, keinen Vortritt gewähren. Rechnerisch: wirksames Q_Fg = Q_Fg / 2 (Näherung: gleichmässige Verteilung auf beide Hälften).' },
  { abbr: 'HS',     desc: 'Hauptstrasse — Rang 1 (S = 1750 Fz/h, C = 0.5), hat Vortritt gegenüber NS-Fahrzeugen. Nachrangig mit S = 1650 Fz/h, C = 1 sind Ströme, die Fussgänger*innen Vortritt gewähren (Tab. 26, S. 68), und Linksabbieger gegenüber dem Gegenverkehr (Geradeaus + Rechts des gegenüberliegenden HS-Arms)' },
  { abbr: 'NS',     desc: 'Nebenstrasse — Rang 2, muss Rang-1-Ströme und Fussgänger*innen abwarten' },
  { abbr: 'Q',  unit: 'Fz/h', desc: 'Belastung eines Stroms — Summe aller Fahrzeuge in dieser Bewegungsrichtung pro Stunde' },
  { abbr: 'S',       desc: 'Sättigungsfluss — empirische Richtwerte (Tab. 13, S. 39, VSS 2011/308): Fahrzeuge Rang 1 = 1750 Fz/h, nachrangig = 1650 Fz/h; Fussgänger*innen = 900·ρ Fg/h (ρ = mittlere Anzahl gemeinsam querender Fg, Tab. 9, S. 37); Tram = 340 T/h; Bus = 600 B/h' },
  { abbr: 'ρ',       desc: 'Mittlere Gruppengrösse gemeinsam querender Fussgänger*innen — bestimmt den Fg-Sättigungsfluss S_Fg = 900·ρ [Fg/h] (Gl. 4, S. 36; Tab. 9, S. 37, VSS 2011/308). Grundidee: Mehrere Fg, die gleichzeitig queren, blockieren ein Fahrzeug genauso lang wie einer allein — das Ereignis ist aber seltener. Mit steigendem ρ sinkt y_Fg = Q/S_Fg und damit β = (1−y_Fg)³ wird grösser → mehr Kapazität für Fahrzeuge. Bestimmung durch Vor-Ort-Beobachtung. Annahme als Startwert: ρ=1 Wohngebiet · ρ=2–3 Innenstadt · ρ=4–5 stark belebte Lagen (der Bericht nennt keine Lagen, Tab. 9, S. 37). Konservativ: ρ=1.' },
  { abbr: 'y',       desc: 'Sättigungsgrad = Q / S — Auslastung des Stroms relativ zur Sättigung; Grundgrösse für die β-Berechnung (Abkürzungsverz., VSS 2011/308)' },
  { abbr: 'β',      desc: 'Reduktionsfaktor — Π aller β_i der senkrechten Ströme (Gl. 12, S. 61); β_i je Verkehrsart (Abb. 23, S. 61): Bus/Tram = (1−y_i)¹ · Abbieg. Fz/Fg = (1−y_i)³ · Kreisverkehr = (1−y_i)² · Gleicher Rang = y_i/(y₁+y_i) (Kap. 5, VSS 2011/308)' },
  { abbr: 'L',  unit: 'Fz/h', desc: 'Kapazität des Stroms — Szenario I: L = S × β (Gl. 5, S. 60); Szenario II (paralleler vortrittsberechtigter Fg-Strom blockiert den Konfliktverkehr): L = S·y_par + S·(1−y_par)·β (Gl. 6, S. 61, Abb. 22, S. 60)' },
  { abbr: 'x',      desc: 'Auslastungsgrad = Q / L; x ≥ 1 bedeutet Überlast' },
  { abbr: 'w',  unit: 's',    desc: 'Mittlere Wartezeit — nach Gl. 1 (VSS 2011/308, S. 18; wiederholt auf S. 62); C = 0.5 für Rang 1, C = 1.0 für Rang 2 und gleichen Rang' },
  { abbr: 'k',  unit: 'Fz',   desc: 'Staulänge = w × L / 3600 — mittlere Anzahl wartender Fahrzeuge' },
  { abbr: 'LOS',    desc: 'Qualitätsstufe A–F nach SN 640 022, Tab. 3 (Seite 10); VSS 2011/308 verweist dafür auf diese Norm (Seite 86): A <10 s · B 10–15 s · C 15–25 s · D 25–45 s · E >45 s · F Überlast' },
]

// ── Hauptkomponente ───────────────────────────────────────────────────────────

// Aus der Karte: Namen übernommen, Ströme leer, ausser sie wurden aus dem Modell gewählt
function typAus(u: KnotenUebernahme): NodeType {
  return u.armCount === 3 ? '3arm' : '4arm'
}
function armsAus(u: KnotenUebernahme): ArmInput[] {
  return defaultArms(typAus(u)).map((a, i) => {
    const v = u.arme[i]
    return { ...a, name: v.name, left: v.stroeme?.left ?? 0, straight: v.stroeme?.straight ?? 0, right: v.stroeme?.right ?? 0, ...(v.fgs ? { querung: 'fgs' as const, mittelinsel: v.fgs.insel } : {}) }
  })
}

export default function VSS308App({ uebernahme: kartenUebernahme }: { uebernahme?: KnotenUebernahme }) {
  const isActive = useIsActiveModule()  // Druckblatt nur im sichtbaren Modul
  // Die Übernahme aus der Karte gilt, bis man zurücksetzt oder eine Datei lädt
  const [mitKarte, setMitKarte] = useState(true)
  const uebernahme = mitKarte ? kartenUebernahme : undefined
  const [nodeName, setNodeName]   = useState(uebernahme?.name ?? '')
  const [nodeType, setNodeType]   = useState<NodeType>(uebernahme ? typAus(uebernahme) : '4arm')
  const [armGewaehlt, setArmGewaehlt] = useState(!!uebernahme)   // Knotentyp hat keinen Startwert
  const [arms, setArms]           = useState<ArmInput[]>(() => uebernahme ? armsAus(uebernahme) : defaultArms('4arm'))
  const [karte, setKarte] = useState(() => uebernahme ? kartenBezugAus(uebernahme, 'vss308') : null)
  const [schaetzung, setSchaetzung] = useState<Schaetzung | null>(null)
  // Arme ohne Modellwert, für die «kein Verkehr» bestätigt ist
  const [nullOk, setNullOk] = useState<number[]>([])
  // Herkunft der Werte: aus der Übernahme, nach dem Laden aus der Datei
  const herkunftU = useMemo(() => { const h = herkunftAus(karte); return h?.armCount === (nodeType === '3arm' ? 3 : 4) ? h : undefined }, [karte, nodeType])
  const [showBl, setShowBl] = useState(false)
  const openBl  = useCallback(() => setShowBl(true),  [])
  const closeBl = useCallback(() => setShowBl(false), [])
  const { meldung, melden, schliessen: meldungZu } = useMeldung()

  function handleNodeTypeChange(t: NodeType) {
    setNodeType(t)
    setArmGewaehlt(true)
    setArms(defaultArms(t))
    setSchaetzung(null)
  }

  function updateArm(index: number, arm: ArmInput) {
    setArms(prev => prev.map((a, i) => i === index ? arm : a))
  }

  const handleExport = () =>
    exportTool({
      tool: 'vss308', filePrefix: 'VSS308',
      name: nodeName, melden,
      data: { nodeName, nodeType, arms, ...(karte ? { karte } : {}), ...(schaetzung ? { schaetzung } : {}), ...(nullOk.length ? { stromNullBestaetigt: nullOk } : {}) },
    })

  const handleImport = () =>
    importTool('vss308', d => {
        setNullOk(bestaetigtLesen(d.stromNullBestaetigt))
        setNodeName(typeof d.nodeName === 'string' ? d.nodeName : '')
        setKarte(kartenBezugLesen(d.karte))
        setMitKarte(false)
        // 'equal' (Gleicher Rang) ist vorerst ausgeblendet → auf '4arm' abbilden,
        // damit ältere gespeicherte Dateien nicht in einem unerreichbaren Modus landen.
        const saved = oneOf<NodeType>(['3arm', '4arm', 'equal'], d.nodeType, '4arm')
        const nt: NodeType = saved === 'equal' ? '4arm' : saved
        setNodeType(nt)
        setArmGewaehlt(true)
        setSchaetzung(schaetzungLesen(d.schaetzung, nt === '3arm' ? 3 : 4))
        // Genau so viele Arme wie der Knotentyp hat; Strassentyp folgt aus der Position.
        // Fehlt die Querung in einer älteren Datei, folgt sie in normalizeArm308 aus fg (> 0 → Fussgängerstreifen,
        // sonst keine). In neuen Dateien heisst das: noch nicht gewählt (siehe saveLoad.ts)
        const leer = d.leereFelder === true
        const loaded = saved === nt ? conformFixed<ArmInput>(defaultArms(nt), d.arms) : defaultArms(nt)
        setArms(loaded.map((a, i) => {
          const arm = { ...a, roadType: defaultArms(nt)[i].roadType, rho: leer ? wahl([1, 2, 3, 4, 5], a.rho) ?? undefined : oneOf([1, 2, 3, 4, 5], a.rho, 1) }
          return leer && arm.querung === undefined ? arm : normalizeArm308(arm)
        }))
      }, melden)

  function handleReset() {
    setNodeName('')
    setArms(defaultArms(nodeType))
    setArmGewaehlt(false)
    setSchaetzung(null)
    setKarte(null)
    setMitKarte(false)
    setNullOk([])
    melden('Zurückgesetzt')
  }

  const calcInput = useMemo(() => ({
    type: nodeType === '3arm' ? '3arm' as const : '4arm' as const,
    arms,
  }), [nodeType, arms])

  const result = useMemo(() => calculateVSS308(calcInput), [calcInput])
  const aktiveArme = nodeType === '3arm' ? arms.slice(0, 3) : arms
  const armSummen = aktiveArme.map(a => a.left + a.straight + a.right)
  const offen = armGewaehlt ? [...offenVss308(aktiveArme), ...offeneModellAngaben(herkunftU, armSummen, nullOk)] : ['Knotentyp']
  const fertig = offen.length === 0
  const overall = result.overallLevelOfService
  const noTraffic = result.arms.every(a => a.qFz <= 0)

  // Ströme (from→to) auf die Diagramm-Stromnummern q1–q12 abbilden.
  // Armindizes: 0=A, 1=C, 2=B, 3=D
  const diagVols: Partial<Record<StreamKey, number>> = {}
  const diagLos:  Partial<Record<StreamKey, Los>>    = {}
  const QMAP: Record<string, StreamKey> = {
    '0-3': 'q1', '0-1': 'q2', '0-2': 'q3', '2-0': 'q4',  '2-3': 'q5',  '2-1': 'q6',
    '1-2': 'q7', '1-0': 'q8', '1-3': 'q9', '3-1': 'q10', '3-2': 'q11', '3-0': 'q12',
  }
  for (const s of result.streams) {
    const q = QMAP[`${s.fromArmIndex}-${s.toArmIndex}`]
    if (!q) continue
    diagVols[q] = s.Q
    if (s.Q > 0 && fertig) diagLos[q] = s.levelOfService as Los  // ohne Verkehr keine Qualitätsfarbe
  }

  // Schematik (Querungen bereinigt wie in der Rechnung)
  const normArms = arms.map(normalizeArm308)
  const schematic = nodeType === 'equal'
    ? <img src={rechtsvorttrittSvg} alt="Rechtsvortritt" style={{ width: '100%', height: 'auto' }} />
    : <KnotenDiagramm armCount={nodeType === '3arm' ? 3 : 4}
        volumes={diagVols} losByStream={diagLos}
        leftLaneA={false} leftLaneC={false}
        crosswalkA={normArms[0]?.querung === 'fgs'} crosswalkC={normArms[1]?.querung === 'fgs'}
        crosswalkB={normArms[2]?.querung === 'fgs'} crosswalkD={normArms[3]?.querung === 'fgs'}
        trottoirB={normArms[2]?.querung === 'trottoirueberfahrt'}
        trottoirD={normArms[3]?.querung === 'trottoirueberfahrt'}
        mittelA={!!normArms[0]?.mittelinsel} mittelC={!!normArms[1]?.mittelinsel}
        mittelB={!!normArms[2]?.mittelinsel} mittelD={!!normArms[3]?.mittelinsel}
        fgA={normArms[0]?.fg} fgC={normArms[1]?.fg} fgB={normArms[2]?.fg} fgD={normArms[3]?.fg}
      />

  const activeArms = nodeType === '3arm' ? arms.slice(0, 3) : arms

  return (
    <>
    <div style={{ maxWidth: 1280, margin: '0 auto', padding: '16px 16px 40px' }}>
      <Meldung text={meldung} onClose={meldungZu} />
      {uebernahme && <UebernahmeHinweis u={uebernahme} rechner="vss308" />}
      <SoFunktionierts rechner="vss308" />
      {karte && <BelastungsVergleich vergleich={karte.vergleich} querschnitte={querschnitteKnoten(arms)} />}
      {armGewaehlt && <ModellLuecken u={herkunftU} summen={armSummen} bestaetigt={nullOk} onBestaetigen={i => setNullOk(n => [...n, i])} />}


      {/* Bezeichnung + Knotentyp-Auswahl */}
      <div className="kachel" style={{ padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <input type="text" value={nodeName}
          onChange={e => setNodeName(e.target.value)}
          placeholder="Bezeichnung des Knotens"
          style={{ flexBasis: '100%', padding: '5px 10px', borderRadius: 5,
                   border: '1px solid var(--border)', fontSize: 14, fontWeight: 600,
                   color: 'var(--text-strong)' }} />
        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginRight: 4 }}>
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
            className={`knopf${armGewaehlt && nodeType === key ? '' : ' zweit'}`}>
            {label}
          </button>
        ))}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
          <BerichtKnopf onClick={openBl} bereit={fertig} />
          <button onClick={handleExport}
            className="knopf zweit">
            Fall speichern
          </button>
          <button onClick={handleImport}
            className="knopf zweit">
            Fall laden
          </button>
          <button onClick={handleReset}
            className="knopf zweit">
            zurücksetzen
          </button>
        </div>
      </div>

      {!armGewaehlt && <OffeneAngaben liste={offen} />}

      {armGewaehlt && <ArmmengenSchaetzung key={activeArms.length} labels={activeArms.map((_, i) => armLabel(i))} namen={activeArms.map(a => a.name)}
        kreisel={false} hauptstrasse stand={schaetzung} onAnwenden={s => {
          setSchaetzung(s)
          setArms(prev => prev.map((a, i) => (i < s.stroeme.length ? { ...a, ...s.stroeme[i] } : a)))
        }} />}

      {armGewaehlt && <div className="layout-grid">
        {/* Linke Spalte: Arm-Cards */}
        <div>
          {/* Arm-Cards */}
          <div className={`arms-grid ${nodeType !== '3arm' ? 'arms-grid-4' : ''}`}>
            {activeArms.map((arm, i) => (
              <ArmCard key={i} arm={arm} index={i} nodeType={nodeType}
                result={fertig ? result.arms[i] : undefined}
                onChange={a => updateArm(i, a)} herkunft={herkunftU?.arme[i]} schaetzung={schaetzung?.stroeme[i]} />
            ))}
          </div>
        </div>

        {/* Rechte Spalte: Ergebnis-Panel */}
        <div className="results-panel">
          <div className="kachel" style={{ overflow: 'hidden' }}>

            {/* Schematik */}
            <div style={{ padding: 12, borderBottom: '1px solid var(--kachel-rand)', background: '#fafafa' }}>
              {schematic}
            </div>

            {!fertig && <OffeneAngaben liste={offen} />}

            {fertig && <>
            {/* Gesamt-LOS */}
            <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--kachel-rand)',
                          background: LOS_BG[overall] }}>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.06em',
                            color: LOS_COLOR[overall], textTransform: 'uppercase', marginBottom: 4 }}>
                Qualitätsstufe Knoten
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 48, fontWeight: 800, color: LOS_COLOR[overall],
                               lineHeight: 1 }}>
                  {noTraffic ? '–' : overall}
                </span>
                <div style={{ fontSize: 12, color: LOS_COLOR[overall] }}>
                  {noTraffic && 'Kein Verkehr eingegeben, keine Beurteilung'}
                  {!noTraffic && overall === 'A' && 'Sehr gut — keine Wartezeiten'}
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
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.06em',
                            color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8 }}>
                Einfahrten (Arm als Mischstreifen)
              </div>
              {result.arms.map(r => (
                <ResultCard key={r.armIndex} res={r} />
              ))}
            </div>

            {/* Überlast-Warnung */}
            {result.arms.some(r => !isFinite(r.delay)) && (
              <div className="fehlerbox klein" style={{ margin: '0 12px 8px' }}>
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
            <div className="hinweis klein" style={{ margin: '0 12px 8px' }}>
              ⚠ Beta — Resultate mit Vorsicht verwenden.
            </div>

            {/* Methodik-Hinweis */}
            <div style={{ margin: '0 12px 12px', padding: '10px 12px', borderRadius: 8,
                          background: '#f8fafc', border: '1px solid var(--kachel-rand)',
                          fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
              <strong style={{ color: 'var(--text)' }}>Methodik:</strong> VSS 2011/308 Kap. 5
              (Menendez/Guler/Puffe). Pro Strom: β = ∏(1−y<sub>i</sub>)³
              über alle senkrechten vortrittsberechtigten Ströme (HS-Fz + Fg Ein-/Ausfahrt); HS-Linksabbieger zusätzlich (1−y_gegen)³ gegen den Gegenverkehr.
              S_Fg = 900·ρ (bei Mittelinsel Q_Fg/2, Art. 47 Abs. 3 VRV). L = S·β (Szenario I, Gl. 5, S. 60); für NS-Ströme und HS-Linksabbieger mit parallelen vortrittsberechtigten Fg-Strömen (Fussgängerstreifen auf HS-Armen, die der Strom nicht überfährt) gilt L = S·y_par + S·(1−y_par)·β (Szenario II, Gl. 6, S. 61) — der Streifen blockiert den HS-Konfliktverkehr und verschafft dem Strom Zeitfenster.
              Einfahrten: Arm als Mischstreifen (Annahme, analog SN 640 022, Ziff. 13, S. 7): x = Σ Q/L, L = ΣQ/x; nur β ist volumengewichtet. Mit einem nachrangigen Strom im Arm gilt C = 1 (Ziffer 4.2, Seite 51).
              HS-Ströme ohne Fg: S = 1750, C = 0.5 (Rang 1). Wer Fg Vortritt gewährt, HS-Linksabbieger und NS-Ströme: S = 1650, C = 1 (Tab. 26, S. 68). Der Linksabbieger der Nebenstrasse wartet an der Kreuzung auch auf den Gegenverkehr der gegenüberliegenden Nebenstrasse: Faktor (1−y)³ mit y = Q/1650 (Annahme nach Gl. 12, S. 61, und Tab. 25, S. 58).
            </div>
            </>}

          </div>
        </div>
      </div>}

      <HilfeUnten rechner="vss308" legende={LEGEND_ITEMS} quellen={karte?.quellen} />

      <RechnerFuss>
        Berechnung nach «Verkehrsablauf an ungesteuerten Knoten innerorts unter Berücksichtigung
        der verschiedenen Verkehrsarten; Ermittlung repräsentativer Richtwerte und Zusammenhänge»
        (2015) und «Verkehrsqualität und Leistungsfähigkeit von komplexen ungesteuerten Knoten:
        Analytisches Schätzverfahren» (2009).
        Die Ergebnisse ersetzen keine Überprüfung durch eine Fachperson.
      </RechnerFuss>
    </div>

    {isActive && fertig && showBl && createPortal(
      <Bewertungsblatt308 nodeName={nodeName} nodeType={nodeType} arms={activeArms} result={result}
        onClose={closeBl} karte={karte} uebernahme={herkunftU} schaetzung={schaetzung} knotenbild={schematic} />,
      document.body
    )}
    </>
  )
}
