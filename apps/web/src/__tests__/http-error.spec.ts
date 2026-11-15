import { afterEach, expect, it } from 'vitest'
import { httpError } from '../data/http-error'
import { setLocale } from '../locales'

afterEach(() => setLocale('zh'))

it('explains an OpenResty 413 in both languages without displaying its HTML error page', async () => {
  for (const [locale, message] of [
    ['zh', '文件超过服务器上传大小限制。'],
    ['en', 'The file exceeds the server upload limit.'],
  ] as const) {
    setLocale(locale)
    const error = await httpError(
      new Response('<html><h1>413 Request Entity Too Large</h1><center>openresty</center></html>', {
        status: 413,
        statusText: 'Request Entity Too Large',
        headers: { 'content-type': 'text/html' },
      }),
    )
    expect(error.message).toBe('HTTP 413 Request Entity Too Large\n' + message)
  }
})

it('preserves API error details for other failures', async () => {
  const error = await httpError(
    new Response(JSON.stringify({ message: 'Coordinate has no atoms' }), {
      status: 400,
      statusText: 'Bad Request',
      headers: { 'content-type': 'application/json' },
    }),
  )
  expect(error.message).toBe('HTTP 400 Bad Request\nCoordinate has no atoms')
})
