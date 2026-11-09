<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, useId } from 'vue'
import { continuousRoundedRect } from './kyantGeometry'
const props = defineProps<{ as: 'div' | 'button'; radius: number; clip: boolean }>()
const host = ref<HTMLElement>(),
  size = ref({ width: 0, height: 0 }),
  clipId = 'sa-' + useId()
const geometry = computed(() =>
  size.value.width > 0 && size.value.height > 0
    ? {
        width: size.value.width,
        height: size.value.height,
        path: continuousRoundedRect(size.value.width, size.value.height, props.radius),
      }
    : null,
)
const clipStyle = computed(() =>
  geometry.value ? { clipPath: `path("${geometry.value.path}")` } : {},
)
let observer: ResizeObserver
onMounted(() => {
  if (!host.value) throw new Error('Missing Copilot surface')
  observer = new ResizeObserver((entries) => {
    const entry = entries[0]!
    const box = entry.borderBoxSize[0]!
    size.value = { width: box.inlineSize, height: box.blockSize }
  })
  observer.observe(host.value)
})
onBeforeUnmount(() => observer.disconnect())
</script>
<template>
  <component :is="as" ref="host" data-shape="kyant-squircle" :data-squircle-radius="radius">
    <svg
      v-if="geometry"
      data-squircle-layer
      aria-hidden="true"
      :viewBox="`0 0 ${geometry.width} ${geometry.height}`"
      preserveAspectRatio="none"
    >
      <clipPath :id="clipId" clipPathUnits="userSpaceOnUse"><path :d="geometry.path" /></clipPath>
      <path data-squircle-cast :d="geometry.path" />
      <path data-squircle-paint :d="geometry.path" :clip-path="`url(#${clipId})`" />
    </svg>
    <div v-if="clip" data-squircle-clip :style="clipStyle"><slot /></div>
    <slot v-else />
    <svg
      v-if="clip && geometry"
      data-squircle-outline
      aria-hidden="true"
      :viewBox="`0 0 ${geometry.width} ${geometry.height}`"
      preserveAspectRatio="none"
    >
      <path :d="geometry.path" :clip-path="`url(#${clipId})`" />
    </svg>
  </component>
</template>
