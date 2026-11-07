export async function httpError(response: Response): Promise<Error> {
  const heading = 'HTTP ' + response.status + ' ' + response.statusText
  if (response.headers.get('content-type')?.includes('application/json')) {
    const body = (await response.json()) as { message: unknown }
    if (typeof body.message === 'string') return new Error(heading + '\n' + body.message)
    if (Array.isArray(body.message) && body.message.every((value) => typeof value === 'string')) {
      return new Error(heading + '\n' + body.message.join('\n'))
    }
    throw new Error('Invalid error response from ' + response.url + ': ' + JSON.stringify(body))
  }
  return new Error(heading + '\n' + (await response.text()))
}
