import {
  Model,
  QuestionPanelDynamicModel,
  type Question as SurveyQuestion,
} from "survey-core";
import { z } from "zod";
import {
  getProfileDefinition,
  profiles,
  type DepositionProfile,
} from "./definition.js";
import type {
  Element,
  Question,
  Answer,
  AnswerRecord,
  Address,
  ValueOrigin,
} from "./types.js";
export type { AnswerRecord } from "./types.js";
export type Answers = Record<string, Answer>;
export interface QuestionnaireDraft {
  profile: DepositionProfile;
  answers: Answers;
}
export interface ContractIssue {
  path: Array<string | number>;
  code: string;
  message: string;
}
export type ValidationMode = "draft" | "complete";
function fieldShape(field: Question): z.ZodType {
  if (field.name === "recordId") return z.string().min(1);
  switch (field.type) {
    case "text":
      return (
        field.inputType === "number" ? z.number() : z.string()
      ).optional();
    case "comment":
      return z.string().optional();
    case "boolean":
      return z.boolean().optional();
    case "dropdown":
    case "radiogroup":
      return z.union([z.string(), z.number()]).optional();
    case "checkbox":
      return z.array(z.union([z.string(), z.number()])).optional();
    default:
      throw new Error("Unknown question type");
  }
}
function shape(elements: Element[]): Record<string, z.ZodType> {
  const result: Record<string, z.ZodType> = {};
  for (const field of elements) {
    if (field.type === "panel") Object.assign(result, shape(field.elements));
    else if (field.type === "paneldynamic")
      result[field.name] = z
        .array(z.strictObject(shape(field.templateElements)))
        .superRefine((rows, ctx) => {
          const ids = new Set();
          rows.forEach((row, i) => {
            if (ids.has(row.recordId))
              ctx.addIssue({
                code: "custom",
                path: [i, "recordId"],
                message: "Duplicate record ID.",
              });
            ids.add(row.recordId);
          });
        })
        .optional();
    else result[field.name] = fieldShape(field);
  }
  return result;
}
export function parseQuestionnaireDraft(input: unknown): QuestionnaireDraft {
  const envelope = z
    .strictObject({ profile: z.enum(profiles), answers: z.unknown() })
    .parse(input);
  return {
    ...envelope,
    answers: z
      .strictObject(
        shape(
          getProfileDefinition(envelope.profile).pages.flatMap(
            (p) => p.elements,
          ),
        ),
      )
      .parse(envelope.answers) as Answers,
  };
}
function native(elements: Element[], mode: ValidationMode): unknown[] {
  return elements.map((element) => {
    if (element.type === "panel")
      return {
        ...element,
        state: "expanded",
        elements: native(element.elements, mode),
      };
    const { x: _, ...field } = element;
    if (element.type === "paneldynamic")
      return {
        ...field,
        minPanelCount: 0,
        panelCount: 0,
        panelAddText: "Add " + element.title,
        panelRemoveText: "Remove",
        isRequired: mode === "complete" && !!element.minPanelCount,
        templateElements: native(element.templateElements, mode),
      };
    return {
      ...field,
      storeOthersAsComment: false,
      ...(mode === "draft"
        ? {
            isRequired: false,
            requiredIf: undefined,
            validators: element.validators?.filter(
              (v) => v.type !== "expression",
            ),
          }
        : {}),
    };
  });
}
export function createQuestionnaire(
  profile: DepositionProfile,
  answers: Answers = {},
  mode: ValidationMode = "complete",
): Model {
  const draft = parseQuestionnaireDraft({ profile, answers });
  const model = new Model({
    clearInvisibleValues: "none",
    showQuestionNumbers: "off",
    checkErrorsMode: "onComplete",
    showCompletedPage: false,
    pages: getProfileDefinition(profile).pages.map((page) => ({
      ...page,
      elements: native(page.elements, mode),
    })),
  });
  const recordChoices = new Map<
    string,
    { collection: string; labelField: string }
  >();
  function collectSources(elements: Element[]) {
    for (const e of elements) {
      if (e.type === "panel") collectSources(e.elements);
      else if (e.type === "paneldynamic") collectSources(e.templateElements);
      else if (e.x.choiceSource?.kind === "records")
        recordChoices.set(e.name, e.x.choiceSource);
    }
  }
  collectSources(
    getProfileDefinition(profile).pages.flatMap((p) => p.elements),
  );
  function refreshChoices() {
    function update(q: SurveyQuestion) {
      if (q instanceof QuestionPanelDynamicModel) {
        q.panels.forEach((p) => p.questions.forEach(update));
        return;
      }
      const source = recordChoices.get(q.name);
      if (!source) return;
      const value = model.getValue(source.collection);
      const rows: AnswerRecord[] = value === undefined ? [] : value;
      const choices = rows.map((row, index) => ({
        value: row.recordId,
        text:
          String(index + 1) +
          (typeof row[source.labelField] === "string"
            ? " · " + row[source.labelField]
            : ""),
      }));
      if (source.collection === "emsample__em_entity_assembly") {
        const name = model.getValue("em_entity_assembly__name");
        if (typeof name === "string" && name.length)
          choices.push({ value: "1", text: name });
      }
      (
        q as SurveyQuestion & { choices: { value: string; text: string }[] }
      ).choices = choices;
    }
    model.getAllQuestions().forEach(update);
  }
  model.keepIncorrectValues = true;
  model.data = structuredClone(draft.answers);
  model.onValueChanged.add(refreshChoices);
  model.onDynamicPanelRemoved.add(refreshChoices);
  refreshChoices();
  model.onDynamicPanelAdded.add((_, e) => {
    const q = e.panel.getQuestionByName("recordId");
    if (q && !q.value) q.value = globalThis.crypto.randomUUID();
  });
  return model;
}
export function validateQuestionnaire(
  input: unknown,
  mode: ValidationMode = "draft",
): ContractIssue[] {
  const draft = parseQuestionnaireDraft(input);
  const model = createQuestionnaire(draft.profile, draft.answers, mode);
  try {
    model.validate();
    const issues: ContractIssue[] = [];
    function collect(q: SurveyQuestion, path: (string | number)[]) {
      if (!q.isVisible || !q.isParentVisible) return;
      issues.push(
        ...q.errors.map((e) => ({
          path: ["answers", ...path],
          code: e.getErrorType(),
          message: `${q.title}: ${e.getText()}`,
        })),
      );
      if (q instanceof QuestionPanelDynamicModel)
        q.panels.forEach((p, i) =>
          p.questions.forEach((c) => collect(c, [...path, i, c.name])),
        );
    }
    model.getAllQuestions().forEach((q) => collect(q, [q.name]));
    // Choice visibility is a native SurveyJS expression. Keep invalid old values,
    // but reject them at validation instead of letting SurveyJS clear them.
    function choices(q: SurveyQuestion, path: (string | number)[]) {
      if (!q.isVisible || !q.isParentVisible) return;
      if (q instanceof QuestionPanelDynamicModel) {
        q.panels.forEach((p, i) =>
          p.questions.forEach((c) => choices(c, [...path, i, c.name])),
        );
        return;
      }
      const select = q as SurveyQuestion & {
        visibleChoices?: { value: unknown }[];
        hasOther?: boolean;
      };
      if (
        select.visibleChoices &&
        !select.hasOther &&
        q.value !== undefined &&
        q.value !== null
      ) {
        const values = Array.isArray(q.value) ? q.value : [q.value];
        if (
          values.some((v) => !select.visibleChoices!.some((c) => c.value === v))
        )
          issues.push({
            path: ["answers", ...path],
            code: "invalid_choice",
            message: `${q.title}: 当前选项已失效，请重新选择。`,
          });
      }
    }
    model.getAllQuestions().forEach((q) => choices(q, [q.name]));
    return issues;
  } finally {
    model.dispose();
  }
}
export function activeAnswers(
  profile: DepositionProfile,
  answers: Answers,
): Answers {
  const model = createQuestionnaire(profile, answers);
  function read(q: SurveyQuestion): Answer | undefined {
    if ((!q.isVisible || !q.isParentVisible) && q.name !== "recordId") return;
    if (q instanceof QuestionPanelDynamicModel)
      return q.panels.map(
        (p) =>
          Object.fromEntries(
            p.questions
              .map((c) => [c.name, read(c)])
              .filter(([, v]) => v !== undefined),
          ) as AnswerRecord,
      );
    return q.value as Answer | undefined;
  }
  try {
    return Object.fromEntries(
      model
        .getAllQuestions()
        .map((q) => [q.name, read(q)])
        .filter(([, v]) => v !== undefined),
    ) as Answers;
  } finally {
    model.dispose();
  }
}
export interface FieldBinding {
  field: string;
  group?: string;
  recordKey?: string;
  key?: string;
  tag: string;
  readOnly?: boolean;
  inputType?: string;
  direction: string;
}
export function getCifBindings(profile: DepositionProfile): FieldBinding[] {
  const result: FieldBinding[] = [];
  function walk(elements: Element[], group?: string, recordKey?: string) {
    for (const el of elements) {
      if (el.type === "panel") walk(el.elements, group, recordKey);
      else if (el.type === "paneldynamic")
        walk(el.templateElements, el.name, el.x.bindings?.[0]?.key);
      else if (el.x.bindings)
        for (const b of el.x.bindings)
          result.push({
            field: el.name,
            group,
            recordKey,
            key: b.rowKey,
            tag: b.tag,
            readOnly: el.readOnly,
            inputType: el.type === "text" ? el.inputType : undefined,
            direction: b.direction,
          });
    }
  }
  walk(getProfileDefinition(profile).pages.flatMap((p) => p.elements));
  return result;
}
export function addressKey(a: Address): string {
  if (a.collection === undefined && a.recordId === undefined)
    return "//" + a.field;
  if (!a.collection || !a.recordId)
    throw new Error("Record address requires collection and recordId");
  return [a.collection, a.recordId, a.field].join("/");
}
export function flattenAnswers(
  answers: Answers,
): { address: Address; value: Answer }[] {
  return Object.entries(answers).flatMap(([field, value]) =>
    Array.isArray(value) && value.length > 0 && typeof value[0] === "object"
      ? (value as AnswerRecord[]).flatMap((row) =>
          Object.entries(row)
            .filter(([k]) => k !== "recordId")
            .map(([key, v]) => ({
              address: {
                collection: field,
                recordId: row.recordId,
                field: key,
              },
              value: v,
            })),
        )
      : [{ address: { field }, value }],
  );
}
export function userOrigins(
  previous: Answers,
  next: Answers,
  origins: ValueOrigin[],
): ValueOrigin[] {
  const before = new Map(
    flattenAnswers(previous).map((v) => [addressKey(v.address), v]),
  );
  const after = new Map(
    flattenAnswers(next).map((v) => [addressKey(v.address), v]),
  );
  const result = new Map(origins.map((o) => [addressKey(o.address), o]));
  for (const [key, value] of after)
    if (JSON.stringify(before.get(key)?.value) !== JSON.stringify(value.value))
      result.set(key, {
        ...result.get(key),
        address: value.address,
        source: "user",
      });
  for (const [key, value] of before)
    if (!after.has(key))
      result.set(key, {
        address: value.address,
        source: "user",
      });
  return [...result.values()];
}
