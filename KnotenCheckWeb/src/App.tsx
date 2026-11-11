// App-Shell: Header, Startseite und Modus-Wechsel zwischen den Rechner-Modulen

import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import SN022App from './SN022App'
import RoundaboutApp from './RoundaboutApp'
import VSS308App from './VSS308App'
// Der LSA-Rechner (LSAApp.tsx) ist seit 11.11.2026 aus der Oberfläche genommen: noch nicht weit genug entwickelt (Normprüfung, Befund LSA-1).
// Der Code bleibt im Repo und in den Tests.
import SimulationApp from './SimulationApp'
import { ActiveModuleContext } from './activeModule'
import { ModuleErrorBoundary } from './ModuleErrorBoundary'
import { RECHNER_NAME, type KnotenUebernahme, type RechnerKey } from './karte/rechner'
import { uebergabeUebernehmen } from './knotenkern/verknuepfung'
import heroImg from './assets/KnotenCheck.png'
import { MARKE } from './marke'
import Startseite from './Startseite'
import './App.css'
import './rechner.css'
import './bericht/bericht.css'

// Karte erst bei Bedarf laden: Startseite und Rechner bleiben ohne Leaflet und ohne Abrufe
const KartenSeite = lazy(() => import('./karte/KartenSeite'))

type Mode = 'home' | 'karte' | RechnerKey

// Link aus einem anderen Rechner (#karte?…): Angaben lesen, in der Adresse bleibt nur der Anker
uebergabeUebernehmen('karte')
const ANKER: readonly string[] = ['karte', 'sn022', 'sn024a', 'vss308', 'simulation']
const modeAusAdresse = (): Mode => (ANKER.includes(location.hash.slice(1)) ? location.hash.slice(1) as Mode : 'home')

const MODE_BUTTONS = [
  { key: 'sn022',      label: 'Einmündung & Kreuzung',      sub: 'SN 640 022' },
  { key: 'vss308',     label: 'Ungesteuerter Knoten mit Fussgänger*innen', sub: 'VSS 2011/308' },
  { key: 'sn024a',     label: 'Kreisverkehr',                sub: 'SN 640 024a' },
  { key: 'simulation', label: 'Simulation',                   sub: 'Wartezeit-Verteilungen' },
] as const

