<template>
  <section class="method-selector">
    <header class="selector-heading">
      <h1>选择实验方法</h1>
      <span>可多选</span>
    </header>

    <div class="method-grid" aria-label="实验方法">
      <button
        v-for="method in DEPOSITION_METHODS"
        :key="method.value"
        type="button"
        class="method-card"
        :class="{ selected: selectedMethods.includes(method.value) }"
        :aria-pressed="selectedMethods.includes(method.value)"
        @click="toggleMethod(method.value)"
      >
        <span class="method-check" aria-hidden="true">
          {{ selectedMethods.includes(method.value) ? '✓' : '' }}
        </span>
        <strong>{{ method.label }}</strong>
        <span class="method-code">{{ method.code }}</span>
      </button>
    </div>

    <div v-if="selectedMethods.length" class="configuration">
      <section v-if="hasEm" class="question-block">
        <h2>电子显微镜类型</h2>
        <div class="choice-grid">
          <button
            v-for="option in emSubtypeOptions"
            :key="option.value"
            type="button"
            class="choice"
            :class="{ selected: emSubtype === option.value }"
            @click="selectEmSubtype(option.value)"
          >
            {{ option.label }}
          </button>
        </div>
      </section>

      <section v-if="showCoordinateQuestion" class="question-block">
        <h2>本次投递是否包含坐标？</h2>
        <div class="choice-grid two-columns">
          <button
            type="button"
            class="choice"
            :class="{ selected: coordinates === true }"
            @click="selectCoordinates(true)"
          >
            是
          </button>
          <button
            type="button"
            class="choice"
            :class="{ selected: coordinates === false }"
            @click="selectCoordinates(false)"
          >
            否，仅提交实验数据
          </button>
        </div>
      </section>

      <section v-if="showMapQuestion" class="question-block">
        <h2>与本次投递关联的 EMDB 地图</h2>
        <div class="choice-grid" :class="{ 'three-columns': hasEc }">
          <button
            type="button"
            class="choice"
            :class="{ selected: emMapStatus === 'NEW_MAP' }"
            @click="selectMapStatus('NEW_MAP')"
          >
            提交新地图
          </button>
          <button
            v-if="hasEc"
            type="button"
            class="choice"
            :class="{ selected: emMapStatus === 'STRUCTURE_FACTORS_ONLY' }"
            @click="selectMapStatus('STRUCTURE_FACTORS_ONLY')"
          >
            仅提交结构因子
          </button>
          <button
            type="button"
            class="choice"
            :class="{ selected: emMapStatus === 'PREVIOUS' }"
            @click="selectMapStatus('PREVIOUS')"
          >
            地图已投递
          </button>
        </div>
      </section>

      <section v-if="effectiveMapStatus === 'PREVIOUS'" class="question-block compact">
        <label class="text-field">
          <span>关联 EMDB 编号</span>
          <input v-model.trim="relatedEmdb" type="text" placeholder="EMD-1234" />
        </label>
      </section>

      <section v-if="needsCompositeQuestion" class="question-block">
        <h2>是否为复合地图投递？</h2>
        <div class="choice-grid two-columns">
          <button
            type="button"
            class="choice"
            :class="{ selected: compositeMap === true }"
            @click="selectCompositeMap(true)"
          >
            是
          </button>
          <button
            type="button"
            class="choice"
            :class="{ selected: compositeMap === false }"
            @click="selectCompositeMap(false)"
          >
            否
          </button>
        </div>
      </section>

      <section v-if="showNmrDataQuestion" class="question-block">
        <h2>NMR 实验数据是否已投递至 BMRB？</h2>
        <div class="choice-grid two-columns">
          <button
            type="button"
            class="choice"
            :class="{ selected: nmrDataPreviouslyDeposited === true }"
            @click="selectPreviousNmrData(true)"
          >
            是
          </button>
          <button
            type="button"
            class="choice"
            :class="{ selected: nmrDataPreviouslyDeposited === false }"
            @click="selectPreviousNmrData(false)"
          >
            否
          </button>
        </div>
      </section>

      <section
        v-if="nmrDataPreviouslyDeposited === true && showNmrDataQuestion"
        class="question-block compact"
      >
        <label class="text-field">
          <span>关联 BMRB 编号</span>
          <input v-model.trim="relatedBmrb" type="text" inputmode="numeric" placeholder="12345" />
        </label>
      </section>

      <section v-if="accessionCodes.length" class="accession-summary">
        <span>将申请编号</span>
        <strong v-for="code in accessionCodes" :key="code">{{ code }}</strong>
      </section>
    </div>

    <p v-if="error" class="selector-error" role="alert">{{ error }}</p>

    <div class="selector-actions">
      <ElButton
        type="primary"
        :loading="submitting"
        :disabled="!selectedMethods.length"
        @click="confirmSelection"
      >
        创建投递
      </ElButton>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { ElButton } from 'element-plus/es/components/button/index'
