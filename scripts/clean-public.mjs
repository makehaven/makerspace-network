#!/usr/bin/env node
// The dev server serves the Standards tool from public/ for convenience, but in
// production it lives on its own host and /tools/standards 301s there. Strip the
// dev copy so the deployed bundle has exactly one canonical home for it.
import { rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
rmSync(join(dirname(fileURLToPath(import.meta.url)), '../public/tools'), { recursive: true, force: true });
