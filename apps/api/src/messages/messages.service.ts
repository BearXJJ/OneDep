import { BadRequestException, Injectable } from '@nestjs/common';
import type { MessageItem, MessageListResponse } from '@onedep/shared';

import { PrismaService } from '../database/prisma.service.js';
import { RedisService } from '../redis/redis.service.js';

const CACHE_KEY = 'messages:latest';

@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async list(): Promise<MessageListResponse> {
    const cached = await this.redis.client.get(CACHE_KEY);
    if (cached !== null) {
      return { messages: JSON.parse(cached) as MessageItem[], source: 'redis' };
    }

    const records = await this.prisma.message.findMany({
      take: 10,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    const messages = records.map((message) => ({
      id: message.id,
      content: message.content,
      createdAt: message.createdAt.toISOString(),
    }));

    await this.redis.client.set(CACHE_KEY, JSON.stringify(messages), 'EX', 60);
    return { messages, source: 'postgres' };
  }

  async create(content: unknown): Promise<MessageItem> {
    if (
      typeof content !== 'string' ||
      !content.trim() ||
      content.trim().length > 200
    ) {
      throw new BadRequestException('留言需要 1–200 个字符');
    }

    const message = await this.prisma.message.create({
      data: { content: content.trim() },
    });
    await this.redis.client.del(CACHE_KEY);

    return {
      id: message.id,
      content: message.content,
      createdAt: message.createdAt.toISOString(),
    };
  }
}
