<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { Setting, Close, Back, Refresh, TopRight } from '@element-plus/icons-vue'
import { Agent } from './agent'
import { callResponses } from './responses'
import type { AgentState, Snapshot } from './types'
import { animateDock } from './motion'
import KyantSurface from './KyantSurface.vue'
import './assistant.css'
const props = defineProps<{
  root: HTMLElement
  depositionId: number
  readSnapshot: (focus: string | null) => Snapshot
}>()
const state = shallowRef<AgentState>(),
  dock = ref<HTMLDivElement>(),
  connection = ref(''),
  testing = ref(false)
let agent: Agent,
  unsubscribe: () => void,
  stopMotion: (() => void) | undefined,
  testRequest: AbortController | undefined
const frame = { current: { w: 44, h: 44, y: 0, scale: 1, alpha: 0 } }
onMounted(() => {
  agent = new Agent(props.root, props.depositionId, props.readSnapshot)
  state.value = agent.getSnapshot()
  unsubscribe = agent.subscribe(() => {
    state.value = agent.getSnapshot()
  })
  agent.start()
})
watch(
  () => state.value?.view,
  (view) => {
    if (view === undefined) return
    if (!dock.value) throw new Error('Missing StepAlong dock')
    stopMotion?.()
    stopMotion = animateDock(dock.value, view, frame)
    if (view !== 'settings') {
      testRequest?.abort()
      testing.value = false
    }
  },
  { flush: 'post' },
)
onBeforeUnmount(() => {
  testRequest?.abort()
  stopMotion?.()
  unsubscribe()
  agent.dispose()
})
const title = computed(() => {
  const s = state.value
  if (!s) return ''
  if (s.phase === 'loading') return 'Taking a look…'
  if (s.phase === 'error') return 'Connection problem'
  return s.result === null ? 'What needs attention?' : s.result.title
})
function locate() {
  const id = state.value?.result?.targetId
  if (id === null || id === undefined) return
  const target = document.getElementById(id)
  if (!target || !props.root.contains(target))
    throw new Error('Copilot target is no longer on this page')
  target.scrollIntoView({
    block: 'center',
    behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
  })
  target.classList.add('sa-highlight')
  setTimeout(() => target.classList.remove('sa-highlight'), 2400)
  const control = target.matches('input,select,textarea,button')
    ? target
    : target.querySelector<HTMLElement>('input,select,textarea,button')
  control?.focus({ preventScroll: true })
}
async function test() {
  testRequest?.abort()
  const controller = new AbortController()
  testRequest = controller
  testing.value = true
  connection.value = ''
  try {
    const advice = await callResponses(
      props.depositionId,
      props.readSnapshot(null),
      'test',
      AbortSignal.any([controller.signal, AbortSignal.timeout(65000)]),
    )
    connection.value = advice.message
  } catch (error) {
    if (!controller.signal.aborted)
      connection.value = error instanceof Error ? error.message : String(error)
  } finally {
    if (testRequest === controller) testing.value = false
  }
}
</script>
<template>
  <Teleport to="body">
    <div
      ref="dock"
      class="sa-position"
      data-assistant
      :data-view="state?.view"
      :data-phase="state?.phase"
    >
      <KyantSurface
        v-if="state"
        as="div"
        class="sa-shell"
        :radius="state.view === 'panel' || state.view === 'settings' ? 32 : 18"
        :clip="true"
        data-dock-shell
      >
        <div class="sa-intro-blob" aria-hidden="true" />
        <button
          v-if="state.view !== 'panel' && state.view !== 'settings'"
          class="sa-launcher"
          aria-label="Open StepAlong"
          @click="agent.open()"
        >
          <span v-if="state.view !== 'dot'" class="sa-launcher-copy">{{
            state.view === 'intro' ? 'Copilot is on' : 'Need a hand here?'
          }}</span
          ><span
            class="sa-signal"
            :class="{ working: state.phase === 'loading' }"
            aria-hidden="true"
          />
        </button>
        <section
          v-else-if="state.view === 'settings'"
          class="sa-settings"
          aria-label="StepAlong connection"
        >
          <header class="sa-head">
            <span class="sa-title">Connection</span
            ><button class="sa-icon" aria-label="Back to assistant" @click="agent.open()">
              <Back /></button
            ><button class="sa-icon" aria-label="Close settings" @click="agent.close()">
              <Close />
            </button>
          </header>
          <div class="sa-answer">
            <h3>Model connection</h3>
            <p>Configured in the OneDep server.</p>
            <p v-if="connection" role="status">{{ connection }}</p>
          </div>
          <div class="sa-settings-actions">
            <KyantSurface
              as="button"
              :radius="12"
              :clip="false"
              class="sa-button primary"
              :disabled="testing"
              @click="test"
              >{{ testing ? 'Connecting…' : 'Test connection' }}</KyantSurface
            >
          </div>
        </section>
        <section v-else class="sa-panel" role="dialog" aria-label="StepAlong assistant">
          <header class="sa-head sa-toolbar">
            <button class="sa-icon" aria-label="Settings" @click="agent.openSettings()">
              <Setting /></button
            ><button class="sa-icon" aria-label="Close assistant" @click="agent.close()">
              <Close />
            </button>
          </header>
          <div class="sa-answer" aria-live="polite" :aria-busy="state.phase === 'loading'">
            <h3>{{ title }}</h3>
            <div
              v-if="state.phase === 'loading'"
              class="sa-skeleton"
              aria-label="Waiting for response"
            >
              <i /><i /><i />
            </div>
            <p v-else-if="state.phase === 'error'" class="sa-error">{{ state.error }}</p>
            <template v-else
              ><p>
                {{
                  state.result === null
                    ? 'Generate a suggestion for this page.'
                    : state.result.message
                }}
              </p>
              <button v-if="state.result?.targetId" class="sa-locate" @click="locate">
                Show me <TopRight /></button
            ></template>
          </div>
          <div class="sa-actions">
            <button
              class="sa-icon sa-regenerate"
              :disabled="state.phase === 'loading'"
              aria-label="Regenerate suggestion"
              @click="agent.select('next')"
            >
              <Refresh />
            </button>
          </div>
        </section>
      </KyantSurface>
    </div>
  </Teleport>
</template>
