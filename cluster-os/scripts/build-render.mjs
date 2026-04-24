import { mkdir, readdir, copyFile, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');
const srcDir = path.join(root, 'src', 'dashboard');
const outDir = path.join(root, 'dist', 'render');

await mkdir(outDir, { recursive: true });

const dashboardSource = await readFile(path.join(srcDir, 'Dashboard.ts'), 'utf8');
const transpiled = ts.transpileModule(dashboardSource, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2020,
    module: ts.ModuleKind.CommonJS,
    esModuleInterop: true
  }
});

await writeFile(path.join(outDir, 'Dashboard.js'), transpiled.outputText, 'utf8');

for (const file of await readdir(srcDir)) {
  if (!['dashboard.html', 'dashboard.css', 'dashboard-client.js', 'dashboard-api.js'].includes(file)) continue;
  await copyFile(path.join(srcDir, file), path.join(outDir, file));
}
