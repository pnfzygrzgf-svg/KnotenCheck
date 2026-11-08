// Arm-Eingabekarte und Bewegungs-Labels nach SN 640 022
// Geteilt zwischen SN022App (analytischer Rechner) und SimulationApp

import { armLabel, armFactor, pctPW } from './engine/armConfiguration'
import type {
  ArmConfiguration, GradientCategory, VehicleCategoryMix,
} from './engine/armConfiguration'
import type { MixedLaneCombination } from './engine/types'
import { LeereWahl, NumInput, Row, SectionLabel, Ckbx, ToggleBtn } from './ui'
import { HerkunftMarke } from './HerkunftMarke'
import { kartenHerkunft, schaetzArt, streifenArt, stromArt, svFeldArt } from './bericht/herkunft'
import type { ArmStroeme } from './engine/armmengen'
import type { UebernahmeArm } from './karte/rechner'

const RICHTUNG = { leftVolume: 'left', straightVolume: 'straight', rightVolume: 'right' } as const

// ── Konstanten ─────────────────────────────────────────────────────────────────

const GRADIENT_OPTIONS: { value: GradientCategory; label: string }[] = [
  { value: '+4%', label: '+4 % (stark bergauf)' },
  { value: '+2%', label: '+2 % (mässig bergauf)' },
  { value: '±0%', label: '±0 % (eben)' },
  { value: '-2%', label: '-2 % (mässig bergab)' },
  { value: '-4%', label: '-4 % (stark bergab)' },
]

const MIXED_OPTIONS: { value: MixedLaneCombination; labelB: string; labelD: string; desc: string }[] = [
  { value: 'all',            labelB: 'Alle geteilt (4+5+6)', labelD: 'Alle geteilt (10+11+12)', desc: 'Alle NS-Ströme auf gemeinsamem Streifen' },
  { value: 'leftAndThrough', labelB: 'Links+Kreuzen (4+5)',  labelD: 'Links+Kreuzen (10+11)',   desc: 'Rechtseinbieger auf eigenem Streifen' },
  { value: 'throughAndRight',labelB: 'Kreuzen+Rechts (5+6)', labelD: 'Kreuzen+Rechts (11+12)', desc: 'Linkseinbieger auf eigenem Streifen' },
]

// Bewegungs-Labels je Arm und Knotentyp
function getMovements(index: number, armCount: number): { label: string; key: keyof ArmConfiguration }[] {
  if (armCount === 3) {
    if (index === 0) return [
      { label: 'Geradeaus →C',      key: 'straightVolume' },
      { label: 'Rechtsabbiegen →B', key: 'rightVolume' },
    ]
    if (index === 1) return [
      { label: 'Linksabbiegen →B',  key: 'leftVolume' },
      { label: 'Geradeaus →A',      key: 'straightVolume' },
    ]
    return [
      { label: 'Linkseinbiegen →A',  key: 'leftVolume' },
      { label: 'Rechtseinbiegen →C', key: 'rightVolume' },
    ]
  }
  if (index === 0) return [
    { label: 'Linksabbiegen →D',  key: 'leftVolume' },
    { label: 'Geradeaus →C',      key: 'straightVolume' },
    { label: 'Rechtsabbiegen →B', key: 'rightVolume' },
  ]
  if (index === 1) return [
    { label: 'Linksabbiegen →B',  key: 'leftVolume' },
    { label: 'Geradeaus →A',      key: 'straightVolume' },
    { label: 'Rechtsabbiegen →D', key: 'rightVolume' },
  ]
  if (index === 2) return [
    { label: 'Linkseinbiegen →A',  key: 'leftVolume' },
    { label: 'Kreuzen →D',         key: 'straightVolume' },
    { label: 'Rechtseinbiegen →C', key: 'rightVolume' },
  ]
  return [
    { label: 'Linkseinbiegen →C',  key: 'leftVolume' },
    { label: 'Kreuzen →B',         key: 'straightVolume' },
    { label: 'Rechtseinbiegen →A', key: 'rightVolume' },
  ]
}


