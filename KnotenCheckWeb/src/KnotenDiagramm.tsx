// Datengetriebenes Knoten-Schema für die SN 640 022 (Einmündung 3-Arm + Kreuzung 4-Arm).
// Reines JSX-SVG. Pfeile bleiben je Arm im eigenen Zufahrtsbereich (kein Überqueren).
// 4-Arm: ein generischer West-Arm, 4× um die Mitte rotiert (Geometrie DRY); Labels upright.

import { useId } from 'react'

export type Los = 'A' | 'B' | 'C' | 'D' | 'E' | 'F'
export type StreamKey =
  | 'q1' | 'q2' | 'q3' | 'q4' | 'q5' | 'q6'
  | 'q7' | 'q8' | 'q9' | 'q10' | 'q11' | 'q12'
type Pt = readonly [number, number]

export interface KnotenDiagrammProps {
  armCount?: 3 | 4
  volumes?: Partial<Record<StreamKey, number>>
  losByStream?: Partial<Record<StreamKey, Los>>
  // Geometrie-Flags
  separateLaneA?: boolean   // Fn 1: Rechtsabbieger A (q3) auf eigenem Streifen
  islandA?: boolean         // Fn 3: Dreiecksinsel A (q3)
  leftLaneA?: boolean       // separater Linksabbiegestreifen A (q1) — nur Kreuzung
  separateLaneC?: boolean   // Fn 1: Rechtsabbieger C (q9) — nur Kreuzung
  islandC?: boolean         // Fn 3: Dreiecksinsel C (q9) — nur Kreuzung
  leftLaneC?: boolean       // separater Linksabbiegestreifen C (q7)
  islandB?: boolean         // Fn 4: Dreiecksinsel B (q6) — nur Kreuzung
  islandD?: boolean         // Fn 4: Dreiecksinsel D (q12) — nur Kreuzung
  // Fussgängerstreifen je Arm (VSS 2011/308) — Zebra + optionale Mittelinsel
  crosswalkA?: boolean; crosswalkC?: boolean; crosswalkB?: boolean; crosswalkD?: boolean
  mittelA?: boolean;    mittelC?: boolean;    mittelB?: boolean;    mittelD?: boolean
  fgA?: number;         fgC?: number;         fgB?: number;         fgD?: number  // [Fg/h]
  width?: number | string
}

const LOS_COLOR: Record<Los, string> = {
  A: '#2e7d32', B: '#558b2f', C: '#f9a825', D: '#ef6c00', E: '#d84315', F: '#b71c1c',
}
const BLUE = '#185FA5', GRAY = '#7A786F', TEAL = '#0F6E56', STEM = '#9C9A92'
const LANE = '#E1F5EE', ISLE = '#C0DD97', ISLE_S = '#639922'
const RANG1 = new Set<StreamKey>(['q2', 'q3', 'q8', 'q9'])  // freie HS-Ströme → blau

// ── Helfer ────────────────────────────────────────────────────────────────────
const M = (p: Pt) => `M${p[0]} ${p[1]}`
const L = (p: Pt) => `L${p[0]} ${p[1]}`
const Q = (c: Pt, p: Pt) => `Q${c[0]} ${c[1]} ${p[0]} ${p[1]}`
const pts = (...ps: Pt[]) => ps.map(p => `${p[0]},${p[1]}`).join(' ')

