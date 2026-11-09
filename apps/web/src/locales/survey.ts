import {
  getProfileDefinition,
  type DepositionProfile,
  type Element,
} from '@onedep/shared/deposition'
import type { Model } from 'survey-core'
import 'survey-core/i18n/simplified-chinese'
import { locale, translations } from './index'
const keys = new Set([
  'title',
  'description',
  'placeholder',
  'panelAddText',
  'panelRemoveText',
  'removePanelText',
  'text',
  'labelTrue',
  'labelFalse',
  'html',
])
export function localizeSurvey(model: Model, profile: DepositionProfile) {
  const data = structuredClone(model.data)
  const recordChoices = new Set<string>()
  function collect(elements: Element[]) {
    for (const e of elements) {
      if (e.type === 'panel') collect(e.elements)
      else if (e.type === 'paneldynamic') collect(e.templateElements)
      else if (e.x.choiceSource?.kind === 'records') recordChoices.add(e.name)
    }
  }
  collect(getProfileDefinition(profile).pages.flatMap((p) => p.elements))
  function translate(value: unknown, key = ''): unknown {
    if (typeof value === 'string' && key === 'addPanelText') {
      const label = translations(value.slice('Add '.length))
      const pattern = translations('Add {label}')
      return {
        default: pattern.en.replace('{label}', label.en),
        en: pattern.en.replace('{label}', label.en),
        'zh-cn': pattern.zh.replace('{label}', label.zh),
      }
    }
    if (typeof value === 'string' && keys.has(key) && value.trim()) {
      const text = translations(value)
      return { default: text.en, en: text.en, 'zh-cn': text.zh }
    }
    if (Array.isArray(value))
      return value.map((item) =>
        key === 'choices' && typeof item === 'string'
          ? { value: item, text: translate(item, 'text') }
          : translate(item),
      )
    if (value && typeof value === 'object') {
      const object = value as Record<string, unknown>
      return Object.fromEntries(
        Object.entries(object).map(([k, v]) => [
          k,
          k === 'choices' && typeof object.name === 'string' && recordChoices.has(object.name)
            ? v
            : translate(v, k),
        ]),
      )
    }
    return value
  }
  // Install both display languages once; switching locale keeps the same form and answers.
  model.fromJSON(translate(model.toJSON()))
  model.data = data
  model.locale = locale.value === 'zh' ? 'zh-cn' : 'en'
}
