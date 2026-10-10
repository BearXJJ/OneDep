<template>
  <section class="profile-settings">
    <div class="settings-grid">
      <form class="settings-panel profile-form" @submit.prevent="saveProfile">
        <div class="panel-heading">
          <h2>个人信息</h2>
        </div>

        <div class="field-grid">
          <label class="field" for="profile-name">
            <span>姓名</span>
            <input
              id="profile-name"
              v-model.trim="name"
              type="text"
              autocomplete="name"
              maxlength="80"
            />
          </label>

          <label class="field" for="profile-email">
            <span>登录邮箱</span>
            <input
              id="profile-email"
              v-model.trim="email"
              type="email"
              autocomplete="email"
              maxlength="254"
            />
          </label>

          <label class="field" for="profile-orcid">
            <span>ORCID</span>
            <input
              id="profile-orcid"
              v-model.trim="orcid"
              type="text"
              autocomplete="off"
              maxlength="19"
              placeholder="0000-0000-0000-0000"
            />
          </label>

          <label class="field" for="profile-institution">
            <span>机构</span>
            <input
              id="profile-institution"
              v-model.trim="institution"
              type="text"
              autocomplete="organization"
              maxlength="200"
            />
          </label>

          <label class="field" for="profile-country">
            <span>国家或地区</span>
            <input
              id="profile-country"
              v-model.trim="country"
              type="text"
              autocomplete="country-name"
              maxlength="100"
            />
          </label>

          <label class="field" for="profile-role">
            <span>账号角色</span>
            <input id="profile-role" :value="roleLabel" type="text" disabled />
          </label>
        </div>

        <p
          v-if="profileNotice"
          class="notice"
          :class="{ error: profileNoticeType === 'error' }"
          role="status"
        >
          {{ profileNotice }}
        </p>

        <div class="actions">
          <ElButton
            type="primary"
            native-type="submit"
            :loading="savingProfile"
            :disabled="!changed"
          >
            保存个人信息
          </ElButton>
        </div>
      </form>

      <form class="settings-panel password-form" @submit.prevent="savePassword">
        <div class="panel-heading">
          <h2>修改密码</h2>
        </div>

        <div class="field-grid password-grid">
          <label class="field" for="current-password">
            <span>当前密码</span>
            <input
              id="current-password"
              v-model="currentPassword"
              type="password"
              autocomplete="current-password"
              maxlength="128"
            />
          </label>

          <label class="field" for="new-password">
            <span>新密码</span>
            <input
              id="new-password"
              v-model="newPassword"
              type="password"
              autocomplete="new-password"
              minlength="8"
              maxlength="128"
            />
          </label>

          <label class="field" for="confirm-password">
            <span>确认新密码</span>
            <input
              id="confirm-password"
              v-model="confirmPassword"
              type="password"
              autocomplete="new-password"
              minlength="8"
              maxlength="128"
            />
          </label>
        </div>

        <p
          v-if="passwordNotice"
          class="notice"
          :class="{ error: passwordNoticeType === 'error' }"
          role="status"
        >
          {{ passwordNotice }}
        </p>

        <div class="actions">
          <ElButton
            type="primary"
            native-type="submit"
            :loading="savingPassword"
            :disabled="!passwordReady"
          >
            修改密码
          </ElButton>
        </div>
      </form>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElButton } from 'element-plus/es/components/button/index'
import type { UserRole } from '@onedep/shared'

import 'element-plus/es/components/button/style/css'

import { useAuthStore } from '@/stores/auth'

const ROLE_LABELS: Record<UserRole, string> = {
  SUBMITTER: '提交员',
  REVIEWER: '审校员',
  ADMIN: '管理员',
}

const auth = useAuthStore()
const name = ref(auth.user?.name ?? '')
const email = ref(auth.user?.email ?? '')
const orcid = ref(auth.user?.orcid ?? '')
const institution = ref(auth.user?.institution ?? '')
const country = ref(auth.user?.country ?? '')
const currentPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const savingProfile = ref(false)
const savingPassword = ref(false)
const profileNotice = ref('')
const profileNoticeType = ref<'success' | 'error'>('success')
const passwordNotice = ref('')
const passwordNoticeType = ref<'success' | 'error'>('success')
const roleLabel = computed(() => ROLE_LABELS[auth.user?.role ?? 'SUBMITTER'])
const changed = computed(
  () =>
    name.value.trim() !== auth.user?.name ||
    email.value.trim().toLowerCase() !== auth.user?.email ||
    orcid.value.trim().toUpperCase() !== auth.user?.orcid ||
    institution.value.trim() !== auth.user?.institution ||
    country.value.trim() !== auth.user?.country,
)
const passwordReady = computed(
  () =>
    currentPassword.value.length > 0 &&
    newPassword.value.length >= 8 &&
    confirmPassword.value.length >= 8,
)