// ── Signale (nach Original-SVG) ──────────────────────────────────────────────
// «Kein Vortritt» (Nebenstrasse): rotes umgekehrtes Dreieck mit weisser Mitte
const SignYield = ({ at, s = 9, rot = 0 }: { at: Pt; s?: number; rot?: number }) => (
  <g transform={`translate(${at[0]} ${at[1]}) rotate(${rot})`}>
    <polygon points={`${-s},${-s * 0.8} ${s},${-s * 0.8} 0,${s}`} fill="#ee2c30" stroke="#fff" strokeWidth="1" />
    <polygon points={`${-s * 0.58},${-s * 0.48} ${s * 0.58},${-s * 0.48} 0,${s * 0.55}`} fill="#fff" />
  </g>
)
// «Hauptstrasse» (Vortritt): Raute, schwarzer Rand + gelbe Mitte
const SignPrio = ({ at, s = 9, rot = 0 }: { at: Pt; s?: number; rot?: number }) => (
  <g transform={`translate(${at[0]} ${at[1]}) rotate(${rot})`}>
    <polygon points={`0,${-s} ${s},0 0,${s} ${-s},0`} fill="#231f20" />
    <polygon points={`0,${-s * 0.62} ${s * 0.62},0 0,${s * 0.62} ${-s * 0.62},0`} fill="#fcd213" />
  </g>
)
// Dreiecksinsel: absolut platziert (at = Mitte), rot dreht in die Arm-Richtung
const IslandTri = ({ at, rot = 0, w = 14, h = 18 }: { at: Pt; rot?: number; w?: number; h?: number }) => (
  <g transform={`translate(${at[0]} ${at[1]}) rotate(${rot})`}>
    <polygon points={`${-w / 2},${-h / 2} ${w / 2},${-h / 2} ${w / 2},${h / 2}`}
             fill={ISLE} stroke={ISLE_S} strokeWidth="1" />
  </g>
)
// Fussgängerstreifen (Zebra), absolut platziert. at = Mitte; along = Fahrtrichtung der Strasse
// ('h' = Querstrasse waagrecht, 'v' = senkrecht). mittel = unterteilende Mittelinsel
// (grauer Balken auf der Strassenachse, Art. 47 Abs. 3 VRV). span = Strassenbreite, depth = Tiefe.
const Zebra = ({ at, along, span = 52, depth = 16, mittel }:
  { at: Pt; along: 'h' | 'v'; span?: number; depth?: number; mittel?: boolean }) => {
  const [cx, cy] = at
  const barH = 4.5
  const offs = [-0.42, -0.25, -0.08, 0.08, 0.25, 0.42].map(f => f * span)  // quer zur Fahrt
  const bar = (o: number, i: number) =>
    along === 'h'
      ? <rect key={i} x={cx - depth / 2} y={cy + o - barH / 2} width={depth} height={barH} rx="1" fill="#F4C518" />
      : <rect key={i} x={cx + o - barH / 2} y={cy - depth / 2} width={barH} height={depth} rx="1" fill="#F4C518" />
  return (
    <g>
      {offs.filter(o => !(mittel && Math.abs(o) < 0.12 * span)).map(bar)}
      {mittel && (along === 'h'
        ? <rect x={cx - depth / 2 - 5} y={cy - 6} width={depth + 10} height="12" rx="2" fill="#B9B7AE" stroke="#8A887F" strokeWidth="1" />
        : <rect x={cx - 6} y={cy - depth / 2 - 5} width="12" height={depth + 10} rx="2" fill="#B9B7AE" stroke="#8A887F" strokeWidth="1" />)}
    </g>
  )
}
// Fussgängervolumen [Fg/h] als Pille am Streifen (gelb = Fussgänger-Thema)
const FgLabel = ({ at, v }: { at: Pt; v: number }) => (
  <g>
    <rect x={at[0] - 16} y={at[1] - 9} width="32" height="16" rx="8" fill="#FFFFFF" stroke="#D4A800" strokeWidth="1.2" />
    <text x={at[0]} y={at[1] + 3.5} textAnchor="middle" fontSize="11" fontWeight="700" fill="#8A6D00">{v}</text>
  </g>
)

// ── Ankerpunkte Einmündung (viewBox 0 0 300 345) ─────────────────────────────
const P = {
  aStem: [33, 138], aHub: [100, 138], aToC: [155, 138],
  aToBc: [130, 140], aToB: [130, 178],
  aStrFrom: [33, 132], aStrTo: [155, 132],
  aRgtFrom: [33, 144], aRgtMid: [120, 144], aRgtC: [130, 144], aRgtTo: [130, 178],
  cStem: [267, 112], cHub: [195, 112], cToA: [145, 112],
  cToBc: [150, 120], cToBm: [142, 150], cToB: [142, 178],
  cStrFrom: [267, 106], cStrTo: [145, 106],
  cLftFrom: [267, 118], cLftMid: [165, 118],
  bStem: [160, 270], bHub: [160, 200], bElbow: [160, 188],
  bToA: [134, 168], bToC: [186, 168],
  aCircle: [22, 125], cCircle: [278, 125], bCircle: [150, 284],
  islT: [125, 150], islR: [150, 150], islB: [150, 176],
  lAC: [130, 130], lCA: [150, 94], lAB: [110, 170],
  lCB: [170, 135], lBA: [140, 190], lBC: [190, 190],
} as const

