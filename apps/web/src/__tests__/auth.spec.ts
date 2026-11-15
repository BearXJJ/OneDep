import { t } from '../locales'
import { afterEach, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { SurveyComponent } from 'survey-vue3-ui'
import { type Model, QuestionPanelDynamicModel } from 'survey-core'
import { createPinia, setActivePinia } from 'pinia'
import type { AdminUser, DepositionDetail } from '@onedep/shared'

import App from '../App.vue'
import DepositionEditor from '../components/DepositionEditor.vue'
import DepositionMethodSelector from '../components/DepositionMethodSelector.vue'
import ProfileSettings from '../components/ProfileSettings.vue'
import router from '../router'
import { createRouter, createMemoryHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import DashboardView from '../views/DashboardView.vue'

vi.mock('../components/ReviewerWorkspace.vue', () => ({ default: { template: '<div />' } }))

vi.mock('../copilot/Copilot.vue', () => ({ default: { template: '<div />' } }))

afterEach(() => vi.unstubAllGlobals())

const emptyProfile = { orcid: null, institution: null, country: null }

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
  profile: 'XRAY',
  definitionRevision: 2,
  revision: 0,
  answers: {},
  origins: [],
  checks: [],
  submission: null,
}

it('shows only public roles and opens the workspace after registration', async () => {
  const user = {
    id: 1,
    email: 'alice@example.com',
    name: 'Alice',
    ...emptyProfile,
    role: 'SUBMITTER',
  }
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
  auth.user = {
    id: 3,
    email: '2329806037@qq.com',
    name: '审校员',
    ...emptyProfile,
    role: 'REVIEWER',
  }
  auth.initialized = true

  const wrapper = mount(DashboardView, { global: { plugins: [pinia, router] } })

  expect(wrapper.find('.topbar .account-role').text()).toBe('审校员')
  expect(wrapper.find('.topbar .account-email').text()).toBe('2329806037@qq.com')
  expect(wrapper.find('.sidebar .nav-link').text()).toBe('审校任务')
  expect(wrapper.text()).toContain('审校任务')
  expect(wrapper.find('.hero').exists()).toBe(false)
})

it('updates the current user profile from personal settings', async () => {
  const pinia = createPinia()
  setActivePinia(pinia)
  const auth = useAuthStore()
  auth.user = {
    id: 3,
    email: 'bob@example.com',
    name: 'Bob',
    ...emptyProfile,
    role: 'REVIEWER',
  }
  auth.initialized = true

  const fetchMock = vi.fn<(path: string, init?: RequestInit) => Promise<unknown>>(async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      id: 3,
      email: 'bob.updated@example.com',
      name: 'Bob Updated',
      orcid: '0000-0002-1825-0097',
      institution: 'ShanghaiTech University',
      country: 'China',
      role: 'REVIEWER',
    }),
  }))
  vi.stubGlobal('fetch', fetchMock)

  const wrapper = mount(ProfileSettings, { global: { plugins: [pinia] } })
  await wrapper.find('input[autocomplete="name"]').setValue('Bob Updated')
  await wrapper.find('input[type="email"]').setValue('bob.updated@example.com')
  await wrapper.find('#profile-orcid').setValue('0000-0002-1825-0097')
  await wrapper.find('#profile-institution').setValue('ShanghaiTech University')
  await wrapper.find('#profile-country').setValue('China')
  await wrapper.find('.profile-form').trigger('submit')
  await flushPromises()

  expect(fetchMock).toHaveBeenCalledWith(
    '/api/auth/me',
    expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({
        name: 'Bob Updated',
        email: 'bob.updated@example.com',
        orcid: '0000-0002-1825-0097',
        institution: 'ShanghaiTech University',
        country: 'China',
      }),
    }),
  )
  expect(auth.user?.name).toBe('Bob Updated')
  expect(auth.user?.email).toBe('bob.updated@example.com')
  expect(wrapper.text()).toContain('个人信息已更新')
})

