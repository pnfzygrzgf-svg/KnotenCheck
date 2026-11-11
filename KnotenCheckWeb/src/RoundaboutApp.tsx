import { useState, useMemo, useCallback, type CSSProperties, type ReactNode } from 'react'
import UebernahmeHinweis from './karte/UebernahmeHinweis'
import BelastungsVergleich from './karte/BelastungsVergleich'
import { querschnitteKreisel } from './karte/vergleich'
import { bestaetigtLesen, herkunftAus, kartenBezugAus, kartenBezugLesen, offeneModellAngaben, type KartenBezug, type KnotenUebernahme, type UebernahmeArm } from './karte/rechner'
import ModellLuecken from './karte/ModellLuecken'
import { createPortal } from 'react-dom'
import { calculateRoundabout, computeQKfromTurnings, computeQAfromTurnings, entryTypesFromFile,
  entryFactor, KREISEL_GRENZEN, mixZurNeigung, ringFactor, RB_PCE_MOTOR, FG_MAX_NORM, QK_MAX_NORM, LA_MAX_2_2, ROUNDABOUT_TYPES } from './engine/roundaboutCalculator'
import { conform, conformFixed, oneOf, wahl } from './engine/conform'
import { offenKreisel } from './engine/offeneAngaben'
import type { RoundaboutType, LevelOfService, EntryResult, ExitResult,
  GradientPCE, RbVehicleMix } from './engine/roundaboutCalculator'
import kreiselSvg from './assets/Kreisel.svg'
import kreisel3ArmSvg from './assets/Kreisel_3_arm.svg'
import { exportTool, importTool } from './saveLoad'
import { useIsActiveModule } from './activeModule'
import { HilfeUnten, SoFunktionierts, type LegendItem } from './Hilfe'
import { Meldung } from './Meldung'
import { LOS_BG, LOS_COLOR, delayText, utilizationColor } from './uiHelpers'
import { useMeldung } from './useMeldung'
import { LeereWahl, LOSBadge, NumInput, OffeneAngaben, Row, SectionLabel, UtilBar, ToggleBtn, BerichtKnopf } from './ui'
import { RechnerFuss } from './Fusszeile'
import { Abschnitt, BerichtKopf, BerichtRahmen, Gesamtergebnis, Herkunft, HerkunftLegende, HinweisListe, QuellenAbschnitt } from './bericht/Bericht'
import { kartenHerkunft, schaetzArt, stromArt, stromHerkunft, svFeldArt, svHerkunft, type HerkunftArt } from './bericht/herkunft'
import type { ArmStroeme } from './engine/armmengen'
import ArmmengenSchaetzung from './schaetzung/ArmmengenSchaetzung'
import { schaetzungGilt, schaetzungLesen, type Schaetzung } from './schaetzung/schaetzung'
import { HerkunftMarke } from './HerkunftMarke'
import { GRUNDLAGEN } from './hilfeTexte'

// ── Tab. 2: PW-Äquivalente — Logik in roundaboutCalculator.ts ─────────────────
const GRADIENT_OPTIONS: { value: GradientPCE; label: string }[] = [
  { value: '+4%', label: '+4 % (stark bergauf)' },
  { value: '+2%', label: '+2 % (mässig bergauf)' },
  { value: '±0%', label: '±0 % (eben / pauschal)' },
  { value: '-2%', label: '-2 % (mässig bergab)' },
  { value: '-4%', label: '-4 % (stark bergab)' },
]

// Fahrstreifenanordnung einer Einfahrt
const TYPE_OPTIONS: { value: RoundaboutType; label: string; desc: string }[] = [
  { value: '1/1',  label: 'Typ 1/1 — einstreifig',
    desc: 'Einstreifige Einfahrt, einstreifige Kreiselfahrbahn' },
  { value: '2/1+', label: 'Typ 2/1+ — zweistreifige Einfahrt',
    desc: 'Zweistreifige Einfahrt, einstreifige überbreite Kreiselfahrbahn' },
  { value: '2/2',  label: 'Typ 2/2 — zweistreifig (Einfahrt + Kreis)',
    desc: 'Zweistreifige Einfahrt, zweistreifige Kreiselfahrbahn (VSS 2005/301)' },
]

// ── Arm-Eingabe ────────────────────────────────────────────────────────────────

export interface ArmInput {
  name: string
  type: RoundaboutType | null  // Fahrstreifenanordnung der Einfahrt (Ziffer 11, Seite 12); null = noch nicht gewählt
  right: number      // 1. Ausfahrt (Rechtsabbieger)  [Fz/h]
  uturn?: number     // Wenden: Ausfahrt am eigenen Arm [Fz/h]; fehlt in älteren Dateien
  bypass?: boolean | null   // Rechtsabbieger über einen Bypass (Ziffer 11, Seite 13); null = noch nicht gewählt, fehlt in älteren Dateien
  straight: number   // 2. Ausfahrt (Geradeaus)        [Fz/h] — nur 4-Arm
  left: number       // 3. Ausfahrt (Linksabbieger)    [Fz/h]
  fg: number         // Fussgängerquerungen            [FG/h]
  gradient: GradientPCE | null
  exitWide: boolean | null  // Ausfahrtsbreite 4.5 m statt 3.5 m (Abb. 5)
  exitTwoLanes: boolean | null  // zweistreifige Ausfahrt (nur Typ 2/2, VSS 2005/301)
  mischung: 'pauschal' | 'detail' | null
  mix?: RbVehicleMix // detaillierte Verkehrsmischung (nur «detail»)
}

function defaultArm(): ArmInput {
  return { name: '', type: null, right: 0, bypass: null, straight: 0, left: 0, uturn: 0, fg: 0,
           gradient: null, exitWide: null, exitTwoLanes: null, mischung: null }
}

// f der Einfahrt; 0, solange die Neigung fehlt (die Rechnung läuft dann nicht)
const fEinfahrt = (a: ArmInput) => (a.gradient ? entryFactor(a.gradient, a.mix) : 0)

// Einfahrende Fz/h eines Arms; beim 3-Arm-Kreisel gibt es keinen Geradeaus-Strom
// (das ausgeblendete Feld kann noch einen Wert aus dem 4-Arm enthalten). Rechtsabbieger über einen Bypass zählen nicht:
// «Für die Leistungsschätzung des Kreisels selbst reduziert sich die Verkehrsstärke in der Einfahrt Q_E(i) entsprechend» (Ziffer 11, Seite 13)
function entryFzh(arm: ArmInput, armCount: 3 | 4): number {
  return (arm.bypass ? 0 : arm.right) + (armCount === 4 ? arm.straight : 0) + arm.left + (arm.uturn ?? 0)
}

/** Hinweis zu einem Arm mit Bypass. Annahme: In Q_A der nächsten Ausfahrt zählen die Rechtsabbieger weiter mit (auf der sicheren Seite) */
const bypassHinweis = (i: number, right: number) =>
  `Arm ${i + 1}: ${right} Fz/h Rechtsabbieger über Bypass, nicht in Q_E (Ziffer 11, Seite 13). Den Bypass selbst nach SN 640 022 beurteilen ` +
  '(Rechtseinbiegen), zum Beispiel im Rechner «Einmündung & Kreuzung». Annahme: In Q_A der nächsten Ausfahrt zählen sie weiter mit.'
const mitBypass = (a: ArmInput) => a.bypass === true && a.right > 0

// Tab. 2 (Seite 9) nennt für Fahrrad und Mofa nur bei ±0 % einen Wert (KR-7, Normprüfung 11.11.2026)
// Abb. 3 und 4 (Seite 10) beginnen bei 100 FG/h (KR-8, Normprüfung 11.11.2026)
const FF_HINWEIS = 'Unter 100 FG/h zeigen Abb. 3 und 4 (Seite 10) keine Kurve; f_F ist linear zwischen 1 (ohne Fussgänger*innen) und der 100er-Kurve interpoliert (Annahme).'
const VELO_HINWEIS = 'Für Fahrrad und Mofa nennt Tab. 2 (Seite 9) nur bei ±0 % einen Wert. Velos an dieser Einfahrt zählen hier als Personenwagen, ' +
  'auch auf der Kreiselfahrbahn (dort wäre 0,5 richtig); das liegt auf der sicheren Seite.'

// Dimensionierungsempfehlung: «in allen Einfahrten eine Belastungsreserve R ≥ 100 PWE/h» (Ziffer 13, Seite 15). Nur Anzeige, die Stufe bleibt
const RESERVE_EMPFOHLEN = 100
const reserveKnapp = (e: EntryResult) => e.loaded && isFinite(e.delay) && e.reserve >= 0 && e.reserve < RESERVE_EMPFOHLEN
const RESERVE_HINWEIS = 'R unter 100 PWE/h: Dimensionierungsempfehlung der Norm nicht erfüllt (Ziffer 13, Seite 15).'
const reserveFarbe = (e: EntryResult, rot: string, gruen: string) => (e.reserve < 0 ? rot : reserveKnapp(e) ? '#c2410c' : gruen)

// Kategorie-Eingaben (Detail-Mischung); PW ergibt sich als Rest
const MIX_ROWS: { key: keyof RbVehicleMix; label: string; onlyFlat?: boolean }[] = [
  { key: 'pctMR', label: 'MR – Motorräder' },
  { key: 'pctLW', label: 'LW – Lastwagen/Bus' },
  { key: 'pctLZ', label: 'LZ – Lastzüge' },
  { key: 'pctFR', label: 'FR – Fahrrad/Mofa', onlyFlat: true },
]

