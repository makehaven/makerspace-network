#!/usr/bin/env node
// The Standards tool is a single self-contained HTML file living in the
// tools/standards subtree. Copy it into public/ so Vite serves it verbatim at
// /tools/standards/ — no build, no bundling, no coupling to the site's React.
import { mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'tools/standards/app/index.html');
const destDir = join(root, 'public/tools/standards');

if (!existsSync(src)) {
  console.error(`missing ${src} — run: git subtree add --prefix tools/standards ` +
                `https://github.com/makehaven/Makerspace-Standards.git main --squash`);
  process.exit(1);
}

mkdirSync(destDir, { recursive: true });
copyFileSync(src, join(destDir, 'index.html'));
console.log('synced tools/standards → public/tools/standards/index.html');
