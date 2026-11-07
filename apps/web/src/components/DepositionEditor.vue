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
  error = ref(''),
  dirty = ref(false)
const editable = computed(() => current.value.status === 'DRAFT')
function configure() {
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
  error.value = ''
  try {
    await work()
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
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
    notice.value = '本地提交完成，快照与导出包已固定。'
  })
function upload(role: string, slot: number, event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  void action(async () => {
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
    const savedFile = fileOf(role, slot)
    if (savedFile?.parseState === 'failed') error.value = savedFile.parseError ?? '解析失败'
    else notice.value = '上传与解析完成；人工修改已保留。'
    input.value = ''
  })
}
function reparse(fileId: number) {
  void action(async () => {
    await saved()
    accept(await reparseDeposition(current.value.id, fileId, current.value.revision))
    notice.value = '重解析完成；人工修改已保留。'
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
const status = (state: string) =>
  ({
    succeeded: '执行完成',
    failed: '执行失败',
    unavailable: '未接入',
    pending: '等待',
    running: '运行中',
  })[state] ?? state
</script>
<template>
  <article class="editor">
    <header>
      <p class="eyebrow">本地投递 DEMO · {{ current.code }} · 版本 {{ current.revision }}</p>
      <h1>{{ current.title }}</h1>
      <p>{{ definition.title }} · {{ editable ? '草稿' : '已本地提交' }}</p>
    </header>
    <p class="scope">
      当前提交要求：文件角色、数量、可读取性、实体关联与图网格一致性。科学资料缺项保留为待补充；完整科学评估、CCD
      配体核验和人工审校尚未接入。
    </p>
    <p v-if="error" role="alert" class="error">{{ error }}</p>
    <p v-if="notice" role="status" class="notice">{{ notice }}</p>
    <div class="toolbar">
      <button :disabled="busy || !editable" @click="save">
        保存草稿{{ dirty ? ' · 未保存' : '' }}</button
      ><button :disabled="busy || !editable" @click="check">检查当前版本</button
      ><button :disabled="busy || !editable || !checksReady" @click="submit">本地提交</button
      ><a v-if="current.submission" :href="`/api/depositions/${current.id}/export`">下载提交包</a
      ><span v-if="busy">处理中…</span>
    </div>
    <div class="layout">
      <nav aria-label="投递步骤">
        <button :class="{ active: tab === 'files' }" @click="select('files')">文件与解析</button
        ><button
          v-for="page in definition.pages"
          :key="page.name"
          :class="{ active: tab === page.name }"
          @click="select(page.name)"
        >
          {{ page.title }}</button
        ><button :class="{ active: tab === 'checks' }" @click="select('checks')">检查结果</button
        ><button :class="{ active: tab === 'origins' }" @click="select('origins')">字段来源</button>
      </nav>
      <div class="content" :aria-busy="busy">
        <section v-if="tab === 'files'">
          <h2>文件与解析</h2>
          <p>每个槽位独立保存。替换文件产生新版本，之前的检查随即失效。</p>
          <div class="files">
            <template v-for="rule in definition.files" :key="rule.role"
              ><article v-for="slot in rule.max" :key="`${rule.role}-${slot}`" class="file">
                <h3>{{ rule.title }} · 槽 {{ slot }}</h3>
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
          <h2>检查结果</h2>
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
          <h2>字段来源</h2>
          <p>来源保留文件版本和原始行键；重新解析保留人工修改。</p>
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
      </div>
    </div>
  </article>
</template>
<style scoped>
.editor {
  color: #22332b;
  max-width: 1280px;
  margin: auto;
}
.eyebrow {
  font-size: 12px;
  letter-spacing: 0.08em;
  color: #63766c;
}
h1 {
  font-size: 25px;
  line-height: 1.45;
  margin: 8px 0;
}
h2 {
  font-size: 22px;
}
h3 {
  font-size: 16px;
}
.scope {
  background: #edf3ee;
  padding: 16px;
  border-left: 3px solid #466953;
  line-height: 1.7;
  font-size: 14px;
}
.toolbar {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 16px 0;
  flex-wrap: wrap;
}
button {
  border: 1px solid #bac8bf;
  border-radius: 5px;
  padding: 9px 14px;
  background: white;
  color: #274c38;
  cursor: pointer;
}
button:disabled {
  opacity: 0.45;
  cursor: default;
}
a {
  color: #286545;
}
.layout {
  display: grid;
  grid-template-columns: 170px minmax(0, 1fr);
  gap: 20px;
}
nav {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-self: start;
  position: sticky;
  top: 80px;
}
nav button {
  text-align: left;
  border-color: transparent;
}
.active {
  background: #dceade;
  font-weight: 600;
}
.content {
  background: white;
  border: 1px solid #dae3dc;
  border-radius: 10px;
  min-width: 0;
  min-height: 600px;
}
.content > section {
  padding: 24px;
}
.files {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 16px;
}
.file,
.check {
  border: 1px solid #dce4de;
  border-radius: 8px;
  padding: 18px;
  margin: 12px 0;
  overflow-wrap: anywhere;
}
.file label {
  display: block;
  margin-top: 16px;
  font-size: 13px;
}
.file input {
  display: block;
  margin-top: 8px;
  max-width: 100%;
}
.error {
  color: #ae302c;
  background: #fff2ef;
  padding: 10px;
  white-space: pre-wrap;
}
.notice {
  color: #28613e;
  background: #eef7ef;
  padding: 10px;
}
.missing {
  color: #8e620b;
}
dl {
  display: flex;
  gap: 10px;
  font-size: 12px;
  margin: 6px 0;
}
dd {
  margin: 0;
}
table {
  border-collapse: collapse;
  width: 100%;
  font-size: 12px;
}
th,
td {
  padding: 10px;
  border-bottom: 1px solid #e5ebe6;
  text-align: left;
  overflow-wrap: anywhere;
}
li {
  margin: 10px 0;
  line-height: 1.6;
}
@media (max-width: 850px) {
  .layout {
    grid-template-columns: 1fr;
  }
  nav {
    position: static;
    flex-direction: row;
    flex-wrap: wrap;
  }
}
</style>
