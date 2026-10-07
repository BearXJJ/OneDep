import { Injectable } from '@nestjs/common';

import { PrismaService } from '../database/prisma.service.js';
import { RedisService } from '../redis/redis.service.js';

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async check() {
    await this.prisma.$queryRaw`SELECT 1`;
    const redis = await this.redis.client.ping();

    return {
      status: 'ok',
      database: 'ok',
      redis,
    };
  }
}
