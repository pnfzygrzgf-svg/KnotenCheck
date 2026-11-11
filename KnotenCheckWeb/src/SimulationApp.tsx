import { useMemo, useState, useCallback, useRef, useEffect, type CSSProperties, type ReactNode } from 'react'
import UebernahmeHinweis from './karte/UebernahmeHinweis'
import BelastungsVergleich from './karte/BelastungsVergleich'
import { querschnitteKnoten } from './karte/vergleich'
import { bestaetigtLesen, herkunftAus, intersectionAus, kartenBezugAus, kartenBezugLesen, offeneModellAngaben, type KartenBezug, type KnotenUebernahme } from './karte/rechner'
import ModellLuecken from './karte/ModellLuecken'
import { Abschnitt, BerichtKopf, BerichtRahmen, Herkunft, HerkunftLegende, HinweisListe, QuellenAbschnitt } from './bericht/Bericht'
import { kartenHerkunft, schaetzArt, stromHerkunft, svHerkunft, type HerkunftArt } from './bericht/herkunft'
import ArmmengenSchaetzung from './schaetzung/ArmmengenSchaetzung'
import { schaetzungGilt, schaetzungLesen, type Schaetzung } from './schaetzung/schaetzung'
import { GRUNDLAGEN } from './hilfeTexte'
import { createPortal } from 'react-dom'
import einmuendungSvg from './assets/einmuendung.svg'
import kreuzungSvg    from './assets/kreuzung.svg'
import {
  GAP_PARAMS, GAP_PARAMS_SN640022, GAP_PARAMS_SN640022_CH,
  pedBlockingTime, normalizePedestrianLeg, V_FG, DEFAULT_FAHRBAHNBREITE, MITTELINSEL_GRENZE_M,
} from './engine/stochasticSN640022'
import type {
  StochasticConfig, StochasticSN640022Result, StochasticMultiResult,
  GapOverrides, PedestrianConfig, PedestrianLegConfig, SimInterval,
} from './engine/stochasticSN640022'
import {
  defaultIntersection, toSNVolumes, toSNRawVolumes, toSNLaneFlags, armLabel,
} from './engine/armConfiguration'
import type { ArmConfiguration, IntersectionConfiguration } from './engine/armConfiguration'
import type { SN640022LaneFlags } from './engine/types'
import { conformArms } from './engine/armConfiguration'
import { conform, oneOf, wahl } from './engine/conform'
import { offenSimulation } from './engine/offeneAngaben'
import { QUERUNG_ERGEBNIS, QUERUNG_LABEL, type Querung } from './engine/querung'
import type { SimRequest, SimResponse } from './simulation.worker'
import { exportTool, importTool } from './saveLoad'
import { useIsActiveModule } from './activeModule'
import { Meldung } from './Meldung'
import { simLOS, streamMovementName } from './uiHelpers'
import { useMeldung } from './useMeldung'
import { HilfeUnten, SoFunktionierts, type LegendItem } from './Hilfe'
import { LeereWahl, NumInput, OffeneAngaben, Row, Ckbx, LOSBadge, ToggleBtn, ToolbarBtn, BerichtKnopf } from './ui'
import { ArmCard } from './ArmCard'
import { StochasticPanel } from './StochasticPanel'
import { RechnerFuss } from './Fusszeile'

// ── Legende ───────────────────────────────────────────────────────────────────

// Zeitlückenverteilung (Normprüfung 11.11.2026, SIM-2): Die HBS-Zeitlücken gehören zu zufälligen Ankünften
const EXPONENTIAL_TEXT = 'Zufällige Ankünfte. Dazu gehören die HBS-Zeitlücken (Brilon 2016, Seite 2); trifft die Kurven der SN 640 022.'
const COWAN_TEXT = 'Kolonnenbildung (eigene Annahme: A = 7,0, t_m = 1,8 s). Mit den HBS-Zeitlücken liegt die Leistungsfähigkeit deutlich über der Norm (bei 1000 Fz/h rund ein Drittel).'

// Wartezeitdefinition (Normprüfung 11.11.2026, SIM-3)
const WARTEZEIT_SIM_HINWEIS = 'Die Simulation misst die Zeit bis zur Annahme der Lücke. Die Wartezeit der SN 640 022 (Abb. 4, Seite 9) enthält zusätzlich die ' +
  'Bedienzeit 3600/L; bei kleiner Belastung liegt die Simulation darum rund 2 s tiefer. Die Stufen nach Tab. 3 (Seite 10) gelten so nur näherungsweise.'

// Sperrdauer je Gruppe ist eine eigene Annahme (Normprüfung 11.11.2026, SIM-1)
const SPERRDAUER_HINWEIS = 'Der Bericht VSS 2011/308 mindert die Leistungsfähigkeit gegenüber Fussgänger*innen mit (1 − y)³ ab, y = Q_Fg / (900 · ρ). ' +
  'Bei mehr als rund 200 Fg/h rechnet die Simulation damit günstiger als der Bericht und der Rechner «Ungesteuerter Knoten mit Fussgänger*innen».'

const LEGEND_ITEMS: LegendItem[] = [
  { abbr: 'Fz/h',      desc: 'Fahrzeuge pro Stunde — Roheingabe' },
  { abbr: 'PWE/h',     desc: 'Personenwageneinheiten pro Stunde — umgerechnet mit f (Tab. 1/2, SN 640 022)' },
  { abbr: 'qpi', unit: 'Fz/h', desc: 'Massgebende Hauptstrombelastung nach SN 640 022 (Ziff. 7, S. 3) — sagt, welche Fahrzeuge der Strom abwarten muss' },
  { abbr: 'Rg',        desc: 'Rang — 1 = Hauptstrasse (kein Warten), 2 = HS-Linksabbieger / NS-Rechtseinbieger, 3 = NS-Kreuzen, 4 = NS-Linkseinbiegen. Ab Rang 3 ist eine Lücke nur frei, wenn die höherrangigen Ströme keinen Rückstau haben (Ziff. 11, S. 6, SN 640 022)' },
  { abbr: 't_c', unit: 's', desc: 'Grenzzeitlücke — Mindestzeitlücke im Hauptstrom, die ein Fahrer als ausreichend akzeptiert; je Manöver aus HBS 2015, Kap. S5, Tabelle S5-3 (Zeichen 205)' },
  { abbr: 't_f', unit: 's', desc: 'Folgezeitlücke — Mindestabstand zwischen zwei aufeinanderfolgenden Fahrzeugen, die in derselben Hauptstromlücke einfahren; aus HBS 2015, Kap. S5, Tabelle S5-3' },
  { abbr: 'w',   unit: 's', desc: 'Simulierte mittlere Wartezeit — Mittelwert aller Wartezeiten (Abfahrtszeit − Ankunftszeit) über alle Fahrzeuge und alle Simulationsläufe. ' + WARTEZEIT_SIM_HINWEIS },
  { abbr: '±σ',  unit: 's', desc: 'Standardabweichung der Wartezeiten — Mass für die Streuung; hohe σ bedeutet stark schwankende Wartezeiten zwischen einzelnen Fahrzeugen' },
  { abbr: 'P50', unit: 's', desc: 'Median — 50 % der Fahrzeuge warten kürzer als dieser Wert' },
  { abbr: 'P85', unit: 's', desc: '85. Perzentil — 85 % der Fahrzeuge warten kürzer; üblicher Planungswert für Dimensionierung' },
  { abbr: 'P95', unit: 's', desc: '95. Perzentil — 95 % der Fahrzeuge warten kürzer; Mass für die Spitzenbelastung' },
  { abbr: 'x',          desc: 'Auslastung der Haltelinie — Anteil der Simulationsdauer, in dem ein Fahrzeug an der Haltelinie auf eine Lücke wartet (Nebenstrom-Arme: gemeinsame Haltelinie). x ≥ 1: die Warteschlange wächst bis zum Periodenende → QS F' },
  { abbr: 'n',          desc: 'Stichprobengrösse — Anzahl aller simulierten Fahrzeuge über sämtliche Simulationsläufe' },
]

// ── Typen ─────────────────────────────────────────────────────────────────────

interface SimIntervalInput {
  id:    string
  label: string
  T:     15 | 30 | 45 | 60 | null  // Minuten; null = noch nicht gewählt
  arms:  ArmConfiguration[]
}

