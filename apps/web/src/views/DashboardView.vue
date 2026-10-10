<template>
  <main class="dashboard-view">
    <header class="topbar">
      <div class="brand-cell">
        <span class="brand">OneDep<span>.</span></span>
      </div>
      <div class="topbar-main">
        <button
          v-if="isSubmitter && submitterEditing"
          type="button"
          class="topbar-back"
          @click="returnToDepositionList"
        >
          <span aria-hidden="true">←</span> 返回投递列表
        </button>
        <span v-else class="area-name">{{ areaName }}</span>
        <div class="account-info">
          <span class="account-role">{{ roleLabel }}</span>
          <span class="account-email" :title="auth.user?.email">{{ auth.user?.email }}</span>
          <button type="button" :disabled="leaving" @click="logout">退出</button>
        </div>
      </div>
    </header>

    <p v-if="error" class="logout-error" role="alert">{{ error }}</p>

    <div class="app-layout">
      <aside class="sidebar" aria-label="主导航">
        <nav>
          <RouterLink class="nav-link" to="/">
            <svg v-if="isAdmin" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <circle cx="10" cy="6.5" r="3" stroke="currentColor" stroke-width="1.5" />
              <path
                d="M4.5 16c.3-2.8 2.4-4.5 5.5-4.5s5.2 1.7 5.5 4.5"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
              />
            </svg>
            <svg v-else viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <rect
                x="4.5"
                y="2.5"
                width="11"
                height="15"
                rx="1.5"
                stroke="currentColor"
                stroke-width="1.5"
              />
              <path
                d="M7 7h6M7 10h6M7 13h4"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
              />
            </svg>
            <span>{{ navigationLabel }}</span>
          </RouterLink>
        </nav>
      </aside>

      <section class="workspace">
        <AdminUsersPanel v-if="isAdmin" />

        <SubmitterWorkspace
          v-else-if="isSubmitter"
          ref="submitterWorkspace"
          @view-change="submitterEditing = $event"
        />

        <div v-else class="work-items" aria-labelledby="workspace-title">
          <h1 id="workspace-title">审校任务</h1>
          <div class="empty-state">
            <span class="empty-icon" aria-hidden="true">
              <svg viewBox="0 0 48 48" fill="none">
                <rect
                  x="11"
                  y="7"
                  width="26"
                  height="34"
                  rx="3"
                  stroke="currentColor"
                  stroke-width="1.8"
                />
                <path
                  d="M17 17H31M17 24H31M17 31H27"
                  stroke="currentColor"
                  stroke-width="1.8"
                  stroke-linecap="round"
                />
              </svg>
            </span>
            <p>暂无工作事项</p>
          </div>
        </div>
      </section>
    </div>
  </main>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { UserRole } from '@onedep/shared'
import { useRouter } from 'vue-router'

import AdminUsersPanel from '@/components/AdminUsersPanel.vue'
import SubmitterWorkspace from '@/components/SubmitterWorkspace.vue'
import { useAuthStore } from '@/stores/auth'

const ROLE_LABELS: Record<UserRole, string> = {
  SUBMITTER: '提交员',
  REVIEWER: '审校员',
  ADMIN: '管理员',
}

const auth = useAuthStore()
const router = useRouter()
const leaving = ref(false)
const error = ref('')
const submitterEditing = ref(false)
const submitterWorkspace = ref<{ closeDraft: () => Promise<void> } | null>(null)
const isAdmin = computed(() => auth.user?.role === 'ADMIN')
const isSubmitter = computed(() => auth.user?.role === 'SUBMITTER')
const roleLabel = computed(() => ROLE_LABELS[auth.user?.role ?? 'SUBMITTER'])
const areaName = computed(() => {
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
  } catch {
    error.value = '退出失败，请稍后再试。'
  } finally {
    leaving.value = false
  }
}
</script>

