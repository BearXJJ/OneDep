import { afterEach, expect, it } from 'vitest'
import {
  createQuestionnaire,
  getProfileDefinition,
  type DepositionProfile,
  type Element,
  type Answers,
} from '@onedep/shared/deposition'
import { QuestionPanelDynamicModel } from 'survey-core'
import { localizeSurvey } from '../locales/survey'
import { setLocale, translations } from '../locales'
import catalog from '../locales/messages.json'
afterEach(() => setLocale('zh'))
it('provides both interface languages without changing embedded field expressions', () => {
  for (const [key, text] of Object.entries(catalog)) {
    expect(translations(key).en).toBeTruthy()
    expect(text.zh).toBeTruthy()
    expect(text.zh.match(/\{[^}]+\}/g)).toEqual(text.en.match(/\{[^}]+\}/g))
  }
})
for (const profile of ['XRAY', 'EM_SINGLE_PARTICLE'] as DepositionProfile[])
  it(`keeps ${profile} answers and record links while changing display language`, () => {
    const answers: Answers = {}
    function sources(elements: Element[]) {
      for (const e of elements) {
        if (e.type === 'panel') sources(e.elements)
        else if (e.type === 'paneldynamic') sources(e.templateElements)
        else if (e.x.choiceSource?.kind === 'records') {
          const source = e.x.choiceSource
          if (source.collection === 'emsample__em_entity_assembly') {
            answers.em_entity_assembly__name = 'Original sample A / 原始样本'
            continue
          }
          answers[source.collection] = [
            { recordId: 'qa-record', [source.labelField]: 'Original sample A / 原始样本' },
          ]
        }
      }
    }
    sources(getProfileDefinition(profile).pages.flatMap((p) => p.elements))
    const model = createQuestionnaire(profile, answers)
    const original = structuredClone(model.data)
    localizeSurvey(model, profile)
    expect(model.data).toEqual(original)
    const chineseTitle = model.pages[0]!.title
    model.locale = 'en'
    expect(model.pages[0]!.title).not.toBe(chineseTitle)
    expect(model.data).toEqual(original)
    model.locale = 'zh-cn'
    expect(model.pages[0]!.title).toBe(chineseTitle)
    const molecules = model
      .getAllQuestions()
      .find(
        (q) => q instanceof QuestionPanelDynamicModel && q.allowAddPanel,
      ) as QuestionPanelDynamicModel
    expect(molecules.panelAddText).not.toMatch(/^Add /)
    const panel = molecules.addPanel()
    expect(panel.getQuestionByName('recordId').value).toBeTruthy()
    model.dispose()
  })
