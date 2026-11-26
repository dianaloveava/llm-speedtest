// Copies the no-build front-end into dist/ for the Tauri shell.
// The web app keeps living at the repo root (file:// + serve.py still work);
// this only assembles what gets bundled into the desktop binary.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve('.');
const OUT = path.join(ROOT, 'dist');
const FILES = [
  'index.html',
  'styles.css',
  'app.js',
  'api-handlers.js',
  'i18n.js',
  'transport.js',
];

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

let bytes = 0;
for (const name of FILES) {
  const from = path.join(ROOT, name);
  if (!fs.existsSync(from)) {
    console.error(`build-web: missing ${name}`);
    process.exit(1);
  }
  const data = fs.readFileSync(from);
  fs.writeFileSync(path.join(OUT, name), data);
  bytes += data.length;
}

console.log(`build-web: ${FILES.length} files, ${(bytes / 1024).toFixed(1)} KiB -> dist/`);
