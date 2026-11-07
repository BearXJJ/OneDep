import type { Choice } from "./types.js";
export interface DisplayCondition {
  category: string;
  cif_item: string;
  value: string[];
  type: "equal" | "not_equal";
}
export interface CapturedField {
  kind: "field";
  name: string;
  category: string;
  title: string;
  type: "text" | "comment" | "dropdown" | "radiogroup" | "checkbox";
  required: boolean;
  conditions: DisplayCondition[];
  help?: string;
  placeholder?: string;
  maxLength?: number;
  regex?: string;
  inputType?: "text" | "number" | "email" | "date" | "url";
  choices?: Choice[];
  allowOther?: boolean;
}
export interface CapturedGroup {
  kind: "group";
  variant: string;
  name: string;
  category: string;
  title: string;
  repeat: boolean;
  conditions: DisplayCondition[];
  elements: CapturedElement[];
}
export type CapturedElement = CapturedField | CapturedGroup;
export interface NavigationNode {
  id: string;
  title: string;
  children?: NavigationNode[];
  records?: string;
  page?: string;
}
export interface CapturedProfile {
  navigation: NavigationNode[];
  pages: { name: string; title: string; elements: CapturedElement[] }[];
}
export type CapturedProfiles = Record<"xray" | "em", CapturedProfile>;
