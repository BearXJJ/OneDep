import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
export interface GemmiConfig {
  python: string;
  timeoutMs: number;
  maxOutputBytes: number;
}
export async function runGemmi(
  request: object,
  config: GemmiConfig,
): Promise<Record<string, unknown>> {
  const output = await new Promise<string>((accept, reject) => {
    const child = spawn(
      resolve(config.python),
      [resolve(process.cwd(), 'adapters/gemmi_adapter.py')],
      {
        windowsHide: true,
        env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    );
    let output = '',
      error = '',
      bytes = 0;
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('Gemmi timed out after ' + config.timeoutMs + ' ms'));
    }, config.timeoutMs);
    child.on('error', (cause) => {
      clearTimeout(timer);
      reject(cause);
    });
    child.stdout.on('data', (data: Buffer) => {
      bytes += data.length;
      if (bytes > config.maxOutputBytes) {
        child.kill();
        reject(new Error('Gemmi output exceeds GEMMI_MAX_OUTPUT_BYTES'));
      }
      output += data.toString();
    });
    child.stderr.on('data', (data: Buffer) => {
      error += data.toString();
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0)
        reject(new Error('Gemmi exit ' + code + ': ' + error.trim()));
      else accept(output);
    });
    child.stdin.on('error', reject);
    child.stdin.end(JSON.stringify(request));
  });
  return JSON.parse(output) as Record<string, unknown>;
}
