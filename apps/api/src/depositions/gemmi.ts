import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
export function runGemmi(request: object): Promise<Record<string, unknown>> {
  return new Promise((accept, reject) => {
    const child = spawn(
      process.env.ONEDEP_PYTHON ??
        resolve(process.cwd(), '../../.local/python/Scripts/python.exe'),
      [resolve(process.cwd(), 'adapters/gemmi_adapter.py')],
      {
        windowsHide: true,
        env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    );
    let output = '',
      error = '';
    let settled = false;
    const finish = (cause?: Error, result?: Record<string, unknown>) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (cause) reject(cause);
      else accept(result!);
    };
    const timer = setTimeout(() => {
      child.kill();
      finish(new Error('Gemmi 超过 90 秒，任务已停止。'));
    }, 90000);
    child.on('error', (e) => finish(new Error(`Gemmi 无法启动：${e.message}`)));
    child.stdout.on('data', (data: Buffer) => {
      output += data.toString();
      if (output.length > 4 * 1024 * 1024) {
        child.kill();
        finish(new Error('Gemmi 返回超出大小限制。'));
      }
    });
    child.stderr.on('data', (data: Buffer) => {
      error += data.toString();
    });
    child.on('close', (code) => {
      if (code !== 0) {
        finish(new Error(`Gemmi 退出码 ${code}: ${error.trim()}`));
        return;
      }
      try {
        finish(undefined, JSON.parse(output) as Record<string, unknown>);
      } catch {
        finish(new Error('Gemmi 返回了无效 JSON。'));
      }
    });
    child.stdin.on('error', (e) =>
      finish(new Error(`Gemmi 输入失败：${e.message}`)),
    );
    child.stdin.end(JSON.stringify(request));
  });
}
