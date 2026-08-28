#!/usr/bin/env node
// The Standards tool ships exactly as authored: one self-contained HTML file,
// no bundling, no build. Its own hosting site so it can outlive any one region
// — the framework is not Connecticut's.
import { mkdirSync, copyFileSync, existsSync, rmSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'tools/standards/app/index.html');
const out = join(root, 'dist-standards');

if (!existsSync(src)) {
  console.error(`missing ${src} — run: git subtree add --prefix tools/standards ` +
                `https://github.com/makehaven/Makerspace-Standards.git main --squash`);
  process.exit(1);
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
copyFileSync(src, join(out, 'index.html'));

// robots: the tool holds no content worth indexing beyond its landing page, and
// every assessment lives in the visitor's own browser.
writeFileSync(join(out, 'robots.txt'), 'User-agent: *\nAllow: /\n');

console.log('built dist-standards/');
