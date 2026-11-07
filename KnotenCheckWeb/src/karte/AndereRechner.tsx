// Kachel «In anderen Rechnern prüfen» wie in den anderen Rechnern: öffnet den Ort in einem neuen Tab. Ein geöffneter Rechner ist noch
// keine Prüfung: Es gehen nur Lage und öffentliche OSM-Id mit, nichts kommt zurück.

import veloLogo from '../assets/VeloroutenCheck.svg'
import fgsLogo from '../assets/fgsCheck.svg'
import sichtLogo from '../assets/SichtweitenCheck.svg'
import { RECHNER_NAME, zielAdresse, type Ort, type Rechner } from '../knotenkern/verknuepfung'

const BILD: Partial<Record<Rechner, string>> = { swc: sichtLogo, fgs: fgsLogo, vrc: veloLogo }
const Logo = ({ r, px = 20 }: { r: Rechner; px?: number }) => <img className="rechner-logo" src={BILD[r]} alt="" width={px} height={px} />

export default function AndereRechner({ knoten, ort }: { knoten: number; ort: Ort }) {
  const ziele: { rechner: Rechner; text: string; knoten?: number }[] = [
    { rechner: 'swc', text: 'Sicht an diesem Knoten prüfen', knoten },
    { rechner: 'fgs', text: 'Fussgängerstreifen prüfen' },
    { rechner: 'vrc', text: 'Veloinfrastruktur bewerten' },
  ]
  return (
    <details className="abschnitt">
      <summary><h2>In anderen Rechnern prüfen {ziele.map(z => <Logo key={z.rechner} r={z.rechner} />)}</h2></summary>
      <ul className="ziele">{ziele.map(z => <li key={z.rechner}>
        <Logo r={z.rechner} px={28} />
        <span><a href={zielAdresse(z.rechner, 'knc', { ort, knoten: z.knoten })} target="_blank" rel="noopener noreferrer"><b>{RECHNER_NAME[z.rechner]}</b>&nbsp;↗</a><br />{z.text}</span>
      </li>)}</ul>
      <p className="klein">Öffnet den Ort im anderen Rechner. Das Ergebnis eines Rechners ersetzt das des anderen nicht.</p>
    </details>
  )
}