// ── MixedLaneHint ──────────────────────────────────────────────────────────────

export function MixedLaneHint({ index, arm, opposingHSSeparateLane }: {
  index: number; arm: ArmConfiguration; opposingHSSeparateLane: boolean
}) {
  const isB = index === 2
  const streams = isB
    ? { right: '6 (B→C)', left: '4 (B→A)', through: '5 (B→D)', leftThrough: '4+5', throughRight: '5+6', all: '4+5+6' }
    : { right: '12 (D→A)', left: '10 (D→C)', through: '11 (D→B)', leftThrough: '10+11', throughRight: '11+12', all: '10+11+12' }
  const opposingArm = isB ? 'A' : 'C'

  // Bestimme kontextabhängige Empfehlung
  let recommendation: { combo: string; reason: string } | null = null
  if (arm.hasRightTurnTriangleIsland) {
    recommendation = {
      combo: `Links+Kreuzen (${streams.leftThrough})`,
      reason: `Die Dreiecksinsel ist aktiv: Der NS-Rechtsabbieger (Strom ${streams.right}) wartet an einer baulich getrennten Haltlinie und gehört nicht zum Mischstreifen.`,
    }
  } else if (opposingHSSeparateLane) {
    if (isB) {
      recommendation = {
        combo: `Links+Kreuzen (${streams.leftThrough})`,
        reason: `Arm A hat einen separaten Rechtsabbiegestreifen: Strom ${streams.right} muss nur dem rechten Fahrstreifen von A Vortritt geben und erhält dadurch deutlich mehr Kapazität als Strom ${streams.left} und ${streams.through}. Das Berechnungsbeispiel Ziff. 22 der Norm (S. 13–14) wählt in diesem Fall Links+Kreuzen — der Rechtseinbieger wird separat beurteilt.`,
      }
    } else {
      recommendation = {
        combo: `Links+Kreuzen (${streams.leftThrough})`,
        reason: `Arm C hat einen separaten Rechtsabbiegestreifen: Strom ${streams.right} muss nur dem rechten Fahrstreifen von C Vortritt geben und erhält mehr Kapazität. Annahme: gleich behandelt wie Arm B im Berechnungsbeispiel Ziff. 22 (S. 13–14); das Beispiel selbst zeigt für Arm D keinen solchen Fall.`,
      }
    }
  }

  return (
    <div style={{ margin: '0 14px 10px', padding: '10px 12px', borderRadius: 6,
                  background: '#f8fafc', border: '1px solid var(--kachel-rand)', fontSize: 12,
                  color: 'var(--text)', lineHeight: 1.6 }}>
      <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>
        Was bedeuten die Optionen? (SN 640 022, Ziff. 13, S. 7)
      </div>
      <div style={{ marginBottom: 4 }}>
        <strong>Formel:</strong> L_m = Σqᵢ / Σaᵢ — harmonisches Mittel der Einzelströme.
        Ein stark belasteter Strom senkt die Mischstreamkapazität der gesamten Gruppe.
        Deshalb ist wichtig, nur Ströme zusammenzufassen die wirklich hinter derselben Haltlinie warten.
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: recommendation ? 8 : 0 }}>
        <div>
          <strong>Alle ({streams.all}):</strong> Der NS-Arm hat einen einzigen Fahrstreifen.
          Linkseinbiegen, Kreuzen und Rechtseinbiegen teilen dieselbe Haltlinie — alle drei Ströme werden gemeinsam beurteilt.
        </div>
        <div>
          <strong>Links+Kreuzen ({streams.leftThrough}):</strong> Zwei Fahrstreifen auf dem NS-Arm.
          Linker Streifen: Linkseinbiegen + Kreuzen.
          Rechter Streifen: nur Rechtseinbiegen (Strom {streams.right} wird separat beurteilt).
        </div>
        <div>
          <strong>Kreuzen+Rechts ({streams.throughRight}):</strong> Zwei Fahrstreifen auf dem NS-Arm.
          Linker Streifen: nur Linkseinbiegen (Strom {streams.left} separat).
          Rechter Streifen: Kreuzen + Rechtseinbiegen gemeinsam.
        </div>
      </div>
      {recommendation && (
        <div className="anleitung klein" style={{ marginTop: 6 }}>
          <span style={{ fontWeight: 700 }}>Empfehlung: {recommendation.combo}</span>
          <br />{recommendation.reason}
        </div>
      )}
      {!recommendation && (
        <div style={{ marginTop: 4, color: 'var(--text-muted)' }}>
          <strong>Standard:</strong> Keine besonderen geometrischen Bedingungen erkannt.
          Wähle «Alle», wenn der NS-Arm einstreifig ist — andernfalls entsprechend der Fahrstreifenmarkierung auf dem Arm {opposingArm} gegenüber.
        </div>
      )}
    </div>
  )
}

