import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from './../src/database/prisma.service.js';
import { RedisService } from './../src/redis/redis.service.js';

describe('API (e2e)', () => {
  let app: INestApplication<App>;
  let createdMessageId: number | undefined;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  it('/api (GET)', () => {
    return request(app.getHttpServer())
      .get('/api')
      .expect(200)
      .expect('Hello World!');
  });

  it('/api/health (GET)', () => {
    return request(app.getHttpServer())
      .get('/api/health')
      .expect(200)
      .expect({ status: 'ok', database: 'ok', redis: 'PONG' });
  });

  it('stores messages in PostgreSQL and caches the list in Redis', async () => {
    const content = `e2e-${Date.now()}`;
    const created = await request(app.getHttpServer())
      .post('/api/messages')
      .send({ content })
      .expect(201);
    createdMessageId = (created.body as { id: number }).id;

    const first = await request(app.getHttpServer())
      .get('/api/messages')
      .expect(200);
    expect(first.body).toMatchObject({ source: 'postgres' });
    expect(first.body.messages).toEqual(
      expect.arrayContaining([expect.objectContaining({ content })]),
    );

    const second = await request(app.getHttpServer())
      .get('/api/messages')
      .expect(200);
    expect(second.body).toMatchObject({ source: 'redis' });
  });

  it('rejects empty messages', () => {
    return request(app.getHttpServer())
      .post('/api/messages')
      .send({ content: '  ' })
      .expect(400);
  });

  afterAll(async () => {
    if (createdMessageId !== undefined) {
      await app.get(PrismaService).message.delete({
        where: { id: createdMessageId },
      });
      await app.get(RedisService).client.del('messages:latest');
    }
    await app.close();
  });
});
