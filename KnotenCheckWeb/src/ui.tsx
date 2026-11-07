// Gemeinsame UI-Bausteine aller Rechner-Module

import { useState } from 'react'
import type { LevelOfService } from './engine/types'
import { LOS_COLOR, LOS_BG, utilizationColor } from './uiHelpers'

// ── Kleine Hilfskomponenten ────────────────────────────────────────────────────

export function LOSBadge({ los }: { los: LevelOfService }) {
  return (
    <span style={{
      display: 'inline-block', minWidth: 28, textAlign: 'center',
      padding: '2px 8px', borderRadius: 6, fontWeight: 700, fontSize: 13,
      color: LOS_COLOR[los], background: LOS_BG[los],
      border: `1px solid ${LOS_COLOR[los]}44`,
    }}>{los}</span>
  )
}

export function NumInput({ value, onChange, min = 0, max = 9999, width = 72, live = false }: {
  value: number; onChange: (v: number) => void; min?: number; max?: number; width?: number
  // live = true: meldet jeden Tastendruck (für Felder mit Live-Berechnungsanzeige);
  // sonst wird der Wert erst beim Verlassen des Felds (onBlur) übernommen.
  live?: boolean
}) {
  const [raw, setRaw] = useState(() => value === 0 ? '' : String(value))
  const [synced, setSynced] = useState(value)
  if (value !== synced) { setSynced(value); setRaw(value === 0 ? '' : String(value)) }
  return (
    <input type="number" inputMode="decimal" min={min} max={max}
      value={raw}
      onChange={e => {
        setRaw(e.target.value)
        if (live && e.target.value !== '') {
          onChange(Math.max(min, Math.min(max, Number(e.target.value) || 0)))
        }
      }}
      onBlur={() => {
        const n = raw === '' ? 0 : Math.max(min, Math.min(max, Number(raw) || 0))
        setRaw(n === 0 ? '' : String(n))
        onChange(n)
      }}
      style={{ width, textAlign: 'right', padding: '3px 6px' }}
    />
  )
}

/** Leere Wahl einer Auswahlliste, solange nichts gewählt ist */
export function LeereWahl() {
  return <option value="" disabled>wählen …</option>
}

/** Steht anstelle des Ergebnisses, solange Angaben fehlen */
export function OffeneAngaben({ liste }: { liste: string[] }) {
  return (
    <div style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.6, padding: '12px 8px', textAlign: 'left' }}>
      <strong style={{ color: 'var(--text)' }}>Für die Berechnung fehlt noch:</strong>
      <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>{liste.map(x => <li key={x}>{x}</li>)}</ul>
    </div>
  )
}

export function SectionLabel({ title }: { title: string }) {
  return (
    <div style={{ padding: '5px 14px', fontSize: 12, fontWeight: 700, color: 'var(--text)',
                  background: '#f8fafc', borderBottom: '1px solid var(--kachel-rand)' }}>
      {title}
    </div>
  )
}

export function Row({ label, sub, children }: { label: string; sub?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8,
                  padding: '7px 14px', borderBottom: '1px solid var(--kachel-rand)' }}>
      <div style={{ flex: 1 }}>
        <div style={{ color: 'var(--text)' }}>{label}</div>
        {sub && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 1 }}>{sub}</div>}
      </div>
      {children}
    </div>
  )
}

export function Ckbx({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <input type="checkbox" checked={checked}
      onChange={e => onChange(e.target.checked)}
      style={{ width: 16, height: 16, cursor: 'pointer', flexShrink: 0 }}
    />
  )
}

// Umschalt-Knopf: aktiv in der Produktfarbe, inaktiv als Zweitknopf.
// small: kompakte Variante für dichte Leisten (Tabs, Parameter-Auswahl).
export function ToggleBtn({ active, onClick, children, small }: {
  active: boolean; onClick: () => void; children: React.ReactNode; small?: boolean
}) {
  return (
    <button onClick={onClick} className={`knopf${active ? '' : ' zweit'}${small ? ' klein' : ''}`}>
      {children}
    </button>
  )
}

// Sekundär-Knopf der Werkzeugleiste (Fall speichern, Fall laden)
export function ToolbarBtn({ onClick, children }: {
  onClick: () => void; children: React.ReactNode
}) {
  return (
    <button onClick={onClick} className="knopf zweit">
      {children}
    </button>
  )
}

export function UtilBar({ value }: { value: number }) {
  const pct = Math.min(1, value)
  const col = utilizationColor(value)
  return (
    <div style={{ height: 6, borderRadius: 3, background: '#e5e7eb', overflow: 'hidden', margin: '6px 0' }}>
      <div style={{ height: '100%', width: `${pct * 100}%`, background: col, borderRadius: 3,
                    transition: 'width 0.3s' }} />
    </div>
  )
}
