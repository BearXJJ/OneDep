import type { DepositionMethod } from '@onedep/shared'

export interface DepositionMethodOption {
  value: DepositionMethod
  label: string
  code: string
}

export const DEPOSITION_METHODS: DepositionMethodOption[] = [
  { value: 'XRAY', label: 'X 射线晶体衍射', code: 'X-RAY' },
  { value: 'EM', label: '电子显微镜', code: 'EM' },
  { value: 'NMR', label: '溶液核磁共振', code: 'NMR' },
  { value: 'NEUTRON', label: '中子衍射', code: 'NEUTRON' },
  { value: 'EC', label: '电子晶体学', code: 'EC' },
  { value: 'SSNMR', label: '固态核磁共振', code: 'SSNMR' },
  { value: 'FIBER', label: '纤维衍射', code: 'FIBER' },
]

export const METHOD_LABELS = Object.fromEntries(
  DEPOSITION_METHODS.map((method) => [method.value, method.label]),
) as Record<DepositionMethod, string>

export const METHOD_CODES = Object.fromEntries(
  DEPOSITION_METHODS.map((method) => [method.value, method.code]),
) as Record<DepositionMethod, string>

// 按官方展示顺序组合多种实验方法。
export function formatMethodLabels(methods: DepositionMethod[]): string {
  return methods.map((method) => METHOD_LABELS[method]).join(' + ')
}

// 在投递列表中用紧凑代码展示一种或多种实验方法。
export function formatMethodCodes(methods: DepositionMethod[]): string {
  if (methods.length <= 2) return methods.map((method) => METHOD_CODES[method]).join(' + ')
  return `${METHOD_CODES[methods[0]!]} +${methods.length - 1}`
}
