<template>
  <section class="admin-users" aria-labelledby="users-title">
    <header class="page-heading">
      <div class="title-group">
        <h1 id="users-title">用户管理</h1>
        <span v-if="!loading && !loadError" class="user-count">{{ users.length }}</span>
      </div>
      <ElButton class="create-button" type="primary" @click="openCreate">新增账户</ElButton>
    </header>

    <div class="list-panel">
      <div v-if="loading" class="list-state">正在加载用户…</div>
      <div v-else-if="loadError" class="list-state error-state">
        <span>{{ loadError }}</span>
        <ElButton plain @click="loadUsers">重新加载</ElButton>
      </div>
      <div v-else-if="users.length === 0" class="list-state">暂无用户</div>
      <div v-else class="table-wrap">
        <table>
          <thead>
            <tr>
              <th scope="col">用户</th>
              <th scope="col">角色</th>
              <th scope="col">注册时间</th>
              <th scope="col" class="action-column">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="user in users" :key="user.id">
              <td>
                <div class="user-cell">
                  <strong>{{ user.name }}</strong>
                  <span>{{ user.email }}</span>
                </div>
              </td>
              <td>
                <span class="role-badge" :class="`is-${user.role.toLowerCase()}`">
                  {{ ROLE_LABELS[user.role] }}
                </span>
              </td>
              <td class="date-cell">{{ formatDate(user.createdAt) }}</td>
              <td class="action-column">
                <ElButton
                  v-if="user.role !== 'ADMIN'"
                  class="edit-button"
                  link
                  :disabled="submitting"
                  data-testid="edit-user"
                  @click="openEdit(user)"
                >
                  编辑
                </ElButton>
                <span v-else class="locked-mark">—</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <ElDrawer
      v-model="drawerOpen"
      class="user-editor-drawer"
      :size="drawerSize"
      :title="drawerMode === 'create' ? '新增账户' : '编辑账户'"
      :close-on-click-modal="!submitting"
      :close-on-press-escape="!submitting"
      :before-close="beforeCloseDrawer"
      destroy-on-close
    >
      <form class="user-editor" @submit.prevent="saveUser">
        <div class="form-field">
          <label for="user-name">姓名</label>
          <input
            id="user-name"
            v-model.trim="formName"
            minlength="2"
            maxlength="80"
            autocomplete="name"
            placeholder="输入姓名"
            :disabled="drawerMode === 'edit'"
            required
          />
        </div>

        <div class="form-field">
          <label for="user-email">邮箱</label>
          <input
            id="user-email"
            v-model.trim="formEmail"
            type="email"
            maxlength="254"
            autocomplete="email"
            placeholder="name@example.com"
            :disabled="drawerMode === 'edit'"
            required
          />
        </div>

        <div v-if="drawerMode === 'create'" class="form-field">
          <label for="new-user-password">初始密码</label>
          <input
            id="new-user-password"
            v-model="formPassword"
            type="password"
            minlength="8"
            maxlength="128"
            autocomplete="new-password"
            placeholder="至少 8 个字符"
            required
          />
        </div>

        <div class="form-field">
          <label id="role-label">角色</label>
          <ElSelect v-model="formRole" aria-labelledby="role-label" class="role-select">
            <ElOption label="提交员" value="SUBMITTER" />
            <ElOption label="审校员" value="REVIEWER" />
          </ElSelect>
        </div>

        <p v-if="formError" class="form-error" role="alert">{{ formError }}</p>

        <div class="drawer-actions">
          <ElButton
            v-if="drawerMode === 'edit'"
            class="delete-button"
            type="danger"
            plain
            :disabled="submitting"
            data-testid="delete-user"
            @click="deleteDialogOpen = true"
          >
            删除账户
          </ElButton>
          <span class="action-spacer" />
          <ElButton :disabled="submitting" @click="closeDrawer">取消</ElButton>
          <ElButton
            type="primary"
            native-type="submit"
            :loading="submitting"
            :disabled="drawerMode === 'edit' && formRole === selectedUser?.role"
          >
            {{ drawerMode === 'create' ? '创建账户' : '保存修改' }}
          </ElButton>
        </div>
      </form>
    </ElDrawer>

    <ElDialog
      v-model="deleteDialogOpen"
      class="delete-user-dialog"
      title="删除账户"
      width="400px"
      align-center
      :close-on-click-modal="!submitting"
      :close-on-press-escape="!submitting"
      :show-close="!submitting"
    >
      <p class="delete-message">
        确定删除 <strong>{{ selectedUser?.email }}</strong
        >？删除后该账户将无法登录，此操作无法撤销。
      </p>
      <template #footer>
        <ElButton :disabled="submitting" @click="deleteDialogOpen = false">取消</ElButton>
        <ElButton
          type="danger"
          :loading="submitting"
          data-testid="confirm-delete"
          @click="removeUser"
        >
          确认删除
        </ElButton>
      </template>
    </ElDialog>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElButton } from 'element-plus/es/components/button/index'
