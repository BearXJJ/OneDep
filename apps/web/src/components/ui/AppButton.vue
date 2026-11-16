<script setup lang="ts">
import { ElButton } from 'element-plus/es/components/button/index'
import 'element-plus/es/components/button/style/css'
defineOptions({ inheritAttrs: false })
</script>
<template>
  <ElButton v-bind="$attrs" class="app-button">
    <template v-for="(_, name) in $slots" #[name]="scope"
      ><slot :name="name" v-bind="scope"
    /></template>
  </ElButton>
</template>
<style scoped>
.app-button :deep(> span) {
  gap: 4px;
}
.app-button + .app-button {
  margin-left: 0;
}
</style>