export default function App() {
  const [mode, setMode] = useState<Mode>(modeAusAdresse)
  // Einmal besuchte Rechner bleiben gemountet (nur versteckt), damit
  // Eingaben beim Wechsel zwischen den Modulen nicht verloren gehen.
  const [visited, setVisited] = useState<ReadonlySet<Mode>>(() => new Set([modeAusAdresse()]))
  // Zähler je Modul: Erhöhen setzt das Modul nach einem Absturz neu auf (neuer key)
  const [resets, setResets] = useState<Partial<Record<Mode, number>>>({})
  // Aus der Karte übernommene Knoten je Rechner; das Modul baut sich damit neu auf
  const [uebernahmen, setUebernahmen] = useState<Partial<Record<RechnerKey, KnotenUebernahme>>>({})

  // Letzter Knoten aus der Karte: Er geht beim Wechsel auch in die anderen Rechner mit, die für ihn passen. Gelesen wird über Refs,
  // weil auch die Zurück-Taste (popstate) zeigen() aufruft
  const letzte = useRef<{ u: KnotenUebernahme; moeglich: readonly RechnerKey[] } | null>(null)
  const stand = useRef({ uebernahmen: {} as Partial<Record<RechnerKey, KnotenUebernahme>>, besucht: new Set<Mode>([modeAusAdresse()]) })
  const abgelehnt = useRef<Partial<Record<RechnerKey, KnotenUebernahme>>>({})

  const setzeUebernahme = useCallback((r: RechnerKey, u: KnotenUebernahme) => {
    stand.current.uebernahmen = { ...stand.current.uebernahmen, [r]: u }
    setUebernahmen(prev => ({ ...prev, [r]: u }))
    setResets(x => ({ ...x, [r]: (x[r] ?? 0) + 1 }))
  }, [])

  // Nur Refs und Setter: stabil, darum auch für die Zurück-Taste
  const zeigen = useCallback((m: Mode) => {
    const l = letzte.current, s = stand.current
    if (l && m !== 'home' && m !== 'karte') {
      const r = m as RechnerKey
      if (l.moeglich.includes(r) && s.uebernahmen[r] !== l.u && abgelehnt.current[r] !== l.u) {
        // Ein schon geöffneter Rechner kann eigene Eingaben haben: dort erst fragen
        if (!s.besucht.has(r) || window.confirm(`Den Knoten «${l.u.name}» aus der Karte auch im Rechner «${RECHNER_NAME[r]}» übernehmen? Die bisherigen Eingaben dort werden ersetzt.`))
          setzeUebernahme(r, l.u)
        else abgelehnt.current = { ...abgelehnt.current, [r]: l.u }
      }
    }
    s.besucht.add(m)
    setMode(m)
    setVisited(prev => prev.has(m) ? prev : new Set(prev).add(m))
  }, [setzeUebernahme])
  function openMode(m: Mode) {
    zeigen(m)
    if (m !== modeAusAdresse()) history.pushState(null, '', m === 'home' ? location.pathname + location.search : `#${m}`)
  }
  // Zurück- und Vorwärts-Taste des Browsers
  useEffect(() => {
    const zurueck = () => zeigen(modeAusAdresse())
    window.addEventListener('popstate', zurueck)
    return () => window.removeEventListener('popstate', zurueck)
  },[zeigen])

  function uebernehmen(rechner: RechnerKey, u: KnotenUebernahme, moeglich: readonly RechnerKey[]) {
    if (visited.has(rechner) && !window.confirm(`Die Eingaben im Rechner «${RECHNER_NAME[rechner]}» werden durch diesen Knoten ersetzt.`)) return
    letzte.current = { u, moeglich }
    setzeUebernahme(rechner, u)
    openMode(rechner)
  }

  const apps: { key: RechnerKey; el: React.ReactNode }[] = [
    { key: 'sn022',      el: <SN022App uebernahme={uebernahmen.sn022} /> },
    { key: 'sn024a',     el: <RoundaboutApp uebernahme={uebernahmen.sn024a} /> },
    { key: 'vss308',     el: <VSS308App uebernahme={uebernahmen.vss308} /> },
    { key: 'simulation', el: <SimulationApp uebernahme={uebernahmen.simulation} /> },
  ]

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9', fontFamily: 'system-ui, sans-serif' }}>

      {/* Leiste mit den Reitern nur in den Rechnern: Karte und Startseite tragen ihren Kopf selbst */}
      {mode !== 'karte' && mode !== 'home' && <header className="app-header">
        <div className="app-header-inner">
          <button className="logo-knopf" onClick={() => openMode('home')} title="Zur Startseite" aria-label="Zur Startseite">
            <img src={heroImg} alt="" width={32} height={32} />
          </button>
          <span className="app-header-title">KnotenCheck</span>
          <span className="marke">{MARKE} v{__APP_VERSION__}</span>
          {/* Gleich gross wie die Reiter, aber in eigener Farbe: kein Rechner, sondern die Seite zum Knoten wählen */}
          <button className="mode-btn karte-btn" onClick={() => openMode('karte')}>
            Karte
            <span className="mode-btn-sub">Knoten wählen</span>
          </button>
          <div className="mode-switcher">
            {MODE_BUTTONS.map(m => (
              <button key={m.key} onClick={() => openMode(m.key)}
                className={`mode-btn ${mode === m.key ? 'active' : 'inactive'}`}>
                {m.label}
                <span className="mode-btn-sub">{m.sub}</span>
              </button>
            ))}
          </div>
        </div>
      </header>}

      {mode === 'home' && <Startseite onSelect={k => openMode(k)} onKarte={() => openMode('karte')} />}

      {/* Bleibt nach dem ersten Öffnen gemountet: Ausschnitt und gewählter Knoten bleiben erhalten */}
      {(visited.has('karte') || mode === 'karte') && (
        <div style={{ display: mode === 'karte' ? undefined : 'none' }} aria-hidden={mode !== 'karte'}>
          <Suspense fallback={<p style={{ padding: 24, color: '#64748b' }}>Karte wird geladen …</p>}>
            <KartenSeite aktiv={mode === 'karte'} onStart={() => openMode('home')} onUebernehmen={uebernehmen} />
          </Suspense>
        </div>
      )}

      {apps.map(a => (visited.has(a.key) || mode === a.key) && (
        <div key={a.key}
             className="rechner"
             style={{ display: mode === a.key ? undefined : 'none' }}
             aria-hidden={mode !== a.key}>
          <ActiveModuleContext.Provider value={mode === a.key}>
            <ModuleErrorBoundary key={resets[a.key] ?? 0}
              onReset={() => setResets(r => ({ ...r, [a.key]: (r[a.key] ?? 0) + 1 }))}>
              {a.el}
            </ModuleErrorBoundary>
          </ActiveModuleContext.Provider>
        </div>
      ))}
    </div>
  )
}
