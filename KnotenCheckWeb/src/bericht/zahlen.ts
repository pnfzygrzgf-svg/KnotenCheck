// Zahlen aus dem Text eines Druckblatts, für Vergleiche vor und nach einem Umbau
export function zahlenAus(html: string): string[] {
  const text = html.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\b\d{1,2}\.\d{1,2}\.\d{4}\b/g, ' ')   // Datum des Drucks
    .replace(/v\d+\.\d+\.\d+/g, ' ')   // Version des Programms: ändert sich mit jeder Ausgabe
  return [...text.matchAll(/-?\d+(?:[.,]\d+)?/g)].map(m => m[0])
}
/** Zahlen der Referenz, die im neuen Text fehlen oder seltener vorkommen */
export function fehlendeZahlen(ref: readonly string[], neu: readonly string[]): string[] {
  const zahl = new Map<string, number>()
  for (const z of neu) zahl.set(z, (zahl.get(z) ?? 0) + 1)
  const fehlt: string[] = []
  for (const z of ref) { const n = zahl.get(z) ?? 0; if (n > 0) zahl.set(z, n - 1); else fehlt.push(z) }
  return fehlt
}
