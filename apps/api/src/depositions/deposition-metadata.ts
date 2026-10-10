import { BadRequestException } from '@nestjs/common';
import type {
  AuthUser,
  DepositionCompletion,
  DepositionFile,
  DepositionMetadata,
} from '@onedep/shared';

const CITATION_STATUSES = [
  'UNPUBLISHED',
  'IN_PREPARATION',
  'SUBMITTED',
  'PUBLISHED',
] as const;
const RELEASE_STATUSES = [
  'IMMEDIATE',
  'HOLD_FOR_PUBLICATION',
  'HOLD_UNTIL_DATE',
] as const;

type UnknownRecord = Record<string, unknown>;

// 创建空白投递，并用当前账户填充联系人基础信息。
export function createDefaultMetadata(user: AuthUser): DepositionMetadata {
  return {
    entry: { title: '', keywords: '', relatedDataDoi: '' },
    contact: {
      name: user.name,
      email: user.email,
      orcid: user.orcid,
      institution: user.institution,
      country: user.country,
    },
    authors: [],
    citation: { status: 'UNPUBLISHED', title: '', journal: '', doi: '' },
    macromolecule: {
      name: '',
      type: 'PROTEIN',
      chainIds: '',
      sequence: '',
      sourceOrganism: '',
      taxonomyId: '',
      expressionHost: '',
      mutations: '',
    },
    assembly: { oligomericState: '', description: '', evidence: '' },
    xray: {
      crystallizationMethod: '',
      crystallizationPh: '',
      crystallizationTemperature: '',
      spaceGroup: '',
      resolution: '',
    },
    release: {
      status: 'HOLD_FOR_PUBLICATION',
      holdUntil: '',
      termsAccepted: false,
    },
  };
}

// 将接口输入收敛为固定结构，避免任意 JSON 进入数据库。
export function parseMetadata(value: unknown): DepositionMetadata {
  const root = record(value, '投递信息');
  const entry = record(root.entry, '条目信息');
  const contact = record(root.contact, '联系人信息');
  const citation = record(root.citation, '引用信息');
  const macromolecule = record(root.macromolecule, '大分子信息');
  const assembly = record(root.assembly, '生物组装信息');
  const xray = record(root.xray, '晶体学信息');
  const release = record(root.release, '发布信息');

  return {
    entry: {
      title: text(entry.title, '条目标题', 500),
      keywords: text(entry.keywords, '关键词', 500),
      relatedDataDoi: text(entry.relatedDataDoi, '原始数据 DOI', 200),
    },
    contact: {
      name: text(contact.name, '联系人姓名', 120),
      email: text(contact.email, '联系人邮箱', 254),
      orcid: text(contact.orcid, '联系人 ORCID', 19),
      institution: text(contact.institution, '联系人单位', 300),
      country: text(contact.country, '国家或地区', 120),
    },
    authors: stringList(root.authors, '条目作者', 100, 200),
    citation: {
      status: enumValue(citation.status, CITATION_STATUSES, '引用状态'),
      title: text(citation.title, '论文标题', 500),
      journal: text(citation.journal, '期刊', 300),
      doi: text(citation.doi, '论文 DOI', 200),
    },
    macromolecule: {
      name: text(macromolecule.name, '分子名称', 300),
      type: text(macromolecule.type, '分子类型', 80),
      chainIds: text(macromolecule.chainIds, '链编号', 200),
      sequence: text(macromolecule.sequence, '序列', 200_000),
      sourceOrganism: text(macromolecule.sourceOrganism, '来源生物', 300),
      taxonomyId: text(macromolecule.taxonomyId, '物种分类编号', 40),
      expressionHost: text(macromolecule.expressionHost, '表达宿主', 300),
      mutations: text(macromolecule.mutations, '突变说明', 1_000),
    },
    assembly: {
      oligomericState: text(assembly.oligomericState, '寡聚状态', 120),
      description: text(assembly.description, '生物组装说明', 1_000),
      evidence: text(assembly.evidence, '组装证据', 1_000),
    },
    xray: {
      crystallizationMethod: text(xray.crystallizationMethod, '结晶方法', 300),
      crystallizationPh: text(xray.crystallizationPh, '结晶 pH', 30),
      crystallizationTemperature: text(
        xray.crystallizationTemperature,
        '结晶温度',
        30,
      ),
      spaceGroup: text(xray.spaceGroup, '空间群', 80),
      resolution: text(xray.resolution, '分辨率', 30),
    },
    release: {
      status: enumValue(release.status, RELEASE_STATUSES, '发布策略'),
      holdUntil: text(release.holdUntil, '保留日期', 10),
      termsAccepted: booleanValue(release.termsAccepted, '条款确认'),
    },
  };
}

