// Entwurf / Pilot: datengetriebenes Knoten-Schema für die SN 640 022 (Einmündung).
// Reines JSX-SVG (Ansatz 4). Alle Koordinaten als benannte Punkte in P — eine Quelle
// der Wahrheit: Punkt einmal verschieben, alle Pfeile/Labels ziehen mit.

export type Los = 'A' | 'B' | 'C' | 'D' | 'E' | 'F'
type StreamKey = 'q2' | 'q3' | 'q4' | 'q6' | 'q7' | 'q8'
type Pt = readonly [number, number]

export interface KnotenDiagrammProps {
  // Volumen je Strom (Fz/h oder PWE/h) — nur zur Beschriftung
  volumes?: Partial<Record<StreamKey, number>>
  // Geometrie-Flags (entsprechen den SN640022LaneFlags)
  separateLaneA?: boolean   // Fn 1: Rechtsabbieger q3 auf eigenem Streifen
  islandA?: boolean         // Fn 3: Dreiecksinsel für q3
  // optional: Ergebnis-LOS je Strom → färbt die Pfeile
  losByStream?: Partial<Record<StreamKey, Los>>
  width?: number | string
}

// LOS-Farben (entspricht der Konvention im Rechner; bei Bedarf LOS_COLOR aus ui.tsx nutzen)
const LOS_COLOR: Record<Los, string> = {
  A: '#2e7d32', B: '#558b2f', C: '#f9a825', D: '#ef6c00', E: '#d84315', F: '#b71c1c',
}
const BLUE = '#185FA5', GRAY = '#7A786F', TEAL = '#0F6E56', STEM = '#9C9A92'

// ── Benannte Ankerpunkte (Pixel im viewBox 0 0 300 345) ──────────────────────
// Verschiebe einen Punkt hier → Pfeile, Stämme, Inseln und Labels folgen.
const P = {
  // Arm A (West) — Standard: ein Stamm, zwei Abzweige
  aStem: [33, 138], aHub: [100, 138],
  aToC: [155, 138],                                // q2 geradeaus → C
  aToBc: [130, 140], aToB: [130, 178],             // q3 rechts → B (Kontrollpkt · Ende)
  // Arm A — Fn 1: zwei getrennte Zufahrten
  aStrFrom: [33, 132], aStrTo: [155, 132],         // q2 auf eigener Spur
  aRgtFrom: [33, 144], aRgtMid: [120, 144],
  aRgtC: [130, 144], aRgtTo: [130, 178],           // q3 separat → B
  // Arm C (Ost)
  cStem: [267, 112], cHub: [195, 112],
  cToA: [145, 112],                                // q8 geradeaus → A
  cToBc: [150, 120], cToBm: [142, 150], cToB: [142, 178],  // q7 links → B
  // Arm B (Süd)
  bStem: [160, 270], bHub: [160, 200], bElbow: [160, 188],
  bToA: [134, 168],                                // q4 links → A
  bToC: [186, 168],                                // q6 rechts → C
  // Arm-Kreise
  aCircle: [22, 125], cCircle: [278, 125], bCircle: [150, 284],
  // Dreiecksinsel (Fn 3)
  islT: [134, 150], islR: [158, 150], islB: [158, 176],
  // Label-Anker
  lAC: [80, 130], lCA: [210, 94], lAB: [80, 170],
  lCB: [210, 130], lBA: [130, 206], lBC: [190, 206],
} as const

// ── Pfad-Helfer: bauen die d-Strings aus benannten Punkten ───────────────────
const M = (p: Pt) => `M${p[0]} ${p[1]}`
const L = (p: Pt) => `L${p[0]} ${p[1]}`
const Q = (c: Pt, p: Pt) => `Q${c[0]} ${c[1]} ${p[0]} ${p[1]}`
const pts = (...ps: Pt[]) => ps.map(p => `${p[0]},${p[1]}`).join(' ')