export function KnotenDiagramm({
  armCount = 3, volumes = {}, losByStream = {},
  separateLaneA = false, islandA = false, leftLaneA = true,
  separateLaneC = false, islandC = false, leftLaneC = true,
  islandB = false, islandD = false,
  crosswalkA = false, crosswalkC = false, crosswalkB = false, crosswalkD = false,
  mittelA = false, mittelC = false, mittelB = false, mittelD = false,
  fgA = 0, fgC = 0, fgB = 0, fgD = 0,
  width = '100%',
}: KnotenDiagrammProps) {
  const col = (s: StreamKey, fallback: string) =>
    losByStream[s] ? LOS_COLOR[losByStream[s]!] : fallback
  const fbc = (s: StreamKey) => col(s, RANG1.has(s) ? BLUE : GRAY)
  const lbl = (s: StreamKey) => volumes[s] ?? 0

  // Eindeutige Marker-ID je Instanz — sonst kollidieren mehrere gleichzeitig
  // gemountete Diagramme (SN 022 + VSS 308) auf #kd-arrow → Pfeilspitze fehlt.
  const mid = 'kd-arrow-' + useId().replace(/:/g, '')

  const Arrow = ({ d, c, w = 2.8 }: { d: string; c: string; w?: number }) => (
    <path d={d} fill="none" stroke={c} strokeWidth={w} strokeLinejoin="round" markerEnd={`url(#${mid})`} />
  )
  const Stem = ({ from, to }: { from: Pt; to: Pt }) => (
    <path d={M(from) + L(to)} fill="none" stroke={STEM} strokeWidth="5" strokeLinecap="round" />
  )
  const ArmCircle = ({ at, fill, label }: { at: Pt; fill: string; label: string }) => (
    <g>
      <circle cx={at[0]} cy={at[1]} r="12" fill={fill} />
      <text x={at[0]} y={at[1] + 4} textAnchor="middle" fontSize="12" fontWeight="700" fill="#FFFFFF">{label}</text>
    </g>
  )
  const Marker = (
    <marker id={mid} viewBox="0 0 10 10" refX="8" refY="5"
            markerWidth="8" markerHeight="8" orient="auto">
      <path d="M0,2.5 L10,5 L0,7.5 z" fill="context-stroke" />
    </marker>
  )

  if (armCount === 4) {
    // generischer West-Arm (zeigt nach Osten in die Mitte), 4× rotiert
    type Arm = { deg: number; s: StreamKey; r: StreamKey; l: StreamKey; rl: boolean; ll: boolean }
    const arms: Arm[] = [
      { deg: 0,   s: 'q2',  r: 'q3',  l: 'q1',  rl: separateLaneA, ll: leftLaneA }, // A West
      { deg: 90,  s: 'q11', r: 'q12', l: 'q10', rl: false,         ll: false     }, // D Nord
      { deg: 180, s: 'q8',  r: 'q9',  l: 'q7',  rl: separateLaneC, ll: leftLaneC }, // C Ost
      { deg: 270, s: 'q5',  r: 'q6',  l: 'q4',  rl: false,         ll: false     }, // B Süd
    ]
    return (
      <svg width={width} viewBox="0 0 360 360" role="img"
           xmlns="http://www.w3.org/2000/svg" fontFamily="sans-serif">
        <title>Kreuzung — Knotenschema</title>
        <desc>4-Arm-Knoten: Hauptstrasse A–C, Nebenstrasse B–D; Richtungspfeile je Arm.</desc>
        <defs>{Marker}</defs>

        {/* Fahrbahnen-Kreuz (breite Arme) */}
        <g stroke="#B4B2A9" strokeWidth="1">
          <rect x="6" y="150" width="348" height="60" fill="#ECEAE2" />
          <rect x="150" y="6" width="60" height="348" fill="#ECEAE2" />
        </g>
        <g stroke="#FFFFFF" strokeWidth="1.5" strokeDasharray="7 6">
          <line x1="6" y1="180" x2="150" y2="180" /><line x1="210" y1="180" x2="354" y2="180" />
          <line x1="180" y1="6" x2="180" y2="150" /><line x1="180" y1="210" x2="180" y2="354" />
        </g>

        {/* Fussgängerstreifen (am Stammende, nahe Knotenmitte) — unter den Pfeilen */}
        {crosswalkA && <Zebra at={[92, 180]}  along="h" mittel={mittelA} />}
        {crosswalkC && <Zebra at={[268, 180]} along="h" mittel={mittelC} />}
        {crosswalkD && <Zebra at={[180, 92]}  along="v" mittel={mittelD} />}
        {crosswalkB && <Zebra at={[180, 268]} along="v" mittel={mittelB} />}

        {/* Arme (Geometrie rotiert) */}
        {arms.map(a => {
          // Stamm nur, solange mind. ein Abbieger die mittlere Spur teilt
          const shared = !a.ll || !a.rl
          return (
            <g key={a.deg} transform={`rotate(${a.deg} 180 180)`}>
              {a.ll && <rect x="32" y="158" width="74" height="12" rx="2" fill={LANE} />}
              {a.rl && <rect x="32" y="190" width="74" height="12" rx="2" fill={LANE} />}
              {shared && <path d="M34 180 L100 180" fill="none" stroke={STEM} strokeWidth="5" strokeLinecap="round" />}
              <Arrow d={shared ? 'M100 180 L146 180' : 'M34 180 L146 180'} c={fbc(a.s)} />
              {a.ll
                ? <Arrow d="M34 164 L104 164 L104 150" c={fbc(a.l)} />
                : <Arrow d="M100 180 L108 180 L108 156" c={fbc(a.l)} />}
              {a.rl
                ? <Arrow d="M34 196 L104 196 L104 210" c={fbc(a.r)} />
                : <Arrow d="M100 180 L108 180 L108 204" c={fbc(a.r)} />}
            </g>
          )
        })}

        {/* Dreiecksinseln — absolut platziert, jede unabhängig verschiebbar (at = Mitte) */}
        {islandA && <IslandTri at={[155, 213]} rot={0} />}
        {islandD && <IslandTri at={[150, 155]} rot={90} />}
        {islandC && <IslandTri at={[205, 145]} rot={180} />}
        {islandB && <IslandTri at={[210, 205]} rot={270} />}

        {/* Arm-Kreise: A & C = Hauptstrasse (blau), B & D = Nebenstrasse (grau) */}
        <ArmCircle at={[24, 180]} fill={BLUE} label="A" />
        <ArmCircle at={[336, 180]} fill={BLUE} label="C" />
        <ArmCircle at={[180, 336]} fill="#888780" label="B" />
        <ArmCircle at={[180, 24]} fill="#888780" label="D" />

        {/* Signale: A/C Hauptstrasse (Raute), B/D Nebenstrasse (Kein Vortritt) */}
        <SignPrio at={[140, 210]} />
        <SignPrio at={[220, 150]} />
        <SignYield at={[210, 220]} />
        <SignYield at={[150, 140]} rot={180} />

        {/* Werte (explizit platziert, neben den Pfeilen; Farbe = LOS/Rang-1-Blau) */}
        <g fontSize="13" textAnchor="middle">
          <text x="150" y="175" fill={fbc('q2')}> {lbl('q2')}</text>
          <text x="110" y="225" fill={fbc('q3')}> {lbl('q3')}</text>
          <text x="110" y="145" fill={fbc('q1')}> {lbl('q1')}</text>
          <text x="228" y="170" fill={fbc('q8')}> {lbl('q8')}</text>
          <text x="250" y="145" fill={fbc('q9')}> {lbl('q9')}</text>
          <text x="250" y="225" fill={fbc('q7')}> {lbl('q7')}</text>
          <text x="185" y="160" fill={fbc('q11')}> {lbl('q11')}</text>
          <text x="135" y="110" fill={fbc('q12')}> {lbl('q12')}</text>
          <text x="225" y="110" fill={fbc('q10')}> {lbl('q10')}</text>
          <text x="185" y="205" fill={fbc('q5')}> {lbl('q5')}</text>
          <text x="135" y="256" fill={fbc('q4')}> {lbl('q4')}</text>
          <text x="225" y="256" fill={fbc('q6')}> {lbl('q6')}</text>
        </g>

        {/* Fussgängervolumen [Fg/h] am jeweiligen Streifen */}
        {crosswalkA && fgA > 0 && <FgLabel at={[60, 180]}  v={fgA} />}
        {crosswalkC && fgC > 0 && <FgLabel at={[300, 180]} v={fgC} />}
        {crosswalkD && fgD > 0 && <FgLabel at={[180, 70]}  v={fgD} />}
        {crosswalkB && fgB > 0 && <FgLabel at={[180, 290]} v={fgB} />}
      </svg>
    )
  }

  // ── Einmündung (3-Arm) ─────────────────────────────────────────────────────
  return (
    <svg width={width} viewBox="0 0 300 345" role="img"
         xmlns="http://www.w3.org/2000/svg" fontFamily="sans-serif">
      <title>Einmündung — Knotenschema</title>
      <desc>T-Knoten Hauptstrasse A–C, Nebenstrasse B; Strompfeile mit Volumen.</desc>
      <defs>{Marker}</defs>

      <g stroke="#B4B2A9" strokeWidth="1">
        <rect x="10" y="100" width="280" height="50" fill="#ECEAE2" />
        <rect x="125" y="150" width="50" height="150" fill="#ECEAE2" />
      </g>
      <g stroke="#FFFFFF" strokeWidth="1.5" strokeDasharray="7 6">
        <line x1="10" y1="125" x2="120" y2="125" /><line x1="180" y1="125" x2="290" y2="125" />
        <line x1="150" y1="156" x2="150" y2="298" />
      </g>

      {/* Fussgängerstreifen (am Stammende, nahe Knotenmitte) */}
      {crosswalkA && <Zebra at={[100, 125]} along="h" span={44} mittel={mittelA} />}
      {crosswalkC && <Zebra at={[197, 125]} along="h" span={44} mittel={mittelC} />}
      {crosswalkB && <Zebra at={[150, 202]} along="v" span={44} mittel={mittelB} />}

      {islandA && (
        <polygon points={pts(P.islT, P.islR, P.islB)} fill={ISLE} stroke={ISLE_S} strokeWidth="1" />
      )}

      {separateLaneA ? (
        <>
          <rect x="22" y="139" width="108" height="11" fill={LANE} />
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

      {leftLaneC ? (
        <>
          <rect x="159" y="113" width="108" height="11" fill={LANE} />
          <line x1="167" y1="112" x2="259" y2="112" stroke="#FFFFFF" strokeWidth="1.4" strokeDasharray="6 5" />
          <Arrow d={M(P.cStrFrom) + L(P.cStrTo)} c={col('q8', BLUE)} />
          <Arrow d={M(P.cLftFrom) + L(P.cLftMid) + Q(P.cToBc, P.cToBm) + L(P.cToB)} c={col('q7', GRAY)} />
        </>
      ) : (
        <>
          <Stem from={P.cStem} to={P.cHub} />
          <Arrow d={M(P.cHub) + L(P.cToA)} c={col('q8', BLUE)} />
          <Arrow d={M(P.cHub) + Q(P.cToBc, P.cToBm) + L(P.cToB)} c={col('q7', GRAY)} />
        </>
      )}

      <Stem from={P.bStem} to={P.bHub} />
      <Arrow d={M(P.bHub) + L(P.bElbow) + L(P.bToA)} c={col('q4', GRAY)} />
      <Arrow d={M(P.bHub) + L(P.bElbow) + L(P.bToC)} c={col('q6', GRAY)} />

      <ArmCircle at={P.aCircle} fill={BLUE} label="A" />
      <ArmCircle at={P.cCircle} fill={BLUE} label="C" />
      <ArmCircle at={P.bCircle} fill="#888780" label="B" />

      {/* Signale: A/C Hauptstrasse (Raute), B Nebenstrasse (Kein Vortritt) */}
      <SignPrio at={[110, 150]} />
      <SignPrio at={[175, 90]} />
      <SignYield at={[180, 150]} />

      <g fontSize="13" fill="#2C2C2A" textAnchor="middle">
        <text x={P.lAC[0]} y={P.lAC[1]} fill={fbc('q2')}> {lbl('q2')}</text>
        <text x={P.lCA[0]} y={P.lCA[1]} fill={fbc('q8')}> {lbl('q8')}</text>
        <text x={P.lAB[0]} y={P.lAB[1]} fill={fbc('q3')}> {lbl('q3')}</text>
        <text x={P.lCB[0]} y={P.lCB[1]} fill={fbc('q7')}> {lbl('q7')}</text>
        <text x={P.lBA[0]} y={P.lBA[1]} fill={fbc('q4')}> {lbl('q4')}</text>
        <text x={P.lBC[0]} y={P.lBC[1]} fill={fbc('q6')}> {lbl('q6')}</text>
      </g>

      {/* Fussgängervolumen [Fg/h] am jeweiligen Streifen */}
      {crosswalkA && fgA > 0 && <FgLabel at={[65, 125]}  v={fgA} />}
      {crosswalkC && fgC > 0 && <FgLabel at={[230, 125]} v={fgC} />}
      {crosswalkB && fgB > 0 && <FgLabel at={[152, 225]} v={fgB} />}
    </svg>
  )
}
