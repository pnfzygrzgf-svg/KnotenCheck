import { useState } from 'react'

export interface LegendItem {
  abbr: string
  unit?: string
  desc: string
}

export function LegendBox({ items }: { items: LegendItem[] }) {
  const [open, setOpen] = useState(false)

  return (
    <div style={{ maxWidth: 720, margin: '12px auto 0', padding: '0 16px 16px' }}>
      <button onClick={() => setOpen(v => !v)}
        style={{ width: '100%', textAlign: 'left', padding: '7px 12px',
                 borderRadius: open ? '6px 6px 0 0' : 6,
                 border: '1px solid #e2e8f0', background: '#f8fafc',
                 fontSize: 11, fontWeight: 600, color: '#475569', cursor: 'pointer',
                 display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span>Legende — Abkürzungen &amp; Begriffe</span>
        <span style={{ fontSize: 10, color: '#94a3b8' }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div style={{ border: '1px solid #e2e8f0', borderTop: 'none',
                      borderRadius: '0 0 6px 6px', background: '#fff', overflow: 'hidden' }}>
          {items.map((item, i) => (
            <div key={item.abbr}
              style={{ display: 'flex', gap: 10, padding: '6px 12px',
                       borderBottom: i < items.length - 1 ? '1px solid #f1f5f9' : undefined,
                       background: i % 2 === 0 ? '#fff' : '#fafafa',
                       alignItems: 'baseline' }}>
              <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 12,
                             color: '#1e40af', whiteSpace: 'nowrap', minWidth: 64,
                             flexShrink: 0 }}>
                {item.abbr}
                {item.unit && (
                  <span style={{ fontWeight: 400, color: '#94a3b8', fontSize: 10 }}> [{item.unit}]</span>
                )}
              </span>
              <span style={{ fontSize: 11, color: '#475569', lineHeight: 1.5 }}>{item.desc}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
