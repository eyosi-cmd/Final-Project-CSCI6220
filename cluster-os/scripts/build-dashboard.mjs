import { mkdir, readFile, readdir, writeFile, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');
const srcDir = path.join(root, 'src', 'dashboard');
const outDir = path.join(root, 'dist');
const apiBaseUrl = (process.env.API_BASE_URL || '').trim().replace(/\/$/, '');

await mkdir(outDir, { recursive: true });

const files = await readdir(srcDir);
for (const file of files) {
  if (!file.endsWith('.html') && !file.endsWith('.css') && !file.endsWith('.js')) continue;
  const source = path.join(srcDir, file);
  const target = path.join(outDir, file === 'dashboard.html' ? 'index.html' : file);
  if (file === 'dashboard.html') {
    const html = await readFile(source, 'utf8');
    const updated = html.replace('content=""', `content="${apiBaseUrl.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"`);
    await writeFile(target, updated, 'utf8');
  } else {
    await copyFile(source, target);
  }
}
