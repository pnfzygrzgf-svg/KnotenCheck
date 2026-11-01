// Fehlergrenze je Rechner-Modul: Ein Absturz beim Anzeigen (z. B. nach dem Laden einer
// beschädigten Datei) betrifft nur dieses Modul — nicht die ganze Seite und nicht die
// Eingaben der anderen Rechner.

import { Component, type ReactNode } from 'react'

export class ModuleErrorBoundary extends Component<
  { children: ReactNode; onReset: () => void },
  { failed: boolean }
> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <main style={{ maxWidth: 640, margin: '40px auto', padding: '20px 24px', background: '#fff',
                     borderRadius: 10, border: '1px solid #fca5a5', fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ fontWeight: 700, fontSize: 16, color: '#991b1b', marginBottom: 8 }}>
          Dieser Rechner konnte nicht angezeigt werden
        </div>
        <p style={{ fontSize: 13, color: '#374151', margin: '0 0 14px', lineHeight: 1.5 }}>
          Vermutlich enthalten die Eingaben ungültige Werte, z. B. aus einer beschädigten Datei.
          Die anderen Rechner sind nicht betroffen.
        </p>
        <button onClick={this.props.onReset}
          style={{ padding: '8px 16px', borderRadius: 6, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                   border: '1px solid #1e3a5f', background: '#1e3a5f', color: '#fff' }}>
          Rechner zurücksetzen
        </button>
      </main>
    )
  }
}
