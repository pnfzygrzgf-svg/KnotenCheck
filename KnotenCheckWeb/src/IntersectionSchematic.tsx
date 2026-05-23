import kreuzungBase  from './assets/kreuzung.svg'
import kreuzungFn1A  from './assets/kreuzung-fn1.svg'
import kreuzungFn1C  from './assets/kreuzung-fn1c.svg'

interface Props {
  armASeparateLane: boolean  // Fn 1 Arm A (Strom 3)
  armCSeparateLane: boolean  // Fn 1 Arm C (Strom 9)
}

export function IntersectionSchematic({ armASeparateLane, armCSeparateLane }: Props) {
  let src = kreuzungBase
  let alt = 'Kreuzung – Standardfall'

  if (armASeparateLane) {
    src = kreuzungFn1A
    alt = 'Kreuzung – Arm A: Strom 3 auf separatem Streifen (Fn 1)'
  } else if (armCSeparateLane) {
    src = kreuzungFn1C
    alt = 'Kreuzung – Arm C: Strom 9 auf separatem Streifen (Fn 1)'
  }

  return (
    <img src={src} alt={alt}
      style={{ width: '100%', height: 'auto', display: 'block' }} />
  )
}
