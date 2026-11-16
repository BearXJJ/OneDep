<script setup lang="ts">
import { nextTick, ref } from 'vue'
import {
  ElUpload,
  type UploadProgressEvent,
  type UploadRawFile,
} from 'element-plus/es/components/upload/index'
import { ElProgress } from 'element-plus/es/components/progress/index'
import { ElMessage } from 'element-plus/es/components/message/index'
import 'element-plus/es/components/upload/style/css'
import 'element-plus/es/components/progress/style/css'
import 'element-plus/es/components/message/style/css'
import AppButton from './AppButton.vue'
import { t } from '@/locales'
const props = defineProps<{
  accept: string
  disabled: boolean
  label: string
  replace: boolean
  prepare: () => Promise<string>
}>()
const emit = defineEmits<{ busy: [value: boolean]; uploaded: [response: unknown] }>()
const action = ref(''),
  filename = ref(''),
  active = ref(false),
  percent = ref(0),
  transferred = ref(false)
function failed(error: Error & { status?: number }) {
  active.value = false
  emit('busy', false)
  ElMessage.error({
    message: error.status === 413 ? t('The file exceeds the server upload limit.') : error.message,
    duration: 0,
    showClose: true,
  })
}
async function beforeUpload(file: UploadRawFile) {
  if (props.disabled) return false
  emit('busy', true)
  return props.prepare().then(
    async (url) => {
      action.value = url
      filename.value = file.name
      percent.value = 0
      transferred.value = false
      active.value = true
      await nextTick()
      return true
    },
    (error: Error) => {
      failed(error)
      return false
    },
  )
}
function progress(event: UploadProgressEvent) {
  percent.value = Math.floor(event.percent)
  transferred.value = event.lengthComputable && event.loaded === event.total
}
function succeeded(response: unknown) {
  active.value = false
  emit('busy', false)
  emit('uploaded', response)
}
</script>
<template>
  <div class="app-file-upload">
    <ElUpload
      :action="action"
      :accept="accept"
      :disabled="disabled"
      :aria-label="label"
      :show-file-list="false"
      drag
      :before-upload="beforeUpload"
      :on-progress="progress"
      :on-success="succeeded"
      :on-error="failed"
    >
      <span>{{ t('Drag a file here or choose a file') }}</span>
      <AppButton :disabled="disabled">{{ replace ? t('Replace') : t('Upload') }}</AppButton>
    </ElUpload>
    <div class="transfer-status">
      <template v-if="active">
        <span role="status"
          >{{ filename }} ·
          {{ transferred ? t('Upload complete; waiting for parsing result…') : t('Uploading…')
          }}<template v-if="!transferred"> {{ percent }}%</template></span
        >
        <ElProgress :percentage="percent" :show-text="false" :stroke-width="4" />
      </template>
    </div>
  </div>
</template>
<style scoped>
.app-file-upload {
  width: 100%;
  min-width: 0;
}
:deep(.el-upload-dragger) {
  padding: 8px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.transfer-status {
  height: 30px;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
.transfer-status > span {
  display: block;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
</style>
