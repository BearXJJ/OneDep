import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller.js';
import { HealthService } from './health.service.js';

describe('HealthController', () => {
  let controller: HealthController;
  const check = vi.fn();

  beforeEach(async () => {
    check.mockReset().mockResolvedValue({ status: 'ok', database: 'ok', redis: 'PONG' });

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: HealthService, useValue: { check } }],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  it('returns the health service result', async () => {
    await expect(controller.check()).resolves.toEqual({
      status: 'ok',
      database: 'ok',
      redis: 'PONG',
    });
    expect(check).toHaveBeenCalledOnce();
  });
});
