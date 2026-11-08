export function validateRuntimeConfig(env: Record<string, unknown>) {
  for (const key of [
    'LLM_ENDPOINT',
    'LLM_MODEL',
    'LLM_API_KEY',
    'LLM_MAX_OUTPUT_TOKENS',
    'LLM_TIMEOUT_MS',
    'NODE_ENV',
    'PORT',
    'DATABASE_URL',
    'REDIS_HOST',
    'REDIS_PORT',
    'UPLOAD_DIR',
    'ONEDEP_PYTHON',
    'GEMMI_TIMEOUT_MS',
    'GEMMI_MAX_OUTPUT_BYTES',
  ]) {
    if (typeof env[key] !== 'string' || !env[key].trim())
      throw new Error('Missing configuration: ' + key);
  }
  if (!['development', 'test', 'production'].includes(String(env.NODE_ENV)))
    throw new Error('Invalid NODE_ENV');
  for (const key of [
    'LLM_MAX_OUTPUT_TOKENS',
    'LLM_TIMEOUT_MS',
    'PORT',
    'REDIS_PORT',
    'GEMMI_TIMEOUT_MS',
    'GEMMI_MAX_OUTPUT_BYTES',
  ]) {
    const value = Number(env[key]);
    if (!Number.isSafeInteger(value) || value <= 0)
      throw new Error('Invalid configuration: ' + key);
    if ((key === 'PORT' || key === 'REDIS_PORT') && value > 65535)
      throw new Error('Invalid port: ' + key);
    env[key] = value;
  }
  const endpoint = new URL(String(env.LLM_ENDPOINT));
  if (
    !['https:', 'http:'].includes(endpoint.protocol) ||
    !endpoint.pathname.endsWith('/responses') ||
    endpoint.username ||
    endpoint.password
  )
    throw new Error('LLM_ENDPOINT must be the full Responses API URL');
  return env;
}
