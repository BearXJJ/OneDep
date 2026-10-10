<template>
  <article class="deposition-editor">
    <header class="editor-header">
      <div class="entry-title">
        <h1>{{ metadata.entry.title || '未命名条目' }}</h1>
      </div>
      <div class="entry-meta">
        <span class="method-name">{{ formatMethodLabels(deposition.methods) }}</span>
        <span class="entry-code">{{ deposition.code }}</span>
        <i>{{ deposition.status === 'SUBMITTED' ? '已提交' : '草稿' }}</i>
      </div>
    </header>

    <p v-if="notice" class="notice" :class="{ error: noticeType === 'error' }" role="status">
      {{ notice }}
    </p>

    <div class="editor-layout">
      <nav class="section-nav" aria-label="投递填写步骤">
        <button
          v-for="section in sections"
          :key="section.id"
          type="button"
          :class="{ active: activeSection === section.id }"
          @click="goToSection(section.id)"
        >
          <span>{{ section.number }}</span
          >{{ section.label }}
        </button>
      </nav>

      <form class="editor-form" @submit.prevent="save">
        <fieldset :disabled="!editable">
          <section id="files" class="form-section">
            <div class="section-heading">
              <span>01</span>
              <div>
                <h2>文件</h2>
              </div>
            </div>
            <div class="file-grid">
              <div class="file-card">
                <div class="file-title">
                  <strong>坐标文件</strong>
                  <span>必填</span>
                </div>
                <div v-if="fileOf('COORDINATE')" class="uploaded-file">
                  <div>
                    <a :href="fileUrl(fileOf('COORDINATE')!.id)">{{
                      fileOf('COORDINATE')!.originalName
                    }}</a>
                    <span>{{ formatBytes(fileOf('COORDINATE')!.size) }}</span>
                  </div>
                  <button type="button" @click="removeFile(fileOf('COORDINATE')!.id)">删除</button>
                </div>
                <label v-else class="upload-control">
                  <input
                    type="file"
                    accept=".cif,.mmcif"
                    :disabled="uploadingKind !== null"
                    @change="uploadFile('COORDINATE', $event)"
                  />
                  {{ uploadingKind === 'COORDINATE' ? '正在上传…' : '选择文件' }}
                </label>
              </div>
              <div class="file-card">
                <div class="file-title">
                  <strong>结构因子</strong>
                  <span>必填</span>
                </div>
                <div v-if="fileOf('STRUCTURE_FACTOR')" class="uploaded-file">
                  <div>
                    <a :href="fileUrl(fileOf('STRUCTURE_FACTOR')!.id)">{{
                      fileOf('STRUCTURE_FACTOR')!.originalName
                    }}</a>
                    <span>{{ formatBytes(fileOf('STRUCTURE_FACTOR')!.size) }}</span>
                  </div>
                  <button type="button" @click="removeFile(fileOf('STRUCTURE_FACTOR')!.id)">
                    删除
                  </button>
                </div>
                <label v-else class="upload-control">
                  <input
                    type="file"
                    accept=".cif,.mmcif,.mtz"
                    :disabled="uploadingKind !== null"
                    @change="uploadFile('STRUCTURE_FACTOR', $event)"
                  />
                  {{ uploadingKind === 'STRUCTURE_FACTOR' ? '正在上传…' : '选择文件' }}
                </label>
              </div>
            </div>
          </section>

          <section id="entry" class="form-section">
            <div class="section-heading">
              <span>02</span>
              <div>
                <h2>条目信息</h2>
              </div>
            </div>
            <div class="field-grid">
              <label class="field full-field">
                <span>条目标题 <b>*</b></span>
                <textarea v-model="metadata.entry.title" rows="2" placeholder="完整描述该结构" />
              </label>
              <label class="field">
                <span>关键词 <b>*</b></span>
                <input
                  v-model="metadata.entry.keywords"
                  type="text"
                  placeholder="多个关键词用逗号分隔"
                />
              </label>
              <label class="field">
                <span>原始实验数据 DOI</span>
                <input
                  v-model="metadata.entry.relatedDataDoi"
                  type="text"
                  placeholder="10.xxxx/xxxxx"
                />
              </label>
              <label class="field full-field">
                <span>条目作者 <b>*</b></span>
                <textarea
                  v-model="authorsText"
                  rows="4"
                  placeholder="每行一位作者，按公开顺序填写"
                />
              </label>
            </div>
          </section>

          <section id="contact" class="form-section">
            <div class="section-heading">
              <span>03</span>
              <div>
                <h2>联系人与引用</h2>
              </div>
            </div>
            <div class="field-grid">
              <label class="field">
                <span>联系人姓名 <b>*</b></span>
                <input v-model="metadata.contact.name" type="text" />
              </label>
              <label class="field">
                <span>联系人邮箱 <b>*</b></span>
                <input v-model="metadata.contact.email" type="email" />
              </label>
              <label class="field">
                <span>ORCID <b>*</b></span>
                <input
                  v-model="metadata.contact.orcid"
                  type="text"
                  placeholder="0000-0000-0000-0000"
                />
              </label>
              <label class="field">
                <span>单位 <b>*</b></span>
                <input v-model="metadata.contact.institution" type="text" />
              </label>
              <label class="field full-field">
                <span>国家或地区 <b>*</b></span>
                <input v-model="metadata.contact.country" type="text" />
              </label>
              <label class="field">
                <span>论文状态</span>
                <ElSelect
                  v-model="metadata.citation.status"
                  class="form-select"
                  :disabled="!editable"
                >
                  <ElOption label="尚未发表" value="UNPUBLISHED" />
                  <ElOption label="撰写中" value="IN_PREPARATION" />
                  <ElOption label="已投稿" value="SUBMITTED" />
                  <ElOption label="已发表" value="PUBLISHED" />
                </ElSelect>
              </label>
              <label class="field">
                <span>论文 DOI</span>
                <input v-model="metadata.citation.doi" type="text" />
              </label>
              <label class="field full-field">
                <span>论文标题<span v-if="metadata.citation.status === 'PUBLISHED'"> *</span></span>
                <input v-model="metadata.citation.title" type="text" />
              </label>
              <label class="field full-field">
                <span>期刊<span v-if="metadata.citation.status === 'PUBLISHED'"> *</span></span>
                <input v-model="metadata.citation.journal" type="text" />
              </label>
            </div>
          </section>

          <section id="macromolecule" class="form-section">
            <div class="section-heading">
              <span>04</span>
              <div>
                <h2>大分子</h2>
              </div>
            </div>
            <div class="field-grid">
              <label class="field">
                <span>分子名称 <b>*</b></span>
                <input v-model="metadata.macromolecule.name" type="text" />
              </label>
              <label class="field">
                <span>分子类型 <b>*</b></span>
                <ElSelect
                  v-model="metadata.macromolecule.type"
                  class="form-select"
                  :disabled="!editable"
                >
                  <ElOption label="蛋白质" value="PROTEIN" />
                  <ElOption label="DNA" value="DNA" />
                  <ElOption label="RNA" value="RNA" />
                  <ElOption label="DNA/RNA 杂交" value="DNA_RNA_HYBRID" />
                </ElSelect>
              </label>
              <label class="field">
                <span>链编号 <b>*</b></span>
                <input v-model="metadata.macromolecule.chainIds" type="text" placeholder="A, B" />
              </label>
              <label class="field">
                <span>来源生物 <b>*</b></span>
                <input
                  v-model="metadata.macromolecule.sourceOrganism"
                  type="text"
                  placeholder="学名"
                />
              </label>
              <label class="field">
                <span>NCBI Taxonomy ID</span>
                <input
                  v-model="metadata.macromolecule.taxonomyId"
                  type="text"
                  inputmode="numeric"
                />
              </label>
              <label class="field">
                <span>表达宿主</span>
                <input v-model="metadata.macromolecule.expressionHost" type="text" />
              </label>
              <label class="field full-field">
                <span>聚合物序列 <b>*</b></span>
                <textarea
                  v-model="metadata.macromolecule.sequence"
                  class="sequence-input"
                  rows="7"
                  spellcheck="false"
                />
              </label>
              <label class="field full-field">
                <span>突变或工程化说明</span>
                <textarea v-model="metadata.macromolecule.mutations" rows="3" />
              </label>
            </div>
          </section>

          <section id="assembly" class="form-section">
            <div class="section-heading">
              <span>05</span>
              <div>
                <h2>生物组装</h2>
              </div>
            </div>
            <div class="field-grid">
              <label class="field">
                <span>寡聚状态 <b>*</b></span>
                <input
                  v-model="metadata.assembly.oligomericState"
                  type="text"
                  placeholder="例如：同源二聚体"
                />
              </label>
              <label class="field">
                <span>判定证据</span>
                <input
                  v-model="metadata.assembly.evidence"
                  type="text"
                  placeholder="例如：作者判断、PISA"
                />
              </label>
              <label class="field full-field">
                <span>组装说明 <b>*</b></span>
                <textarea v-model="metadata.assembly.description" rows="3" />
              </label>
            </div>
          </section>

          <section id="experiment" class="form-section">
            <div class="section-heading">
              <span>06</span>
              <div>
                <h2>晶体学实验</h2>
              </div>
            </div>
            <div class="field-grid">
              <label class="field">
                <span>结晶方法 <b>*</b></span>
                <input
                  v-model="metadata.xray.crystallizationMethod"
                  type="text"
                  placeholder="例如：悬滴蒸气扩散"
                />
              </label>
              <label class="field">
                <span>结晶温度（K） <b>*</b></span>
                <input
                  v-model="metadata.xray.crystallizationTemperature"
                  type="text"
                  inputmode="decimal"
                />
              </label>
              <label class="field">
                <span>结晶 pH</span>
                <input v-model="metadata.xray.crystallizationPh" type="text" inputmode="decimal" />
              </label>
              <label class="field">
                <span>空间群 <b>*</b></span>
                <input
                  v-model="metadata.xray.spaceGroup"
                  type="text"
                  placeholder="例如：P 21 21 21"
                />
              </label>
              <label class="field">
                <span>最高分辨率（Å）</span>
                <input v-model="metadata.xray.resolution" type="text" inputmode="decimal" />
              </label>
            </div>
          </section>

          <section id="release" class="form-section">
            <div class="section-heading">
              <span>07</span>
              <div>
                <h2>发布与确认</h2>
              </div>
            </div>
            <div class="field-grid">
              <label class="field full-field">
                <span>发布策略 <b>*</b></span>
                <ElSelect
                  v-model="metadata.release.status"
                  class="form-select"
                  :disabled="!editable"
                >
                  <ElOption label="处理完成后立即发布" value="IMMEDIATE" />
                  <ElOption label="随关联论文发布" value="HOLD_FOR_PUBLICATION" />
                  <ElOption label="保留到指定日期" value="HOLD_UNTIL_DATE" />
                </ElSelect>
              </label>
              <label v-if="metadata.release.status === 'HOLD_UNTIL_DATE'" class="field full-field">
                <span>保留截止日期 <b>*</b></span>
                <input v-model="metadata.release.holdUntil" type="date" />
              </label>
              <label class="terms-field full-field">
                <input v-model="metadata.release.termsAccepted" type="checkbox" />
                <span>我确认提交的信息与文件真实准确，并同意结构数据按所选策略公开。</span>
              </label>
            </div>
          </section>

          <div v-if="editable" class="form-actions">
            <ElButton :loading="saving" :disabled="submitting" @click="save">保存草稿</ElButton>
            <ElButton
              type="primary"
              :loading="submitting"
              :disabled="saving"
              @click="submitDialogOpen = true"
            >
              提交审校
            </ElButton>
          </div>
        </fieldset>
      </form>
    </div>

    <ElDialog v-model="submitDialogOpen" width="420" title="提交审校" class="submit-dialog">
      <p>提交后该投递将锁定，不能继续修改。确定提交 {{ deposition.code }}？</p>
      <template #footer>
        <ElButton :disabled="submitting" @click="submitDialogOpen = false">取消</ElButton>
        <ElButton type="primary" :loading="submitting" @click="submit">确认提交</ElButton>
      </template>
    </ElDialog>
  </article>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, toRaw, watch } from 'vue'
