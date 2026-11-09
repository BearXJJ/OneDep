<template>
  <main v-if="auth.user" class="dashboard-view onedep-workspace">
    <header class="topbar">
      <div class="brand-cell">
        <img class="brand" :src="'/onedep/images/onedep_logo.png'" :alt="t('OneDep')" />
      </div>
      <div class="topbar-main">
        <button
          v-if="isSubmitter && submitterEditing && !isSettings"
          type="button"
          class="topbar-back"
          @click="returnToDepositionList"
        >
          <span aria-hidden="true">←</span>{{ t('返回投递列表') }}
        </button>
        <span v-else class="area-name">{{ t(areaName) }}</span>
        <div class="account-info">
          <LanguageSwitch />
          <span class="account-role">{{ roleLabel ? t(roleLabel) : '' }}</span>
          <span class="account-email" :title="auth.user?.email">{{ auth.user?.email }}</span>
          <button type="button" :disabled="leaving" @click="logout">{{ t('退出') }}</button>
        </div>
      </div>
    </header>

    <p v-if="error" class="logout-error" role="alert">{{ error }}</p>

    <div class="app-layout">
      <aside class="sidebar" :aria-label="t('主导航')">
        <nav>
          <h2 class="section-heading">{{ t('Navigation') }}</h2>
          <RouterLink class="nav-link" to="/">
            <Document class="nav-icon" /><span>{{ t(navigationLabel) }}</span>
          </RouterLink>
          <RouterLink class="nav-link settings-link" to="/settings">
            <Setting class="nav-icon" /><span>{{ t('个人设置') }}</span>
          </RouterLink>
        </nav>
      </aside>

      <section class="workspace">
        <ProfileSettings v-if="isSettings" />

        <AdminUsersPanel v-else-if="isAdmin" />

        <SubmitterWorkspace
          v-else-if="isSubmitter"
          ref="submitterWorkspace"
          @view-change="submitterEditing = $event"
        />

        <ReviewerWorkspace v-else />
      </section>
    </div>
  </main>
</template>

<script setup lang="ts">
import LanguageSwitch from '@/components/LanguageSwitch.vue'
import { t } from '@/locales'
import { Document, Setting } from '@element-plus/icons-vue'
import { computed, ref } from 'vue'
import type { UserRole } from '@onedep/shared'
import { useRoute, useRouter } from 'vue-router'

import ReviewerWorkspace from '@/components/ReviewerWorkspace.vue'
import AdminUsersPanel from '@/components/AdminUsersPanel.vue'
import ProfileSettings from '@/components/ProfileSettings.vue'
import SubmitterWorkspace from '@/components/SubmitterWorkspace.vue'
import { useAuthStore } from '@/stores/auth'

const ROLE_LABELS: Record<UserRole, string> = {
  SUBMITTER: '提交员',
  REVIEWER: '审校员',
  ADMIN: '管理员',
}

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()
const leaving = ref(false)
const error = ref('')
const submitterEditing = ref(false)
const submitterWorkspace = ref<{ closeDraft: () => Promise<void> } | null>(null)
const isAdmin = computed(() => auth.user?.role === 'ADMIN')
const isSubmitter = computed(() => auth.user?.role === 'SUBMITTER')
const isSettings = computed(() => route.name === 'settings')
const roleLabel = computed(() => (auth.user ? ROLE_LABELS[auth.user.role] : ''))
const areaName = computed(() => {
  if (isSettings.value) return '个人设置'
  if (isAdmin.value) return '管理后台'
  return isSubmitter.value ? '我的投递' : '审校任务'
})
const navigationLabel = computed(() => {
  if (isAdmin.value) return '用户管理'
  return isSubmitter.value ? '我的投递' : '审校任务'
})

// 从顶部栏关闭当前草稿并返回投递列表。
function returnToDepositionList() {
  void submitterWorkspace.value?.closeDraft()
}

// 结束服务端会话后返回登录页。
async function logout() {
  leaving.value = true
  error.value = ''
  try {
    await auth.logout()
    await router.push('/login')
  } finally {
    leaving.value = false
  }
}
</script>