function defaultInterval(armCount: 3 | 4): SimIntervalInput {
  return {
    id:    crypto.randomUUID(),
    label: '',
    T:     null,
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

// Die Simulation kennt nur eine Haltelinie je Arm und keine Dreiecksinseln; ältere
// Dateien mit gesetzter Insel laden weiter, die Insel wirkt hier aber nicht.
function simFlags(cfg: IntersectionConfiguration): SN640022LaneFlags {
  return {
    ...toSNLaneFlags(cfg),
    armATriangleIsland: false, armCTriangleIsland: false,
    armBRightIsland: false, armDRightIsland: false,
  }
}

// ── Fussgänger*innen-Felder (Footer in ArmCard) ───────────────────────────────

type PedArmKey = 'armA' | 'armC' | 'armB' | 'armD'

function defaultLeg(): PedestrianLegConfig {
  return { enabled: false, fg: 0, rho: 0, mittelinsel: false }   // Querung und Gruppengrösse noch nicht gewählt
}

const PED_ARM_LABEL: Record<PedArmKey, string> = { armA: 'A', armC: 'C', armB: 'B', armD: 'D' }

function PedFooter({ leg: rawLeg, isHS, onChange }: {
  leg:      PedestrianLegConfig
  isHS:     boolean
  onChange: (l: PedestrianLegConfig) => void
}) {
  const bd = isHS ? '#bfdbfe' : '#fed7aa'
  const bg = isHS ? '#eff6ff' : '#fff7ed'
  // Querung bereinigt (fehlendes Feld → aus enabled; Trottoirüberfahrt nur an NS-Armen)
  const leg     = normalizePedestrianLeg(rawLeg, !isHS)
  const gewaehlt = rawLeg.querung !== undefined
  const isTUe   = leg.querung === 'trottoirueberfahrt'
  const optionen: Querung[] = isHS ? ['keine', 'fgs'] : ['keine', 'fgs', 'trottoirueberfahrt']
  const setQuerung = (q: Querung) => onChange({
    ...leg,
    querung:     q,
    enabled:     q !== 'keine',
    mittelinsel: q === 'trottoirueberfahrt' ? false : leg.mittelinsel,
  })
  return (
    <div style={{ borderTop: `1px solid ${bd}`, background: leg.enabled ? bg : '#fafafa' }}>
      {/* Auswahl-Zeile */}
      <div style={{ padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 600,
                       color: leg.enabled ? '#15803d' : 'var(--text-muted)' }}>
          Querung
        </span>
        <select value={gewaehlt ? leg.querung : ''}
          onChange={e => setQuerung(e.target.value as Querung)}
          style={{ fontSize: 12, padding: '2px 6px', borderRadius: 4,
                   border: '1px solid var(--border)', background: '#fff', cursor: 'pointer' }}>
          {!gewaehlt && <LeereWahl />}
          {optionen.map(q => <option key={q} value={q}>{QUERUNG_LABEL[q]}</option>)}
        </select>
        {!isHS && leg.enabled && (
          <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 'auto' }}>
            sperrt nur Ströme über den Streifen
          </span>
        )}
      </div>

      {/* Eingabefelder */}
      {leg.enabled && (() => {
        const breite    = leg.fahrbahnbreite
        const tBlock    = pedBlockingTime(leg)
        const freq      = leg.rho > 0 ? leg.fg / leg.rho : leg.fg   // Sperrungen/h
        return (
        <>
          {isTUe && (
            <div className="hinweis klein" style={{ margin: '0 14px 8px' }}>
              <strong>Trottoirüberfahrt:</strong> Fussgänger*innen haben Vortritt (VRV Art. 41
              Abs. 2). Gerechnet wie ein Fussgängerstreifen über die Nebenstrasse – Annahme,
              VSS 2011/308 kennt die Trottoirüberfahrt nicht.
            </div>
          )}
          <Row label={isTUe ? 'Fussgänger*innen auf der Trottoirüberfahrt' : 'Fussgänger*innen'}
               sub={isTUe ? '[Fg/h]' : 'VSS 2011/308 · Fg/h am Fussgängerstreifen'}>
            <NumInput value={leg.fg} onChange={v => onChange({ ...leg, fg: v })} max={2000} live />
            <span style={{ fontSize: 12, color: 'var(--text-muted)', width: 30 }}>Fg/h</span>
          </Row>
          <Row label="Gruppengrösse ρ" sub="steuert die Häufigkeit der Sperrungen (fg/ρ), nicht die Dauer">
            <select value={leg.rho || ''}
              onChange={e => onChange({ ...leg, rho: Number(e.target.value) })}
              style={{ fontSize: 14, padding: '3px 6px', borderRadius: 4,
                       border: '1px solid var(--border)', background: '#fff' }}>
              {!leg.rho && <LeereWahl />}
              {[1, 2, 3, 4, 5].map(r => (
                <option key={r} value={r}>
                  {r} {r === 1 ? '(Einzeln)' : r === 2 ? '(Paar)' : r >= 4 ? '(Gruppe)' : ''}
                </option>
              ))}
            </select>
          </Row>
          <Row label={isTUe ? 'Breite der Einmündung' : 'Fahrbahnbreite'} sub={`bestimmt die Sperrdauer: Breite / ${V_FG.toFixed(2).replace('.', ',')} m/s (eigene Annahme; ${V_FG.toFixed(2).replace('.', ',')} m/s nach VSS 40 240, Ziffer 8.1, Seite 7)`}>
            <NumInput value={breite ?? 0} onChange={v => onChange({ ...leg, fahrbahnbreite: v > 0 ? v : undefined })} max={30} live />
            <span style={{ fontSize: 12, color: 'var(--text-muted)', width: 30 }}>m</span>
          </Row>
          {!isTUe && breite !== undefined && breite >= MITTELINSEL_GRENZE_M && (
            <div className="hinweis klein" style={{ margin: '0 14px 8px' }}>
              Ab {MITTELINSEL_GRENZE_M} m Fahrbahnbreite ist gemäss VSS 40 241 eine Mittelinsel erforderlich.
            </div>
          )}
          {!isTUe && (
            <Row label="Mittelinsel" sub="Art. 47 Abs. 3 VRV — Streifen baulich geteilt → halbe Breite">
              <Ckbx checked={leg.mittelinsel} onChange={v => onChange({ ...leg, mittelinsel: v })} />
            </Row>
          )}
          {breite !== undefined && leg.rho > 0 && <div style={{ padding: '4px 14px 8px', fontSize: 12, color: 'var(--text-muted)' }}>
            Sperrzeit: {breite} m / {V_FG.toFixed(2)} m/s{leg.mittelinsel ? ' × 0.5 (Mittelinsel)' : ''} ={' '}
            <strong>{tBlock.toFixed(1)} s</strong> je Gruppe (Annahme) · ≈ <strong>{Math.round(freq)}</strong> Sperrungen/h
            <div style={{ marginTop: 4 }}>{SPERRDAUER_HINWEIS}</div>
          </div>}
        </>
        )
      })()}
    </div>
  )
}

// ── Gap-Konfiguration (tc/tf) ─────────────────────────────────────────────────

type GapKey = 'mainLeft' | 'sideRight' | 'sideCross' | 'sideLeft'
const GAP_LABELS: Record<GapKey, string> = {
  mainLeft:  'HS-Linksabbieger (Ströme 1, 7)',
  sideRight: 'NS-Rechtseinbiegen (Ströme 6, 12)',
  sideCross: 'NS-Kreuzen (Ströme 5, 11)',
  sideLeft:  'NS-Linkseinbiegen (Ströme 4, 10)',
}

