// Richtwerte für die maximale Sättigung gemäss VSS-Norm (Tabelle S. 9)
// Port von ReferenceValues.swift

import type { VehicleMode, Rank } from './types'

export function maxSaturation(mode: VehicleMode, rank: Rank): number {
  switch (mode) {
    case 'motorVehicle':   return rank === 'primary' ? 1800 : 1500
    case 'pedestrian':     return 2500
    case 'tramOwnTrack':   return rank === 'primary' ? 360  : 300
    case 'busOwnTrack':    return rank === 'primary' ? 720  : 600
    // ÖV ohne Überholen
    case 'transitOneStop_NoOvertake':    return rank === 'primary' ? 120 : 100
    case 'transitTwoStops_NoOvertake':   return rank === 'primary' ? 180 : 150
    case 'transitThreeStops_NoOvertake': return rank === 'primary' ? 245 : 205
    case 'transitFourStops_NoOvertake':  return rank === 'primary' ? 305 : 255
    // ÖV mit Überholen
    case 'transitOneStop_Overtake':    return rank === 'primary' ? 120 : 100
    case 'transitTwoStops_Overtake':   return rank === 'primary' ? 190 : 155
    case 'transitThreeStops_Overtake': return rank === 'primary' ? 255 : 215
    case 'transitFourStops_Overtake':  return rank === 'primary' ? 320 : 265
  }
}
