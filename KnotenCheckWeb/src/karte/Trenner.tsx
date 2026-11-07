// Trenner zwischen Karte und Panel wie in den anderen Rechnern: ziehen bzw. Pfeiltasten ändern die Breite. Die Breite gilt nur für die
// Sitzung; KnotenCheck speichert nichts im Browser.

import { useRef } from 'react'

export const PANEL_VORGABE = 440
const PANEL_MIN = 360
const PANEL_MAX_ANTEIL = 0.7
const SCHRITT = 20

const klemmen = (b: number) => Math.round(Math.min(Math.max(PANEL_MIN, Math.floor(window.innerWidth * PANEL_MAX_ANTEIL)), Math.max(PANEL_MIN, b)))

export default function Trenner({ breite, setze }: { breite: number; setze: (b: number) => void }) {
  const zieht = useRef(false)
  return <div className="trenner" role="separator" aria-orientation="vertical" aria-label="Breite des Bereichs" tabIndex={0}
    aria-valuenow={breite} title="Ziehen bzw. Pfeiltasten: Breite des Bereichs"
    onPointerDown={e => { if (e.button !== 0) return; zieht.current = true; e.currentTarget.setPointerCapture(e.pointerId); e.preventDefault() }}
    onPointerMove={e => { if (zieht.current) setze(klemmen(window.innerWidth - e.clientX)) }}
    onPointerUp={e => { if (zieht.current) { zieht.current = false; e.currentTarget.releasePointerCapture(e.pointerId) } }}
    onPointerCancel={() => { zieht.current = false }}
    onKeyDown={e => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
      e.preventDefault()
      setze(klemmen(breite + (e.key === 'ArrowLeft' ? SCHRITT : -SCHRITT)))
    }} />
}
