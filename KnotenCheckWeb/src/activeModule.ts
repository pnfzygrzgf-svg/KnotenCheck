// Ist das umgebende Rechner-Modul gerade sichtbar? Versteckte Module bleiben gemountet
// (Eingaben bleiben erhalten), dürfen aber keine Druckblätter ausgeben — diese hängen
// per Portal direkt am <body> und würden sonst beim Drucken mit ausgegeben.

import { createContext, useContext } from 'react'

export const ActiveModuleContext = createContext(true)

export function useIsActiveModule(): boolean {
  return useContext(ActiveModuleContext)
}
