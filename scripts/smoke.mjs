import { spawn } from 'node:child_process';
import path from 'node:path';
import electronPath from 'electron';

const root = path.resolve(import.meta.dirname, '..');
// 本机（无显卡直通的会话）GPU 进程会连续崩溃（"GPU process isn't usable. Goodbye."），
// 把渲染进程一起带崩，冒烟跑不完。这里显式关掉 GPU 进程，让冒烟在纯软件渲染下完成。
// 只影响本机自动化，用户机运行时不带这些参数。
const args = [
  '.',
  '--smoke',
  '--no-sandbox',
  '--disable-gpu',
  '--disable-gpu-sandbox',
  '--in-process-gpu',
];
const child = spawn(electronPath, args, {
  cwd: root,
  env: { ...process.env, ELECTRON_ENABLE_LOGGING: '1' },
  stdio: 'inherit',
});
child.on('exit', (code) => {
  if (code === 0) console.log('SMOKE PASS');
  process.exit(code ?? 1);
});
