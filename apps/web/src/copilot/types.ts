export type { Snapshot, Advice, Mode } from '@onedep/shared/copilot'
import type { Advice, Mode } from '@onedep/shared/copilot'
export type View = 'intro' | 'dot' | 'hint' | 'panel' | 'settings'
export type AgentState = {
  view: View
  phase: 'idle' | 'loading' | 'ready' | 'error'
  result: Advice | null
  error: string
  idle: number
  discarded: number
  mode: Mode
  source: 'llm'
  requestMs: number | null
}
