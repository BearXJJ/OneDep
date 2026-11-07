import type {
  Element,
  Question,
  ProfileDefinition,
  Repeat,
  FieldMeta,
} from "./types.js";
import { sourceEquipment } from "./source-dictionary.js";
export const profiles = ["XRAY", "EM_SINGLE_PARTICLE"] as const;
export type DepositionProfile = (typeof profiles)[number];
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
const meta = (tag?: string, key?: string, source = "entry"): FieldMeta => ({
  source: [{ file: `${source}.html`, field: tag }],
  requirementEvidence: "unconfirmed",
  ...(tag
    ? { bindings: [{ adapterId: "cif", tag, rowKey: key, direction: "both" }] }
    : {}),
});
const text = (
  name: string,
  title: string,
  tag?: string,
  key?: string,
  extra: Partial<Question> = {},
): Question =>
  ({
    type: "text",
    name,
    title,
    x: meta(tag, key),
    ...extra,
  }) as Question;
const required: Pick<Question, "isRequired" | "validators"> = {
  isRequired: true,
  validators: [{ type: "regex", regex: "\\S", text: "请输入有效内容。" }],
};
const repeat = (
  name: string,
  title: string,
  key: string,
  fields: Element[],
  parsed = false,
): Repeat => ({
  type: "paneldynamic",
  name,
  title,
  keyName: "recordId",
  minPanelCount: 1,
  allowAddPanel: !parsed,
  allowRemovePanel: !parsed,
  templateElements: [
    text("recordId", "记录 ID", undefined, undefined, {
      visible: false,
      readOnly: true,
    }),
    ...fields,
  ],
  x: {
    source: [{ file: `${name}.html` }],
    origin: parsed ? "parsed" : "user",
    bindings: [{ adapterId: "cif", category: key.split(".")[0] + ".", key }],
  },
});
const number = (
  name: string,
  title: string,
  tag?: string,
  key?: string,
  extra: Partial<Question> = {},
): Question =>
  text(name, title, tag, key, {
    inputType: "number",
    validators: [{ type: "numeric", minValue: 0, text: "不能为负数。" }],
    ...extra,
  });
const choice = (
  name: string,
  title: string,
  values: string[],
  tag?: string,
  key?: string,
  extra: Partial<Question> = {},
): Question =>
  text(name, title, tag, key, {
    type: "dropdown",
    choices: values.map((value) => ({ value, text: value })),
    ...extra,
  });
