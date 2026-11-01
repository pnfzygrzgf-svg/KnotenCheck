// Geladene Daten (JSON-Datei) auf eine Vorlage mit Standardwerten legen.
// Fehlende Felder, falsche Typen und null werden durch den Wert der Vorlage ersetzt,
// damit eine unvollständige oder fremde Datei keine NaN-Werte oder Abstürze erzeugt.
//
// - Zahl:    nur endliche Zahlen; ist der Vorlagewert ≥ 0, auch keine negativen
//            (JSON kennt kein Infinity: eine gespeicherte Infinity kommt als null
//            zurück und erhält den Vorlagewert)
// - Text/Ja-Nein: nur gleicher Typ
// - Array:   Element i gegen Vorlage-Element i (bzw. das letzte); Länge aus der Datei.
//            Leere Vorlage → leeres Array (Elemente muss der Aufrufer selbst prüfen)
// - Objekt:  alle Felder der Vorlage; optionale Felder (in der Vorlage undefined
//            oder nicht vorhanden) werden nur als Zahl, Text, Ja-Nein oder flaches
//            Objekt solcher Werte übernommen — ihren Inhalt prüft der Aufrufer
// Auswahlwerte (z. B. Neigungsklasse) und Armanzahlen prüft jedes Modul selbst.

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function isPrimitive(v: unknown): boolean {
  return typeof v === 'number' ? Number.isFinite(v)
    : typeof v === 'boolean' || typeof v === 'string'
}

function looseValue(v: unknown): unknown {
  if (isPrimitive(v)) return v
  if (isPlainObject(v) && Object.values(v).every(isPrimitive)) return { ...v }
  return undefined
}

export function conform<T>(template: T, value: unknown): T {
  if (template === undefined || template === null) return looseValue(value) as T
  if (typeof template === 'number') {
    const ok = typeof value === 'number' && Number.isFinite(value) && !(template >= 0 && value < 0)
    return (ok ? value : template) as T
  }
  if (typeof template === 'boolean' || typeof template === 'string')
    return (typeof value === typeof template ? value : template) as T
  if (Array.isArray(template)) {
    if (!Array.isArray(value) || template.length === 0) return (template.length === 0 ? [] : template) as T
    return value.map((v, i) => conform(template[Math.min(i, template.length - 1)], v)) as T
  }
  if (isPlainObject(template)) {
    const src = isPlainObject(value) ? value : {}
    const out: Record<string, unknown> = {}
    for (const k of Object.keys(template)) {
      const v = conform(template[k], src[k])
      if (v !== undefined) out[k] = v
    }
    for (const k of Object.keys(src)) {
      if (k in template) continue
      const v = looseValue(src[k])
      if (v !== undefined) out[k] = v
    }
    return out as T
  }
  return template
}

// Wert aus einer Auswahl, sonst Standardwert
export function oneOf<T extends string | number>(allowed: readonly T[], value: unknown, fallback: T): T {
  return allowed.includes(value as T) ? value as T : fallback
}

// Arrays fester Länge: je Position gegen die Vorlage (fehlende Elemente = Vorlage)
export function conformFixed<T>(templates: T[], value: unknown): T[] {
  const src = Array.isArray(value) ? value : []
  return templates.map((t, i) => conform(t, src[i]))
}
