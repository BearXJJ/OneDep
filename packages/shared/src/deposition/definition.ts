import { getDemoDefinition, type DepositionProfile } from "./demo-scope.js";
import { officialForms } from "./official-forms.js";
import type {
  CapturedElement,
  CapturedField,
  DisplayCondition,
  NavigationNode,
} from "./official-types.js";
import type {
  Element,
  FieldMeta,
  ProfileDefinition,
  Question,
  Repeat,
} from "./types.js";
export { profiles, scenarios, type DepositionProfile } from "./demo-scope.js";
export type { NavigationNode } from "./official-types.js";
export function getNavigation(profile: DepositionProfile): NavigationNode[] {
  return structuredClone(
    officialForms[profile === "XRAY" ? "xray" : "em"].navigation,
  );
}
const sourceChoices: Record<
  string,
  { collection: string; labelField: string }
> = {
  "em_experiment.entity_assembly_id": {
    collection: "emsample__em_entity_assembly",
    labelField: "em_entity_assembly__name",
  },
  "em_imaging.specimen_id": {
    collection: "emspecimen__em_experiment",
    labelField: "em_specimen__details",
  },
  "em_image_recording.imaging_id": {
    collection: "emimaging__em_imaging",
    labelField: "em_imaging__microscope_model",
  },
  "em_image_processing.image_recording_id": {
    collection: "emrecording__em_image_recording",
    labelField: "em_image_recording__film_or_detector_model",
  },
  "diffrn.crystal_id": { collection: "crystals", labelField: "method" },
  "reflns.pdbx_diffrn_id": {
    collection: "diffraction",
    labelField: "equipment",
  },
  "reflns_shell.pdbx_diffrn_id": {
    collection: "diffraction",
    labelField: "equipment",
  },
  "refine.pdbx_diffrn_id": {
    collection: "diffraction",
    labelField: "equipment",
  },
};
const quote = (value: string) => JSON.stringify(value);
export function getProfileDefinition(id: DepositionProfile): ProfileDefinition {
  const demo = getDemoDefinition(id),
    captured = officialForms[id === "XRAY" ? "xray" : "em"];
  const demoByTag = new Map<string, { question: Question; group?: string }>(),
    repeats = new Map<string, Repeat>(),
    demoByName = new Map<string, Question>();
  function index(elements: Element[], group?: string) {
    for (const e of elements) {
      if (e.type === "panel") index(e.elements, group);
      else if (e.type === "paneldynamic") {
        repeats.set(e.name, e);
        index(e.templateElements, e.name);
      } else {
        demoByName.set(e.name, e);
        if (e.x.bindings)
          for (const b of e.x.bindings)
            demoByTag.set(b.tag, { question: e, group });
      }
    }
  }
  index(demo.pages.flatMap((p) => p.elements));
  const usedDemo = new Set<string>(),
    rootFields = new Map<string, Question>();
  const demoName = (field: CapturedField, scope?: string): string => {
    const match = demoByTag.get("_" + field.category + "." + field.name);
    if (match && match.group === scope) return match.question.name;
    return field.category + "__" + field.name;
  };
  const nameForTag = (tag: string, scope?: string) => {
    const match = demoByTag.get("_" + tag);
    if (match && match.group === scope) return match.question.name;
    return tag.replace(".", "__");
  };
  function expression(
    conditions: DisplayCondition[],
    scope?: string,
  ): string | undefined {
    if (!conditions.length) return;
    return conditions
      .map((c) => {
        const n = nameForTag(c.category + "." + c.cif_item, scope),
          ref = "{" + (scope ? "panel." : "") + n + "}";
        const comparisons = c.value
          .map((v) => ref + (c.type === "equal" ? " = " : " != ") + quote(v))
          .join(c.type === "equal" ? " or " : " and ");
        return "(" + ref + " notempty and (" + comparisons + "))";
      })
      .join(" and ");
  }
  const pages: ProfileDefinition["pages"] = [];
  for (const page of captured.pages) {
    const lifted: Element[] = [];
    function field(f: CapturedField, scope?: string): Question | null {
      const tag = "_" + f.category + "." + f.name,
        match = demoByTag.get(tag);
      if (match && !match.group && scope) {
        if (!usedDemo.has(match.question.name)) {
          usedDemo.add(match.question.name);
          lifted.push({
            ...structuredClone(match.question),
            title: f.title,
            x: { ...match.question.x, demo: true },
          });
        }
        return null;
      }
      const name = demoName(f, scope),
        visibleIf = expression(f.conditions, scope);
      if (
        match &&
        match.group === scope &&
        usedDemo.has((scope === undefined ? "" : scope + "/") + name)
      )
        return null;
      if (!scope && rootFields.has(name)) return null;
      const x: FieldMeta = {
        source: [
          {
            file: (id === "XRAY" ? "xray/" : "em/") + page.name + ".html",
            field: tag,
          },
        ],
        requirementEvidence: "confirmed",
        demo: false,
      };
      if (sourceChoices[f.category + "." + f.name])
        x.choiceSource = {
          kind: "records",
          ...sourceChoices[f.category + "." + f.name]!,
        };
      let question = {
        type: f.type,
        name,
        title: f.title,
        isRequired: f.required,
        description: f.help,
        placeholder: f.placeholder,
        maxLength: f.maxLength,
        inputType: f.inputType,
        choices: f.choices,
        showOtherItem: f.allowOther,
        visibleIf,
        x,
      } as Question;
      if (f.regex)
        question.validators = [
          { type: "regex", regex: f.regex, text: f.title + ": invalid format" },
        ];
      if (match && match.group === scope) {
        question = {
          ...question,
          ...structuredClone(match.question),
          showOtherItem: false,
          title: f.title,
          description: f.help,
          x: { ...match.question.x, source: x.source, demo: true },
        } as Question;
        if (f.type === "dropdown" && question.type === "text")
          question = { ...question, type: "dropdown", choices: f.choices };
        usedDemo.add((scope === undefined ? "" : scope + "/") + name);
      }
      if (
        f.category === "citation" &&
        [
          "journal_abbrev",
          "journal_volume",
          "page_first",
          "page_last",
          "year",
          "journal_id_ISSN",
        ].includes(f.name)
      )
        question.enableIf = "{citationStatus} = 'PUBLISHED'";
      if (
        f.category === "em_entity_assembly" &&
        f.name === "source" &&
        "choices" in question
      )
        question.choices = question.choices?.map((c) =>
          c.value === "RECOMBINANT"
            ? {
                ...c,
                visibleIf:
                  "{em_entity_assembly__type} != 'CELL' and {em_entity_assembly__type} != 'TISSUE'",
              }
            : c,
        );
      if (!scope) rootFields.set(name, question);
      return question;
    }
    function convert(elements: CapturedElement[], scope?: string): Element[] {
      const result: Element[] = [];
      for (const e of elements) {
        if (e.kind === "field") {
          const q = field(e, scope);
          if (q) result.push(q);
          continue;
        }
        let target: string | undefined;
        if (page.name === "title" && e.category === "audit_author")
          target = "authors";
        if (page.name === "diffrncrystal" && e.category === "exptl_crystal")
          target = "crystals";
        if (page.name === "diffrndatacollection" && e.category === "diffrn")
          target = "diffraction";
        const primaryCitation =
          page.name === "citation" &&
          e.category === "citation" &&
          e.name === "citation";
        const repeat =
          e.repeat &&
          !primaryCitation &&
          !(
            target === undefined &&
            scope === "crystals" &&
            e.category === "exptl_crystal_grow"
          );
        const nextScope = target
          ? target
          : repeat
            ? page.name + "__" + e.name
            : scope;
        const children = convert(e.elements, nextScope);
        if (!children.length) continue;
        let visibleIf = expression(e.conditions, scope);
        if (page.name === "molecule_1") {
          const method = (
            {
              entity_src_nat: "nat",
              entity_src_gen: "man",
              pdbx_entity_src_syn: "syn",
            } as Record<string, string>
          )[e.category];
          if (method)
            visibleIf = "{panel.entity__src_method} = '" + method + "'";
        }
        if (target) {
          const original = repeats.get(target)!;
          result.push({
            ...structuredClone(original),
            title: e.title,
            templateElements: [original.templateElements[0]!, ...children],
          });
        } else if (repeat)
          result.push({
            type: "paneldynamic",
            name: nextScope!,
            title: e.title,
            keyName: "recordId",
            minPanelCount: 0,
            allowAddPanel: true,
            allowRemovePanel: true,
            visibleIf,
            templateElements: [
              {
                type: "text",
                name: "recordId",
                title: "Record ID",
                visible: false,
                readOnly: true,
                x: {
                  source: [],
                  requirementEvidence: "confirmed",
                  demo: false,
                },
              },
              ...children,
            ],
            x: { source: [{ file: page.name + ".html" }], origin: "user" },
          });
        else
          result.push({
            type: "panel",
            name: page.name + "__" + e.name + "__section",
            title: e.title,
            visibleIf,
            elements: children,
          });
      }
      return result;
    }
    let elements: Element[];
    if (page.name === "molecule_1") {
      const original = repeats.get("molecules")!;
      elements = [
        {
          ...structuredClone(original),
          title: "Macromolecule",
          templateElements: [
            original.templateElements[0]!,
            ...convert(page.elements, "molecules"),
          ],
        },
      ];
    } else elements = convert(page.elements);
    if (page.name === "citation") {
      const status = demoByName.get("citationStatus")!;
      elements.unshift({
        ...structuredClone(status),
        title: "Publication status",
        x: { ...status.x, demo: true },
      });
      usedDemo.add("citationStatus");
    }
    if (page.name === "emreconstruction")
      for (const name of ["contour", "mapNotes"]) {
        const q = demoByName.get(name)!;
        elements.push({ ...structuredClone(q), x: { ...q.x, demo: true } });
        usedDemo.add(name);
      }
    pages.push({
      name: page.name,
      title: page.title,
      elements: [...lifted, ...elements],
    });
  }
  // Structural fields supplied by the coordinate parser also remain visible when the official page renders them as text.
  const molecule = pages.find((p) => p.name === "molecule_1")!
    .elements[0] as Repeat;
  for (const q of repeats.get("molecules")!.templateElements)
    if (
      q.type !== "panel" &&
      q.type !== "paneldynamic" &&
      q.name !== "recordId" &&
      !usedDemo.has("molecules/" + q.name)
    )
      molecule.templateElements.push({
        ...structuredClone(q),
        x: { ...q.x, demo: true },
      });
  const localMeta: FieldMeta = {
    source: [{ file: "local-workflow" }],
    requirementEvidence: "confirmed",
    demo: false,
  };
  pages.push({
    name: "message",
    title: "Communication",
    elements: [
      {
        type: "paneldynamic",
        name: "communication",
        title: "Messages",
        keyName: "recordId",
        allowAddPanel: true,
        allowRemovePanel: true,
        x: { source: localMeta.source, origin: "user" },
        templateElements: [
          {
            type: "text",
            name: "recordId",
            title: "ID",
            visible: false,
            x: localMeta,
          },
          { type: "text", name: "subject", title: "Subject", x: localMeta },
          { type: "comment", name: "body", title: "Message", x: localMeta },
          { type: "text", name: "date", title: "Date", x: localMeta },
        ],
      },
    ],
  });
  pages.push({
    name: "ligandsummary",
    title: "Ligands",
    elements: [
      {
        type: "paneldynamic",
        name: "ligandReview",
        title: "Ligand inspection",
        keyName: "recordId",
        allowAddPanel: true,
        allowRemovePanel: true,
        x: { source: [{ file: "ligand-module.html" }], origin: "user" },
        templateElements: [
          {
            type: "text",
            name: "recordId",
            title: "ID",
            visible: false,
            x: localMeta,
          },
          { type: "text", name: "component", title: "Ligand ID", x: localMeta },
          {
            type: "boolean",
            name: "interest",
            title: "Ligand of interest (LOI)",
            x: localMeta,
          },
          {
            type: "comment",
            name: "description",
            title: "Chemical definition / correction",
            x: localMeta,
          },
          {
            type: "boolean",
            name: "reviewed",
            title: "Inspection completed",
            x: localMeta,
          },
        ],
      },
    ],
  });
  const terms = demoByName.get("termsAccepted")!;
  pages.push({
    name: "depsummary",
    title: "Terms and conditions",
    elements: [
      {
        ...structuredClone(terms),
        title: "确认提交当前投递版本",
        x: { ...terms.x, demo: true },
      },
    ],
  });
  function directNames(elements: Element[]): Set<string> {
    const names = new Set<string>();
    for (const e of elements) {
      if (e.type === "panel")
        for (const name of directNames(e.elements)) names.add(name);
      else names.add(e.name);
    }
    return names;
  }
  const globalNames = directNames(pages.flatMap((p) => p.elements));
  function repairScopes(elements: Element[], scopes: Set<string>[]) {
    for (const e of elements) {
      const replace = (expression: string) =>
        expression.replace(/\{panel\.([^}]+)\}/g, (original, name: string) => {
          const level = scopes.findIndex((scope) => scope.has(name));
          if (level === 0) return original;
          if (level > 0)
            return (
              "{" +
              Array(level).fill("parentPanel").join(".") +
              "." +
              name +
              "}"
            );
          if (globalNames.has(name)) return "{" + name + "}";
          return original;
        });
      if (e.visibleIf) e.visibleIf = replace(e.visibleIf);
      if (e.type === "panel") repairScopes(e.elements, scopes);
      else if (e.type === "paneldynamic")
        repairScopes(e.templateElements, [
          directNames(e.templateElements),
          ...scopes,
        ]);
    }
  }
  repairScopes(
    pages.flatMap((p) => p.elements),
    [],
  );
  return { ...demo, revision: 3, pages };
}
export const getQuestionnaireDefinition = getProfileDefinition;