function ArmCard({ arm, index, armCount, qkFzh, qkPWE, onChange, herkunft, schaetzung }: {
  arm: ArmInput
  index: number
  armCount: 3 | 4
  qkFzh: number
  qkPWE: number   // aus der Berechnung: Ringströme mit dem Faktor ihres Herkunftsarms
  onChange: (a: ArmInput) => void
  herkunft?: UebernahmeArm   // Arm der Übernahme: Marken bei den Werten, die noch aus Karte oder Modell stammen
  schaetzung?: ArmStroeme     // aus Armmengen geschätzte Ströme dieses Arms
}) {
  const upd = <K extends keyof ArmInput>(k: K, v: ArmInput[K]) => onChange({ ...arm, [k]: v })
  const mix    = arm.mix
  const pce    = arm.gradient ? entryFactor(arm.gradient, mix) : null
  const pceText = pce === null ? '–' : pce.toFixed(2)
  const qeFzh  = entryFzh(arm, armCount)
  const qePWE  = pce === null ? '–' : Math.round(qeFzh * pce)
  // PW-Anteil (Rest) für die Detail-Mischung
  const pwPct  = mix ? Math.max(0, 100 - mix.pctFR - mix.pctMR - mix.pctLW - mix.pctLZ) : 100
  const pwOk   = !mix || (mix.pctFR + mix.pctMR + mix.pctLW + mix.pctLZ) <= 100

  return (
    <div style={{ border: '1px solid #c7d2e2', borderRadius: 8, overflow: 'hidden', background: '#fff' }}>
      {/* Kopf */}
      <div style={{ background: '#f0f6ff', padding: '10px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontWeight: 700, fontSize: 15, color: '#1d4ed8' }}>Kreiselarm {index + 1}</span>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            f = {pceText} · Q_E = {qePWE} PWE/h
          </span>
        </div>
        {arm.name && kartenHerkunft(herkunft?.name, arm.name) && <div style={{ fontSize: 12, marginBottom: 4 }}>Strassenname<HerkunftMarke art="K" /></div>}
        <input type="text" value={arm.name}
          onChange={e => upd('name', e.target.value)}
          placeholder={`Strassenname Arm ${index + 1}`}
          style={{ width: '100%', padding: '3px 8px', borderRadius: 4,
                   border: '1px solid #bfdbfe', fontSize: 12,
                   background: '#ffffffaa', color: 'var(--text)' }} />
      </div>

      {/* Fahrstreifenanordnung */}
      <Row label="Typ der Einfahrt" sub={TYPE_OPTIONS.find(t => t.value === arm.type)?.desc}>
        <HerkunftMarke art={kartenHerkunft(herkunft?.kreiselTyp, arm.type)} />
        <select value={arm.type ?? ''} onChange={e => upd('type', e.target.value as RoundaboutType)}
          style={{ fontSize: 14, padding: '3px 6px', borderRadius: 4,
                   border: '1px solid var(--border)', background: '#fff', cursor: 'pointer' }}>
          {arm.type === null && <LeereWahl />}
          {TYPE_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.value}</option>)}
        </select>
      </Row>

      {/* Abbiegeströme */}
      <SectionLabel title={`Abbiegeströme Arm ${index + 1} (Abb. 10, Seite 18)`} />
      <Row label="1. Ausfahrt — rechts" sub={`→ Arm ${(index + 1) % armCount + 1}`}>
        <HerkunftMarke art={schaetzArt(schaetzung, 'right', arm.right) ?? stromArt(herkunft, 'right', arm.right)} />
        <NumInput live value={arm.right} onChange={v => upd('right', v)} width={80} />
        <span style={{ fontSize: 12, color: 'var(--text-muted)', width: 36 }}>Fz/h</span>
      </Row>
      {arm.right > 0 && (
        <Row label="Rechtsabbieger über Bypass"
             sub="Verkehr über einen Bypass zählt nicht zu Q_E; den Bypass selbst nach SN 640 022 beurteilen, Rechtseinbiegen (Ziffer 11, Seite 13)">
          <select value={arm.bypass == null ? '' : arm.bypass ? 'ja' : 'nein'}
            onChange={e => upd('bypass', e.target.value === 'ja')}
            style={{ fontSize: 14, padding: '3px 6px', borderRadius: 4,
                     border: '1px solid var(--border)', background: '#fff', cursor: 'pointer' }}>
            {arm.bypass == null && <LeereWahl />}
            <option value="nein">ohne Bypass</option>
            <option value="ja">über Bypass</option>
          </select>
        </Row>
      )}
      {armCount === 4 && (
        <Row label="2. Ausfahrt — geradeaus" sub={`→ Arm ${(index + 2) % armCount + 1}`}>
          <HerkunftMarke art={schaetzArt(schaetzung, 'straight', arm.straight) ?? stromArt(herkunft, 'straight', arm.straight)} />
        <NumInput live value={arm.straight} onChange={v => upd('straight', v)} width={80} />
          <span style={{ fontSize: 12, color: 'var(--text-muted)', width: 36 }}>Fz/h</span>
        </Row>
      )}
      <Row label={armCount === 4 ? '3. Ausfahrt — links' : '2. Ausfahrt — links'}
           sub={`→ Arm ${(index + (armCount === 4 ? 3 : 2)) % armCount + 1}`}>
        <HerkunftMarke art={schaetzArt(schaetzung, 'left', arm.left) ?? stromArt(herkunft, 'left', arm.left)} />
        <NumInput live value={arm.left} onChange={v => upd('left', v)} width={80} />
        <span style={{ fontSize: 12, color: 'var(--text-muted)', width: 36 }}>Fz/h</span>
      </Row>
      <Row label="Wenden" sub={`→ Arm ${index + 1}; belastet den Ring an allen anderen Einfahrten (Ziffer 8.3, Seite 7)`}>
        <NumInput live value={arm.uturn ?? 0} onChange={v => upd('uturn', v)} width={80} />
        <span style={{ fontSize: 12, color: 'var(--text-muted)', width: 36 }}>Fz/h</span>
      </Row>

      {/* Fussgänger*innen */}
      <Row label={`Fussgängerquerungen Fg${index + 1}`}
           sub="Einfluss via f_F (Einfahrt, Abb. 3/4, Seite 10) und L_A (Ausfahrt, Abb. 5, Seite 11). 0 = kein Einfluss">
        <NumInput live value={arm.fg} onChange={v => upd('fg', v)} width={80} />
        <span style={{ fontSize: 12, color: 'var(--text-muted)', width: 36 }}>FG/h</span>
      </Row>
      {arm.type === '2/2' && (
        <Row label="Fahrstreifen der Ausfahrt"
             sub={`Richtwert ohne Fussgänger*innen: ${LA_MAX_2_2.oneLane} bzw. ${LA_MAX_2_2.twoLanes} Fz/h (VSS 2005/301, Ziffer 5.2.3, Seite 64)`}>
          <select value={arm.exitTwoLanes === null ? '' : arm.exitTwoLanes ? '2' : '1'}
            onChange={e => upd('exitTwoLanes', e.target.value === '2')}
            style={{ fontSize: 14, padding: '3px 6px', borderRadius: 4,
                     border: '1px solid var(--border)', background: '#fff', cursor: 'pointer' }}>
            {arm.exitTwoLanes === null && <LeereWahl />}
            <option value="1">einstreifig</option>
            <option value="2">zweistreifig</option>
          </select>
        </Row>
      )}
      {!(arm.type === '2/2' && arm.exitTwoLanes) && (
        <Row label="Ausfahrtsbreite B"
             sub="Länge des Fussgängerstreifens an der Ausfahrt (Abb. 5, Seite 11). Wirkt auf L_A">
          <select value={arm.exitWide === null ? '' : arm.exitWide ? '4.5' : '3.5'}
            onChange={e => upd('exitWide', e.target.value === '4.5')}
            style={{ fontSize: 14, padding: '3px 6px', borderRadius: 4,
                     border: '1px solid var(--border)', background: '#fff', cursor: 'pointer' }}>
            {arm.exitWide === null && <LeereWahl />}
            <option value="3.5">3,5 m</option>
            <option value="4.5">4,5 m</option>
          </select>
        </Row>
      )}

      {/* Längsneigung */}
      <SectionLabel title="Verkehrsmischung und Längsneigung" />
      <div style={{ padding: '8px 14px 6px', borderBottom: '1px solid var(--kachel-rand)' }}>
        <div style={{ display: 'flex', gap: 6 }}>
          <ToggleBtn small active={arm.mischung === 'pauschal'} onClick={() => onChange({ ...arm, mischung: 'pauschal', mix: undefined })}>
            Pauschal
          </ToggleBtn>
          <ToggleBtn small active={arm.mischung === 'detail'}
            onClick={() => onChange({ ...arm, mischung: 'detail', mix: mix ?? { pctFR: 0, pctMR: 0, pctLW: 0, pctLZ: 0 } })}>
            Detailliert (Fahrzeugkategorien)
          </ToggleBtn>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 5 }}>
          Pauschal: Spalte «Motorfahrzeuge» (Tab. 2, Seite 9). · Detailliert: gewichtetes f aus den
          Fahrzeugkategorien (Tab. 2, Seite 9). Die Kreiselfahrbahn nutzt die Mischung bei ±0 %.
        </div>
      </div>
      <Row label="Neigung der Einfahrt"
           sub={`in Fahrtrichtung · f = ${pceText} (Tab. 2, Seite 9). Q_K immer ±0 %`}>
        <HerkunftMarke art={kartenHerkunft(herkunft?.neigung, arm.gradient)} />
        <select value={arm.gradient ?? ''}
          onChange={e => {
            const g = e.target.value as GradientPCE
            // FR (Fahrrad/Mofa) nur bei ±0 % definiert — beim Verlassen zurücksetzen
            if (mix && g !== '±0%' && mix.pctFR)
              onChange({ ...arm, gradient: g, mix: { ...mix, pctFR: 0 } })
            else
              upd('gradient', g)
          }}
          style={{ fontSize: 14, padding: '3px 6px', borderRadius: 4,
                   border: '1px solid var(--border)', background: '#fff', cursor: 'pointer' }}>
          {arm.gradient === null && <LeereWahl />}
          {GRADIENT_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </Row>
      {mix && (<>
        {MIX_ROWS.filter(r => !r.onlyFlat || arm.gradient === '±0%').map(r => (
          <Row key={r.key} label={r.label}>
            {(r.key === 'pctLW' || r.key === 'pctLZ') && <HerkunftMarke art={svFeldArt(herkunft, r.key === 'pctLW' ? 'lw' : 'lz', mix[r.key])} />}
            <NumInput live value={mix[r.key]} min={0} max={100} width={70}
              onChange={v => onChange({ ...arm, mix: { ...mix, [r.key]: v } })} />
            <span style={{ fontSize: 12, color: 'var(--text-muted)', width: 16 }}>%</span>
          </Row>
        ))}
        {arm.gradient !== null && arm.gradient !== '±0%' && (
          <div style={{ padding: '4px 14px 6px', fontSize: 12, color: 'var(--text-muted)', borderBottom: '1px solid var(--kachel-rand)' }}>
            {VELO_HINWEIS}
          </div>
        )}
        <Row label="PW – Personenwagen" sub="Rest aus den übrigen Anteilen">
          <span style={{ fontSize: 14, fontWeight: 600, color: pwOk ? 'var(--text)' : '#dc2626' }}>
            {Math.round(pwPct)} %
          </span>
          {!pwOk && <span style={{ fontSize: 12, color: '#dc2626', marginLeft: 4 }}>Summe &gt; 100 %</span>}
        </Row>
      </>)}

      {/* Abgeleitete Werte */}
      <SectionLabel title="Abgeleitete Werte" />
      <Row label="Einfahrtsvolumen Q_E"
           sub={`${qeFzh} Fz/h × ${pceText} (Tab. 2, Seite 9)`}>
        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap' }}>
          {qePWE} PWE/h
        </span>
      </Row>
      <Row label="Kreisfahrbahnbelastung Q_K"
           sub={`${Math.round(qkFzh)} Fz/h aus den Abbiegeströmen, je Herkunftsarm mit dessen Faktor bei ±0 %`}>
        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap' }}>
          {qkPWE} PWE/h
        </span>
      </Row>
    </div>
  )
}

