// Gemeinsames Speichern/Laden-Format aller Rechner-Module:
// { version, tool, name, timestamp, data }
//
// data.leereFelder: Die Rechner beginnen ohne Startwerte. In einer Datei mit dieser Angabe heisst
// ein fehlender Wert «noch nicht gewählt». Ältere Dateien haben sie nicht; dort gilt beim Laden
// weiter der Wert, mit dem die Datei gerechnet wurde.

export function exportTool(opts: {
  tool: string                       // Modul-Kennung in der Datei (z.B. 'sn022')
  filePrefix: string                 // Dateiname-Teil (z.B. 'SN022')
  name: string                       // Nutzer-Bezeichnung des Knotens
  fallbackName?: string              // falls Bezeichnung leer; default 'knoten'
  data: Record<string, unknown>
  melden: (text: string, bleibt?: boolean) => void
}): void {
  const safeName = opts.name.trim().replace(/[^\w\-äöüÄÖÜ]/g, '_').slice(0, 40)
    || opts.fallbackName || 'knoten'
  const filename = `KnotenCheck_${opts.filePrefix}_${safeName}.json`
  downloadJSON(filename, {
    version: 1, tool: opts.tool, name: opts.name,
    timestamp: new Date().toISOString(),
    data: { ...opts.data, leereFelder: true },
  })
  opts.melden(`Gespeichert als ${filename}`)
}

// apply erhält die Rohdaten der Datei und muss sie selbst absichern (engine/conform.ts)
export async function importTool(
  tool: string,
  apply: (data: Record<string, unknown>, name: string) => void,
  melden: (text: string, bleibt?: boolean) => void,
): Promise<void> {
  let raw: Record<string, unknown>
  try {
    raw = await readJSONFile() as Record<string, unknown>
  } catch (e) { melden((e as Error).message, true); return }
  if (raw?.tool !== tool) {
    melden('Diese Datei gehört zu einem anderen Rechner-Modul.', true)
    return
  }
  const data = raw.data
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    melden('Die Datei enthält keine Rechner-Daten.', true)
    return
  }
  const name = typeof raw.name === 'string' ? raw.name : ''
  try {
    apply(data as Record<string, unknown>, name)
    melden(`Geladen: ${name || 'Unbenannt'}`)
  } catch {
    melden('Die Datei konnte nicht geladen werden (unvollständig oder beschädigt).', true)
  }
}

export function downloadJSON(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function readJSONFile(): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json,application/json'
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) return reject(new Error('Keine Datei ausgewählt'))
      const reader = new FileReader()
      reader.onload = e => {
        try {
          resolve(JSON.parse(e.target?.result as string))
        } catch {
          reject(new Error('Ungültiges JSON-Format'))
        }
      }
      reader.onerror = () => reject(new Error('Datei konnte nicht gelesen werden'))
      reader.readAsText(file)
    }
    input.click()
  })
}
