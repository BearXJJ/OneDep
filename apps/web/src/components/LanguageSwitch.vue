<script setup lang="ts">
import { locale, setLocale, type Locale } from '@/locales'
function change(event: Event) {
  setLocale((event.target as HTMLSelectElement).value as Locale)
}
</script>
<template>
  <select class="language-switch" aria-label="界面语言 / Language" :value="locale" @change="change">
    <option value="zh">中文</option>
    <option value="en">English</option>
  </select>
</template>
<style scoped>
.language-switch {
  font: inherit;
  border: 1px solid #b7c3b9;
  border-radius: 3px;
  background: #fff;
  color: #164c68;
  padding: 3px 6px;
  flex-shrink: 0;
}
</style>
