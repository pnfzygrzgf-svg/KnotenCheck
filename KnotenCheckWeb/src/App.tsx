// App-Shell: Header, Startseite und Modus-Wechsel zwischen den Rechner-Modulen

import { useState } from 'react'
import SN022App from './SN022App'
import RoundaboutApp from './RoundaboutApp'
import VSS308App from './VSS308App'
import LSAApp from './LSAApp'
import SimulationApp from './SimulationApp'
import heroImg from './assets/KnotenCheck.png'
import veloLogo from './assets/VeloroutenCheck.svg'
import './App.css'

type Mode = 'home' | 'sn022' | 'sn024a' | 'vss308' | 'lsa' | 'simulation'

const MODE_BUTTONS = [
  { key: 'sn022',      label: 'Einmündung & Kreuzung',      sub: 'SN 640 022' },
  { key: 'vss308',     label: 'Ungesteuerter Knoten mit FG', sub: 'VSS 2011/308' },
  { key: 'sn024a',     label: 'Kreisverkehr',                sub: 'SN 640 024a' },
  { key: 'lsa',        label: 'LSA-Knoten',                  sub: '(unvollständig)' },
  { key: 'simulation', label: 'Simulation',                   sub: 'Wartezeit-Verteilungen' },
] as const

const HOME_CARDS = [
  {
    key: 'sn022',
    title: 'Einmündung & Kreuzung',
    desc: 'Vorfahrtgeregelte Einmündung oder Kreuzung.',
    badge: 'Beta' as const,
  },
  {
    key: 'vss308',
    title: 'Ungesteuerter Knoten mit Fussgänger*innen',
    desc: 'Vorfahrt- oder gleichrangige Knoten mit Fussgängerstreifen.',
    badge: 'Beta' as const,
  },
  {
    key: 'sn024a',
    title: 'Kreisverkehr',
    desc: 'Ein- und zweistreifige Kreisel.',
    badge: 'Beta' as const,
  },
  {
    key: 'lsa',
    title: 'LSA-Knoten',
    desc: 'LSA-Knoten mit konfigurierbarem Fahrstreifen- und Phasenplan.',
    badge: 'Alpha' as const,
  },
  {
    key: 'simulation',
    title: 'Simulation',
    desc: 'Zeigt, wie Wartezeiten an einem Vorfahrtknoten verteilt sind — nicht als einzelne Zahl, sondern als vollständiges Bild aus Hunderten simulierter Stunden.',
    badge: 'Beta' as const,
  },
] as const

function HomePage({ onSelect }: { onSelect: (m: Mode) => void }) {
  return (
    <main style={{ maxWidth: 900, margin: '0 auto', padding: '40px 16px' }}>
      <img src={heroImg} alt=""
        style={{ width: 150, display: 'block', margin: '0 auto 24px', borderRadius: 10 }} />

      <div style={{ textAlign: 'center', marginBottom: 40 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: '#1e3a5f', margin: '0 0 10px' }}>
          KnotenCheck
        </h1>
        <p style={{ fontSize: 15, color: '#64748b', maxWidth: 540, margin: '0 auto' }}>
          Werkzeug zur Leistungsbeurteilung von Knoten innerorts.
          Wähle einen Rechner:
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
        {HOME_CARDS.map(card => (
          <button key={card.key} onClick={() => onSelect(card.key)}
            style={{ textAlign: 'left', background: '#fff', border: '1px solid #e2e8f0',
                     borderRadius: 10, padding: '20px', cursor: 'pointer',
                     boxShadow: '0 1px 3px #0001', transition: 'box-shadow 0.15s',
                     display: 'flex', flexDirection: 'column', gap: 8 }}
            onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 4px 12px #0002')}
            onMouseLeave={e => (e.currentTarget.style.boxShadow = '0 1px 3px #0001')}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: '#1e3a5f' }}>
                {card.title}
              </span>
              <span style={{
                fontSize: 10, fontWeight: 700,
                color:      card.badge === 'Alpha' ? '#6b21a8' : '#92400e',
                background: card.badge === 'Alpha' ? '#faf5ff' : '#fff7ed',
                border:     `1px solid ${card.badge === 'Alpha' ? '#d8b4fe' : '#fed7aa'}`,
                borderRadius: 4, padding: '2px 6px', flexShrink: 0,
              }}>
                {card.badge}
              </span>
            </div>
            <span style={{ fontSize: 13, color: '#64748b', lineHeight: 1.5 }}>
              {card.desc}
            </span>
          </button>
        ))}

        {/* Querverweis auf VeloroutenCheck (externes Werkzeug) */}
        <a href="https://pnfzygrzgf-svg.github.io/VeloroutenCheck/" target="_blank" rel="noopener noreferrer"
           style={{ textAlign: 'left', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10,
                    padding: '20px', textDecoration: 'none', color: 'inherit', boxShadow: '0 1px 3px #0001',
                    transition: 'box-shadow 0.15s', display: 'flex', flexDirection: 'column', gap: 8 }}
           onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 4px 12px #0002')}
           onMouseLeave={e => (e.currentTarget.style.boxShadow = '0 1px 3px #0001')}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <img src={veloLogo} alt="" width={36} height={36} style={{ flexShrink: 0 }} />
            <span style={{ fontSize: 15, fontWeight: 700, color: '#1e3a5f' }}>VeloroutenCheck&nbsp;↗</span>
          </div>
          <span style={{ fontSize: 13, color: '#64748b', lineHeight: 1.5 }}>
            Qualität der Veloinfrastruktur bewerten.
          </span>
        </a>
      </div>

      <div style={{ marginTop: 48, padding: '16px 20px', borderRadius: 10,
                    background: '#f8fafc', border: '1px solid #e2e8f0',
                    fontSize: 12, color: '#64748b', lineHeight: 1.7, textAlign: 'left' }}>
        <div style={{ fontWeight: 700, color: '#374151', marginBottom: 6 }}>Datenspeicherung</div>
        <div>Alle Berechnungen laufen vollständig im Browser. Eingaben und Ergebnisse werden nie an einen Server übermittelt — es gibt keinen Server, der sie entgegennimmt.</div>
        <ul style={{ margin: '6px 0 0', paddingLeft: 20 }}>
          <li>Eingaben existieren nur im Arbeitsspeicher des Browsers und gehen beim Schliessen des Tabs verloren.</li>
          <li>Speichern / Laden schreibt eine JSON-Datei auf den lokalen Rechner resp. liest von dort — kein Upload, kein Cloud-Speicher.</li>
          <li><strong>Nutzungsstatistik:</strong> Seitenaufrufe werden mit GoatCounter gezählt — datenschutzfreundlich: keine Cookies, keine Speicherung der IP-Adresse, keine personenbezogenen Daten. Übermittelt wird nur ein anonymer Seitenaufruf (mit groben Angaben wie Browser und Herkunftsland), nicht deine Eingaben oder Ergebnisse. GitHub Pages loggt zudem serverseitig Zugriffe (IP, User-Agent), wie jeder Webserver.</li>
        </ul>
      </div>

    </main>
  )
}