// ── Ergebnis-Karte pro Arm ────────────────────────────────────────────────────

function EntryCard({ e, arm, armNumber }: { e: EntryResult; arm: ArmInput; armNumber: number }) {
  const col = utilizationColor(e.utilizationDegree)
  const pct = Math.min(999, Math.round(e.utilizationDegree * 100))
  const overflow = !isFinite(e.delay)

  return (
    <div style={{ background: '#fff', borderRadius: 8, border: '1px solid var(--kachel-rand)',
                  marginBottom: 10, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '10px 14px', borderBottom: '1px solid var(--kachel-rand)' }}>
        <div>
          <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-strong)' }}>Arm {armNumber}</span>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 8 }}>Typ {e.type}</span>
          {arm.name && <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 8 }}>{arm.name}</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: col }}>{pct} %</span>
          {e.loaded ? <LOSBadge los={e.levelOfService} />
            : <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>kein Einfahrtsverkehr</span>}
        </div>
      </div>

      <div style={{ padding: '4px 14px 0' }}>
        <UtilBar value={e.utilizationDegree} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 8px',
                    padding: '8px 14px 10px', fontSize: 12, color: 'var(--text-muted)' }}>
        <div>
          <span style={{ color: 'var(--text-muted)' }}>Q_E </span>
          <strong style={{ color: 'var(--text)' }}>{e.qe} PWE/h</strong>
        </div>
        <div>
          <span style={{ color: 'var(--text-muted)' }}>Q_K </span>
          <strong style={{ color: 'var(--text)' }}>{e.qk} PWE/h</strong>
        </div>
        <div>
          <span style={{ color: 'var(--text-muted)' }}>L_E (ohne FG) </span>
          <strong>{Math.round(e.leBase)}</strong>
        </div>
        <div>
          <span style={{ color: 'var(--text-muted)' }}>f_F </span>
          <strong>{e.fF.toFixed(3)}</strong>
        </div>
        <div>
          <span style={{ color: 'var(--text-muted)' }}>L_E (mit FG) </span>
          <strong>{Math.round(e.capacity)} PWE/h</strong>
        </div>
        <div>
          <span style={{ color: 'var(--text-muted)' }}>Reserve R </span>
          <strong style={{ color: reserveFarbe(e, '#dc2626', '#16a34a') }}>
            {overflow ? '— (Überlast)' : `${Math.round(e.reserve)} PWE/h`}
          </strong>
          {reserveKnapp(e) && <span style={{ marginLeft: 6, color: '#c2410c' }}>unter 100 (Ziffer 13, Seite 15)</span>}
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <span style={{ color: 'var(--text-muted)' }}>Wartezeit </span>
          <strong style={{ color: overflow ? '#dc2626' : undefined }}>{e.loaded ? delayText(e.delay) : '—'}</strong>
          {arm.fg > 0 && (
            <span style={{ marginLeft: 8, color: 'var(--text-muted)' }}>(FG = {arm.fg} FG/h)</span>
          )}
        </div>
        {e.fgOutOfRange && (
          <div style={{ gridColumn: '1 / -1', marginTop: 4, color: '#b45309' }}>
            FG über {FG_MAX_NORM} FG/h liegt ausserhalb der Normdiagramme (Abb. 3–5, Seiten 10–11): gerechnet mit
            der {FG_MAX_NORM}er-Kurve, die Leistungsfähigkeit ist eher überschätzt.
          </div>
        )}
        {e.qkOutOfRange && (
          <div style={{ gridColumn: '1 / -1', marginTop: 4, color: '#b45309' }}>
            Q_K über {QK_MAX_NORM[e.type]} PWE/h liegt ausserhalb des Gültigkeitsbereichs der L_E-Formel
            ({e.type === '2/2' ? 'VSS 2005/301, Abb. 4.25, Seite 55: wenige Messdaten' : 'SN 640 024a, Abb. 6, Seite 12'}): L_E ist extrapoliert.
          </div>
        )}
      </div>
    </div>
  )
}

function ExitCard({ e, arm, armNumber }: { e: ExitResult; arm: ArmInput; armNumber: number }) {
  const col = utilizationColor(e.utilizationDegree)
  const pct = Math.min(999, Math.round(e.utilizationDegree * 100))
  return (
    <div style={{ background: '#fff', borderRadius: 8,
                  border: `1px solid ${e.overloaded ? '#dc2626' : 'var(--kachel-rand)'}`,
                  marginBottom: 10, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '10px 14px', borderBottom: '1px solid var(--kachel-rand)' }}>
        <div>
          <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-strong)' }}>Arm {armNumber}</span>
          {arm.name && <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 8 }}>{arm.name}</span>}
        </div>
        <span style={{ fontSize: 15, fontWeight: 700, color: col }}>
          {pct} %{e.overloaded ? ' · überlastet' : ''}
        </span>
      </div>
      <div style={{ padding: '4px 14px 0' }}>
        <UtilBar value={e.utilizationDegree} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 8px',
                    padding: '8px 14px 10px', fontSize: 12, color: 'var(--text-muted)' }}>
        <div>
          <span style={{ color: 'var(--text-muted)' }}>Q_A </span>
          <strong style={{ color: 'var(--text)' }}>{e.qa} PWE/h</strong>
        </div>
        <div>
          <span style={{ color: 'var(--text-muted)' }}>L_A </span>
          <strong>{Math.round(e.capacity)} PWE/h</strong>
          <span style={{ color: 'var(--text-muted)' }}> ({exitLabel(e, arm)})</span>
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <span style={{ color: 'var(--text-muted)' }}>X = Q_A / L_A </span>
          <strong style={{ color: col }}>{e.utilizationDegree.toFixed(2)}</strong>
          {arm.fg > 0 && <span style={{ marginLeft: 8, color: 'var(--text-muted)' }}>(FG = {arm.fg} FG/h)</span>}
        </div>
        {e.type === '2/2' && (
          <div style={{ gridColumn: '1 / -1', marginTop: 4, color: '#b45309' }}>{exitNote(e)}</div>
        )}
      </div>
    </div>
  )
}

