import { existsSync } from 'node:fs';
import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: '.', testMatch: '*.spec.ts', fullyParallel: true,
  use: { baseURL: 'http://127.0.0.1:3105', browserName: 'chromium',
    launchOptions: { executablePath: process.env.CHROME_BIN || (existsSync('/usr/bin/google-chrome') ? '/usr/bin/google-chrome' : undefined), args: ['--no-sandbox'] },
  },
  webServer: { command: 'npm run dev -- --host 127.0.0.1 --port 3105', url: 'http://127.0.0.1:3105/test/browser/event-flow.html', reuseExistingServer: !process.env.CI, cwd: '../..' },
});
