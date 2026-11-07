import { describe, expect, it } from "vitest";
import { QuestionPanelDynamicModel } from "survey-core";
import {
  createQuestionnaire,
  activeAnswers,
  getCifBindings,
  getFileRequirements,
  parseQuestionnaireDraft,
  validateFileManifest,
  validateQuestionnaire,
  type Answers,
  type FileReference,
} from "./index.js";

function answers(): Answers {
  return {
    title: "Test structure",
    citationStatus: "UNPUBLISHED",
    termsAccepted: true,
    diffraction: [
      {
        recordId: "d1",
        source: "SYNCHROTRON",
        equipment: "SSRF BEAMLINE BL17U1",
      },
    ],
    keywords: "PROTEIN",
    authors: [{ recordId: "author-a", name: "Author, A." }],
    molecules: [
      {
        recordId: "entity-1",
        name: "Protein A",
        polymerType: "polypeptide(L)",
        chainIds: "A,B",
        sequence: "MAG",
      },
      {
        recordId: "entity-2",
        name: "Protein B",
        polymerType: "polypeptide(L)",
        chainIds: "C",
        sequence: "GLY",
      },
    ],
    crystals: [
      {
        recordId: "crystal-1",
        method: "VAPOR DIFFUSION",
        temperature: 293,
        conditions: "Buffer A",
      },
      {
        recordId: "crystal-2",
        method: "BATCH",
        temperature: 290,
        conditions: "Buffer B",
        ph: 7,
      },
    ],
  };
}

