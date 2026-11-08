import type { AgentState, Mode, Snapshot } from './types'
import { callResponses } from './responses'
import { fingerprint } from './responses'

/** Prefetch after two seconds; hint only after a current LLM reply and five idle seconds. */
export class Agent {
  constructor(
    private readonly root: HTMLElement,
    private readonly depositionId: number,
    private readonly readSnapshot: (focus: string | null) => Snapshot,
  ) {}
  private state: AgentState = {
    view: 'intro',
    phase: 'idle',
    result: null,
    error: '',
    idle: 0,
    discarded: 0,
    mode: 'next',
    source: 'llm',
    requestMs: null,
  }
  private listeners = new Set<() => void>()
  private lastActivity = performance.now()
  private focusId: string | null = null
  private lastPointer = { x: -1, y: -1 }
  private toward: { time: number; distance: number; x: number; y: number } | null = null
  private generation = 0
  private inFlight: {
    controller: AbortController
    generation: number
    fingerprint: string
    mode: Mode
    scrollY: number
  } | null = null
  private snapshotKey = ''
  private attemptedKey = ''
  private cacheKey = ''
  private resultScrollY = 0
  private cacheResult: AgentState['result'] = null
  private timer: ReturnType<typeof setInterval> | null = null
  private observer: MutationObserver | null = null
  private disposed = false
  private cleanup: (() => void)[] = []
  private introEnd: ReturnType<typeof setTimeout> | null = null
  private pageDebounce: ReturnType<typeof setTimeout> | null = null
  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
  getSnapshot = () => this.state
  private patch(patch: Partial<AgentState>) {
    this.state = { ...this.state, ...patch }
    this.listeners.forEach((l) => l())
  }
  start() {
    this.disposed = false
    this.lastActivity = performance.now()
    const root = this.root
    this.snapshotKey = fingerprint(this.readSnapshot(null))
    const listen = (
      type: string,
      fn: EventListener,
      options: AddEventListenerOptions = { passive: true, capture: true },
    ) => {
      document.addEventListener(type, fn, options)
      this.cleanup.push(() => document.removeEventListener(type, fn, options))
    }
    listen('pointermove', ((e: PointerEvent) => this.pointer(e)) as EventListener)
    for (const type of ['pointerdown', 'keydown', 'input', 'change', 'wheel', 'touchmove'])
      listen(type, ((e: Event) => {
        if (this.isAssistant(e.target)) return
        this.activity()
        if (type === 'input' || type === 'change') this.pageChanged()
      }) as EventListener)
    listen('focusin', ((e: Event) => {
      const el = e.target as HTMLElement
      if (el?.closest('#deposition-content') && el.matches('input,select,textarea')) {
        const target = el.closest<HTMLElement>('[data-stepalong-question]')
        this.focusId = target === null ? el.id : target.id
        if (this.state.mode === 'explain') {
          this.invalidate()
          if (this.state.view === 'panel') this.request('explain', true)
        }
      }
    }) as EventListener)
    listen('scroll', ((e: Event) => {
      if (this.isAssistant(e.target)) return
      this.activity()
      if (
        Math.abs(scrollY - (this.inFlight ? this.inFlight.scrollY : this.resultScrollY)) >
        innerHeight * 0.5
      )
        this.invalidate()
    }) as EventListener)
    listen('visibilitychange', (() => {
      if (document.hidden) {
        this.cancelRequest()
        this.attemptedKey = ''
        return
      }
      this.lastActivity = performance.now()
      if (this.state.view === 'hint') this.patch({ view: 'dot' })
    }) as EventListener)
    listen(
      'keydown',
      ((e: KeyboardEvent) => {
        if (e.key === 'Escape' && ['panel', 'settings'].includes(this.state.view)) {
          e.preventDefault()
          this.close()
        }
      }) as EventListener,
      { capture: false },
    )
    this.observer = new MutationObserver(() => this.pageChanged())
    this.observer.observe(root, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: [
        'data-page',
        'aria-invalid',
        'aria-busy',
        'disabled',
        'required',
        'checked',
        'data-revision',
      ],
    })
    this.introEnd = setTimeout(() => {
      if (this.state.view === 'intro') this.patch({ view: 'dot' })
    }, 2700)
    this.timer = setInterval(() => this.tick(), 50)
  }
  private isAssistant(target: EventTarget | null) {
    return target instanceof Element && !!target.closest('[data-assistant], [data-open-settings]')
  }
  private activity() {
    this.lastActivity = performance.now()
    if (this.state.view === 'hint') this.patch({ view: 'dot', idle: 0 })
  }
  private pointer(e: PointerEvent) {
    if (e.pointerType && e.pointerType !== 'mouse') return
    const p = this.lastPointer
    if (p.x >= 0 && Math.hypot(e.clientX - p.x, e.clientY - p.y) < 4) return
    this.lastPointer = { x: e.clientX, y: e.clientY }
    if (this.state.view === 'hint') {
      const r = document.querySelector('[data-dock-shell]')?.getBoundingClientRect()
      if (r) {
        const x = r.right - r.width / 2,
          y = r.bottom - r.height / 2,
          now = performance.now()
        const distance = Math.hypot(e.clientX - x, e.clientY - y)
        const previousDistance = p.x >= 0 ? Math.hypot(p.x - x, p.y - y) : distance
        if (this.isAssistant(e.target)) {
          this.open()
          return
        }
        if (distance < previousDistance - 1) {
          if (!this.toward || now - this.toward.time > 600)
            this.toward = { time: now, distance: previousDistance, x: p.x, y: p.y }
          const anchor = this.toward
          if (
            anchor.distance - distance >= anchor.distance * 0.2 &&
            Math.hypot(e.clientX - anchor.x, e.clientY - anchor.y) >= 48
          )
            this.open()
          return
        }
        // Small sideways movement should not destroy an intentional approach.
        if (distance <= previousDistance + 4) return
      }
      this.toward = null
    }
    if (!this.isAssistant(e.target)) this.activity()
  }
  private tick() {
    if (this.disposed || document.hidden) return
    const idle = performance.now() - this.lastActivity
    if (
      Math.floor(Math.min(idle, 5000) / 100) !== Math.floor(this.state.idle / 100) &&
      !['panel', 'settings'].includes(this.state.view)
    )
      this.patch({ idle: Math.min(idle, 5000) })
    if (['panel', 'settings'].includes(this.state.view)) return
    if (
      idle >= 5000 &&
      this.state.phase === 'ready' &&
      this.cacheResult &&
      this.cacheKey === fingerprint(this.readSnapshot(this.focusId)) &&
      this.state.view !== 'hint'
    ) {
      this.toward = null
      this.patch({ view: 'hint', idle: 5000 })
    }
    if (idle >= 2000) {
      const s = this.readSnapshot(this.focusId),
        key = fingerprint(s)
      if (!s.busy && key !== this.attemptedKey && !this.inFlight) this.request('next', false, s)
    }
  }
  private cancelRequest() {
    if (this.inFlight) {
      this.inFlight.controller.abort()
      this.inFlight = null
    }
    this.generation++
    if (this.state.phase === 'loading') this.patch({ phase: 'idle' })
  }
  private invalidate() {
    this.cancelRequest()
    this.attemptedKey = ''
    this.cacheKey = ''
    this.cacheResult = null
    this.patch({
      result: null,
      error: '',
      phase: 'idle',
      requestMs: null,
      ...(this.state.view === 'hint' ? { view: 'dot' as const } : {}),
    })
  }
  private pageChanged() {
    if (this.disposed) return
    const key = fingerprint(this.readSnapshot(this.focusId))
    if (key === this.snapshotKey) return
    this.snapshotKey = key
    this.lastActivity = performance.now()
    this.invalidate()
    if (this.pageDebounce) clearTimeout(this.pageDebounce)
    if (this.state.view === 'panel')
      this.pageDebounce = setTimeout(() => {
        if (this.state.view === 'panel' && !this.readSnapshot(this.focusId).busy)
          this.request(this.state.mode, true)
      }, 450)
  }
  open() {
    this.patch({ view: 'panel' })
    if (this.cacheResult && this.cacheKey === fingerprint(this.readSnapshot(this.focusId))) {
      this.patch({ result: this.cacheResult, phase: 'ready' })
      return
    }
    if (!this.inFlight) this.request('next', true)
  }
  openSettings = () => {
    this.cancelRequest()
    this.patch({ view: 'settings' })
  }
  close = () => {
    this.lastActivity = performance.now()
    this.patch({ view: 'dot', idle: 0 })
  }
  select = (mode: Mode) => {
    this.patch({ view: 'panel', mode })
    this.request(mode, true)
  }
  async request(mode: Mode, manual: boolean, snapshot = this.readSnapshot(this.focusId)) {
    const key = fingerprint(snapshot)
    if (!manual && this.inFlight) return
    this.cancelRequest()
    const generation = ++this.generation
    const controller = new AbortController()
    const start = performance.now()
    this.inFlight = { controller, generation, fingerprint: key, mode, scrollY }
    this.attemptedKey = key
    this.patch({ phase: 'loading', result: null, error: '', mode, requestMs: null })
    let timedOut = false
    const timeout = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, 60000)
    try {
      const answer = await callResponses(this.depositionId, snapshot, mode, controller.signal)
      if (this.disposed) return
      if (
        generation !== this.generation ||
        controller.signal.aborted ||
        key !== fingerprint(this.readSnapshot(this.focusId))
      ) {
        this.patch({ discarded: this.state.discarded + 1 })
        return
      }
      this.cacheResult = answer
      this.cacheKey = key
      this.resultScrollY = scrollY
      this.patch({ result: answer, phase: 'ready', requestMs: performance.now() - start })
    } catch (error) {
      if (this.disposed || generation !== this.generation) return
      if (controller.signal.aborted && !timedOut) return
      this.patch({
        phase: 'error',
        result: null,
        error: timedOut
          ? 'Request timed out. Try again.'
          : error instanceof Error
            ? error.message
            : String(error),
      })
    } finally {
      clearTimeout(timeout)
      if (this.inFlight?.generation === generation) this.inFlight = null
    }
  }
  dispose() {
    this.disposed = true
    if (this.timer) clearInterval(this.timer)
    if (this.introEnd) clearTimeout(this.introEnd)
    if (this.pageDebounce) clearTimeout(this.pageDebounce)
    this.observer?.disconnect()
    this.cleanup.forEach((f) => f())
    this.cancelRequest()
    this.listeners.clear()
  }
}
