<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { SurveyComponent } from 'survey-vue3-ui'
import 'survey-core/survey-core.css'
import type { DepositionDetail, DepositionFileKind } from '@onedep/shared'
import { createQuestionnaire, getProfileDefinition, type Answers } from '@onedep/shared/deposition'
import {
  checkDeposition,
  depositionFileUrl,
  reparseDeposition,
  saveDeposition,
  submitDeposition,
  uploadDepositionFile,
} from '@/data/depositions'
const props = defineProps<{ deposition: DepositionDetail }>()
const emit = defineEmits<{ changed: [value: DepositionDetail]; back: [] }>()
const current = ref(props.deposition)
const definition = computed(() => getProfileDefinition(current.value.profile))
const model = shallowRef(createQuestionnaire(current.value.profile, current.value.answers))
const tab = ref('files'),
  busy = ref(false),
  notice = ref(''),
  dirty = ref(false)
const editable = computed(() => current.value.status === 'DRAFT')
function configure() {
  model.value.questionTitleLocation = 'left'
  model.value.applyTheme({
    isPanelless: true,
    cssVariables: {
      '--sjs-font-family': 'Arial, sans-serif',
      '--sjs-font-size': '13px',
      '--sjs-base-unit': '4px',
      '--sjs-general-backcolor': '#ffffff',
      '--sjs-general-backcolor-dim': '#ffffff',
      '--sjs-primary-backcolor': '#659864',
      '--sjs-corner-radius': '2px',
      '--sjs-shadow-small': 'none',
      '--sjs-shadow-inner': 'none',
    },
  })
  model.value.showNavigationButtons = false
  model.value.mode = editable.value ? 'edit' : 'display'
  model.value.onValueChanged.add(() => {
    dirty.value = true
  })
  model.value.onDynamicPanelRemoved.add(() => {
    dirty.value = true
  })
  model.value.onDynamicPanelAdded.add(() => {
    dirty.value = true
  })
}
configure()
function accept(value: DepositionDetail) {
  current.value = value
  model.value.dispose()
  model.value = createQuestionnaire(value.profile, value.answers)
  configure()
  dirty.value = false
  const index = definition.value.pages.findIndex((p) => p.name === tab.value)
  if (index >= 0) model.value.currentPageNo = index
  emit('changed', value)
}
watch(
  () => props.deposition,
  (value) => {
    if (value !== current.value) accept(value)
  },
)
onBeforeUnmount(() => model.value.dispose())
function select(name: string) {
  tab.value = name
  const i = definition.value.pages.findIndex((p) => p.name === name)
  if (i >= 0) model.value.currentPageNo = i
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
    notice.value = '草稿已保存。'
  })
const check = () =>
  action(async () => {
    await saved()
    accept(await checkDeposition(current.value.id, current.value.revision))
    tab.value = 'checks'
    notice.value = '当前版本检查已完成。'
  })
const submit = () =>
  action(async () => {
    await saved()
    accept(await submitDeposition(current.value.id, current.value.revision))
    tab.value = 'checks'
    notice.value = '本地提交完成'
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
    notice.value = '上传与解析完成'
    input.value = ''
  })
}
function reparse(fileId: number) {
  return action(async () => {
    await saved()
    accept(await reparseDeposition(current.value.id, fileId, current.value.revision))
    notice.value = '重新解析完成'
  })
}
const fileOf = (role: string, slot: number) =>
  current.value.files.find((f) => f.kind === role && f.slot === slot)
