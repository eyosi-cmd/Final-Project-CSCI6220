import { mkdir, readdir, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');
const srcDir = path.join(root, 'src', 'dashboard');
const outDir = path.join(root, 'dist', 'render');

await mkdir(outDir, { recursive: true });

await build({
  entryPoints: [
    path.join(root, 'src', 'dashboard', 'Dashboard.ts'),
    path.join(root, 'src', 'kernel', 'LoadBalancer.ts'),
    path.join(root, 'src', 'worker', 'WorkerNode.ts')
  ],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node24',
  outdir: outDir,
  logLevel: 'silent'
});

for (const file of await readdir(srcDir)) {
  if (!['dashboard.html', 'dashboard.css', 'dashboard-client.js', 'dashboard-api.js'].includes(file)) continue;
  const target = path.join(outDir, file === 'dashboard.html' ? 'index.html' : file);
  await copyFile(path.join(srcDir, file), target);
}
