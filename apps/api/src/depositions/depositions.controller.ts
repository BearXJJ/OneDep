import type { Response } from 'express';
import { CopilotService } from './copilot.service.js';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
  Res,
  Query,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';

import { type AuthenticatedRequest, Roles } from '../auth/session.guard.js';
import {
  DepositionsService,
  type UploadedFileData,
} from './depositions.service.js';

@Roles('SUBMITTER')
@Controller('depositions')
export class DepositionsController {
  constructor(
    private readonly depositions: DepositionsService,
    private readonly copilot: CopilotService,
  ) {}
  @Get(':id/copilot/config')
  async copilotConfig(
    @Param('id', ParseIntPipe) id: number,
    @Req() request: AuthenticatedRequest,
  ) {
    await this.depositions.get(id, request.authUser);
    return this.copilot.settings();
  }
  @Post(':id/copilot')
  async advise(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.depositions.get(id, request.authUser);
    const controller = new AbortController();
    const disconnect = () => controller.abort();
    response.once('close', disconnect);
    try {
      return await this.copilot.advise(
        body,
        controller.signal,
        request.authUser.id,
        id,
      );
    } finally {
      response.off('close', disconnect);
    }
  }

  @Get()
  list(@Req() request: AuthenticatedRequest) {
    return this.depositions.list(request.authUser);
  }

  @Post()
  create(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    return this.depositions.create(request.authUser, body);
  }

  @Get(':id')
  get(
    @Param('id', ParseIntPipe) id: number,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.depositions.get(id, request.authUser);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.depositions.update(id, request.authUser, body);
  }

  @Post(':id/files/:kind/:slot')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { files: 1, fileSize: 100 * 1024 * 1024 },
    }),
  )
  uploadFile(
    @Param('id', ParseIntPipe) id: number,
    @Param('kind') kind: string,
    @Param('slot', ParseIntPipe) slot: number,
    @Query('revision', ParseIntPipe) revision: number,
    @UploadedFile() file: UploadedFileData | undefined,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.depositions.uploadFile(
      id,
      request.authUser,
      kind,
      slot,
      revision,
      file,
    );
  }

  @Get(':id/files/:fileId')
  async downloadFile(
    @Param('id', ParseIntPipe) id: number,
    @Param('fileId', ParseIntPipe) fileId: number,
    @Req() request: AuthenticatedRequest,
  ) {
    const result = await this.depositions.downloadFile(
      id,
      fileId,
      request.authUser,
    );
    return new StreamableFile(result.content, {
      type: result.file.mimeType,
      disposition: `attachment; filename*=UTF-8''${encodeURIComponent(result.file.originalName)}`,
      length: result.file.size,
    });
  }

  @Post(':id/reparse/:fileId')
  reparse(
    @Param('id', ParseIntPipe) id: number,
    @Param('fileId', ParseIntPipe) fileId: number,
    @Body('revision') revision: number,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.depositions.reparse(id, fileId, request.authUser, revision);
  }

  @Post(':id/check')
  check(
    @Param('id', ParseIntPipe) id: number,
    @Body('revision') revision: number,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.depositions.check(id, request.authUser, revision);
  }

  @Get(':id/export')
  async export(
    @Param('id', ParseIntPipe) id: number,
    @Req() request: AuthenticatedRequest,
  ) {
    const result = await this.depositions.export(id, request.authUser);
    return new StreamableFile(result.content, {
      type: 'application/zip',
      disposition: `attachment; filename="${result.name}"`,
    });
  }

  @Delete(':id/files/:fileId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeFile(
    @Query('revision', ParseIntPipe) revision: number,
    @Param('id', ParseIntPipe) id: number,
    @Param('fileId', ParseIntPipe) fileId: number,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.depositions.removeFile(id, fileId, request.authUser, revision);
  }

  @Post(':id/submit')
  submit(
    @Body('revision') revision: number,
    @Param('id', ParseIntPipe) id: number,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.depositions.submit(id, request.authUser, revision);
  }
}
