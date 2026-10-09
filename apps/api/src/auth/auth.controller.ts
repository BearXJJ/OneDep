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
  Res,
  Cookies,
} from '@nestjs/common';
import type { Response } from 'express';

import { AuthService, SESSION_SECONDS } from './auth.service.js';

const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const COOKIE_NAME = IS_PRODUCTION ? '__Host-onedep_session' : 'onedep_session';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  async register(
    @Body() body: unknown,
    @Cookies(COOKIE_NAME) previousToken: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    const user = await this.auth.register(body);
    const token = await this.auth.createSession(user.id, previousToken);
    this.setSessionCookie(response, token);
    return user;
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() body: unknown,
    @Cookies(COOKIE_NAME) previousToken: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    const user = await this.auth.login(body);
    const token = await this.auth.createSession(user.id, previousToken);
    this.setSessionCookie(response, token);
    return user;
  }

  @Get('me')
  me(
    @Cookies(COOKIE_NAME) token: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader('Cache-Control', 'no-store');
    return this.auth.currentUser(token);
  }

  @Get('users')
  users(
    @Cookies(COOKIE_NAME) token: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader('Cache-Control', 'no-store');
    return this.auth.listUsers(token);
  }

  @Post('users')
  createUser(
    @Body() body: unknown,
    @Cookies(COOKIE_NAME) token: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader('Cache-Control', 'no-store');
    return this.auth.createUser(token, body);
  }

  @Patch('users/:id')
  updateUser(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: unknown,
    @Cookies(COOKIE_NAME) token: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader('Cache-Control', 'no-store');
    return this.auth.updateUser(token, id, body);
  }

  @Delete('users/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeUser(
    @Param('id', ParseIntPipe) id: number,
    @Cookies(COOKIE_NAME) token: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader('Cache-Control', 'no-store');
    return this.auth.removeUser(token, id);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Cookies(COOKIE_NAME) token: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.auth.deleteSession(token);
    response.clearCookie(COOKIE_NAME, { path: '/' });
    response.setHeader('Cache-Control', 'no-store');
  }

  private setSessionCookie(response: Response, token: string): void {
    response.cookie(COOKIE_NAME, token, {
      httpOnly: true,
      secure: IS_PRODUCTION,
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_SECONDS * 1000,
    });
    response.setHeader('Cache-Control', 'no-store');
  }
}