import { ElButton } from 'element-plus/es/components/button/index'
import { ElDialog } from 'element-plus/es/components/dialog/index'
import { ElOption, ElSelect } from 'element-plus/es/components/select/index'
import type {
  DepositionDetail,
  DepositionFile,
  DepositionFileKind,
  DepositionMetadata,
} from '@onedep/shared'

import 'element-plus/es/components/button/style/css'
import 'element-plus/es/components/dialog/style/css'
import 'element-plus/es/components/select/style/css'

import {
  depositionFileUrl,
  getDeposition,
  removeDepositionFile,
  saveDeposition,
  submitDeposition,
  uploadDepositionFile,
} from '@/data/depositions'
import { formatMethodLabels } from '@/data/depositionMethods'

const props = defineProps<{ deposition: DepositionDetail }>()
const emit = defineEmits<{
  back: []
  changed: [value: DepositionDetail]
}>()

const sections = [
  { id: 'files', number: '01', label: '文件' },
  { id: 'entry', number: '02', label: '条目信息' },
  { id: 'contact', number: '03', label: '联系人与引用' },
  { id: 'macromolecule', number: '04', label: '大分子' },
  { id: 'assembly', number: '05', label: '生物组装' },
  { id: 'experiment', number: '06', label: '晶体学实验' },
  { id: 'release', number: '07', label: '发布与确认' },
] as const
type SectionId = (typeof sections)[number]['id']

