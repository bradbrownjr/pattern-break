import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

// `node` runs every test in Node. `browser` runs the golden and replay tests in real browsers:
// PB_BROWSERS picks them (default chromium; CI sets chromium,firefox,webkit), and
// PB_CHROMIUM points at a Chromium binary when Playwright's own download isn't available.
const browsers = (process.env['PB_BROWSERS'] ?? 'chromium').split(',').map((b) => b.trim());
const chromiumPath = process.env['PB_CHROMIUM'];

export default defineConfig({
  test: {
    projects: [
      {
        test: { name: 'node', include: ['test/**/*.test.ts'] },
      },
      {
        test: {
          name: 'browser',
          include: ['test/golden.test.ts', 'test/replay.test.ts'],
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(chromiumPath ? { launchOptions: { executablePath: chromiumPath } } : {}),
            instances: browsers.map((browser) => ({ browser: browser as 'chromium' | 'firefox' | 'webkit' })),
          },
        },
      },
    ],
  },
});
