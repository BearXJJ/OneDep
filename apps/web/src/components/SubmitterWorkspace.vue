<template>
  <section class="submitter-workspace">
    <template v-if="!selected && !selectingMethod">
      <div class="list-actions">
        <ElButton type="primary" @click="beginCreate">新建投递</ElButton>
      </div>

      <div v-if="loading" class="state-panel">正在加载投递记录…</div>
      <div v-else-if="error" class="state-panel error-state">
        <span>{{ error }}</span>
        <ElButton text @click="loadList">重新加载</ElButton>
      </div>
      <div v-else-if="!items.length" class="empty-panel">
        <svg viewBox="0 0 48 48" fill="none" aria-hidden="true">
          <path d="M14 7.5h20v33H14z" stroke="currentColor" stroke-width="1.7" />
          <path
            d="M19 17h10M19 23h10M19 29h7"
            stroke="currentColor"
            stroke-width="1.7"
            stroke-linecap="round"
          />
        </svg>
        <h2>还没有投递</h2>
        <ElButton type="primary" @click="beginCreate">创建第一个投递</ElButton>
      </div>
      <div v-else class="submission-list">
        <button
          v-for="item in items"
          :key="item.id"
          type="button"
          class="submission-row"
          @click="openDraft(item.id)"
        >
          <span class="submission-main">
            <strong>{{ item.title || '未命名条目' }}</strong>
            <small>{{ item.code }} · 更新于 {{ formatDate(item.updatedAt) }}</small>
          </span>
          <span class="status-badge" :class="{ submitted: item.status === 'SUBMITTED' }">
            {{ item.status === 'SUBMITTED' ? '已提交' : '草稿' }}
          </span>
          <span class="row-arrow" aria-hidden="true">›</span>
        </button>
      </div>
    </template>

    <DepositionMethodSelector
      v-else-if="selectingMethod"
      :submitting="creating"
      @confirm="createDraft"
    />

    <DepositionEditor
      v-else-if="selected"
      :deposition="selected"
      @back="closeDraft"
      @changed="replaceSelected"
    />
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ElButton } from 'element-plus/es/components/button/index'
import type { DepositionCreationOptions, DepositionDetail, DepositionSummary } from '@onedep/shared'

import 'element-plus/es/components/button/style/css'

import DepositionEditor from '@/components/DepositionEditor.vue'
import DepositionMethodSelector from '@/components/DepositionMethodSelector.vue'
import { createDeposition, getDeposition, listDepositions } from '@/data/depositions'

const items = ref<DepositionSummary[]>([])
const selected = ref<DepositionDetail | null>(null)
const selectingMethod = ref(false)
const loading = ref(false)
const creating = ref(false)
const error = ref('')
const emit = defineEmits<{ viewChange: [editing: boolean] }>()
const inDetailView = computed(() => selectingMethod.value || selected.value !== null)

defineExpose({ closeDraft })

watch(inDetailView, (value) => emit('viewChange', value), { immediate: true })

onMounted(loadList)

// 获取当前提交员的投递记录。
async function loadList() {
  loading.value = true
  error.value = ''
  try {
    items.value = await listDepositions()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '投递记录加载失败'
  } finally {
    loading.value = false
  }
}

function beginCreate() {
  selectingMethod.value = true
  error.value = ''
}

// 根据选定的实验方法创建草稿并进入填写页面。
async function createDraft(options: DepositionCreationOptions) {
  if (creating.value) return
  creating.value = true
  error.value = ''
  try {
    selected.value = await createDeposition(options)
    selectingMethod.value = false
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '新建投递失败'
  } finally {
    creating.value = false
  }
}

async function openDraft(id: number) {
  loading.value = true
  error.value = ''
  try {
    selected.value = await getDeposition(id)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '投递加载失败'
  } finally {
    loading.value = false
  }
}

async function closeDraft() {
  selected.value = null
  selectingMethod.value = false
  await loadList()
}

function replaceSelected(value: DepositionDetail) {
  selected.value = value
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}
</script>

<style lang="less" scoped>
.submitter-workspace {
  width: 100%;
  max-width: 1320px;
  margin: 0 auto;

  .list-actions {
    display: flex;
    justify-content: flex-start;
    margin-bottom: 24px;
  }

  .state-panel,
  .empty-panel,
  .submission-list {
    border: 1px solid #e2e7e3;
    border-radius: 12px;
    background: #fff;
    box-shadow: 0 8px 28px rgb(31 47 38 / 5%);
  }

  .state-panel {
    display: flex;
    min-height: 220px;
    align-items: center;
    justify-content: center;
    gap: 12px;
    color: #748078;
    font-size: 14px;

    &.error-state {
      color: #a3473f;
    }
  }

  .empty-panel {
    display: flex;
    min-height: 320px;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;

    svg {
      width: 44px;
      color: #87958c;
    }

    h2 {
      margin: 0;
      color: #536058;
      font-size: 15px;
      font-weight: 560;
    }
  }

  .submission-list {
    overflow: hidden;

    .submission-row {
      display: grid;
      width: 100%;
      min-height: 84px;
      grid-template-columns: minmax(240px, 1fr) 68px 18px;
      align-items: center;
      gap: 20px;
      padding: 14px 22px;
      border: 0;
      border-bottom: 1px solid #edf0ed;
      text-align: left;
      background: #fff;

      &:last-child {
        border-bottom: 0;
      }

      &:hover {
        background: #fafcfb;
      }

      .submission-main {
        display: grid;
        min-width: 0;
        gap: 5px;

        strong,
        small {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        strong {
          color: #202a24;
          font-size: 14px;
          font-weight: 600;
        }

        small {
          color: #8a948d;
          font-size: 12px;
        }
      }

      .status-badge {
        color: #786c4b;
        font-size: 12px;

        &.submitted {
          color: #315f49;
        }
      }

      .row-arrow {
        color: #9da69f;
        font-size: 22px;
      }
    }
  }
}
</style>
