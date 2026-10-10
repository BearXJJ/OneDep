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
  constructor(private readonly depositions: DepositionsService) {}

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

  @Post(':id/files/:kind')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { files: 1, fileSize: 100 * 1024 * 1024 },
    }),
  )
  uploadFile(
    @Param('id', ParseIntPipe) id: number,
    @Param('kind') kind: string,
    @UploadedFile() file: UploadedFileData | undefined,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.depositions.uploadFile(id, request.authUser, kind, file);
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

  @Delete(':id/files/:fileId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeFile(
    @Param('id', ParseIntPipe) id: number,
    @Param('fileId', ParseIntPipe) fileId: number,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.depositions.removeFile(id, fileId, request.authUser);
  }

  @Post(':id/submit')
  submit(
    @Param('id', ParseIntPipe) id: number,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.depositions.submit(id, request.authUser);
  }
}
