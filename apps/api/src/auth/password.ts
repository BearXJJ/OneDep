import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const OPTIONS = { N: 1 << 14, r: 8, p: 5, maxmem: 32 * 1024 * 1024 };
const PREFIX = 'scrypt-v1';
const DUMMY_SALT = Buffer.alloc(16);
const DUMMY_HASH = Buffer.alloc(64);

// 在线程池中派生密码哈希，避免阻塞事件循环。
function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, OPTIONS, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await derive(password, salt);
  return `${PREFIX}$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const [prefix, saltHex, hashHex] = stored.split('$');
  const valid =
    prefix === PREFIX &&
    /^[a-f0-9]{32}$/.test(saltHex ?? '') &&
    /^[a-f0-9]{128}$/.test(hashHex ?? '');
  const salt = valid ? Buffer.from(saltHex, 'hex') : DUMMY_SALT;
  const expected = valid ? Buffer.from(hashHex, 'hex') : DUMMY_HASH;
  const actual = await derive(password, salt);
  return valid && timingSafeEqual(actual, expected);
}
