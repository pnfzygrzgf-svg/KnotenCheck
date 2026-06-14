// Gemeinsame UI-Bausteine aller Rechner-Module

import { useState } from 'react'
import type { LevelOfService } from './engine/types'

// ── Farben ─────────────────────────────────────────────────────────────────────

// Wiederkehrende Farb-Tokens der App
export const C = {
  primary:   '#1e3a5f',  // Marine — Primäraktionen, aktive Toggles, Tabellenköpfe
  text:      '#374151',
  textMuted: '#6b7280',
  textFaint: '#9ca3af',
  border:    '#d1d5db',
  bgSubtle:  '#f3f4f6',
  bgPanel:   '#f8fafc',
  bgToolbar: '#f9fafb',
  danger:    '#dc2626',
  ok:        '#16a34a',
} as const

export const LOS_COLOR: Record<LevelOfService, string> = {
  A: '#16a34a', B: '#65a30d', C: '#ca8a04', D: '#ea580c', E: '#dc2626', F: '#7f1d1d',
}
export const LOS_BG: Record<LevelOfService, string> = {
  A: '#dcfce7', B: '#ecfccb', C: '#fef9c3', D: '#ffedd5', E: '#fee2e2', F: '#fecaca',
}

// ── Formatierung ───────────────────────────────────────────────────────────────

export function delayText(w: number): string {
  if (!isFinite(w)) return '> 999 s'
  if (w < 1)        return '< 1 s'
  return `ca. ${Math.round(w)} s`
}

export function utilizationColor(a: number): string {
  if (a < 0.70) return '#16a34a'
  if (a < 0.90) return '#ca8a04'
  if (a < 1.00) return '#ea580c'
  return '#dc2626'
}

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
      value={raw} placeholder="0"
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
      style={{ width, textAlign: 'right', padding: '3px 6px', borderRadius: 4,
               border: '1px solid #d1d5db', fontSize: 13 }}
    />
  )
}

export function SectionLabel({ title }: { title: string }) {
  return (
    <div style={{ padding: '5px 14px', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em',
                  color: '#6b7280', background: '#f9fafb', borderBottom: '1px solid #f0f0f0',
                  textTransform: 'uppercase' }}>
      {title}
    </div>
  )
}

export function Row({ label, sub, children }: { label: string; sub?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8,
                  padding: '7px 14px', borderBottom: '1px solid #f3f4f6' }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, color: '#374151' }}>{label}</div>
        {sub && <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 1 }}>{sub}</div>}
      </div>
      {children}
    </div>
  )
}

export function Ckbx({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <input type="checkbox" checked={checked}
      onChange={e => onChange(e.target.checked)}
      style={{ width: 16, height: 16, cursor: 'pointer', flexShrink: 0, accentColor: '#1e3a5f' }}
    />
  )
}

// Umschalt-Knopf (Pill): aktiv = Marine, inaktiv = grau.
// small: kompakte Variante für dichte Leisten (Tabs, Parameter-Auswahl).
export function ToggleBtn({ active, onClick, children, small }: {
  active: boolean; onClick: () => void; children: React.ReactNode; small?: boolean
}) {
  return (
    <button onClick={onClick}
      style={{ padding: small ? '3px 10px' : '5px 18px', borderRadius: small ? 5 : 6,
               fontSize: small ? 12 : 13, cursor: 'pointer',
               fontWeight: active ? 700 : 400,
               background: active ? C.primary : C.bgSubtle,
               color: active ? '#fff' : C.text,
               border: active ? `1px solid ${C.primary}` : `1px solid ${C.border}` }}>
      {children}
    </button>
  )
}

// Sekundär-Knopf der Werkzeugleiste (Speichern / Laden)
export function ToolbarBtn({ onClick, children }: {
  onClick: () => void; children: React.ReactNode
}) {
  return (
    <button onClick={onClick}
      style={{ padding: '4px 12px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
               border: `1px solid ${C.border}`, background: C.bgToolbar, color: C.text }}>
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
