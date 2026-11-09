import { ref } from 'vue'
import catalog from './messages.json'
export type Locale = 'zh' | 'en'
const saved = localStorage.getItem('onedep.locale')
if (saved !== null && saved !== 'zh' && saved !== 'en')
  throw new Error('Invalid saved interface language')
export const locale = ref<Locale>(saved === null ? 'zh' : saved)
document.documentElement.lang = locale.value === 'zh' ? 'zh-CN' : 'en'
export function setLocale(value: Locale) {
  locale.value = value
  localStorage.setItem('onedep.locale', value)
  document.documentElement.lang = value === 'zh' ? 'zh-CN' : 'en'
}
export function translations(source: string): { zh: string; en: string } {
  const key = source.replace(/\s+/g, ' ').trim()
  const value = (catalog as Record<string, { zh: string | null; en: string | null }>)[key]
  if (!value || value.zh === null || value.en === null)
    throw new Error('Missing translation: ' + key)
  return { zh: value.zh, en: value.en }
}
export function t(source: string): string {
  return translations(source)[locale.value]
}
export const localeTag = () => (locale.value === 'zh' ? 'zh-CN' : 'en-US')
