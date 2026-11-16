<script setup lang="ts">
import { ElScrollbar } from 'element-plus/es/components/scrollbar/index'
import 'element-plus/es/components/scrollbar/style/css'
defineOptions({ inheritAttrs: false })
</script>
<template>
  <ElScrollbar v-bind="$attrs" class="app-scrollbar"><slot /></ElScrollbar>
</template>
<style scoped>
.app-scrollbar {
  min-width: 0;
  min-height: 0;
}
</style>
