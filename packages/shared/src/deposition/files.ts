import { z } from "zod";
import { profiles, type DepositionProfile } from "./definition.js";
import type { ContractIssue, ValidationMode } from "./questionnaire.js";

export const fileRoles = [
  "COORDINATE",
  "STRUCTURE_FACTOR",
  "EM_MAP",
  "EM_HALF_MAP",
  "EM_IMAGE",
] as const;
export type FileRole = (typeof fileRoles)[number];
export interface FileRequirement {
  role: FileRole;
  count: number;
  extensions: readonly string[];
}
const coordinate: FileRequirement = {
  role: "COORDINATE",
  count: 1,
  extensions: [".cif", ".mmcif", ".pdb"],
};
const requirements: Record<DepositionProfile, readonly FileRequirement[]> = {
  XRAY: [
    coordinate,
    {
      role: "STRUCTURE_FACTOR",
      count: 1,
      extensions: [".cif", ".mmcif", ".mtz"],
    },
  ],
  EM_SINGLE_PARTICLE: [
    coordinate,
    { role: "EM_MAP", count: 1, extensions: [".map", ".map.gz"] },
    // This supported scenario has one pair, identified by slots 1 and 2.
    { role: "EM_HALF_MAP", count: 2, extensions: [".map", ".map.gz"] },
    { role: "EM_IMAGE", count: 1, extensions: [".png"] },
  ],
};
export function getFileRequirements(
  profile: DepositionProfile,
): readonly FileRequirement[] {
  z.enum(profiles).parse(profile);
  return structuredClone(requirements[profile]);
}
const manifestSchema = z.array(
  z.strictObject({
    id: z.string().min(1),
    role: z.enum(fileRoles),
    slot: z.number().int().positive(),
    originalName: z.string().min(1),
  }),
);
export type FileReference = z.infer<typeof manifestSchema>[number];

// References to persisted uploads. API integration must check ownership and
// inspect file contents; an accepted extension is not proof of valid contents.
export function validateFileManifest(
  profile: DepositionProfile,
  input: unknown,
  mode: ValidationMode = "draft",
): ContractIssue[] {
  const required = getFileRequirements(profile);
  const result = manifestSchema.safeParse(input);
  if (!result.success)
    return result.error.issues.map((issue) => ({
      path: ["files", ...issue.path.map(String)],
      code: issue.code,
      message: issue.message,
    }));
  const issues: ContractIssue[] = [];
  const ids = new Set<string>();
  const occupied = new Set<string>();
  result.data.forEach((file, index) => {
    const path = ["files", index];
    const rule = required.find((item) => item.role === file.role);
    const slotKey = file.role + ":" + file.slot;
    if (ids.has(file.id))
      issues.push({
        path,
        code: "duplicate_file",
        message: "One upload cannot fill two slots.",
      });
    if (occupied.has(slotKey))
      issues.push({
        path,
        code: "duplicate_slot",
        message: "This file slot is already occupied.",
      });
    ids.add(file.id);
    occupied.add(slotKey);
    if (!rule) {
      issues.push({
        path,
        code: "unsupported_role",
        message: "File role is not supported by this profile.",
      });
    } else {
      if (file.slot > rule.count)
        issues.push({
          path,
          code: "invalid_slot",
          message: "File slot exceeds the supported count.",
        });
      if (
        !rule.extensions.some((extension) =>
          file.originalName.toLowerCase().endsWith(extension),
        )
      ) {
        issues.push({
          path,
          code: "invalid_extension",
          message: "File extension does not match the selected role.",
        });
      }
    }
  });
  if (mode === "complete") {
    for (const rule of required) {
      for (let slot = 1; slot <= rule.count; slot++) {
        if (!occupied.has(rule.role + ":" + slot))
          issues.push({
            path: ["files", rule.role, slot],
            code: "missing_file",
            message: "A required file slot is empty.",
          });
      }
    }
  }
  return issues;
}