import type {
  AccessionCode,
  DepositionCreationOptions,
  DepositionMethod,
  EmMapStatus,
  EmSubtype,
} from '@onedep/shared'

import 'element-plus/es/components/button/style/css'

import { DEPOSITION_METHODS } from '@/data/depositionMethods'

defineProps<{ submitting: boolean }>()
const emit = defineEmits<{ confirm: [options: DepositionCreationOptions] }>()

const emSubtypeOptions: { value: EmSubtype; label: string }[] = [
  { value: 'HELICAL', label: '螺旋重构' },
  { value: 'SINGLE_PARTICLE', label: '单颗粒分析' },
  { value: 'SUBTOMOGRAM', label: '亚断层平均' },
  { value: 'TOMOGRAPHY', label: '电子断层成像' },
]

const selectedMethods = ref<DepositionMethod[]>([])
const emSubtype = ref<EmSubtype | null>(null)
const coordinates = ref<boolean | null>(null)
const emMapStatus = ref<EmMapStatus | null>(null)
const relatedEmdb = ref('')
const compositeMap = ref<boolean | null>(null)
const nmrDataPreviouslyDeposited = ref<boolean | null>(null)
const relatedBmrb = ref('')
const error = ref('')

const hasEm = computed(() => selectedMethods.value.includes('EM'))
const hasEc = computed(() => selectedMethods.value.includes('EC'))
const hasNmr = computed(
  () => selectedMethods.value.includes('NMR') || selectedMethods.value.includes('SSNMR'),
)
const needsCoordinateQuestion = computed(() => hasEm.value || hasNmr.value)
const showCoordinateQuestion = computed(
  () => needsCoordinateQuestion.value && emSubtype.value !== 'TOMOGRAPHY',
)
const effectiveCoordinates = computed<boolean | null>(() => {
  if (hasEm.value && emSubtype.value === 'TOMOGRAPHY') {
    return hasNmr.value && (hasEm.value || hasEc.value) ? true : false
  }
  return needsCoordinateQuestion.value ? coordinates.value : null
})
const showMapQuestion = computed(() => hasEm.value && effectiveCoordinates.value === true)
const effectiveMapStatus = computed<EmMapStatus | null>(() => {
  if (!hasEm.value) return null
  if (showMapQuestion.value) return emMapStatus.value
  return hasEm.value ? 'NEW_MAP' : null
})
const needsCompositeQuestion = computed(
  () =>
    hasEm.value &&
    effectiveMapStatus.value === 'NEW_MAP' &&
    (emSubtype.value === 'SINGLE_PARTICLE' || emSubtype.value === 'SUBTOMOGRAM'),
)
const showNmrDataQuestion = computed(() => hasNmr.value && effectiveCoordinates.value === true)
const accessionCodes = computed(() => calculateAccessionCodes())

// 允许按 OneDep 规则组合多种实验方法，并清理已经失效的条件答案。
function toggleMethod(method: DepositionMethod) {
  const selected = selectedMethods.value.includes(method)
  selectedMethods.value = DEPOSITION_METHODS.map((option) => option.value).filter((value) =>
    selected
      ? selectedMethods.value.includes(value) && value !== method
      : selectedMethods.value.includes(value) || value === method,
  )
  const methodProvidesCoordinates = selectedMethods.value.some((value) =>
    ['XRAY', 'NEUTRON', 'FIBER', 'EC'].includes(value),
  )
  if (needsCoordinateQuestion.value && coordinates.value === null && methodProvidesCoordinates) {
    coordinates.value = true
  }
  if (hasNmr.value && (hasEm.value || hasEc.value)) coordinates.value = true
  normalizeAnswers()
  error.value = ''
}

// 电子断层成像不提交坐标，选中后立即同步这一约束。
function selectEmSubtype(value: EmSubtype) {
  emSubtype.value = value
  if (value === 'TOMOGRAPHY') {
    coordinates.value = hasNmr.value && (hasEm.value || hasEc.value) ? true : false
  }
  normalizeAnswers()
  error.value = ''
}

function selectCoordinates(value: boolean) {
  coordinates.value = value
  normalizeAnswers()
  error.value = ''
}

function selectMapStatus(value: EmMapStatus) {
  emMapStatus.value = value
  normalizeAnswers()
  error.value = ''
}