const metadata = ref<DepositionMetadata>(cloneMetadata(props.deposition.metadata))
const activeSection = ref<SectionId>('files')
const saving = ref(false)
const submitting = ref(false)
const uploadingKind = ref<DepositionFileKind | null>(null)
const notice = ref('')
const noticeType = ref<'success' | 'error'>('success')
const submitDialogOpen = ref(false)
const editable = computed(() => props.deposition.status === 'DRAFT')
const authorsText = computed({
  get: () => metadata.value.authors.join('\n'),
  set: (value: string) => {
    metadata.value.authors = value
      .split('\n')
      .map((author) => author.trim())
      .filter(Boolean)
  },
})

watch(
  () => props.deposition.id,
  async () => {
    metadata.value = cloneMetadata(props.deposition.metadata)
    activeSection.value = sections[0].id
    await nextTick()
    updateActiveSection()
  },
)

onMounted(() => {
  window.addEventListener('scroll', updateActiveSection, { passive: true })
  window.addEventListener('resize', updateActiveSection)
  void nextTick(updateActiveSection)
})

onBeforeUnmount(() => {
  window.removeEventListener('scroll', updateActiveSection)
  window.removeEventListener('resize', updateActiveSection)
})

// 保存完整表单快照，成功后返回投递列表。
async function save(): Promise<DepositionDetail | null> {
  if (saving.value || !editable.value) return null
  saving.value = true
  clearNotice()
  try {
    const result = await saveDeposition(props.deposition.id, metadata.value)
    applyResult(result)
    emit('back')
    return result
  } catch (cause) {
    showNotice(errorMessage(cause), 'error')
    return null
  } finally {
    saving.value = false
  }
}

