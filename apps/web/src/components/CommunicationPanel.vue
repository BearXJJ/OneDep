<script setup lang="ts">
import { t, localeTag } from '@/locales'
import { ref, onMounted } from 'vue'
import type { CommunicationMessage } from '@onedep/shared'
import { httpError } from '@/data/http-error'
const props = defineProps<{ depositionId: number }>()
const messages = ref<CommunicationMessage[]>([]),
  subject = ref(''),
  body = ref(''),
  pending = ref(false)
async function refresh() {
  const response = await fetch(`/api/communication/${props.depositionId}`)
  if (!response.ok) throw await httpError(response)
  messages.value = await response.json()
}
async function send() {
  if (pending.value) return
  pending.value = true
  try {
    const response = await fetch(`/api/communication/${props.depositionId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subject: subject.value, body: body.value }),
    })
    if (!response.ok) throw await httpError(response)
    body.value = ''
    await refresh()
  } finally {
    pending.value = false
  }
}
onMounted(refresh)
</script>
<template>
  <section class="communication-panel">
    <button @click="refresh">{{ t('Refresh messages') }}</button>
    <article v-for="message in messages" :key="message.id" class="message">
      <header>
        {{ message.subject }} ·
        {{ message.author.name === null ? message.author.email : message.author.name }} ·
        {{ t(message.author.role) }} · {{ new Date(message.createdAt).toLocaleString(localeTag()) }}
      </header>
      <p>{{ message.body }}</p>
    </article>
    <p v-if="!messages.length">{{ t('No messages.') }}</p>
    <form @submit.prevent="send">
      <label>{{ t('Subject') }}<input v-model="subject" required /></label
      ><label>{{ t('Message') }}<textarea v-model="body" required rows="5" /></label
      ><button :disabled="pending || !subject.trim() || !body.trim()">
        {{ t('Send message') }}
      </button>
    </form>
  </section>
</template>
<style scoped>
.communication-panel {
  display: grid;
  gap: 10px;
}
.message {
  border-bottom: 1px solid #cad5cb;
  padding: 8px 0;
}
.message header {
  font-size: 12px;
  color: #53665a;
}
.message p {
  white-space: pre-wrap;
}
.communication-panel form,
.communication-panel label {
  display: grid;
  gap: 5px;
}
.communication-panel textarea {
  font: inherit;
  padding: 5px;
  border: 1px solid #b7c3b9;
}
.communication-panel button {
  justify-self: start;
}
</style>
