import { describe, expect, it } from 'vitest';
import { validateRuntimeConfig } from './runtime-config.js';
const configured = () => ({
  LLM_ENDPOINT: 'https://example.test/v1/chat/completions',
  LLM_MODEL: 'test',
  LLM_API_KEY: 'test-key',
  LLM_MAX_OUTPUT_TOKENS: '1200',
  LLM_TIMEOUT_MS: '60000',
  COPILOT_IDLE_MS: '8000',
  COPILOT_HINT_IDLE_MS: '5000',
  COPILOT_DEBOUNCE_MS: '1500',
  COPILOT_MIN_INTERVAL_MS: '60000',
  COPILOT_CACHE_TTL_SECONDS: '900',
  COPILOT_DAILY_REQUEST_LIMIT: '40',
  COPILOT_GLOBAL_DAILY_REQUEST_LIMIT: '200',
  COPILOT_MAX_INPUT_CHARS: '24000',
  COPILOT_AUTO_ENABLED: 'true',
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
