<script setup lang="ts">
import { ElConfigProvider } from 'element-plus/es/components/config-provider/index'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import en from 'element-plus/es/locale/lang/en'
import { locale } from '@/locales'
</script>
<template>
  <ElConfigProvider :locale="locale === 'zh' ? zhCn : en"><RouterView /></ElConfigProvider>
</template>
