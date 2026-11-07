import {
  ArgumentsHost,
  Catch,
  HttpException,
  Injectable,
  type ExceptionFilter,
} from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import type { Response } from 'express';

@Catch()
@Injectable()
export class HttpErrorFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    if (error instanceof HttpException) {
      response.status(error.getStatus()).json(error.getResponse());
      return;
    }
    const code =
      typeof error === 'object' && error !== null && 'code' in error
        ? error.code
        : undefined;
    if (code === 'P2002') {
      response.status(409).json({ message: '该邮箱已经注册' });
      return;
    }
    if (code === 'P2025') {
      response.status(409).json({ message: '记录不存在或已变化' });
      return;
    }
    const status =
      error instanceof Error &&
      (error.name === 'ZodError' || error instanceof URIError)
        ? 400
        : 500;
    console.error(error);
    response
      .status(status)
      .json({
        message: error instanceof Error ? error.message : String(error),
      });
  }
}
export const httpErrorProvider = {
  provide: APP_FILTER,
  useClass: HttpErrorFilter,
};
