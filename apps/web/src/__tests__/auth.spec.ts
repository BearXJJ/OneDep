import { afterEach, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import type { AdminUser, DepositionDetail } from '@onedep/shared'

import App from '../App.vue'
import DepositionMethodSelector from '../components/DepositionMethodSelector.vue'
import router from '../router'
import { useAuthStore } from '../stores/auth'
import DashboardView from '../views/DashboardView.vue'

afterEach(() => vi.unstubAllGlobals())

const depositionFixture: DepositionDetail = {
  id: 1,
  code: 'D_6248357552',
  method: 'XRAY',
  methods: ['XRAY'],
  status: 'DRAFT',
  title: '',
  updatedAt: '2026-10-09T15:49:26.962Z',
  submittedAt: null,
  completion: { completed: 3, total: 22, percent: 14, missing: ['条目标题'] },
  creation: {
    methods: ['XRAY'],
    emSubtype: null,
    coordinates: null,
    emMapStatus: null,
    relatedEmdb: '',
    compositeMap: null,
    nmrDataPreviouslyDeposited: null,
    relatedBmrb: '',
    accessionCodes: ['PDB'],
  },
  files: [],
  metadata: {
    entry: { title: '', keywords: '', relatedDataDoi: '' },
    contact: {
      name: 'Alice',
      email: 'alice@example.com',
      orcid: '',
      institution: '',
      country: '',
    },
    authors: [],
    citation: { status: 'UNPUBLISHED', title: '', journal: '', doi: '' },
    macromolecule: {
      name: '',
      type: 'PROTEIN',
      chainIds: '',
      sequence: '',
      sourceOrganism: '',
      taxonomyId: '',
      expressionHost: '',
      mutations: '',
    },
    assembly: { oligomericState: '', description: '', evidence: '' },
    xray: {
      crystallizationMethod: '',
      crystallizationPh: '',
      crystallizationTemperature: '',
      spaceGroup: '',
      resolution: '',
    },
    release: { status: 'HOLD_FOR_PUBLICATION', holdUntil: '', termsAccepted: false },
  },
}

it('shows only public roles and opens the workspace after registration', async () => {
  const user = { id: 1, email: 'alice@example.com', name: 'Alice', role: 'SUBMITTER' }
  vi.stubGlobal('scrollTo', vi.fn<() => void>())
  const fetchMock = vi.fn<(path: string) => Promise<unknown>>(async (path: string) => {
    if (path === '/api/auth/me') {
      return { ok: false, status: 401, json: async () => ({ message: 'Unauthorized' }) }
    }
    if (path === '/api/depositions') {
      return { ok: true, status: 200, json: async () => [] }
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
  expect(wrapper.find('.sidebar .nav-link').text()).toBe('我的投递')
  expect(wrapper.text()).toContain('我的投递')
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
  expect(wrapper.find('.sidebar .nav-link').text()).toBe('审校任务')
  expect(wrapper.text()).toContain('审校任务')
  expect(wrapper.find('.hero').exists()).toBe(false)
})

it('opens an existing deposition without cloning the Vue proxy directly', async () => {
  const pinia = createPinia()
  setActivePinia(pinia)
  const auth = useAuthStore()
  auth.user = { id: 1, email: 'alice@example.com', name: 'Alice', role: 'SUBMITTER' }
  auth.initialized = true

  const fetchMock = vi.fn<(path: string) => Promise<unknown>>(async (path) => {
    if (path === '/api/depositions') {
      const { metadata, files, ...summary } = depositionFixture
      void metadata
      void files
      return { ok: true, json: async () => [summary] }
    }
    if (path === '/api/depositions/1') {
      return { ok: true, json: async () => depositionFixture }
    }
    throw new Error('unexpected request')
  })
  vi.stubGlobal('fetch', fetchMock)

  const wrapper = mount(DashboardView, {
    attachTo: document.body,
    global: { plugins: [pinia, router] },
  })
  await flushPromises()
  await wrapper.find('.submission-row').trigger('click')
  await flushPromises()

  expect(wrapper.find('.deposition-editor').exists()).toBe(true)
  expect(wrapper.find('.editor-header').text()).toContain('D_6248357552')
  expect(wrapper.findAll('.form-section')).toHaveLength(7)
  expect(wrapper.text()).toContain('坐标文件')
  expect(wrapper.text()).toContain('结构因子')

  const sectionTops = [-600, -260, 80, 420, 760, 1100, 1440]
  wrapper.findAll('.form-section').forEach((section, index) => {
    vi.spyOn(section.element, 'getBoundingClientRect').mockReturnValue({
      top: sectionTops[index],
    } as DOMRect)
  })
  window.dispatchEvent(new Event('scroll'))
  await flushPromises()

  expect(wrapper.findAll('.section-nav button')[2]!.classes()).toContain('active')
  wrapper.unmount()
})

it('selects an experimental method before creating a deposition', async () => {
  const pinia = createPinia()
  setActivePinia(pinia)
  const auth = useAuthStore()
  auth.user = { id: 1, email: 'alice@example.com', name: 'Alice', role: 'SUBMITTER' }
  auth.initialized = true

  const fetchMock = vi.fn<(path: string, init?: RequestInit) => Promise<unknown>>(
    async (path, init) => {
      if (path === '/api/depositions' && init?.method === 'POST') {
        return { ok: true, status: 201, json: async () => depositionFixture }
      }
      if (path === '/api/depositions') {
        return { ok: true, status: 200, json: async () => [] }
      }
      throw new Error('unexpected request')
    },
  )
  vi.stubGlobal('fetch', fetchMock)

  const wrapper = mount(DashboardView, { global: { plugins: [pinia, router] } })
  await flushPromises()
  await wrapper.find('.list-actions button').trigger('click')

  expect(wrapper.find('.method-selector').exists()).toBe(true)
  expect(wrapper.findAll('.method-card')).toHaveLength(7)
  expect(wrapper.findAll('.method-card:disabled')).toHaveLength(0)
  expect(wrapper.find('.topbar-back').text()).toContain('返回投递列表')

  await wrapper.findAll('.method-card')[0]!.trigger('click')
  await wrapper.find('.selector-actions button').trigger('click')
  await flushPromises()

  expect(fetchMock).toHaveBeenCalledWith(
    '/api/depositions',
    expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        methods: ['XRAY'],
        emSubtype: null,
        coordinates: null,
        emMapStatus: null,
        relatedEmdb: '',
        compositeMap: null,
        nmrDataPreviouslyDeposited: null,
        relatedBmrb: '',
        accessionCodes: ['PDB'],
      }),
    }),
  )
  expect(wrapper.find('.deposition-editor').exists()).toBe(true)
  wrapper.unmount()
})

