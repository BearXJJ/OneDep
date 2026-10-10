import { BadRequestException } from '@nestjs/common';
import type {
  AccessionCode,
  DepositionCreationOptions,
  DepositionMethod,
  EmMapStatus,
  EmSubtype,
} from '@onedep/shared';

const METHODS: DepositionMethod[] = [
  'XRAY',
  'EM',
  'NMR',
  'NEUTRON',
  'EC',
  'SSNMR',
  'FIBER',
];
const EM_SUBTYPES: EmSubtype[] = [
  'HELICAL',
  'SINGLE_PARTICLE',
  'SUBTOMOGRAM',
  'TOMOGRAPHY',
];
const EM_MAP_STATUSES: EmMapStatus[] = [
  'NEW_MAP',
  'STRUCTURE_FACTORS_ONLY',
  'PREVIOUS',
];

// 按 OneDep 创建会话时的条件问题校验并规范化实验方法选择。
export function parseCreationOptions(
  value: unknown,
): DepositionCreationOptions {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new BadRequestException('请选择实验方法');
  }
  const input = value as Record<string, unknown>;
  const methods = uniqueMethods(input.methods);
  const hasEm = methods.includes('EM');
  const hasEc = methods.includes('EC');
  const hasNmr = methods.includes('NMR') || methods.includes('SSNMR');
  const needsCoordinateQuestion = hasEm || hasNmr;

  const emSubtype = hasEm
    ? enumOrThrow(input.emSubtype, EM_SUBTYPES, '请选择电子显微镜子方法')
    : null;
  let coordinates = needsCoordinateQuestion
    ? booleanOrThrow(input.coordinates, '请选择是否提交坐标')
    : null;
  if (emSubtype === 'TOMOGRAPHY')
    coordinates = hasNmr && (hasEm || hasEc) ? true : false;
  if (hasNmr && (hasEm || hasEc) && coordinates === false) {
    throw new BadRequestException('EM 或 EC 与 NMR 联合投递必须包含坐标');
  }

  let emMapStatus: EmMapStatus | null = null;
  if (hasEm && coordinates === true) {
    emMapStatus = enumOrThrow(
      input.emMapStatus,
      EM_MAP_STATUSES,
      '请选择关联地图的投递状态',
    );
    if (!hasEc && emMapStatus === 'STRUCTURE_FACTORS_ONLY') {
      throw new BadRequestException('只有电子晶体学可以仅提交结构因子');
    }
  } else if (hasEm) {
    emMapStatus = 'NEW_MAP';
  }

  const relatedEmdb =
    emMapStatus === 'PREVIOUS'
      ? requiredText(input.relatedEmdb, '请输入关联 EMDB 编号')
      : '';
  if (relatedEmdb && !/^EMD-\d{4,}$/i.test(relatedEmdb)) {
    throw new BadRequestException('关联 EMDB 编号格式不正确');
  }

  const needsComposite =
    hasEm &&
    emMapStatus === 'NEW_MAP' &&
    (emSubtype === 'SINGLE_PARTICLE' || emSubtype === 'SUBTOMOGRAM');
  const compositeMap = needsComposite
    ? booleanOrThrow(input.compositeMap, '请选择是否为复合地图投递')
    : null;

  let nmrDataPreviouslyDeposited: boolean | null = null;
  if (hasNmr && coordinates === true) {
    nmrDataPreviouslyDeposited = booleanOrThrow(
      input.nmrDataPreviouslyDeposited,
      '请选择关联 NMR 实验数据是否已投递',
    );
  } else if (hasNmr) {
    nmrDataPreviouslyDeposited = false;
  }

  const relatedBmrb = nmrDataPreviouslyDeposited
    ? requiredText(input.relatedBmrb, '请输入关联 BMRB 编号')
    : '';
  if (relatedBmrb && !/^\d{1,5}$/.test(relatedBmrb)) {
    throw new BadRequestException('关联 BMRB 编号格式不正确');
  }

  const accessionCodes = calculateAccessionCodes({
    methods,
    coordinates,
    emMapStatus,
    nmrDataPreviouslyDeposited,
  });
  if (accessionCodes.length === 1 && accessionCodes[0] === 'BMRB') {
    throw new BadRequestException('仅提交 NMR 实验数据时请使用 BMRB 投递系统');
  }

  return {
    methods,
    emSubtype,
    coordinates,
    emMapStatus,
    relatedEmdb,
    compositeMap,
    nmrDataPreviouslyDeposited,
    relatedBmrb,
    accessionCodes,
  };
}

// 根据实验方法和既有投递情况自动计算 OneDep 请求的数据库编号。
export function calculateAccessionCodes(input: {
  methods: DepositionMethod[];
  coordinates: boolean | null;
  emMapStatus: EmMapStatus | null;
  nmrDataPreviouslyDeposited: boolean | null;
}): AccessionCode[] {
  const codes: AccessionCode[] = [];
  const hasCoordinatesByMethod = input.methods.some((method) =>
    ['XRAY', 'NEUTRON', 'FIBER', 'EC'].includes(method),
  );
  const hasEm = input.methods.includes('EM');
  const hasNmr =
    input.methods.includes('NMR') || input.methods.includes('SSNMR');

  if (hasCoordinatesByMethod || input.coordinates === true) codes.push('PDB');
  if (
    hasEm &&
    input.emMapStatus !== 'PREVIOUS' &&
    input.emMapStatus !== 'STRUCTURE_FACTORS_ONLY'
  ) {
    codes.push('EMDB');
  }
  if (hasNmr && input.nmrDataPreviouslyDeposited !== true) codes.push('BMRB');
  return codes;
}

function uniqueMethods(value: unknown): DepositionMethod[] {
  if (!Array.isArray(value)) throw new BadRequestException('请选择实验方法');
  const values = new Set(value);
  if (
    !values.size ||
    [...values].some((method) => !METHODS.includes(method as DepositionMethod))
  ) {
    throw new BadRequestException('实验方法不正确');
  }
  return METHODS.filter((method) => values.has(method));
}

function enumOrThrow<T extends string>(
  value: unknown,
  choices: T[],
  message: string,
): T {
  if (typeof value !== 'string' || !choices.includes(value as T)) {
    throw new BadRequestException(message);
  }
  return value as T;
}

function booleanOrThrow(value: unknown, message: string): boolean {
  if (typeof value !== 'boolean') throw new BadRequestException(message);
  return value;
}

function requiredText(value: unknown, message: string): string {
  if (typeof value !== 'string' || !value.trim())
    throw new BadRequestException(message);
  return value.trim();
}