function GapConfigSection({ overrides, gewaehlt, onChange }: {
  overrides: GapOverrides
  gewaehlt:  boolean   // ohne Wahl bleiben Vorgabe und Felder leer
  onChange:  (o: GapOverrides) => void
}) {
  const keys: GapKey[] = ['mainLeft', 'sideRight', 'sideCross', 'sideLeft']
  const matches = (p: typeof GAP_PARAMS) =>
    keys.every(k => overrides[k]?.tc === p[k].tc && overrides[k]?.tf === p[k].tf)
  const preset: 'hbs' | 'sn' | 'sn-ch' | 'custom' | null =
    !gewaehlt ? null
    : keys.every(k => overrides[k] === undefined) ? 'hbs'
    : matches(GAP_PARAMS_SN640022) ? 'sn'
    : matches(GAP_PARAMS_SN640022_CH) ? 'sn-ch'
    : 'custom'
  const applyPreset = (p: typeof GAP_PARAMS) => onChange({
    mainLeft:  { ...p.mainLeft },
    sideRight: { ...p.sideRight },
    sideCross: { ...p.sideCross },
    sideLeft:  { ...p.sideLeft },
  })
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <ToggleBtn small active={preset === 'hbs'} onClick={() => onChange({})}>
          HBS 2015
        </ToggleBtn>
        <ToggleBtn small active={preset === 'sn'} onClick={() => applyPreset(GAP_PARAMS_SN640022)}>
          SN 640 022 (implizit)
        </ToggleBtn>
        <ToggleBtn small active={preset === 'sn-ch'} onClick={() => applyPreset(GAP_PARAMS_SN640022_CH)}>
          SN 640 022 (mit +90)
        </ToggleBtn>
        {preset === 'custom' && (
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>benutzerdefiniert</span>
        )}
      </div>
      {preset === 'sn' && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
          Äquivalente Zeitlücken, rückgerechnet aus den Abb.-2-Kurven der SN 640 022
          (Siegloch-Fit, ±0.2–0.4 s). Ohne die CH-Erhöhung von +90 PWE/h —
          die Simulation rechnet mit diesem Preset konservativ.
        </div>
      )}
      {preset === 'sn-ch' && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
          Rechengrössen, keine gemessenen Zeitlücken: Mit exponentiellen Lücken und ohne Streuung
          von t_c trifft die Simulation so die Kurven der Norm samt +90 PWE/h (Ziff. 9, S. 4)
          im Mittel auf 3–6 %.
        </div>
      )}
      {keys.map(k => {
        const def  = GAP_PARAMS[k]
        const ov   = overrides[k] ?? {}
        const tcV  = ov.tc ?? def.tc
        const tfV  = ov.tf ?? def.tf
        return (
          <div key={k}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 3 }}>
              {GAP_LABELS[k]}
              <span style={{ color: 'var(--text-muted)', fontWeight: 400, marginLeft: 6 }}>
                (HBS 2015: tc={def.tc} s, tf={def.tf} s)
              </span>
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                <span style={{ color: 'var(--text)', width: 22 }}>tc</span>
                <input type="number" step="0.1" min="1" max="12"
                  value={gewaehlt ? tcV : ''}
                  onChange={e => onChange({ ...overrides, [k]: { ...ov, tc: Number(e.target.value) } })}
                  style={{ width: 60, padding: '2px 5px', borderRadius: 4,
                           border: '1px solid var(--border)', fontSize: 12, textAlign: 'right' }} />
                <span style={{ color: 'var(--text-muted)' }}>s</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                <span style={{ color: 'var(--text)', width: 22 }}>tf</span>
                <input type="number" step="0.1" min="0.5" max="8"
                  value={gewaehlt ? tfV : ''}
                  onChange={e => onChange({ ...overrides, [k]: { ...ov, tf: Number(e.target.value) } })}
                  style={{ width: 60, padding: '2px 5px', borderRadius: 4,
                           border: '1px solid var(--border)', fontSize: 12, textAlign: 'right' }} />
                <span style={{ color: 'var(--text-muted)' }}>s</span>
              </label>
              {(ov.tc !== undefined || ov.tf !== undefined) && (
                <button onClick={() => {
                  const n = { ...overrides }
                  delete n[k]
                  onChange(n)
                }} style={{ fontSize: 12, color: 'var(--text-muted)', background: 'none',
                            border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
                  zurücksetzen
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
    <div style={{ border: '1px solid var(--kachel-rand)', borderRadius: 8, overflow: 'hidden',
                  marginBottom: 8, background: '#fff' }}>
      <div style={{ background: '#f8fafc', padding: '8px 14px', display: 'flex',
                    alignItems: 'center', gap: 8, cursor: 'pointer' }}
           onClick={() => setExpanded(e => !e)}>
        <span style={{ fontSize: 12, color: 'var(--text-muted)', width: 20 }}>{index + 1}.</span>
        <input type="text" value={iv.label}
          onClick={e => e.stopPropagation()}
          onChange={e => onUpdate({ ...iv, label: e.target.value })}
          placeholder="Zeitraum (z.B. 07:30–08:00)"
          style={{ flex: 1, padding: '2px 8px', borderRadius: 4,
                   border: '1px solid var(--border)', fontSize: 12, color: 'var(--text)' }} />
        <select value={iv.T ?? ''} onClick={e => e.stopPropagation()}
          onChange={e => onUpdate({ ...iv, T: Number(e.target.value) as 15|30|45|60 })}
          style={{ fontSize: 12, padding: '2px 6px', borderRadius: 4,
                   border: '1px solid var(--border)', background: '#fff' }}>
          {iv.T === null && <LeereWahl />}
          {([15, 30, 45, 60] as const).map(t => (
            <option key={t} value={t}>{t} min</option>
          ))}
        </select>
        {index > 0 && (
          <button onClick={e => { e.stopPropagation(); onRemove() }}
            style={{ fontSize: 12, color: '#dc2626', background: 'none',
                     border: 'none', cursor: 'pointer' }}>✕</button>
        )}
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{expanded ? '▲' : '▼'}</span>
      </div>
      {expanded && (
        <div style={{ padding: '8px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {arms.map((arm, i) => (
            <ArmCard key={arm.id} arm={arm} index={i} isHS={i < 2}
              armCount={armCount} geometryLocked hideMixedLane hideIsland live
              onChange={a => setArm(i, a)} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Multi-Intervall-Ergebnis ───────────────────────────────────────────────────

// Im Druckblatt (alle) ohne Reiter, dafür mit den Einzelheiten aller Intervalle
function MultiIntervalPanel({ result, alle = false }: { result: StochasticMultiResult; alle?: boolean }) {
  const [activeTab, setActiveTab] = useState(0)
  const iv = result.intervals
  const aktiv = (i: number) => !alle && i === activeTab

  return (
    <div>
      {/* Tab-Leiste */}
      {!alle && <div style={{ display: 'flex', gap: 4, marginBottom: 12, flexWrap: 'wrap' }}>
        {iv.map((r, i) => (
          <ToggleBtn key={i} small active={activeTab === i} onClick={() => setActiveTab(i)}>
            {r.label}
          </ToggleBtn>
        ))}
      </div>}

      {/* Ganglinie-Tabelle */}
      <div style={{ marginBottom: 16, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: '#1e3a5f', color: '#fff' }}>
              <th style={{ padding: '5px 8px', textAlign: 'left' }}>Intervall</th>
              <th style={{ padding: '5px 8px', textAlign: 'left' }}>Strom</th>
              <th style={{ padding: '5px 8px', textAlign: 'right' }}>Mittelw. [s]</th>
              <th style={{ padding: '5px 8px', textAlign: 'right' }}>P85 [s]</th>
              <th style={{ padding: '5px 8px', textAlign: 'center' }}>QS</th>
              <th style={{ padding: '5px 8px', textAlign: 'right' }}>Wartend am Ende</th>
            </tr>
          </thead>
          <tbody>
            {iv.map((r, iIdx) =>
              r.result.streams.filter(s => s.stats !== null).map((s, sIdx) => (
                <tr key={`${iIdx}-${s.streamNumber}`}
                  style={{ background: sIdx % 2 === 0 ? '#f8fafc' : '#fff',
                           borderBottom: '1px solid var(--kachel-rand)',
                           fontWeight: aktiv(iIdx) ? 600 : 400 }}>
                  {sIdx === 0 && (
                    <td rowSpan={r.result.streams.filter(x => x.stats !== null).length}
                      style={{ padding: '4px 8px', verticalAlign: 'middle',
                               borderRight: '1px solid var(--kachel-rand)', color: aktiv(iIdx) ? 'var(--accent)' : 'var(--text-muted)',
                               fontWeight: aktiv(iIdx) ? 700 : 400 }}>
                      {r.label}
                    </td>
                  )}
                  <td style={{ padding: '4px 8px', color: 'var(--text)', whiteSpace: 'nowrap' }}>
                    {streamMovementName(s.streamNumber)}
                  </td>
                  <td style={{ padding: '4px 8px', textAlign: 'right' }}>
                    {s.stats ? `${(s.open ?? 0) > 0 ? '≥ ' : ''}${Math.round(s.stats.mean)}` : '–'}
                  </td>
                  <td style={{ padding: '4px 8px', textAlign: 'right' }}>
                    {s.stats ? `${(s.open ?? 0) > 0 ? '≥ ' : ''}${Math.round(s.stats.p85)}` : '–'}
                  </td>
                  <td style={{ padding: '4px 8px', textAlign: 'center' }}>
                    <LOSBadge los={simLOS(s.stats!.mean, s.utilization)} />
                  </td>
                  {sIdx === 0 && (
                    <td rowSpan={r.result.streams.filter(x => x.stats !== null).length}
                      style={{ padding: '4px 8px', textAlign: 'right', verticalAlign: 'middle',
                               color: r.carryOver > 0 ? '#ea580c' : 'var(--text-muted)' }}>
                      {r.carryOver > 0 ? `${r.carryOver} Fz` : '–'}
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Detail-Panel für aktives Tab (im Druckblatt alle Intervalle) */}
      {(alle ? iv.map((_, i) => i) : [activeTab]).map(i => iv[i] && (
        <div key={i}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)',
                        textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8, marginTop: alle && i > 0 ? 12 : 0 }}>
            Detail: {iv[i].label}
          </div>
          <StochasticPanel result={iv[i].result} />
        </div>
      ))}

      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
        Wartend am Ende: Fahrzeuge, die am Ende eines Intervalls noch warten (Mittel der Läufe). Sie fahren im Verkehr des folgenden Intervalls ab;
        ihre ganze Wartezeit zählt im Intervall ihrer Ankunft. Nach dem letzten Intervall läuft dessen Verkehr noch einmal so lange weiter (Annahme).
        ≥: Ein Teil der Fahrzeuge fährt auch dann nicht ab, die Werte sind Mindestwerte.
        Gesamtlaufzeit: {Math.round(result.totalDurationMs)} ms
      </div>
    </div>
  )
}

// ── Konfiguration, mit der ein Resultat gerechnet wurde ───────────────────────
function RunConfigSummary({ result }: { result: StochasticSN640022Result | StochasticMultiResult }) {
  const rc = result.config
  const rp = rc.pedestrians
  const pedsOn = [rp?.armA, rp?.armB, rp?.armC, rp?.armD].some(l => l?.enabled && l.fg > 0)
  // Querung je Arm, mit der gerechnet wurde (nur Arme mit Fussgänger*innen)
  const querungen = (['armA', 'armB', 'armC', 'armD'] as const).flatMap(k => {
    const l = rp?.[k]
    if (!l?.enabled || !(l.fg > 0)) return []
    const q = normalizePedestrianLeg(l, k === 'armB' || k === 'armD').querung
    return q === 'keine' ? [] : [`${PED_ARM_LABEL[k]}: ${QUERUNG_ERGEBNIS[q]}`]
  })
  const sigma = rc.tcSigma ?? 0.5
  return (
    <div style={{ padding: '8px 12px', borderRadius: 6, background: '#f0f9ff',
                  border: '1px solid #bae6fd', fontSize: 12, color: '#0369a1',
                  marginBottom: 12, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      <span>Modell: {(rc.useCowan ?? true) ? 'Cowan M3' : 'Exponential'}</span>
      <span>·</span>
      <span>Streuung t_c: {sigma > 0 ? `σ = ${sigma.toFixed(1)} s` : 'keine'}</span>
      {pedsOn && (
        <><span>·</span><span style={{ color: '#15803d' }}>Fussgänger*innen aktiv</span></>
      )}
      {querungen.length > 0 && (
        <><span>·</span><span style={{ color: '#15803d' }}>Querungen — {querungen.join(' · ')}</span></>
      )}
      {Object.keys(rc.gapOverrides ?? {}).length > 0 && (
        <><span>·</span><span style={{ color: '#b45309' }}>tc/tf angepasst</span></>
      )}
      {'intervals' in result && (
        <><span>·</span><span>{result.intervals.length} Intervalle</span></>
      )}
    </div>
  )
}

// ── Druckblatt ────────────────────────────────────────────────────────────────
// Gerüst wie in den anderen Rechnern (bericht/Bericht.tsx): Kopf, Ergebnis, Eingaben, Annahmen und Hinweise, Quellen.
// Eigene Rechenschritt-Tabellen hat die Simulation nicht.

/** Eingaben, mit denen ein Lauf gestartet wurde; die Fussgänger*innen und Einstellungen stehen im Resultat (config) */
export interface SimLauf {
  arms:       ArmConfiguration[]
  intervalle: { label: string; T: number; arms: ArmConfiguration[] }[] | null   // T in Minuten
}

const BT: CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: 11, marginBottom: 10 }
const BTH: CSSProperties = { border: '1px solid #555', padding: '3px 7px', background: '#d8d8d8', fontWeight: 700, textAlign: 'left', whiteSpace: 'nowrap' }
const BTHC: CSSProperties = { ...BTH, textAlign: 'center' }
const BTD: CSSProperties = { border: '1px solid #999', padding: '3px 7px' }
const BTDR: CSSProperties = { ...BTD, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }
const BTDC: CSSProperties = { ...BTD, textAlign: 'center' }
const zeile = (i: number): CSSProperties => ({ background: i % 2 === 0 ? '#f8f8f8' : '#fff' })

// Ausgabe A, B, C, (D); die Konfiguration hat die Reihenfolge A, C, B, D
const BL_ORDER_3 = [0, 2, 1]
const BL_ORDER_4 = [0, 2, 1, 3]
const BL_PED_KEY: PedArmKey[] = ['armA', 'armC', 'armB', 'armD']
const BL_RICHTUNG = [['left', 'links'], ['straight', 'geradeaus'], ['right', 'rechts']] as const
const BL_VOLUMEN = { left: 'leftVolume', straight: 'straightVolume', right: 'rightVolume' } as const
// Am dreiarmigen Knoten fehlt je Arm eine Richtung
const BL_OHNE_3: Record<number, 'left' | 'straight' | 'right'> = { 0: 'left', 1: 'right', 2: 'straight' }
const GAP_KURZ: Record<GapKey, string> = { mainLeft: 'HS-Linksabbieger', sideRight: 'NS-Rechtseinbiegen', sideCross: 'NS-Kreuzen', sideLeft: 'NS-Linkseinbiegen' }

function querungText(leg: PedestrianLegConfig | undefined, armIdx: number): { text: string; querung: Querung } {
  if (!leg) return { text: QUERUNG_ERGEBNIS.keine, querung: 'keine' }
  const l = normalizePedestrianLeg(leg, armIdx >= 2)
  if (l.querung === 'keine' || !(l.fg > 0)) return { text: QUERUNG_ERGEBNIS.keine, querung: 'keine' }
  const breite = l.fahrbahnbreite ?? DEFAULT_FAHRBAHNBREITE
  return {
    querung: l.querung,
    text: `${QUERUNG_ERGEBNIS[l.querung]}: ${l.fg} Fg/h, Gruppengrösse ρ = ${l.rho}, ${l.querung === 'trottoirueberfahrt' ? 'Breite der Einmündung' : 'Fahrbahnbreite'} ${breite} m`
      + `${l.mittelinsel ? ', Mittelinsel' : ''} · Sperrzeit ${pedBlockingTime(l).toFixed(1)} s je Gruppe`,
  }
}

export function SimulationBlatt({ result, lauf, nodeName, armCount, veraltet, karte, uebernahme, schaetzung, onClose }: {
  result:      StochasticSN640022Result | StochasticMultiResult
  lauf?:       SimLauf | null
  nodeName:    string
  armCount:    3 | 4
  veraltet:    boolean
  karte?:      KartenBezug | null
  uebernahme?: KnotenUebernahme
  schaetzung?: Schaetzung | null
  onClose:     () => void
}) {
  const arms  = lauf?.arms ?? null
  const n     = (arms?.length ?? armCount) as 3 | 4
  const is3   = n === 3
  const order = is3 ? BL_ORDER_3 : BL_ORDER_4
  const multi = 'intervals' in result
  const rc    = result.config
  const herkunft: (HerkunftArt | null)[] = []
  const merke = (h: HerkunftArt | null) => { herkunft.push(h); return h }
  const strName = (i: number) => arms?.[i]?.streetName ? ` (${arms[i].streetName})` : ''

  const stroeme = (arm: ArmConfiguration, armIdx: number) => BL_RICHTUNG.map(([r]) => is3 && BL_OHNE_3[armIdx] === r
    ? <td key={r} style={BTDC}>–</td>
    : <td key={r} style={BTDR}>{arm[BL_VOLUMEN[r]]}<Herkunft art={merke(schaetzArt(schaetzung?.stroeme[armIdx], r, arm[BL_VOLUMEN[r]]) ?? stromHerkunft(uebernahme, armIdx, r, arm[BL_VOLUMEN[r]]))} /></td>)

  const runs = multi ? result.intervals[0]?.result.runs : result.runs
  const gaps = (Object.keys(rc.gapOverrides ?? {}) as GapKey[]).filter(k => rc.gapOverrides?.[k])
  const stau = (v: number | undefined) => v !== undefined && isFinite(v) && v > 0 ? `${v} Fz` : 'unbegrenzt'

  const hinweise: ReactNode[] = [
    ...(karte?.belegt ?? []),
    ...(schaetzung && arms && schaetzungGilt(schaetzung, arms.map(a => ({ left: a.leftVolume, straight: a.straightVolume, right: a.rightVolume }))) ? [schaetzung.text] : []),
    'Eigenes Modell, kein Normverfahren. Rangfolge und Konfliktströme nach SN 640 022, Grenz- und Folgezeitlücken nach HBS 2015, Lückenmodell nach Troutbeck & Brilon, Gruppengrösse der Fussgänger*innen nach VSS 2011/308. Sperrdauer, Streuung und Horizont sind eigene Annahmen.',
    ...(arms ? [] : ['Die Verkehrsstärken des Laufs sind nicht gespeichert; das Blatt zeigt darum nur die Einstellungen der Simulation.']),
    ...((rc.useCowan ?? true) ? [`Zeitlückenverteilung Cowan M3: ${COWAN_TEXT}`] : []),
    WARTEZEIT_SIM_HINWEIS,
    'Jeder Lauf streut, darum weichen die Zahlen bei jedem Start leicht ab.',
    'Annahme: Nach dem Ende der Simulationsdauer läuft der Verkehr noch einmal so lange weiter, damit wartende Fahrzeuge abfahren können. Wer auch dann nicht abfährt, zählt mit der Wartezeit bis dorthin (Mindestwert, mit ≥ bezeichnet).',
    ...(multi ? ['Mehrere Intervalle: Die Warteschlange läuft über die Intervallgrenze weiter. Die Wartezeit eines Fahrzeugs zählt im Intervall seiner Ankunft.'] : []),
    'Die Ergebnisse ersetzen keinen Nachweis nach Norm und keine Überprüfung durch eine Fachperson.',
  ]

  return (
    <BerichtRahmen dokumentTitel={`KnotenCheck – Simulation${nodeName ? ' – ' + nodeName : ''}`} onClose={onClose}>
      <BerichtKopf
        titel="Simulation Wartezeiten"
        angaben={<>
          <b>Bezeichnung:</b> {nodeName || '—'} · <b>Knotentyp:</b> {is3 ? 'T-Knoten (3 Arme)' : 'Kreuzung (4 Arme)'}<br />
          <b>Hauptstrasse:</b> Arm A{strName(0)}, Arm C{strName(1)} · <b>Nebenstrasse:</b> Arm B{strName(2)}
          {!is3 && <>, Arm D{strName(3)}</>}
        </>}
        norm="Eigenes Modell, kein Normverfahren: Rangfolge und Konfliktströme nach SN 640 022, Grenz- und Folgezeitlücken nach HBS 2015, Kapitel S5"
        karte={karte} />

      {veraltet && (
        <div className="bericht-gesamt" style={{ background: '#ffedd5', borderColor: '#fdba74', color: '#9a3412' }}>
          Hinweis: Die Eingaben wurden nach dieser Simulation geändert. Das Blatt zeigt den Stand der letzten Simulation.
        </div>
      )}

      <Abschnitt titel="Ergebnis">
        {multi ? <MultiIntervalPanel result={result} alle /> : <StochasticPanel result={result} />}
      </Abschnitt>

      <Abschnitt titel="Eingaben" untertitel="Konfiguration, mit der gerechnet wurde">
        <RunConfigSummary result={result} />
        <ul className="bericht-hinweise">
          {runs !== undefined && <li>Simulationsläufe: {runs}</li>}
          <li>Stauraum Nebenstrasse: Arm B {stau(rc.storageB)}{!is3 && <>, Arm D {stau(rc.storageD)}</>}</li>
          {gaps.length > 0 && <li>Angepasste Zeitlücken: {gaps.map(k => {
            const g = rc.gapOverrides![k]!, d = GAP_PARAMS[k]
            return `${GAP_KURZ[k]} t_c = ${g.tc ?? d.tc} s, t_f = ${g.tf ?? d.tf} s`
          }).join(' · ')}</li>}
        </ul>
        {arms && <>
          <table style={BT}>
            <thead>
              <tr>
                <th style={BTH}>Arm</th>
                <th style={BTH}>Strasse</th>
                {!multi && BL_RICHTUNG.map(([r, t]) => <th key={r} style={BTHC}>{t} [Fz/h]</th>)}
                <th style={BTHC}>Fahrzeugarten</th>
                <th style={BTHC}>Längsneigung</th>
                <th style={BTH}>Fussgänger*innen</th>
              </tr>
            </thead>
            <tbody>
              {order.map((armIdx, i) => {
                const arm = arms[armIdx], u = uebernahme?.arme[armIdx]
                if (!arm) return null
                const q = querungText(rc.pedestrians?.[BL_PED_KEY[armIdx]], armIdx)
                return (
                  <tr key={armIdx} style={zeile(i)}>
                    <td style={BTD}>{armLabel(armIdx)}</td>
                    <td style={BTD}>{arm.streetName || '—'}<Herkunft art={merke(kartenHerkunft(u?.name, arm.streetName))} /></td>
                    {!multi && stroeme(arm, armIdx)}
                    <td style={BTDC}>{arm.vehicleMix
                      ? <>Fall 2: LW {arm.vehicleMix.pctLW} %, LZ {arm.vehicleMix.pctLZ} %, MR {arm.vehicleMix.pctMR} %, FR {arm.vehicleMix.pctFR} %<Herkunft art={merke(svHerkunft(uebernahme, armIdx, arm.vehicleMix.pctLW, arm.vehicleMix.pctLZ))} /></>
                      : 'Fall 1'}</td>
                    <td style={BTDC}>{arm.gradient ?? '—'}<Herkunft art={merke(kartenHerkunft(u?.neigung, arm.gradient))} /></td>
                    <td style={{ ...BTD, fontSize: 10 }}>{q.text}<Herkunft art={merke(kartenHerkunft<Querung>(u?.fgs ? 'fgs' : undefined, q.querung))} /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {multi && lauf?.intervalle && <>
            <h3>Verkehrsstärken je Intervall</h3>
            <table style={BT}>
              <thead>
                <tr>
                  <th style={BTH}>Intervall</th>
                  <th style={BTHC}>Dauer</th>
                  <th style={BTH}>Arm</th>
                  {BL_RICHTUNG.map(([r, t]) => <th key={r} style={BTHC}>{t} [Fz/h]</th>)}
                </tr>
              </thead>
              <tbody>
                {lauf.intervalle.map((iv, ivIdx) => order.map((armIdx, i) => {
                  const arm = iv.arms[armIdx]
                  if (!arm) return null
                  return (
                    <tr key={`${ivIdx}-${armIdx}`} style={zeile(ivIdx)}>
                      {i === 0 && <td style={BTD} rowSpan={order.length}>{iv.label}</td>}
                      {i === 0 && <td style={BTDC} rowSpan={order.length}>{iv.T} min</td>}
                      <td style={BTD}>{armLabel(armIdx)}</td>
                      {stroeme(arm, armIdx)}
                    </tr>
                  )
                }))}
              </tbody>
            </table>
          </>}
          <HerkunftLegende arten={herkunft} unbekannt={!!karte && !karte.herkunft} />
        </>}
      </Abschnitt>

      <HinweisListe hinweise={hinweise} />
      <QuellenAbschnitt normen={GRUNDLAGEN.simulation} daten={karte?.quellen ?? []} />
    </BerichtRahmen>
  )
}

// ── Hauptkomponente ───────────────────────────────────────────────────────────

export default function SimulationApp({ uebernahme: kartenUebernahme }: { uebernahme?: KnotenUebernahme }) {
  const isActive = useIsActiveModule()  // Druckblatt nur im sichtbaren Modul
  // Die Übernahme aus der Karte gilt, bis man eine Datei lädt
  const [mitKarte, setMitKarte] = useState(true)
  const uebernahme = mitKarte ? kartenUebernahme : undefined
  const [nodeName,    setNodeName]    = useState(uebernahme?.name ?? '')
  const [armCount,    setArmCount]    = useState<3 | 4>(uebernahme?.armCount ?? 3)
  const [armGewaehlt, setArmGewaehlt] = useState(!!uebernahme)   // Knotentyp hat keinen Startwert
  const [baseArms,    setBaseArms]    = useState<ArmConfiguration[]>(() => uebernahme ? intersectionAus(uebernahme).arms : defaultIntersection(3).arms)
  const [pedestrians, setPedestrians] = useState<PedestrianConfig>(() => {
    const leg = (label: string): PedestrianLegConfig => {
      const f = uebernahme?.arme.find(a => a.label === label)?.fgs
      return f ? { ...defaultLeg(), enabled: true, querung: 'fgs', mittelinsel: f.insel } : defaultLeg()
    }
    return { armA: leg('A'), armC: leg('C'), ...(uebernahme ? { armB: leg('B'), armD: leg('D') } : {}) }
  })
  const [karte, setKarte] = useState(() => uebernahme ? kartenBezugAus(uebernahme, 'simulation') : null)
  const [schaetzung, setSchaetzung] = useState<Schaetzung | null>(null)
  // Arme ohne Modellwert, für die «kein Verkehr» bestätigt ist
  const [nullOk, setNullOk] = useState<number[]>([])
  // Herkunft der Werte: aus der Übernahme, nach dem Laden aus der Datei
  const herkunftU = useMemo(() => { const h = herkunftAus(karte); return h?.armCount === armCount ? h : undefined }, [karte, armCount])
  const [gapOverrides,  setGapOverrides]  = useState<GapOverrides>({})
  const [gapGewaehlt,   setGapGewaehlt]   = useState(false)
  const [useIntervals,  setUseIntervals]  = useState(false)
  const [intervals,     setIntervals]     = useState<SimIntervalInput[]>(() => [
    defaultInterval(uebernahme?.armCount ?? 3),
  ])
  const [simConfig,     setSimConfig]     = useState<StochasticConfig>({})
  const [result,        setResult]        = useState<
    StochasticSN640022Result | StochasticMultiResult | null
  >(null)
  const [running,       setRunning]       = useState(false)
  const [lauf,          setLauf]          = useState<SimLauf | null>(null)   // Eingaben des angezeigten Resultats
  const [showBl, setShowBl] = useState(false)
  const openBl  = useCallback(() => setShowBl(true),  [])
  const closeBl = useCallback(() => setShowBl(false), [])
  // Offen, weil die Felder darin Pflicht sind
  const [showAdvanced,  setShowAdvanced]  = useState(true)
  const [showGapConfig, setShowGapConfig] = useState(true)
  const { meldung, melden, schliessen: meldungZu } = useMeldung()

  // ── Arm-Count wechseln ────────────────────────────────────────────────────

  function handleArmCount(n: 3 | 4) {
    setArmGewaehlt(true)
    if (armCount === n) return
    stopWorker()
    setArmCount(n)
    setBaseArms(defaultIntersection(n).arms)
    setSchaetzung(null)
    setIntervals([defaultInterval(n)])
    setResult(null)
  }

  // ── Arm-Update ────────────────────────────────────────────────────────────

  const setArm = useCallback((i: number, arm: ArmConfiguration) => {
    setBaseArms(prev => { const a = [...prev]; a[i] = arm; return a })
  }, [])

  // ── Simulation starten ────────────────────────────────────────────────────

  // Die Simulation läuft in einem Web Worker (eigener Thread): Die Oberfläche bleibt
  // bedienbar und ein langer Lauf lässt sich abbrechen.
  const workerRef = useRef<Worker | null>(null)
  useEffect(() => () => workerRef.current?.terminate(), [])

  // Eingaben, aus denen das angezeigte Resultat stammt (für den «veraltet»-Hinweis)
  const inputKey = JSON.stringify({ armCount, baseArms, pedestrians, gapOverrides, useIntervals, intervals, simConfig })
  const [resultKey, setResultKey] = useState('')

  // Mit Intervallen stehen die Ströme je Intervall: Der Modellvorschlag gilt dann nicht mehr
  const armSummen = baseArms.map(a => a.leftVolume + a.straightVolume + a.rightVolume)
  const modellU = useIntervals ? undefined : herkunftU
  const offen = armGewaehlt
    ? [...offenSimulation({
        arms: baseArms, beine: [pedestrians.armA, pedestrians.armC, pedestrians.armB, pedestrians.armD],
        intervalle: useIntervals ? intervals : null, zeitluecken: gapGewaehlt,
        runs: simConfig.runs, useCowan: simConfig.useCowan, tcSigma: simConfig.tcSigma,
      }), ...offeneModellAngaben(modellU, armSummen, nullOk)]
    : ['Knotentyp']

  function stopWorker() {
    workerRef.current?.terminate()
    workerRef.current = null
    setRunning(false)
  }

  function handleRun() {
    if (offen.length > 0) return
    const fullConfig: StochasticConfig = { ...simConfig, gapOverrides, pedestrians }
    let req: SimRequest
    let laufDaten: SimLauf
    if (useIntervals && intervals.length >= 1) {
      // Volumen je Intervall mit Basis-Geometrie kombinieren → konsistent mit den
      // aus baseArms abgeleiteten Lane-Flags.
      const ivs: SimInterval[] = intervals.map((iv, nr) => {
        const icfg: IntersectionConfiguration = {
          name: '', arms: mergeIntervalArms(baseArms, iv.arms),
        }
        return {
          label:      iv.label || `Intervall ${nr + 1}`,
          volumes:    toSNVolumes(icfg)!,
          rawVolumes: toSNRawVolumes(icfg) ?? undefined,
          T:          iv.T! * 60,
        }
      })
      const flags = simFlags({ name: '', arms: baseArms })
      req = { kind: 'multi', intervals: ivs, flags, config: fullConfig }
      laufDaten = { arms: baseArms, intervalle: intervals.map((iv, nr) => ({
        label: ivs[nr].label, T: iv.T!, arms: mergeIntervalArms(baseArms, iv.arms) })) }
    } else {
      const icfg: IntersectionConfiguration = { name: '', arms: baseArms }
      const volumes = toSNVolumes(icfg)
      const raw     = toSNRawVolumes(icfg)
      if (!volumes || !raw) return
      req = { kind: 'single', volumes, raw, flags: simFlags(icfg), config: fullConfig }
      laufDaten = { arms: baseArms, intervalle: null }
    }

    workerRef.current?.terminate()
    const worker = new Worker(new URL('./simulation.worker.ts', import.meta.url), { type: 'module' })
    workerRef.current = worker
    const startedWith = inputKey
    setRunning(true)
    worker.onmessage = (e: MessageEvent<SimResponse>) => {
      stopWorker()
      if (e.data.ok) {
        setResult(e.data.result)
        setResultKey(startedWith)
        setLauf(laufDaten)
      } else {
        melden(`Die Simulation ist fehlgeschlagen: ${e.data.error}`, true)
      }
    }
    worker.onerror = () => {
      stopWorker()
      melden('Die Simulation ist fehlgeschlagen.', true)
    }
    worker.postMessage(req)
  }

  // ── Save / Load ───────────────────────────────────────────────────────────

  const handleExport = () =>
    exportTool({
      tool: 'simulation', filePrefix: 'Simulation',
      name: nodeName, fallbackName: 'simulation', melden,
      data: { armCount, baseArms, pedestrians, gapOverrides, gapGewaehlt, useIntervals, intervals, simConfig, ...(karte ? { karte } : {}), ...(schaetzung ? { schaetzung } : {}), ...(nullOk.length ? { stromNullBestaetigt: nullOk } : {}) },
    })

  const handleImport = () =>
    importTool('simulation', (d, name) => {
      setKarte(kartenBezugLesen(d.karte))
      setMitKarte(false)
      setNullOk(bestaetigtLesen(d.stromNullBestaetigt))
      const n = oneOf<3 | 4>([3, 4], d.armCount, 3)
      const leer = d.leereFelder === true
      const obj = (v: unknown) => (typeof v === 'object' && v !== null ? v : {}) as Record<string, unknown>
      const pos = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : undefined
      // Fussgänger*innen je Arm
      // Fehlt die Querung in einer älteren Datei, folgt sie aus enabled, ohne eigene Breite galt der Standard. In neuen
      // Dateien heisst beides: noch nicht gewählt. Trottoirüberfahrt nur an NS-Armen (B, D), dort ohne Mittelinsel
      const leg = (v: unknown, istNS: boolean): PedestrianLegConfig => {
        const l = conform<PedestrianLegConfig>({ ...defaultLeg(), fahrbahnbreite: undefined, querung: undefined }, v)
        const gruppe = [1, 2, 3, 4, 5]
        const bein = { ...l, rho: leer ? wahl(gruppe, l.rho) ?? 0 : oneOf(gruppe, l.rho, 1),
          fahrbahnbreite: pos(l.fahrbahnbreite) ?? (leer ? undefined : DEFAULT_FAHRBAHNBREITE) }
        return leer && bein.querung === undefined ? bein : normalizePedestrianLeg(bein, istNS)
      }
      const pedRaw = obj(d.pedestrians)
      const peds: PedestrianConfig = { armA: leg(pedRaw.armA, false), armC: leg(pedRaw.armC, false) }
      if (pedRaw.armB !== undefined) peds.armB = leg(pedRaw.armB, true)
      if (n === 4 && pedRaw.armD !== undefined) peds.armD = leg(pedRaw.armD, true)
      // tc/tf-Anpassungen: nur positive Werte
      const gapRaw = obj(d.gapOverrides)
      const gaps: GapOverrides = {}
      for (const k of ['mainLeft', 'sideRight', 'sideCross', 'sideLeft'] as const) {
        const g = obj(gapRaw[k]), tc = pos(g.tc), tf = pos(g.tf)
        if (tc !== undefined || tf !== undefined)
          gaps[k] = { ...(tc !== undefined && { tc }), ...(tf !== undefined && { tf }) }
      }
      // Intervalle: Dauer aus der Auswahl, Arme passend zur Armzahl
      const ivs: SimIntervalInput[] = (Array.isArray(d.intervals) ? d.intervals : []).map((v, i) => {
        const iv = obj(v)
        return {
          id:    typeof iv.id === 'string' ? iv.id : crypto.randomUUID(),
          label: typeof iv.label === 'string' ? iv.label : `Intervall ${i + 1}`,
          T:     leer ? wahl<15 | 30 | 45 | 60>([15, 30, 45, 60], iv.T) : oneOf<15 | 30 | 45 | 60>([15, 30, 45, 60], iv.T, 60),
          arms:  conformArms(iv.arms, n, leer),
        }
      }).slice(0, 6)
      // Simulationsparameter: Auswahlwerte prüfen; Stauraum null (= gespeichertes ∞) → unbegrenzt
      const sc = obj(d.simConfig)
      const cfg: StochasticConfig = {
        runs:     leer ? wahl([50, 100, 200, 500], sc.runs) ?? undefined : oneOf([50, 100, 200, 500], sc.runs, 200),
        useCowan: typeof sc.useCowan === 'boolean' ? sc.useCowan : leer ? undefined : true,
        // Streuung t_c; ältere Dateien mit Erlang-Ordnung: k = 1 (konstant) → 0 s, sonst Standard
        tcSigma:  leer ? wahl([0, 0.5, 1], sc.tcSigma) ?? undefined : oneOf([0, 0.5, 1], sc.tcSigma, sc.erlangK === 1 ? 0 : 0.5),
        ...(pos(sc.storageB) !== undefined && { storageB: pos(sc.storageB) }),
        ...(pos(sc.storageD) !== undefined && { storageD: pos(sc.storageD) }),
      }
      stopWorker()
      setNodeName(name)
      setArmCount(n)
      setArmGewaehlt(true)
      setBaseArms(conformArms(d.baseArms, n, leer))
      setSchaetzung(schaetzungLesen(d.schaetzung, n))
      setPedestrians(peds)
      setGapOverrides(gaps)
      setGapGewaehlt(leer ? d.gapGewaehlt === true : true)
      setUseIntervals(d.useIntervals === true)
      setIntervals(ivs.length > 0 ? ivs : [defaultInterval(n)])
      setSimConfig(cfg)
      setResult(null)
    }, melden)

  // ── Intervalle verwalten ──────────────────────────────────────────────────

  function addInterval() {
    setIntervals(prev => [
      ...prev,
      defaultInterval(armCount),
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
    <main style={{ maxWidth: 1280, margin: '0 auto', padding: '20px 16px',
                   fontFamily: 'system-ui, sans-serif' }}>
      <Meldung text={meldung} onClose={meldungZu} />
      {uebernahme && <UebernahmeHinweis u={uebernahme} rechner="simulation" />}
      <SoFunktionierts rechner="simulation" />
      {karte && <BelastungsVergleich vergleich={karte.vergleich}
        querschnitte={querschnitteKnoten(baseArms.map(a => ({ left: a.leftVolume, straight: a.straightVolume, right: a.rightVolume })))} />}


      {/* ── Header ── */}
      <div className="kachel" style={{ padding: '12px 20px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <input type="text" value={nodeName} onChange={e => setNodeName(e.target.value)}
          placeholder="Bezeichnung der Simulation"
          style={{ flexBasis: '100%', padding: '5px 10px', borderRadius: 5,
                   border: '1px solid var(--border)', fontSize: 14, fontWeight: 600, color: 'var(--text-strong)' }} />

        <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)' }}>Knotentyp</span>
        {([3, 4] as const).map(n => (
          <ToggleBtn key={n} active={armGewaehlt && armCount === n} onClick={() => handleArmCount(n)}>
            {n === 3 ? 'T-Knoten (3 Arme)' : 'Kreuzung (4 Arme)'}
          </ToggleBtn>
        ))}

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
          <BerichtKnopf onClick={openBl} bereit={!!result && !running} />
          <ToolbarBtn onClick={handleExport}>Fall speichern</ToolbarBtn>
          <ToolbarBtn onClick={handleImport}>Fall laden</ToolbarBtn>
        </div>
      </div>

      {!armGewaehlt && <OffeneAngaben liste={offen} />}

      {armGewaehlt && <ModellLuecken u={modellU} summen={armSummen} bestaetigt={nullOk} onBestaetigen={i => setNullOk(n => [...n, i])} />}

      {/* ── Layout: Input | Ergebnisse ── */}
      {armGewaehlt && <div className="layout-grid">

        {/* ─── Input-Panel ─── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          {!useIntervals && <ArmmengenSchaetzung key={armCount} labels={baseArms.map((_, i) => ['A', 'C', 'B', 'D'][i])} namen={baseArms.map(a => a.streetName)}
            kreisel={false} hauptstrasse stand={schaetzung} onAnwenden={s => {
              setSchaetzung(s)
              setBaseArms(prev => prev.map((a, i) => ({ ...a, leftVolume: s.stroeme[i].left, straightVolume: s.stroeme[i].straight, rightVolume: s.stroeme[i].right })))
            }} />}

          {/* Arm-Cards mit FG-Eingabe als Footer */}
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)',
                        textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
            {useIntervals ? 'Basis-Geometrie (Geometrie-Flags)' : 'Verkehrsbelastung'}
          </div>
          {baseArms.map((arm, i) => {
            const pedKey: PedArmKey = i === 0 ? 'armA' : i === 1 ? 'armC' : i === 2 ? 'armB' : 'armD'
            const leg = pedestrians[pedKey] ?? defaultLeg()
            return (
              <ArmCard key={arm.id} arm={arm} index={i} isHS={i < 2} herkunft={herkunftU?.arme[i]} schaetzung={useIntervals ? undefined : schaetzung?.stroeme[i]}
                armCount={armCount} hideMixedLane hideIsland live
                onChange={a => setArm(i, a)}
                footer={
                  <PedFooter leg={leg} isHS={i < 2}
                    onChange={l => setPedestrians(prev => ({ ...prev, [pedKey]: l }))} />
                } />
            )
          })}

          {/* Zeitintervalle-Toggle */}
          <div style={{ border: '1px solid var(--kachel-rand)', borderRadius: 8, overflow: 'hidden',
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
                    defaultInterval(armCount),
                  ])
                }
              }} />
              <div>
                <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-strong)' }}>
                  Mehrere Zeitintervalle
                </span>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 8 }}>
                  Die Warteschlange läuft über die Intervalle weiter
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
                    className="knopf zweit breit">
                    + Zeitintervall hinzufügen
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Erweiterte Sim-Parameter */}
          <div style={{ border: '1px solid var(--kachel-rand)', borderRadius: 8, overflow: 'hidden',
                        background: '#fff' }}>
            <button onClick={() => setShowAdvanced(a => !a)}
              style={{ width: '100%', padding: '8px 14px', background: '#f8fafc',
                       border: 'none', cursor: 'pointer', textAlign: 'left',
                       display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>
                Erweiterte Einstellungen
              </span>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {showAdvanced ? '▲' : '▼'}
              </span>
            </button>
            {showAdvanced && (
              <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>

                {/* Simulationsläufe */}
                <div>
                  <div style={{ fontWeight: 600, color: 'var(--text)', fontSize: 12, marginBottom: 4 }}>
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
                  <div style={{ fontWeight: 600, color: 'var(--text)', fontSize: 12, marginBottom: 4 }}>
                    Zeitlückenverteilung Hauptstrom
                  </div>
                  {[
                    { val: false, label: 'Exponential', desc: EXPONENTIAL_TEXT },
                    { val: true,  label: 'Cowan M3',    desc: COWAN_TEXT },
                  ].map(o => (
                    <label key={String(o.val)}
                      style={{ display: 'flex', alignItems: 'flex-start', gap: 8,
                               cursor: 'pointer', marginBottom: 3 }}>
                      <input type="radio" checked={simConfig.useCowan === o.val}
                        onChange={() => setSimConfig(c => ({ ...c, useCowan: o.val }))}
                        style={{ marginTop: 2, flexShrink: 0 }} />
                      <span style={{ fontSize: 12 }}>
                        <strong>{o.label}</strong>
                        <span style={{ color: 'var(--text-muted)', marginLeft: 6 }}>{o.desc}</span>
                      </span>
                    </label>
                  ))}
                </div>

                {/* Streuung der Grenzzeitlücke */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 12, color: 'var(--text)', fontWeight: 600 }}>
                      Streuung t_c zwischen Fahrer*innen
                    </span>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {([0, 0.5, 1] as const).map(sd => (
                        <ToggleBtn key={sd} small active={simConfig.tcSigma === sd}
                          onClick={() => setSimConfig(c => ({ ...c, tcSigma: sd }))}>
                          {sd === 0 ? 'keine (konstant)' : `σ = ${sd.toFixed(1)} s`}
                        </ToggleBtn>
                      ))}
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>
                    Lognormal um den Nominalwert t_c. «keine» entspricht der Annahme des analytischen Verfahrens.
                  </div>
                </div>

                {/* Stauraum */}
                <div>
                  <div style={{ fontWeight: 600, color: 'var(--text)', fontSize: 12, marginBottom: 4 }}>
                    Stauraum Nebenstrasse
                    <span style={{ fontWeight: 400, color: 'var(--text-muted)', marginLeft: 6 }}>leer = unbegrenzt</span>
                  </div>
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    {(['B', 'D'] as const).slice(0, armCount === 3 ? 1 : 2).map(arm => (
                      <label key={arm} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ color: 'var(--text)', fontSize: 12 }}>Arm {arm}</span>
                        <input type="number" min={1} max={99}
                          value={
                            (arm === 'B' ? simConfig.storageB : simConfig.storageD) === undefined ||
                            !isFinite((arm === 'B' ? simConfig.storageB : simConfig.storageD) ?? Infinity)
                              ? '' : (arm === 'B' ? simConfig.storageB : simConfig.storageD)
                          }
                          placeholder="∞"
                          onChange={e => {
                            // leer oder 0 = unbegrenzt
                            const v = e.target.value === '' || !(Number(e.target.value) > 0)
                              ? Infinity : Number(e.target.value)
                            setSimConfig(c => arm === 'B' ? { ...c, storageB: v } : { ...c, storageD: v })
                          }}
                          style={{ width: 56, padding: '3px 6px', borderRadius: 4,
                                   border: '1px solid var(--border)', fontSize: 12, textAlign: 'right' }} />
                        <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>Fz</span>
                      </label>
                    ))}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                    Ausgewiesen wird, wie viele Fahrzeuge den Stauraum voll antreffen. Sie warten dahinter weiter
                    und zählen in den Wartezeiten mit.
                  </div>
                </div>

                {/* tc/tf Override */}
                <div>
                  <button onClick={() => setShowGapConfig(g => !g)}
                    style={{ fontSize: 12, color: 'var(--text-muted)', background: 'none',
                             border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}>
                    {showGapConfig ? '▲ Grenz-/Folgezeitlücken ausblenden' : '▼ Grenz-/Folgezeitlücken (tc/tf) anpassen'}
                  </button>
                  {showGapConfig && (
                    <div style={{ marginTop: 8, padding: '10px 12px', borderRadius: 6,
                                  background: '#f8fafc', border: '1px solid var(--kachel-rand)' }}>
                      <GapConfigSection overrides={gapOverrides} gewaehlt={gapGewaehlt}
                        onChange={o => { setGapOverrides(o); setGapGewaehlt(true) }} />
                      {Object.keys(gapOverrides).length > 0 && (
                        <button onClick={() => { setGapOverrides({}); setGapGewaehlt(false) }}
                          style={{ marginTop: 8, fontSize: 12, color: '#dc2626',
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
          {/* Leer-Zustand: Schema zuerst, damit es beim Erfassen sichtbar ist (die Liste der fehlenden Angaben folgt darunter) */}
          {!result && !running && (
            <div style={{ padding: '16px', borderRadius: 12, background: '#f8fafc',
                          border: '1px solid var(--kachel-rand)', textAlign: 'center', color: 'var(--text-muted)',
                          fontSize: 14, marginBottom: 16 }}>
              <img
                src={armCount === 3 ? einmuendungSvg : kreuzungSvg}
                alt={armCount === 3 ? 'T-Knoten Schema' : 'Kreuzung Schema'}
                style={{ width: '100%', maxHeight: 220, objectFit: 'contain',
                         marginBottom: 12, display: 'block' }}
              />
              Simulation starten um Wartezeit-Verteilungen, Histogramme und Percentile (P50/P85/P95)
              je Verkehrsstrom zu berechnen.
              {[pedestrians.armA, pedestrians.armC, pedestrians.armB, pedestrians.armD].some(l => l?.enabled) ? (
                <div style={{ marginTop: 8, fontSize: 12, color: '#15803d' }}>
                  Fussgänger*innen aktiv — Blocking-Events werden simuliert.
                </div>
              ) : null}
              {Object.keys(gapOverrides).length > 0 ? (
                <div style={{ marginTop: 4, fontSize: 12, color: '#b45309' }}>
                  Benutzerdefinierte tc/tf-Werte aktiv.
                </div>
              ) : null}
            </div>
          )}

          {/* Run-Button */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <button onClick={handleRun} disabled={running || offen.length > 0}
              className="knopf" style={{ flex: 1 }}>
              {running ? 'Simulation läuft…' : result ? 'Neu starten' : 'Simulation starten'}
            </button>
            {running && (
              <button onClick={stopWorker}
                style={{ padding: '10px 14px', borderRadius: 8, fontSize: 14, cursor: 'pointer',
                         border: '1px solid #dc2626', background: '#fff', color: '#dc2626', fontWeight: 700 }}>
                Abbrechen
              </button>
            )}
            {result && (
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {isMultiResult
                  ? `${(result as StochasticMultiResult).intervals.length} Intervalle · ${Math.round((result as StochasticMultiResult).totalDurationMs)} ms`
                  : `${(result as StochasticSN640022Result).runs} Läufe · ${Math.round((result as StochasticSN640022Result).durationMs)} ms`
                }
              </span>
            )}
          </div>

          {offen.length > 0 && !running && <OffeneAngaben liste={offen} />}

          {/* Eingaben seit dem Lauf geändert → Resultat passt nicht mehr zur Anzeige links */}
          {result && !running && resultKey !== inputKey && (
            <div className="hinweis klein" style={{ marginBottom: 12 }}>
              Die Eingaben wurden seit der letzten Simulation geändert — das Resultat ist veraltet.
              Bitte neu starten.
            </div>
          )}

          {/* Konfiguration, mit der das angezeigte Resultat gerechnet wurde */}
          {result && <RunConfigSummary result={result} />}

          {/* Ergebnis-Anzeige */}
          {result && !isMultiResult && (
            <StochasticPanel result={result as StochasticSN640022Result} />
          )}
          {result && isMultiResult && (
            <MultiIntervalPanel result={result as StochasticMultiResult} />
          )}
        </div>
      </div>}

      <HilfeUnten rechner="simulation" legende={LEGEND_ITEMS} quellen={karte?.quellen} />

      <RechnerFuss>
        Eigenes Modell, kein Normverfahren. Rangfolge und Konfliktströme nach SN 640 022, Grenz- und Folgezeitlücken nach HBS 2015, Lückenmodell nach Troutbeck &amp; Brilon, Gruppengrösse der Fussgänger*innen nach VSS 2011/308. Sperrdauer, Streuung und Horizont sind eigene Annahmen. Die Ergebnisse ersetzen keinen Nachweis nach Norm und keine Überprüfung durch eine Fachperson.
      </RechnerFuss>

      {/* Druckblatt: Resultat mit den Eingaben, mit denen es gerechnet wurde */}
      {isActive && result && showBl && createPortal(
        <SimulationBlatt result={result} lauf={lauf} nodeName={nodeName} armCount={armCount}
          veraltet={resultKey !== inputKey} karte={karte} uebernahme={herkunftU} schaetzung={schaetzung} onClose={closeBl} />,
        document.body,
      )}
    </main>
  )
}
