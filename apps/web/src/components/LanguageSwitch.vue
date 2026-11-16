<script setup lang="ts">
import { ElSelect, ElOption } from '@/components/ui'
import { locale, setLocale } from '@/locales'
</script>
<template>
  <ElSelect
    class="language-switch"
    aria-label="界面语言 / Language"
    :model-value="locale"
    @change="setLocale"
  >
    <ElOption label="中文" value="zh" />
    <ElOption label="English" value="en" />
  </ElSelect>
</template>
<style scoped>
.language-switch {
  width: 100px;
  flex-shrink: 0;
}
</style>
