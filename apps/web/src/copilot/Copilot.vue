<script setup lang="ts">
import { t } from '@/locales'
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { Setting, Close, Back, Refresh, TopRight } from '@element-plus/icons-vue'
import { Agent } from './agent'
import { copilotConfigSchema, type CopilotConfig, type Suggestion } from '@onedep/shared/copilot'
import { httpError } from '@/data/http-error'
import { callResponses } from './responses'
import type { AgentState, Snapshot } from './types'
import { animateDock } from './motion'
import KyantSurface from './KyantSurface.vue'
import './assistant.css'
defineOptions({ name: 'OneDepCopilot' })
const props = defineProps<{
  root: HTMLElement
  depositionId: number
  readSnapshot: (focus: string | null) => Snapshot
  applySuggestion: (suggestion: Suggestion) => void
}>()
const state = shallowRef<AgentState>(),
  dock = ref<HTMLDivElement>(),
  connection = ref(''),
  testing = ref(false)
let config: CopilotConfig
let disposed = false
let agent: Agent | undefined,
  unsubscribe: (() => void) | undefined,
  stopMotion: (() => void) | undefined,
  testRequest: AbortController | undefined
const frame = { current: { w: 44, h: 44, y: 0, scale: 1, alpha: 0 } }
onMounted(async () => {
  const response = await fetch(`/api/depositions/${props.depositionId}/copilot/config`)
  if (disposed) return
  if (!response.ok) throw await httpError(response)
  config = copilotConfigSchema.parse(await response.json())
  if (disposed) return
  agent = new Agent(props.root, props.depositionId, props.readSnapshot, config)
  state.value = agent.getSnapshot()
  unsubscribe = agent.subscribe(() => {
    state.value = agent!.getSnapshot()
  })
  agent.start()
})
watch(
  () => state.value?.view,
  (view) => {
    if (view === undefined) return
    if (!dock.value) throw new Error('Missing Copilot dock')
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
  disposed = true
  testRequest?.abort()
  stopMotion?.()
  unsubscribe?.()
  agent?.dispose()
})
const title = computed(() => {
  const s = state.value
  if (!s) return ''
  if (s.phase === 'loading') return t('Taking a look…')
  if (s.phase === 'error') return t('Request paused')
  return s.result === null ? t('What needs attention?') : s.result.title
})
function suggestionLabel(suggestion: Suggestion) {
  const field = props.readSnapshot(null).fields.find((f) => f.targetId === suggestion.targetId)!
  return field.choices.length
    ? field.choices.find((c) => c.value === suggestion.value)!.label
    : suggestion.value
}
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
      AbortSignal.any([controller.signal, AbortSignal.timeout(config.timeoutMs)]),
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
          :aria-label="t('Open Copilot')"
          @click="agent!.open()"
        >
          <span v-if="state.view !== 'dot'" class="sa-launcher-copy">{{
            state.view === 'intro' ? t('Copilot is on') : t('Need a hand here?')
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
          :aria-label="t('Copilot connection')"
        >
          <header class="sa-head">
            <span class="sa-title">{{ t('Connection') }}</span
            ><button class="sa-icon" :aria-label="t('Back to assistant')" @click="agent!.open()">
              <Back /></button
            ><button class="sa-icon" :aria-label="t('Close settings')" @click="agent!.close()">
              <Close />
            </button>
          </header>
          <div class="sa-answer">
            <h3>{{ t('Model connection') }}</h3>
            <p>{{ t('Configured in the OneDep server.') }}</p>
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
              >{{ testing ? t('Connecting…') : t('Test connection') }}</KyantSurface
            >
          </div>
        </section>
        <section v-else class="sa-panel" role="dialog" :aria-label="t('Copilot assistant')">
          <header class="sa-head sa-toolbar">
            <button class="sa-icon" :aria-label="t('Settings')" @click="agent!.openSettings()">
              <Setting /></button
            ><button class="sa-icon" :aria-label="t('Close assistant')" @click="agent!.close()">
              <Close />
            </button>
          </header>
          <div class="sa-answer" aria-live="polite" :aria-busy="state.phase === 'loading'">
            <h3>{{ title }}</h3>
            <div
              v-if="state.phase === 'loading'"
              class="sa-skeleton"
              :aria-label="t('Waiting for response')"
            >
              <i /><i /><i />
            </div>
            <p v-else-if="state.phase === 'error'" class="sa-error">{{ state.error }}</p>
            <template v-else
              ><p>
                {{
                  state.result === null
                    ? t('Generate a suggestion for this page.')
                    : state.result.message
                }}
              </p>
              <p v-if="state.result?.question">{{ state.result.question }}</p>
              <article
                v-for="suggestion in state.result?.suggestions"
                :key="suggestion.targetId"
                class="sa-suggestion"
              >
                <p>
                  {{
                    props.readSnapshot(null).fields.find((f) => f.targetId === suggestion.targetId)
                      ?.label
                  }}: {{ suggestionLabel(suggestion) }}
                </p>
                <p>{{ suggestion.reason }}</p>
                <details>
                  <summary>{{ t('Sources') }}</summary>
                  <p v-for="id in suggestion.evidenceIds" :key="id">
                    {{ props.readSnapshot(null).evidence.find((e) => e.id === id)?.source }}:
                    {{ props.readSnapshot(null).evidence.find((e) => e.id === id)?.text }}
                  </p>
                </details>
                <button
                  class="sa-button primary"
                  @click="agent!.apply(suggestion, props.applySuggestion)"
                >
                  {{ t('Use this value') }}
                </button>
              </article>
              <button v-if="state.result?.targetId" class="sa-locate" @click="locate">
                {{ t('Show me') }}<TopRight /></button
            ></template>
          </div>
          <div class="sa-actions">
            <button
              class="sa-icon sa-regenerate"
              :disabled="state.phase === 'loading'"
              :aria-label="t('Regenerate suggestion')"
              @click="agent!.select('next')"
            >
              <Refresh />
            </button>
          </div>
        </section>
      </KyantSurface>
    </div>
  </Teleport>
</template>