// 上传后立即由服务端替换同一类别的旧文件。
async function uploadFile(kind: DepositionFileKind, event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file || uploadingKind.value) return
  uploadingKind.value = kind
  clearNotice()
  try {
    applyResult(await uploadDepositionFile(props.deposition.id, kind, file))
    showNotice('文件上传完成。')
  } catch (cause) {
    showNotice(errorMessage(cause), 'error')
  } finally {
    uploadingKind.value = null
    input.value = ''
  }
}

async function removeFile(fileId: number) {
  if (!editable.value) return
  clearNotice()
  try {
    await removeDepositionFile(props.deposition.id, fileId)
    applyResult(await getDeposition(props.deposition.id))
    showNotice('文件已删除。')
  } catch (cause) {
    showNotice(errorMessage(cause), 'error')
  }
}

// 最终提交前先保存当前输入，服务端随后执行完整性复核并锁定条目。
async function submit() {
  if (submitting.value || !editable.value) return
  submitting.value = true
  clearNotice()
  try {
    const saved = await saveDeposition(props.deposition.id, metadata.value)
    applyResult(saved)
    const result = await submitDeposition(props.deposition.id)
    applyResult(result)
    submitDialogOpen.value = false
    showNotice('投递已提交，等待审校。')
  } catch (cause) {
    submitDialogOpen.value = false
    showNotice(errorMessage(cause), 'error')
  } finally {
    submitting.value = false
  }
}

function fileOf(kind: DepositionFileKind): DepositionFile | undefined {
  return props.deposition.files.find((file) => file.kind === kind)
}

function fileUrl(fileId: number): string {
  return depositionFileUrl(props.deposition.id, fileId)
}

