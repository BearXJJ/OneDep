import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from './generated/prisma/client.js';
import { hashPassword } from './auth/password.js';

const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD;
const name = process.env.ADMIN_NAME?.trim() || '管理员';
const databaseUrl = process.env.DATABASE_URL;

if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
  throw new Error('Set a valid ADMIN_EMAIL');
}
if (!password || password.length < 8 || password.length > 128) {
  throw new Error('Set ADMIN_PASSWORD to 8–128 characters');
}
if (!databaseUrl) throw new Error('DATABASE_URL is required');

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});

try {
  if (await prisma.user.findUnique({ where: { email } })) {
    throw new Error('This email already belongs to an account');
  }

  await prisma.user.create({
    data: {
      email,
      name,
      passwordHash: await hashPassword(password),
      role: 'ADMIN',
    },
  });
  console.log(`Administrator created: ${email}`);
} finally {
  await prisma.$disconnect();
}
