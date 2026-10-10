import { createHash, randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type { AdminUser, AuthUser, UserRole } from '@onedep/shared';

import { PrismaService } from '../database/prisma.service.js';
import { RedisService } from '../redis/redis.service.js';
import { hashPassword, verifyPassword } from './password.js';

export const SESSION_SECONDS = 7 * 24 * 60 * 60;
const LOGIN_WINDOW_SECONDS = 15 * 60;
const MAX_FAILED_LOGINS = 10;

function sessionKey(token: string): string {
  return `auth:session:${createHash('sha256').update(token).digest('hex')}`;
}

function publicUser(user: {
  id: number;
  email: string;
  name: string | null;
  orcid?: string | null;
  institution?: string | null;
  country?: string | null;
  role: UserRole;
}): AuthUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name ?? user.email,
    orcid: user.orcid ?? '',
    institution: user.institution ?? '',
    country: user.country ?? '',
    role: user.role,
  };
}

function adminUser(user: {
  id: number;
  email: string;
  name: string | null;
  orcid?: string | null;
  institution?: string | null;
  country?: string | null;
  role: UserRole;
  createdAt: Date;
}): AdminUser {
  return {
    ...publicUser(user),
    createdAt: user.createdAt.toISOString(),
  };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  // 只允许注册公开角色，客户端不能自行获得管理员权限。
  async register(input: unknown): Promise<AuthUser> {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw new BadRequestException('请填写注册信息');
    }

    const { name, email, password, role } = input as Record<string, unknown>;
    const cleanName = parseName(name);
    const cleanEmail = parseEmail(email);
    if (
      typeof password !== 'string' ||
      password.length < 8 ||
      password.length > 128
    ) {
      throw new BadRequestException('密码需要 8–128 个字符');
    }
    if (role !== 'SUBMITTER' && role !== 'REVIEWER') {
      throw new BadRequestException('只能注册提交员或审校员');
    }

    try {
      const user = await this.prisma.user.create({
        data: {
          name: cleanName,
          email: cleanEmail,
          passwordHash: await hashPassword(password),
          role,
        },
      });
      return publicUser(user);
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        throw new ConflictException('该邮箱已经注册');
      }
      throw error;
    }
  }

  // 校验登录凭据，并限制同一账号的连续失败次数。
  async login(input: unknown): Promise<AuthUser> {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw new BadRequestException('请填写邮箱和密码');
    }

    const { email, password } = input as Record<string, unknown>;
    if (typeof email !== 'string' || typeof password !== 'string') {
      throw new BadRequestException('请填写邮箱和密码');
    }

    const cleanEmail = email.trim().toLowerCase();
    if (
      !cleanEmail ||
      cleanEmail.length > 254 ||
      !password ||
      password.length > 128
    ) {
      throw new UnauthorizedException('邮箱或密码错误');
    }

    const failureKey = `auth:failed:${createHash('sha256').update(cleanEmail).digest('hex')}`;
    if (Number(await this.redis.client.get(failureKey)) >= MAX_FAILED_LOGINS) {
      throw new HttpException(
        '尝试次数过多，请 15 分钟后再试',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { email: cleanEmail },
    });
    if (!(await verifyPassword(password, user?.passwordHash ?? ''))) {
      const count = await this.redis.client.incr(failureKey);
      if (count === 1)
        await this.redis.client.expire(failureKey, LOGIN_WINDOW_SECONDS);
      throw new UnauthorizedException('邮箱或密码错误');
    }

    await this.redis.client.del(failureKey);
    return publicUser(user!);
  }

  // 在 Redis 中用随机令牌替换浏览器的旧会话。
  async createSession(userId: number, previousToken?: string): Promise<string> {
    if (previousToken) await this.redis.client.del(sessionKey(previousToken));
    const token = randomBytes(32).toString('base64url');
    await this.redis.client.set(
      sessionKey(token),
      String(userId),
      'EX',
      SESSION_SECONDS,
    );
    return token;
  }

  // 每次访问受保护接口时，都通过有效会话查询当前用户。
  async currentUser(token?: string): Promise<AuthUser> {
    if (!token) throw new UnauthorizedException();

    const userId = Number(await this.redis.client.get(sessionKey(token)));
    if (!Number.isSafeInteger(userId) || userId < 1) {
      throw new UnauthorizedException();
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    return publicUser(user);
  }

  // 当前用户只能修改自己的公开资料，账号角色仍由管理员管理。
  async updateProfile(userId: number, input: unknown): Promise<AuthUser> {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw new BadRequestException('请填写个人信息');
    }
    const fields = input as Record<string, unknown>;
    const editableFields = ['name', 'email', 'orcid', 'institution', 'country'];
    if (Object.keys(fields).some((field) => !editableFields.includes(field))) {
      throw new BadRequestException('包含不可修改的个人信息');
    }

    try {
      const user = await this.prisma.user.update({
        where: { id: userId },
        data: {
          name: parseName(fields.name),
          email: parseEmail(fields.email),
          orcid: parseOrcid(fields.orcid),
          institution: parseOptionalText(fields.institution, '机构', 200),
          country: parseOptionalText(fields.country, '国家或地区', 100),
        },
      });
      return publicUser(user);
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        throw new ConflictException('该邮箱已经注册');
      }
      if ((error as { code?: string }).code === 'P2025') {
        throw new NotFoundException('用户不存在');
      }
      throw error;
    }
  }

  // 修改密码前再次验证当前密码，避免登录会话被他人直接用于换密。
  async updatePassword(userId: number, input: unknown): Promise<void> {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw new BadRequestException('请填写当前密码和新密码');
    }

    const fields = input as Record<string, unknown>;
    if (
      Object.keys(fields).some(
        (field) => field !== 'currentPassword' && field !== 'newPassword',
      )
    ) {
      throw new BadRequestException('密码修改参数无效');
    }
    const { currentPassword, newPassword } = fields;
    if (typeof currentPassword !== 'string' || !currentPassword) {
      throw new BadRequestException('请输入当前密码');
    }
    if (
      typeof newPassword !== 'string' ||
      newPassword.length < 8 ||
      newPassword.length > 128
    ) {
      throw new BadRequestException('新密码需要 8–128 个字符');
    }
    if (currentPassword === newPassword) {
      throw new BadRequestException('新密码不能与当前密码相同');
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('用户不存在');
    if (!(await verifyPassword(currentPassword, user.passwordHash))) {
      throw new UnauthorizedException('当前密码不正确');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await hashPassword(newPassword) },
    });
  }

  // 返回用户资料并明确排除密码哈希，访问权限由 Guard 统一控制。
  async listUsers(): Promise<AdminUser[]> {
    const users = await this.prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        orcid: true,
        institution: true,
        country: true,
        role: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    return users.map(adminUser);
  }

  // 沿用公开注册规则新增账户，不替新用户建立登录会话。
  async createUser(input: unknown): Promise<AuthUser> {
    return this.register(input);
  }

  // 管理员只能在提交员和审校员之间切换角色。
  async updateUser(userId: number, input: unknown): Promise<AdminUser> {
    if (!Number.isSafeInteger(userId) || userId < 1) {
      throw new BadRequestException('用户编号无效');
    }
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw new BadRequestException('请填写用户信息');
    }

    const fields = input as Record<string, unknown>;
    if (Object.keys(fields).some((field) => field !== 'role')) {
      throw new BadRequestException('只能修改角色');
    }
    const role = fields.role;
    if (role !== 'SUBMITTER' && role !== 'REVIEWER') {
      throw new BadRequestException('只能设为提交员或审校员');
    }

    const target = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    if (!target) throw new NotFoundException('用户不存在');
    if (target.role === 'ADMIN') {
      throw new ForbiddenException('管理员身份不能在此修改');
    }

    try {
      const user = await this.prisma.user.update({
        where: { id: userId, role: target.role },
        data: { role },
        select: {
          id: true,
          email: true,
          name: true,
          orcid: true,
          institution: true,
          country: true,
          role: true,
          createdAt: true,
        },
      });
      return adminUser(user);
    } catch (error) {
      if ((error as { code?: string }).code === 'P2025') {
        throw new ConflictException('用户信息已变化，请刷新后重试');
      }
      throw error;
    }
  }

  // 删除普通账户后，其旧会话会因找不到用户而失效。
  async removeUser(userId: number): Promise<void> {
    if (!Number.isSafeInteger(userId) || userId < 1) {
      throw new BadRequestException('用户编号无效');
    }

    const target = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    if (!target) throw new NotFoundException('用户不存在');
    if (target.role === 'ADMIN') {
      throw new ForbiddenException('管理员账户不能在此删除');
    }

    try {
      await this.prisma.user.delete({
        where: { id: userId, role: target.role },
      });
    } catch (error) {
      if ((error as { code?: string }).code === 'P2025') {
        throw new ConflictException('用户信息已变化，请刷新后重试');
      }
      throw error;
    }
  }

  async deleteSession(token?: string): Promise<void> {
    if (token) await this.redis.client.del(sessionKey(token));
  }
}

function parseName(value: unknown): string {
  const name = typeof value === 'string' ? value.trim() : '';
  if (name.length < 2 || name.length > 80) {
    throw new BadRequestException('姓名需要 2–80 个字符');
  }
  return name;
}

function parseEmail(value: unknown): string {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new BadRequestException('请输入有效的邮箱');
  }
  return email;
}

function parseOrcid(value: unknown): string | null {
  const orcid = typeof value === 'string' ? value.trim().toUpperCase() : '';
  if (!orcid) return null;
  if (!/^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/.test(orcid)) {
    throw new BadRequestException('请输入有效的 ORCID');
  }
  return orcid;
}

function parseOptionalText(
  value: unknown,
  label: string,
  maxLength: number,
): string | null {
  const text = typeof value === 'string' ? value.trim() : '';
  if (text.length > maxLength) {
    throw new BadRequestException(`${label}不能超过 ${maxLength} 个字符`);
  }
  return text || null;
}
