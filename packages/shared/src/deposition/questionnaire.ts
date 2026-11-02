import { Model, QuestionPanelDynamicModel, type Question } from "survey-core";
import { z } from "zod";
import {
  getQuestionnaireDefinition,
  profiles,
  type CifBinding,
  type DepositionProfile,
  type FieldDefinition,
} from "./definition.js";

export type AnswerRecord = {
  recordId: string;
  [field: string]: string | number;
};
export type Answers = Record<string, string | number | AnswerRecord[]>;
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

const envelopeSchema = z.strictObject({
  profile: z.enum(profiles),
  answers: z.unknown(),
});

// Zod guards transport shape and rejects unknown fields. SurveyJS owns business
// validation (required, formats, ranges); those rules are never duplicated here.
function fieldShape(field: FieldDefinition): z.ZodType {
  if (field.name === "recordId") return z.string().min(1);
  return (field.inputType === "number" ? z.number() : z.string()).optional();
}
function answersSchema(profile: DepositionProfile) {
  const shape: Record<string, z.ZodType> = {};
  for (const page of getQuestionnaireDefinition(profile).pages) {
    for (const question of page.elements) {
      if (question.type !== "paneldynamic") {
        shape[question.name] = fieldShape(question);
        continue;
      }
      const rowShape = Object.fromEntries(
        question.templateElements.map((field) => [
          field.name,
          fieldShape(field),
        ]),
      );
      shape[question.name] = z
        .array(z.strictObject(rowShape))
        .superRefine((rows, context) => {
          const seen = new Set<string>();
          rows.forEach((row, index) => {
            const id = row.recordId as string;
            if (seen.has(id))
              context.addIssue({
                code: "custom",
                path: [index, "recordId"],
                message: "Duplicate record ID.",
              });
            seen.add(id);
          });
        })
        .optional();
    }
  }
  return z.strictObject(shape);
}
export function parseQuestionnaireDraft(input: unknown): QuestionnaireDraft {
  const envelope = envelopeSchema.parse(input);
  return z
    .strictObject({
      profile: z.literal(envelope.profile),
      answers: answersSchema(envelope.profile),
    })
    .parse(input) as QuestionnaireDraft;
}

export function createQuestionnaire(
  profile: DepositionProfile,
  answers: Answers = {},
  mode: ValidationMode = "complete",
): Model {
  const draft = parseQuestionnaireDraft({ profile, answers });
  const definition = getQuestionnaireDefinition(draft.profile);
  const model = new Model({
    clearInvisibleValues: "none",
    showQuestionNumbers: "off",
    pages: definition.pages.map((page) => ({
      ...page,
      elements: page.elements.map((question) => {
        const { cif: _cif, ...properties } = question;
        if (question.type !== "paneldynamic") {
          return {
            ...properties,
            isRequired: mode === "complete" && question.isRequired,
          };
        }
        return {
          ...properties,
          panelCount: 0,
          isRequired: mode === "complete" && question.isRequired,
          templateElements: question.templateElements.map((field) => {
            const { cif: _binding, ...fieldProperties } = field;
            return {
              ...fieldProperties,
              isRequired: mode === "complete" && field.isRequired,
            };
          }),
        };
      }),
    })),
  });
  model.data = structuredClone(draft.answers);
  model.onDynamicPanelAdded.add((_sender, event) => {
    const identity = event.panel.getQuestionByName("recordId")!;
    if (!identity.value) identity.value = globalThis.crypto.randomUUID();
  });
  return model;
}

// "complete" covers this configured field slice, not every deposition page or
// scientific validation. Errors use answer paths so both API and UI can locate them.
export function validateQuestionnaire(
  input: unknown,
  mode: ValidationMode = "draft",
): ContractIssue[] {
  let draft: QuestionnaireDraft;
  try {
    draft = parseQuestionnaireDraft(input);
  } catch (error) {
    if (!(error instanceof z.ZodError)) throw error;
    return error.issues.map((issue) => ({
      path: issue.path.map((part) =>
        typeof part === "symbol" ? String(part) : part,
      ),
      code: issue.code,
      message: issue.message,
    }));
  }
  const model = createQuestionnaire(draft.profile, draft.answers, mode);
  try {
    model.validate();
    const issues: ContractIssue[] = [];
    function collect(question: Question, path: Array<string | number>) {
      issues.push(
        ...question.errors.map((error) => ({
          path: ["answers", ...path],
          code: error.getErrorType(),
          message: error.getText(),
        })),
      );
      if (question instanceof QuestionPanelDynamicModel) {
        question.panels.forEach((panel, index) => {
          panel.questions.forEach((child) =>
            collect(child, [...path, index, child.name]),
          );
        });
      }
    }
    model
      .getAllQuestions()
      .forEach((question) => collect(question, [question.name]));
    return issues;
  } finally {
    model.dispose();
  }
}

export interface FieldBinding extends CifBinding {
  field: string;
  group?: string;
  // Resolve through the parser's recordId -> original CIF key mapping, not index.
  recordKey?: string;
}
export function getCifBindings(profile: DepositionProfile): FieldBinding[] {
  return getQuestionnaireDefinition(profile).pages.flatMap((page) =>
    page.elements.flatMap((question) => {
      if (question.type !== "paneldynamic") {
        return question.cif ? [{ field: question.name, ...question.cif }] : [];
      }
      return question.templateElements.flatMap((field) =>
        field.cif
          ? [
              {
                field: field.name,
                group: question.name,
                recordKey: question.cif.key,
                ...field.cif,
              },
            ]
          : [],
      );
    }),
  );
}