it('shows the official EM questions and emits their answers', async () => {
  const wrapper = mount(DepositionMethodSelector, { props: { submitting: false } })

  await wrapper.findAll('.method-card')[1]!.trigger('click')
  expect(wrapper.text()).toContain('电子显微镜类型')

  await wrapper.findAll('.question-block .choice')[1]!.trigger('click')
  expect(wrapper.text()).toContain('本次投递是否包含坐标')

  await wrapper.findAll('.question-block')[1]!.findAll('.choice')[0]!.trigger('click')
  expect(wrapper.text()).toContain('与本次投递关联的 EMDB 地图')

  await wrapper.findAll('.question-block')[2]!.findAll('.choice')[0]!.trigger('click')
  expect(wrapper.text()).toContain('是否为复合地图投递')
  expect(wrapper.findAll('.question-block')[3]!.find('.choice.selected').text()).toBe('否')

  await wrapper.find('.selector-actions button').trigger('click')
  expect(wrapper.emitted('confirm')?.[0]?.[0]).toMatchObject({
    methods: ['EM'],
    emSubtype: 'SINGLE_PARTICLE',
    coordinates: true,
    emMapStatus: 'NEW_MAP',
    compositeMap: false,
    accessionCodes: ['PDB', 'EMDB'],
  })
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
