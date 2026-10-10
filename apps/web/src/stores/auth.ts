import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { AuthUser, RegistrationRole } from '@onedep/shared'

type Credentials = { email: string; password: string }
type Registration = Credentials & { name: string; role: RegistrationRole }
type ProfileUpdate = {
  name: string
  email: string
  orcid: string
  institution: string
  country: string
}
type PasswordUpdate = { currentPassword: string; newPassword: string }

// 将接口错误转换为表单可显示的提示。
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/auth/${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { message?: string | string[] }
    const message = Array.isArray(body.message) ? body.message[0] : body.message
    throw new Error(message || '请求失败，请稍后再试')
  }

  return (response.status === 204 ? undefined : await response.json()) as T
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref<AuthUser | null>(null)
  const initialized = ref(false)

  // 检查浏览器中是否已有有效会话。
  async function restore() {
    try {
      user.value = await request<AuthUser>('me')
    } catch {
      user.value = null
    } finally {
      initialized.value = true
    }
  }

  async function login(credentials: Credentials) {
    user.value = await request<AuthUser>('login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    })
  }

  async function register(registration: Registration) {
    user.value = await request<AuthUser>('register', {
      method: 'POST',
      body: JSON.stringify(registration),
    })
  }

  // 保存当前用户资料，并立即同步页面中的账号信息。
  async function updateProfile(profile: ProfileUpdate) {
    user.value = await request<AuthUser>('me', {
      method: 'PATCH',
      body: JSON.stringify(profile),
    })
  }

  // 修改密码时不改变当前登录会话和页面中的用户资料。
  async function updatePassword(passwords: PasswordUpdate) {
    await request<void>('password', {
      method: 'PATCH',
      body: JSON.stringify(passwords),
    })
  }

  async function logout() {
    await request<void>('logout', { method: 'POST' })
    user.value = null
  }

  return { user, initialized, restore, login, register, updateProfile, updatePassword, logout }
})