watch(
  () => auth.user,
  (user) => {
    name.value = user?.name ?? ''
    email.value = user?.email ?? ''
    orcid.value = user?.orcid ?? ''
    institution.value = user?.institution ?? ''
    country.value = user?.country ?? ''
  },
)

// 校验资料格式后保存当前账号的身份和机构信息。
async function saveProfile() {
  if (savingProfile.value || !changed.value) return
  if (name.value.trim().length < 2) {
    showProfileNotice('姓名至少需要 2 个字符。', 'error')
    return
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())) {
    showProfileNotice('请输入有效的邮箱。', 'error')
    return
  }
  if (orcid.value.trim() && !/^\d{4}-\d{4}-\d{4}-\d{3}[\dXx]$/.test(orcid.value.trim())) {
    showProfileNotice('请输入有效的 ORCID。', 'error')
    return
  }

  savingProfile.value = true
  profileNotice.value = ''
  try {
    await auth.updateProfile({
      name: name.value.trim(),
      email: email.value.trim().toLowerCase(),
      orcid: orcid.value.trim().toUpperCase(),
      institution: institution.value.trim(),
      country: country.value.trim(),
    })
    showProfileNotice('个人信息已更新。')
  } catch (cause) {
    showProfileNotice(cause instanceof Error ? cause.message : '保存失败，请稍后再试。', 'error')
  } finally {
    savingProfile.value = false
  }
}

// 当前密码校验通过后更新密码，并清空表单中的敏感内容。
async function savePassword() {
  if (savingPassword.value || !passwordReady.value) return
  if (newPassword.value !== confirmPassword.value) {
    showPasswordNotice('两次输入的新密码不一致。', 'error')
    return
  }
  if (currentPassword.value === newPassword.value) {
    showPasswordNotice('新密码不能与当前密码相同。', 'error')
    return
  }

  savingPassword.value = true
  passwordNotice.value = ''
  try {
    await auth.updatePassword({
      currentPassword: currentPassword.value,
      newPassword: newPassword.value,
    })
    currentPassword.value = ''
    newPassword.value = ''
    confirmPassword.value = ''
    showPasswordNotice('密码已修改。')
  } catch (cause) {
    showPasswordNotice(cause instanceof Error ? cause.message : '修改失败，请稍后再试。', 'error')
  } finally {
    savingPassword.value = false
  }
}

function showProfileNotice(message: string, type: 'success' | 'error' = 'success') {
  profileNotice.value = message
  profileNoticeType.value = type
}

function showPasswordNotice(message: string, type: 'success' | 'error' = 'success') {
  passwordNotice.value = message
  passwordNoticeType.value = type
}
</script>

<style lang="less" scoped>
.profile-settings {
  width: 100%;

  .settings-grid {
    display: grid;
    grid-template-columns: minmax(0, 1.7fr) minmax(320px, 0.8fr);
    align-items: start;
    gap: 20px;
  }

  .settings-panel {
    padding: 28px;
    border: 1px solid #e1e6e2;
    border-radius: 12px;
    background: #fff;
    box-shadow: 0 8px 28px rgb(31 47 38 / 5%);

    .panel-heading {
      margin-bottom: 24px;

      h2 {
        margin: 0;
        color: #26332c;
        font-size: 16px;
        font-weight: 650;
      }
    }

    .field-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 20px 24px;

      &.password-grid {
        grid-template-columns: 1fr;
      }

      .field {
        display: grid;
        gap: 8px;

        span {
          color: #49554d;
          font-size: 13px;
          font-weight: 560;
        }

        input {
          width: 100%;
          height: 42px;
          padding: 0 12px;
          border: 1px solid #d9dfda;
          border-radius: 7px;
          outline: none;
          color: #202a24;
          background: #fff;
          font: inherit;
          font-size: 13px;

          &:focus {
            border-color: #4d725f;
            box-shadow: 0 0 0 3px rgb(36 81 62 / 8%);
          }

          &:disabled {
            color: #7c8780;
            background: #f4f6f4;
          }
        }
      }
    }

    .notice {
      margin: 20px 0 0;
      color: #315f49;
      font-size: 13px;

      &.error {
        color: #a3473f;
      }
    }

    .actions {
      display: flex;
      justify-content: flex-end;
      margin-top: 28px;
      padding-top: 20px;
      border-top: 1px solid #edf0ed;

      :deep(.el-button) {
        min-width: 116px;
        min-height: 40px;
        border-radius: 8px;
      }
    }
  }
}
</style>
