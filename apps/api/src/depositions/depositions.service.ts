import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  AuthUser,
  DepositionDetail,
  DepositionSummary,
} from '@onedep/shared';
import {
  activeAnswers,
  addressKey,
  flattenAnswers,
  getCifBindings,
  getProfileDefinition,
  parseQuestionnaireDraft,
  userOrigins,
  validateFileManifest,
  validateQuestionnaire,
  type Answers,
  type AnswerRecord,
  type CheckRun,
  type DepositionProfile,
  type ParsePatch,
  type ValueOrigin,
} from '@onedep/shared/deposition';
import { createHash, randomInt, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../database/prisma.service.js';
import { parseCreationOptions } from './deposition-creation.js';
import { runGemmi, type GemmiConfig } from './gemmi.js';
export interface UploadedFileData {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}
type Row = Prisma.DepositionGetPayload<{
  include: { files: true; snapshots: true };
}>;
type FileRow = Row['files'][number];
const json = (v: unknown) => v as Prisma.InputJsonValue;
@Injectable()
export class DepositionsService {
  private readonly uploadDir: string;
  private readonly gemmi: GemmiConfig;
  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.uploadDir = resolve(config.getOrThrow<string>('UPLOAD_DIR'));
    this.gemmi = {
      python: config.getOrThrow<string>('ONEDEP_PYTHON'),
      timeoutMs: Number(config.getOrThrow('GEMMI_TIMEOUT_MS')),
      maxOutputBytes: Number(config.getOrThrow('GEMMI_MAX_OUTPUT_BYTES')),
    };
  }
  private profile(row: Row): DepositionProfile {
    if (row.profile !== 'XRAY' && row.profile !== 'EM_SINGLE_PARTICLE')
      throw new BadRequestException('投递缺少有效 profile');
    return row.profile;
  }
  private async owned(
    id: number,
    user: AuthUser,
    editable = false,
  ): Promise<Row> {
    const row = await this.prisma.deposition.findFirst({
      where: { id, submitterId: user.id },
      include: { files: true, snapshots: true },
    });
    if (!row) throw new NotFoundException('投递不存在');
    if (editable && row.status !== 'DRAFT')
      throw new ConflictException('已本地提交的快照不能修改');
    return row;
  }
  private revision(row: Row, input: unknown) {
    if (input !== row.revision)
      throw new ConflictException('版本已变化，请刷新后重试。');
  }
  private async bump(
    tx: Prisma.TransactionClient,
    row: Row,
    data: Prisma.DepositionUpdateManyMutationInput = {},
  ) {
    const result = await tx.deposition.updateMany({
      where: { id: row.id, revision: row.revision, status: 'DRAFT' },
      data: { ...data, revision: { increment: 1 } },
    });
    if (result.count !== 1)
      throw new ConflictException('版本已变化，请刷新后重试。');
  }
  async list(user: AuthUser): Promise<DepositionSummary[]> {
    const rows = await this.prisma.deposition.findMany({
      where: { submitterId: user.id },
      include: { files: true, snapshots: true },
      orderBy: { updatedAt: 'desc' },
    });
    return rows.map((row) => this.summary(row));
  }
  async create(user: AuthUser, input: unknown): Promise<DepositionDetail> {
    const creation = parseCreationOptions(input);
    let profile: DepositionProfile;
    if (creation.methods.length === 1 && creation.methods[0] === 'XRAY')
      profile = 'XRAY';
    else if (
      creation.methods.length === 1 &&
      creation.methods[0] === 'EM' &&
      creation.emSubtype === 'SINGLE_PARTICLE' &&
      creation.coordinates &&
      creation.emMapStatus === 'NEW_MAP' &&
      creation.compositeMap === false
    )
      profile = 'EM_SINGLE_PARTICLE';
    else
      throw new BadRequestException(
        '本地 demo 仅支持 X-ray 或电镜单颗粒、模型与新图、非组合图。',
      );
    const row = await this.prisma.deposition.create({
      data: {
        code: `LOCAL_${randomInt(1000000000)}`,
        method: creation.methods[0]!,
        methods: creation.methods,
        creation: json(creation),
        submitterId: user.id,
        profile,
      },
      include: { files: true, snapshots: true },
    });
    return this.detail(row);
  }
  async get(id: number, user: AuthUser) {
    return this.detail(await this.owned(id, user));
  }
  async update(id: number, user: AuthUser, input: unknown) {
    const current = await this.owned(id, user, true);
    const profile = this.profile(current);
    if (!input || typeof input !== 'object' || Array.isArray(input))
      throw new BadRequestException('无效的草稿请求');
    const body = input as Record<string, unknown>;
    if (Object.keys(body).some((k) => !['revision', 'answers'].includes(k)))
      throw new BadRequestException('未知草稿属性');
    this.revision(current, body.revision);
    let answers: Answers;

    answers = parseQuestionnaireDraft({
      profile,
      answers: body.answers,
    }).answers;

    const before = current.answers as Answers;
    const origins = current.origins as unknown as ValueOrigin[];
    const oldFlat = new Map(
      flattenAnswers(before).map((v) => [addressKey(v.address), v.value]),
    );
    const flat = new Map(
      flattenAnswers(answers).map((v) => [addressKey(v.address), v.value]),
    );
    const readonly = getCifBindings(profile).filter((b) => b.readOnly);
    for (const value of [
      ...flattenAnswers(before),
      ...flattenAnswers(answers),
    ]) {
      if (
        readonly.some(
          (b) =>
            b.field === value.address.field &&
            b.group === value.address.collection,
        ) &&
        JSON.stringify(flat.get(addressKey(value.address))) !==
          JSON.stringify(oldFlat.get(addressKey(value.address)))
      )
        throw new BadRequestException(
          `解析只读字段不可修改：${value.address.field}`,
        );
    }
    // Parsed record membership comes from the coordinate file, independent of order.
    for (const page of getProfileDefinition(profile).pages)
      for (const el of page.elements) {
        if (el.type === 'paneldynamic' && el.x.origin === 'parsed') {
          if (!(el.name in before) && !(el.name in answers)) continue;
          if (
            !Array.isArray(before[el.name]) ||
            !Array.isArray(answers[el.name])
          )
            throw new BadRequestException('解析实体记录缺失');
          const ids = (a: Answers) =>
            (a[el.name] as AnswerRecord[])
              .map((r) => r.recordId)
              .sort()
              .join('|');
          if (ids(before) !== ids(answers))
            throw new BadRequestException('解析生成的实体记录不可新增或删除。');
        }
      }
    await this.prisma.$transaction((tx) =>
      this.bump(tx, current, {
        answers: json(answers),
        origins: json(userOrigins(before, answers, origins)),
      }),
    );
    return this.get(id, user);
  }
  async uploadFile(
    id: number,
    user: AuthUser,
    kind: string,
    slot: number,
    revision: number,
    file: UploadedFileData | undefined,
  ) {
    const current = await this.owned(id, user, true);
    this.revision(current, revision);
    const profile = this.profile(current);
    if (!file || file.size <= 0 || file.size > 100 * 1024 * 1024)
      throw new BadRequestException('请选择 100 MB 以内的非空文件。');
    const issues = validateFileManifest(profile, [
      { id: 'new', role: kind, slot, originalName: file.originalname },
    ]);
    if (issues.length)
      throw new BadRequestException(issues.map((i) => i.message).join('；'));
    const requirement = getProfileDefinition(profile).files.find(
      (f) => f.role === kind,
    )!;
    const version =
      Math.max(
        0,
        ...current.files
          .filter((f) => f.kind === kind && f.slot === slot)
          .map((f) => f.revision),
      ) + 1;
    const extension = file.originalname.toLowerCase().endsWith('.gz')
      ? '.map.gz'
      : extname(file.originalname).toLowerCase();
    const storedName = randomUUID() + extension;
    await mkdir(this.uploadDir, { recursive: true });
    await writeFile(resolve(this.uploadDir, storedName), file.buffer, {
      flag: 'wx',
    });
    let result: Record<string, unknown>;

    result = await runGemmi(
      {
        action: 'inspect',
        path: resolve(this.uploadDir, storedName),
        parserId: requirement.parserId,
        bindings: getCifBindings(profile),
      },
      this.gemmi,
    );

    await this.prisma.$transaction(async (tx) => {
      await this.bump(tx, current);
      await tx.depositionFile.updateMany({
        where: {
          depositionId: id,
          kind: kind as FileRow['kind'],
          slot,
          active: true,
        },
        data: { active: false },
      });
      const saved = await tx.depositionFile.create({
        data: {
          depositionId: id,
          kind: kind as FileRow['kind'],
          slot,
          revision: version,
          originalName: file.originalname,
          storedName,
          mimeType: file.mimetype,
          size: file.size,
          checksum: createHash('sha256').update(file.buffer).digest('hex'),
          parseState: 'succeeded',
          parseError: null,
          parseResult: json({ ...result, conflicts: [] }),
        },
      });
      if (kind === 'COORDINATE') {
        const merged = this.merge(current, saved, result);
        await tx.depositionFile.update({
          where: { id: saved.id },
          data: {
            parseResult: json({ ...result, conflicts: merged.conflicts }),
          },
        });
        await tx.deposition.update({
          where: { id },
          data: {
            answers: json(merged.answers),
            origins: json(merged.origins),
          },
        });
      }
    });
    return this.get(id, user);
  }
  private merge(current: Row, file: FileRow, result: Record<string, unknown>) {
    const answers = structuredClone(current.answers) as Answers;
    const origins = new Map(
      (current.origins as unknown as ValueOrigin[]).map((o) => [
        addressKey(o.address),
        o,
      ]),
    );
    const patch = result as unknown as {
      values: ParsePatch['values'];
      records: ParsePatch['records'];
    };
    const conflicts: string[] = [];
    const incoming = new Set(patch.values.map((v) => addressKey(v.address)));
    for (const [key, origin] of origins) {
      if (
        origin.source !== 'file' ||
        origin.address.field === 'recordId' ||
        incoming.has(key)
      )
        continue;
      const { collection, recordId, field } = origin.address;
      if (collection) {
        const row = (answers[collection] as AnswerRecord[] | undefined)?.find(
          (r) => r.recordId === recordId,
        );
        if (row) delete row[field];
      } else delete answers[field];
      origins.delete(key);
    }
    for (const record of patch.records) {
      if (!(record.collection in answers)) answers[record.collection] = [];
      const rows = answers[record.collection] as AnswerRecord[];
      if (!rows.some((r) => r.recordId === record.recordId))
        rows.push({ recordId: record.recordId });
      const address = {
        collection: record.collection,
        recordId: record.recordId,
        field: 'recordId',
      };
      origins.set(addressKey(address), {
        address,
        source: 'file',
        fileId: String(file.id),
        fileRevision: file.revision,
        sourceRowKey: record.sourceRowKey,
      });
    }
    for (const value of patch.values) {
      const key = addressKey(value.address),
        existing = origins.get(key);
      if (existing?.source === 'user') {
        const row = value.address.collection
          ? (answers[value.address.collection] as AnswerRecord[]).find(
              (r) => r.recordId === value.address.recordId,
            )
          : answers;
        if (
          JSON.stringify(row?.[value.address.field]) !==
          JSON.stringify(value.value)
        )
          conflicts.push(`${key}: 已保留人工值，文件候选值未覆盖。`);
        continue;
      }
      const { collection, recordId, field } = value.address;
      if (collection) {
        const row = (answers[collection] as AnswerRecord[]).find(
          (r) => r.recordId === recordId,
        )!;
        row[field] = value.value;
      } else answers[field] = value.value;
      origins.set(key, {
        address: value.address,
        source: 'file',
        fileId: String(file.id),
        fileRevision: file.revision,
        tag: value.tag,
        sourceRowKey: value.sourceRowKey,
      });
    }
    return { answers, origins: [...origins.values()], conflicts };
  }
  async reparse(id: number, fileId: number, user: AuthUser, revision: number) {
    const row = await this.owned(id, user, true);
    this.revision(row, revision);
    const profile = this.profile(row);
    const file = row.files.find((f) => f.id === fileId && f.active);
    if (!file) throw new NotFoundException('当前文件不存在');
    const requirement = getProfileDefinition(profile).files.find(
      (f) => f.role === file.kind,
    )!;
    let result: Record<string, unknown>;

    result = await runGemmi(
      {
        action: 'inspect',
        path: resolve(this.uploadDir, file.storedName),
        parserId: requirement.parserId,
        bindings: getCifBindings(profile),
      },
      this.gemmi,
    );

    await this.prisma.$transaction(async (tx) => {
      await this.bump(tx, row);
      await tx.depositionFile.update({
        where: { id: fileId },
        data: {
          parseState: 'succeeded',
          parseError: null,
          parseResult: json(result),
        },
      });
      if (file.kind === 'COORDINATE') {
        const merged = this.merge(row, file, result);
        await tx.depositionFile.update({
          where: { id: file.id },
          data: {
            parseResult: json({ ...result, conflicts: merged.conflicts }),
          },
        });
        await tx.deposition.update({
          where: { id },
          data: {
            answers: json(merged.answers),
            origins: json(merged.origins),
          },
        });
      }
    });
    return this.get(id, user);
  }
  async removeFile(
    id: number,
    fileId: number,
    user: AuthUser,
    revision: number,
  ) {
    const row = await this.owned(id, user, true);
    this.revision(row, revision);
    if (!row.files.some((f) => f.id === fileId && f.active))
      throw new NotFoundException('当前文件不存在');
    await this.prisma.$transaction(async (tx) => {
      await this.bump(tx, row);
      await tx.depositionFile.update({
        where: { id: fileId },
        data: { active: false },
      });
    });
  }
  async downloadFile(id: number, fileId: number, user: AuthUser) {
    const row = await this.owned(id, user);
    const file = row.files.find((f) => f.id === fileId);
    if (!file) throw new NotFoundException('文件不存在');
    return {
      file: this.file(file),
      content: await readFile(resolve(this.uploadDir, file.storedName)),
    };
  }
  async check(id: number, user: AuthUser, revision: number) {
    const row = await this.owned(id, user, true);
    this.revision(row, revision);
    const checks = await this.runChecks(row);
    const updated = await this.prisma.deposition.updateMany({
      where: { id, revision: row.revision, status: 'DRAFT' },
      data: { checks: json(checks) },
    });
    if (!updated.count)
      throw new ConflictException('检查期间数据发生变化，请重新检查。');
    return this.get(id, user);
  }
  private async runChecks(row: Row): Promise<CheckRun[]> {
    const profile = this.profile(row);
    const answers = row.answers as Answers;
    const configured = getProfileDefinition(profile);
    const runs: CheckRun[] = configured.checks.map((c) => ({
      id: randomUUID(),
      checkId: c.id,
      inputRevision: row.revision,
      definitionRevision: configured.revision,
      state: c.requiredFor.length ? 'running' : 'unavailable',
      issues: [],
    }));
    const questionnaire = runs[0]!;
    questionnaire.state = 'succeeded';
    questionnaire.issues = validateQuestionnaire(
      { profile, answers },
      'complete',
    ).map((i) => ({
      code: i.code,
      severity:
        i.path.includes('termsAccepted') || i.code !== 'required'
          ? 'error'
          : 'warning',
      message: `${i.path.join('.')}: ${i.message}`,
      checkId: questionnaire.checkId,
    }));
    const content = runs[1]!;
    const files = row.files.filter((f) => f.active);
    content.issues = validateFileManifest(
      profile,
      files.map((f) => ({
        id: String(f.id),
        role: f.kind,
        slot: f.slot,
        originalName: f.originalName,
      })),
      'complete',
    ).map((i) => ({
      code: i.code,
      severity: 'error',
      message: `${i.path.join('.')}: ${i.message}`,
      checkId: content.checkId,
    }));
    const facts = new Map<string, Record<string, unknown>>();
    for (const file of files) {
      if (file.parseState !== 'succeeded')
        throw new Error(
          'File ' +
            file.id +
            ' parse state: ' +
            file.parseState +
            ': ' +
            file.parseError,
        );
      const bytes = await readFile(resolve(this.uploadDir, file.storedName));
      if (createHash('sha256').update(bytes).digest('hex') !== file.checksum)
        throw new Error('文件摘要与保存版本不符');
      const rule = configured.files.find((f) => f.role === file.kind);
      if (!rule) throw new Error('当前方法不接受此文件角色');
      const result = await runGemmi(
        {
          action: 'inspect',
          path: resolve(this.uploadDir, file.storedName),
          parserId: rule.parserId,
          bindings: getCifBindings(profile),
        },
        this.gemmi,
      );
      facts.set(
        `${file.kind}:${file.slot}`,
        result.facts as Record<string, unknown>,
      );
      if (file.kind === 'COORDINATE') {
        const expected = (
          result as unknown as { records: ParsePatch['records'] }
        ).records
          .filter((r) => r.collection === 'molecules')
          .map((r) => r.recordId)
          .sort();
        if (!Array.isArray(answers.molecules))
          throw new Error('Coordinate entities are missing from questionnaire');
        const actual = (answers.molecules as AnswerRecord[])
          .map((r) => r.recordId)
          .sort();
        if (JSON.stringify(expected) !== JSON.stringify(actual))
          throw new Error(
            '当前坐标的实体键与问卷不一致，请明确处理旧记录后重新解析。',
          );
      }
    }
    const half = files.filter((f) => f.kind === 'EM_HALF_MAP');
    if (half.length === 2 && half[0]!.checksum === half[1]!.checksum)
      content.issues.push({
        code: 'identical_half_maps',
        severity: 'error',
        message: '两份半图内容相同，需要两份独立文件。',
        checkId: content.checkId,
      });
    const main = facts.get('EM_MAP:1');
    if (main)
      for (const slot of [1, 2]) {
        const h = facts.get(`EM_HALF_MAP:${slot}`);
        if (
          h &&
          ['shape', 'sampling', 'voxelAngstrom', 'axisOrder', 'origin'].some(
            (k) => JSON.stringify(main[k]) !== JSON.stringify(h[k]),
          )
        )
          content.issues.push({
            code: 'map_grid_mismatch',
            severity: 'error',
            message: `半图 ${slot} 与主图网格信息不一致。`,
            checkId: content.checkId,
          });
      }
    if (content.state === 'running') content.state = 'succeeded';
    return runs;
  }
  async submit(id: number, user: AuthUser, revision: number) {
    const row = await this.owned(id, user, true);
    this.revision(row, revision);
    const profile = this.profile(row);
    const checks = row.checks as unknown as CheckRun[];
    for (const rule of getProfileDefinition(profile).checks.filter((c) =>
      c.requiredFor.includes('submit'),
    )) {
      const run = checks.find((c) => c.checkId === rule.id);
      if (
        !run ||
        run.inputRevision !== row.revision ||
        run.definitionRevision !== getProfileDefinition(profile).revision ||
        run.state !== 'succeeded' ||
        run.issues.some((i) => i.severity === 'error')
      )
        throw new BadRequestException('请先执行当前版本检查并处理阻塞项。');
    }
    const snapshotId = randomUUID();
    const exportName = snapshotId + '.zip';
    const cifName = snapshotId + '.cif';
    const files = row.files.filter((f) => f.active);
    const coordinate = files.find((f) => f.kind === 'COORDINATE')!;
    const active = activeAnswers(profile, row.answers as Answers);
    const snapshot = {
      id: snapshotId,
      draftRevision: row.revision,
      definitionRevision: getProfileDefinition(profile).revision,
      draft: {
        profileId: profile,
        definitionRevision: getProfileDefinition(profile).revision,
        revision: row.revision,
        status: 'SUBMITTED',
        answers: active,
        files: files.map((f) => this.file(f)),
        origins: row.origins,
      },
      checks,
    };
    // Recheck bytes immediately before export; never rely on an old success card.
    for (const file of files) {
      const bytes = await readFile(resolve(this.uploadDir, file.storedName));
      if (createHash('sha256').update(bytes).digest('hex') !== file.checksum)
        throw new BadRequestException('附件内容变化，请重新上传并检查。');
    }
    let result: Record<string, unknown>;

    result = await runGemmi(
      {
        action: 'export',
        basePath: resolve(this.uploadDir, coordinate.storedName + '.base.cif'),
        cifPath: resolve(this.uploadDir, cifName),
        zipPath: resolve(this.uploadDir, exportName),
        answers: active,
        origins: row.origins,
        bindings: getCifBindings(profile),
        snapshot,
        attachments: files
          .filter((f) => f.kind !== 'COORDINATE')
          .map((f) => ({
            path: resolve(this.uploadDir, f.storedName),
            name: f.originalName,
            role: f.kind,
            slot: f.slot,
          })),
      },
      this.gemmi,
    );

    await this.prisma.$transaction(async (tx) => {
      await this.bump(tx, row, {
        status: 'SUBMITTED',
        submittedAt: new Date(),
      });
      await tx.submission.create({
        data: {
          id: snapshotId,
          depositionId: id,
          snapshot: json({ ...snapshot, verification: result }),
          exportName,
          checksum: String(result.sha256),
        },
      });
    });
    return this.get(id, user);
  }
  async export(id: number, user: AuthUser) {
    const row = await this.owned(id, user);
    const snapshot = row.snapshots[0];
    if (!snapshot) throw new BadRequestException('请先完成本地提交');
    const content = await readFile(
      resolve(this.uploadDir, snapshot.exportName),
    );
    if (
      createHash('sha256').update(content).digest('hex') !== snapshot.checksum
    )
      throw new ConflictException('导出包摘要不匹配');
    return { content, name: row.code + '.zip' };
  }
  private file(f: FileRow) {
    const parsed = f.parseResult as Record<string, unknown>;
    if (
      f.parseState === 'succeeded' &&
      (!parsed.facts || typeof parsed.facts !== 'object')
    )
      throw new Error('Missing parsed facts for file ' + f.id);
    if ('conflicts' in parsed && !Array.isArray(parsed.conflicts))
      throw new Error('Missing merge result for file ' + f.id);
    return {
      id: f.id,
      kind: f.kind,
      role: f.kind,
      slot: f.slot,
      revision: f.revision,
      originalName: f.originalName,
      mimeType: f.mimeType,
      size: f.size,
      checksum: f.checksum,
      createdAt: f.createdAt.toISOString(),
      parseState: f.parseState,
      parseError: f.parseError,
      facts: f.parseState === 'succeeded' ? parsed.facts : null,
      conflicts: (f.parseResult as Record<string, unknown>)
        .conflicts as string[],
    };
  }
  private summary(row: Row): DepositionSummary {
    const title = (row.answers as Answers).title;
    if (title !== undefined && typeof title !== 'string')
      throw new Error('Invalid deposition title: ' + row.id);
    const checks = row.checks as unknown as CheckRun[];
    const missing = checks.flatMap((c) =>
      c.inputRevision === row.revision
        ? c.issues.filter((i) => i.severity === 'error').map((i) => i.message)
        : [],
    );
    return {
      id: row.id,
      code: row.code,
      method: row.method,
      methods: row.methods,
      status: row.status,
      title: title === undefined ? null : title,
      updatedAt: row.updatedAt.toISOString(),
      submittedAt:
        row.submittedAt === null ? null : row.submittedAt.toISOString(),
      completion: { completed: 0, total: 0, percent: 0, missing },
    };
  }
  private detail(row: Row): DepositionDetail {
    const profile = this.profile(row);
    return {
      ...this.summary(row),
      creation: row.creation as unknown as DepositionDetail['creation'],
      profile,
      definitionRevision: getProfileDefinition(profile).revision,
      revision: row.revision,
      answers: row.answers as Answers,
      origins: row.origins as unknown as ValueOrigin[],
      checks: row.checks as unknown as CheckRun[],
      files: row.files.filter((f) => f.active).map((f) => this.file(f)),
      submission: row.snapshots[0]
        ? { id: row.snapshots[0].id, checksum: row.snapshots[0].checksum }
        : null,
    };
  }
}