// 按当前 X 射线投递规则计算进度，并返回最终提交时缺少的项目。
export function calculateCompletion(
  metadata: DepositionMetadata,
  files: Pick<DepositionFile, 'kind'>[],
): DepositionCompletion {
  const checks: Array<[boolean, string]> = [
    [filled(metadata.entry.title), '条目标题'],
    [filled(metadata.entry.keywords), '关键词'],
    [filled(metadata.contact.name), '联系人姓名'],
    [validEmail(metadata.contact.email), '联系人邮箱'],
    [validOrcid(metadata.contact.orcid), '联系人 ORCID（0000-0000-0000-0000）'],
    [filled(metadata.contact.institution), '联系人单位'],
    [filled(metadata.contact.country), '联系人国家或地区'],
    [metadata.authors.some(filled), '至少一位条目作者'],
    [filled(metadata.macromolecule.name), '大分子名称'],
    [filled(metadata.macromolecule.type), '大分子类型'],
    [filled(metadata.macromolecule.chainIds), '链编号'],
    [filled(metadata.macromolecule.sequence), '大分子序列'],
    [filled(metadata.macromolecule.sourceOrganism), '来源生物'],
    [filled(metadata.assembly.oligomericState), '寡聚状态'],
    [filled(metadata.assembly.description), '生物组装说明'],
    [filled(metadata.xray.crystallizationMethod), '结晶方法'],
    [filled(metadata.xray.crystallizationTemperature), '结晶温度'],
    [filled(metadata.xray.spaceGroup), '空间群'],
    [files.some((file) => file.kind === 'COORDINATE'), '坐标文件（mmCIF）'],
    [
      files.some((file) => file.kind === 'STRUCTURE_FACTOR'),
      '结构因子文件（CIF 或 MTZ）',
    ],
    [
      metadata.release.status !== 'HOLD_UNTIL_DATE' ||
        validDate(metadata.release.holdUntil),
      '有效的保留截止日期',
    ],
    [metadata.release.termsAccepted, '数据真实性与发布条款确认'],
  ];

  if (metadata.citation.status === 'PUBLISHED') {
    checks.push(
      [filled(metadata.citation.title), '已发表论文标题'],
      [filled(metadata.citation.journal), '已发表期刊名称'],
    );
  }

  const missing = checks
    .filter(([complete]) => !complete)
    .map(([, label]) => label);
  const completed = checks.length - missing.length;
  return {
    completed,
    total: checks.length,
    percent: Math.round((completed / checks.length) * 100),
    missing,
  };
}

function record(value: unknown, label: string): UnknownRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new BadRequestException(`${label}格式不正确`);
  }
  return value as UnknownRecord;
}

function text(value: unknown, label: string, maxLength: number): string {
  if (typeof value !== 'string')
    throw new BadRequestException(`${label}格式不正确`);
  const normalized = value.trim();
  if (normalized.length > maxLength)
    throw new BadRequestException(`${label}内容过长`);
  return normalized;
}

function stringList(
  value: unknown,
  label: string,
  maxItems: number,
  maxLength: number,
): string[] {
  if (!Array.isArray(value) || value.length > maxItems) {
    throw new BadRequestException(`${label}格式不正确`);
  }
  return value.map((item) => text(item, label, maxLength)).filter(Boolean);
}

function enumValue<const T extends readonly string[]>(
  value: unknown,
  choices: T,
  label: string,
): T[number] {
  if (typeof value !== 'string' || !choices.includes(value)) {
    throw new BadRequestException(`${label}格式不正确`);
  }
  return value as T[number];
}

function booleanValue(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean')
    throw new BadRequestException(`${label}格式不正确`);
  return value;
}

function filled(value: string): boolean {
  return value.trim().length > 0;
}

function validEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function validOrcid(value: string): boolean {
  return /^\d{4}-\d{4}-\d{4}-[\dX]{4}$/i.test(value);
}

function validDate(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
  );
}
