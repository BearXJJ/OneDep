import type {
  DepositionCreationOptions,
  DepositionDetail,
  DepositionFileKind,
  DepositionSummary,
} from '@onedep/shared'
import type { Answers } from '@onedep/shared/deposition'
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/depositions${path}`, init)
  if (!response.ok) {
    const body = (await response.json()) as { message?: string | string[] }
    throw new Error(
      Array.isArray(body.message) ? body.message.join('；') : (body.message ?? '请求失败'),
    )
  }
  return (response.status === 204 ? undefined : await response.json()) as T
}
const json = (data: unknown) => ({
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(data),
})
export const listDepositions = () => request<DepositionSummary[]>('')
export const createDeposition = (options: DepositionCreationOptions) =>
  request<DepositionDetail>('', { method: 'POST', ...json(options) })
export const getDeposition = (id: number) => request<DepositionDetail>(`/${id}`)
export const saveDeposition = (id: number, revision: number, answers: Answers) =>
  request<DepositionDetail>(`/${id}`, { method: 'PATCH', ...json({ revision, answers }) })
export const submitDeposition = (id: number, revision: number) =>
  request<DepositionDetail>(`/${id}/submit`, { method: 'POST', ...json({ revision }) })
export const checkDeposition = (id: number, revision: number) =>
  request<DepositionDetail>(`/${id}/check`, { method: 'POST', ...json({ revision }) })
export const reparseDeposition = (id: number, fileId: number, revision: number) =>
  request<DepositionDetail>(`/${id}/reparse/${fileId}`, { method: 'POST', ...json({ revision }) })
export function uploadDepositionFile(
  id: number,
  kind: DepositionFileKind,
  slot: number,
  revision: number,
  file: File,
) {
  const body = new FormData()
  body.append('file', file)
  return request<DepositionDetail>(`/${id}/files/${kind}/${slot}?revision=${revision}`, {
    method: 'POST',
    body,
  })
}
export const removeDepositionFile = (id: number, fileId: number, revision: number) =>
  request<void>(`/${id}/files/${fileId}?revision=${revision}`, { method: 'DELETE' })
export const depositionFileUrl = (id: number, fileId: number) =>
  `/api/depositions/${id}/files/${fileId}`
