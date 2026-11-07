// Gelber Hinweis, der beim Scrollen oben sichtbar bleibt (Zustand über useMeldung)

export function Meldung({ text, onClose }: { text: string | null; onClose: () => void }) {
  if (!text) return null
  return (
    <div className="hinweis meldung" role="status">
      <span>{text}</span>
      <button onClick={onClose} aria-label="Meldung schliessen">✕</button>
    </div>
  )
}
