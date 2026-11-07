import type {
  Answers,
  CheckRun,
  ValueOrigin,
  DepositionProfile,
} from "./deposition/index.js";
export type UserRole = "SUBMITTER" | "REVIEWER" | "ADMIN";
export type RegistrationRole = Exclude<UserRole, "ADMIN">;

export interface AuthUser {
  id: number;
  email: string;
  name: string;
  orcid: string | null;
  institution: string | null;
  country: string | null;
  role: UserRole;
}

export interface AdminUser extends AuthUser {
  createdAt: string;
}

export type DepositionStatus = "DRAFT" | "SUBMITTED";
export type DepositionMethod =
  "XRAY" | "EM" | "NMR" | "NEUTRON" | "EC" | "SSNMR" | "FIBER";
export type DepositionFileKind =
  "COORDINATE" | "STRUCTURE_FACTOR" | "EM_MAP" | "EM_HALF_MAP" | "EM_IMAGE";
export type EmSubtype =
  "HELICAL" | "SINGLE_PARTICLE" | "SUBTOMOGRAM" | "TOMOGRAPHY";
export type AccessionCode = "PDB" | "EMDB" | "BMRB";
export type EmMapStatus = "NEW_MAP" | "STRUCTURE_FACTORS_ONLY" | "PREVIOUS";

export interface DepositionCreationOptions {
  methods: DepositionMethod[];
  emSubtype: EmSubtype | null;
  coordinates: boolean | null;
  emMapStatus: EmMapStatus | null;
  relatedEmdb: string;
  compositeMap: boolean | null;
  nmrDataPreviouslyDeposited: boolean | null;
  relatedBmrb: string;
  accessionCodes: AccessionCode[];
}


export interface DepositionFile {
  id: number;
  kind: DepositionFileKind;
  slot: number;
  revision: number;
  parseState: string;
  parseError: string | null;
  facts: unknown;
  conflicts?: string[];
  originalName: string;
  mimeType: string;
  size: number;
  checksum: string;
  createdAt: string;
}

export interface DepositionCompletion {
  completed: number;
  total: number;
  percent: number;
  missing: string[];
}

export interface DepositionSummary {
  id: number;
  code: string;
  method: DepositionMethod;
  methods: DepositionMethod[];
  status: DepositionStatus;
  title: string | null;
  updatedAt: string;
  submittedAt: string | null;
  completion: DepositionCompletion;
}

export interface DepositionDetail extends DepositionSummary {
  creation: DepositionCreationOptions;
  profile: DepositionProfile;
  definitionRevision: number;
  revision: number;
  answers: Answers;
  origins: ValueOrigin[];
  checks: CheckRun[];
  submission: { id: string; checksum: string } | null;
  files: DepositionFile[];
}
