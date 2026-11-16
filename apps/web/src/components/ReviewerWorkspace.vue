<script setup lang="ts">
import AppButton from '@/components/ui/AppButton.vue'
import { t } from '@/locales'
import { ref, onMounted } from 'vue'
import type { ReviewEntry } from '@onedep/shared'
import CommunicationPanel from './CommunicationPanel.vue'
import { httpError } from '@/data/http-error'
const entries = ref<ReviewEntry[]>([]),
  selected = ref<ReviewEntry | null>(null)
async function refresh() {
  const response = await fetch('/api/communication')
  if (!response.ok) throw await httpError(response)
  entries.value = await response.json()
}
async function back() {
  await refresh()
  selected.value = null
}
onMounted(refresh)
</script>
<template>
  <section class="reviewer-workspace">
    <template v-if="selected"
      ><AppButton @click="back">{{ t('Back to review queue') }}</AppButton>
      <h2>{{ selected.code }} · {{ selected.method }}</h2>
      <CommunicationPanel :key="selected.id" :deposition-id="selected.id" /></template
    ><template v-else
      ><h2 class="section-heading">{{ t('Review communication') }}</h2>
      <AppButton @click="refresh">{{ t('Refresh') }}</AppButton>
      <p v-if="!entries.length">{{ t('No submissions or messages.') }}</p>
      <div v-for="entry in entries" :key="entry.id" class="review-entry">
        <AppButton @click="selected = entry">
          {{ entry.code }} · {{ entry.method }} ·
          {{ entry.status === 'SUBMITTED' ? t('Submitted') : t('Draft') }}
        </AppButton>
        <p v-for="message in entry.messages" :key="message.id">
          {{ message.subject }} — {{ message.body }}
        </p>
      </div></template
    >
  </section>
</template>
<style scoped>
.review-entry {
  border-bottom: 1px solid #cad5cb;
  padding: 10px 0;
}
.review-entry p {
  white-space: pre-wrap;
}
</style>