const stale = computed(
  () => dirty.value || current.value.checks.some((c) => c.inputRevision !== current.value.revision),
)
const checksReady = computed(
  () =>
    !dirty.value &&
    current.value.checks.length > 0 &&
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
const states: Record<string, string> = {
  succeeded: '执行完成',
  failed: '执行失败',
  unavailable: '未接入',
  pending: '等待',
  running: '运行中',
}
function status(state: string) {
  const label = states[state]
  if (label === undefined) throw new Error('Unknown processing state: ' + state)
  return label
}
const pageTitle = computed(() => {
  if (tab.value === 'files') return '文件上传 / File upload'
  if (tab.value === 'checks') return '检查结果 / Validation'
  if (tab.value === 'origins') return '字段来源'
  const page = definition.value.pages.find((p) => p.name === tab.value)
  if (!page) throw new Error('Unknown questionnaire page: ' + tab.value)
  return page.title
})
const nextPage = () => {
  const names = ['files', ...definition.value.pages.map((p) => p.name), 'checks', 'origins']
  const index = names.indexOf(tab.value)
  if (index + 1 < names.length) select(names[index + 1]!)
}
</script>
<template>
  <article class="editor">
    <header id="pane-north" class="workspace-pane">
      <div class="masthead">
        <img :src="'/onedep/images/onedep_logo.png'" alt="OneDep" height="45" />
        <div>
          <button @click="emit('back')">返回投递列表</button
          ><img :src="'/onedep/images/wwpdb_logo.png'" alt="wwPDB" height="35" />
        </div>
      </div>
      <div class="deposition-title">
        OneDep Deposition: {{ current.code }} — {{ definition.title }}
      </div>
    </header>
    <div class="toolbar workspace-pane">
      <span>版本 {{ current.revision }} · {{ editable ? '草稿' : '已本地提交' }}</span>

      <button :disabled="busy || !editable" @click="save">
        保存草稿{{ dirty ? ' · 未保存' : '' }}</button
      ><button :disabled="busy || !editable" @click="check">检查当前版本</button
      ><button :disabled="busy || !editable || !checksReady" @click="submit">本地提交</button
      ><a v-if="current.submission" :href="`/api/depositions/${current.id}/export`">下载提交包</a
      ><span v-if="busy">处理中…</span>
    </div>
    <div class="layout">
      <nav id="pane-west" class="workspace-pane" aria-label="投递步骤">
        <div class="navigation-panel">
          <h3 class="section-heading">Navigation</h3>
          <button :class="{ active: tab === 'files' }" @click="select('files')">文件与解析</button
          ><button
            v-for="page in definition.pages"
            :key="page.name"
            :class="{ active: tab === page.name }"
            @click="select(page.name)"
          >
            {{ page.title }}</button
          ><button :class="{ active: tab === 'checks' }" @click="select('checks')">检查结果</button
          ><button :class="{ active: tab === 'origins' }" @click="select('origins')">
            字段来源
          </button>
        </div>
      </nav>
      <div id="pane-center" class="content workspace-pane" :aria-busy="busy">
        <h3 class="section-heading">{{ pageTitle }}</h3>
        <p v-if="notice" role="status" class="notice">{{ notice }}</p>
        <section v-if="tab === 'files'">
          <div class="files">
            <template v-for="rule in definition.files" :key="rule.role"
              ><article v-for="slot in rule.max" :key="`${rule.role}-${slot}`" class="file">
                <h3>{{ rule.title }}{{ rule.max > 1 ? ` · ${slot}` : '' }}</h3>
                <template v-if="fileOf(rule.role, slot)"
                  ><a :href="depositionFileUrl(current.id, fileOf(rule.role, slot)!.id)">{{
                    fileOf(rule.role, slot)!.originalName
                  }}</a>
                  <p>
                    文件版本 {{ fileOf(rule.role, slot)!.revision }} ·
                    {{ status(fileOf(rule.role, slot)!.parseState) }}
                  </p>
                  <p v-if="fileOf(rule.role, slot)!.parseError" class="error">
                    {{ fileOf(rule.role, slot)!.parseError }}
                  </p>
                  <p
                    v-for="conflict in fileOf(rule.role, slot)!.conflicts"
                    :key="conflict"
                    class="missing"
                  >
                    {{ conflict }}
                  </p>
                  <dl
                    v-for="(value, key) in fileOf(rule.role, slot)!.facts as Record<
                      string,
                      unknown
                    >"
                    :key="key"
                  >
                    <dt>{{ key }}</dt>
                    <dd>{{ value }}</dd>
                  </dl>
                  <button
                    :disabled="busy || !editable"
                    @click="reparse(fileOf(rule.role, slot)!.id)"
                  >
                    重新解析
                  </button></template
                >
                <p v-else class="missing">待上传</p>
                <label v-if="editable"
                  >{{ fileOf(rule.role, slot) ? '替换文件' : '上传文件'
                  }}<input
                    type="file"
                    :aria-label="`${rule.title} 槽 ${slot}`"
                    :accept="rule.extensions.join(',')"
                    :disabled="busy"
                    @change="upload(rule.role, slot, $event)"
                /></label></article
            ></template>
          </div>
        </section>
        <section v-else-if="tab === 'checks'">
          <p v-if="editable && stale" class="error">
            答案或附件已变化，旧检查已失效。请检查当前版本。
          </p>
          <p v-if="!current.checks.length">尚未执行检查。</p>
          <article v-for="run in current.checks" :key="run.id" class="check">
            <h3>{{ run.checkId }} · {{ status(run.state) }} · 输入版本 {{ run.inputRevision }}</h3>
            <p v-if="run.error" class="missing">{{ run.error }}</p>
            <p v-if="run.state === 'succeeded' && !run.issues.length">本项检查没有发现问题。</p>
            <ul>
              <li
                v-for="(issue, i) in run.issues"
                :key="i"
                :class="issue.severity === 'error' ? 'error' : 'missing'"
              >
                {{ issue.severity === 'error' ? '阻塞' : '待补充' }} · {{ issue.message }}
              </li>
            </ul>
          </article>
        </section>
        <section v-else-if="tab === 'origins'">
          <table>
            <thead>
              <tr>
                <th>字段／记录</th>
                <th>来源</th>
                <th>原始位置</th>
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
                      ? '人工修改'
                      : `文件 ${origin.fileId} · v${origin.fileRevision}`
                  }}
                </td>
                <td>{{ origin.tag }} {{ origin.sourceRowKey }}</td>
              </tr>
            </tbody>
          </table>
        </section>
        <SurveyComponent v-else :model="model" />
        <button v-if="tab !== 'origins'" class="next" @click="nextPage">
          Continue to next section ›
        </button>
      </div>
    </div>
    <footer id="pane-south" class="workspace-pane">OneDep · {{ current.code }}</footer>
  </article>
