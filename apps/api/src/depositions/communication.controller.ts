import {
  Body,
  Controller,
  Get,
  Post,
  Param,
  ParseIntPipe,
  Req,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import { Roles, type AuthenticatedRequest } from '../auth/session.guard.js';
import type { AuthUser } from '@onedep/shared';
const author = { select: { id: true, email: true, name: true, role: true } };
@Roles('SUBMITTER', 'REVIEWER', 'ADMIN')
@Controller('communication')
export class CommunicationController {
  constructor(private readonly prisma: PrismaService) {}
  private async access(id: number, user: AuthUser) {
    const where =
      user.role === 'SUBMITTER'
        ? { id, submitterId: user.id }
        : {
            id,
            OR: [{ status: 'SUBMITTED' as const }, { messages: { some: {} } }],
          };
    const row = await this.prisma.deposition.findFirst({
      where,
      select: { id: true },
    });
    if (!row) throw new NotFoundException('投递不存在');
  }
  @Get()
  @Roles('REVIEWER', 'ADMIN')
  queue() {
    return this.prisma.deposition.findMany({
      where: { OR: [{ status: 'SUBMITTED' }, { messages: { some: {} } }] },
      select: {
        id: true,
        code: true,
        method: true,
        status: true,
        updatedAt: true,
        messages: {
          take: 1,
          orderBy: { createdAt: 'desc' },
          include: { author },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }
  @Get(':id')
  async list(
    @Param('id', ParseIntPipe) id: number,
    @Req() request: AuthenticatedRequest,
  ) {
    await this.access(id, request.authUser);
    return this.prisma.depositionMessage.findMany({
      where: { depositionId: id },
      include: { author },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  }
  @Post(':id')
  async send(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { subject: unknown; body: unknown },
    @Req() request: AuthenticatedRequest,
  ) {
    await this.access(id, request.authUser);
    if (
      typeof body.subject !== 'string' ||
      !body.subject.trim() ||
      typeof body.body !== 'string' ||
      !body.body.trim()
    )
      throw new BadRequestException('Subject and message are required');
    return this.prisma.depositionMessage.create({
      data: {
        depositionId: id,
        authorId: request.authUser.id,
        subject: body.subject.trim(),
        body: body.body.trim(),
      },
      include: { author },
    });
  }
}