import { ElDialog } from 'element-plus/es/components/dialog/index'
import { ElDrawer } from 'element-plus/es/components/drawer/index'
import { ElOption, ElSelect } from 'element-plus/es/components/select/index'
import type { AdminUser, RegistrationRole, UserRole } from '@onedep/shared'

import 'element-plus/es/components/button/style/css'
import 'element-plus/es/components/dialog/style/css'
import 'element-plus/es/components/drawer/style/css'
import 'element-plus/es/components/select/style/css'

const ROLE_LABELS: Record<UserRole, string> = {
  SUBMITTER: '提交员',
  REVIEWER: '审校员',
  ADMIN: '管理员',
}

const users = ref<AdminUser[]>([])
const loading = ref(false)
const loadError = ref('')
const drawerOpen = ref(false)
const drawerMode = ref<'create' | 'edit'>('create')
const selectedUser = ref<AdminUser | null>(null)
const formName = ref('')
const formEmail = ref('')
const formPassword = ref('')
const formRole = ref<RegistrationRole>('SUBMITTER')
const formError = ref('')
const submitting = ref(false)
const deleteDialogOpen = ref(false)
const drawerSize = computed(() => (window.innerWidth < 600 ? '100%' : '440px'))

onMounted(loadUsers)

// 获取管理员可见的用户列表，并提供失败重试。
async function loadUsers() {
  loading.value = true
  loadError.value = ''
  try {
    const response = await fetch('/api/auth/users')
    if (!response.ok) throw new Error('用户加载失败，请稍后重试。')
    users.value = (await response.json()) as AdminUser[]
  } catch {
    loadError.value = '用户加载失败，请稍后重试。'
  } finally {
    loading.value = false
  }
}

// 清空新增表单后打开账户编辑抽屉。
function openCreate() {
  drawerMode.value = 'create'
  selectedUser.value = null
  formName.value = ''
  formEmail.value = ''
  formPassword.value = ''
  formRole.value = 'SUBMITTER'
  formError.value = ''
  drawerOpen.value = true
}

// 将当前角色带入编辑抽屉，管理员账户不开放编辑。
function openEdit(user: AdminUser) {
  if (user.role === 'ADMIN') return
  drawerMode.value = 'edit'
  selectedUser.value = user
  formName.value = user.name
  formEmail.value = user.email
  formPassword.value = ''
  formRole.value = user.role
  formError.value = ''
  drawerOpen.value = true
}

function closeDrawer() {
  if (!submitting.value) drawerOpen.value = false
}

function beforeCloseDrawer(done: () => void) {
  if (!submitting.value) done()
}

// 读取接口返回的错误信息，供用户管理操作显示。
async function responseError(response: Response): Promise<string> {
  const body = (await response.json().catch(() => ({}))) as { message?: string | string[] }
  const message = Array.isArray(body.message) ? body.message[0] : body.message
  return message || '操作失败，请稍后重试。'
}

// 新增公开角色账户，或只修改现有账户的角色。
async function saveUser() {
  if (submitting.value) return
  const creating = drawerMode.value === 'create'
  const target = selectedUser.value
  if (!creating && !target) return

  submitting.value = true
  formError.value = ''
  try {
    const response = await fetch(creating ? '/api/auth/users' : `/api/auth/users/${target!.id}`, {
      method: creating ? 'POST' : 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(
        creating
          ? {
              name: formName.value,
              email: formEmail.value,
              password: formPassword.value,
              role: formRole.value,
            }
          : { role: formRole.value },
      ),
    })
    if (!response.ok) throw new Error(await responseError(response))

    if (creating) {
      await loadUsers()
    } else {
      const updated = (await response.json()) as AdminUser
      users.value = users.value.map((user) => (user.id === updated.id ? updated : user))
    }
    drawerOpen.value = false
    selectedUser.value = null
  } catch (cause) {
    formError.value = cause instanceof Error ? cause.message : '操作失败，请稍后重试。'
  } finally {
    submitting.value = false
  }
}

