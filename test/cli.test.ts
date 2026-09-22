import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { test, describe } from 'node:test';

const execFileAsync = promisify(execFile);

/** 指向编译后的 dist/src/cli.js —— 这个用例跑不通，说明构建产物本身有问题。 */
const CLI = path.join(__dirname, '..', 'src', 'cli.js');

async function runCli(args: string[]): Promise<{ code: number; stdout: string }> {
  try {
    const { stdout } = await execFileAsync(process.execPath, [CLI, ...args]);
    return { code: 0, stdout };
  } catch (err) {
    const e = err as NodeJS.ErrnoException & { code?: number; stdout?: string };
    return { code: typeof e.code === 'number' ? e.code : 1, stdout: e.stdout ?? '' };
  }
}

describe('CLI 冒烟', () => {
  test('无参数时打印用法且退出码为 0', async () => {
    const { code, stdout } = await runCli([]);
    assert.equal(code, 0);
    assert.match(stdout, /用法/);
  });

  test('对参数求和并格式化输出', async () => {
    const { code, stdout } = await runCli(['1', '2', '3']);
    assert.equal(code, 0);
    assert.match(stdout, /个数\s*:\s*3/);
    assert.ok(stdout.includes('6.00'), `期望合计含 6.00，实际输出: ${stdout}`);
  });
});