export function KnotenDiagramm({
  volumes = {}, separateLaneA = false, islandA = false, losByStream = {}, width = '100%',
}: KnotenDiagrammProps) {
  // Pfeilfarbe: LOS, falls vorhanden — sonst Gruppen-Fallback
  const col = (s: StreamKey, fallback: string) =>
    losByStream[s] ? LOS_COLOR[losByStream[s]!] : fallback
  const lbl = (s: StreamKey) => volumes[s] ?? 0

  // Pfeil (Spitze übernimmt Linienfarbe via context-stroke)
  const Arrow = ({ d, c, w = 2.8 }: { d: string; c: string; w?: number }) => (
    <path d={d} fill="none" stroke={c} strokeWidth={w} strokeLinejoin="round" markerEnd="url(#kd-arrow)" />
  )
  // Stamm = graue Zufahrtslinie zwischen zwei Punkten
  const Stem = ({ from, to }: { from: Pt; to: Pt }) => (
    <path d={M(from) + L(to)} fill="none" stroke={STEM} strokeWidth="5" strokeLinecap="round" />
  )
  // Arm-Kreis mit Buchstabe
  const ArmCircle = ({ at, fill, label }: { at: Pt; fill: string; label: string }) => (
    <g>
      <circle cx={at[0]} cy={at[1]} r="11" fill={fill} />
      <text x={at[0]} y={at[1] + 4} textAnchor="middle" fontSize="11" fontWeight="700" fill="#FFFFFF">{label}</text>
    </g>
  )

  return (
    <svg width={width} viewBox="0 0 300 345" role="img"
         xmlns="http://www.w3.org/2000/svg" fontFamily="sans-serif">
      <title>Einmündung — Knotenschema</title>
      <desc>T-Knoten Hauptstrasse A–C, Nebenstrasse B; Strompfeile mit Volumen.</desc>

      <defs>
        <marker id="kd-arrow" viewBox="0 0 10 10" refX="8" refY="5"
                markerWidth="7" markerHeight="7" orient="auto">
          <path d="M0,0 L10,5 L0,10 z" fill="context-stroke" />
        </marker>
      </defs>

      {/* Fahrbahnen (statischer Rahmen) */}
      <g stroke="#B4B2A9" strokeWidth="1">
        <rect x="10" y="100" width="280" height="50" fill="#ECEAE2" />
        <rect x="125" y="150" width="50" height="150" fill="#ECEAE2" />
      </g>
      <g stroke="#FFFFFF" strokeWidth="1.5" strokeDasharray="7 6">
        <line x1="10" y1="125" x2="120" y2="125" /><line x1="180" y1="125" x2="290" y2="125" />
        <line x1="150" y1="156" x2="150" y2="298" />
      </g>

      {/* Dreiecksinsel (Fn 3) */}
      {islandA && (
        <polygon points={pts(P.islT, P.islR, P.islB)} fill="#C0DD97" stroke="#639922" strokeWidth="1" />
      )}

      {/* Arm A — Standard: ein Stamm, zwei Abzweige; mit Fn 1: zwei getrennte Zufahrten */}
      {separateLaneA ? (
        <>
          <rect x="22" y="139" width="108" height="11" fill="#E1F5EE" />
          <line x1="40" y1="138" x2="128" y2="138" stroke="#FFFFFF" strokeWidth="1.4" strokeDasharray="6 5" />
          <Arrow d={M(P.aStrFrom) + L(P.aStrTo)} c={col('q2', BLUE)} />
          <Arrow d={M(P.aRgtFrom) + L(P.aRgtMid) + Q(P.aRgtC, P.aRgtTo)} c={col('q3', TEAL)} />
        </>
      ) : (
        <>
          <Stem from={P.aStem} to={P.aHub} />
          <Arrow d={M(P.aHub) + L(P.aToC)} c={col('q2', BLUE)} />
          <Arrow d={M(P.aHub) + Q(P.aToBc, P.aToB)} c={col('q3', BLUE)} />
        </>
      )}

      {/* Arm C — Stamm + zwei Pfeile (gerade nach A, links nach B) */}
      <Stem from={P.cStem} to={P.cHub} />
      <Arrow d={M(P.cHub) + L(P.cToA)} c={col('q8', BLUE)} />
      <Arrow d={M(P.cHub) + Q(P.cToBc, P.cToBm) + L(P.cToB)} c={col('q7', GRAY)} />

      {/* Arm B — Stamm + zwei Pfeile (links nach A, rechts nach C) */}
      <Stem from={P.bStem} to={P.bHub} />
      <Arrow d={M(P.bHub) + L(P.bElbow) + L(P.bToA)} c={col('q4', GRAY)} />
      <Arrow d={M(P.bHub) + L(P.bElbow) + L(P.bToC)} c={col('q6', GRAY)} />

      {/* Arm-Marken: A & C = Hauptstrasse (blau), B = Nebenstrasse (grau) */}
      <ArmCircle at={P.aCircle} fill={BLUE} label="A" />
      <ArmCircle at={P.cCircle} fill={BLUE} label="C" />
      <ArmCircle at={P.bCircle} fill="#888780" label="B" />

      {/* Beschriftungen (alle zentriert, vererbt von der Gruppe) */}
      <g fontSize="11" fill="#2C2C2A" textAnchor="middle">
        <text x={P.lAC[0]} y={P.lAC[1]}>A→C {lbl('q2')}</text>
        <text x={P.lCA[0]} y={P.lCA[1]}>C→A {lbl('q8')}</text>
        <text x={P.lAB[0]} y={P.lAB[1]} fill={separateLaneA ? TEAL : '#2C2C2A'} fontWeight={separateLaneA ? 600 : 400}>
          A→B {lbl('q3')}{separateLaneA ? ' · separat' : ''}
        </text>
        <text x={P.lCB[0]} y={P.lCB[1]}>C→B {lbl('q7')}</text>
        <text x={P.lBA[0]} y={P.lBA[1]}>B→A {lbl('q4')}</text>
        <text x={P.lBC[0]} y={P.lBC[1]}>B→C {lbl('q6')}</text>
      </g>
    </svg>
  )
}