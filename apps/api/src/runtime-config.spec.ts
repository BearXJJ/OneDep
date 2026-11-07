import { describe, expect, it } from 'vitest';
import { validateRuntimeConfig } from './runtime-config.js';
const configured = () => ({
  NODE_ENV: 'test',
  PORT: '13000',
  DATABASE_URL: 'postgresql://test:test@127.0.0.1:15432/test',
  REDIS_HOST: '127.0.0.1',
  REDIS_PORT: '16379',
  UPLOAD_DIR: 'uploads',
  ONEDEP_PYTHON: 'python.exe',
  GEMMI_TIMEOUT_MS: '90000',
  GEMMI_MAX_OUTPUT_BYTES: '4194304',
});
describe('required runtime configuration', () => {
  it('rejects every omitted or blank required setting', () => {
    for (const key of Object.keys(configured())) {
      const input: Record<string, unknown> = configured();
      delete input[key];
      expect(() => validateRuntimeConfig(input)).toThrow(key);
      input[key] = '  ';
      expect(() => validateRuntimeConfig(input)).toThrow(key);
    }
  });
  it('rejects invalid ports and process limits', () => {
    for (const [key, value] of [
      ['PORT', '0'],
      ['REDIS_PORT', '70000'],
      ['GEMMI_TIMEOUT_MS', 'abc'],
      ['GEMMI_MAX_OUTPUT_BYTES', '-1'],
    ]) {
      expect(() =>
        validateRuntimeConfig({ ...configured(), [key!]: value }),
      ).toThrow(key!);
    }
  });
});
