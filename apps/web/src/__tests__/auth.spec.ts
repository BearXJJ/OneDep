import { afterEach, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import type { AdminUser } from '@onedep/shared'

import App from '../App.vue'
import router from '../router'
import { useAuthStore } from '../stores/auth'
import DashboardView from '../views/DashboardView.vue'

afterEach(() => vi.unstubAllGlobals())

it('shows only public roles and opens the workspace after registration', async () => {
  const user = { id: 1, email: 'alice@example.com', name: 'Alice', role: 'SUBMITTER' }
  vi.stubGlobal('scrollTo', vi.fn<() => void>())
  const fetchMock = vi.fn<(path: string) => Promise<unknown>>(async (path: string) => {
    if (path === '/api/auth/me') {
      return { ok: false, status: 401, json: async () => ({ message: 'Unauthorized' }) }
    }
    return { ok: true, status: 201, json: async () => user }
  })
  vi.stubGlobal('fetch', fetchMock)

  const pinia = createPinia()
  setActivePinia(pinia)
  await router.push('/register')
  await router.isReady()
  const wrapper = mount(App, { global: { plugins: [pinia, router] } })

  expect(wrapper.text()).toContain('创建账号')
  expect(wrapper.find('input[value="SUBMITTER"]').exists()).toBe(true)
  expect(wrapper.find('input[value="REVIEWER"]').exists()).toBe(true)
  expect(wrapper.find('input[value="ADMIN"]').exists()).toBe(false)

  await wrapper.find('input[autocomplete="name"]').setValue('Alice')
  await wrapper.find('input[type="email"]').setValue('alice@example.com')
  await wrapper.find('input[type="password"]').setValue('correct horse battery')
  await wrapper.find('form').trigger('submit')
  await flushPromises()

  expect(fetchMock).toHaveBeenCalledWith(
    '/api/auth/register',
    expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        name: 'Alice',
        email: 'alice@example.com',
        password: 'correct horse battery',
        role: 'SUBMITTER',
      }),
    }),
  )
  expect(wrapper.find('.topbar .account-role').text()).toBe('提交员')
  expect(wrapper.find('.topbar .account-email').text()).toBe('alice@example.com')
  expect(wrapper.find('.sidebar .nav-link').text()).toBe('工作事项')
  expect(wrapper.text()).toContain('工作事项')
  expect(wrapper.find('.hero').exists()).toBe(false)
})

it('shows the reviewer account in the shared top bar', () => {
  const pinia = createPinia()
  setActivePinia(pinia)
  const auth = useAuthStore()
  auth.user = { id: 3, email: '2329806037@qq.com', name: '审校员', role: 'REVIEWER' }
  auth.initialized = true

  const wrapper = mount(DashboardView, { global: { plugins: [pinia, router] } })

  expect(wrapper.find('.topbar .account-role').text()).toBe('审校员')
  expect(wrapper.find('.topbar .account-email').text()).toBe('2329806037@qq.com')
  expect(wrapper.find('.sidebar .nav-link').text()).toBe('工作事项')
  expect(wrapper.find('.hero').exists()).toBe(false)
})

it('shows users instead of work items to an administrator', async () => {
  const pinia = createPinia()
  setActivePinia(pinia)
  const auth = useAuthStore()
  auth.user = { id: 4, email: 'admin', name: '管理员', role: 'ADMIN' }
  auth.initialized = true

  const fetchMock = vi.fn<(path: string) => Promise<unknown>>(async () => ({
    ok: true,
    json: async () => [
      {
        id: 1,
        email: 'alice@example.com',
        name: 'Alice',
        role: 'SUBMITTER',
        createdAt: '2026-10-09T00:00:00.000Z',
      },
    ],
  }))
  vi.stubGlobal('fetch', fetchMock)

  const wrapper = mount(DashboardView, { global: { plugins: [pinia, router] } })
  await flushPromises()

  expect(fetchMock).toHaveBeenCalledWith('/api/auth/users')
  expect(wrapper.text()).toContain('管理后台')
  expect(wrapper.find('.topbar .account-role').text()).toBe('管理员')
  expect(wrapper.find('.topbar .account-email').text()).toBe('admin')
  expect(wrapper.find('.sidebar .nav-link').text()).toBe('用户管理')
  expect(wrapper.find('.hero').exists()).toBe(false)
  expect(wrapper.text()).toContain('alice@example.com')
  expect(wrapper.text()).not.toContain('工作事项')
})