// Gesamtaussage bei Q_A > L_A: Die Einfahrten allein beurteilen den Kreisel dann nicht
function exitOverloadText(exits: ExitResult[]): string {
  const arms = exits.filter(e => e.overloaded).map(e => e.armIndex + 1).join(', ')
  return `Ausfahrt überlastet an Arm ${arms} (Q_A > L_A): Gemäss Ziffer 10, Seite 11 sind andere Knotenformen zu suchen.`
}

// Ausfahrt in Kurzform und Hinweis zum Richtwert bei Typ 2/2
function exitLabel(e: ExitResult, arm: ArmInput): string {
  return e.twoLanes ? 'zweistreifig' : `B = ${arm.exitWide ? '4,5' : '3,5'} m`
}

/** Typ 2/2: Die Kurve wurde mit Q_K in Fahrzeugen gewonnen; hier geht Q_K wie bei der Norm in PWE ein (KR-1, Normprüfung 11.11.2026) */
const QK_22_HINWEIS = 'Typ 2/2: Die Kurve wurde mit Q_K in Fz/h gewonnen (VSS 2005/301, Ziffer 3.1.1, Seite 35); hier wird Q_K wie bei der Norm in PWE eingesetzt. Das liegt auf der sicheren Seite.'

/** Typ 2/2: Die Kurve gilt bei etwa gleich belasteten Fahrstreifen der Einfahrt (KR-10) */
const AUFTEILUNG_22_HINWEIS = 'Typ 2/2: Die Kurve gilt bei etwa gleich belasteten Fahrstreifen der Einfahrt (50 % ± 10 %). Bei 20–30 % auf dem linken ' +
  'Fahrstreifen ist L_E um rund 100–150 PWE/h geringer (VSS 2005/301, Ziffer 6.1.2 und 6.2, Seiten 67–68).'
/** Gemischte Typen: einstreifige Einfahrt an zweistreifiger Kreiselfahrbahn (KR-10) */
const TYPEN_GEMISCHT_HINWEIS = 'Typ 2/2 setzt eine zweistreifige Kreiselfahrbahn voraus, 1/1 und 2/1+ gelten für eine einstreifige (Ziffer 11, Seite 12). ' +
  'Eine einstreifige Einfahrt an einer zweistreifigen Kreiselfahrbahn empfiehlt VSS 2005/301 zwar (Seite 67), eine Kurve dafür gibt es aber nicht; ' +
  'gerechnet wird mit der Kurve des gewählten Typs (Annahme).'

function exitNote(e: ExitResult): string {
  const base = e.twoLanes ? LA_MAX_2_2.twoLanes : LA_MAX_2_2.oneLane
  // 1700 nennt der Bericht in Ziffer 6.2 (Seite 68) ausdrücklich in PWE/h; 1850 nur in Fz/h (Ziffer 5.2.3, Seite 64)
  const unit = e.twoLanes
    ? `Richtwert ${base} Fz/h ohne Fussgänger*innen (VSS 2005/301, Ziffer 5.2.3, Seite 64). Annahme: direkt mit Q_A in PWE/h verglichen. ` +
      'Der Bericht empfiehlt aus Sicherheitsgründen einstreifige Ausfahrten (Ziffer 6.1.2, Seite 67).'
    : `Richtwert ${base} PWE/h ohne Fussgänger*innen (VSS 2005/301, Ziffer 6.2, Seite 68).`
  if (!e.fgAssumed) return unit
  const fg = ' Annahme: Abzug für Fussgänger*innen anteilig wie Abb. 5 (Seite 11), die Quelle nennt keinen.'
  return unit + fg + (e.twoLanes
    ? ' SN 640 024a gilt nicht für zweistreifige Ausfahrten mit Fussgängerstreifen (Ziffer 1, Seite 3).'
    : '')
}

// ── Bewertungsblatt (Druckansicht) ────────────────────────────────────────────
// Gerüst wie in den anderen Rechnern (bericht/Bericht.tsx): Ort, Ergebnis, Rechenschritte, Eingaben, Annahmen und Hinweise, Quellen

const LOS_DESC: Record<LevelOfService, string> = {
  A: 'Sehr gut — keine Wartezeiten',
  B: 'Gut — kurze Wartezeiten',
  C: 'Befriedigend',
  D: 'Ausreichend — merkliche Wartezeiten',
  E: 'Mangelhaft — lange Wartezeiten',
  F: 'Überlastet — Stau',
}

const NORM_KREISEL = 'VSS 40 024a (früher SN 640 024a) «Leistungsfähigkeit, Verkehrsqualität, Belastbarkeit; Knoten mit Kreisverkehr»'

// Tabellenstile des Blatts
const th: CSSProperties = {
  padding: '3px 6px', border: '1px solid #bbb', background: '#ececec',
  fontSize: 9, fontWeight: 700, textAlign: 'right', whiteSpace: 'nowrap',
}
const thL: CSSProperties = { ...th, textAlign: 'left' }
const thC: CSSProperties = { ...th, textAlign: 'center' }
const td: CSSProperties = {
  padding: '3px 6px', border: '1px solid #ddd', fontSize: 10, textAlign: 'right',
}
const tdL: CSSProperties = { ...td, textAlign: 'left' }
const tabelle: CSSProperties = { width: '100%', borderCollapse: 'collapse', marginBottom: 12 }
const zeile = (i: number): CSSProperties => ({ background: i % 2 === 0 ? '#fff' : '#f7f7f7' })

