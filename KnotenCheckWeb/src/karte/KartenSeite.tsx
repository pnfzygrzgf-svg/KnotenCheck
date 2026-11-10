// Kartenseite nach dem Rechnerseiten-Standard: Karte links, Trenner, Panel rechts mit Logo, Name und Marke; Kacheln auf grauem Grund,
// Fusszeile im Panel. Knoten wählen, Form und Arme prüfen, in einen Rechner übernehmen.

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import 'leaflet/dist/leaflet.css'
import './karte.css'
import heroImg from '../assets/KnotenCheck.png'
import { istAbbruch } from '../knotenkern/daten/holen'
import { ladeOsmUmKnoten, OVERPASS_ENDPOINTS, type OsmKnoten } from '../knotenkern/daten/osm'
import { lv95 } from '../knotenkern/geo'
import { aktuelleUebergabe, uebergabeText } from '../knotenkern/verknuepfung'
import AndereRechner from './AndereRechner'
import { ladeBelastung, NPVM_QUELLE, type BelastungsStand } from './belastung'
import { armTempoAmtlich, ladeAmtlich, type ArmTempo } from './ortEbenen'
import { abbiegerHolen, MODELL_ABBIEGER_QUELLE, type AbbiegerStand } from './modellAbbieger'
import KnotenKarte, { ARM_HAUPT_FARBE, ARM_NEBEN_FARBE, KNOTEN_FARBE, type KartenLinie } from './KnotenKarte'
import { armName, FGS_ABSTAND_M, moeglicheRechner, rechnerVorschlag, type KartenArm, type KnotenVorschlag, knotenVorschlag } from './knotenVorschlag'
import { klasseText, ladeArmNeigung, NEIGUNG_LINIE_M, NEIGUNG_VOLL, type ArmNeigung } from './neigung'
import { RECHNER_NAME, type KnotenUebernahme, type RechnerKey, type Spur } from './rechner'
import Trenner, { PANEL_VORGABE } from './Trenner'
import { ALLES, anfangsPaar, armeMitLabel, hauptPaare, SPITZE_TEXT, uebernahmeAus, type Auswahl, type HauptPaar, type Spitze } from './uebernahme'
import { lokalTitel } from './vergleich'
import { Lizenzzeile } from '../Fusszeile'
import { MARKE } from '../marke'

/** Umkreis der OSM-Abfrage um den gewählten Knoten [m] */
const UMKREIS_M = 150
const FORM_TEXT = { knoten: 'Knoten ohne Lichtsignal', lsa: 'Lichtsignalanlage', kreisel: 'Kreisel' } as const
const SIGNAL_TEXT = { stop: 'Stop', give_way: 'Kein Vortritt' } as const
const SPUR_TEXT: Record<Spur, string> = { left: 'links', straight: 'gerade', right: 'rechts' }
const host = (u: string) => new URL(u).host

const tausender = (x: number | null) => (x === null ? '–' : x.toLocaleString('de-CH'))

const streifenText = (a: KartenArm) => {
  const s = a.streifen
  if (!s) return null
  if (!s.spuren) return `${s.anzahl} Fahrstreifen`
  return s.spuren.map(l => l.map(x => SPUR_TEXT[x]).join('+')).join(' | ')
}

interface Abruf { server: string; stand: string; ms: number; bytes: number }
/** Abruf der Modell-Abbieger für genau diesen Stand der Arme und diese Spitze */
interface ModellAbruf { fuer: KnotenVorschlag; spitze: Spitze; stand: AbbiegerStand | null; fehler: string | null }

interface Props {
  aktiv: boolean
  onStart: () => void
  /** moeglich: Rechner, die für diesen Knoten passen; dorthin geht der Knoten beim Wechsel mit */
  onUebernehmen: (rechner: RechnerKey, u: KnotenUebernahme, moeglich: readonly RechnerKey[]) => void
}

/** Annahme: So weit um den Knoten fragt die App die amtlichen Tempodienste; reicht für die 50 m, die je Arm geprüft werden */
const TEMPO_UMKREIS_M = 120

/** Tempo eines Arms mit den vorhandenen Quellen zur Wahl, wie die Quellenknöpfe im VeloroutenCheck */
function TempoWahl({ arm, hand, amtlich, setzen }: { arm: KartenArm; hand: number | undefined; amtlich: ArmTempo | undefined; setzen: (wert: string) => void }) {
  const wert = hand ?? amtlich?.tempo ?? arm.tempo
  const quellen = [...(amtlich ? [{ name: amtlich.quelle, tempo: amtlich.tempo }] : []), ...(arm.tempo !== null ? [{ name: 'OSM', tempo: arm.tempo }] : [])]
  const vonHand = hand !== undefined && !quellen.some(q => q.tempo === hand)
  return <div className="tempo-feld">
    <label>Tempo <input type="number" min={5} max={120} step={5} value={wert ?? ''} onChange={e => setzen(e.target.value)} aria-label={`Tempo ${armName(arm)} in km/h`} /> km/h</label>{' '}
    {quellen.map((q, i) => <button key={q.name} type="button" className="tempo-quelle" aria-pressed={!vonHand && wert === q.tempo && (i === 0 || quellen[0].tempo !== q.tempo)}
      title={`${q.name}: ${q.tempo} km/h übernehmen`} onClick={() => setzen(String(q.tempo))}>{q.name} {q.tempo}</button>)}
    {vonHand && <span className="quelle-chip hand">von Hand</span>}
    {!quellen.length && hand === undefined && <span className="quelle-chip q-annahme">keine Quelle</span>}
  </div>
}