it('lets an administrator add accounts, change roles, and confirm deletion', async () => {
  const pinia = createPinia()
  setActivePinia(pinia)
  const auth = useAuthStore()
  auth.user = { id: 4, email: 'admin', name: '管理员', role: 'ADMIN' }
  auth.initialized = true

  let rows: AdminUser[] = [
    {
      id: 1,
      email: 'alice@example.com',
      name: 'Alice',
      role: 'SUBMITTER',
      createdAt: '2026-10-09T00:00:00.000Z',
    },
    { id: 4, email: 'admin', name: '管理员', role: 'ADMIN', createdAt: '2026-10-09T00:00:00.000Z' },
  ]
  const fetchMock = vi.fn<(path: string, init?: RequestInit) => Promise<unknown>>(
    async (path, init) => {
      if (init?.method === 'PATCH') {
        const body = JSON.parse(String(init.body)) as { role: 'SUBMITTER' | 'REVIEWER' }
        rows = rows.map((user) => (user.id === 1 ? { ...user, role: body.role } : user))
        return { ok: true, json: async () => rows[0] }
      }
      if (init?.method === 'DELETE') {
        rows = rows.filter((user) => user.id !== 1)
        return { ok: true, status: 204 }
      }
      if (init?.method === 'POST') {
        const body = JSON.parse(String(init.body)) as {
          name: string
          email: string
          role: 'SUBMITTER' | 'REVIEWER'
        }
        rows.push({ id: 5, ...body, createdAt: '2026-10-09T00:00:00.000Z' })
        return { ok: true, json: async () => rows[rows.length - 1] }
      }
      if (path === '/api/auth/users') return { ok: true, json: async () => rows }
      throw new Error('unexpected request')
    },
  )
  vi.stubGlobal('fetch', fetchMock)

  const wrapper = mount(DashboardView, {
    global: {
      plugins: [pinia, router],
      stubs: {
        teleport: true,
        ElSelect: {
          props: ['modelValue'],
          emits: ['update:modelValue'],
          template:
            '<select :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><slot /></select>',
        },
        ElOption: {
          props: ['label', 'value'],
          template: '<option :value="value">{{ label }}</option>',
        },
      },
    },
  })
  await flushPromises()
  expect(wrapper.findAll('.edit-button')).toHaveLength(1)

  await wrapper.find('.edit-button').trigger('click')
  await flushPromises()
  expect((wrapper.find('#user-email').element as HTMLInputElement).value).toBe('alice@example.com')
  expect(wrapper.find('#user-name').attributes('disabled')).toBeDefined()
  expect(wrapper.find('#user-email').attributes('disabled')).toBeDefined()
  expect(wrapper.find('.user-editor input[type="password"]').exists()).toBe(false)
  await wrapper.find('.role-select').setValue('REVIEWER')
  await wrapper.find('.user-editor').trigger('submit')
  await flushPromises()
  expect(fetchMock).toHaveBeenCalledWith(
    '/api/auth/users/1',
    expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ role: 'REVIEWER' }),
    }),
  )
  expect(wrapper.find('tbody').text()).toContain('审校员')

  await wrapper.find('.edit-button').trigger('click')
  await flushPromises()
  await wrapper.find('[data-testid="delete-user"]').trigger('click')
  await flushPromises()
  expect(wrapper.find('.delete-message').text()).toContain('无法撤销')
  await wrapper.find('[data-testid="confirm-delete"]').trigger('click')
  await flushPromises()
  expect(fetchMock).toHaveBeenCalledWith('/api/auth/users/1', { method: 'DELETE' })
  expect(wrapper.find('tbody').text()).not.toContain('alice@example.com')

  await wrapper.find('.create-button').trigger('click')
  await flushPromises()
  await wrapper.find('#user-name').setValue('Chen')
  await wrapper.find('#user-email').setValue('chen@example.com')
  await wrapper.find('#new-user-password').setValue('new secure password')
  await wrapper.find('.user-editor').trigger('submit')
  await flushPromises()
  expect(fetchMock).toHaveBeenCalledWith(
    '/api/auth/users',
    expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        name: 'Chen',
        email: 'chen@example.com',
        password: 'new secure password',
        role: 'SUBMITTER',
      }),
    }),
  )
  expect(wrapper.find('tbody').text()).toContain('chen@example.com')
})
