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

export function Toast({ msg }: { msg: string | null }) {
  if (!msg) return null
  return (
    <div style={{
      position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)',
      background: '#1e293b', color: '#fff', padding: '10px 20px',
      borderRadius: 8, fontSize: 13, zIndex: 9999, pointerEvents: 'none',
      boxShadow: '0 4px 16px rgba(0,0,0,0.2)', whiteSpace: 'nowrap',
    }}>
      {msg}
    </div>
  )
}
