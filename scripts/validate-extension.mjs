import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const extension = path.join(root, 'apps', 'chrome-extension');
const manifest = JSON.parse(fs.readFileSync(path.join(extension, 'manifest.json'), 'utf8'));
for (const file of [manifest.devtools_page, manifest.background.service_worker, ...manifest.content_scripts.flatMap((entry) => entry.js)]) {
  const fullPath = path.join(extension, file);
  if (!fs.existsSync(fullPath)) throw new Error(`Extension manifest references missing file: ${file}`);
  if (file.endsWith('.js')) execFileSync(process.execPath, ['--check', fullPath], { stdio: 'inherit' });
}
for (const file of ['panel.js', 'content-script.js', 'background.js', 'devtools.js']) execFileSync(process.execPath, ['--check', path.join(extension, file)], { stdio: 'inherit' });
for (const file of ['panel.html', 'devtools.html']) {
  if (!fs.readFileSync(path.join(extension, file), 'utf8').includes('<script')) throw new Error(`${file} does not load a script`);
}
console.log('Chrome extension manifest, referenced files, and JavaScript syntax are valid.');
