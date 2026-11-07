// Kurze Meldung oben im Rechner. Bestätigungen verschwinden nach 4 s, Fehler bleiben, bis man sie schliesst

import { useCallback, useEffect, useState } from 'react'

export function useMeldung() {
  const [stand, setStand] = useState<{ text: string; bleibt: boolean } | null>(null)
  useEffect(() => {
    if (!stand || stand.bleibt) return
    const t = setTimeout(() => setStand(null), 4000)
    return () => clearTimeout(t)
  }, [stand])
  const melden = useCallback((text: string, bleibt = false) => setStand({ text, bleibt }), [])
  return { meldung: stand?.text ?? null, melden, schliessen: useCallback(() => setStand(null), []) }
}