// 用户二次确认后删除普通账户，并同步更新列表。
async function removeUser() {
  const target = selectedUser.value
  if (submitting.value || !target) return

  submitting.value = true
  formError.value = ''
  try {
    const response = await fetch(`/api/auth/users/${target.id}`, { method: 'DELETE' })
    if (!response.ok) throw new Error(await responseError(response))
    users.value = users.value.filter((user) => user.id !== target.id)
    deleteDialogOpen.value = false
    drawerOpen.value = false
    selectedUser.value = null
  } catch (cause) {
    deleteDialogOpen.value = false
    formError.value = cause instanceof Error ? cause.message : '删除失败，请稍后重试。'
  } finally {
    submitting.value = false
  }
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value))
}
</script>

<style lang="less" scoped>
.admin-users {
  width: 100%;

  .page-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 24px;
    margin-bottom: 24px;

    .title-group {
      display: flex;
      align-items: center;
      gap: 12px;

      h1 {
        margin: 0;
        color: #17231d;
        font-size: 24px;
        font-weight: 650;
        letter-spacing: -0.04em;
      }

      .user-count {
        display: grid;
        min-width: 24px;
        height: 24px;
        place-items: center;
        padding: 0 7px;
        border-radius: 12px;
        color: #4f6256;
        background: #e8ede9;
        font-size: 12px;
        font-weight: 600;
      }
    }

    .create-button {
      --el-button-bg-color: #24513e;
      --el-button-border-color: #24513e;
      --el-button-hover-bg-color: #31644e;
      --el-button-hover-border-color: #31644e;
      --el-button-active-bg-color: #1c4232;
      --el-button-active-border-color: #1c4232;
      height: 38px;
      padding: 0 18px;
      border-radius: 8px;
      font-weight: 550;
    }
  }

  .list-panel {
    overflow: hidden;
    border: 1px solid #e2e7e3;
    border-radius: 12px;
    background: #fff;
    box-shadow: 0 8px 28px rgb(31 47 38 / 5%);

    .list-state {
      display: flex;
      min-height: 220px;
      align-items: center;
      justify-content: center;
      gap: 16px;
      color: #748078;
      font-size: 14px;

      &.error-state {
        color: #a3473f;
      }
    }

    .table-wrap {
      overflow-x: auto;

      table {
        width: 100%;
        min-width: 720px;
        border-collapse: collapse;
        text-align: left;

        th,
        td {
          padding: 17px 22px;
          border-bottom: 1px solid #edf0ed;
        }

        th {
          color: #778178;
          background: #fafbfa;
          font-size: 12px;
          font-weight: 600;
          letter-spacing: 0.04em;
        }

        tbody {
          tr {
            transition: background 0.16s ease;

            &:hover {
              background: #fbfcfb;
            }

            &:last-child td {
              border-bottom: 0;
            }
          }
        }

        td {
          color: #465149;
          font-size: 14px;

          .user-cell {
            display: grid;
            min-width: 240px;
            gap: 3px;

            strong {
              overflow: hidden;
              color: #202a24;
              font-weight: 600;
              text-overflow: ellipsis;
              white-space: nowrap;
            }

            span {
              overflow: hidden;
              color: #89928b;
              font-size: 12px;
              text-overflow: ellipsis;
              white-space: nowrap;
            }
          }

          .role-badge {
            display: inline-flex;
            min-height: 26px;
            align-items: center;
            padding: 0 9px;
            border-radius: 7px;
            color: #43544a;
            background: #edf1ee;
            font-size: 12px;

            &.is-reviewer {
              color: #625339;
              background: #f3efe5;
            }

            &.is-admin {
              color: #54436a;
              background: #f0ebf5;
            }
          }

          &.date-cell {
            color: #69746c;
            font-variant-numeric: tabular-nums;
          }
        }

        .action-column {
          width: 88px;
          text-align: right;

          .edit-button {
            --el-button-text-color: #315844;
            --el-button-hover-text-color: #1d3f2f;
            font-weight: 550;
          }

          .locked-mark {
            color: #b1b8b2;
          }
        }
      }
    }
  }

  @media (max-width: 720px) {
    .page-heading {
      margin-bottom: 18px;

      .title-group {
        h1 {
          font-size: 21px;
        }
      }
    }

    .list-panel {
      border-radius: 10px;
    }
  }
}
</style>