function goToSection(id: SectionId) {
  activeSection.value = id
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

// 根据表单区块经过顶部导航下方的位置，同步左侧当前步骤。
function updateActiveSection() {
  const sectionElements = sections
    .map((section) => document.getElementById(section.id))
    .filter((element): element is HTMLElement => element !== null)
  if (!sectionElements.length) return

  const positions = sectionElements.map((element) => element.getBoundingClientRect().top)
  if (positions.every((position) => position === 0)) return

  let current: SectionId = sections[0].id
  positions.forEach((position, index) => {
    if (position <= 112) current = sections[index]?.id ?? current
  })
  const pageHeight = document.documentElement.scrollHeight
  if (pageHeight > window.innerHeight && window.scrollY + window.innerHeight >= pageHeight - 2) {
    current = sections[sections.length - 1]!.id
  }
  activeSection.value = current
}

function applyResult(result: DepositionDetail) {
  metadata.value = cloneMetadata(result.metadata)
  emit('changed', result)
}

// 先解除 Vue 响应式代理，再复制可编辑的表单数据。
function cloneMetadata(value: DepositionMetadata): DepositionMetadata {
  return structuredClone(toRaw(value))
}

function showNotice(message: string, type: 'success' | 'error' = 'success') {
  notice.value = message
  noticeType.value = type
}

function clearNotice() {
  notice.value = ''
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : '操作失败，请稍后再试'
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
</script>

<style lang="less" scoped>
.deposition-editor {
  width: 100%;
  max-width: 1320px;
  margin: 0 auto;

  .editor-header {
    display: flex;
    min-height: 82px;
    align-items: center;
    justify-content: space-between;
    gap: 24px;
    margin-bottom: 20px;
    padding: 18px 22px;
    border: 1px solid #e1e6e2;
    border-radius: 12px;
    background: #fff;
    box-shadow: 0 6px 24px rgb(31 47 38 / 4%);

    .entry-title {
      min-width: 0;

      h1 {
        max-width: 760px;
        margin: 0;
        overflow: hidden;
        color: #17231d;
        font-size: 23px;
        font-weight: 650;
        letter-spacing: -0.035em;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
    }

    .entry-meta {
      display: flex;
      flex: none;
      align-items: center;
      gap: 10px;
      color: #66736b;
      font-size: 12px;

      .method-name {
        padding: 5px 9px;
        border-radius: 6px;
        color: #40574a;
        background: #edf2ee;
      }

      .entry-code {
        padding: 0 2px;
        font-variant-numeric: tabular-nums;
      }

      i {
        padding: 5px 9px;
        border-radius: 6px;
        color: #5b644d;
        background: #f0f0e8;
        font-style: normal;
      }
    }
  }

  .notice {
    margin: 0 0 18px;
    padding: 11px 14px;
    border: 1px solid #cfe0d5;
    border-radius: 8px;
    color: #315f49;
    background: #f4f8f5;
    font-size: 13px;

    &.error {
      border-color: #ebceca;
      color: #9d443c;
      background: #fff8f7;
    }
  }

  .editor-layout {
    display: grid;
    grid-template-columns: 190px minmax(0, 1fr);
    align-items: start;
    gap: 24px;

    .section-nav {
      display: grid;
      position: sticky;
      top: 88px;
      overflow: hidden;
      border: 1px solid #e1e6e2;
      border-radius: 10px;
      background: #fff;

      button {
        display: flex;
        min-height: 44px;
        align-items: center;
        gap: 10px;
        padding: 0 14px;
        border: 0;
        border-bottom: 1px solid #edf0ed;
        color: #657169;
        text-align: left;
        background: #fff;
        font-size: 13px;

        &:last-child {
          border-bottom: 0;
        }

        span {
          color: #a1aaa3;
          font-size: 10px;
          font-variant-numeric: tabular-nums;
        }

        &.active,
        &:hover {
          color: #254b39;
          background: #f3f6f4;
        }
      }
    }

    .editor-form {
      min-width: 0;

      fieldset {
        display: grid;
        gap: 18px;
        margin: 0;
        padding: 0;
        border: 0;
      }

      .form-section {
        scroll-margin-top: 88px;
        padding: 28px;
        border: 1px solid #e1e6e2;
        border-radius: 12px;
        background: #fff;
        box-shadow: 0 6px 24px rgb(31 47 38 / 4%);

        .section-heading {
          display: flex;
          gap: 14px;
          margin-bottom: 24px;

          > span {
            padding-top: 3px;
            color: #8b978f;
            font-size: 11px;
            font-weight: 650;
          }

          h2 {
            margin: 0;
            color: #1c2821;
            font-size: 18px;
            font-weight: 650;
          }
        }

        .file-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 14px;

          .file-card {
            min-width: 0;
            padding: 18px;
            border: 1px solid #dfe5e0;
            border-radius: 9px;
            background: #fbfcfb;

            .file-title {
              display: flex;
              align-items: center;
              justify-content: space-between;

              strong {
                color: #29342d;
                font-size: 14px;
                font-weight: 600;
              }

              span {
                color: #9b514b;
                font-size: 11px;
              }
            }

            .upload-control {
              margin-top: 16px;
              display: inline-flex;
              height: 34px;
              align-items: center;
              padding: 0 13px;
              border: 1px solid #cdd6d0;
              border-radius: 7px;
              color: #315844;
              background: #fff;
              cursor: pointer;
              font-size: 12px;
              font-weight: 550;

              input {
                position: absolute;
                width: 1px;
                height: 1px;
                opacity: 0;
              }
            }

            .uploaded-file {
              display: flex;
              min-width: 0;
              align-items: center;
              justify-content: space-between;
              gap: 12px;
              margin-top: 16px;

              div {
                display: grid;
                min-width: 0;
                gap: 3px;

                a {
                  overflow: hidden;
                  color: #28513e;
                  font-size: 13px;
                  font-weight: 550;
                  text-overflow: ellipsis;
                  white-space: nowrap;
                }

                span {
                  color: #929b94;
                  font-size: 11px;
                }
              }

              button {
                flex: none;
                padding: 0;
                border: 0;
                color: #a14c45;
                background: transparent;
                font-size: 12px;
              }
            }
          }
        }

        .field-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 18px;

          .field {
            display: grid;
            min-width: 0;
            align-content: start;
            gap: 7px;

            > span {
              display: flex;
              min-height: 18px;
              align-items: center;
              color: #49554d;
              font-size: 12px;
              font-weight: 560;

              b {
                color: #a04e47;
                font-weight: 600;
              }
            }

            input,
            textarea {
              width: 100%;
              border: 1px solid #d9dfda;
              border-radius: 7px;
              outline: none;
              color: #202a24;
              background: #fff;
              font-size: 13px;
              transition: border-color 0.15s ease;

              &:focus {
                border-color: #4d725f;
                box-shadow: 0 0 0 3px rgb(36 81 62 / 8%);
              }

              &:disabled {
                color: #68736c;
                background: #f5f7f5;
              }
            }

            input {
              height: 42px;
              padding: 0 12px;

              &::placeholder {
                color: #a3aca6;
              }
            }

            textarea {
              min-height: 76px;
              padding: 10px 11px;
              line-height: 1.6;
              resize: vertical;

              &.sequence-input {
                font-family: 'SFMono-Regular', Consolas, monospace;
                font-size: 12px;
              }
            }

            .form-select {
              width: 100%;

              :deep(.el-select__wrapper) {
                min-height: 42px;
                padding: 0 12px;
                border-radius: 7px;
                box-shadow: 0 0 0 1px #d9dfda inset;
                font-size: 13px;
                transition:
                  box-shadow 0.15s ease,
                  background-color 0.15s ease;

                &.is-focused {
                  box-shadow:
                    0 0 0 1px #4d725f inset,
                    0 0 0 3px rgb(36 81 62 / 8%);
                }

                &.is-disabled {
                  color: #68736c;
                  background: #f5f7f5;
                  box-shadow: 0 0 0 1px #d9dfda inset;
                }

                .el-select__selected-item {
                  color: #202a24;
                  font-size: 13px;
                }
              }
            }
          }

          .full-field {
            grid-column: 1 / -1;
          }

          .terms-field {
            display: flex;
            align-items: flex-start;
            gap: 10px;
            color: #4f5c53;
            font-size: 13px;
            line-height: 1.6;

            input {
              width: 16px;
              height: 16px;
              margin: 2px 0 0;
              accent-color: #24513e;
            }
          }
        }
      }

      .form-actions {
        display: flex;
        justify-content: flex-end;
        gap: 10px;
        padding: 6px 0 20px;

        :deep(.el-button) {
          min-width: 104px;
          min-height: 40px;
          padding: 0 18px;
          border-radius: 8px;
        }
      }
    }
  }
}
</style>