<style lang="less" scoped>
.dashboard-view {
  display: grid;
  min-height: 100vh;
  grid-template-rows: 64px 1fr;
  color: #202a24;
  background: #f5f7f5;

  .topbar {
    display: grid;
    position: sticky;
    z-index: 20;
    top: 0;
    grid-template-columns: 232px minmax(0, 1fr);
    border-bottom: 1px solid #e3e8e4;

    .brand-cell {
      display: flex;
      align-items: center;
      padding: 0 24px;
      color: #f4f7f5;
      background: #17231d;

      .brand {
        font-size: 22px;
        font-weight: 680;
        letter-spacing: -0.07em;

        span {
          color: #8fa997;
        }
      }
    }

    .topbar-main {
      display: flex;
      min-width: 0;
      align-items: center;
      justify-content: space-between;
      gap: 20px;
      padding: 0 32px;
      background: #fff;

      .area-name {
        color: #758078;
        font-size: 13px;
        font-weight: 550;
      }

      .topbar-back {
        display: inline-flex;
        align-items: center;
        gap: 7px;
        padding: 0;
        border: 0;
        color: #59675e;
        background: transparent;
        font-size: 13px;
        font-weight: 550;

        &:hover {
          color: #24513e;
        }
      }

      .account-info {
        display: flex;
        min-width: 0;
        align-items: center;
        gap: 12px;

        .account-role {
          flex: none;
          padding: 4px 8px;
          border-radius: 6px;
          color: #355443;
          background: #eaf0ec;
          font-size: 12px;
          font-weight: 600;
        }

        .account-email {
          max-width: 280px;
          overflow: hidden;
          color: #354039;
          font-size: 13px;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        button {
          height: 30px;
          padding: 0 10px;
          border: 0;
          border-left: 1px solid #e1e6e2;
          color: #718078;
          background: transparent;
          font-size: 13px;

          &:hover:not(:disabled) {
            color: #1f4d3a;
          }

          &:disabled {
            opacity: 0.5;
            cursor: wait;
          }
        }
      }
    }
  }

  .logout-error {
    position: fixed;
    z-index: 30;
    top: 72px;
    right: 24px;
    margin: 0;
    padding: 10px 14px;
    border: 1px solid #edcbc7;
    border-radius: 8px;
    color: #9c4039;
    background: #fff;
    box-shadow: 0 8px 24px rgb(76 35 31 / 10%);
    font-size: 13px;
  }

  .app-layout {
    display: grid;
    min-width: 0;
    grid-template-columns: 232px minmax(0, 1fr);

    .sidebar {
      position: sticky;
      top: 64px;
      align-self: start;
      height: calc(100vh - 64px);
      overflow-y: auto;
      padding: 24px 14px;
      background: #17231d;

      nav {
        .nav-link {
          display: flex;
          min-height: 42px;
          align-items: center;
          gap: 11px;
          padding: 0 13px;
          border-radius: 8px;
          color: #f3f6f4;
          background: #27382f;
          font-size: 14px;
          font-weight: 560;
          text-decoration: none;

          svg {
            width: 18px;
            height: 18px;
            color: #a9bbaf;
          }
        }
      }
    }

    .workspace {
      min-width: 0;
      padding: 40px clamp(28px, 4vw, 64px) 56px;

      .work-items {
        h1 {
          margin: 0 0 24px;
          color: #17231d;
          font-size: 24px;
          font-weight: 650;
          letter-spacing: -0.04em;
        }

        .empty-state {
          display: flex;
          min-height: 260px;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 14px;
          border: 1px solid #e2e7e3;
          border-radius: 12px;
          background: #fff;
          box-shadow: 0 8px 28px rgb(31 47 38 / 5%);

          .empty-icon {
            display: grid;
            width: 54px;
            height: 54px;
            place-items: center;
            border-radius: 14px;
            color: #587263;
            background: #edf2ee;

            svg {
              width: 30px;
              height: 30px;
            }
          }

          p {
            margin: 0;
            color: #7a857d;
            font-size: 14px;
          }
        }
      }
    }
  }
}
</style>
