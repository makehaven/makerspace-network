#!/usr/bin/env node
// standards.makerspace.network used to serve the standalone tool. The
// Standards of Excellence now live in the site (Your space → Standards), and
// every path on the old host 301s there (firebase.json). Hosting still needs
// a public directory, so this leaves a page that says where it went.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist-standards');
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'index.html'), `<!doctype html>
<meta charset="utf-8"><title>Standards of Excellence — moved</title>
<meta http-equiv="refresh" content="0; url=https://makerspace.network/?page=standards">
<p>The Standards of Excellence now live at <a href="https://makerspace.network/?page=standards">makerspace.network</a>.</p>
`);
console.log('built dist-standards/ (redirect)');
