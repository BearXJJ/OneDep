import { adviceSchema, type Advice, type Mode, type Snapshot } from '@onedep/shared/copilot'
import { httpError } from '@/data/http-error'
export async function callResponses(
  depositionId: number,
  snapshot: Snapshot,
  mode: Mode | 'test',
  signal: AbortSignal,
): Promise<Advice> {
  const response = await fetch(`/api/depositions/${depositionId}/copilot`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ snapshot, mode }),
    signal,
  })
  if (!response.ok) throw await httpError(response)
  return adviceSchema.parse(await response.json())
}
export function fingerprint(snapshot: Snapshot) {
  const { focusId, ...content } = snapshot
  void focusId
  return JSON.stringify(content)
}