// ── ArmCard ────────────────────────────────────────────────────────────────────

export function ArmCard({ arm, index, isHS, armCount, opposingHSSeparateLane, onChange, footer, geometryLocked, hideMixedLane, hideIsland, live, herkunft, schaetzung }: {
  arm: ArmConfiguration; index: number; isHS: boolean; armCount: number
  /** Arm der Übernahme aus der Karte: Marken «Modell» bzw. «Karte», solange ein Wert noch gleich ist */
  herkunft?: UebernahmeArm
  /** Aus gezählten Armmengen geschätzte Ströme dieses Arms: Marke «geschätzt», solange ein Wert noch gleich ist */
  schaetzung?: ArmStroeme
  opposingHSSeparateLane: boolean
  onChange: (a: ArmConfiguration) => void
  footer?: React.ReactNode
  // Nur Verkehrsmengen editierbar; Neigung & Geometrie stammen aus der Basis-Konfiguration
  geometryLocked?: boolean
  // Mischstreifen-Kombination (F21) ausblenden — z. B. im Simulations-Rechner,
  // der die NS-Ströme ohnehin immer an einer gemeinsamen Haltlinie simuliert.
  hideMixedLane?: boolean
  // Dreiecksinsel ausblenden — die Simulation kennt nur eine Haltelinie je Arm
  hideIsland?: boolean
  // Zahlenfelder live aktualisieren (jeder Tastendruck) statt erst bei Blur —
  // im Simulations-Rechner aktiviert, damit Karten-Total, f und PW% live mitlaufen.
  live?: boolean
}) {
  const lbl  = armLabel(index)
  const col  = isHS ? '#1d4ed8' : '#c2410c'
  const bg   = isHS ? '#eff6ff' : '#fff7ed'
  const bd   = isHS ? '#bfdbfe' : '#fed7aa'
  const f     = armFactor(arm)
  const fText = f === null ? '–' : f.toFixed(2)
  const mix  = arm.vehicleMix

  const upd = <K extends keyof ArmConfiguration>(k: K, v: ArmConfiguration[K]) =>
    onChange({ ...arm, [k]: v })
  const updMix = (k: keyof VehicleCategoryMix, v: number) =>
    mix && onChange({ ...arm, vehicleMix: { ...mix, [k]: v } })

  const pw = mix ? pctPW(mix) : null
  const pwOk = !mix || mix.pctLW + mix.pctLZ + mix.pctMR + mix.pctFR <= 100

  const movements = getMovements(index, armCount)
  // Nur Bewegungen dieses Arms zählen; am T-Knoten gibt es nicht alle drei
  const tot = movements.reduce((s, m) => s + (arm[m.key] as number), 0)
  const isNS4arm  = !isHS && armCount === 4

  // Welche Geometrie-Fussnoten sind überhaupt wirksam?
  // T-Knoten (3 Arme): Nur Arm A (index 0) hat einen HS-Rechtsabbieger → Fn 1/2/3
  // wirken nur dort; Arm C (index 1) hat keinen Rechtsabbieger. Arm B (NS) hat keinen
  // gegenüberliegenden Linkseinbieger (Strom 10) → Fn 4 ist wirkungslos.
  // Kreuzung (4 Arme): alle Arme haben Rechtsabbieger → alle Fussnoten wirksam.
  const showHSGeom = isHS && (armCount === 4 || index === 0)
  // HS-Linksabbieger (Strom 1/7) → separater Linksabbiegestreifen (Ziffer 14 / F22):
  // T-Knoten nur Arm C (index 1, Strom 7); Kreuzung beide HS-Arme (Strom 1 und 7).
  const showLeftLane = isHS && (armCount === 4 || index === 1)
  const showNSGeom = !isHS && armCount === 4 && !(hideIsland && hideMixedLane)
  const showGeom   = showHSGeom || showLeftLane || showNSGeom

  return (
    <div style={{ border: `1px solid ${bd}`, borderRadius: 12, overflow: 'hidden', background: '#fff' }}>

      {/* Kopfzeile */}
      <div style={{ background: bg, padding: '10px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <div>
            <span style={{ fontWeight: 700, fontSize: 15, color: col }}>Arm {lbl}</span>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 8 }}>
              {Math.round(tot)} Fz/h · f = {fText}
            </span>
          </div>
          <span style={{ fontSize: 12, color: col, background: isHS ? '#dbeafe' : '#ffedd5',
                         padding: '2px 8px', borderRadius: 12, fontWeight: 600 }}>
            {isHS ? 'Hauptstrasse' : 'Nebenstrasse'}
          </span>
        </div>
        {arm.streetName && kartenHerkunft(herkunft?.name, arm.streetName) && <div style={{ fontSize: 12, marginBottom: 4 }}>Strassenname<HerkunftMarke art="K" /></div>}
        <input type="text" value={arm.streetName}
          onChange={e => upd('streetName', e.target.value)}
          placeholder="Strassenname"
          style={{ width: '100%', padding: '3px 8px', borderRadius: 4,
                   border: `1px solid ${bd}`, fontSize: 12,
                   background: '#ffffffaa', color: 'var(--text)' }} />
      </div>

      {/* Verkehrsmengen */}
      <SectionLabel title="Verkehrsmengen" />
      {movements.map(m => (
        <Row key={m.key} label={m.label}>
          <HerkunftMarke art={schaetzArt(schaetzung, RICHTUNG[m.key as keyof typeof RICHTUNG], arm[m.key] as number) ?? stromArt(herkunft, RICHTUNG[m.key as keyof typeof RICHTUNG], arm[m.key] as number)} />
          <NumInput value={arm[m.key] as number} onChange={v => upd(m.key, v)} live={live} />
          <span style={{ fontSize: 12, color: 'var(--text-muted)', width: 30 }}>Fz/h</span>
        </Row>
      ))}

      {geometryLocked && (
        <div style={{ padding: '6px 14px', fontSize: 12, color: 'var(--text-muted)',
                      borderTop: '1px solid var(--kachel-rand)' }}>
          Neigung &amp; Geometrie aus Basis-Konfiguration
        </div>
      )}

      {!geometryLocked && (<>
      {/* Umrechnung in PWE/h — Ziffer 8 (Fall 1 / Fall 2) */}
      <SectionLabel title="Umrechnung der Verkehrsbelastungen in PWE/h der einzelnen Nebenströme" />
      <div style={{ padding: '8px 14px 6px', borderBottom: '1px solid var(--kachel-rand)' }}>
        <div style={{ display: 'flex', gap: 6 }}>
          <ToggleBtn small active={arm.fall === 1}
            onClick={() => onChange({ ...arm, fall: 1, vehicleMix: undefined })}>
            Fall 1 — Kategorien unbekannt
          </ToggleBtn>
          <ToggleBtn small active={arm.fall === 2}
            onClick={() => onChange({ ...arm, fall: 2, vehicleMix: mix ?? { pctLW: 0, pctLZ: 0, pctMR: 0, pctFR: 0 } })}>
            Fall 2 — Kategorien bekannt
          </ToggleBtn>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 5 }}>
          Fall 1: f pauschal nach Tab. 1. · Fall 2: f je Fahrzeugkategorie nach Tab. 2 (beide Ziff. 8, S. 4).
          In beiden Fällen ist die Neigung massgebend.
          {mix && <> <strong style={{ color: 'var(--text-muted)' }}>Annahme:</strong> Die Anteile gelten für
          alle Ströme dieses Arms; die Norm rechnet je Strom.</>}
        </div>
      </div>
      <Row label="Neigung der Zufahrt"
           sub={`in Fahrtrichtung zum Knoten · f = ${fText}${arm.fall ? ` (${arm.fall === 2 ? 'Fall 2, Tab. 2' : 'Fall 1, Tab. 1'})` : ''}`}>
        <HerkunftMarke art={kartenHerkunft(herkunft?.neigung, arm.gradient)} />
        <select value={arm.gradient ?? ''}
          onChange={e => {
            const g = e.target.value as GradientCategory
            // FR (Fahrräder) ist nur bei ±0 % definiert (Tab. 2) — beim Verlassen zurücksetzen,
            // sonst zählt pctFR fälschlich im Nenner von effectiveFactor mit.
            if (mix && g !== '±0%' && mix.pctFR)
              onChange({ ...arm, gradient: g, vehicleMix: { ...mix, pctFR: 0 } })
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
      {mix && (
        <>
          {([
            { key: 'pctLW' as const, label: 'LW – Lastwagen' },
            { key: 'pctLZ' as const, label: 'LZ – Lastzüge' },
            { key: 'pctMR' as const, label: 'MR – Motorräder' },
            ...(arm.gradient === '±0%' ? [{ key: 'pctFR' as const, label: 'FR – Fahrräder' }] : []),
          ]).map(r => (
            <Row key={r.key} label={r.label}>
              {(r.key === 'pctLW' || r.key === 'pctLZ') && <HerkunftMarke art={svFeldArt(herkunft, r.key === 'pctLW' ? 'lw' : 'lz', mix[r.key])} />}
              <NumInput value={mix[r.key]} onChange={v => updMix(r.key, v)} min={0} max={100} width={60} live={live} />
              <span style={{ fontSize: 12, color: 'var(--text-muted)', width: 16 }}>%</span>
            </Row>
          ))}
          <Row label="PW – Personenwagen" sub="Ergibt sich aus den übrigen Anteilen">
            <span style={{ fontSize: 14, fontWeight: 600, color: pwOk ? 'var(--text)' : '#dc2626' }}>
              {pw !== null ? Math.round(pw) : 0} %
            </span>
            {!pwOk && <span style={{ fontSize: 12, color: '#dc2626', marginLeft: 4 }}>Summe &gt; 100 %</span>}
          </Row>
        </>
      )}

      {/* Massgebende Hauptstrombelastung (Ziffer 7) — Fussnoten je Knotentyp */}
      {showGeom && (<>
      <SectionLabel title="Massgebende Hauptstrombelastung (Ziff. 7, S. 3)" />
      <div style={{ padding: '7px 14px', fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5,
                    borderBottom: '1px solid var(--kachel-rand)' }}>
        Bauliche Merkmale (Fussnoten 1–4, S. 3) bestimmen, welche Hauptströme in die massgebende
        Konfliktbelastung qpi eingehen — jede aktivierte Option senkt qpi und erhöht damit die
        Leistungsfähigkeit.
      </div>
      {isHS ? (
        <>
          {showHSGeom && (<>
          <Row label="Rechtsabbieger auf separatem Streifen"
               sub="Der halbe Rechtsabbiegeverkehr zählt für die Nebenstrasse nicht mehr (Fussnote 1, S. 3)">
            <HerkunftMarke art={streifenArt(herkunft, 'rechts', arm.hasSeparateTurnLane)} />
            <Ckbx checked={arm.hasSeparateTurnLane} onChange={v => upd('hasSeparateTurnLane', v)} />
          </Row>
          {!hideIsland && (
            <Row label="Dreiecksinsel für HS-Rechtsabbieger"
                 sub="Nur mit «Kein Vortritt» oder «Stop» an der Insel: Rechtsabbieger zählen für Linksabbieger und kreuzende Ströme nicht mehr (Fussnote 3, S. 3). Der halbe Wert für die Nebenstrasse entfällt erst mit dem separaten Streifen oben">
              <Ckbx checked={arm.hasRightTurnTriangleIsland} onChange={v => upd('hasRightTurnTriangleIsland', v)} />
            </Row>
          )}
          <Row label="Hauptstrasse mehrstreifig"
               sub="Für Rechtseinbieger zählt nur die Belastung des rechten Fahrstreifens (Fussnote 2, S. 3)">
            {/* Startwert = ganzer Geradeausverkehr: keine Entlastung, bis der Wert des
                rechten Fahrstreifens eingetragen ist */}
            <Ckbx checked={arm.rightLaneVolume !== undefined}
              onChange={on => upd('rightLaneVolume', on ? arm.straightVolume : undefined)} />
          </Row>
          {arm.rightLaneVolume !== undefined && (
            <Row label="Belastung rechter Fahrstreifen">
              <NumInput value={arm.rightLaneVolume} onChange={v => upd('rightLaneVolume', v)} live={live}
                max={arm.straightVolume} />
              <span style={{ fontSize: 12, color: 'var(--text-muted)', width: 30 }}>Fz/h</span>
            </Row>
          )}
          </>)}
          {showLeftLane && (
            <Row label="Separater Linksabbiegestreifen (HS-Linksabbieger)"
                 sub="Ohne eigenen Streifen staut der HS-Linksabbieger den durchgehenden Verkehr zurück; das senkt die Leistungsfähigkeit der Nebenströme (Ziff. 14, S. 7–8)">
              <HerkunftMarke art={streifenArt(herkunft, 'links', arm.hasLeftTurnLane ?? true)} />
              <Ckbx checked={arm.hasLeftTurnLane ?? true} onChange={v => upd('hasLeftTurnLane', v)} />
            </Row>
          )}
        </>
      ) : (
        <>
          {!hideIsland && (
            <Row label="Dreiecksinsel für NS-Rechtsabbieger"
                 sub="Nur mit «Kein Vortritt» oder «Stop» an der Insel: Rechtseinbieger zählen für den gegenüberliegenden Linkseinbieger nicht mehr (Fussnote 4, S. 3)">
              <Ckbx checked={arm.hasRightTurnTriangleIsland} onChange={v => upd('hasRightTurnTriangleIsland', v)} />
            </Row>
          )}
          {isNS4arm && !hideMixedLane && (
            <>
              <div style={{ padding: '7px 14px 4px', borderBottom: '1px solid var(--kachel-rand)' }}>
                <div style={{ fontSize: 14, color: 'var(--text)' }}>Mischstreifen-Kombination</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 1 }}>
                  Welche NS-Ströme teilen dieselbe Wartelinie (Ziff. 13, S. 7)
                </div>
              </div>
              {MIXED_OPTIONS.map(o => (
                <div key={o.value} onClick={() => upd('mixedLaneCombination', o.value)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10,
                           padding: '6px 14px', cursor: 'pointer',
                           borderBottom: '1px solid var(--kachel-rand)',
                           background: arm.mixedLaneCombination === o.value ? '#f0f9ff' : '#fff' }}>
                  <input type="radio" readOnly checked={arm.mixedLaneCombination === o.value}
                    style={{ flexShrink: 0, accentColor: '#1e3a5f' }} />
                  <div>
                    <div style={{ fontSize: 14, fontWeight: arm.mixedLaneCombination === o.value ? 600 : 400 }}>
                      {index === 2 ? o.labelB : o.labelD}
                      {arm.mixedLaneCombination === o.value && <HerkunftMarke art={streifenArt(herkunft, 'misch', o.value)} />}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{o.desc}</div>
                  </div>
                </div>
              ))}
              <MixedLaneHint index={index} arm={arm} opposingHSSeparateLane={opposingHSSeparateLane} />
            </>
          )}
        </>
      )}
      </>)}
      </>)}

      {footer}
    </div>
  )
}
