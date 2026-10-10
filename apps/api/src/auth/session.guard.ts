import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthUser, UserRole } from '@onedep/shared';
import type { Request } from 'express';

import { SESSION_COOKIE_NAME } from './auth.constants.js';
import { AuthService } from './auth.service.js';

const ROLES_KEY = 'auth:roles';
const PUBLIC_KEY = 'auth:public';

export type AuthenticatedRequest = Request & { authUser: AuthUser };

export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
export const Public = () => SetMetadata(PUBLIC_KEY, true);

// 从原始请求头读取指定 Cookie，避免依赖额外的 Cookie 中间件。
function readCookie(request: Request, name: string): string | undefined {
  const header = request.headers.cookie;
  if (!header) return undefined;

  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0 || part.slice(0, separator).trim() !== name) continue;

    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return undefined;
    }
  }
  return undefined;
}

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly auth: AuthService,
    private readonly reflector: Reflector,
  ) {}

  // 统一校验会话，并将当前用户交给后续控制器使用。
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = readCookie(request, SESSION_COOKIE_NAME);
    const user = await this.auth.currentUser(token);
    const roles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (roles?.length && !roles.includes(user.role)) {
      throw new ForbiddenException('当前账户没有操作权限');
    }

    request.authUser = user;
    return true;
  }
}
