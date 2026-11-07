import type { NavigationNode, Answers, AnswerRecord } from '@onedep/shared/deposition'
export interface DepositionNavItem {
  id: string
  title: string
  page: string
  recordId?: string
  children?: DepositionNavItem[]
  extra: boolean
  state: 'complete' | 'missing' | 'link'
}
export interface PageProgress {
  total: number
  completed: number
  required: number
  requiredCompleted: number
  extra: boolean
}
export function depositionNavigation(
  nodes: NavigationNode[],
  answers: Answers,
  progress: Record<string, PageProgress>,
): DepositionNavItem[] {
  return nodes.map((node) => {
    const page = node.page === undefined ? node.id : node.page
    const item: DepositionNavItem = {
      id: node.id,
      title: node.title,
      page,
      extra: false,
      state: 'link',
    }
    const status = progress[page]
    if (status) {
      item.extra = status.extra
      item.state = status.requiredCompleted === status.required ? 'complete' : 'missing'
    }
    if (node.children) item.children = depositionNavigation(node.children, answers, progress)
    if (node.records) {
      const rows = answers[node.records]
      item.children =
        rows === undefined
          ? []
          : (rows as AnswerRecord[]).map((row, index) => ({
              id: node.id + ':' + row.recordId,
              page,
              recordId: row.recordId,
              title:
                typeof row.name === 'string' && row.name.length > 0
                  ? `${index + 1}) ${row.name}`
                  : `Molecule ${index + 1}`,
              extra: false,
              state: item.state,
            }))
      if (!item.children.length)
        item.children = [
          {
            id: node.id + ':empty',
            page,
            title: 'Macromolecule information',
            extra: false,
            state: 'missing',
          },
        ]
    }
    return item
  })
}
