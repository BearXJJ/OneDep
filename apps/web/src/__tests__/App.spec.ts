import { afterEach, describe, it, expect, vi } from 'vitest'

import { flushPromises, mount } from '@vue/test-utils'
import App from '../App.vue'
import router from '../router'

describe('App', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('saves a message and shows when the list comes from Redis', async () => {
    const message = { id: 1, content: 'Hello OneDep', createdAt: '2026-10-07T00:00:00.000Z' }
    const fetchMock = vi
      .fn<(...args: unknown[]) => Promise<unknown>>()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ messages: [], source: 'postgres' }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => message })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ messages: [message], source: 'postgres' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ messages: [message], source: 'redis' }),
      })
    vi.stubGlobal('fetch', fetchMock)

    await router.push('/')
    await router.isReady()
    const wrapper = mount(App, { global: { plugins: [router] } })
    await flushPromises()

    await wrapper.find('#message-content').setValue('Hello OneDep')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(wrapper.text()).toContain('Hello OneDep')
    expect(wrapper.text()).toContain('PostgreSQL')

    await wrapper.find('button[type="button"]').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('Redis 缓存')
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/messages',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ content: 'Hello OneDep' }),
      }),
    )
  })
})
