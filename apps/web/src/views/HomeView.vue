<template>
  <main class="home-view">
    <h1>OneDep 留言演示</h1>
    <p>保存到 PostgreSQL，最近留言列表由 Redis 缓存。</p>

    <form @submit.prevent="submitMessage">
      <label for="message-content">留言内容</label>
      <input id="message-content" v-model="draft" maxlength="200" required />
      <button type="submit" :disabled="saving">{{ saving ? '保存中…' : '保存留言' }}</button>
    </form>

    <p v-if="error" role="alert">{{ error }}</p>

    <section aria-labelledby="messages-title">
      <h2 id="messages-title">最近留言</h2>
      <button type="button" :disabled="loading" @click="loadMessages">
        {{ loading ? '加载中…' : '刷新列表' }}
      </button>
      <p v-if="source">本次读取自：{{ source === 'redis' ? 'Redis 缓存' : 'PostgreSQL' }}</p>
      <p v-if="loading" role="status">正在读取留言…</p>
      <p v-else-if="messages.length === 0 && !error">还没有留言。</p>
      <ul v-else-if="messages.length > 0">
        <li v-for="message in messages" :key="message.id">{{ message.content }}</li>
      </ul>
    </section>
  </main>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import type { MessageItem, MessageListResponse } from '@onedep/shared'

const draft = ref('')
const messages = ref<MessageItem[]>([])
const source = ref<MessageListResponse['source'] | null>(null)
const loading = ref(false)
const saving = ref(false)
const error = ref('')

// Reads the latest messages through the API and shows which data source answered.
async function loadMessages() {
  loading.value = true
  error.value = ''

  try {
    const response = await fetch('/api/messages')
    if (!response.ok) throw new Error('Failed to load messages')

    const result = (await response.json()) as MessageListResponse
    messages.value = result.messages
    source.value = result.source
  } catch {
    messages.value = []
    source.value = null
    error.value = '读取失败，请确认 API、PostgreSQL 和 Redis 已启动。'
  } finally {
    loading.value = false
  }
}

// Saves a message, then reloads the list so the new database value is visible.
async function submitMessage() {
  const content = draft.value.trim()
  if (!content) return

  saving.value = true
  error.value = ''

  try {
    const response = await fetch('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    })
    if (!response.ok) throw new Error('Failed to save message')

    draft.value = ''
    await loadMessages()
  } catch {
    error.value = '保存失败，请确认 API、PostgreSQL 和 Redis 已启动。'
  } finally {
    saving.value = false
  }
}

onMounted(loadMessages)
</script>
