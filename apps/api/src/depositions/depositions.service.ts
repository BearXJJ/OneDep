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
  DepositionFile,
  DepositionFileKind,
  DepositionMetadata,
  DepositionSummary,
} from '@onedep/shared';
import { createHash, randomInt, randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';

import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../database/prisma.service.js';
import {
  calculateCompletion,
  createDefaultMetadata,
  parseMetadata,
} from './deposition-metadata.js';
import { parseCreationOptions } from './deposition-creation.js';

const MAX_FILE_SIZE = 100 * 1024 * 1024;
const EXTENSIONS: Record<DepositionFileKind, Set<string>> = {
  COORDINATE: new Set(['.cif', '.mmcif']),
  STRUCTURE_FACTOR: new Set(['.cif', '.mmcif', '.mtz']),
};

export interface UploadedFileData {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

type DepositionRow = Prisma.DepositionGetPayload<{ include: { files: true } }>;

@Injectable()
export class DepositionsService {
  private readonly uploadDir: string;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.uploadDir = resolve(
      config.get<string>('UPLOAD_DIR') ?? resolve(process.cwd(), 'uploads'),
    );
  }

  // 返回当前提交员自己的投递，最近修改的排在前面。
  async list(user: AuthUser): Promise<DepositionSummary[]> {
    const rows = await this.prisma.deposition.findMany({
      where: { submitterId: user.id },
      include: { files: true },
      orderBy: { updatedAt: 'desc' },
    });
    return rows.map((row) => this.toSummary(row));
  }

  // 按创建页选择建立只有当前提交员可以访问的草稿。
  async create(user: AuthUser, body: unknown): Promise<DepositionDetail> {
    const creation = parseCreationOptions(body);
    const method = creation.methods[0]!;
    const metadata = createDefaultMetadata(user);
    for (let attempt = 0; attempt < 4; attempt += 1) {
      try {
        const row = await this.prisma.deposition.create({
          data: {
            code: `D_${randomInt(10_000_000_000).toString().padStart(10, '0')}`,
            submitterId: user.id,
            method,
            methods: creation.methods,
            creation: creation as unknown as Prisma.InputJsonValue,
            metadata: metadata as unknown as Prisma.InputJsonValue,
          },
          include: { files: true },
        });
        return this.toDetail(row);
      } catch (error) {
        if (!this.isUniqueConflict(error) || attempt === 3) throw error;
      }
    }
    throw new ConflictException('无法生成投递编号，请重试');
  }

  async get(id: number, user: AuthUser): Promise<DepositionDetail> {
    return this.toDetail(await this.getOwnedRow(id, user.id));
  }

  // 草稿保存采用完整快照，服务端会过滤未定义字段和异常类型。
  async update(
    id: number,
    user: AuthUser,
    body: unknown,
  ): Promise<DepositionDetail> {
    const current = await this.getEditableRow(id, user.id);
    const metadata = parseMetadata(body);
    const row = await this.prisma.deposition.update({
      where: { id: current.id },
      data: { metadata: metadata as unknown as Prisma.InputJsonValue },
      include: { files: true },
    });
    return this.toDetail(row);
  }

  // 上传成功后替换同一类旧文件，磁盘只保留当前版本。
  async uploadFile(
    id: number,
    user: AuthUser,
    rawKind: string,
    file: UploadedFileData | undefined,
  ): Promise<DepositionDetail> {
    const kind = this.parseFileKind(rawKind);
    const current = await this.getEditableRow(id, user.id);
    if (!file) throw new BadRequestException('请选择要上传的文件');
    if (file.size <= 0 || file.size > MAX_FILE_SIZE) {
      throw new BadRequestException('文件大小必须在 100 MB 以内');
    }

    const extension = extname(file.originalname).toLowerCase();
    if (!EXTENSIONS[kind].has(extension)) {
      const expected =
        kind === 'COORDINATE' ? 'mmCIF（.cif 或 .mmcif）' : 'CIF 或 MTZ';
      throw new BadRequestException(`该位置只接受${expected}文件`);
    }

    await mkdir(this.uploadDir, { recursive: true });
    const storedName = `${randomUUID()}${extension}`;
    const destination = resolve(this.uploadDir, storedName);
    await writeFile(destination, file.buffer, { flag: 'wx' });

    const previous = current.files.find((entry) => entry.kind === kind);
    try {
      await this.prisma.depositionFile.upsert({
        where: { depositionId_kind: { depositionId: id, kind } },
        create: {
          depositionId: id,
          kind,
          originalName: file.originalname,
          storedName,
          mimeType: file.mimetype || 'application/octet-stream',
          size: file.size,
          checksum: createHash('sha256').update(file.buffer).digest('hex'),
        },
        update: {
          originalName: file.originalname,
          storedName,
          mimeType: file.mimetype || 'application/octet-stream',
          size: file.size,
          checksum: createHash('sha256').update(file.buffer).digest('hex'),
          createdAt: new Date(),
        },
      });
    } catch (error) {
      await this.removeStoredFile(storedName);
      throw error;
    }

    if (previous) await this.removeStoredFile(previous.storedName);
    return this.get(id, user);
  }

  async removeFile(id: number, fileId: number, user: AuthUser): Promise<void> {
    const current = await this.getEditableRow(id, user.id);
    const file = current.files.find((entry) => entry.id === fileId);
    if (!file) throw new NotFoundException('投递文件不存在');
    await this.prisma.depositionFile.delete({ where: { id: file.id } });
    await this.removeStoredFile(file.storedName);
  }

  async downloadFile(
    id: number,
    fileId: number,
    user: AuthUser,
  ): Promise<{ file: DepositionFile; content: Buffer }> {
    const current = await this.getOwnedRow(id, user.id);
    const stored = current.files.find((entry) => entry.id === fileId);
    if (!stored) throw new NotFoundException('投递文件不存在');
    try {
      return {
        file: this.toFile(stored),
        content: await readFile(resolve(this.uploadDir, stored.storedName)),
      };
    } catch {
      throw new NotFoundException('投递文件内容不存在');
    }
  }

  // 最终提交前重新以服务端规则检查，不相信浏览器显示的完成度。
  async submit(id: number, user: AuthUser): Promise<DepositionDetail> {
    const current = await this.getEditableRow(id, user.id);
    const metadata = this.metadataOf(current);
    const completion = calculateCompletion(metadata, current.files);
    if (completion.missing.length) {
      throw new BadRequestException(
        `请先补全：${completion.missing.join('、')}`,
      );
    }
    const row = await this.prisma.deposition.update({
      where: { id: current.id },
      data: { status: 'SUBMITTED', submittedAt: new Date() },
      include: { files: true },
    });
    return this.toDetail(row);
  }

  private async getOwnedRow(
    id: number,
    submitterId: number,
  ): Promise<DepositionRow> {
    const row = await this.prisma.deposition.findFirst({
      where: { id, submitterId },
      include: { files: true },
    });
    if (!row) throw new NotFoundException('投递不存在');
    return row;
  }

  private async getEditableRow(
    id: number,
    submitterId: number,
  ): Promise<DepositionRow> {
    const row = await this.getOwnedRow(id, submitterId);
    if (row.status !== 'DRAFT')
      throw new ConflictException('已提交的条目不能继续修改');
    return row;
  }

  private toDetail(row: DepositionRow): DepositionDetail {
    return {
      ...this.toSummary(row),
      creation: parseCreationOptions({
        ...(row.creation as Record<string, unknown>),
        methods: row.methods.length ? row.methods : [row.method],
      }),
      metadata: this.metadataOf(row),
      files: row.files.map((file) => this.toFile(file)),
    };
  }

  private toSummary(row: DepositionRow): DepositionSummary {
    const metadata = this.metadataOf(row);
    return {
      id: row.id,
      code: row.code,
      method: row.method,
      methods: row.methods.length ? row.methods : [row.method],
      status: row.status,
      title: metadata.entry.title,
      updatedAt: row.updatedAt.toISOString(),
      submittedAt: row.submittedAt?.toISOString() ?? null,
      completion: calculateCompletion(metadata, row.files),
    };
  }

  private metadataOf(row: DepositionRow): DepositionMetadata {
    return parseMetadata(row.metadata);
  }

  private toFile(file: DepositionRow['files'][number]): DepositionFile {
    return {
      id: file.id,
      kind: file.kind,
      originalName: file.originalName,
      mimeType: file.mimeType,
      size: file.size,
      checksum: file.checksum,
      createdAt: file.createdAt.toISOString(),
    };
  }

  private parseFileKind(value: string): DepositionFileKind {
    if (value !== 'COORDINATE' && value !== 'STRUCTURE_FACTOR') {
      throw new BadRequestException('文件类型不正确');
    }
    return value;
  }

  private async removeStoredFile(storedName: string): Promise<void> {
    try {
      await unlink(resolve(this.uploadDir, storedName));
    } catch {
      // 文件已不存在时不阻断数据库操作。
    }
  }

  private isUniqueConflict(error: unknown): boolean {
    return (
      !!error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'P2002'
    );
  }
}
