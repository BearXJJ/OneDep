import { INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';

import { PrismaService } from '../database/prisma.service.js';
import { RedisService } from '../redis/redis.service.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { hashPassword } from './password.js';
import { SessionGuard } from './session.guard.js';

describe('authentication HTTP flow', () => {
  let app: INestApplication<App>;
  const users: Array<{
    id: number;
    email: string;
    name: string;
    passwordHash: string;
    role: 'SUBMITTER' | 'REVIEWER' | 'ADMIN';
  }> = [];
  const entries = new Map<string, string>();

  beforeAll(async () => {
    const prisma = {
      user: {
        create: async ({
          data,
        }: {
          data: Omit<(typeof users)[number], 'id'>;
        }) => {
          if (users.some((user) => user.email === data.email)) {
            throw Object.assign(new Error('duplicate'), { code: 'P2002' });
          }
          const user = { ...data, id: users.length + 1 };
          users.push(user);
          return user;
        },
        findUnique: async ({
          where,
        }: {
          where: { email?: string; id?: number };
        }) =>
          users.find(
            (user) => user.email === where.email || user.id === where.id,
          ) ?? null,
        findMany: async () =>
          users.map(({ id, email, name, role }) => ({
            id,
            email,
            name,
            role,
            createdAt: new Date('2026-10-09T00:00:00.000Z'),
          })),
        update: async ({
          where,
          data,
        }: {
          where: { id: number; role: (typeof users)[number]['role'] };
          data: { role: (typeof users)[number]['role'] };
        }) => {
          const user = users.find(
            (entry) => entry.id === where.id && entry.role === where.role,
          );
          if (!user)
            throw Object.assign(new Error('not found'), { code: 'P2025' });
          user.role = data.role;
          return { ...user, createdAt: new Date('2026-10-09T00:00:00.000Z') };
        },
        delete: async ({
          where,
        }: {
          where: { id: number; role: (typeof users)[number]['role'] };
        }) => {
          const index = users.findIndex(
            (entry) => entry.id === where.id && entry.role === where.role,
          );
          if (index < 0)
            throw Object.assign(new Error('not found'), { code: 'P2025' });
          return users.splice(index, 1)[0];
        },
      },
    };
    const redis = {
      client: {
        get: async (key: string) => entries.get(key) ?? null,
        set: async (key: string, value: string) => {
          entries.set(key, value);
          return 'OK';
        },
        del: async (key: string) => Number(entries.delete(key)),
        incr: async (key: string) => {
          const next = Number(entries.get(key) ?? 0) + 1;
          entries.set(key, String(next));
          return next;
        },
        expire: async () => 1,
      },
    };

    const module = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        AuthService,
        SessionGuard,
        { provide: APP_GUARD, useExisting: SessionGuard },
        { provide: PrismaService, useValue: prisma },
        { provide: RedisService, useValue: redis },
      ],
    }).compile();

    app = module.createNestApplication();
    app.enableCsrfProtection();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects administrator self-registration, including direct API calls', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        name: 'Admin',
        email: 'admin@example.com',
        password: 'correct horse battery',
        role: 'ADMIN',
      })
      .expect(400);
    expect(users).toHaveLength(0);
  });

  it('registers, restores, signs out, and signs in a submitter', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        name: 'Short',
        email: 'short@example.com',
        password: '1234567',
        role: 'SUBMITTER',
      })
      .expect(400);

    const registered = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        name: 'Alice',
        email: 'Alice@Example.com',
        password: 'passw0rd',
        role: 'SUBMITTER',
      })
      .expect(201);

    expect(registered.body).toMatchObject({
      email: 'alice@example.com',
      role: 'SUBMITTER',
    });
    expect(registered.body).not.toHaveProperty('passwordHash');
    expect(users[0]?.passwordHash).not.toContain('passw0rd');
    const setCookie = (registered.headers['set-cookie'] as string[])[0];
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Lax');
    const cookie = setCookie?.split(';')[0];
    expect(cookie).toBeTruthy();

    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', cookie!)
      .expect(200);
    await request(app.getHttpServer()).post('/api/auth/logout').expect(401);
    await request(app.getHttpServer())
      .post('/api/auth/logout')
      .set('Cookie', cookie!)
      .expect(204);
    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', cookie!)
      .expect(401);

    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'alice@example.com', password: 'wrong password' })
      .expect(401);
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'alice@example.com', password: 'passw0rd' })
      .expect(200);
    expect(login.body.role).toBe('SUBMITTER');
  });

  it('allows reviewer registration and rejects cross-site writes', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        name: 'Bob',
        email: 'bob@example.com',
        password: 'another secure password',
        role: 'REVIEWER',
      })
      .expect(201);
    expect(users[1]?.role).toBe('REVIEWER');

    await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('Sec-Fetch-Site', 'cross-site')
      .send({ email: 'bob@example.com', password: 'another secure password' })
      .expect(403);
  });

  it('lets a provisioned administrator sign in', async () => {
    users.push({
      id: users.length + 1,
      email: 'operator@example.com',
      name: 'Operator',
      passwordHash: await hashPassword('operator secure password'),
      role: 'ADMIN',
    });

    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        email: 'operator@example.com',
        password: 'operator secure password',
      })
      .expect(200);
    expect(response.body.role).toBe('ADMIN');

    await request(app.getHttpServer()).get('/api/auth/users').expect(401);

    const submitter = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'alice@example.com', password: 'passw0rd' })
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/auth/users')
      .set('Cookie', (submitter.headers['set-cookie'] as string[])[0]!)
      .expect(403);

    const usersResponse = await request(app.getHttpServer())
      .get('/api/auth/users')
      .set('Cookie', (response.headers['set-cookie'] as string[])[0]!)
      .expect(200);
    expect(usersResponse.body).toHaveLength(3);
    expect(usersResponse.body).toContainEqual(
      expect.objectContaining({ email: 'operator@example.com', role: 'ADMIN' }),
    );
    expect(usersResponse.body[0]).not.toHaveProperty('passwordHash');
    expect(usersResponse.headers['cache-control']).toBe('no-store');
  });

  it('lets only administrators add, change roles, and delete public accounts', async () => {
    const adminLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        email: 'operator@example.com',
        password: 'operator secure password',
      })
      .expect(200);
    const adminCookie = (adminLogin.headers['set-cookie'] as string[])[0]!;
    const submitterLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'alice@example.com', password: 'passw0rd' })
      .expect(200);
    const submitterCookie = (
      submitterLogin.headers['set-cookie'] as string[]
    )[0]!;
    const newUser = {
      name: 'Chen',
      email: 'chen@example.com',
      password: 'new secure password',
      role: 'SUBMITTER',
    };

    await request(app.getHttpServer())
      .post('/api/auth/users')
      .send(newUser)
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/auth/users')
      .set('Cookie', submitterCookie)
      .send(newUser)
      .expect(403);
    await request(app.getHttpServer())
      .post('/api/auth/users')
      .set('Cookie', adminCookie)
      .send({ ...newUser, role: 'ADMIN' })
      .expect(400);

    const created = await request(app.getHttpServer())
      .post('/api/auth/users')
      .set('Cookie', adminCookie)
      .send(newUser)
      .expect(201);
    expect(created.body).toMatchObject({
      email: 'chen@example.com',
      role: 'SUBMITTER',
    });
    expect(created.body).not.toHaveProperty('passwordHash');

    await request(app.getHttpServer())
      .patch('/api/auth/users/1')
      .set('Cookie', submitterCookie)
      .send({ role: 'REVIEWER' })
      .expect(403);
    await request(app.getHttpServer())
      .patch('/api/auth/users/1')
      .set('Cookie', adminCookie)
      .send({ name: 'Changed', role: 'REVIEWER' })
      .expect(400);
    await request(app.getHttpServer())
      .patch('/api/auth/users/1')
      .set('Cookie', adminCookie)
      .send({ role: 'REVIEWER', password: 'changed password' })
      .expect(400);
    await request(app.getHttpServer())
      .patch('/api/auth/users/1')
      .set('Cookie', adminCookie)
      .send({ role: 'ADMIN' })
      .expect(400);
    await request(app.getHttpServer())
      .patch('/api/auth/users/3')
      .set('Cookie', adminCookie)
      .send({ role: 'REVIEWER' })
      .expect(403);

    const updated = await request(app.getHttpServer())
      .patch('/api/auth/users/1')
      .set('Cookie', adminCookie)
      .send({ role: 'REVIEWER' })
      .expect(200);
    expect(updated.body).toMatchObject({ name: 'Alice', role: 'REVIEWER' });
    expect(updated.body).not.toHaveProperty('passwordHash');

    const createdLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'chen@example.com', password: 'new secure password' })
      .expect(200);
    const createdCookie = (createdLogin.headers['set-cookie'] as string[])[0]!;
    await request(app.getHttpServer())
      .delete(`/api/auth/users/${created.body.id}`)
      .set('Cookie', createdCookie)
      .expect(403);
    await request(app.getHttpServer())
      .delete('/api/auth/users/3')
      .set('Cookie', adminCookie)
      .expect(403);
    await request(app.getHttpServer())
      .delete(`/api/auth/users/${created.body.id}`)
      .set('Cookie', adminCookie)
      .expect(204);
    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', createdCookie)
      .expect(401);
  });
});