export default function App() {
  const [mode, setMode] = useState<Mode>('home')
  // Einmal besuchte Rechner bleiben gemountet (nur versteckt), damit
  // Eingaben beim Wechsel zwischen den Modulen nicht verloren gehen.
  const [visited, setVisited] = useState<ReadonlySet<Mode>>(() => new Set())

  function openMode(m: Mode) {
    setMode(m)
    setVisited(prev => prev.has(m) ? prev : new Set(prev).add(m))
  }

  const apps: { key: Mode; el: React.ReactNode }[] = [
    { key: 'sn022',      el: <SN022App /> },
    { key: 'sn024a',     el: <RoundaboutApp /> },
    { key: 'vss308',     el: <VSS308App /> },
    { key: 'lsa',        el: <LSAApp /> },
    { key: 'simulation', el: <SimulationApp /> },
  ]

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9', fontFamily: 'system-ui, sans-serif' }}>

      {/* Header */}
      <header className="app-header">
        <div className="app-header-inner">
          <span className="app-header-title" onClick={() => openMode('home')}
            style={{ cursor: mode !== 'home' ? 'pointer' : 'default' }}>
            KnotenCheck
          </span>

          {/* Startseite-Button — nur wenn ein Rechner aktiv ist */}
          {mode !== 'home' && (
            <button className="home-btn" onClick={() => openMode('home')}>
              ← Startseite
            </button>
          )}

          {/* Modus-Toggle — nur wenn ein Rechner aktiv ist */}
          {mode !== 'home' && (
            <div className="mode-switcher">
              {MODE_BUTTONS.map(m => (
                <button key={m.key} onClick={() => openMode(m.key)}
                  className={`mode-btn ${mode === m.key ? 'active' : 'inactive'}`}>
                  {m.label}
                  <span className="mode-btn-sub">{m.sub}</span>
                </button>
              ))}
            </div>
          )}

          <nav className="app-header-nav">
            <a href="https://github.com/pnfzygrzgf-svg/KnotenCheck"
               target="_blank" rel="noopener noreferrer">
              <span className="nav-long">Quellcode: </span>GitHub
            </a>
            <span style={{ opacity: 0.5 }}>·</span>
            <a href="https://creativecommons.org/licenses/by-nc/4.0/"
               target="_blank" rel="noopener noreferrer">
              <span className="nav-long">Lizenz: </span>CC BY-NC 4.0
            </a>
          </nav>
        </div>
      </header>

      {mode === 'home' && <HomePage onSelect={openMode} />}

      {apps.map(a => (visited.has(a.key) || mode === a.key) && (
        <div key={a.key}
             style={{ display: mode === a.key ? undefined : 'none' }}
             aria-hidden={mode !== a.key}>
          {a.el}
        </div>
      ))}
    </div>
  )
}
