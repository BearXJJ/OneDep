<script setup lang="ts">
import { t, locale } from '@/locales'
import { localizeSurvey } from '@/locales/survey'
import LanguageSwitch from './LanguageSwitch.vue'
import CommunicationPanel from './CommunicationPanel.vue'
import Copilot from '@/copilot/Copilot.vue'
import type { Snapshot, Suggestion } from '@onedep/shared/copilot'
import { computed, h, render, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { useRouter } from 'vue-router'
import { SurveyComponent } from 'survey-vue3-ui'
import { QuestionPanelDynamicModel, type Question as SurveyQuestion } from 'survey-core'
import { ArrowRight, Back, Download, Refresh, Delete, InfoFilled } from '@element-plus/icons-vue'
import 'survey-core/survey-core.css'
import type { DepositionDetail, DepositionFileKind } from '@onedep/shared'
import {
  createQuestionnaire,
  flattenAnswers,
  addressKey,
  getProfileDefinition,
  getNavigation,
  type Answers,
  type AnswerRecord,
  type Element,
} from '@onedep/shared/deposition'
import {
  checkDeposition,
  depositionFileUrl,
  getDeposition,
  reparseDeposition,
  removeDepositionFile,
  saveDeposition,
  submitDeposition,
  uploadDepositionFile,
} from '@/data/depositions'
import {
  depositionNavigation,
  type DepositionNavItem,
  type PageProgress,
} from '@/data/deposition-navigation'
import DepositionNavigation from './DepositionNavigation.vue'
import { useAuthStore } from '@/stores/auth'
const props = defineProps<{ deposition: DepositionDetail }>()
const emit = defineEmits<{ changed: [value: DepositionDetail]; back: [] }>()
const router = useRouter(),
  auth = useAuthStore()
const content = ref<HTMLElement>()
const renderedQuestions = new Map<string, { question: SurveyQuestion; element: HTMLElement }>()
const current = ref(props.deposition),
  tab = ref('summary'),
  selection = ref('summary'),
  busy = ref(false),
  notice = ref(''),
  dirty = ref(false),
  version = ref(0)
const definition = computed(() => getProfileDefinition(current.value.profile))
const model = shallowRef(createQuestionnaire(current.value.profile, current.value.answers))
const editable = computed(() => current.value.status === 'DRAFT')
const metadata = computed(() => {
  const map = new Map<string, Element>()
  function walk(elements: Element[]) {
    for (const e of elements) {
      map.set(e.name, e)
      if (e.type === 'panel') walk(e.elements)
      else if (e.type === 'paneldynamic') walk(e.templateElements)
    }
  }
  walk(definition.value.pages.flatMap((p) => p.elements))
  return map
})
function hasDemo(element: Element): boolean {
  if (element.type === 'panel') return element.elements.some(hasDemo)
  if (element.type === 'paneldynamic') return element.templateElements.some(hasDemo)
  return element.x.demo === true
}
function configure() {
  renderedQuestions.clear()
  const survey = model.value
  localizeSurvey(survey, current.value.profile)
  survey.questionTitleLocation = 'left'
  survey.textUpdateMode = 'onTyping'
  survey.applyTheme({
    isPanelless: true,
    cssVariables: {
      '--sjs-font-family': 'Arial, sans-serif',
      '--sjs-font-size': '14px',
      '--sjs-base-unit': '4px',
      '--sjs-general-backcolor': 'var(--dep-panel)',
      '--sjs-general-backcolor-dim': 'var(--dep-panel)',
      '--sjs-primary-backcolor': 'var(--dep-success)',
      '--sjs-corner-radius': '3px',
      '--sjs-shadow-small': 'none',
      '--sjs-shadow-inner': 'none',
    },
  })
  survey.showNavigationButtons = false
  survey.mode = editable.value ? 'edit' : 'display'
  const changed = () => {
    dirty.value = true
    version.value++
  }
  survey.onValueChanged.add(changed)
  survey.onDynamicPanelRemoved.add(changed)
  survey.onDynamicPanelAdded.add(changed)
  survey.onAfterRenderQuestion.add((_, event) => {
    event.htmlElement.dataset.copilotQuestion = event.question.name
    renderedQuestions.set(event.htmlElement.id, {
      question: event.question,
      element: event.htmlElement,
    })
    const meta = metadata.value.get(event.question.name)
    if (meta && !hasDemo(meta)) event.htmlElement.classList.add('outside-demo-field')
    const header = event.htmlElement.querySelector('.sd-question__header')
    if (header && event.question.description) {
      const hint = document.createElement('span')
      hint.className = 'field-help'
      hint.title = event.question.description
      hint.setAttribute('aria-label', event.question.description)
      render(h(InfoFilled), hint)
      header.append(hint)
    }
  })
  const molecules = survey.getQuestionByName('molecules') as QuestionPanelDynamicModel
  molecules.renderMode = 'tab'
  molecules.templateTitle = '{panel.name}'
}
configure()
watch(locale, () => {
  model.value.locale = locale.value === 'zh' ? 'zh-cn' : 'en'
  version.value++
})
function accept(value: DepositionDetail) {
  current.value = value
  model.value.dispose()
  model.value = createQuestionnaire(value.profile, value.answers)
  configure()
  dirty.value = false
  version.value++
  const p = model.value.getPageByName(tab.value)
  if (p) model.value.currentPage = p
  emit('changed', value)
}
watch(
  () => props.deposition,
  (value) => {
    if (value !== current.value) accept(value)
  },
)
onBeforeUnmount(() => model.value.dispose())
function select(name: string, recordId?: string) {
  tab.value = name
  selection.value = recordId === undefined ? name : 'macromolecules:' + recordId
  const page = model.value.getPageByName(name)
  if (page) model.value.currentPage = page
  if (recordId !== undefined) {
    const q = model.value.getQuestionByName('molecules') as QuestionPanelDynamicModel
    const rows = q.value as AnswerRecord[]
    q.currentIndex = rows.findIndex((r) => r.recordId === recordId)
  }
}
function selectItem(item: DepositionNavItem) {
  select(item.page, item.recordId)
}
async function saved() {
  if (dirty.value)
    accept(
      await saveDeposition(current.value.id, current.value.revision, model.value.data as Answers),
    )
}
async function action(work: () => Promise<void>) {
  if (busy.value) return
  busy.value = true
  notice.value = ''
  try {
    await work()
  } finally {
    busy.value = false
  }
}
const save = () =>
  action(async () => {
    await saved()
    notice.value = 'Draft saved'
  })
const check = () =>
  action(async () => {
    await saved()
    accept(await checkDeposition(current.value.id, current.value.revision))
    select('view')
    notice.value = 'Validation completed'
  })
const submit = () =>
  action(async () => {
    await saved()
    accept(await submitDeposition(current.value.id, current.value.revision))
    select('depsummary')
    notice.value = '本地提交完成'
  })
const leave = () =>
  action(async () => {
    await saved()
    emit('back')
  })
const logout = () =>
  action(async () => {
    await saved()
    await auth.logout()
    await router.push('/login')
  })
function upload(role: string, slot: number, event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  return action(async () => {
    await saved()
    accept(
      await uploadDepositionFile(
        current.value.id,
        role as DepositionFileKind,
        slot,
        current.value.revision,
        file,
      ),
    )
    notice.value = 'File uploaded and parsed'
    input.value = ''
  })
}
const reparse = (id: number) =>
  action(async () => {
    await saved()
    accept(await reparseDeposition(current.value.id, id, current.value.revision))
    notice.value = 'File parsed'
  })
const remove = (id: number) =>
  action(async () => {
    await saved()
    await removeDepositionFile(current.value.id, id, current.value.revision)
    accept(await getDeposition(current.value.id))
  })
const fileOf = (role: string, slot: number) =>
  current.value.files.find((f) => f.kind === role && f.slot === slot)
const checksReady = computed(
  () =>
    !dirty.value &&
    definition.value.checks
      .filter((c) => c.requiredFor.includes('submit'))
      .every((rule) => {
        const c = current.value.checks.find((c) => c.checkId === rule.id)
        return (
          c?.inputRevision === current.value.revision &&
          c.state === 'succeeded' &&
          !c.issues.some((i) => i.severity === 'error')
        )
      }),
)
interface MissingItem {
  page: string
  title: string
  question?: SurveyQuestion
}
const statistics = computed(() => {
  void version.value
  const records: Record<string, PageProgress> = {}
  const pages: Record<string, PageProgress> = {},
    missing: MissingItem[] = []
  for (const p of model.value.pages) {
    const stats: PageProgress = {
      total: 0,
      completed: 0,
      required: 0,
      requiredCompleted: 0,
      extra: !definition.value.pages.find((page) => page.name === p.name)!.elements.some(hasDemo),
    }
    function count(q: SurveyQuestion, stats: PageProgress) {
      if (!q.isVisible || !q.isParentVisible || q.name === 'recordId') return
      if (q instanceof QuestionPanelDynamicModel) {
        if (q.panels.length)
          q.panels.forEach((panel) => {
            const recordStats: PageProgress = {
              total: 0,
              completed: 0,
              required: 0,
              requiredCompleted: 0,
              extra: true,
            }
            panel.questions.forEach((question) => count(question, recordStats))
            const recordId = panel.getQuestionByName('recordId').value
            records[q.name + ':' + recordId] = recordStats
            stats.total += recordStats.total
            stats.completed += recordStats.completed
            stats.required += recordStats.required
            stats.requiredCompleted += recordStats.requiredCompleted
            if (!recordStats.extra) stats.extra = false
          })
        else {
          stats.total++
          if (q.isRequired || q.template.questions.some((c) => c.isRequired)) {
            stats.required++
            missing.push({ page: p.name, title: q.title, question: q })
          }
        }
        return
      }
      const meta = metadata.value.get(q.name)
      if (meta && meta.type !== 'panel' && meta.type !== 'paneldynamic' && meta.x.demo)
        stats.extra = false
      stats.total++
      if (!q.isEmpty()) stats.completed++
      if (q.isRequired) {
        stats.required++
        if (!q.isEmpty()) stats.requiredCompleted++
        else missing.push({ page: p.name, title: q.title, question: q })
      }
    }
    p.questions.forEach((q) => count(q, stats))
    pages[p.name] = stats
  }
  const files = definition.value.files.reduce((n, r) => n + r.min, 0),
    uploaded = current.value.files.filter((f) => f.parseState === 'succeeded').length
  pages.uploads = {
    total: files,
    completed: uploaded,
    required: files,
    requiredCompleted: uploaded,
    extra: false,
  }
  pages.summary = pages.uploads
  for (const rule of definition.value.files)
    for (let slot = 1; slot <= rule.min; slot++)
      if (!fileOf(rule.role, slot))
        missing.unshift({
          page: 'uploads',
          title: t(rule.title) + (rule.max > 1 ? ' ' + slot : ''),
        })
  const unique = Object.entries(pages)
    .filter(([name]) => !['summary', 'message', 'ligandsummary'].includes(name))
    .map(([, s]) => s)
  const total = unique.reduce((n, s) => n + s.total, 0),
    complete = unique.reduce((n, s) => n + s.completed, 0),
    required = unique.reduce((n, s) => n + s.required, 0),
    requiredComplete = unique.reduce((n, s) => n + s.requiredCompleted, 0)
  return {
    pages,
    records,
    missing,
    total,
    complete,
    required,
    requiredComplete,
    allPercent: total === 0 ? 0 : Math.round((complete / total) * 100),
    mandatoryPercent: required === 0 ? 0 : Math.round((requiredComplete / required) * 100),
  }
})
const navigation = computed(() => {
  void version.value
  return depositionNavigation(
    getNavigation(current.value.profile),
    model.value.data as Answers,
    statistics.value.pages,
    statistics.value.records,
  )
})
const navPages = computed(() => {
  const result: DepositionNavItem[] = []
  function walk(nodes: DepositionNavItem[]) {
    for (const n of nodes) {
      if (n.children) walk(n.children)
      else result.push(n)
    }
  }
  walk(navigation.value)
  return result
})
const pageTitle = computed(() => {
  if (tab.value === 'requirements') return t('List requirements')
  if (tab.value === 'origins') return t('Field sources')
  const n = navPages.value.find(
    (n) => n.id === selection.value || (selection.value === tab.value && n.page === tab.value),
  )
  if (!n) throw new Error('Unknown navigation page: ' + tab.value)
  return n.title
})
function nextPage() {
  const index = navPages.value.findIndex(
    (n) => n.id === selection.value || (selection.value === tab.value && n.page === tab.value),
  )
  const next = navPages.value[index + 1]
  if (next) selectItem(next)
}
function jump(item: MissingItem) {
  select(item.page)
  if (item.question) requestAnimationFrame(() => item.question!.focus())
}
const messages = computed(() => {
  void version.value
  const data = model.value.getValue('communication')
  return data === undefined ? [] : (data as AnswerRecord[])
})
const ligands = computed(() => {
  void version.value
  const value = model.value.getValue('molecules')
  return value === undefined
    ? []
    : (value as AnswerRecord[]).filter((r) => r.entityType === 'non-polymer')
})
function inspectLigand(record: AnswerRecord) {
  const q = model.value.getQuestionByName('ligandReview') as QuestionPanelDynamicModel
  const panel = q.addPanel()
  panel.getQuestionByName('component').value = record.name
  panel.getQuestionByName('recordId').value = crypto.randomUUID()
}
const states: Record<string, string> = {
  succeeded: 'Completed',
  failed: 'Failed',
  unavailable: '未接入',
  pending: 'Pending',
  running: 'Running',
}
function stateLabel(state: string) {
  const label = states[state]
  if (label === undefined) throw new Error('Unknown processing state: ' + state)
  return t(label)
}
function readCopilotSnapshot(focusId: string | null): Snapshot {
  const root = content.value
  if (!root) throw new Error('Missing deposition content')
  const visible = (el: HTMLElement) => {
    const rect = el.getBoundingClientRect()
    return (
      el.isConnected &&
      rect.height > 0 &&
      rect.bottom > 0 &&
      rect.top < innerHeight &&
      rect.right > 0 &&
      rect.left < innerWidth &&
      getComputedStyle(el).visibility !== 'hidden'
    )
  }
  const fields: Snapshot['fields'] = [],
    errors: Snapshot['errors'] = []
  for (const [targetId, { question: q, element }] of renderedQuestions) {
    if (!visible(element) || q.getType() === 'paneldynamic') continue
    const empty = q.isEmpty(),
      invalid = q.errors.length > 0
    fields.push({
      targetId,
      label: q.title,
      type: q.getType(),
      help: q.description,
      canSuggest: ['text', 'comment', 'dropdown', 'radiogroup'].includes(q.getType()),
      choices:
        'visibleChoices' in q
          ? (q.visibleChoices as { value: unknown; text: string }[]).map((c) => ({
              value: String(c.value),
              label: c.text,
            }))
          : [],
      required: q.isRequired,
      disabled: q.isReadOnly,
      value: empty ? '' : String(q.displayValue),
      empty,
      valid: !invalid,
      websiteInvalid: invalid,
    })
    for (const error of q.errors) errors.push({ targetId, text: error.getText() })
  }
  const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>('button'))
    .filter(visible)
    .map((button, index) => {
      if (!button.id) button.id = 'copilot-' + tab.value + '-button-' + index
      return { targetId: button.id, label: button.innerText.trim(), disabled: button.disabled }
    })
  return {
    language: locale.value,
    page: tab.value,
    title: pageTitle.value,
    fields,
    evidence: [
      ...flattenAnswers(model.value.data as Answers)
        .filter(
          ({ address, value }) =>
            !/sequence|communication/i.test(address.field) &&
            value !== null &&
            value !== '' &&
            JSON.stringify(value).length <= 1000,
        )
        .map(({ address, value }) => {
          const origin = current.value.origins.find(
            (o) => addressKey(o.address) === addressKey(address),
          )
          const saved = flattenAnswers(current.value.answers).find(
            (v) => addressKey(v.address) === addressKey(address),
          )
          const fromFile =
            origin?.source === 'file' && JSON.stringify(saved?.value) === JSON.stringify(value)
          return {
            id: 'answer:' + addressKey(address),
            source: fromFile
              ? 'File ' + origin.fileId + ' / ' + origin.tag
              : 'Current form: ' + addressKey(address),
            text: JSON.stringify(value),
          }
        }),
      ...current.value.files
        .filter((f) => f.parseState === 'succeeded')
        .map((f) => ({
          id: 'file:' + f.id,
          source: f.originalName + ' revision ' + f.revision,
          text: JSON.stringify(f.facts),
        })),
    ],
    errors,
    buttons,
    focusId,
    notices: notice.value ? [notice.value] : [],
    busy: busy.value,
    text: JSON.stringify({
      deposition: current.value.code,
      status: current.value.status,
      revision: current.value.revision,
      unsaved: dirty.value,
      summary: Array.from(root.querySelectorAll<HTMLElement>('table, .file-card, .check-card'))
        .filter(visible)
        .map((el) => el.innerText),
      files: current.value.files.map((f) => ({
        name: f.originalName,
        kind: f.kind,
        parseState: f.parseState,
      })),
      checks: current.value.checks,
    }),
  }
}
function applySuggestion(suggestion: Suggestion) {
  const target = renderedQuestions.get(suggestion.targetId)
  if (!target || !target.element.isConnected || !editable.value)
    throw new Error('Suggestion target is no longer editable')
  const q = target.question
  const field = readCopilotSnapshot(null).fields.find((f) => f.targetId === suggestion.targetId)
  if (!field || field.disabled || !field.canSuggest)
    throw new Error('Suggestion target is no longer available')
  if (field.choices.length) {
    const choice = (
      q as SurveyQuestion & { visibleChoices: { value: unknown }[] }
    ).visibleChoices.find((c) => String(c.value) === suggestion.value)
    if (!choice) throw new Error('Suggestion choice does not exist')
    q.value = choice.value
  } else if ('inputType' in q && q.inputType === 'number') {
    const value = Number(suggestion.value)
    if (!suggestion.value.trim() || !Number.isFinite(value))
      throw new Error('Suggestion must be numeric')
    q.value = value
  } else q.value = suggestion.value
}
</script>
<template>
  <article class="editor onedep-workspace">
    <header class="editor-masthead">
      <LanguageSwitch />
      <img :src="'/onedep/images/onedep_logo.png'" :alt="t('OneDep')" height="45" />
      <div class="deposition-title">
        {{ t('OneDep Deposition:') }}{{ current.code
        }}<small
          >{{ current.method }} · {{ editable ? t('Draft') : t('Submitted') }}{{ t('· v')
          }}{{ current.revision }}</small
        >
      </div>
      <button @click="leave"><Back />{{ t('Deposition list') }}</button
      ><img :src="'/onedep/images/wwpdb_logo.png'" :alt="t('wwPDB')" height="34" />
    </header>
    <div class="editor-toolbar">
      <span class="scope-key"><i />{{ t('黄色：原 demo 之外的内容') }}</span
      ><span v-if="busy">{{ t('Processing…') }}</span
      ><span v-if="notice" role="status" class="notice">{{ t(notice) }}</span>
      <button :disabled="busy || !editable" @click="save">
        {{ t('Save') }}{{ dirty ? ' *' : '' }}</button
      ><button :disabled="busy || !editable" @click="check">{{ t('Run validation') }}</button>
      <a v-if="current.submission" :href="`/api/depositions/${current.id}/export`"
        ><Download />{{ t('Download submission') }}</a
      >
    </div>
    <div class="editor-layout">
      <aside class="editor-sidebar" :aria-label="t('投递步骤')">
        <button class="requirements-button" @click="select('requirements')">
          {{ t('List requirements') }}
        </button>
        <div class="completion-bars">
          <label
            >{{ t('All items') }}<small>{{ statistics.complete }} / {{ statistics.total }}</small
            ><progress :value="statistics.allPercent" max="100" /></label
          ><label
            >{{ t('Mandatory items')
            }}<small>{{ statistics.requiredComplete }} / {{ statistics.required }}</small
            ><progress :value="statistics.mandatoryPercent" max="100"
          /></label>
        </div>
        <h2 class="section-heading">{{ t('Navigation') }}</h2>
        <DepositionNavigation :items="navigation" :current="selection" @select="selectItem" />
        <button class="logout-button" :disabled="busy" @click="logout">{{ t('Log out') }}</button>
      </aside>
      <main
        id="deposition-content"
        ref="content"
        class="editor-content"
        :data-page="tab"
        :data-revision="version"
        :aria-busy="busy"
      >
        <h1 class="section-heading">{{ pageTitle }}</h1>
        <section v-if="tab === 'welcome'" class="instructions">
          <h2>{{ t('Welcome to OneDep') }}</h2>
          <p>
            {{
              t(
                'Upload coordinates and experimental files, review extracted information, then complete each section in the navigation tree.',
              )
            }}
          </p>
          <ol>
            <li>
              <button class="text-link" @click="select('uploads')">
                {{ t('Upload / replace files') }}
              </button>
            </li>
            <li>
              <button class="text-link" @click="select('summary')">
                {{ t('Review the upload summary') }}
              </button>
            </li>
            <li>
              <button class="text-link" @click="select('contact')">
                {{ t('Complete administrative and experimental information') }}
              </button>
            </li>
            <li>
              <button class="text-link" @click="select('view')">
                {{ t('Review validation results') }}
              </button>
            </li>
            <li>
              <button class="text-link" @click="select('depsummary')">
                {{ t('Review terms and submit') }}
              </button>
            </li>
          </ol>
        </section>
        <section v-else-if="tab === 'requirements'">
          <p>{{ statistics.missing.length }}{{ t('mandatory items to complete') }}</p>
          <ul class="requirements-list">
            <li v-for="(item, i) in statistics.missing" :key="i">
              <button class="text-link" @click="jump(item)">{{ item.title }} <ArrowRight /></button>
            </li>
          </ul>
        </section>
        <section v-else-if="tab === 'uploads'" class="files">
          <article v-for="rule in definition.files" :key="rule.role" class="file-group">
            <h2>{{ t(rule.title) }}</h2>
            <div
              v-for="slot in rule.max"
              :key="slot"
              class="file-slot"
            >
              <span v-if="rule.max > 1">{{ slot }}</span
              ><template v-if="fileOf(rule.role, slot)"
                ><a :href="depositionFileUrl(current.id, fileOf(rule.role, slot)!.id)">{{
                  fileOf(rule.role, slot)!.originalName
                }}</a
                ><span
                  >{{ t('v') }}{{ fileOf(rule.role, slot)!.revision }} ·
                  {{ stateLabel(fileOf(rule.role, slot)!.parseState) }}</span
                >
                <p v-if="fileOf(rule.role, slot)!.parseError" class="error">
                  {{ fileOf(rule.role, slot)!.parseError }}
                </p>
                <button :disabled="busy || !editable" @click="reparse(fileOf(rule.role, slot)!.id)">
                  <Refresh />{{ t('Reparse') }}</button
                ><button :disabled="busy || !editable" @click="remove(fileOf(rule.role, slot)!.id)">
                  <Delete />{{ t('Remove') }}
                </button></template
              ><span v-else>{{ t('Awaiting upload') }}</span>
              <label v-if="editable" class="file-picker"
                >{{ fileOf(rule.role, slot) ? t('Replace') : t('Upload')
                }}<input
                  type="file"
                  :aria-label="`${t(rule.title)} ${t('Slot')} ${slot}`"
                  :accept="rule.extensions.join(',')"
                  :disabled="busy"
                  @change="upload(rule.role, slot, $event)"
              /></label>
            </div>
          </article>
        </section>
        <section v-else-if="tab === 'summary'">
          <p>{{ t('Review the information extracted from the uploaded files.') }}</p>
          <details v-for="file in current.files" :key="file.id" open class="summary-block">
            <summary>{{ file.originalName }} · {{ stateLabel(file.parseState) }}</summary>
            <table>
              <tbody>
                <tr>
                  <th>{{ t('Version / size') }}</th>
                  <td>
                    {{ file.revision }} / {{ (file.size / 1024 / 1024).toFixed(2) }}{{ t('MB') }}
                  </td>
                </tr>
                <tr
                  v-for="(value, key) in Object.fromEntries(
                    Object.entries(file.facts as Record<string, unknown>).filter(
                      ([key]) => key !== 'metadata',
                    ),
                  )"
                  :key="key"
                >
                  <th>{{ t(String(key)) }}</th>
                  <td>{{ value }}</td>
                </tr>
              </tbody>
            </table>
            <p v-for="conflict in file.conflicts" :key="conflict" class="missing">{{ conflict }}</p>
          </details>
          <button v-if="!current.files.length" @click="select('uploads')">
            {{ t('Upload files') }}</button
          ><button class="text-link" @click="select('origins')">
            {{ t('Field sources') }}<ArrowRight />
          </button>
        </section>
        <section v-else-if="tab === 'message'">
          <CommunicationPanel :deposition-id="current.id" />
          <details v-if="messages.length">
            <summary>{{ t('Saved draft notes') }}</summary>
            <article v-for="message in messages" :key="String(message.recordId)">
              <h3>{{ message.subject }}</h3>
              <p>{{ message.body }}</p>
            </article>
          </details>
        </section>
        <section v-else-if="tab === 'view'">
          <div class="validation-actions">
            <button :disabled="busy || !editable" @click="check">{{ t('Run validation') }}</button
            ><span v-if="dirty">{{ t('Unsaved changes') }}</span>
          </div>
          <p v-if="!current.checks.length">{{ t('No validation report') }}</p>
          <details v-for="run in current.checks" :key="run.id" open class="summary-block">
            <summary>
              {{ t(run.checkId) }} · {{ stateLabel(run.state) }}{{ t('· v')
              }}{{ run.inputRevision }}
            </summary>
            <p v-if="run.error" class="error">{{ run.error }}</p>
            <p v-if="run.state === 'succeeded' && !run.issues.length">{{ t('No issues found') }}</p>
            <ul>
              <li
                v-for="(issue, i) in run.issues"
                :key="i"
                :class="issue.severity === 'error' ? 'error' : 'missing'"
              >
                {{ issue.message }}
              </li>
            </ul>
          </details>
        </section>
        <section v-else-if="tab === 'origins'">
          <table>
            <thead>
              <tr>
                <th>{{ t('Field / record') }}</th>
                <th>{{ t('Source') }}</th>
                <th>{{ t('CIF tag') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(origin, i) in current.origins" :key="i">
                <td>
                  {{
                    [origin.address.collection, origin.address.recordId, origin.address.field]
                      .filter(Boolean)
                      .join(' / ')
                  }}
                </td>
                <td>
                  {{
                    origin.source === 'user'
                      ? t('Edited')
                      : `${t('File')} ${origin.fileId} · v${origin.fileRevision}`
                  }}
                </td>
                <td>{{ origin.tag }}</td>
              </tr>
            </tbody>
          </table>
        </section>
        <template v-else>
          <section v-if="tab === 'ligandsummary'" class="outside-demo">
            <h2>{{ t('Ligands identified in the coordinate file') }}</h2>
            <table>
              <thead>
                <tr>
                  <th>{{ t('Ligand') }}</th>
                  <th>{{ t('Inspection') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="ligand in ligands" :key="ligand.recordId">
                  <td>{{ ligand.name }}</td>
                  <td>
                    <button :disabled="!editable" @click="inspectLigand(ligand)">
                      {{ t('Inspect selected ligand') }}
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
            <p v-if="!ligands.length">
              {{ t('No non-polymer entities in the parsed coordinate metadata') }}
            </p>
          </section>
          <section v-if="tab === 'depsummary'" class="submission-summary">
            <h2>{{ t('Deposition summary') }}</h2>
            <table>
              <tbody>
                <tr>
                  <th>{{ t('Entry') }}</th>
                  <td>{{ current.code }}</td>
                </tr>
                <tr>
                  <th>{{ t('Title') }}</th>
                  <td>{{ model.getValue('title') }}</td>
                </tr>
                <tr>
                  <th>{{ t('Files') }}</th>
                  <td>{{ current.files.length }}</td>
                </tr>
                <tr>
                  <th>{{ t('Scientific information to complete') }}</th>
                  <td>
                    <button class="text-link" @click="select('requirements')">
                      {{ statistics.missing.length }}{{ t('items') }}
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
            <details>
              <summary>{{ t('Deposition and release policies') }}</summary>
              <p>
                {{
                  t(
                    'Review authors, contact information, release instructions and validation results before submission.',
                  )
                }}
              </p>
              <a
                href="https://www.wwpdb.org/deposition/policies"
                target="_blank"
                rel="noreferrer"
                >{{ t('wwPDB deposition policies') }}</a
              >
            </details>
          </section>
          <SurveyComponent :model="model" />
          <section v-if="tab === 'depsummary'" class="submission-actions">
            <button :disabled="busy || !editable || !checksReady" @click="submit">
              {{ t('Submit deposition') }}</button
            ><button v-if="editable && !checksReady" :disabled="busy" @click="check">
              {{ t('Run validation') }}</button
            ><a v-if="current.submission" :href="`/api/depositions/${current.id}/export`">{{
              t('Download submission')
            }}</a>
          </section>
        </template>
        <div class="page-actions">
          <button :disabled="busy || !editable" @click="save">{{ t('Save') }}</button
          ><button @click="nextPage">{{ t('Continue to next section') }}<ArrowRight /></button>
        </div>
      </main>
    </div>
    <Copilot
      v-if="content"
      :key="current.id"
      :root="content"
      :deposition-id="current.id"
      :read-snapshot="readCopilotSnapshot"
      :apply-suggestion="applySuggestion"
    />
    <footer class="editor-footer"><InfoFilled />{{ t('OneDep ·') }}{{ current.code }}</footer>
  </article>
</template>
