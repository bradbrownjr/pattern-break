import { playwright } from '@vitest/browser-playwright';
import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config.ts';

// `node` runs the Node tests (test/**/*.test.ts). `browser` runs the audio and renderer
// tests (test/browser/**) in real browsers, as in packages/analysis: PB_BROWSERS picks them
// (default chromium; CI sets chromium,firefox,webkit), and PB_CHROMIUM points at a
// Chromium binary when Playwright's own download isn't available. Each engine gets the
// launch settings that let a page start audio without a click.
const browsers = (process.env['PB_BROWSERS'] ?? 'chromium').split(',').map((b) => b.trim());
const chromiumPath = process.env['PB_CHROMIUM'];

type Engine = 'chromium' | 'firefox' | 'webkit';

function providerFor(browser: Engine) {
  switch (browser) {
    case 'chromium':
      return playwright({
        launchOptions: {
          ...(chromiumPath ? { executablePath: chromiumPath } : {}),
          // SwiftShader gives the renderer test WebGL on machines without a GPU.
          args: ['--autoplay-policy=no-user-gesture-required', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
        },
      });
    case 'firefox':
      return playwright({
        launchOptions: {
          firefoxUserPrefs: {
            'media.autoplay.default': 0,
            'media.autoplay.block-webaudio': false,
          },
        },
      });
    case 'webkit':
      return playwright();
  }
}

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      projects: [
        {
          extends: true,
          test: { name: 'node', include: ['test/**/*.test.ts'], exclude: ['test/browser/**'] },
        },
        {
          extends: true,
          test: {
            name: 'browser',
            include: ['test/browser/**/*.test.ts'],
            browser: {
              enabled: true,
              headless: true,
              instances: browsers.map((browser) => ({
                browser: browser as Engine,
                provider: providerFor(browser as Engine),
              })),
            },
          },
        },
      ],
    },
  }),
);