</template>
<style scoped>
.editor {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: grid;
  grid-template-rows: 91px 43px minmax(0, 1fr) 28px;
  color: #222;
  background: #ddd;
  font:
    12px Arial,
    sans-serif;
  gap: 1px;
}
.editor * {
  box-sizing: border-box;
}
#pane-north {
  padding: 8px 12px;
}
.masthead {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.masthead > div {
  display: flex;
  align-items: center;
  gap: 24px;
}
.deposition-title {
  text-align: center;
  color: #036;
  margin-top: 6px;
  font-size: 16px;
}
.toolbar {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 5px 12px;
}
.toolbar > span:first-child {
  margin-right: auto;
}
button {
  border: 1px solid #aaa;
  border-radius: 3px;
  padding: 5px 10px;
  background: #f0f0f0;
  color: #036;
  font: inherit;
  cursor: pointer;
}
button:hover {
  border-color: #036;
  background: #e4eee4;
}
button:disabled {
  opacity: 0.45;
  cursor: default;
}
a {
  color: #036;
  text-decoration: underline;
}
.layout {
  display: grid;
  grid-template-columns: 250px minmax(0, 1fr);
  gap: 1px;
  min-height: 0;
}
#pane-west {
  padding: 10px;
}
.main_navigation {
  padding: 4px;
}
nav button {
  display: block;
  width: 100%;
  border: 0;
  background: transparent;
  text-align: left;
  padding: 7px 10px 7px 22px;
  color: #222;
  border-radius: 0;
}
nav button.active {
  background: #e2eedd;
  color: #036;
}
nav h3 {
  margin-bottom: 8px;
}
.content {
  min-width: 0;
  overflow: auto;
  padding: 10px;
}
.content > section {
  padding: 8px 12px;
}
h3 {
  font-size: 13px;
  font-weight: normal;
}
.files {
  display: block;
}
.file {
  display: grid;
  grid-template-columns: 200px minmax(0, 1fr);
  column-gap: 16px;
  border-bottom: 1px solid #ddd;
  padding: 14px 0;
}
.file > h3 {
  grid-column: 1;
  grid-row: 1 / span 20;
  margin: 0;
  color: #036;
}
.file > :not(h3) {
  grid-column: 2;
  margin: 4px 0;
}
.file > button {
  justify-self: start;
}
.file label {
  display: block;
}
.file input {
  margin: 6px 0;
  display: block;
  font: inherit;
}
.check {
  border-bottom: 1px solid #ddd;
  padding: 8px 0;
}
.error {
  color: #a11;
  white-space: pre-wrap;
}
.notice {
  color: #365f35;
  padding: 4px 12px;
}
.missing {
  color: #715517;
}
dl {
  display: flex;
  gap: 12px;
}
dd {
  margin: 0;
}
table {
  border-collapse: collapse;
  width: 100%;
}
th,
td {
  padding: 7px;
  border-bottom: 1px solid #ddd;
  text-align: left;
  overflow-wrap: anywhere;
}
li {
  margin: 6px 0;
}
.next {
  margin: 16px 12px;
}
#pane-south {
  padding: 5px 12px;
  text-align: right;
  color: #555;
}
:deep(.sd-root-modern) {
  --sd-base-padding: 12px;
  --sd-base-vertical-padding: 8px;
}
:deep(.sd-container-modern__title),
:deep(.sd-page__title) {
  display: none;
}
:deep(.sd-body.sd-body--static) {
  max-width: none;
  padding: 8px 12px;
}
:deep(.sd-question) {
  border-bottom: 1px solid #ddd;
  padding-bottom: 12px;
}
:deep(.sd-question__title) {
  color: #036;
  font-size: 13px;
  font-weight: normal;
}
:deep(.sd-question__header--location--left) {
  flex: 0 0 200px;
  width: 200px;
}
:deep(.sd-question__content--left) {
  max-width: 600px;
}
:deep(.sd-formbox) {
  border: 1px solid #aaa;
  border-radius: 2px;
  box-shadow: none;
}
:deep(.sd-question__content) {
  min-width: 0;
}
:deep(.sd-input) {
  border: 1px solid #aaa;
  background: white;
  padding: 5px 7px;
  min-height: 28px;
  font:
    13px Arial,
    sans-serif;
  border-radius: 2px;
}
:deep(.sd-comment) {
  min-height: 80px;
}
:deep(.sd-btn) {
  box-shadow: none;
  border: 1px solid #aaa;
  padding: 6px 12px;
  font-weight: normal;
}
:deep(.sd-panel__title) {
  font-size: 13px;
  font-weight: normal;
}
@media (max-width: 800px) {
  .layout {
    grid-template-columns: 180px minmax(0, 1fr);
  }
  .file {
    grid-template-columns: 130px minmax(0, 1fr);
  }
  .masthead > div {
    gap: 8px;
  }
  .deposition-title {
    font-size: 13px;
  }
}
</style>
