// Gemeinsames Speichern/Laden-Format aller Rechner-Module:
// { version, tool, name, timestamp, data }

export function exportTool(opts: {
  tool: string                       // Modul-Kennung in der Datei (z.B. 'sn022')
  filePrefix: string                 // Dateiname-Teil (z.B. 'SN022')
  name: string                       // Nutzer-Bezeichnung des Knotens
  fallbackName?: string              // falls Bezeichnung leer; default 'knoten'
  data: unknown
  showToast: (msg: string) => void
}): void {
  const safeName = opts.name.trim().replace(/[^\w\-äöüÄÖÜ]/g, '_').slice(0, 40)
    || opts.fallbackName || 'knoten'
  const filename = `KnotenCheck_${opts.filePrefix}_${safeName}.json`
  downloadJSON(filename, {
    version: 1, tool: opts.tool, name: opts.name,
    timestamp: new Date().toISOString(),
    data: opts.data,
  })
  opts.showToast(`Gespeichert als ${filename}`)
}

export async function importTool<T>(
  tool: string,
  apply: (data: T, name: string) => void,
  showToast: (msg: string) => void,
): Promise<void> {
  try {
    const raw = await readJSONFile() as Record<string, unknown>
    if (raw?.tool !== tool) {
      alert('Diese Datei gehört zu einem anderen Rechner-Modul.')
      return
    }
    apply(raw.data as T, (raw.name as string) || '')
    showToast(`Geladen: ${(raw.name as string) || 'Unbenannt'}`)
  } catch (e) { alert((e as Error).message) }
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