export function getProfileDefinition(id: DepositionProfile): ProfileDefinition {
  if (!profiles.includes(id)) throw new Error("Unsupported deposition profile");
  const pages: ProfileDefinition["pages"] = [
    {
      name: "entry",
      title: "条目与作者",
      elements: [
        text("title", "条目标题", "_struct.title", undefined, {
          type: "comment",
          ...required,
        }),
        text(
          "keywords",
          "关键词",
          "_struct_keywords.text",
          undefined,
          required,
        ),
        repeat("authors", "作者", "_audit_author.pdbx_ordinal", [
          text(
            "name",
            "作者姓名",
            "_audit_author.name",
            "_audit_author.pdbx_ordinal",
            required,
          ),
          text(
            "orcid",
            "ORCID",
            "_audit_author.identifier_ORCID",
            "_audit_author.pdbx_ordinal",
            {
              validators: [
                {
                  type: "regex",
                  regex: "^[0-9]{4}-[0-9]{4}-[0-9]{4}-[0-9]{3}[0-9X]$",
                  text: "ORCID 格式不正确。",
                },
              ],
            },
          ),
        ]),
        choice(
          "citationStatus",
          "论文状态",
          ["UNPUBLISHED", "PUBLISHED"],
          undefined,
          undefined,
          { isRequired: true },
        ),
        {
          type: "panel",
          name: "published",
          title: "已发表论文",
          visibleIf: "{citationStatus} = 'PUBLISHED'",
          elements: [
            text("citationTitle", "论文标题", "_citation.title", undefined, {
              requiredIf: "{citationStatus} = 'PUBLISHED'",
            }),
            text(
              "citationDoi",
              "论文 DOI",
              "_citation.pdbx_database_id_DOI",
              undefined,
              {},
            ),
          ],
        },
      ],
    },
    {
      name: "molecular",
      title: "分子与实体",
      elements: [
        repeat(
          "molecules",
          "分子与实体（按文件实体键）",
          "_entity.id",
          [
            text(
              "name",
              "分子名称",
              "_entity.pdbx_description",
              "_entity.id",
              required,
            ),
            text("entityType", "实体类型", "_entity.type", "_entity.id", {
              readOnly: true,
            }),
            text(
              "polymerType",
              "聚合物类型",
              "_entity_poly.type",
              "_entity_poly.entity_id",
              { readOnly: true },
            ),
            text(
              "chainIds",
              "链编号",
              "_entity_poly.pdbx_strand_id",
              "_entity_poly.entity_id",
              { readOnly: true },
            ),
            text(
              "sequence",
              "序列",
              "_entity_poly.pdbx_seq_one_letter_code",
              "_entity_poly.entity_id",
              { type: "comment", readOnly: true },
            ),
            text(
              "mutations",
              "突变说明",
              "_entity.pdbx_mutation",
              "_entity.id",
              { type: "comment" },
            ),
          ],
          true,
        ),
      ],
    },
  ];
  if (id === "XRAY")
    pages.push(
      {
        name: "crystallization",
        title: "结晶",
        elements: [
          repeat("crystals", "晶体生长", "_exptl_crystal_grow.crystal_id", [
            text(
              "method",
              "结晶方法",
              "_exptl_crystal_grow.method",
              "_exptl_crystal_grow.crystal_id",
              required,
            ),
            number(
              "temperature",
              "温度 (K)",
              "_exptl_crystal_grow.temp",
              "_exptl_crystal_grow.crystal_id",
              { isRequired: true },
            ),
            number(
              "ph",
              "pH",
              "_exptl_crystal_grow.pH",
              "_exptl_crystal_grow.crystal_id",
              { max: 14 },
            ),
            text(
              "conditions",
              "结晶条件",
              "_exptl_crystal_grow.pdbx_details",
              "_exptl_crystal_grow.crystal_id",
              { type: "comment", ...required },
            ),
          ]),
        ],
      },
      {
        name: "collection",
        title: "衍射采集",
        elements: [
          repeat("diffraction", "辐射源与设备", "_diffrn_source.diffrn_id", [
            choice(
              "source",
              "辐射源",
              Object.keys(sourceEquipment),
              "_diffrn_source.source",
              "_diffrn_source.diffrn_id",
              { isRequired: true },
            ),
            text(
              "equipment",
              "设备型号",
              "_diffrn_source.type",
              "_diffrn_source.diffrn_id",
              {
                type: "dropdown",
                isRequired: true,
                choices: Object.entries(sourceEquipment).flatMap(
                  ([source, names]) =>
                    names.map((value) => ({
                      value,
                      text: value,
                      visibleIf: `{panel.source} = '${source}'`,
                    })),
                ),
                x: {
                  ...meta(
                    "_diffrn_source.type",
                    "_diffrn_source.diffrn_id",
                    "xray/diffrndatacollection",
                  ),
                  choiceSource: {
                    kind: "dictionary",
                    id: "radiation-equipment",
                    filterBy: "source",
                  },
                },
              },
            ),
          ]),
        ],
      },
    );
  else
    pages.push({
      name: "reconstruction",
      title: "电镜重构",
      elements: [
        number(
          "resolution",
          "报告分辨率 (Å)",
          "_em_3d_reconstruction.resolution",
          undefined,
          { description: "从文件读取或根据实验记录填写；没有来源时留空。" },
        ),
        number("contour", "主图推荐等值面阈值", undefined, undefined, {
          description: "尚无已核实的来源；本地 demo 不强制填写，不预设阈值。",
        }),
        text("mapNotes", "图像说明", undefined, undefined, { type: "comment" }),
      ],
    });
  pages.push({
    name: "release",
    title: "本地提交",
    elements: [
      text(
        "termsAccepted",
        "确认将当前版本提交到本地 demo",
        undefined,
        undefined,
        {
          type: "boolean",
          isRequired: true,
          validators: [
            {
              type: "expression",
              expression: "{termsAccepted} = true",
              text: "需要明确确认本地提交。",
            },
          ],
        },
      ),
    ],
  });
  const file = (
    role: string,
    title: string,
    count: number,
    extensions: string[],
    parserId: string,
  ) => ({
    role,
    title,
    min: count,
    max: count,
    extensions,
    parserId,
    checks: ["file-content"],
    source: [{ file: "local-demo-scope" }],
  });
  return {
    id,
    revision: 2,
    title:
      id === "XRAY" ? "X-ray 本地 demo" : "电镜单颗粒 · 模型与新图 · 非组合图",
    scenario: scenarios[id],
    pages,
    files: [
      file(
        "COORDINATE",
        "坐标模型",
        1,
        [".cif", ".mmcif", ".pdb"],
        "coordinate",
      ),
      ...(id === "XRAY"
        ? [
            file(
              "STRUCTURE_FACTOR",
              "结构因子",
              1,
              [".cif", ".mmcif", ".mtz"],
              "reflections",
            ),
          ]
        : [
            file(
              "EM_MAP",
              "主图",
              1,
              [".map", ".map.gz", ".mrc", ".mrc.gz"],
              "map",
            ),
            file(
              "EM_HALF_MAP",
              "半图",
              2,
              [".map", ".map.gz", ".mrc", ".mrc.gz"],
              "map",
            ),
            file("EM_IMAGE", "条目图片", 1, [".png"], "image"),
          ]),
    ],
    checks: [
      {
        id: "questionnaire",
        adapterId: "survey",
        requiredFor: ["submit", "export"],
      },
      {
        id: "file-content",
        adapterId: "gemmi",
        requiredFor: ["submit", "export"],
      },
      { id: "scientific-validation", adapterId: "wwpdb", requiredFor: [] },
      { id: "ligand-ccd", adapterId: "ccd", requiredFor: [] },
    ],
  };
}
export const getQuestionnaireDefinition = getProfileDefinition;