export function Bewertungsblatt({ nodeName, armCount, arms, result, onClose, karte, uebernahme, schaetzung, knotenbild }: {
  nodeName: string
  armCount: 3 | 4
  arms: ArmInput[]
  result: NonNullable<ReturnType<typeof calculateRoundabout>>
  onClose: () => void
  karte?: KartenBezug | null
  uebernahme?: KnotenUebernahme
  schaetzung?: Schaetzung | null
  knotenbild?: ReactNode
}) {
  const overall = result.overallLevelOfService
  const anyTwoTwo = arms.some(a => a.type === '2/2')
  const allTwoTwo = arms.every(a => a.type === '2/2')
  const herkunft: (HerkunftArt | null)[] = []
  const merke = (h: HerkunftArt | null) => { herkunft.push(h); return h }

  // Massgebend: schlechteste Einfahrt mit Verkehr
  const r = ['A','B','C','D','E','F']
  const worstIdx = result.entries.reduce((wi, e, i) =>
    e.loaded && (wi < 0 || r.indexOf(e.levelOfService) > r.indexOf(result.entries[wi].levelOfService)) ? i : wi, -1)
  const armName = (i: number) => (arms[i].name ? ` — ${arms[i].name}` : '')
  const wText = (e: EntryResult) =>
    !e.loaded ? '—' : !isFinite(e.delay) ? '> 999 s' : e.delay < 1 ? '< 1 s' : `ca. ${Math.round(e.delay)} s`
  const typGleich = arms.every(a => a.type === arms[0].type)
  const mitWendern = arms.some(a => (a.uturn ?? 0) > 0)

  const hinweise: ReactNode[] = [
    ...(karte?.belegt ?? []),
    ...(schaetzung && schaetzungGilt(schaetzung, arms) ? [schaetzung.text] : []),
    'Q_A ist wie Q_K mit den Faktoren der Kreiselfahrbahn (Werte bei 0 %) gewichtet: Ausfahrende kommen von der Kreiselfahrbahn (Ziffer 9.2, Seiten 8–9; Tabelle 2, Fussnote 4, Seite 9).',
    ...(result.entries.some(e => e.fgOutOfRange) ? [<>¹ FG über {FG_MAX_NORM} FG/h: ausserhalb Abb. 3–5 (Seiten 10–11), mit
      der {FG_MAX_NORM}er-Kurve gerechnet (Leistungsfähigkeit eher überschätzt).</>] : []),
    ...(result.entries.some(e => e.qkOutOfRange) ? [<>² Q_K über dem Gültigkeitsbereich der L_E-Formel
      (1/1: {QK_MAX_NORM['1/1']}, 2/1+: {QK_MAX_NORM['2/1+']}, 2/2: {QK_MAX_NORM['2/2']} PWE/h), extrapoliert.</>] : []),
    ...result.exits.flatMap((e, i) => (e.type === '2/2' ? [<>Ausfahrt Arm {i + 1}: {exitNote(e)}</>] : [])),
    ...(anyTwoTwo ? [QK_22_HINWEIS] : []),
    ...arms.flatMap((a, i) => (mitBypass(a) ? [bypassHinweis(i, a.right)] : [])),
    ...(result.entries.some(reserveKnapp) ? [RESERVE_HINWEIS] : []),
    ...(arms.some(a => a.fg > 0 && a.fg < 100) ? [FF_HINWEIS] : []),
    KREISEL_GRENZEN,
    ...(anyTwoTwo ? [AUFTEILUNG_22_HINWEIS] : []),
    ...(anyTwoTwo && !allTwoTwo ? [TYPEN_GEMISCHT_HINWEIS] : []),
    'Die Ergebnisse ersetzen keine Überprüfung durch eine Fachperson.',
  ]

  return (
    <BerichtRahmen dokumentTitel={`KnotenCheck – SN 640 024a${nodeName ? ' – ' + nodeName : ''}`} onClose={onClose}>
      <BerichtKopf
        titel="Bewertungsblatt Kreisverkehr"
        angaben={<>
          <b>Bezeichnung:</b> {nodeName || '—'} · <b>Knotentyp:</b> Kreisverkehr mit {armCount} Armen ·{' '}
          <b>Typ der Einfahrten:</b> {typGleich
            ? TYPE_OPTIONS.find(t => t.value === arms[0].type)?.label.replace('Typ ', '')
            : 'je Einfahrt, siehe Eingaben'}<br />
          <b>Arme:</b> {arms.map((a, i) => `Arm ${i + 1}${a.name ? ` (${a.name})` : ''}`).join(', ')}
        </>}
        norm={NORM_KREISEL + (anyTwoTwo ? '; für den Typ 2/2 VSS 2005/301 «Leistungsfähigkeit zweistreifiger Kreisel»' : '')}
        karte={karte} />

      {/* ── Ergebnis ───────────────────────────────────────────────────────── */}
      <Abschnitt titel="Ergebnis">
        <div className="bericht-zwei">
          <div>
            <Gesamtergebnis stufe={overall} farbe={LOS_BG[overall]} text={<>
              <b>Qualitätsstufe {overall}{result.exitOverload ? ' · Ausfahrt überlastet' : ''}:</b> {LOS_DESC[overall]}
              {' '}(schlechteste Einfahrt mit Verkehr)
              {worstIdx >= 0 && <><br />Massgebende Einfahrt: Arm {worstIdx + 1}{armName(worstIdx)}
                {' '}(VQS {result.entries[worstIdx].levelOfService},
                {' '}{isFinite(result.entries[worstIdx].delay) ? `ca. ${Math.round(result.entries[worstIdx].delay)} s` : 'Überlast'})</>}
              {result.exitOverload && <><br /><b style={{ color: '#b91c1c' }}>{exitOverloadText(result.exits)}</b></>}
            </>} />
          </div>
          {knotenbild && <div className="bericht-bild">{knotenbild}</div>}
        </div>

        <h3>Einfahrten</h3>
        <table style={tabelle}>
          <thead>
            <tr>
              <th style={thL}>Arm</th>
              <th style={th}>Typ</th>
              <th style={th}>Q_E<br/>[PWE/h]</th>
              <th style={th}>L_E +FG<br/>[PWE/h]</th>
              <th style={th}>R<br/>[PWE/h]</th>
              <th style={th}>x<br/>[%]</th>
              <th style={th}>w<br/>[s]</th>
              <th style={thC}>VQS</th>
            </tr>
          </thead>
          <tbody>
            {result.entries.map((e, i) => (
              <tr key={i} style={zeile(i)}>
                <td style={tdL}><strong>Arm {i + 1}</strong>{armName(i)}</td>
                <td style={td}>{e.type}</td>
                <td style={td}>{e.qe}</td>
                <td style={td}>{Math.round(e.capacity)}</td>
                <td style={{ ...td, color: reserveFarbe(e, '#b91c1c', '#15803d'), fontWeight: 600 }}>
                  {!isFinite(e.delay) ? '—' : Math.round(e.reserve)}
                </td>
                <td style={{ ...td, fontWeight: 600,
                             color: e.utilizationDegree >= 1 ? '#b91c1c'
                               : e.utilizationDegree >= 0.9 ? '#c2410c' : '#374151' }}>
                  {isFinite(e.utilizationDegree) ? `${Math.round(e.utilizationDegree * 100)} %` : '> 100 %'}
                </td>
                <td style={td}>{wText(e)}</td>
                <td style={{ ...td, textAlign: 'center', fontWeight: 800,
                             background: e.loaded ? LOS_BG[e.levelOfService] : undefined,
                             color: e.loaded ? LOS_COLOR[e.levelOfService] : '#9ca3af' }}>
                  {e.loaded ? e.levelOfService : '—'}
                  {e.fgOutOfRange ? '¹' : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <h3>Ausfahrten-Check (Abb. 5, Seite 11)</h3>
        {result.exitOverload && (
          <div style={{ border: '1.5px solid #b91c1c', borderRadius: 3, padding: '4px 8px', marginBottom: 4,
                        fontSize: 10, fontWeight: 700, color: '#b91c1c' }}>
            {exitOverloadText(result.exits)}
          </div>
        )}
        <table style={tabelle}>
          <thead>
            <tr>
              <th style={thL}>Arm</th>
              <th style={th}>Q_A<br/>[PWE/h]</th>
              <th style={th}>FG<br/>[FG/h]</th>
              <th style={th}>Ausfahrt</th>
              <th style={th}>L_A<br/>[PWE/h]</th>
              <th style={th}>x = Q_A/L_A<br/>[%]</th>
              <th style={thC}>Status</th>
            </tr>
          </thead>
          <tbody>
            {result.exits.map((e, i) => (
              <tr key={i} style={zeile(i)}>
                <td style={tdL}><strong>Arm {i + 1}</strong>{armName(i)}</td>
                <td style={td}>{e.qa}</td>
                <td style={td}>{e.fg}</td>
                <td style={td}>{exitLabel(e, arms[i])}</td>
                <td style={td}>{Math.round(e.capacity)}</td>
                <td style={{ ...td, fontWeight: 600, color: e.overloaded ? '#b91c1c' : '#374151' }}>
                  {Math.round(e.utilizationDegree * 100)} %
                </td>
                <td style={{ ...td, textAlign: 'center', fontWeight: 700,
                             color: e.overloaded ? '#b91c1c' : '#15803d' }}>
                  {e.overloaded ? 'Überlast' : 'OK'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Abschnitt>

      {/* ── Rechenschritte ─────────────────────────────────────────────────── */}
      <Abschnitt titel="Rechenschritte nach VSS 40 024a">
        <h3>Vorgehen</h3>
        <ul className="bericht-hinweise">
          <li>Typ je Einfahrt (Ziffer 11, Seite 12).</li>
          <li>Q_E = Summe Abbiegeströme × f (Tab. 2, Seite 9, Längsneigung).</li>
          <li>Q_K = Kreisfahrbahnquerschnitt aus Abbiegeströmen, je Herkunftsarm mit dessen Faktor bei ±0 %, pauschal 1,1 (Abb. 10, Seite 18).</li>
          <li>L_E: 1141 − 0,578·Q_K (1/1, Q_K ≤ 1400) | 1455 − 0,537·Q_K (2/1+, Q_K ≤ 2000) (SN 640 024a, Abb. 6, Seite 12) | 1639,9·e^(−0,0006·Q_K) (2/2, VSS 2005/301, Abb. 4.25, Seite 55, Q_K &gt; 1800 datenarm).</li>
          <li>f_F nach Abb. 3/4, Seite 10 (bilinear interpoliert); Typ 2/2 verwendet Abb. 4 (mangels eigener Messwerte).</li>
          <li>Ausfahrten-Check (Ziffer 10, Abb. 5, Seite 11): Q_A ≤ L_A; L_A ≤ 1400 PWE/h, durch FG reduziert; Typ 2/2: Richtwerte {LA_MAX_2_2.oneLane}/{LA_MAX_2_2.twoLanes} Fz/h (VSS 2005/301, Ziffer 5.2.3, Seite 64).</li>
          <li>Wartezeit w reproduziert Abb. 7, Seite 15 (Kimber &amp; Hollis), T = 1,0 h.</li>
          <li>VQS nach Tab. 3, Seite 14: A ≤10 s · B ≤20 s · C ≤30 s · D ≤45 s · E &gt;45 s · F Überlast.</li>
        </ul>

        <h3>Einfahrtsvolumen Q_E</h3>
        <table style={tabelle}>
          <thead>
            <tr>
              <th style={thL}>Arm</th>
              <th style={th}>Neigung</th>
              <th style={th}>Verkehrsmischung</th>
              <th style={th}>f</th>
              <th style={th}>Q_E<br/>[Fz/h]</th>
              <th style={th}>Q_E<br/>[PWE/h]</th>
            </tr>
          </thead>
          <tbody>
            {arms.map((arm, i) => {
              const pce   = entryFactor(arm.gradient ?? '±0%', arm.mix)   // Druckblatt gibt es nur mit Ergebnis, die Neigung ist dann gewählt
              const qeFzh = entryFzh(arm, armCount)
              return (
                <tr key={i} style={zeile(i)}>
                  <td style={tdL}><strong>Arm {i + 1}</strong></td>
                  <td style={td}>{arm.gradient}</td>
                  <td style={td}>{arm.mix ? 'detailliert' : 'pauschal'}</td>
                  <td style={td}>{pce.toFixed(2)}</td>
                  <td style={td}>{qeFzh}</td>
                  <td style={td}>{Math.round(qeFzh * pce)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>

        <h3>Leistungsfähigkeit der Einfahrten</h3>
        <table style={tabelle}>
          <thead>
            <tr>
              <th style={thL}>Arm</th>
              <th style={th}>Typ</th>
              <th style={th}>Q_K<br/>[PWE/h]</th>
              <th style={th}>L_E −FG<br/>[PWE/h]</th>
              <th style={th}>FG<br/>[FG/h]</th>
              <th style={th}>f_F</th>
              <th style={th}>L_E +FG<br/>[PWE/h]</th>
            </tr>
          </thead>
          <tbody>
            {result.entries.map((e, i) => (
              <tr key={i} style={zeile(i)}>
                <td style={tdL}><strong>Arm {i + 1}</strong></td>
                <td style={td}>{e.type}</td>
                <td style={td}>{e.qk}{e.qkOutOfRange ? '²' : ''}</td>
                <td style={td}>{Math.round(e.leBase)}</td>
                <td style={td}>{arms[i].fg}{e.fgOutOfRange ? '¹' : ''}</td>
                <td style={td}>{e.fF.toFixed(3)}</td>
                <td style={td}>{Math.round(e.capacity)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Abschnitt>

      {/* ── Eingaben ───────────────────────────────────────────────────────── */}
      <Abschnitt titel="Eingaben">
        <table style={tabelle}>
          <thead>
            <tr>
              <th style={thL}>Arm</th>
              <th style={thL}>Strasse</th>
              <th style={th}>Kreiseltyp</th>
              <th style={th}>Rechts<br/>[Fz/h]</th>
              {armCount === 4 && <th style={th}>Gerade<br/>[Fz/h]</th>}
              <th style={th}>Links<br/>[Fz/h]</th>
              {mitWendern && <th style={th}>Wenden<br/>[Fz/h]</th>}
              <th style={th}>FG<br/>[FG/h]</th>
              <th style={th}>Ausfahrt</th>
              <th style={thL}>Verkehrsmischung</th>
              <th style={th}>Längsneigung</th>
            </tr>
          </thead>
          <tbody>
            {arms.map((arm, i) => {
              const u = uebernahme?.arme[i], mix = arm.mix
              const strom = (art: 'right' | 'straight' | 'left') =>
                <td style={td}>{arm[art]}<Herkunft art={merke(schaetzArt(schaetzung?.stroeme[i], art, arm[art]) ?? stromHerkunft(uebernahme, i, art, arm[art]))} />{art === 'right' && mitBypass(arm) ? ' (Bypass)' : ''}</td>
              return (
                <tr key={i} style={zeile(i)}>
                  <td style={tdL}><strong>Arm {i + 1}</strong></td>
                  <td style={tdL}>{arm.name || '—'}<Herkunft art={merke(kartenHerkunft(u?.name, arm.name))} /></td>
                  <td style={td}>{arm.type}<Herkunft art={merke(kartenHerkunft(u?.kreiselTyp, arm.type))} /></td>
                  {strom('right')}
                  {armCount === 4 && strom('straight')}
                  {strom('left')}
                  {mitWendern && <td style={td}>{arm.uturn ?? 0}</td>}
                  <td style={td}>{arm.fg}</td>
                  <td style={td}>{arm.type === '2/2' && arm.exitTwoLanes ? 'zweistreifig' : `B = ${arm.exitWide ? '4,5' : '3,5'} m`}</td>
                  <td style={tdL}>{mix
                    ? <>detailliert: MR {mix.pctMR} %, LW {mix.pctLW} %, LZ {mix.pctLZ} %, FR {mix.pctFR} %,
                        PW {Math.round(Math.max(0, 100 - mix.pctFR - mix.pctMR - mix.pctLW - mix.pctLZ))} %
                        <Herkunft art={merke(svHerkunft(uebernahme, i, mix.pctLW, mix.pctLZ))} /></>
                    : 'pauschal (Motorfahrzeuge)'}</td>
                  <td style={td}>{arm.gradient ?? '—'}<Herkunft art={merke(kartenHerkunft(u?.neigung, arm.gradient))} /></td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <HerkunftLegende arten={herkunft} unbekannt={!!karte && !karte.herkunft} />
      </Abschnitt>

      <HinweisListe hinweise={hinweise} />
      <QuellenAbschnitt normen={GRUNDLAGEN.sn024a} daten={karte?.quellen ?? []} />
    </BerichtRahmen>
  )
}

// ── Legende ───────────────────────────────────────────────────────────────────

const LEGEND_ITEMS: LegendItem[] = [
  { abbr: 'Fz/h',    desc: 'Fahrzeuge pro Stunde — Roheingabe Abbiegeströme' },
  { abbr: 'FG/h',    desc: 'Fussgänger*innen pro Stunde am Fussgängerstreifen der Einfahrt' },
  { abbr: 'PWE/h',   desc: 'Personenwageneinheiten pro Stunde — umgerechnet mit dem PW-Äquivalentfaktor f (Tab. 2, Seite 9)' },
  { abbr: 'f',       desc: 'PW-Äquivalentfaktor (Tab. 2, Seite 9) — pauschal: Spalte «Motorfahrzeuge» je Längsneigung; detailliert: gewichtetes Mittel der Fahrzeugkategorien (Fahrrad/Mofa, Motorrad, PW, LW, LZ). Die Kreiselfahrbahn (Q_K) verwendet immer die Werte bei ±0 % (pauschal = 1,1)' },
  { abbr: 'Q_E', unit: 'PWE/h', desc: 'Einfahrtsvolumen — Summe aller Abbiegeströme des Arms, umgerechnet mit f (Tab. 2, Seite 9)' },
  { abbr: 'Q_K', unit: 'PWE/h', desc: 'Kreisfahrbahnbelastung — Querschnittsbelastung unmittelbar vor der Einfahrt, aus den Knotenströmen gemäss Belastungsplan (Abb. 2, Seite 8, VSS 40 024a)' },
  { abbr: 'L_E', unit: 'PWE/h', desc: 'Leistungsfähigkeit der Einfahrt — 1141 − 0,578·Q_K (1/1, SN 640 024a), 1455 − 0,537·Q_K (2/1+, SN 640 024a), 1639,9·e^(−0,0006·Q_K) (2/2, VSS 2005/301); mit Fussgänger*innen: L_E × f_F' },
  { abbr: 'Q_A', unit: 'PWE/h', desc: 'Ausfahrtsvolumen — Summe aller Bewegungen, die an diesem Arm den Kreisel verlassen. Aus den Abbiegeströmen, wie Q_K mit den Faktoren der Kreiselfahrbahn (Werte bei 0 %) gewichtet: Ausfahrende kommen von der Kreiselfahrbahn (Ziffer 9.2, Seiten 8–9; Tabelle 2, Fussnote 4, Seite 9)' },
  { abbr: 'L_A', unit: 'PWE/h', desc: 'Leistungsfähigkeit der Ausfahrt — max. 1400 PWE/h ohne Fussgänger*innen, reduziert durch querenden Fussgängerverkehr je nach Ausfahrtsbreite (Abb. 5, Ziffer 10, Seite 11). Typ 2/2: Richtwert 1700 PWE/h einstreifig (VSS 2005/301, Ziffer 6.2, Seite 68), 1850 Fz/h zweistreifig (Ziffer 5.2.3, Seite 64), ohne Fussgänger*innen. Bedingung: Q_A ≤ L_A an allen Ausfahrten' },
  { abbr: 'f_F',     desc: 'Fussgängerkorrekturfaktor — Reduktion der Einfahrtskapazität durch querenden Fussgängerverkehr; bilinear interpoliert aus Abb. 3 (Typ 1/1) resp. Abb. 4 (Typ 2/1+ und 2/2), Seite 10. ' + FF_HINWEIS },
  { abbr: 'R',  unit: 'PWE/h', desc: 'Reserve = L_E − Q_E; negativ bedeutet Überlast' },
  { abbr: 'X',        desc: 'Auslastungsgrad — Einfahrt X = Q_E / L_E, Ausfahrt X = Q_A / L_A; X ≥ 1 bedeutet Überlast' },
  { abbr: 'w',   unit: 's', desc: 'Mittlere Wartezeit der Motorfahrzeuge — aus Abb. 7, Seite 15 (VSS 40 024a) in Abhängigkeit von Belastungsreserve R und Leistungsfähigkeit L_E' },
  { abbr: 'VQS',     desc: 'Verkehrsqualitätsstufe A–F nach Tab. 3, Seite 14 (SN 640 024a): A ≤10s · B ≤20s · C ≤30s · D ≤45s · E >45s · F Überlast' },
]

// ── Hauptkomponente ───────────────────────────────────────────────────────────

export default function RoundaboutApp({ uebernahme: kartenUebernahme }: { uebernahme?: KnotenUebernahme }) {
  const isActive = useIsActiveModule()  // Druckblatt nur im sichtbaren Modul
  // Die Übernahme aus der Karte gilt, bis man zurücksetzt oder eine Datei lädt
  const [mitKarte, setMitKarte] = useState(true)
  const uebernahme = mitKarte ? kartenUebernahme : undefined
  const [armCount, setArmCount] = useState<3 | 4>(uebernahme?.armCount ?? 4)
  const [armGewaehlt, setArmGewaehlt] = useState(!!uebernahme)   // Armzahl hat keinen Startwert
  const [nodeName, setNodeName] = useState(uebernahme?.name ?? '')
  const [arms, setArms]         = useState<ArmInput[]>(() =>
    [defaultArm(), defaultArm(), defaultArm(), defaultArm()].map((a, i) => {
      const v = uebernahme?.arme[i]
      return { ...a, ...v?.stroeme, name: v?.name ?? '', gradient: v?.neigung ?? a.gradient, type: v?.kreiselTyp ?? a.type,
        mischung: v?.schwerverkehr ? 'detail' as const : null,
        ...(v?.schwerverkehr ? { mix: { pctFR: 0, pctMR: 0, pctLW: v.schwerverkehr.lw, pctLZ: v.schwerverkehr.lz } } : {}) }
    }))
  const [karte, setKarte] = useState(() => uebernahme ? kartenBezugAus(uebernahme, 'sn024a') : null)
  const [schaetzung, setSchaetzung] = useState<Schaetzung | null>(null)
  // Arme ohne Modellwert, für die «kein Verkehr» bestätigt ist
  const [nullOk, setNullOk] = useState<number[]>([])
  // Herkunft der Werte: aus der Übernahme, nach dem Laden aus der Datei
  const herkunftU = useMemo(() => { const h = herkunftAus(karte); return h?.armCount === armCount ? h : undefined }, [karte, armCount])
  const [showBl, setShowBl] = useState(false)
  const openBl  = useCallback(() => setShowBl(true),  [])
  const closeBl = useCallback(() => setShowBl(false), [])

  const setArm = (i: number, arm: ArmInput) =>
    setArms(prev => { const a = [...prev]; a[i] = arm; return a })

  const { meldung, melden, schliessen: meldungZu } = useMeldung()

  const handleExport = () =>
    exportTool({
      tool: 'sn024a', filePrefix: 'SN024a',
      name: nodeName, fallbackName: 'kreisel', melden,
      data: { nodeName, armCount, arms, ...(karte ? { karte } : {}), ...(schaetzung ? { schaetzung } : {}), ...(nullOk.length ? { stromNullBestaetigt: nullOk } : {}) },
    })

  const handleImport = () =>
    importTool('sn024a', d => {
        setNullOk(bestaetigtLesen(d.stromNullBestaetigt))
        setNodeName(typeof d.nodeName === 'string' ? d.nodeName : '')
        setKarte(kartenBezugLesen(d.karte))
        setMitKarte(false)
        const n = oneOf<3 | 4>([3, 4], d.armCount, 4)
        setArmCount(n)
        setArmGewaehlt(true)
        setSchaetzung(schaetzungLesen(d.schaetzung, n))
        // Immer 4 Arme halten (3-Arm nutzt die ersten drei); Typ, Neigung und Mischung prüfen
        const leer = d.leereFelder === true, types = entryTypesFromFile(d, 4)
        const neigungen = Object.keys(RB_PCE_MOTOR) as GradientPCE[]
        const janein = (v: unknown) => (leer ? (typeof v === 'boolean' ? v : null) : v === true)
        const bypassAus = (v: unknown) => (typeof v === 'boolean' ? v : leer && v === null ? null : false)
        // Fahrräder gibt es nur bei ±0 % (Tabelle 2, Seite 9), wie beim Wechsel der Neigung in der Armkarte. Ein Anteil bei anderer Neigung hätte
        // keinen Faktor und zählte als Verkehr ohne Belastung: Er wird beim Laden auf 0 gesetzt und gemeldet
        const ohneFR: string[] = []
        setArms(conformFixed([defaultArm(), defaultArm(), defaultArm(), defaultArm()], d.arms).map((a, i) => {
          const gradient = leer ? wahl(neigungen, a.gradient) : oneOf(neigungen, a.gradient, '±0%')
          const { mix, ohneFR: weg } = mixZurNeigung(a.mix ? conform<RbVehicleMix>({ pctFR: 0, pctMR: 0, pctLW: 0, pctLZ: 0 }, a.mix) : undefined, gradient)
          if (weg > 0 && i < n) ohneFR.push(`Arm ${i + 1} (${String(weg).replace('.', ',')} %)`)
          return {
            ...a, mix,
            type: leer ? wahl(ROUNDABOUT_TYPES, a.type) : types[i],
            gradient,
            exitWide: janein(a.exitWide), exitTwoLanes: janein(a.exitTwoLanes),
            // Ältere Dateien kennen keinen Bypass: Dort zählten alle Rechtsabbieger zur Einfahrt, also «ohne Bypass»
            bypass: bypassAus(Array.isArray(d.arms) ? (d.arms[i] as Record<string, unknown> | undefined)?.bypass : undefined),
            mischung: leer ? wahl(['pauschal', 'detail'] as const, a.mischung) : mix ? 'detail' : 'pauschal',
          }
        }))
        return ohneFR.length ? `Fahrradanteil auf 0 gesetzt, weil es ihn nur bei ±0 % Neigung gibt: ${ohneFR.join(', ')}. Bitte die Mischung prüfen.` : undefined
      }, melden)

  function handleReset() {
    setNodeName('')
    setArms([defaultArm(), defaultArm(), defaultArm(), defaultArm()])
    setArmGewaehlt(false)
    setSchaetzung(null)
    setKarte(null)
    setMitKarte(false)
    setNullOk([])
    melden('Zurückgesetzt')
  }

  // Neue Identität genau dann, wenn sich Arme oder Armzahl ändern (Abhängigkeit der Memos unten)
  const activeArms = useMemo(() => arms.slice(0, armCount), [arms, armCount])

  const armSummen = useMemo(() => activeArms.map(a => a.right + a.left + (armCount === 4 ? a.straight : 0) + (a.uturn ?? 0)), [activeArms, armCount])
  const offen = useMemo(() => (armGewaehlt ? [...offenKreisel(activeArms), ...offeneModellAngaben(herkunftU, armSummen, nullOk)] : ['Anzahl Arme']),
    [armGewaehlt, activeArms, herkunftU, armSummen, nullOk])

  // Q_K aus Abbiegeströmen (Fz/h) — Formel: Abb. 10 / Herleitung Ring-Querschnitt
  const qkFzh = useMemo(() => computeQKfromTurnings(
    activeArms.map(a => a.right),
    activeArms.map(a => a.straight),
    activeArms.map(a => a.left),
    armCount,
    activeArms.map(a => a.uturn ?? 0),
  ), [armCount, activeArms])

  // Q_A je Ausfahrt (PWE/h): wie Q_K mit dem Ring-f (Mischung bei ±0 %) des Herkunftsarms, Ausfahrende kommen von der Kreiselfahrbahn (Ziffer 9.2)
  const qaPWE = useMemo(() => computeQAfromTurnings(
    activeArms.map(a => a.right * ringFactor(a.mix)),
    activeArms.map(a => a.straight * ringFactor(a.mix)),
    activeArms.map(a => a.left * ringFactor(a.mix)),
    armCount,
    activeArms.map(a => (a.uturn ?? 0) * ringFactor(a.mix)),
  ).map(Math.round), [armCount, activeArms])

  // Q_K je Einfahrt (PWE/h) — Ringströme mit dem Ring-f (Mischung @±0 %) des Herkunftsarms gewichtet
  const qkPWE = useMemo(() => computeQKfromTurnings(
    activeArms.map(a => a.right * ringFactor(a.mix)),
    activeArms.map(a => a.straight * ringFactor(a.mix)),
    activeArms.map(a => a.left * ringFactor(a.mix)),
    armCount,
    activeArms.map(a => (a.uturn ?? 0) * ringFactor(a.mix)),
  ).map(Math.round), [armCount, activeArms])

  const result = useMemo(() => {
    if (offen.length > 0) return null
    const qe = activeArms.map(a => Math.round(entryFzh(a, armCount) * fEinfahrt(a)))
    const qk = qkPWE
    const fg = activeArms.map(a => a.fg)
    const exitWide = activeArms.map(a => a.exitWide === true)
    const exitTwoLanes = activeArms.map(a => a.exitTwoLanes === true)
    if (qe.every(v => v === 0)) return null
    return calculateRoundabout({ type: activeArms.map(a => a.type!), qe, qk, fg, qa: qaPWE, exitWide, exitTwoLanes })
  }, [armCount, activeArms, qkPWE, qaPWE, offen])

  const overall = result?.overallLevelOfService
  const anyTwoTwo = activeArms.some(a => a.type === '2/2')
  const allTwoTwo = activeArms.every(a => a.type === '2/2')

  // Schema des Kreisels: am Bildschirm und im Druckblatt
  const knotenbild = (
    <img src={armCount === 3 ? kreisel3ArmSvg : kreiselSvg} alt="Kreisverkehr Schema"
      style={{ width: '100%', height: 'auto', display: 'block',
               maxHeight: 280, objectFit: 'contain' }} />
  )

  return (
    <>
    <main style={{ maxWidth: 1280, margin: '0 auto', padding: '20px 16px' }}>
      <Meldung text={meldung} onClose={meldungZu} />
      {uebernahme && <UebernahmeHinweis u={uebernahme} rechner="sn024a" />}
      <SoFunktionierts rechner="sn024a" />
      {karte && <BelastungsVergleich vergleich={karte.vergleich} querschnitte={querschnitteKreisel(arms.slice(0, armCount))} />}
      {armGewaehlt && <ModellLuecken u={herkunftU} summen={armSummen} bestaetigt={nullOk} onBestaetigen={i => setNullOk(n => [...n, i])} />}
      {armGewaehlt && activeArms.flatMap((a, i) => (mitBypass(a) ? [<div key={i} className="hinweis klein" style={{ marginBottom: 10 }}>{bypassHinweis(i, a.right)}</div>] : []))}


      {/* Knoten-Konfiguration */}
      <div className="kachel" style={{ padding: '12px 20px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <input type="text" value={nodeName}
          onChange={e => setNodeName(e.target.value)}
          placeholder="Bezeichnung des Kreisverkehrs"
          style={{ flexBasis: '100%', padding: '5px 10px', borderRadius: 5,
                   border: '1px solid var(--border)', fontSize: 14, fontWeight: 600, color: 'var(--text-strong)' }} />

        {armGewaehlt && <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)' }}>Alle Arme</span>}
        {armGewaehlt && TYPE_OPTIONS.map(t => {
          const on = activeArms.every(a => a.type === t.value)
          return (
            <button key={t.value} onClick={() => setArms(prev => prev.map(a => ({ ...a, type: t.value })))}
              className={`knopf${on ? '' : ' zweit'}`}>
              {t.label}
            </button>
          )
        })}
        {armGewaehlt && <span style={{ flexBasis: '100%', fontSize: 12, color: 'var(--text-muted)', padding: '2px 0', marginTop: -4 }}>
          Der Typ gilt je Einfahrt und lässt sich in jeder Armkarte einzeln wählen (Ziffer 11, Seite 12).
        </span>}

        {anyTwoTwo && (
          <span style={{ flexBasis: '100%', fontSize: 12, color: 'var(--text-muted)',
                         padding: '2px 0', marginTop: -4 }}>
            Grundlage Typ 2/2: VSS-Forschungsbericht 2005/301 — <em>Leistungsfähigkeit zweistreifiger Kreisel</em>, ETH Zürich / RUB Bochum / SNZ, 2009.{' '}
            {QK_22_HINWEIS} {AUFTEILUNG_22_HINWEIS}
          </span>
        )}
        {anyTwoTwo && !allTwoTwo && (
          <span style={{ flexBasis: '100%', fontSize: 12, color: '#b45309',
                         padding: '2px 0', marginTop: -4 }}>
            {TYPEN_GEMISCHT_HINWEIS}
          </span>
        )}

        <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)', marginLeft: 8 }}>Arme</span>
        {([3, 4] as const).map(n => (
          <button key={n} onClick={() => { if (n !== armCount) setSchaetzung(null); setArmCount(n); setArmGewaehlt(true) }}
            className={`knopf${armGewaehlt && armCount === n ? '' : ' zweit'}`}>
            {n} Arme
          </button>
        ))}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
          <BerichtKnopf onClick={openBl} bereit={!!result} />
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

      {armGewaehlt && <ArmmengenSchaetzung key={armCount} labels={activeArms.map((_, i) => String(i + 1))} namen={activeArms.map(a => a.name)}
        kreisel stand={schaetzung} onAnwenden={s => {
          setSchaetzung(s)
          setArms(prev => prev.map((a, i) => (i < armCount ? { ...a, ...s.stroeme[i] } : a)))
        }} />}

      {/* Hauptlayout */}
      {armGewaehlt && <div className="layout-grid">

        {/* Arm-Karten */}
        <div className={`arms-grid${armCount === 4 ? ' arms-grid-4' : ''}`}>
          {activeArms.map((arm, i) => (
            <ArmCard key={i} arm={arm} index={i} armCount={armCount}
                     qkFzh={qkFzh[i]} qkPWE={qkPWE[i]} onChange={a => setArm(i, a)} herkunft={herkunftU?.arme[i]} schaetzung={schaetzung?.stroeme[i]} />
          ))}
        </div>

        {/* Ergebnisse (sticky) */}
        <div className="results-panel kachel"
             style={{ padding: 20 }}>

          {/* Schematik */}
          <div style={{ marginBottom: 12, borderRadius: 8, overflow: 'hidden',
                        border: '1px solid var(--kachel-rand)', background: '#fafafa', padding: 8 }}>
            {knotenbild}
          </div>

          {/* Beta-Hinweis */}
          <div className="hinweis klein" style={{ marginBottom: 14 }}>
            ⚠ Beta — Resultate mit Vorsicht verwenden.
          </div>

          {overall && (
            <>
              {/* Gesamtbeurteilung */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            padding: '14px 16px', borderRadius: 12, marginBottom: 16,
                            background: LOS_BG[overall],
                            border: `1px solid ${LOS_COLOR[overall]}44` }}>
                <div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 2 }}>
                    Gesamtbeurteilung · {allTwoTwo ? 'VSS 2005/301' : anyTwoTwo ? 'SN 640 024a · VSS 2005/301' : 'SN 640 024a'}
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-strong)' }}>
                    Qualitätsstufe {overall}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 1 }}>
                    (schlechteste Einfahrt)
                  </div>
                  {result!.exitOverload && (
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#991b1b', marginTop: 4 }}>
                      {exitOverloadText(result!.exits)}
                    </div>
                  )}
                </div>
                <LOSBadge los={overall} />
              </div>

              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)',
                            textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                Einfahrten
              </div>
              {result!.entries.map((e, i) => (
                <EntryCard key={i} e={e} arm={activeArms[i]} armNumber={i + 1} />
              ))}

              {/* Ausfahrten-Check (Ziffer 10, Abb. 5) */}
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)',
                            textTransform: 'uppercase', letterSpacing: '0.05em',
                            margin: '18px 0 8px' }}>
                Ausfahrten-Check (Abb. 5, Seite 11)
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
                Q_A ist wie Q_K mit den Faktoren der Kreiselfahrbahn (Werte bei 0 %) gewichtet: Ausfahrende kommen von der Kreiselfahrbahn (Ziffer 9.2, Seiten 8–9; Tabelle 2, Fussnote 4, Seite 9).
              </div>
              {result!.exitOverload && (
                <div className="fehlerbox klein" style={{ marginBottom: 10 }}>
                  <strong>Ausfahrt überlastet (Q_A &gt; L_A).</strong> Der Verkehr kann den
                  Kreisel nicht abfliessen — gemäss Ziffer 10, Seite 11 sind andere Knotenformen zu suchen.
                </div>
              )}
              {result!.exits.map((e, i) => (
                <ExitCard key={i} e={e} arm={activeArms[i]} armNumber={i + 1} />
              ))}

              {/* Methodik */}
              <div style={{ marginTop: 16, padding: '10px 13px', borderRadius: 8,
                            background: '#f8fafc', border: '1px solid var(--kachel-rand)',
                            fontSize: 12, color: 'var(--text)', lineHeight: 1.65 }}>
                <div style={{ fontWeight: 700, color: 'var(--text-strong)', marginBottom: 4 }}>
                  Methodik (SN 640 024a)
                </div>
                <div><strong>Eingabe</strong> Typ und Abbiegeströme je Arm (Abb. 10, Seite 18): 1./2./3. Ausfahrt [Fz/h]</div>
                <div><strong>Q_E</strong> = Summe Abbiegeströme × f (Tab. 2, Seite 9, Längsneigung)</div>
                <div><strong>Q_K</strong> = Querschnitt vor Einfahrt aus den Abbiegeströmen, je Herkunftsarm mit dessen Faktor bei ±0 % (pauschal 1,1)</div>
                <div><strong>L_E</strong> je Einfahrt: 1141 − 0,578·Q_K (1/1) | 1455 − 0,537·Q_K (2/1+) (Abb. 6, Seite 12) | 1639,9·e^(−0,0006·Q_K) (2/2, VSS 2005/301, Seite 55)</div>
                <div><strong>f_F</strong> nach Abb. 3/4, Seite 10 — bilinear interpoliert (2/2: Abb. 4 analog)</div>
                <div><strong>Q_A / L_A</strong> Ausfahrten-Check (Ziffer 10, Abb. 5, Seite 11): Q_A ≤ L_A an allen Ausfahrten; L_A ≤ 1400 PWE/h, durch FG reduziert; Typ 2/2: Richtwert {LA_MAX_2_2.oneLane} bzw. {LA_MAX_2_2.twoLanes} Fz/h (VSS 2005/301, Ziffer 5.2.3, Seite 64)</div>
                <div><strong>Wartezeit</strong> reproduziert Abb. 7, Seite 15 (Kimber &amp; Hollis), T = 1,0 h</div>
                <div><strong>VQS</strong> nach Tab. 3, Seite 14: A ≤ 10 s · B ≤ 20 s · C ≤ 30 s · D ≤ 45 s · E &gt; 45 s · F = Überlast</div>
              </div>

            </>
          )}

          {!overall && <OffeneAngaben liste={offen.length > 0 ? offen : ['Abbiegeströme']} />}
        </div>
      </div>}

      <HilfeUnten rechner="sn024a" legende={LEGEND_ITEMS} quellen={karte?.quellen} />

      <RechnerFuss>
        Berechnung nach VSS 40 024a «Leistungsfähigkeit, Verkehrsqualität, Belastbarkeit.
        Knoten mit Kreisverkehr». Die Ergebnisse ersetzen keine Überprüfung durch eine Fachperson.
      </RechnerFuss>
    </main>

    {isActive && result && showBl && createPortal(
      <Bewertungsblatt nodeName={nodeName} armCount={armCount} arms={activeArms} result={result}
        onClose={closeBl} karte={karte} uebernahme={herkunftU} schaetzung={schaetzung} knotenbild={knotenbild} />,
      document.body
    )}
    </>
  )
}
