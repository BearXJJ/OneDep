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
  orcid: string;
  institution: string;
  country: string;
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
export type CitationStatus =
  "UNPUBLISHED" | "IN_PREPARATION" | "SUBMITTED" | "PUBLISHED";
export type ReleaseStatus =
  "IMMEDIATE" | "HOLD_FOR_PUBLICATION" | "HOLD_UNTIL_DATE";
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

export interface DepositionMetadata {
  entry: {
    title: string;
    keywords: string;
    relatedDataDoi: string;
  };
  contact: {
    name: string;
    email: string;
    orcid: string;
    institution: string;
    country: string;
  };
  authors: string[];
  citation: {
    status: CitationStatus;
    title: string;
    journal: string;
    doi: string;
  };
  macromolecule: {
    name: string;
    type: string;
    chainIds: string;
    sequence: string;
    sourceOrganism: string;
    taxonomyId: string;
    expressionHost: string;
    mutations: string;
  };
  assembly: {
    oligomericState: string;
    description: string;
    evidence: string;
  };
  xray: {
    crystallizationMethod: string;
    crystallizationPh: string;
    crystallizationTemperature: string;
    spaceGroup: string;
    resolution: string;
  };
  release: {
    status: ReleaseStatus;
    holdUntil: string;
    termsAccepted: boolean;
  };
}

export interface DepositionFile {
  id: number;
  kind: DepositionFileKind;
  slot: number;
  revision: number;
  parseState: string;
  parseError: string | null;
  facts: unknown;
  conflicts: string[];
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
  title: string;
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
