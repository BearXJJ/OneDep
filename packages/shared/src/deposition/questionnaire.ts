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
      return { ...element, elements: native(element.elements, mode) };
    const { x: _, ...field } = element;
    if (element.type === "paneldynamic")
      return {
        ...field,
        minPanelCount: 0,
        panelCount: 0,
        isRequired: mode === "complete" && !!element.minPanelCount,
        templateElements: native(element.templateElements, mode),
      };
    return {
      ...field,
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
  model.keepIncorrectValues = true;
  model.data = structuredClone(draft.answers);
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
  let draft: QuestionnaireDraft;
  try {
    draft = parseQuestionnaireDraft(input);
  } catch (e) {
    if (!(e instanceof z.ZodError)) throw e;
    return e.issues.map((i) => ({
      path: i.path.map((p) => (typeof p === "symbol" ? String(p) : p)),
      code: i.code,
      message: i.message,
    }));
  }
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
      };
      if (select.visibleChoices && q.value !== undefined && q.value !== null) {
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
      else
        for (const b of el.x.bindings ?? [])
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
  return [a.collection ?? "", a.recordId ?? "", a.field].join("/");
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
    flattenAnswers(previous).map((v) => [
      addressKey(v.address),
      JSON.stringify(v.value),
    ]),
  );
  const after = new Map(
    flattenAnswers(next).map((v) => [addressKey(v.address), v]),
  );
  const result = new Map(origins.map((o) => [addressKey(o.address), o]));
  for (const [key, value] of after)
    if (before.get(key) !== JSON.stringify(value.value))
      result.set(key, {
        ...result.get(key),
        address: value.address,
        source: "user",
      });
  for (const [key] of before)
    if (!after.has(key))
      result.set(key, {
        address: result.get(key)?.address ?? {
          field: key.split("/").slice(-1)[0]!,
        },
        source: "user",
      });
  return [...result.values()];
}
