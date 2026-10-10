import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { SessionGuard } from './session.guard.js';

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    SessionGuard,
    { provide: APP_GUARD, useExisting: SessionGuard },
  ],
})
export class AuthModule {}
