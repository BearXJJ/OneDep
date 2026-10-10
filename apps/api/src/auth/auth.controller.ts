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
  Cookies,
} from '@nestjs/common';
import type { Response } from 'express';

import { IS_PRODUCTION, SESSION_COOKIE_NAME } from './auth.constants.js';
import { AuthService, SESSION_SECONDS } from './auth.service.js';
import { type AuthenticatedRequest, Public, Roles } from './session.guard.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('register')
  async register(
    @Body() body: unknown,
    @Cookies(SESSION_COOKIE_NAME) previousToken: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    const user = await this.auth.register(body);
    const token = await this.auth.createSession(user.id, previousToken);
    this.setSessionCookie(response, token);
    return user;
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() body: unknown,
    @Cookies(SESSION_COOKIE_NAME) previousToken: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    const user = await this.auth.login(body);
    const token = await this.auth.createSession(user.id, previousToken);
    this.setSessionCookie(response, token);
    return user;
  }

  @Get('me')
  me(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader('Cache-Control', 'no-store');
    return request.authUser;
  }

  @Roles('ADMIN')
  @Get('users')
  users(@Res({ passthrough: true }) response: Response) {
    response.setHeader('Cache-Control', 'no-store');
    return this.auth.listUsers();
  }

  @Roles('ADMIN')
  @Post('users')
  createUser(
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader('Cache-Control', 'no-store');
    return this.auth.createUser(body);
  }

  @Roles('ADMIN')
  @Patch('users/:id')
  updateUser(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader('Cache-Control', 'no-store');
    return this.auth.updateUser(id, body);
  }

  @Roles('ADMIN')
  @Delete('users/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeUser(
    @Param('id', ParseIntPipe) id: number,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader('Cache-Control', 'no-store');
    return this.auth.removeUser(id);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Cookies(SESSION_COOKIE_NAME) token: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.auth.deleteSession(token);
    response.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
    response.setHeader('Cache-Control', 'no-store');
  }

  private setSessionCookie(response: Response, token: string): void {
    response.cookie(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      secure: IS_PRODUCTION,
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_SECONDS * 1000,
    });
    response.setHeader('Cache-Control', 'no-store');
  }
}
