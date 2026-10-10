import type {
  DepositionCreationOptions,
  DepositionDetail,
  DepositionFileKind,
  DepositionMetadata,
  DepositionSummary,
} from '@onedep/shared'

// 统一解析投递接口错误，使页面只处理业务状态。
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/depositions${path}`, init)
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { message?: string | string[] }
    const message = Array.isArray(body.message) ? body.message[0] : body.message
    throw new Error(message || '请求失败，请稍后再试')
  }
  return (response.status === 204 ? undefined : await response.json()) as T
}

export function listDepositions(): Promise<DepositionSummary[]> {
  return request<DepositionSummary[]>('')
}

export function createDeposition(options: DepositionCreationOptions): Promise<DepositionDetail> {
  return request<DepositionDetail>('', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options),
  })
}

export function getDeposition(id: number): Promise<DepositionDetail> {
  return request<DepositionDetail>(`/${id}`)
}

export function saveDeposition(
  id: number,
  metadata: DepositionMetadata,
): Promise<DepositionDetail> {
  return request<DepositionDetail>(`/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(metadata),
  })
}

export function submitDeposition(id: number): Promise<DepositionDetail> {
  return request<DepositionDetail>(`/${id}/submit`, { method: 'POST' })
}

export function uploadDepositionFile(
  id: number,
  kind: DepositionFileKind,
  file: File,
): Promise<DepositionDetail> {
  const body = new FormData()
  body.append('file', file)
  return request<DepositionDetail>(`/${id}/files/${kind}`, { method: 'POST', body })
}

export function removeDepositionFile(id: number, fileId: number): Promise<void> {
  return request<void>(`/${id}/files/${fileId}`, { method: 'DELETE' })
}

export function depositionFileUrl(id: number, fileId: number): string {
  return `/api/depositions/${id}/files/${fileId}`
}