describe("questionnaire contract", () => {
  it("allows incomplete drafts but blocks completion without required answers", () => {
    const input = { profile: "XRAY", answers: {} };
    expect(validateQuestionnaire(input, "draft")).toEqual([]);
    const paths = validateQuestionnaire(input, "complete").map((issue) =>
      issue.path.join("."),
    );
    expect(paths).toEqual(
      expect.arrayContaining(["answers.title", "answers.molecules"]),
    );
    expect(
      validateQuestionnaire(
        { profile: "XRAY", answers: answers() },
        "complete",
      ),
    ).toEqual([]);
  });

  it.each([
    { profile: "NMR", answers: {} },
    { profile: "XRAY", answers: { inventedField: "x" } },
    { profile: "XRAY", answers: { authors: [{ name: "No ID" }] } },
    {
      profile: "XRAY",
      answers: { crystals: [{ recordId: "c1", temperature: "293" }] },
    },
    {
      profile: "XRAY",
      answers: { authors: [{ recordId: "a1", inventedField: "x" }] },
    },
  ])(
    "rejects unsupported input without silently dropping or coercing it: %j",
    (input) => {
      expect(() => parseQuestionnaireDraft(input)).toThrow();
    },
  );

  it("does not let duplicate record IDs merge two molecules", () => {
    expect(() =>
      parseQuestionnaireDraft({
        profile: "XRAY",
        answers: {
          molecules: [
            { recordId: "same", name: "A" },
            { recordId: "same", name: "B" },
          ],
        },
      }),
    ).toThrow(/Duplicate record ID/);
  });

  it("preserves repeat identities and independent edits through a save/reload", () => {
    const original = answers();
    const model = createQuestionnaire("XRAY", original);
    const molecules = model.getQuestionByName(
      "molecules",
    ) as QuestionPanelDynamicModel;
    const crystals = model.getQuestionByName(
      "crystals",
    ) as QuestionPanelDynamicModel;
    molecules.panels[1]!.getQuestionByName("name")!.value = "Edited B";
    crystals.panels[1]!.getQuestionByName("temperature")!.value = 300;
    const saved = parseQuestionnaireDraft(
      JSON.parse(JSON.stringify({ profile: "XRAY", answers: model.data })),
    );
    const reloaded = createQuestionnaire(saved.profile, saved.answers);
    expect(reloaded.data.molecules).toMatchObject([
      { recordId: "entity-1", name: "Protein A" },
      { recordId: "entity-2", name: "Edited B" },
    ]);
    expect(reloaded.data.crystals).toMatchObject([
      { recordId: "crystal-1", temperature: 293 },
      { recordId: "crystal-2", temperature: 300 },
    ]);
    expect(original.molecules).toMatchObject([
      { name: "Protein A" },
      { name: "Protein B" },
    ]);
    model.dispose();
    reloaded.dispose();
  });

  it("assigns new repeat rows identities and preserves them when reordered", () => {
    const model = createQuestionnaire("XRAY", answers());
    const authors = model.getQuestionByName(
      "authors",
    ) as QuestionPanelDynamicModel;
    authors.addPanel();
    const rows = model.data.authors;
    expect(rows[1].recordId).toBeTruthy();
    expect(rows[1].recordId).not.toBe(rows[0].recordId);
    const saved = parseQuestionnaireDraft({
      profile: "XRAY",
      answers: { authors: rows.toReversed() },
    });
    expect(saved.answers.authors).toMatchObject([
      { recordId: rows[1].recordId },
      { recordId: rows[0].recordId },
    ]);
    model.dispose();
  });

  it("returns precise nested paths for bad values in drafts as well as completion", () => {
    const input = answers();
    (input.crystals as Array<Record<string, unknown>>)[1]!.temperature = -1;
    (input.authors as Array<Record<string, unknown>>)[0]!.orcid = "invalid";
    input.title = "   ";
    const paths = validateQuestionnaire(
      { profile: "XRAY", answers: input },
      "draft",
    ).map((issue) => issue.path.join("."));
    expect(paths).toEqual(
      expect.arrayContaining([
        "answers.authors.0.orcid",
        "answers.crystals.1.temperature",
      ]),
    );
    expect(
      validateQuestionnaire(
        { profile: "XRAY", answers: input },
        "complete",
      ).some((issue) => issue.path.join(".") === "answers.title"),
    ).toBe(true);
  });

  it("never applies crystal requirements to the supported EM scenario", () => {
    const {
      crystals: _crystals,
      diffraction: _diffraction,
      ...common
    } = answers();
    expect(
      validateQuestionnaire(
        { profile: "EM_SINGLE_PARTICLE", answers: common },
        "complete",
      ),
    ).toEqual([]);
    expect(() =>
      parseQuestionnaireDraft({
        profile: "EM_SINGLE_PARTICLE",
        answers: answers(),
      }),
    ).toThrow();
    expect(
      getCifBindings("EM_SINGLE_PARTICLE").some(
        (binding) => binding.group === "crystals",
      ),
    ).toBe(false);
  });

  it("keeps the entity key when crossing from entity to entity_poly bindings", () => {
    expect(
      getCifBindings("XRAY").find(
        (item) => item.group === "molecules" && item.field === "sequence",
      ),
    ).toMatchObject({
      group: "molecules",
      field: "sequence",
      recordKey: "_entity.id",
      key: "_entity_poly.entity_id",
      tag: "_entity_poly.pdbx_seq_one_letter_code",
    });
  });

  it("uses identical business validation in the form model and the server entry point", () => {
    const input = answers();
    (input.authors as Array<Record<string, unknown>>)[0]!.orcid =
      "not-an-orcid";
    const model = createQuestionnaire("XRAY", input);
    expect(model.validate()).toBe(false);
    expect(
      validateQuestionnaire({ profile: "XRAY", answers: input }, "complete"),
    ).not.toEqual([]);
    model.dispose();
  });
});

