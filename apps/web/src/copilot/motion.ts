import { createActionFrames, frameAt, cssEase } from './intro-motion'
import type { View } from './types'

type Spring = { p: number; v: number; t: number; k: number; d: number }
/** Same 60-Hz semi-implicit spring step as the supplied apple-bounce reference. */
export function animateDock(
  root: HTMLDivElement,
  view: View,
  frame: { current: { w: number; h: number; y: number; scale: number; alpha: number } },
) {
  const raf = { current: 0 }

  const outer = root,
    shell = outer.querySelector<HTMLElement>('[data-dock-shell]')
  if (!shell) throw new Error('Missing Copilot shell')
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
  const sizing = () => {
    const w = Math.min(372, innerWidth - 32)
    const h = Math.min(view === 'settings' ? 330 : 364, innerHeight - 90)
    shell.style.setProperty('--full-width', `${w}px`)
    shell.style.setProperty('--full-height', `${h}px`)
    return {
      w: view === 'panel' || view === 'settings' ? w : view === 'dot' ? 44 : 204,
      h: view === 'panel' || view === 'settings' ? h : view === 'dot' ? 44 : 34,
    }
  }
  let target = sizing()
  const draw = (w: number, h: number, y: number, scale: number, alpha: number) => {
    frame.current = { w, h, y, scale, alpha }
    shell.style.width = `${Math.max(12, w)}px`
    shell.style.height = `${Math.max(12, h)}px`
    shell.style.transform = `translateY(${y}px) scale(${scale})`
    shell.style.setProperty('--surface-opacity', String(Math.min(1, Math.max(0, alpha))))
  }
  let canceled = false
  const onResize = () => {
    target = sizing()
    if (view === 'settings' || view === 'panel') draw(target.w, target.h, 0, 1, 1)
  }
  window.addEventListener('resize', onResize)
  if (view === 'intro' && !reduced) {
    const frames = createActionFrames(204, 34),
      start = performance.now()
    const run = (now: number) => {
      if (canceled) return
      const t = Math.min(3.4, (now - start) / 1000),
        s = frameAt(frames, t)
      draw(s.width!, s.height!, s.y!, s.scale!, Math.min(1, t * 9))
      shell.style.setProperty('--copy-opacity', String(cssEase((t - 0.6) / 0.38, 'in-out')))
      shell.style.setProperty('--copy-scale', String(s.textScale))
      shell.style.setProperty('--signal-x', `${s.iconX}px`)
      shell.style.setProperty('--signal-scale', String(s.iconScale))
      const blob = outer.querySelector<HTMLElement>('.sa-intro-blob')
      if (blob) {
        blob.style.opacity = t > 0 && t < 0.52 ? '1' : '0'
        blob.style.width = `${s.introWidth}px`
        blob.style.height = `${s.introHeight}px`
        blob.style.transform = `translateX(${s.introX! + 28}px) scale(${s.introScale})`
      }
      if (t < 3.4) raf.current = requestAnimationFrame(run)
    }
    raf.current = requestAnimationFrame(run)
  } else {
    shell.style.setProperty('--copy-opacity', '1')
    shell.style.setProperty('--copy-scale', '1')
    shell.style.setProperty('--signal-x', '0px')
    shell.style.setProperty('--signal-scale', '1')
    const blob = outer.querySelector<HTMLElement>('.sa-intro-blob')
    if (blob) blob.style.opacity = '0'
    const f = frame.current
    const opening = view === 'panel' || view === 'settings'
    const values: Record<'w' | 'h' | 'y' | 'scale' | 'alpha', Spring> = {
      w: { p: f.w, v: 0, t: target.w, k: 200, d: 20 },
      h: { p: f.h, v: 0, t: target.h, k: 270, d: 25 },
      y: { p: opening ? 14 : f.y, v: opening ? -85 : 0, t: 0, k: 240, d: 18 },
      scale: { p: f.scale, v: 0, t: 1, k: 160, d: 20 },
      alpha: { p: f.alpha, v: 0, t: view === 'dot' ? 0 : 1, k: 240, d: 26 },
    }
    const start = performance.now()
    let previous = start,
      accumulator = 0
    const run = (now: number) => {
      if (canceled) return
      values.w.t = target.w
      values.h.t = (view === 'panel' || view === 'settings') && now - start < 65 ? f.h : target.h
      accumulator += Math.min((now - previous) / 1000, 0.08)
      previous = now
      while (accumulator >= 1 / 60) {
        for (const s of Object.values(values)) {
          s.v += (-s.k * (s.p - s.t) - s.d * s.v) / 60
          s.p += s.v / 60
        }
        accumulator -= 1 / 60
      }
      const settled = Object.values(values).every(
        (s) => Math.abs(s.p - s.t) < 0.03 && Math.abs(s.v) < 0.1,
      )
      if (reduced || settled || now - start > 1400) {
        draw(target.w, target.h, 0, 1, view === 'dot' ? 0 : 1)
        return
      }
      draw(values.w.p, values.h.p, values.y.p, values.scale.p, values.alpha.p)
      raf.current = requestAnimationFrame(run)
    }
    if (reduced) draw(target.w, target.h, 0, 1, view === 'dot' ? 0 : 1)
    else raf.current = requestAnimationFrame(run)
  }
  return () => {
    canceled = true
    cancelAnimationFrame(raf.current)
    window.removeEventListener('resize', onResize)
  }
}
