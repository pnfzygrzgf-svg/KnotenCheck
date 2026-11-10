// Arme, für die der Modellvorschlag keine Ströme hat: Der Rechner zeigt erst ein Ergebnis, wenn dort Ströme stehen oder «kein Verkehr»
// bestätigt ist. Ein fehlender Modellwert ist kein gezählter Nullverkehr.

import { offeneModellArme, type KnotenUebernahme } from './rechner'

export default function ModellLuecken({ u, summen, bestaetigt, onBestaetigen }: {
  u: KnotenUebernahme | undefined
  /** Summe der Ströme je Arm in Rechner-Reihenfolge [Fz/h] */
  summen: readonly number[]
  bestaetigt: readonly number[]
  onBestaetigen: (arm: number) => void
}) {
  const offen = offeneModellArme(u, summen, bestaetigt)
  if (!u || !offen.length) return null
  return (
    <div role="status" className="hinweis" style={{ marginBottom: 14 }}>
      <strong>Ströme ohne Modellwert.</strong>{' '}
      Für {offen.length === 1 ? 'diesen Arm' : 'diese Arme'} hat der Modellvorschlag keine Ströme (kein passender Modellwert oder Widerspruch zur Einbahn in
      OpenStreetMap). Das heisst nicht, dass dort kein Verkehr fährt. Bitte die Ströme am Arm eingeben oder bestätigen, dass von dort kein Verkehr zum Knoten fährt.
      <div style={{ marginTop: 6, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {offen.map(i => (
          <button key={i} className="knopf zweit" onClick={() => onBestaetigen(i)}>Arm {u.arme[i].label}: kein Verkehr</button>
        ))}
      </div>
    </div>
  )
}