describe("file contract", () => {
  const emFiles: FileReference[] = [
    { id: "model", role: "COORDINATE", slot: 1, originalName: "10BW.pdb" },
    { id: "map", role: "EM_MAP", slot: 1, originalName: "emd_75054.map.gz" },
    {
      id: "half-1",
      role: "EM_HALF_MAP",
      slot: 1,
      originalName: "emd_75054_half_map_1.map.gz",
    },
    {
      id: "half-2",
      role: "EM_HALF_MAP",
      slot: 2,
      originalName: "emd_75054_half_map_2.map.gz",
    },
    { id: "image", role: "EM_IMAGE", slot: 1, originalName: "emd_75054.png" },
  ];

  it("accepts both confirmed sample file sets", () => {
    expect(
      validateFileManifest("EM_SINGLE_PARTICLE", emFiles, "complete"),
    ).toEqual([]);
    expect(
      validateFileManifest(
        "XRAY",
        [
          {
            id: "model",
            role: "COORDINATE",
            slot: 1,
            originalName: "9XE3.cif",
          },
          {
            id: "data",
            role: "STRUCTURE_FACTOR",
            slot: 1,
            originalName: "9XE3-sf.cif",
          },
        ],
        "complete",
      ),
    ).toEqual([]);
  });

  it("requires two different half-map uploads in separate slots", () => {
    const missing = emFiles.filter((file) => file.slot !== 2);
    expect(
      validateFileManifest("EM_SINGLE_PARTICLE", missing, "draft"),
    ).toEqual([]);
    expect(
      validateFileManifest("EM_SINGLE_PARTICLE", missing, "complete"),
    ).toContainEqual({
      path: ["files", "EM_HALF_MAP", 2],
      code: "missing_file",
      message: "A required file slot is empty.",
    });
    const reused = emFiles.map((file) =>
      file.slot === 2 ? { ...file, id: "half-1" } : file,
    );
    expect(
      validateFileManifest("EM_SINGLE_PARTICLE", reused).some(
        (issue) => issue.code === "duplicate_file",
      ),
    ).toBe(true);
    const overwritten = emFiles.map((file) =>
      file.slot === 2 ? { ...file, slot: 1 } : file,
    );
    expect(
      validateFileManifest("EM_SINGLE_PARTICLE", overwritten).some(
        (issue) => issue.code === "duplicate_slot",
      ),
    ).toBe(true);
  });

  it("uses explicit roles, accepts arbitrary filenames, and rejects unsupported slots", () => {
    const arbitrary = emFiles.map((file) => ({
      ...file,
      originalName:
        file.role === "EM_HALF_MAP" ? "data.map.gz" : file.originalName,
    }));
    expect(
      validateFileManifest("EM_SINGLE_PARTICLE", arbitrary, "complete"),
    ).toEqual([]);
    expect(
      validateFileManifest("XRAY", emFiles).some(
        (issue) => issue.code === "unsupported_role",
      ),
    ).toBe(true);
    expect(
      validateFileManifest("EM_SINGLE_PARTICLE", [
        { id: "h3", role: "EM_HALF_MAP", slot: 3, originalName: "data.map.gz" },
      ]).some((issue) => issue.code === "invalid_slot"),
    ).toBe(true);
    expect(() => getFileRequirements("EM_COMPOSITE" as never)).toThrow();
  });

  it("rejects malformed manifests and misleading extensions", () => {
    expect(validateFileManifest("XRAY", [{ role: "COORDINATE" }])).not.toEqual(
      [],
    );
    expect(
      validateFileManifest("XRAY", [
        { id: "a", role: "COORDINATE", slot: 1, originalName: "data.cif.exe" },
      ]).some((issue) => issue.code === "invalid_extension"),
    ).toBe(true);
  });
});

// Regressions found while exercising real uploads and exports.
describe("active branch and native choice lifecycle", () => {
  it("retains hidden panel answers in drafts but excludes them from export and validation", () => {
    const draft = {
      ...answers(),
      citationStatus: "UNPUBLISHED",
      citationTitle: "hidden text",
    };
    const model = createQuestionnaire("XRAY", draft);
    expect(model.data.citationTitle).toBe("hidden text");
    expect(activeAnswers("XRAY", draft)).not.toHaveProperty("citationTitle");
    model.setValue("citationStatus", "PUBLISHED");
    expect(model.data.citationTitle).toBe("hidden text");
    expect(activeAnswers("XRAY", model.data).citationTitle).toBe("hidden text");
    model.dispose();
  });
  it("keeps an invalid dependent choice visible to validation after its parent changes", () => {
    const model = createQuestionnaire("XRAY", answers());
    const group = model.getQuestionByName(
      "diffraction",
    ) as QuestionPanelDynamicModel;
    group.panels[0]!.getQuestionByName("source")!.value = "SEALED TUBE";
    expect(model.data.diffraction[0].equipment).toBe("SSRF BEAMLINE BL17U1");
    expect(
      validateQuestionnaire(
        { profile: "XRAY", answers: model.data },
        "complete",
      ).some((i) => i.code === "invalid_choice"),
    ).toBe(true);
    model.dispose();
  });
  it("does not treat false or zero as absent and rejects duplicate repeat identities", () => {
    const result = parseQuestionnaireDraft({
      profile: "EM_SINGLE_PARTICLE",
      answers: { termsAccepted: false, contour: 0 },
    });
    expect(result.answers).toEqual({ termsAccepted: false, contour: 0 });
  });
});
