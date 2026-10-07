import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../database/prisma.service.js';
import { RedisService } from '../redis/redis.service.js';
import { HealthService } from './health.service.js';

describe('HealthService', () => {
  let service: HealthService;
  const queryRaw = vi.fn();
  const ping = vi.fn();

  beforeEach(async () => {
    queryRaw.mockReset().mockResolvedValue([{ '?column?': 1 }]);
    ping.mockReset().mockResolvedValue('PONG');

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HealthService,
        { provide: PrismaService, useValue: { $queryRaw: queryRaw } },
        { provide: RedisService, useValue: { client: { ping } } },
      ],
    }).compile();

    service = module.get<HealthService>(HealthService);
  });

  it('reports both dependencies when they respond', async () => {
    await expect(service.check()).resolves.toEqual({
      status: 'ok',
      database: 'ok',
      redis: 'PONG',
    });
    expect(queryRaw).toHaveBeenCalledOnce();
    expect(ping).toHaveBeenCalledOnce();
  });

  it('fails when the database is unavailable', async () => {
    queryRaw.mockRejectedValueOnce(new Error('database unavailable'));

    await expect(service.check()).rejects.toThrow('database unavailable');
    expect(ping).not.toHaveBeenCalled();
  });
});
