// Verified initial field slice, not the complete OneDep submission questionnaire.
// Tags come from the official OneDep page attributes; repeat keys from the
// PDBx/mmCIF dictionary: https://mmcif.wwpdb.org/dictionaries/mmcif_pdbx_v50.dic/Index/
export const profiles = ["XRAY", "EM_SINGLE_PARTICLE"] as const;
export type DepositionProfile = (typeof profiles)[number];

// Method and submitted contents are separate dimensions. Each profile pins one
// confirmed combination; unsupported combinations cannot sneak in as EM defaults.
export const scenarios = {
  XRAY: { method: "XRAY", coordinates: true },
  EM_SINGLE_PARTICLE: {
    method: "EM",
    subtype: "SINGLE_PARTICLE",
    coordinates: true,
    mapStatus: "NEW_MAP",
    composite: false,
  },
} as const;

export interface CifBinding {
  tag: string;
  // Matching key in this field's category, for repeatable records.
  key?: string;
}
export interface FieldDefinition {
  type: "text" | "comment";
  name: string;
  title: string;
  inputType?: "number";
  isRequired?: boolean;
  visible?: boolean;
  readOnly?: boolean;
  validators?: Array<
    | { type: "regex"; regex: string; text: string }
    | { type: "numeric"; minValue: number; text: string }
  >;
  cif?: CifBinding;
}
export interface RepeatDefinition {
  type: "paneldynamic";
  name: string;
  title: string;
  isRequired: boolean;
  allowAddPanel: boolean;
  allowRemovePanel: boolean;
  keyName: "recordId";
  templateElements: FieldDefinition[];
  // recordId is an application ID. The parser keeps its mapping to this CIF key.
  cif: { key: string };
}
export interface QuestionnaireDefinition {
  pages: Array<{
    name: string;
    title: string;
    elements: Array<FieldDefinition | RepeatDefinition>;
  }>;
}
const recordId: FieldDefinition = {
  type: "text",
  name: "recordId",
  title: "Record ID",
  visible: false,
  readOnly: true,
};
const nonBlank: FieldDefinition["validators"] = [
  { type: "regex", regex: "\\S", text: "Enter a value, not only whitespace." },
];

// Native SurveyJS properties, plus a CIF mapping annotation. No custom UI engine.
export function getQuestionnaireDefinition(
  profile: DepositionProfile,
): QuestionnaireDefinition {
  if (!profiles.includes(profile))
    throw new Error("Unsupported deposition profile.");
  const definition: QuestionnaireDefinition = {
    pages: [
      {
        name: "entry",
        title: "Entry and authors",
        elements: [
          {
            type: "comment",
            name: "title",
            title: "Entry title",
            isRequired: true,
            validators: nonBlank,
            cif: { tag: "_struct.title" },
          },
          {
            type: "comment",
            name: "keywords",
            title: "Keywords",
            isRequired: true,
            validators: nonBlank,
            cif: { tag: "_struct_keywords.text" },
          },
          {
            type: "paneldynamic",
            name: "authors",
            title: "Authors",
            isRequired: true,
            keyName: "recordId",
            allowAddPanel: true,
            allowRemovePanel: true,
            cif: { key: "_audit_author.pdbx_ordinal" },
            templateElements: [
              recordId,
              {
                type: "text",
                name: "name",
                title: "Name",
                isRequired: true,
                validators: nonBlank,
                cif: {
                  tag: "_audit_author.name",
                  key: "_audit_author.pdbx_ordinal",
                },
              },
              {
                type: "text",
                name: "orcid",
                title: "ORCID",
                validators: [
                  {
                    type: "regex",
                    regex: "^[0-9]{4}-[0-9]{4}-[0-9]{4}-[0-9]{3}[0-9X]$",
                    text: "Use the ORCID format 0000-0000-0000-0000.",
                  },
                ],
                cif: {
                  tag: "_audit_author.identifier_ORCID",
                  key: "_audit_author.pdbx_ordinal",
                },
              },
            ],
          },
        ],
      },
      {
        name: "molecular",
        title: "Polymer molecules",
        elements: [
          {
            type: "paneldynamic",
            name: "molecules",
            title: "Polymer molecules",
            isRequired: true,
            keyName: "recordId",
            allowAddPanel: false,
            allowRemovePanel: false,
            cif: { key: "_entity.id" },
            templateElements: [
              recordId,
              {
                type: "text",
                name: "name",
                title: "Molecule name",
                isRequired: true,
                validators: nonBlank,
                cif: { tag: "_entity.pdbx_description", key: "_entity.id" },
              },
              {
                type: "text",
                name: "polymerType",
                title: "Polymer type",
                isRequired: true,
                readOnly: true,
                validators: nonBlank,
                cif: {
                  tag: "_entity_poly.type",
                  key: "_entity_poly.entity_id",
                },
              },
              {
                type: "text",
                name: "chainIds",
                title: "Chain identifiers",
                isRequired: true,
                validators: nonBlank,
                cif: {
                  tag: "_entity_poly.pdbx_strand_id",
                  key: "_entity_poly.entity_id",
                },
              },
              {
                type: "comment",
                name: "sequence",
                title: "Sequence",
                isRequired: true,
                validators: nonBlank,
                cif: {
                  tag: "_entity_poly.pdbx_seq_one_letter_code",
                  key: "_entity_poly.entity_id",
                },
              },
              {
                type: "comment",
                name: "mutations",
                title: "Mutations",
                cif: { tag: "_entity.pdbx_mutation", key: "_entity.id" },
              },
            ],
          },
        ],
      },
    ],
  };
  if (profile === "XRAY")
    definition.pages.push({
      name: "experimental",
      title: "Crystallization",
      elements: [
        {
          type: "paneldynamic",
          name: "crystals",
          title: "Crystal growth",
          isRequired: true,
          keyName: "recordId",
          allowAddPanel: true,
          allowRemovePanel: true,
          cif: { key: "_exptl_crystal_grow.crystal_id" },
          templateElements: [
            recordId,
            // The official method enumeration is not yet imported: presence only.
            {
              type: "text",
              name: "method",
              title: "Crystallization method",
              isRequired: true,
              validators: nonBlank,
              cif: {
                tag: "_exptl_crystal_grow.method",
                key: "_exptl_crystal_grow.crystal_id",
              },
            },
            {
              type: "text",
              inputType: "number",
              name: "temperature",
              title: "Temperature (K)",
              isRequired: true,
              validators: [
                {
                  type: "numeric",
                  minValue: 0,
                  text: "Kelvin temperature cannot be negative.",
                },
              ],
              cif: {
                tag: "_exptl_crystal_grow.temp",
                key: "_exptl_crystal_grow.crystal_id",
              },
            },
            {
              type: "text",
              inputType: "number",
              name: "ph",
              title: "pH",
              cif: {
                tag: "_exptl_crystal_grow.pH",
                key: "_exptl_crystal_grow.crystal_id",
              },
            },
            {
              type: "comment",
              name: "conditions",
              title: "Crystallization conditions",
              isRequired: true,
              validators: nonBlank,
              cif: {
                tag: "_exptl_crystal_grow.pdbx_details",
                key: "_exptl_crystal_grow.crystal_id",
              },
            },
          ],
        },
      ],
    });
  return structuredClone(definition);
}