function selectCompositeMap(value: boolean) {
  compositeMap.value = value
  error.value = ''
}

function selectPreviousNmrData(value: boolean) {
  nmrDataPreviouslyDeposited.value = value
  normalizeAnswers()
  error.value = ''
}

// 删除因方法或上游答案变化而不再适用的数据。
function normalizeAnswers() {
  if (!hasEm.value) emSubtype.value = null
  if (!needsCoordinateQuestion.value) coordinates.value = null
  if (!showMapQuestion.value) {
    emMapStatus.value = null
    relatedEmdb.value = ''
  } else if (!hasEc.value && emMapStatus.value === 'STRUCTURE_FACTORS_ONLY') {
    emMapStatus.value = null
  }
  if (effectiveMapStatus.value !== 'PREVIOUS') relatedEmdb.value = ''
  if (needsCompositeQuestion.value && compositeMap.value === null) compositeMap.value = false
  if (!needsCompositeQuestion.value) compositeMap.value = null
  if (!showNmrDataQuestion.value) {
    nmrDataPreviouslyDeposited.value = null
    relatedBmrb.value = ''
  } else if (nmrDataPreviouslyDeposited.value !== true) {
    relatedBmrb.value = ''
  }
}

// 校验当前条件分支并把完整创建参数交给父组件。
function confirmSelection() {
  normalizeAnswers()
  const message = validateSelection()
  if (message) {
    error.value = message
    return
  }
  error.value = ''
  emit('confirm', buildOptions())
}

// 创建页只校验与方法选择有关的必填项，服务端会执行同一套最终校验。
function validateSelection(): string {
  if (!selectedMethods.value.length) return '请至少选择一种实验方法'
  if (hasEm.value && !emSubtype.value) return '请选择电子显微镜类型'
  if (showCoordinateQuestion.value && effectiveCoordinates.value === null) {
    return '请选择本次投递是否包含坐标'
  }
  if (hasNmr.value && (hasEm.value || hasEc.value) && effectiveCoordinates.value === false) {
    return 'EM 或电子晶体学与 NMR 联合投递必须包含坐标'
  }
  if (showMapQuestion.value && !effectiveMapStatus.value) return '请选择关联地图的投递状态'
  if (effectiveMapStatus.value === 'PREVIOUS' && !/^EMD-\d{4,}$/i.test(relatedEmdb.value)) {
    return '请输入正确的 EMDB 编号，例如 EMD-1234'
  }
  if (needsCompositeQuestion.value && compositeMap.value === null) {
    return '请选择是否为复合地图投递'
  }
  if (showNmrDataQuestion.value && nmrDataPreviouslyDeposited.value === null) {
    return '请选择 NMR 实验数据是否已投递'
  }
  if (
    showNmrDataQuestion.value &&
    nmrDataPreviouslyDeposited.value === true &&
    !/^\d{1,5}$/.test(relatedBmrb.value)
  ) {
    return '请输入 1 至 5 位 BMRB 编号'
  }
  if (accessionCodes.value.length === 1 && accessionCodes.value[0] === 'BMRB') {
    return '仅提交 NMR 实验数据时，请使用 BMRB 投递系统'
  }
  return ''
}

function buildOptions(): DepositionCreationOptions {
  const nmrPreviouslyDeposited = hasNmr.value
    ? effectiveCoordinates.value === true
      ? nmrDataPreviouslyDeposited.value
      : false
    : null
  return {
    methods: [...selectedMethods.value],
    emSubtype: hasEm.value ? emSubtype.value : null,
    coordinates: needsCoordinateQuestion.value ? effectiveCoordinates.value : null,
    emMapStatus: effectiveMapStatus.value,
    relatedEmdb: effectiveMapStatus.value === 'PREVIOUS' ? relatedEmdb.value.toUpperCase() : '',
    compositeMap: needsCompositeQuestion.value ? compositeMap.value : null,
    nmrDataPreviouslyDeposited: nmrPreviouslyDeposited,
    relatedBmrb: nmrPreviouslyDeposited === true ? relatedBmrb.value : '',
    accessionCodes: accessionCodes.value,
  }
}

// 根据当前分支显示将由 OneDep 申请的数据库编号。
function calculateAccessionCodes(): AccessionCode[] {
  const codes: AccessionCode[] = []
  const methodProvidesCoordinates = selectedMethods.value.some((method) =>
    ['XRAY', 'NEUTRON', 'FIBER', 'EC'].includes(method),
  )
  if (methodProvidesCoordinates || effectiveCoordinates.value === true) codes.push('PDB')
  if (
    hasEm.value &&
    effectiveMapStatus.value !== 'PREVIOUS' &&
    effectiveMapStatus.value !== 'STRUCTURE_FACTORS_ONLY'
  ) {
    codes.push('EMDB')
  }
  if (hasNmr.value && !(showNmrDataQuestion.value && nmrDataPreviouslyDeposited.value === true)) {
    codes.push('BMRB')
  }
  return codes
}
</script>

