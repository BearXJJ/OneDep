/**
 * TypeScript port of the continuous-corner subset of Kyant0/Shapes (Apache-2.0).
 * Source: https://github.com/Kyant0/Shapes; see THIRD-PARTY-LICENSES.txt
 */
const SQRT_2 = Math.SQRT2
const FRAC_PI_4 = Math.PI / 4
const FRAC_1_SQRT_2 = Math.SQRT1_2

function solveCubicSingle(a: number, b: number, c: number, d: number) {
  const f = ((3 * c) / a - (b * b) / (a * a)) / 3
  const g = ((2 * b * b * b) / (a * a * a) - (9 * b * c) / (a * a) + (27 * d) / a) / 27
  const h = (g * g) / 4 + (f * f * f) / 27
  const sqrtH = Math.sqrt(h)
  return Math.cbrt(-g / 2 + sqrtH) + Math.cbrt(-g / 2 - sqrtH) - b / (3 * a)
}

function solveDepressedQuarticSingle(p: number, q: number, r: number) {
  const b = -p / 2
  const c = -r
  const d = (r * p) / 2 - (q * q) / 8
  const f = (3 * c - b * b) / 3
  const g = (2 * b * b * b - 9 * b * c + 27 * d) / 27
  const rr = Math.sqrt((-f * f * f) / 27)
  const phi = Math.acos(-g / (2 * rr))
  const y = 2 * Math.sqrt(-f / 3) * Math.cos(phi / 3)
  const z = y - b / 3
  const u = Math.sqrt(2 * z - p)
  return (u - Math.sqrt(u * u - 4 * (z + q / (2 * u)))) / 2
}

class ContinuousCornerBuilder {
  private readonly extendedFraction: number
  private readonly cos: number
  private readonly sin: number
  private readonly cot: number
  private readonly cos2: number
  private readonly sin2: number
  private readonly sin3: number
  private readonly k0: number
  private readonly k1: number
  private readonly k2: number
  private readonly k3: number
  private readonly cache = new Map<string, readonly number[]>()

  constructor(extendedFraction = 2 / 3, arcFraction = 0.5) {
    this.extendedFraction = extendedFraction
    const theta = (1 - arcFraction) * FRAC_PI_4
    this.cos = Math.cos(theta)
    this.sin = Math.sin(theta)
    this.cot = 1 / Math.tan(theta)
    this.cos2 = this.cos * this.cos
    this.sin2 = this.sin * this.sin
    const cos3 = this.cos2 * this.cos
    this.sin3 = this.sin2 * this.sin

    const { cos, cos2, sin, sin2, sin3, cot } = this
    this.k0 =
      27 * (SQRT_2 - 6 * cos + 6 * SQRT_2 * cos2 - 4 * cos3) * cot +
      2 *
        sin *
        (-9 +
          2 * (SQRT_2 - 2 * sin) * sin3 +
          2 * SQRT_2 * cos * (9 + sin2) -
          2 * cos2 * (9 + 2 * sin2))
    this.k1 =
      -81 * (-2 + SQRT_2 + 4 * (-1 + SQRT_2) * cos + 2 * (-2 + SQRT_2) * cos2) * cot -
      4 * sin * (-9 + 9 * SQRT_2 + SQRT_2 * sin3 + (-2 + SQRT_2) * cos * (9 + sin2))
    this.k2 = 9 * (9 * (-4 + 3 * SQRT_2 + (-6 + 4 * SQRT_2) * cos) * cot + (-6 + 4 * SQRT_2) * sin)
    this.k3 = 27 * (10 - 7 * SQRT_2) * cot
  }

  corner(tH = 1, tV = 1) {
    const key = `${tH.toFixed(4)}|${tV.toFixed(4)}`
    const cached = this.cache.get(key)
    if (cached) return cached
    const corner = tH === tV ? this.even(tH) : this.uneven(tH, tV)
    this.cache.set(key, corner)
    return corner
  }

  private kappa(k: number) {
    return solveCubicSingle(this.k3, this.k2, this.k1 - 8 * k * this.sin3 * this.sin, this.k0)
  }

  private even(t: number) {
    const { sin, cos, cot, sin3, cos2, sin2 } = this
    const k = this.extendedFraction * t
    const kappa = this.kappa(k)
    const x3 = FRAC_1_SQRT_2 + (-FRAC_1_SQRT_2 + sin) / kappa
    const y3 = 1 - FRAC_1_SQRT_2 + (FRAC_1_SQRT_2 - cos) / kappa
    const x2 = x3 - y3 * cot
    const x1 = x2 - (1.5 * kappa * y3 * y3) / sin3
    const x0 = -k
    const x6 = 1 - y3
    const y6 = 1 - x3
    const y7 = 1 - x2
    const y8 = 1 - x1
    const y9 = 1 - x0
    const a = 1.5 * kappa
    const g = cos2 - sin2
    const x36 = x6 - x3
    const y36 = y6 - y3
    const c = -(cos * y36 - sin * x36)
    const lambda = (-g + Math.sqrt(g * g - 4 * a * c)) / (2 * a)
    const x4 = x3 + lambda * cos
    const y4 = y3 + lambda * sin
    const x5 = x6 - lambda * sin
    const y5 = y6 - lambda * cos
    return [x0, 0, x1, 0, x2, 0, x3, y3, x4, y4, x5, y5, x6, y6, 1, y7, 1, y8, 1, y9]
  }

