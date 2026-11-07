#!/usr/bin/env node
// ── Knotenerkennung aus dem SichtweitenCheck holen ──
//
// Kopiert die Dateien der Knotenerkennung wortgleich nach src/knotenkern/ (gleicher relativer Aufbau, damit kein Import geändert
// werden muss) und schreibt src/knotenkern/herkunft.json (Quelle, Version, Commit, SHA-256 je Datei). Der Test
// src/knotenkern/herkunft.test.ts prüft, dass die Kopien unverändert sind. Änderungen gehören in den SichtweitenCheck (MIT);
// KnotenCheck (AGPL) empfängt nur, Code fliesst nicht zurück.
//
// Einzige Datei von Hand: src/knotenkern/rechner/typen.ts. Sie enthält nur die Typen, die knoten.ts braucht; die Typdatei des
// SichtweitenCheck zöge sonst fast den ganzen Rechner nach. Weicht sie ab, meldet es die Typprüfung nach dem Holen.
//
// Aufruf: node scripts/knotenkern_holen.mjs [Pfad zu SichtweitenCheckWeb] [--trotzdem | --pruefen]
//   ohne Pfad: Umgebungsvariable SWC_PFAD, sonst ../../SichtweitenCheck/SichtweitenCheckWeb neben dem KnotenCheck-Ordner
//   --trotzdem: auch mit nicht eingecheckten Änderungen in der Quelle (die Herkunft vermerkt es)
//   --pruefen: Quelle, Kopie und Manifest vergleichen, nichts schreiben

import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HIER = dirname(fileURLToPath(import.meta.url))
const ZIEL = resolve(HIER, '..', 'src', 'knotenkern')
const args = process.argv.slice(2)
const trotzdem = args.includes('--trotzdem')
const pruefen = args.includes('--pruefen')
if (args.some(a => a.startsWith('--') && !['--trotzdem', '--pruefen'].includes(a))) {
  console.error('Unbekannte Option; erlaubt sind --trotzdem und --pruefen.'); process.exit(1)
}
const pfad = resolve(args.find(a => !a.startsWith('--')) ?? process.env.SWC_PFAD ??
  resolve(HIER, '..', '..', '..', 'SichtweitenCheck', 'SichtweitenCheckWeb'))
const SRC = join(pfad, 'src')
if (!existsSync(join(SRC, 'rechner', 'knoten.ts'))) { console.error(`Kein SichtweitenCheck unter ${pfad}.`); process.exit(1) }

const DATEIEN = [
  'Ortssuche.tsx', 'ausschnitt.ts', 'daten/anbieter/gemeinsam/qualitaet.ts', 'daten/bernDtm.ts', 'daten/hoehen.ts', 'daten/hoehenDienst.ts',
  'daten/holen.ts', 'daten/ortssuche.ts', 'daten/osm.ts', 'geo.ts', 'rechner/knoten.ts', 'rechner/neigung.ts', 'rechner/netz.ts', 'verknuepfung.test.ts',
  'verknuepfung.ts',
  // Amtliches Tempo als Kartenebene: Gebiet am Ort, kantonale Dienste und Stadt Zürich samt allem, was sie importieren
  ...['avKarte', 'bav', 'bedarfOrte', 'bundGeoAdmin', 'bundPoi', 'bundPoiUrl', 'bundesAbruf', 'bundesBudget', 'e6', 'gebiet', 'geoAdmin', 'regional', 'regionalDienste',
    'regionalGeometrie', 'typen', 'zuerich'].map(f => `daten/anbieter/gemeinsam/${f}.ts`),
]

const git = (...a) => execFileSync('git', ['-C', pfad, ...a], { encoding: 'utf-8', env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' } }).trim()
const commit = git('rev-parse', 'HEAD')
const datum = git('show', '-s', '--format=%cI', 'HEAD')
// nur die geholten Dateien: Im übrigen SichtweitenCheck darf gerade gearbeitet werden
const offen = git('status', '--porcelain', '--', ...DATEIEN.map(f => `src/${f}`))
const version = JSON.parse(readFileSync(join(pfad, 'package.json'), 'utf-8')).version
const hash = inhalt => createHash('sha256').update(inhalt).digest('hex')
const manifestPfad = join(ZIEL, 'herkunft.json')

if (pruefen) {
  const fehler = []
  let manifest
  try { manifest = JSON.parse(readFileSync(manifestPfad, 'utf-8')) } catch { fehler.push('herkunft.json fehlt oder ist ungültig') }
  for (const f of DATEIEN) {
    const quelle = readFileSync(join(SRC, f)), ziel = join(ZIEL, f)
    if (!existsSync(ziel) || !readFileSync(ziel).equals(quelle)) fehler.push(`${f}: Kopie fehlt oder weicht vom SichtweitenCheck ab`)
    if (manifest?.dateien?.[f] !== hash(quelle)) fehler.push(`${f}: Prüfsumme im Manifest weicht von der Quelle ab`)
  }
  if (fehler.length) { console.error(fehler.join('\n')); process.exit(1) }
  console.log(`Kopierprüfung bestanden: ${DATEIEN.length} Dateien stimmen mit SichtweitenCheck ${version} überein; nichts geschrieben.`)
  process.exit(0)
}

if (offen && !trotzdem) { console.error(`Quelle mit nicht eingecheckten Änderungen an geholten Dateien:\n${offen}\nErst einchecken bzw. --trotzdem.`); process.exit(1) }
const dateien = {}
for (const f of DATEIEN) {
  const inhalt = readFileSync(join(SRC, f))
  mkdirSync(dirname(join(ZIEL, f)), { recursive: true })
  writeFileSync(join(ZIEL, f), inhalt)
  dateien[f] = hash(inhalt)
}
copyFileSync(join(pfad, 'LICENSE'), join(ZIEL, 'LICENSE'))
writeFileSync(manifestPfad, JSON.stringify({
  hinweis: 'Wortgleiche Kopie aus dem SichtweitenCheck (scripts/knotenkern_holen.mjs), MIT-Lizenz siehe LICENSE in diesem Ordner. ' +
    'Nicht von Hand ändern; der Test src/knotenkern/herkunft.test.ts prüft die SHA-256 je Datei.',
  quelle: 'SichtweitenCheck', version, commit, datum, ...(offen ? { nichtEingecheckt: true } : {}), dateien,
}, null, 1) + '\n')
console.log(`SichtweitenCheck ${version} (${commit.slice(0, 7)}): ${DATEIEN.length} Dateien nach src/knotenkern/.`)
