<script setup lang="ts">
import { ElTree } from 'element-plus'
import 'element-plus/es/components/tree/style/css'
import { FolderOpened, Folder, Check, WarningFilled, CaretRight } from '@element-plus/icons-vue'
import type { DepositionNavItem } from '@/data/deposition-navigation'
defineProps<{ items: DepositionNavItem[]; current: string }>()
const emit = defineEmits<{ select: [item: DepositionNavItem] }>()
</script>
<template>
  <el-tree
    class="deposition-tree"
    :data="items"
    node-key="id"
    :current-node-key="current"
    default-expand-all
    highlight-current
    :expand-on-click-node="false"
    :props="{ label: 'title', children: 'children' }"
    @node-click="(item: DepositionNavItem) => (item.children ? undefined : emit('select', item))"
  >
    <template #default="{ node, data }">
      <span class="tree-item" :class="{ 'outside-demo': data.extra }" :title="data.title">
        <component
          :is="
            node.isLeaf
              ? data.state === 'complete'
                ? Check
                : data.state === 'missing'
                  ? WarningFilled
                  : CaretRight
              : node.expanded
                ? FolderOpened
                : Folder
          "
          class="tree-status"
          :class="data.state"
        />
        <span>{{ data.title }}</span>
      </span>
    </template>
  </el-tree>
</template>