it('changes the current user password from personal settings', async () => {
  const pinia = createPinia()
  setActivePinia(pinia)
  const auth = useAuthStore()
  auth.user = {
    id: 3,
    email: 'bob@example.com',
    name: 'Bob',
    ...emptyProfile,
    role: 'REVIEWER',
  }
  auth.initialized = true

  const fetchMock = vi.fn<() => Promise<unknown>>(async () => ({ ok: true, status: 204 }))
  vi.stubGlobal('fetch', fetchMock)

  const wrapper = mount(ProfileSettings, { global: { plugins: [pinia] } })
  await wrapper.find('#current-password').setValue('current password')
  await wrapper.find('#new-password').setValue('updated password')
  await wrapper.find('#confirm-password').setValue('updated password')
  await wrapper.find('.password-form').trigger('submit')
  await flushPromises()

  expect(fetchMock).toHaveBeenCalledWith(
    '/api/auth/password',
    expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({
        currentPassword: 'current password',
        newPassword: 'updated password',
      }),
    }),
  )
  expect(wrapper.text()).toContain('密码已修改')
  expect((wrapper.find('#current-password').element as HTMLInputElement).value).toBe('')
})

it('opens an existing deposition without cloning the Vue proxy directly', async () => {
  const pinia = createPinia()
  setActivePinia(pinia)
  const auth = useAuthStore()
  auth.user = {
    id: 1,
    email: 'alice@example.com',
    name: 'Alice',
    ...emptyProfile,
    role: 'SUBMITTER',
  }
  auth.initialized = true

  const fetchMock = vi.fn<(path: string) => Promise<unknown>>(async (path) => {
    if (path === '/api/depositions') {
      const { answers, files, ...summary } = depositionFixture
      void answers
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

  expect(wrapper.find('.editor').exists()).toBe(true)
  expect(wrapper.find('.editor header').text()).toContain('D_6248357552')
  await wrapper
    .findAll('.tree-item')
    .find((node) => node.text() === t('Re-upload files'))!
    .trigger('click')
  await flushPromises()
  expect(wrapper.text()).toContain('坐标模型')
  expect(wrapper.text()).toContain('结构因子')
  expect(wrapper.findAll('input[type="file"]')).toHaveLength(2)
  wrapper.unmount()
})

it('selects an experimental method before creating a deposition', async () => {
  const pinia = createPinia()
  setActivePinia(pinia)
  const auth = useAuthStore()
  auth.user = {
    id: 1,
    email: 'alice@example.com',
    name: 'Alice',
    ...emptyProfile,
    role: 'SUBMITTER',
  }
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
  expect(wrapper.find('.editor').exists()).toBe(true)
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
  auth.user = { id: 4, email: 'admin', name: '管理员', ...emptyProfile, role: 'ADMIN' }
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
  auth.user = { id: 4, email: 'admin', name: '管理员', ...emptyProfile, role: 'ADMIN' }
  auth.initialized = true

  let rows: AdminUser[] = [
    {
      id: 1,
      email: 'alice@example.com',
      name: 'Alice',
      ...emptyProfile,
      role: 'SUBMITTER',
      createdAt: '2026-10-09T00:00:00.000Z',
    },
    {
      id: 4,
      email: 'admin',
      name: '管理员',
      ...emptyProfile,
      role: 'ADMIN',
      createdAt: '2026-10-09T00:00:00.000Z',
    },
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
        rows.push({ id: 5, ...body, ...emptyProfile, createdAt: '2026-10-09T00:00:00.000Z' })
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

it('propagates session server failures without treating them as logout', async () => {
  setActivePinia(createPinia())
  const auth = useAuthStore()
  auth.user = {
    id: 1,
    name: 'Alice',
    email: 'alice@example.test',
    ...emptyProfile,
    role: 'SUBMITTER',
  }
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('Redis unavailable', { status: 503 })),
  )
  await expect(auth.restore()).rejects.toThrow('Redis unavailable')
  expect(auth.initialized).toBe(false)
  expect(auth.user.email).toBe('alice@example.test')
})

it('tracks each molecule separately and advances from the selected molecule', async () => {
  const pinia = createPinia()
  setActivePinia(pinia)
  const wrapper = mount(DepositionEditor, {
    props: {
      deposition: {
        ...depositionFixture,
        answers: {
          molecules: [
            {
              recordId: 'a',
              name: 'Complete molecule',
              entityType: 'polymer',
              polymerType: 'polypeptide(L)',
              sequence: 'MG',
              pdbx_depui_entity_features__type: 'None of these',
            },
            { recordId: 'ligand', name: 'Calcium', entityType: 'non-polymer' },
            { recordId: 'water', name: 'Water', entityType: 'water' },
            { recordId: 'b', name: 'Incomplete molecule', entityType: 'polymer' },
          ],
        },
      },
    },
    global: { plugins: [pinia, router], stubs: { Survey: true, SurveyComponent: true } },
  })
  await flushPromises()
  const first = wrapper.findAll('.tree-item').find((x) => x.text() === '1) Complete molecule')!
  const second = wrapper.findAll('.tree-item').find((x) => x.text() === '2) Incomplete molecule')!
  expect(wrapper.findAll('.tree-item').some((item) => /Calcium|Water/.test(item.text()))).toBe(
    false,
  )
  expect(first.find('.tree-status').classes()).toContain('complete')
  expect(second.find('.tree-status').classes()).toContain('missing')
  await second.trigger('click')
  await flushPromises()
  const survey = wrapper.findComponent(SurveyComponent).props('model') as Model
  const molecules = survey.getQuestionByName(
    'molecules',
  ) as import('survey-core').QuestionPanelDynamicModel
  expect(molecules.visiblePanels).toHaveLength(2)
  expect(molecules.currentPanel.getQuestionByName('recordId').value).toBe('b')
  expect(survey.data.molecules).toHaveLength(4)
  expect(wrapper.find('#deposition-content > .section-heading').text()).toBe(
    '2) Incomplete molecule',
  )
  await wrapper
    .findAll('button')
    .find((b) => b.text() === t('Continue to next section'))!
    .trigger('click')
  expect(wrapper.find('#deposition-content > .section-heading').text()).toBe(
    t('Crystal information'),
  )
  wrapper.unmount()
})

it('keeps saved answers clean after a same-value form event and detects real edits', async () => {
  const pinia = createPinia()
  setActivePinia(pinia)
  const wrapper = mount(DepositionEditor, {
    props: {
      deposition: {
        ...depositionFixture,
        answers: {
          molecules: [{ name: 'FtsZ', recordId: 'a', entityType: 'polymer' }],
        },
      },
    },
    global: { plugins: [pinia, router], stubs: { Survey: true, SurveyComponent: true } },
  })
  await wrapper
    .findAll('.tree-item')
    .find((node) => node.text() === '1) FtsZ')!
    .trigger('click')
  await flushPromises()
  const model = wrapper.findComponent(SurveyComponent).props('model') as Model
  model.onValueChanged.fire(model, {
    name: 'molecules',
    value: model.getValue('molecules'),
    question: model.getQuestionByName('molecules'),
    reason: undefined,
  })
  await flushPromises()
  expect(wrapper.find('.editor-toolbar button').text()).toBe(t('Save'))
  model.setValue('title', 'Edited title')
  await flushPromises()
  expect(wrapper.find('.editor-toolbar button').text()).toBe(t('Save') + ' *')
  model.clearValue('title')
  await flushPromises()
  expect(wrapper.find('.editor-toolbar button').text()).toBe(t('Save'))
  wrapper.unmount()
})

it('clears the file picker when an upload fails so the same file can be selected again', async () => {
  const pinia = createPinia()
  setActivePinia(pinia)
  const auth = useAuthStore()
  auth.initialized = true
  auth.user = {
    id: 1,
    email: 'retry@example.test',
    name: 'Retry',
    ...emptyProfile,
    role: 'SUBMITTER',
  }
  vi.stubGlobal('scrollTo', vi.fn())
  const errors: unknown[] = []
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockRejectedValueOnce(new TypeError('Failed to fetch'))
    .mockResolvedValueOnce(new Response(JSON.stringify(depositionFixture), { status: 201 }))
  vi.stubGlobal('fetch', fetchMock)
  const wrapper = mount(DepositionEditor, {
    props: { deposition: depositionFixture },
    global: {
      plugins: [pinia, router],
      stubs: { Survey: true, SurveyComponent: true },
      config: { errorHandler: (error) => errors.push(error) },
    },
  })
  await wrapper
    .findAll('.tree-item')
    .find((item) => item.text() === t('Re-upload files'))!
    .trigger('click')
  const picker = wrapper.find('input[type="file"]')
  const input = picker.element as HTMLInputElement
  const file = new File(['HEADER'], 'retry.pdb')
  Object.defineProperty(input, 'files', { value: [file], configurable: true })
  Object.defineProperty(input, 'value', {
    value: 'C:\\fakepath\\retry.pdb',
    writable: true,
    configurable: true,
  })
  await picker.trigger('change')
  await flushPromises()
  expect(errors).toHaveLength(1)
  expect(input.value).toBe('')
  expect(wrapper.get('.editor-toolbar button').attributes('disabled')).toBeUndefined()
  await picker.trigger('change')
  await flushPromises()
  expect(fetchMock).toHaveBeenCalledTimes(2)
  expect(errors).toHaveLength(1)
  wrapper.unmount()
})

async function editingWorkspace(patch: (init: RequestInit) => Promise<Response>) {
  const testRouter = createRouter({ history: createMemoryHistory(), routes: router.options.routes })
  const pinia = createPinia()
  setActivePinia(pinia)
  const auth = useAuthStore()
  auth.user = { id: 1, email: 'test@example.com', name: 'Test', ...emptyProfile, role: 'SUBMITTER' }
  auth.initialized = true
  let draft: DepositionDetail = {
    ...depositionFixture,
    answers: { molecules: [{ recordId: 'a', name: 'FtsZ', entityType: 'polymer' }] },
  }
  const errors: unknown[] = []
  const fetchMock = vi.fn<(path: string, init?: RequestInit) => Promise<Response>>(
    async (path, init) => {
      if (init?.method === 'PATCH') {
        const response = await patch(init)
        if (response.ok) draft = await response.clone().json()
        return response
      }
      if (path === '/api/auth/logout') return new Response(null, { status: 204 })
      if (path === '/api/depositions') return Response.json([draft])
      if (path === '/api/depositions/1') return Response.json(draft)
      throw new Error('Unexpected request: ' + path)
    },
  )
  vi.stubGlobal('fetch', fetchMock)
  vi.stubGlobal('scrollTo', vi.fn())
  await testRouter.push('/')
  const wrapper = mount(App, {
    global: {
      plugins: [pinia, testRouter],
      stubs: { SurveyComponent: true },
      config: { errorHandler: (error) => errors.push(error) },
    },
  })
  await flushPromises()
  await wrapper.find('.submission-row').trigger('click')
  await flushPromises()
  await wrapper
    .findAll('.tree-item')
    .find((node) => node.text() === '1) FtsZ')!
    .trigger('click')
  const model = wrapper.findComponent(SurveyComponent).props('model') as Model
  return { wrapper, model, fetchMock, errors, router: testRouter }
}

it('waits for saving before the topbar closes an edited draft', async () => {
  let finish!: () => void
  let written: Record<string, unknown> = {}
  const { wrapper, model, fetchMock } = await editingWorkspace(async (init) => {
    const body = JSON.parse(String(init.body))
    written = body.answers
    await new Promise<void>((resolve) => {
      finish = resolve
    })
    return Response.json({ ...depositionFixture, revision: 1, answers: body.answers })
  })
  model.setValue('title', 'Persist this title')
  await wrapper.find('.topbar-back').trigger('click')
  await flushPromises()
  expect(wrapper.find('.editor').exists()).toBe(true)
  expect(written.title).toBe('Persist this title')
  finish()
  await flushPromises()
  expect(wrapper.find('.editor').exists()).toBe(false)
  await wrapper.find('.submission-row').trigger('click')
  await flushPromises()
  await wrapper
    .findAll('.tree-item')
    .find((node) => node.text() === '1) FtsZ')!
    .trigger('click')
  expect((wrapper.findComponent(SurveyComponent).props('model') as Model).getValue('title')).toBe(
    'Persist this title',
  )
  expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'PATCH')).toHaveLength(1)
  wrapper.unmount()
})

it('serializes autosaves and preserves edits made while the first request is pending', async () => {
  const writes: { revision: number; answers: Record<string, unknown> }[] = []
  let finish!: () => void
  const { wrapper, model } = await editingWorkspace(async (init) => {
    const body = JSON.parse(String(init.body))
    writes.push(body)
    if (writes.length === 1)
      await new Promise<void>((resolve) => {
        finish = resolve
      })
    return Response.json({
      ...depositionFixture,
      revision: body.revision + 1,
      answers: body.answers,
    })
  })
  model.setValue('title', 'First')
  await flushPromises()
  expect(writes).toHaveLength(1)
  model.setValue('title', 'Second')
  await flushPromises()
  expect(writes).toHaveLength(1)
  finish()
  await flushPromises()
  expect(writes.map((write) => [write.revision, write.answers.title])).toEqual([
    [0, 'First'],
    [1, 'Second'],
  ])
  expect(model.getValue('title')).toBe('Second')
  expect(wrapper.findComponent(SurveyComponent).props('model')).toBe(model)
  expect(wrapper.find('.editor-toolbar').text()).toContain(t('Draft saved'))
  wrapper.unmount()
})

it('keeps the editor and unsaved input when persistence fails', async () => {
  const { wrapper, model } = await editingWorkspace(async () => {
    throw new Error('Save unavailable')
  })
  model.setValue('title', 'Keep my input')
  await flushPromises()
  await wrapper.find('.topbar-back').trigger('click')
  await flushPromises()
  expect(wrapper.find('.editor').exists()).toBe(true)
  expect(model.getValue('title')).toBe('Keep my input')
  expect(wrapper.find('.editor-toolbar').text()).not.toContain(t('Draft saved'))
  expect(wrapper.find('[role="alert"]').text()).toContain('Save unavailable')
  wrapper.unmount()
})

it('saves a new contact only after its record identity has been assigned', async () => {
  const records: Record<string, unknown>[][] = []
  const { wrapper, model } = await editingWorkspace(async (init) => {
    const body = JSON.parse(String(init.body))
    records.push(body.answers.contact__pdbx_contact_author)
    return Response.json({
      ...depositionFixture,
      revision: body.revision + 1,
      answers: body.answers,
    })
  })
  const contacts = model.getQuestionByName(
    'contact__pdbx_contact_author',
  ) as QuestionPanelDynamicModel
  contacts.addPanel()
  await flushPromises()
  expect(records).toHaveLength(1)
  expect(records[0]![0]!.recordId).toEqual(expect.any(String))
  expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  wrapper.unmount()
})

it('flushes the draft before navigating to settings', async () => {
  let finish!: () => void
  const { wrapper, model, router } = await editingWorkspace(async (init) => {
    const body = JSON.parse(String(init.body))
    await new Promise<void>((resolve) => {
      finish = resolve
    })
    return Response.json({ ...depositionFixture, revision: 1, answers: body.answers })
  })
  model.setValue('title', 'Before settings')
  await flushPromises()
  const navigation = router.push('/settings')
  await flushPromises()
  expect(router.currentRoute.value.path).toBe('/')
  expect(wrapper.find('.editor').exists()).toBe(true)
  finish()
  await navigation
  await flushPromises()
  expect(router.currentRoute.value.path).toBe('/settings')
  wrapper.unmount()
})

it('persists changes before the outer logout ends the session', async () => {
  let finish!: () => void
  const { wrapper, model, fetchMock, router } = await editingWorkspace(async (init) => {
    const body = JSON.parse(String(init.body))
    await new Promise<void>((resolve) => {
      finish = resolve
    })
    return Response.json({ ...depositionFixture, revision: 1, answers: body.answers })
  })
  model.setValue('title', 'Before logout')
  await wrapper.find('.account-info button').trigger('click')
  await flushPromises()
  expect(fetchMock.mock.calls.some(([path]) => path === '/api/auth/logout')).toBe(false)
  finish()
  await flushPromises()
  expect(fetchMock.mock.calls.some(([path]) => path === '/api/auth/logout')).toBe(true)
  expect(router.currentRoute.value.path).toBe('/login')
  wrapper.unmount()
})