export default function KartenSeite({ aktiv, onStart, onUebernehmen }: Props) {
  const [breite, setBreite] = useState(PANEL_VORGABE)
  const [gewaehlt, setGewaehlt] = useState<number | null>(null)
  const [roh, setRoh] = useState<{ id: number; daten: unknown } | null>(null)
  const [zusammenfassen, setZusammenfassen] = useState(false)
  const [ohne, setOhne] = useState<string[]>([])
  const [paarWahl, setPaarWahl] = useState<HauptPaar | null>(null)
  const [auswahl, setAuswahl] = useState<Auswahl>(ALLES)
  const [neigungen, setNeigungen] = useState<Record<string, ArmNeigung>>({})
  const [laedt, setLaedt] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)
  const [abruf, setAbruf] = useState<Abruf | null>(null)
  const abbruch = useRef<AbortController | null>(null)
  const neigungRef = useRef<Record<string, ArmNeigung>>({})
  const [belastung, setBelastung] = useState<BelastungsStand | null>(null)
  const [modellAbruf, setModellAbruf] = useState<ModellAbruf | null>(null)
  const [tempoHand, setTempoHand] = useState<Record<string, number>>({})
  const [tempoAmtlich, setTempoAmtlich] = useState<{ fuer: unknown; arme: Record<string, ArmTempo> } | null>(null)
  const [fokus, setFokus] = useState<{ lat: number; lon: number } | null>(null)
  const [uebergabeHinweis, setUebergabeHinweis] = useState(() => uebergabeText(aktuelleUebergabe()))

  const alle = useMemo(() => (roh ? knotenVorschlag(roh.daten, roh.id, { zusammenfassen }) : null), [roh, zusammenfassen])
  const vorschlag = useMemo(() => (roh ? knotenVorschlag(roh.daten, roh.id, { zusammenfassen, ohne }) : null), [roh, zusammenfassen, ohne])
  const paar = useMemo(() => {
    if (!vorschlag) return null
    return (paarWahl && hauptPaare(vorschlag).find(p => p.every(k => paarWahl.includes(k)))) || anfangsPaar(vorschlag)
  }, [vorschlag, paarWahl])
  const armLabels = useMemo(() => (vorschlag ? armeMitLabel(vorschlag, paar) : []), [vorschlag, paar])
  const kreisel = vorschlag?.form === 'kreisel'
  const linien = useMemo<KartenLinie[]>(() => armLabels.map(({ arm, label }) => ({
    label, name: armName(arm), linie: arm.linie, haupt: !kreisel && !!paar?.includes(arm.key),
  })), [armLabels, paar, kreisel])
  const modellAktuell = modellAbruf && modellAbruf.fuer === vorschlag && modellAbruf.spitze === auswahl.abbieger ? modellAbruf : null
  const modellStand = modellAktuell?.stand ?? null
  // Solange der Vorschlag lädt, bleiben die Knöpfe zu: Sonst kämen die Ströme leer im Rechner an
  const modellLaedt = auswahl.abbieger !== null && !modellAktuell
  const amtlichJeArm = useMemo(() => (tempoAmtlich && tempoAmtlich.fuer === alle ? tempoAmtlich.arme : {}), [tempoAmtlich, alle])
  const uebernahme = useMemo(() => (vorschlag ? uebernahmeAus(vorschlag, paar, neigungen, auswahl, belastung?.arme, abruf?.stand, modellStand, tempoHand, amtlichJeArm) : null), [amtlichJeArm, vorschlag, paar, neigungen, auswahl, belastung, abruf, modellStand, tempoHand])

  // Neigung je Arm: nacheinander und erst nach dem OSM-Abruf; bereits geladene Arme bleiben
  useEffect(() => {
    if (!vorschlag) return
    const ctrl = new AbortController()
    void (async () => {
      for (const a of vorschlag.arme) {
        if (neigungRef.current[a.key]) continue
        try {
          const n = await ladeArmNeigung(a.profil, ctrl.signal)
          if (ctrl.signal.aborted) return
          neigungRef.current = { ...neigungRef.current, [a.key]: n }
          setNeigungen(neigungRef.current)
        } catch (e) {
          if (istAbbruch(e)) return
        }
      }
    })()
    return () => ctrl.abort()
  }, [vorschlag])

  // Belastung je Arm: nur Vergleichswerte; hängt an den erkannten Armen, nicht an der Abwahl
  useEffect(() => {
    if (!alle?.arme.length) return
    const ctrl = new AbortController()
    ladeBelastung(alle.arme, lv95(alle.lat, alle.lon), lv95, ctrl.signal).then(b => { if (!ctrl.signal.aborted) setBelastung(b) }, e => {
      if (!ctrl.signal.aborted && !istAbbruch(e)) setBelastung({ arme: {}, fehler: [(e as Error).message] })
    })
    return () => ctrl.abort()
  }, [alle])

  // Modell-Abbieger: nur auf ausdrückliche Wahl; hängt an den Armen, die in den Rechner gehen
  useEffect(() => {
    const spitze = auswahl.abbieger
    if (!vorschlag?.arme.length || !spitze) return
    const ctrl = new AbortController()
    abbiegerHolen(lv95(vorschlag.lat, vorschlag.lon), vorschlag.arme, spitze, ctrl.signal).then(
      stand => { if (!ctrl.signal.aborted) setModellAbruf({ fuer: vorschlag, spitze, stand, fehler: null }) },
      e => { if (!ctrl.signal.aborted && !istAbbruch(e)) setModellAbruf({ fuer: vorschlag, spitze, stand: null, fehler: (e as Error).message }) })
    return () => ctrl.abort()
  }, [vorschlag, auswahl.abbieger])

  // Link aus einem anderen Rechner: Ort zeigen, Knoten laden. Erst nach dem Effekt: im StrictMode der Entwicklung läuft er zweimal,
  // sonst ginge dieselbe Abfrage zweimal an Overpass
  const nachLink = useRef(false)
  const setFokusNachLink = (k: OsmKnoten) => { if (nachLink.current) { nachLink.current = false; setFokus({ lat: k.lat, lon: k.lon }) } }
  // Amtliches Tempo je Arm: Fällt der Dienst aus, bleibt OSM
  useEffect(() => {
    if (!alle) return
    const ctrl = new AbortController()
    void ladeAmtlich(['tempo'], alle.lat, alle.lon, TEMPO_UMKREIS_M, ctrl.signal).then(r => {
      if (ctrl.signal.aborted) return
      const arme: Record<string, ArmTempo> = {}
      for (const a of alle.arme) { const t = armTempoAmtlich(a.linie.map(([lat, lon]) => lv95(lat, lon)), r.objekte.tempo); if (t) arme[a.key] = t }
      setTempoAmtlich({ fuer: alle, arme })
    }, () => { /* ohne amtlichen Dienst bleibt OSM */ })
    return () => ctrl.abort()
  }, [alle])

  useEffect(() => {
    const u = aktuelleUebergabe()
    if (!u || (!u.ort && !u.knoten)) return
    const t = setTimeout(() => {
      if (u.ort) setFokus(u.ort)
      if (u.knoten) { nachLink.current = !u.ort; void waehlen({ id: u.knoten, lat: u.ort?.lat ?? 0, lon: u.ort?.lon ?? 0, tags: {} }) }
    }, 0)
    return () => clearTimeout(t)
  }, [])   // eslint-disable-line react-hooks/exhaustive-deps

  async function waehlen(k: OsmKnoten) {
    abbruch.current?.abort()
    const ctrl = new AbortController()
    abbruch.current = ctrl
    neigungRef.current = {}
    setGewaehlt(k.id); setRoh(null); setPaarWahl(null); setOhne([]); setZusammenfassen(false); setNeigungen({}); setBelastung(null); setTempoHand({}); setFehler(null); setLaedt(true)
    try {
      const r = await ladeOsmUmKnoten(k.id, UMKREIS_M, ctrl.signal)
      if (ctrl.signal.aborted) return
      setAbruf({ server: r.quelle, stand: r.datenstand ?? 'unbekannt', ms: r.ms, bytes: r.bytes })
      // Fehlt die Nummer (veraltet oder verschoben): melden, es wird kein anderer Knoten gewählt
      if (!knotenVorschlag(r.daten, k.id)) { setFehler(`OSM-Knoten ${k.id} nicht gefunden. Bitte den Knoten auf der Karte wählen.`); return }
      if (r.knoten) setFokusNachLink(r.knoten)
      setRoh({ id: k.id, daten: r.daten })
    } catch (e) {
      if (ctrl.signal.aborted || istAbbruch(e)) return
      setFehler(`Knoten nicht geladen: ${(e as Error).message}`)
    } finally {
      if (abbruch.current === ctrl) setLaedt(false)
    }
  }

  const umschalten = (key: string) => setOhne(o => (o.includes(key) ? o.filter(k => k !== key) : [...o, key]))
  /** Leer oder gleich wie die Vorgabe: gilt wieder die Vorgabe, amtlich vor OSM */
  const tempoSetzen = (arm: KartenArm, roh: string) => setTempoHand(t => {
    const n = Number(roh), neu = { ...t }
    if (roh === '' || !Number.isInteger(n) || n <= 0 || n === (amtlichJeArm[arm.key]?.tempo ?? arm.tempo)) delete neu[arm.key]
    else neu[arm.key] = n
    return neu
  })
  const armLabel = new Map(armLabels.map(({ arm, label }) => [arm.key, label]))
  const zeilen: KartenArm[] = alle ? [...armLabels.map(x => x.arm), ...alle.arme.filter(a => !armLabel.has(a.key))] : []
  const neigungModelle = [...new Set(Object.values(neigungen).map(n => n.modell))]
  const neigungOffen = vorschlag ? vorschlag.arme.filter(a => !neigungen[a.key]).length : 0
  const zaehle = (f: (a: KartenArm) => unknown) => vorschlag?.arme.filter(f).length ?? 0

  const vorgeschlagen = vorschlag && !vorschlag.meldung ? rechnerVorschlag(vorschlag) : null
  const stroemeStand = modellLaedt ? 'Abbiegeströme: Vorschlag lädt …'
    : uebernahme?.arme.some(a => a.stroeme) ? `Abbiegeströme: Vorschlag ${SPITZE_TEXT[auswahl.abbieger!].split(' ')[0]}`
      : auswahl.abbieger ? 'Abbiegeströme bleiben leer: kein Modellwert geladen' : 'Abbiegeströme bleiben leer'
  const paarName = (p: HauptPaar) => p.map(k => { const a = vorschlag!.arme.find(x => x.key === k)!; return `${armName(a)} (${a.himmel})` }).join(' und ')
  const [erster, ...weitere] = OVERPASS_ENDPOINTS.map(host)

  return (
    <div className="kc-app" style={{ '--panel-breite': `${breite}px` } as CSSProperties}>
      <KnotenKarte aktiv={aktiv} breite={breite} fokus={fokus} gewaehlt={gewaehlt} linien={linien} onKnoten={waehlen} />
      <Trenner breite={breite} setze={setBreite} />
      <aside className="panel">
        <h1>
          <button className="logo-knopf" onClick={onStart} title="Zur Startseite" aria-label="Zur Startseite">
            <img className="logo" src={heroImg} alt="" width={36} height={36} />
          </button>
          KnotenCheck <span className="marke">{MARKE} v{__APP_VERSION__}</span>
        </h1>

        <details className="hilfe">
          <summary>So funktioniert's</summary>
          <p><b>Ort suchen:</b> oben in der Karte Ort, Adresse oder Strasse eingeben oder den Standort-Knopf nutzen; heranzoomen, bis die
            Knoten als blaue Punkte erscheinen. Dann das Panel von oben nach unten:</p>
          <ol>
            <li><b>Knoten:</b> blauen Punkt anklicken.</li>
            <li><b>Arme:</b> Bezeichnungen, Tempo und Hauptstrasse prüfen, sie kommen als Vorschlag aus OpenStreetMap, das Tempo wo vorhanden amtlich. Je Arm lässt es sich ändern oder die andere Quelle wählen. Überzählige Arme abwählen;
              bei getrennten Richtungsfahrbahnen nahe Knoten zusammenfassen.</li>
            <li><b>Vorbelegung:</b> wählen, was in den Rechner übernommen wird.</li>
            <li><b>Belastung:</b> Vergleichswerte ansehen, sie fliessen nicht in die Rechnung ein.</li>
            <li><b>Rechner:</b> in den vorgeschlagenen oder einen anderen Rechner übernehmen.</li>
          </ol>
          <p>Fussgängermengen gibt es in keiner Quelle, sie bleiben Handeingabe. Abbiegeströme gibt es nur als Modellwerte: Sie lassen sich unter Vorbelegung wählen, sonst bleiben sie Handeingabe. Alle Werte im Rechner lassen sich ändern.</p>
        </details>

        {uebergabeHinweis && <p className="hinweis">{uebergabeHinweis}{' '}
          <button className="zweit klein" onClick={() => setUebergabeHinweis(null)}>ausblenden</button></p>}
        {fehler && <p className="hinweis">{fehler}</p>}
        {laedt && <p className="klein">Knoten wird geladen …</p>}

        {/* oben, damit die Links zu den anderen Rechnern gefunden werden; eingeklappt, damit die Arbeitsfläche nicht wegrückt */}
        {vorschlag && <AndereRechner knoten={vorschlag.id} ort={{ lat: vorschlag.lat, lon: vorschlag.lon }} />}

        {!vorschlag && !laedt && (
          <section>
            <h2>1 Knoten</h2>
            <p className="klein">Auf der Karte einen blauen Punkt anklicken.</p>
          </section>
        )}

        {vorschlag && (
          <section>
            <h2>1 Knoten: {vorschlag.name}</h2>
            <p className="klein">{FORM_TEXT[vorschlag.form]}, {vorschlag.arme.length} Arme ·{' '}
              <a href={`https://www.openstreetmap.org/node/${vorschlag.id}`} target="_blank" rel="noopener noreferrer">OSM-Knoten {vorschlag.id} ↗</a></p>
            {vorschlag.meldung && <p className="hinweis">{vorschlag.meldung}</p>}
          </section>
        )}

        {vorschlag && zeilen.length > 0 && (
          <section>
            <h2>2 Arme <span className="quelle-chip">OSM</span></h2>
            {(vorschlag.nachbarn > 0) && (
              <label className="wahl">
                <input type="checkbox" checked={zusammenfassen} onChange={e => { setZusammenfassen(e.target.checked); setOhne([]); setPaarWahl(null) }} />
                Nahe OSM-Knoten zu einem Knoten zusammenfassen (getrennte Richtungsfahrbahnen)
              </label>
            )}
            <table className="arme">
              <tbody>
                {zeilen.map(arm => {
                  const label = armLabel.get(arm.key)
                  const n = neigungen[arm.key]
                  const weg = ohne.includes(arm.key)
                  return (
                    <tr key={arm.key} className={weg ? 'abgewaehlt' : undefined}>
                      <td className="arm-spalte">{label ? <span className="arm-nr">{label}</span> : '–'}</td>
                      <td>
                        {armName(arm)} <span className="klein">{arm.himmel}</span>
                        <div className="merkmale">
                          {arm.signal && <span className="quelle-chip">{SIGNAL_TEXT[arm.signal]} · OSM</span>}
                          {!arm.zufahrt && <span className="quelle-chip">nur Ausfahrt · OSM</span>}
                          {arm.stichM !== null && <span className="quelle-chip">Stichstück · OSM</span>}
                          {n?.klasse && <span className="quelle-chip q-annahme" title={`Gemessen ${n.prozent} %, in Fahrrichtung zum Knoten, über ${n.laengeM !== undefined && n.laengeM < NEIGUNG_VOLL * NEIGUNG_LINIE_M ? `${Math.round(n.laengeM)} m statt ${NEIGUNG_LINIE_M}` : NEIGUNG_LINIE_M} m ab dem Knoten (Annahme)`}>{klasseText(n.klasse)} · {n.modell}</span>}
                          {arm.fgs && <span className="quelle-chip">FGS{arm.fgs.insel ? ' mit Insel' : ''} · OSM</span>}
                          {streifenText(arm) && <span className="quelle-chip">{streifenText(arm)} · OSM</span>}
                        </div>
                        <TempoWahl arm={arm} hand={tempoHand[arm.key]} amtlich={amtlichJeArm[arm.key]} setzen={wert => tempoSetzen(arm, wert)} />
                      </td>
                      <td className="wahl-spalte">
                        <input type="checkbox" checked={!weg} onChange={() => umschalten(arm.key)} aria-label={`${armName(arm)} mitnehmen`} title="Arm mitnehmen" />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {!kreisel && !vorschlag.meldung && paar && (
              <>
                <h3>Hauptstrasse {vorschlag.hauptSicher ? <span className="quelle-chip">OSM</span> : <span className="quelle-chip q-annahme">Annahme</span>}</h3>
                <select value={paar.join('|')} onChange={e => setPaarWahl(e.target.value.split('|') as HauptPaar)} aria-label="Hauptstrasse">
                  {hauptPaare(vorschlag).map(p => <option key={p.join('|')} value={p.join('|')}>{paarName(p)}</option>)}
                </select>
                {vorschlag.hauptGrund && <p className="klein">{vorschlag.hauptGrund}</p>}
              </>
            )}
          </section>
        )}

        {vorschlag && vorgeschlagen && uebernahme && (
          <section>
            <h2>3 Vorbelegung</h2>
            <p className="klein">Diese Angaben gehen in den Rechner und beeinflussen das Ergebnis. Es sind Vorschläge, bitte prüfen. Ohne Häkchen oder ohne
              Angabe am Arm bleibt das Feld im Rechner leer. Nicht jeder Rechner nutzt alle Angaben.</p>
            <label className="wahl">
              <input type="checkbox" checked={auswahl.neigung} onChange={e => setAuswahl(a => ({ ...a, neigung: e.target.checked }))} />
              Neigung <span className="klein">{neigungOffen ? `lädt (${neigungOffen} Arme) …` : `${neigungModelle.join(', ')}, gemessen über ${NEIGUNG_LINIE_M} m ab dem Knoten`}</span>{' '}
              <span className="quelle-chip q-annahme">Annahme</span>
            </label>
            <label className="wahl">
              <input type="checkbox" checked={auswahl.fgs} onChange={e => setAuswahl(a => ({ ...a, fgs: e.target.checked }))} />
              Fussgängerstreifen <span className="klein">OSM, an {zaehle(a => a.fgs)} von {vorschlag.arme.length} Armen gefunden</span>
            </label>
            <label className="wahl">
              <input type="checkbox" checked={auswahl.streifen} onChange={e => setAuswahl(a => ({ ...a, streifen: e.target.checked }))} />
              Fahrstreifen <span className="klein">OSM, an {zaehle(a => a.streifen)} von {vorschlag.arme.length} Armen gefunden</span>
            </label>
            <label className="wahl">
              <input type="checkbox" checked={auswahl.tempo} onChange={e => setAuswahl(a => ({ ...a, tempo: e.target.checked }))} />
              Tempo <span className="klein">amtlich, OSM oder von Hand, an {zaehle(a => tempoHand[a.key] !== undefined || amtlichJeArm[a.key] || a.tempo !== null)} von {vorschlag.arme.length} Armen</span>
            </label>
            <div className="wahl-gruppe">
              Schwerverkehrsanteil <span className="klein">Modell NPVM, nicht gezählt, darum zu Beginn aus. Sind die Abbiegeströme derselben Spitze gewählt, gilt der Anteil der Zufahrt aus den Abbiegern.</span>{' '}
              <span className="quelle-chip q-annahme">Annahme</span>
              {(['morgen', 'abend'] as Spitze[]).map(s => (
                <label key={s} className="wahl">
                  <input type="checkbox" checked={auswahl.schwerverkehr === s} onChange={e => setAuswahl(a => ({ ...a, schwerverkehr: e.target.checked ? s : null }))} />
                  {SPITZE_TEXT[s]} <span className="klein">{belastung
                    ? `an ${zaehle(a => belastung.arme[a.key]?.[s === 'morgen' ? 'svMorgen' : 'svAbend'])} von ${vorschlag.arme.length} Armen`
                    : 'lädt …'}</span>
                </label>
              ))}
            </div>
            <fieldset className="stroeme-wahl">
              <legend>Abbiegeströme <span className="quelle-chip q-annahme">Annahme</span></legend>
              <p className="klein">Der Vorschlag füllt die Abbiegeströme im Rechner aus. Es sind Modellwerte des NPVM, nicht gezählt. Sie können stark abweichen, vor allem kleine Ströme.</p>
              <label className="wahl"><input type="radio" name="abbieger" checked={auswahl.abbieger === null} onChange={() => setAuswahl(a => ({ ...a, abbieger: null }))} />Von Hand eingeben</label>
              {(['morgen', 'abend'] as Spitze[]).map(s => (
                <label key={s} className="wahl">
                  <input type="radio" name="abbieger" checked={auswahl.abbieger === s} onChange={() => setAuswahl(a => ({ ...a, abbieger: s }))} />
                  Vorschlag {SPITZE_TEXT[s]}{auswahl.abbieger === s && !modellAktuell && <span className="klein"> lädt …</span>}
                </label>
              ))}
              {modellAktuell?.fehler && <p className="klein fehler">Nicht geladen: {modellAktuell.fehler}</p>}
              {modellStand && uebernahme.arme.some(a => a.stroeme) && (
                <table className="belastung">
                  <thead><tr><th className="arm-spalte" /><th>Links</th><th>Geradeaus</th><th>Rechts</th></tr></thead>
                  <tbody>
                    {uebernahme.arme.map(a => (
                      <tr key={a.label}>
                        <td className="arm-spalte"><span className="arm-nr">{a.label}</span></td>
                        <td>{tausender(a.stroeme?.left ?? null)}</td><td>{tausender(a.stroeme?.straight ?? null)}</td><td>{tausender(a.stroeme?.right ?? null)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {uebernahme.arme.some(a => a.stroemeOffen) && <p className="klein">Ohne Modellwert: {uebernahme.arme.filter(a => a.stroemeOffen).map(a => a.label).join(', ')}. Die Ströme dieser Arme sind im Rechner einzugeben oder als «kein Verkehr» zu bestätigen; bis dahin gibt es kein Ergebnis.</p>}
            </fieldset>
          </section>
        )}

        {vorschlag && vorgeschlagen && uebernahme && (
          <section>
            <h2>4 Belastung zum Vergleich</h2>
            <p className="klein">Ungefähre Verkehrsmenge je Arm. Die Werte dienen nur dem Vergleich und fliessen nicht in die Rechnung ein. Abbiegeströme werden im
              Rechner von Hand eingegeben oder oben als Modellwert gewählt; die Tabelle steht dort neben den Eingaben.</p>
            {!belastung ? <p className="klein">Wird geladen …</p> : (
              <table className="belastung">
                <thead>
                  <tr><th className="arm-spalte" rowSpan={2} /><th className="gruppe" colSpan={3}>Modell NPVM (Bund)</th><th className="gruppe lokal">{lokalTitel(uebernahme.vergleich)}</th></tr>
                  <tr><th>Morgen [Fz/h]</th><th>Abend [Fz/h]</th><th>DTV [Fz/Tag]</th><th className="lokal">DTV [Fz/Tag]</th></tr>
                </thead>
                <tbody>
                  {uebernahme.vergleich.map(z => (
                    <tr key={z.label}>
                      <td className="arm-spalte"><span className="arm-nr">{z.label}</span></td>
                      <td>{tausender(z.msp)}</td><td>{tausender(z.asp)}</td><td>{tausender(z.dtv)}</td>
                      <td className="lokal" title={z.lokalQuelle ?? undefined}>{tausender(z.lokalDtv)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {belastung && <p className="klein">Modell: NPVM des Bundes, berechnet, nicht gezählt; Morgen 7–8 Uhr, Abend 17–18 Uhr.
              {[...new Set(uebernahme.vergleich.map(z => z.lokalQuelle).filter(q => q))].map(q => ` Lokal: ${q}.`)} Alle Werte gelten für beide
              Richtungen zusammen, bei getrennten Fahrbahnen je Fahrbahn. Modell und lokale Daten können deutlich abweichen. Leer: kein eindeutig passender Wert.</p>}
            {belastung && belastung.fehler.length > 0 && <p className="klein fehler">Nicht geladen: {belastung.fehler.join('; ')}</p>}
          </section>
        )}

        {vorschlag && vorgeschlagen && uebernahme && (
          <section>
            <h2>5 Rechner</h2>
            <p className="klein">{vorgeschlagen.grund}</p>
            <p className="stroeme-stand" role="status">{stroemeStand}</p>
            <div className="knopfzeile">
              {moeglicheRechner(vorschlag).map((r, i) => (
                <button key={r} className={i === 0 ? undefined : 'zweit'} disabled={modellLaedt} onClick={() => onUebernehmen(r, uebernahme, moeglicheRechner(vorschlag))}>{RECHNER_NAME[r]}</button>
              ))}
            </div>
            {uebernahme.hinweise.length > 0 && <ul className="annahmen">{uebernahme.hinweise.map(h => <li key={h}>{h}</li>)}</ul>}
          </section>
        )}

        <details className="abschnitt">
          <summary><h2>Datenquellen und Ladezustand</h2></summary>
          <table>
            <tbody>
              <tr><td>Knoten, Arme, Signale</td><td>OpenStreetMap über Overpass{abruf ? ` (${abruf.server})` : ''}</td></tr>
              {abruf && <tr><td>Datenstand</td><td>{abruf.stand}</td></tr>}
              {abruf && <tr><td>Letzter Abruf</td><td>{Math.round(abruf.ms)} ms, {Math.round(abruf.bytes / 1024)} KB</td></tr>}
              <tr><td>Längsneigung</td><td>{neigungModelle.length ? neigungModelle.join(', ') : 'swissALTI3D, in Bern DTM 2023 Stadt Bern'}</td></tr>
              <tr><td>Belastung</td><td>{NPVM_QUELLE}; lokal Stadt Bern, Kanton Zürich, Stadt Luzern, Basel-Stadt</td></tr>
              <tr><td>Abbiegeströme</td><td>{MODELL_ABBIEGER_QUELLE}</td></tr>
              <tr><td>Luftbild, Landeskarte, Ortssuche</td><td>swisstopo; in Bern zusätzlich Orthofoto 2026, Geodaten Stadt Bern</td></tr>
              <tr><td>Kartenebenen</td><td>Amtliche Vermessung geodienste.ch und Kantone, in Luzern Strassenflächen der Stadt, Unfälle © ASTRA, Haltestellen © BAV, Tramgleise, Strassenklassen und Höhenkurven © swisstopo, Bauzonen © ARE und Kantone, Verkehrsmengen © ARE und örtliche Dienste; Tempo, Vortrittszeichen, Fussgängerstreifen und Lichtsignale der amtlichen Dienste, sonst © OpenStreetMap; nur Karte, keine Wirkung auf die Rechnung</td></tr>
            </tbody>
          </table>
          <p className="klein">Fehlt ein Fussgängerstreifen oder Signal in OSM, heisst das nicht, dass es ihn vor Ort nicht gibt.</p>
        </details>

        <details className="abschnitt">
          <summary><h2>Legende</h2></summary>
          <ul className="legende">
            <li><span className="farbe rund" style={{ background: KNOTEN_FARBE }} />Knoten: Punkt, an dem sich die Strassen in OSM treffen.</li>
            <li><span className="farbe rund" style={{ background: '#ffffff', borderColor: KNOTEN_FARBE, borderWidth: 2 }} />Kreisel, ein Punkt in der Mitte.</li>
            <li><span className="farbe" style={{ background: ARM_HAUPT_FARBE }} /><span className="farbe" style={{ background: ARM_NEBEN_FARBE }} />
              Arme: hellgrau die Hauptstrasse, grau die übrigen.</li>
            <li><span className="arm-nr">A</span>Bezeichnung des Arms wie im Rechner: A und C Hauptstrasse, von A aus B rechts und D links; am Kreisel Nummern in Fahrtrichtung.</li>
          </ul>
        </details>

        <details className="hilfe">
          <summary>Datenschutz</summary>
          <ul>
            <li>Keine Anmeldung, kein eigener Server: Eingaben und Ergebnisse bleiben im Browser. Die Karte merkt sich im Browser nur Ausschnitt und Ebenenwahl.</li>
            <li>Der Browser holt die Daten direkt bei diesen Diensten; sie sehen dabei technisch die IP-Adresse und Browserangaben:
              <ul>
                <li>swisstopo (wmts.geo.admin.ch, api3.geo.admin.ch): Kartenkacheln des sichtbaren Ausschnitts, Suchbegriff der Ortssuche
                  für die Neigung die Linien der Arme und für das Verkehrsmodell ein Rechteck um den Knoten (nur Koordinaten).</li>
                <li>Bund (api3.geo.admin.ch, wmts.geo.admin.ch, data.geo.admin.ch): nur bei eingeschalteten Kartenebenen der sichtbare Ausschnitt für Unfälle (ASTRA), Haltestellen (BAV), Tramgleise, Strassenklassen, Bauzonen, Verkehrsmodell und Höhenkurven; bei den Ebenen Tempo, Vortrittszeichen, Fussgängerstreifen und Lichtsignale für die zuständige Gemeinde.</li>
                <li>Amtliche Tempodienste: nach der Wahl eines Knotens ein Rechteck ±{TEMPO_UMKREIS_M} m um ihn, bei eingeschalteter Ebene Tempo ein Rechteck um den Ausschnitt, an den Dienst des Orts: Stadt Bern (map.bern.ch), Stadt Zürich (www.ogd.stadt-zuerich.ch), Kantone Zürich (maps.zh.ch), Basel-Stadt (data.bs.ch), Genf (vector.sitg.ge.ch), Freiburg (maps.fr.ch), Jura (geo.jura.ch), Uri (geo.ur.ch), Solothurn (geo.so.ch), Schwyz (map.geo.sz.ch).</li>
                <li>Amtliche Inventare: nur bei eingeschalteter Ebene Vortrittszeichen, Fussgängerstreifen oder Lichtsignale ein Rechteck um den Ausschnitt an den Dienst des Orts: Stadt Zürich (www.ogd.stadt-zuerich.ch), Kanton Zürich (maps.zh.ch), Basel-Stadt (data.bs.ch), Stadt Luzern (map.stadtluzern.ch), Kanton Luzern (public.geo.lu.ch), Stadt St. Gallen (daten.stadt.sg.ch), Kanton Zug (services.geo.zg.ch), Genf (vector.sitg.ge.ch), Schwyz (map.geo.sz.ch).</li>
                <li>Stadt Bern (gisapp.bern.ch, map.bern.ch): in Bern die Linien der Arme für die Neigung und ein Rechteck um den Knoten für den DTV, bei den Ebenen Verkehrsmenge (DTV) und ÖV-Haltestellen ein Rechteck um den Ausschnitt; beim Hintergrund «Luftbild Stadt Bern 2026» die Kartenbilder des Ausschnitts.</li>
                <li>Amtliche Vermessung (geodienste.ch, in der Stadt Luzern map.stadtluzern.ch): nur bei eingeschalteter Ebene ein Rechteck um den Ausschnitt.</li>
                <li>Kanton Zürich (maps.zh.ch), Stadt Luzern (map.stadtluzern.ch): dort die ganze Liste der Zählstellen, ohne Koordinaten des Knotens.</li>
                <li>Overpass ({erster}, bei Ausfall {weitere.join(', ')}): Kartenausschnitt mit Rand und Umkreis {UMKREIS_M} m um den gewählten Knoten; bei den Ebenen Tempo, Vortrittszeichen, Fussgängerstreifen und Lichtsignale ein Umkreis um die Kartenmitte.</li>
              </ul>
            </li>
            <li>Dein Standort bleibt im Browser und wird nur auf der Karte angezeigt.</li>
            <li>Die Links unter «In anderen Rechnern prüfen» öffnen einen anderen Rechner; dabei gehen nur Lage und OSM-Id mit, keine Eingaben. Die Angaben
              stehen hinter dem # der Adresse und gehen nicht an den Webserver; einzig die Knotennummer für den SichtweitenCheck steht davor.</li>
          </ul>
          <p>Quellen: Luftbild, Landeskarte und swissALTI3D © swisstopo, DTM 2023 und Verkehrsdaten Stadt Bern, Knoten und Arme © OpenStreetMap-Mitwirkende (ODbL), {NPVM_QUELLE}, Zählstellen Kanton Zürich (CC0), Stadt Luzern, Basel-Stadt (CC BY 4.0). Fussgängerstreifen zählen bis {FGS_ABSTAND_M} m
            vom Knoten (Annahme). Knotenerkennung aus dem SichtweitenCheck (MIT), Karte mit Leaflet (<a href="/licenses/leaflet.txt" target="_blank" rel="noopener noreferrer">BSD-2-Clause</a>), amtliche Dienste mit den Bibliotheken der <a href="/licenses/bundesquellen.txt" target="_blank" rel="noopener noreferrer">Bundesquellen</a>.</p>
        </details>

        <footer className="fuss klein"><Lizenzzeile /></footer>
      </aside>
    </div>
  )
}
