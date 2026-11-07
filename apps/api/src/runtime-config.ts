export function validateRuntimeConfig(env: Record<string, unknown>) {
  for (const key of [
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
  return env;
}
