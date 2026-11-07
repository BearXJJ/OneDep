// Shared transport and definition contract for the two local demo profiles.
// Native question properties are forwarded to SurveyJS. x is removed by the adapter.
// Shape validation comes from these question types; business rules stay in SurveyJS.
export type Expr = string; // SurveyJS expression syntax, never arbitrary JavaScript
export type Scalar = string | number | boolean;
export type Address = { collection?: string; recordId?: string; field: string };
export type Evidence = { file: string; field?: string; note?: string };
export type Choice = { value: string | number; text: string; visibleIf?: Expr };
export type ChoiceSource =
  | { kind: "dictionary"; id: string; filterBy?: string }
  | { kind: "records"; collection: string; labelField: string }
  | { kind: "lookup"; adapterId: string; dependsOn?: string[] };
// Inline choices use SurveyJS choices; ChoiceSource covers externally supplied choices.
export type Binding = {
  adapterId: "cif";
  tag: string;
  rowKey?: string;
  direction: "read" | "write" | "both";
};
export interface FieldMeta {
  source: Evidence[];
  choiceSource?: ChoiceSource;
  bindings?: Binding[];
  unit?: string;
  // Unknown requirement is recorded, never silently converted to required=false.
  requirementEvidence: "confirmed" | "unconfirmed";
  // A controlled ID for domain conversion; implementation is in the adapter registry.
  normalizerId?: string;
}
export type Validator =
  | { type: "regex"; regex: string; text: string }
  | { type: "numeric"; minValue?: number; maxValue?: number; text: string }
  | { type: "expression"; expression: Expr; text: string }
  | { type: "text"; minLength?: number; maxLength?: number; text: string };
export interface QuestionBase {
  name: string;
  title: string;
  description?: string;
  isRequired?: boolean;
  requiredIf?: Expr;
  visibleIf?: Expr;
  enableIf?: Expr;
  visible?: boolean;
  readOnly?: boolean;
  validators?: Validator[];
  x: FieldMeta;
}
export type Question =
  | (QuestionBase & {
      type: "text";
      inputType?: "text" | "number" | "email" | "date" | "url";
      min?: number;
      max?: number;
      maxLength?: number;
    })
  | (QuestionBase & { type: "comment"; maxLength?: number })
  | (QuestionBase & { type: "boolean" })
  | (QuestionBase & { type: "dropdown" | "radiogroup"; choices?: Choice[] })
  | (QuestionBase & { type: "checkbox"; choices?: Choice[] });
export type Element = Question | Group | Repeat;
export interface Group {
  type: "panel";
  name: string;
  title: string;
  visibleIf?: Expr;
  elements: Element[];
}
export interface Repeat {
  type: "paneldynamic";
  name: string;
  title: string;
  keyName: "recordId";
  minPanelCount?: number;
  maxPanelCount?: number;
  allowAddPanel: boolean;
  allowRemovePanel: boolean;
  templateElements: Element[];
  x: {
    source: Evidence[];
    origin: "user" | "parsed";
    bindings?: { adapterId: "cif"; category: string; key: string }[];
  };
}
export interface FileRequirement {
  role: string;
  title: string;
  min: number;
  max: number;
  extensions: string[];
  parserId: string;
  checks: string[];
  source: Evidence[];
}
export interface ProfileDefinition {
  id: string;
  revision: number;
  title: string;
  // Only the two confirmed scenarios are registered; method != submitted content.
  scenario: Record<string, Scalar>;
  pages: { name: string; title: string; elements: Element[] }[];
  files: FileRequirement[];
  checks: {
    id: string;
    adapterId: string;
    requiredFor: ("submit" | "export")[];
  }[];
}
export type Answer = Scalar | Scalar[] | AnswerRecord[];
export interface AnswerRecord {
  recordId: string;
  [field: string]: Answer;
}
export interface FileRef {
  id: string;
  role: string;
  slot: number;
  revision: number;
  originalName: string;
  sha256: string;
  size: number;
  // File bytes and server storage paths are not part of client answer JSON.
}
export interface ValueOrigin {
  address: Address;
  source: "file" | "user";
  fileId?: string;
  fileRevision?: number;
  tag?: string;
  sourceRowKey?: string;
}
export interface DepositionDraft {
  profileId: string;
  definitionRevision: number;
  revision: number;
  status: "DRAFT" | "SUBMITTED";
  answers: Record<string, Answer>;
  files: FileRef[];
  origins: ValueOrigin[];
}
export interface Issue {
  code: string;
  severity: "error" | "warning";
  message: string;
  address?: Address;
  fileId?: string;
  checkId: string;
}
export interface CheckRun {
  id: string;
  checkId: string;
  inputRevision: number;
  definitionRevision: number;
  state: "pending" | "running" | "succeeded" | "failed" | "unavailable";
  // succeeded means the process completed. issues can still contain blocking errors.
  issues: Issue[];
  error?: string;
}
export interface ParsePatch {
  fileId: string;
  fileRevision: number;
  values: {
    address: Address;
    value: Answer;
    tag: string;
    sourceRowKey?: string;
  }[];
  records: { collection: string; recordId: string; sourceRowKey: string }[];
  issues: Issue[];
}
export interface SubmissionSnapshot {
  id: string;
  draftRevision: number;
  definitionRevision: number;
  // Immutable copy; changing files/answers requires a new revision before submission.
  draft: DepositionDraft;
  checks: CheckRun[];
  exports: { fileId: string; sha256: string; format: "mmcif" | "zip" }[];
}
// Answers keep SurveyJS flat dynamic-panel records; recordId is a reserved key.
// Draft retains inactive branch answers; validation/export derive active fields.
// recordId is stable across add/remove/reorder; CIF row IDs remain adapter mappings.
