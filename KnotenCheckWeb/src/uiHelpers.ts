// Gemeinsame Anzeige-Helfer (keine Komponenten): Farben, Formatierung, Bezeichnungen

import type { LevelOfService } from './engine/types'
import { classifyLOS } from './engine/levelOfService'

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

// ── Bezeichnungen ──────────────────────────────────────────────────────────────

export function streamMovementName(n: number): string {
  const map: Record<number, string> = {
    1: 'Linksabbiegen HS (A→D)', 7: 'Linksabbiegen HS (C→B)',
    4: 'Linkseinbiegen NS (B→A)', 6: 'Rechtseinbiegen NS (B→C)', 5: 'Kreuzen NS (B→D)',
    10: 'Linkseinbiegen NS (D→C)', 12: 'Rechtseinbiegen NS (D→A)', 11: 'Kreuzen NS (D→B)',
  }
  return map[n] ?? `Strom ${n}`
}

// QS aus simulierter mittlerer Wartezeit — Tab.-3-Schwellen der SN 640 022;
// F, wenn die Auslastung der Haltelinie x ≥ 1 ist (Warteschlange wächst bis Periodenende)
export function simLOS(mean: number, utilization: number): LevelOfService {
  return classifyLOS(mean, utilization)
}
