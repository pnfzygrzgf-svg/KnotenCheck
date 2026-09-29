// Kurzmeldung (Toast), die nach 2,8 s verschwindet

import { useEffect, useState } from 'react'

export function useToast() {
  const [msg, setMsg] = useState<string | null>(null)
  useEffect(() => {
    if (!msg) return
    const t = setTimeout(() => setMsg(null), 2800)
    return () => clearTimeout(t)
  }, [msg])
  return { msg, show: (m: string) => setMsg(m) }
}
