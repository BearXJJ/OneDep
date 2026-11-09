<template>
  <section class="submitter-workspace">
    <template v-if="!selected && !selectingMethod">
      <h1 class="section-heading">{{ t('投递记录 / Depositions') }}</h1>
      <div class="list-actions">
        <ElButton type="primary" @click="beginCreate"
          ><Plus class="nav-icon" />{{ t('新建投递') }}</ElButton
        >
      </div>

      <div v-if="loading" class="state-panel">{{ t('正在加载投递记录…') }}</div>
      <div v-else-if="error" class="state-panel error-state">
        <span>{{ error }}</span>
        <ElButton text @click="loadList">{{ t('重新加载') }}</ElButton>
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
        <h2>{{ t('还没有投递') }}</h2>
        <ElButton type="primary" @click="beginCreate">{{ t('创建第一个投递') }}</ElButton>
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
            <span class="submission-title">{{ item.title }}</span>
            <small>{{ item.code }}{{ t('· 更新于') }}{{ formatDate(item.updatedAt) }}</small>
          </span>
          <span class="status-badge" :class="{ submitted: item.status === 'SUBMITTED' }">
            {{ item.status === 'SUBMITTED' ? t('已提交') : t('草稿') }}
          </span>
          <span class="row-arrow" aria-hidden="true">›</span>
        </button>
      </div>
    </template>

    <p v-if="selectingMethod && error" role="alert" class="state-panel error-state">{{ error }}</p>

    <DepositionMethodSelector
      v-if="selectingMethod"
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
import { t, localeTag } from '@/locales'
import { Plus } from '@element-plus/icons-vue'
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
  } finally {
    creating.value = false
  }
}

async function openDraft(id: number) {
  loading.value = true
  error.value = ''
  try {
    selected.value = await getDeposition(id)
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
  return new Intl.DateTimeFormat(localeTag(), {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}
</script>
