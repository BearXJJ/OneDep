<script setup lang="ts">
import StepAlong from '@/copilot/StepAlong.vue'
import type { Snapshot } from '@onedep/shared/copilot'
import { computed, h, render, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { useRouter } from 'vue-router'
import { SurveyComponent } from 'survey-vue3-ui'
import { QuestionPanelDynamicModel, type Question as SurveyQuestion } from 'survey-core'
import { ArrowRight, Back, Download, Refresh, Delete, InfoFilled } from '@element-plus/icons-vue'
import 'survey-core/survey-core.css'
import type { DepositionDetail, DepositionFileKind } from '@onedep/shared'
import {
  createQuestionnaire,
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
  survey.questionTitleLocation = 'left'
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
    event.htmlElement.dataset.stepalongQuestion = event.question.name
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
    function count(q: SurveyQuestion) {
      if (!q.isVisible || !q.isParentVisible || q.name === 'recordId') return
      if (q instanceof QuestionPanelDynamicModel) {
        if (q.panels.length) q.panels.forEach((panel) => panel.questions.forEach(count))
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
    p.questions.forEach(count)
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
        missing.unshift({ page: 'uploads', title: rule.title + (rule.max > 1 ? ' ' + slot : '') })
  const unique = Object.entries(pages)
    .filter(([name]) => !['summary', 'message', 'ligandsummary'].includes(name))
    .map(([, s]) => s)
  const total = unique.reduce((n, s) => n + s.total, 0),
    complete = unique.reduce((n, s) => n + s.completed, 0),
    required = unique.reduce((n, s) => n + s.required, 0),
    requiredComplete = unique.reduce((n, s) => n + s.requiredCompleted, 0)
  return {
    pages,
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
  if (tab.value === 'requirements') return 'List requirements'
  if (tab.value === 'origins') return 'Field sources'
  const n = navPages.value.find((n) => n.page === tab.value)
  if (!n) throw new Error('Unknown navigation page: ' + tab.value)
  return n.title
})
function nextPage() {
  const index = navPages.value.findIndex((n) => n.id === selection.value || n.page === tab.value)
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
const subject = ref('General question'),
  messageBody = ref('')
const subjects = [
  'General question',
  'Metadata corrections',
  'File upload issue',
  'Submission issue',
  'Response to issues',
  'Re-upload files',
  'Citation update',
  'Release request',
  'Other',
]
const postMessage = () =>
  action(async () => {
    if (!messageBody.value.trim()) throw new Error('Message is required')
    model.value.setValue('communication', [
      ...messages.value,
      {
        recordId: crypto.randomUUID(),
        subject: subject.value,
        body: messageBody.value.trim(),
        date: new Date().toISOString(),
      },
    ])
    await saved()
    messageBody.value = ''
    notice.value = 'Message saved'
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
  return label
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
      if (!button.id) button.id = 'stepalong-' + tab.value + '-button-' + index
      return { targetId: button.id, label: button.innerText.trim(), disabled: button.disabled }
    })
  return {
    page: tab.value,
    title: pageTitle.value,
    fields,
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
</script>
<template>
  <article class="editor onedep-workspace">
    <header class="editor-masthead">
      <img :src="'/onedep/images/onedep_logo.png'" alt="OneDep" height="45" />
      <div class="deposition-title">
        OneDep Deposition: {{ current.code
        }}<small
          >{{ current.method }} · {{ editable ? 'Draft' : 'Submitted' }} · v{{
            current.revision
          }}</small
        >
      </div>
      <button @click="leave"><Back />Deposition list</button
      ><img :src="'/onedep/images/wwpdb_logo.png'" alt="wwPDB" height="34" />
    </header>
    <div class="editor-toolbar">
      <span class="scope-key"><i />黄色：原 demo 之外的内容</span
      ><span v-if="busy">Processing…</span
      ><span v-if="notice" role="status" class="notice">{{ notice }}</span>
      <button :disabled="busy || !editable" @click="save">Save{{ dirty ? ' *' : '' }}</button
      ><button :disabled="busy || !editable" @click="check">Run validation</button>
      <a v-if="current.submission" :href="`/api/depositions/${current.id}/export`"
        ><Download />Download submission</a
      >
    </div>
    <div class="editor-layout">
      <aside class="editor-sidebar" aria-label="投递步骤">
        <button class="requirements-button" @click="select('requirements')">
          List requirements
        </button>
        <div class="completion-bars">
          <label
            >All items <small>{{ statistics.complete }} / {{ statistics.total }}</small
            ><progress :value="statistics.allPercent" max="100" /></label
          ><label
            >Mandatory items
            <small>{{ statistics.requiredComplete }} / {{ statistics.required }}</small
            ><progress :value="statistics.mandatoryPercent" max="100"
          /></label>
        </div>
        <h2 class="section-heading">Navigation</h2>
        <DepositionNavigation :items="navigation" :current="selection" @select="selectItem" />
        <button class="logout-button" :disabled="busy" @click="logout">Log out</button>
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
          <h2>Welcome to OneDep</h2>
          <p>
            Upload coordinates and experimental files, review extracted information, then complete
            each section in the navigation tree.
          </p>
          <ol>
            <li>
              <button class="text-link" @click="select('uploads')">Upload / replace files</button>
            </li>
            <li>
              <button class="text-link" @click="select('summary')">
                Review the upload summary
              </button>
            </li>
            <li>
              <button class="text-link" @click="select('contact')">
                Complete administrative and experimental information
              </button>
            </li>
            <li>
              <button class="text-link" @click="select('view')">Review validation results</button>
            </li>
            <li>
              <button class="text-link" @click="select('depsummary')">
                Review terms and submit
              </button>
            </li>
          </ol>
        </section>
        <section v-else-if="tab === 'requirements'">
          <p>{{ statistics.missing.length }} mandatory items to complete</p>
          <ul class="requirements-list">
            <li v-for="(item, i) in statistics.missing" :key="i">
              <button class="text-link" @click="jump(item)">{{ item.title }} <ArrowRight /></button>
            </li>
          </ul>
        </section>
        <section v-else-if="tab === 'uploads'" class="files">
          <article v-for="rule in definition.files" :key="rule.role" class="file-group">
            <h2>{{ rule.title }}</h2>
            <div v-for="slot in rule.max" :key="slot" class="file-slot">
              <span v-if="rule.max > 1">{{ slot }}</span
              ><template v-if="fileOf(rule.role, slot)"
                ><a :href="depositionFileUrl(current.id, fileOf(rule.role, slot)!.id)">{{
                  fileOf(rule.role, slot)!.originalName
                }}</a
                ><span
                  >v{{ fileOf(rule.role, slot)!.revision }} ·
                  {{ stateLabel(fileOf(rule.role, slot)!.parseState) }}</span
                >
                <p v-if="fileOf(rule.role, slot)!.parseError" class="error">
                  {{ fileOf(rule.role, slot)!.parseError }}
                </p>
                <button :disabled="busy || !editable" @click="reparse(fileOf(rule.role, slot)!.id)">
                  <Refresh />Reparse</button
                ><button :disabled="busy || !editable" @click="remove(fileOf(rule.role, slot)!.id)">
                  <Delete />Remove
                </button></template
              ><span v-else>Awaiting upload</span>
              <label v-if="editable"
                >{{ fileOf(rule.role, slot) ? 'Replace' : 'Upload'
                }}<input
                  type="file"
                  :aria-label="`${rule.title} 槽 ${slot}`"
                  :accept="rule.extensions.join(',')"
                  :disabled="busy"
                  @change="upload(rule.role, slot, $event)"
              /></label>
            </div>
          </article>
        </section>
        <section v-else-if="tab === 'summary'">
          <p>Review the information extracted from the uploaded files.</p>
          <details v-for="file in current.files" :key="file.id" open class="summary-block">
            <summary>{{ file.originalName }} · {{ stateLabel(file.parseState) }}</summary>
            <table>
              <tbody>
                <tr>
                  <th>Version / size</th>
                  <td>{{ file.revision }} / {{ (file.size / 1024 / 1024).toFixed(2) }} MB</td>
                </tr>
                <tr v-for="(value, key) in file.facts as Record<string, unknown>" :key="key">
                  <th>{{ key }}</th>
                  <td>{{ value }}</td>
                </tr>
              </tbody>
            </table>
            <p v-for="conflict in file.conflicts" :key="conflict" class="missing">{{ conflict }}</p>
          </details>
          <button v-if="!current.files.length" @click="select('uploads')">Upload files</button
          ><button class="text-link" @click="select('origins')">
            Field sources <ArrowRight />
          </button>
        </section>
        <section v-else-if="tab === 'message'" class="outside-demo communication">
          <h2>Messages</h2>
          <article v-for="message in messages" :key="message.recordId" class="message">
            <h3>
              {{ message.subject }} <time>{{ message.date }}</time>
            </h3>
            <p>{{ message.body }}</p>
          </article>
          <p v-if="!messages.length">No messages</p>
          <form v-if="editable" @submit.prevent="postMessage">
            <h2>New message</h2>
            <label
              >Subject<select v-model="subject">
                <option v-for="s in subjects" :key="s">{{ s }}</option>
              </select></label
            ><label>Message<textarea v-model="messageBody" rows="7" required /></label
            ><button :disabled="busy" type="submit">Save message</button>
          </form>
        </section>
        <section v-else-if="tab === 'view'">
          <div class="validation-actions">
            <button :disabled="busy || !editable" @click="check">Run validation</button
            ><span v-if="dirty">Unsaved changes</span>
          </div>
          <p v-if="!current.checks.length">No validation report</p>
          <details v-for="run in current.checks" :key="run.id" open class="summary-block">
            <summary>
              {{ run.checkId }} · {{ stateLabel(run.state) }} · v{{ run.inputRevision }}
            </summary>
            <p v-if="run.error" class="error">{{ run.error }}</p>
            <p v-if="run.state === 'succeeded' && !run.issues.length">No issues found</p>
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
                <th>Field / record</th>
                <th>Source</th>
                <th>CIF tag</th>
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
                      ? 'Edited'
                      : `File ${origin.fileId} · v${origin.fileRevision}`
                  }}
                </td>
                <td>{{ origin.tag }}</td>
              </tr>
            </tbody>
          </table>
        </section>
        <template v-else>
          <section v-if="tab === 'ligandsummary'" class="outside-demo">
            <h2>Ligands identified in the coordinate file</h2>
            <table>
              <thead>
                <tr>
                  <th>Ligand</th>
                  <th>Inspection</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="ligand in ligands" :key="ligand.recordId">
                  <td>{{ ligand.name }}</td>
                  <td>
                    <button :disabled="!editable" @click="inspectLigand(ligand)">
                      Inspect selected ligand
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
            <p v-if="!ligands.length">No non-polymer entities in the parsed coordinate metadata</p>
          </section>
          <section v-if="tab === 'depsummary'" class="submission-summary">
            <h2>Deposition summary</h2>
            <table>
              <tbody>
                <tr>
                  <th>Entry</th>
                  <td>{{ current.code }}</td>
                </tr>
                <tr>
                  <th>Title</th>
                  <td>{{ model.getValue('title') }}</td>
                </tr>
                <tr>
                  <th>Files</th>
                  <td>{{ current.files.length }}</td>
                </tr>
                <tr>
                  <th>Scientific information to complete</th>
                  <td>
                    <button class="text-link" @click="select('requirements')">
                      {{ statistics.missing.length }} items
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
            <details>
              <summary>Deposition and release policies</summary>
              <p>
                Review authors, contact information, release instructions and validation results
                before submission.
              </p>
              <a href="https://www.wwpdb.org/deposition/policies" target="_blank" rel="noreferrer"
                >wwPDB deposition policies</a
              >
            </details>
          </section>
          <SurveyComponent :model="model" />
          <section v-if="tab === 'depsummary'" class="submission-actions">
            <button :disabled="busy || !editable || !checksReady" @click="submit">
              Submit deposition</button
            ><button v-if="editable && !checksReady" :disabled="busy" @click="check">
              Run validation</button
            ><a v-if="current.submission" :href="`/api/depositions/${current.id}/export`"
              >Download submission</a
            >
          </section>
        </template>
        <div class="page-actions">
          <button :disabled="busy || !editable" @click="save">Save</button
          ><button @click="nextPage">Continue to next section <ArrowRight /></button>
        </div>
      </main>
    </div>
    <StepAlong
      v-if="content"
      :key="current.id"
      :root="content"
      :deposition-id="current.id"
      :read-snapshot="readCopilotSnapshot"
    />
    <footer class="editor-footer"><InfoFilled />OneDep · {{ current.code }}</footer>
  </article>
</template>