  private uneven(tH: number, tV: number) {
    const { sin, cos, cot, sin3, cos2, sin2 } = this
    const kH = this.extendedFraction * tH
    const kV = this.extendedFraction * tV
    const kappa3 = this.kappa(kH)
    const kappa6 = this.kappa(kV)
    const x3 = FRAC_1_SQRT_2 + (-FRAC_1_SQRT_2 + sin) / kappa3
    const y3 = 1 - FRAC_1_SQRT_2 + (FRAC_1_SQRT_2 - cos) / kappa3
    const x2 = x3 - y3 * cot
    const x1 = x2 - (1.5 * kappa3 * y3 * y3) / sin3
    const x0 = -kH
    const x3p = FRAC_1_SQRT_2 + (-FRAC_1_SQRT_2 + sin) / kappa6
    const y3p = 1 - FRAC_1_SQRT_2 + (FRAC_1_SQRT_2 - cos) / kappa6
    const x2p = x3p - y3p * cot
    const x1p = x2p - (1.5 * kappa6 * y3p * y3p) / sin3
    const x0p = -kV
    const x6 = 1 - y3p
    const y6 = 1 - x3p
    const y7 = 1 - x2p
    const y8 = 1 - x1p
    const y9 = 1 - x0p
    const a = 1.5 * kappa3
    const b = 1.5 * kappa6
    const g = cos2 - sin2
    const x36 = x6 - x3
    const y36 = y6 - y3
    const c = -(cos * y36 - sin * x36)
    const d = sin * y36 - cos * x36
    const p = 2 * (d / b)
    const q = (g * g * g) / (a * b * b)
    const r = (a * d * d + c * g * g) / (a * b * b)
    const lambda6 = solveDepressedQuarticSingle(p, q, r)
    const lambda3 = (-d - b * lambda6 * lambda6) / g
    const x4 = x3 + lambda3 * cos
    const y4 = y3 + lambda3 * sin
    const x5 = x6 - lambda6 * sin
    const y5 = y6 - lambda6 * cos
    return [x0, 0, x1, 0, x2, 0, x3, y3, x4, y4, x5, y5, x6, y6, 1, y7, 1, y8, 1, y9]
  }
}

const cornerBuilder = new ContinuousCornerBuilder()

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value))
}

function formatCoordinate(value: number) {
  const rounded = Math.round(value * 100) / 100
  return Object.is(rounded, -0) ? '0' : rounded.toString()
}

/**
 * Kyant0/Shapes continuous-curvature rounded rectangle.
 * Each corner is three cubic Bezier segments; the radius is clamped to a capsule.
 */
export function continuousRoundedRect(width: number, height: number, radius: number) {
  const w = Math.max(0, width)
  const h = Math.max(0, height)
  if (w === 0 || h === 0) return ''

  const r = Math.min(Math.max(0, radius), Math.min(w, h) / 2)
  if (r === 0)
    return `M 0 0 L ${formatCoordinate(w)} 0 L ${formatCoordinate(w)} ${formatCoordinate(h)} L 0 ${formatCoordinate(h)} Z`

  const tW = clamp01((w * 0.5 - r) / r)
  const tH = clamp01((h * 0.5 - r) / r)
  const corner = cornerBuilder.corner(tW, tH)
  const corners = [
    { ox: w - r, oy: 0, sx: 1, sy: 1, reverse: false },
    { ox: w - r, oy: h, sx: 1, sy: -1, reverse: true },
    { ox: r, oy: h, sx: -1, sy: -1, reverse: false },
    { ox: r, oy: 0, sx: -1, sy: 1, reverse: true },
  ]
  const pointAt = (item: (typeof corners)[number], index: number) =>
    [
      item.ox + corner[index * 2]! * item.sx * r,
      item.oy + corner[index * 2 + 1]! * item.sy * r,
    ] as const

  let path = ''
  for (let cornerIndex = 0; cornerIndex < corners.length; cornerIndex += 1) {
    const item = corners[cornerIndex]!
    const indices = item.reverse ? [9, 8, 7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
    const points = indices.map((index) => pointAt(item, index))
    const start = points[0]!
    path += `${cornerIndex === 0 ? 'M' : ' L'} ${formatCoordinate(start[0])} ${formatCoordinate(start[1])}`
    for (let segment = 0; segment < 3; segment += 1) {
      const control1 = points[segment * 3 + 1]!
      const control2 = points[segment * 3 + 2]!
      const end = points[segment * 3 + 3]!
      path += ` C ${formatCoordinate(control1[0])} ${formatCoordinate(control1[1])} ${formatCoordinate(control2[0])} ${formatCoordinate(control2[1])} ${formatCoordinate(end[0])} ${formatCoordinate(end[1])}`
    }
  }
  return `${path} Z`
}
