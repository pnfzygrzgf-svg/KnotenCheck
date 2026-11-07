// Fusszeile wie in den anderen Rechnern: Name, Marke, Version, Lizenzen und Links

import type { ReactNode } from 'react'
import { MARKE, QUELLCODE } from './marke'

/** Zeile mit Name, Lizenzen und Links; der Vibecoding-Satz steht in den Arbeitsseiten, nicht auf der Startseite */
export function Lizenzzeile({ vibecoding = true }: { vibecoding?: boolean }) {
  return (
    <>
      KnotenCheck {MARKE} v{__APP_VERSION__} · Code unter <a href="https://www.gnu.org/licenses/agpl-3.0.html" target="_blank" rel="noopener noreferrer">AGPL-3.0</a>,
      eigene Inhalte unter <a href="https://creativecommons.org/licenses/by-sa/4.0/deed.de" target="_blank" rel="noopener noreferrer">CC BY-SA 4.0</a> (eingebundene
      Daten behalten ihre eigenen Lizenzen) · <a href={QUELLCODE} target="_blank" rel="noopener noreferrer">Quellcode auf GitHub</a>
      {vibecoding && " · Vibecoding. Don't trust, verify!"} · <a href="https://ko-fi.com/pnfzygrzgfsvg" target="_blank" rel="noopener noreferrer">Unterstützen ↗</a>
    </>
  )
}

/** Fusszeile eines Rechners: zuerst der fachliche Satz, danach die Lizenzzeile */
export function RechnerFuss({ children }: { children: ReactNode }) {
  return (
    <footer className="fuss">
      <p>{children}</p>
      <Lizenzzeile />
    </footer>
  )
}
