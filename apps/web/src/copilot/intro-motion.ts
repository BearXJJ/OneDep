/**
 * Motion reconstructed from Apple's public iPhone 18 Pro overview bundle:
 * AllAccessPass b05bbde4cfe52f4777ce, MediaCardGalleryControl 72639399b71409f82212,
 * SpringLayer 6942b669ea94514ae07b. Readable, standalone implementation.
 * Retains their 60 Hz semi-implicit spring step, parameters and target delays.
 * Precomputed frames make seeking and cancellation deterministic.
 */
export const INTRO_DURATION = 3.4
const STEP = 1 / 60
type Spring = {
  position: number
  velocity: number
  target: number
  stiffness: number
  damping: number
}
export type Frame = Record<string, number>
type Cue = [number, string, number, ('target' | 'velocity')?]

function simulate(springs: Record<string, Spring>, cues: Cue[]): Frame[] {
  cues.sort((a, b) => a[0] - b[0])
  let cue = 0
  const frames: Frame[] = []
  for (let index = 0; index <= Math.ceil(INTRO_DURATION / STEP); index++) {
    const t = index * STEP
    frames.push(Object.fromEntries(Object.entries(springs).map(([name, s]) => [name, s.position])))
    while (cue < cues.length && cues[cue]![0] <= t + 1e-8) {
      const [, name, value, field = 'target'] = cues[cue++]!
      springs[name]![field] = value
    }
    for (const spring of Object.values(springs)) {
      if (Math.abs(spring.position - spring.target) < 0.001 && Math.abs(spring.velocity) < 0.001) {
        spring.position = spring.target
        spring.velocity = 0
      } else {
        spring.velocity +=
          (-spring.stiffness * (spring.position - spring.target) -
            spring.damping * spring.velocity) *
          STEP
        spring.position += spring.velocity * STEP
      }
    }
  }
  // The source solver also snaps to the target at rest; use exact final geometry.
  frames[frames.length - 1] = Object.fromEntries(
    Object.entries(springs).map(([name, s]) => [name, s.target]),
  )
  return frames
}

export function frameAt(frames: Frame[], time: number): Frame {
  const position = Math.min(frames.length - 1, Math.max(0, time / STEP))
  const index = Math.floor(position)
  const a = frames[index]!
  const b = frames[Math.min(index + 1, frames.length - 1)]!
  return Object.fromEntries(
    Object.keys(a).map((key) => [key, a[key]! + (b[key]! - a[key]!) * (position - index)]),
  )
}

/** CSS ease-in/ease-out timing, used for the source's icon and dot fades. */
export function cssEase(progress: number, kind: 'in' | 'out' | 'in-out'): number {
  const x = Math.max(0, Math.min(1, progress))
  const x1 = kind !== 'out' ? 0.42 : 0
  const x2 = kind === 'in' ? 1 : 0.58
  let lo = 0,
    hi = 1
  for (let i = 0; i < 16; i++) {
    const t = (lo + hi) / 2
    const curveX = 3 * (1 - t) ** 2 * t * x1 + 3 * (1 - t) * t ** 2 * x2 + t ** 3
    if (curveX < x) lo = t
    else hi = t
  }
  const t = (lo + hi) / 2
  return 3 * (1 - t) * t ** 2 + t ** 3
}

/** Apple's TextIconControl: one bubble, a separate icon spring and delayed text. */
export function createActionFrames(width: number, height: number): Frame[] {
  const springs: Record<string, Spring> = {}
  const add = (name: string, position: number, stiffness = 100, damping = 20) => {
    springs[name] = { position, target: position, velocity: 0, stiffness, damping }
  }
  const duration = (name: string, position: number, seconds: number) =>
    add(name, position, ((2 * Math.PI) / seconds) ** 2, (4 * Math.PI) / seconds)
  add('y', 180, 100, 8)
  add('introX', -15, 100, 8)
  add('introWidth', 30, 100, 8)
  add('introHeight', 80, 100, 8)
  duration('introScale', 1.3, 0.5)
  add('width', 40)
  add('height', 36)
  duration('scale', 1.3, 0.5)
  add('alpha', 0)
  add('iconX', -(width / 2 - 28), 110, 20)
  add('iconScale', 0)
  add('iconWidth', 36, 100, 10)
  add('textScale', 0.5)
  return simulate(springs, [
    [0, 'introScale', 0.8],
    [0.03, 'y', 0],
    [0.05, 'introX', -28],
    [0.05, 'introWidth', 56],
    [0.15, 'introHeight', 56],
    [0.2, 'iconScale', 1],
    [0.3, 'scale', 1],
    [0.5, 'width', width],
    [0.5, 'iconWidth', 200, 'velocity'],
    [0.5, 'iconX', 0],
    [0.52, 'alpha', 1],
    [0.6, 'textScale', 1],
    [0.7, 'height', height],
  ])
}