<style lang="less" scoped>
.method-selector {
  width: 100%;
  max-width: 1120px;
  margin: 0 auto;

  .selector-heading {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 20px;

    h1 {
      margin: 0;
      color: #17231d;
      font-size: 24px;
      font-weight: 650;
      letter-spacing: -0.04em;
    }

    span {
      padding: 4px 7px;
      border-radius: 5px;
      color: #637168;
      background: #edf1ee;
      font-size: 11px;
    }
  }

  .method-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;

    .method-card {
      display: grid;
      min-height: 78px;
      grid-template-columns: 22px minmax(0, 1fr) auto;
      align-items: center;
      gap: 12px;
      padding: 16px 18px;
      border: 1px solid #dfe5e0;
      border-radius: 10px;
      color: #27342d;
      text-align: left;
      background: #fff;
      cursor: pointer;
      transition:
        border-color 0.15s ease,
        box-shadow 0.15s ease,
        background-color 0.15s ease;

      &:hover {
        border-color: #91a99b;
      }

      &.selected {
        border-color: #47705c;
        background: #f5f8f6;
        box-shadow: 0 0 0 1px #47705c inset;

        .method-check {
          border-color: #47705c;
          color: #fff;
          background: #47705c;
        }
      }

      .method-check {
        display: grid;
        width: 18px;
        height: 18px;
        place-items: center;
        border: 1px solid #b8c2bc;
        border-radius: 4px;
        font-size: 12px;
      }

      strong {
        font-size: 14px;
        font-weight: 620;
      }

      .method-code {
        color: #79857e;
        font-size: 11px;
        font-weight: 650;
        letter-spacing: 0.04em;
      }
    }
  }

  .configuration {
    display: grid;
    gap: 1px;
    margin-top: 22px;
    overflow: hidden;
    border: 1px solid #dfe5e0;
    border-radius: 11px;
    background: #e8ece9;

    .question-block {
      display: grid;
      grid-template-columns: minmax(210px, 0.7fr) minmax(380px, 1.3fr);
      align-items: center;
      gap: 24px;
      padding: 20px;
      background: #fff;

      &.compact {
        grid-template-columns: minmax(0, 1fr);
      }

      h2 {
        margin: 0;
        color: #26332c;
        font-size: 14px;
        font-weight: 620;
      }

      .choice-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px;

        &.three-columns {
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }

        .choice {
          min-height: 40px;
          padding: 8px 12px;
          border: 1px solid #d9dfdb;
          border-radius: 7px;
          color: #4c5951;
          background: #fff;
          font-size: 13px;
          cursor: pointer;

          &:hover {
            border-color: #91a99b;
          }

          &.selected {
            border-color: #47705c;
            color: #2f5743;
            background: #edf4f0;
            box-shadow: 0 0 0 1px #47705c inset;
          }
        }
      }

      .text-field {
        display: grid;
        max-width: 520px;
        gap: 8px;

        span {
          color: #26332c;
          font-size: 13px;
          font-weight: 600;
        }

        input {
          height: 40px;
          padding: 0 12px;
          border: 1px solid #d9dfdb;
          border-radius: 7px;
          outline: none;
          color: #27342d;
          background: #fff;
          font: inherit;

          &:focus {
            border-color: #47705c;
            box-shadow: 0 0 0 2px rgb(71 112 92 / 10%);
          }
        }
      }
    }

    .accession-summary {
      display: flex;
      min-height: 58px;
      align-items: center;
      gap: 8px;
      padding: 12px 20px;
      background: #f7f9f7;

      span {
        margin-right: 4px;
        color: #68756d;
        font-size: 12px;
      }

      strong {
        padding: 5px 9px;
        border-radius: 6px;
        color: #315f49;
        background: #e4eee8;
        font-size: 11px;
        letter-spacing: 0.04em;
      }
    }
  }

  .selector-error {
    margin: 14px 0 0;
    color: #a3473f;
    font-size: 13px;
  }

  .selector-actions {
    display: flex;
    justify-content: flex-end;
    margin-top: 22px;

    :deep(.el-button) {
      min-width: 112px;
      min-height: 40px;
      border-radius: 8px;
    }
  }
}
</style>
