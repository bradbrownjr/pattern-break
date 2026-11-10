import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { BRAND } from './src/config/brand.ts';

const require = createRequire(import.meta.url);

/**
 * The license texts `build.license` can't see, beside its file: libopenmpt is vendored
 * rather than an npm package, and Workbox is bundled into the service worker by its own
 * build. The Credits screen links to each (src/game/credits.ts).
 */
function moreLicenses(): Plugin {
  const files: Record<string, string> = {
    'licenses/libopenmpt.txt': fileURLToPath(new URL('../analysis/vendor/libopenmpt/LICENSE', import.meta.url)),
    'licenses/workbox.txt': require.resolve('workbox-core/LICENSE'),
  };
  return {
    name: 'pattern-break:more-licenses',
    apply: 'build',
    generateBundle() {
      for (const [fileName, from] of Object.entries(files)) {
        this.emitFile({ type: 'asset', fileName, source: readFileSync(from, 'utf8') });
      }
    },
  };
}

export default defineConfig({
  build: {
    target: 'es2022',
    // The licenses of the npm packages in the bundle, which their licenses ask copies to
    // carry; the Credits screen links to it.
    license: { fileName: 'licenses/third-party.txt' },
  },
  // ES module workers, so the audio worklet bundle (src/audio/worklet.ts) is an ES module
  // like AudioWorklet.addModule expects.
  worker: {
    format: 'es',
  },
  plugins: [
    moreLicenses(),
    // Install and offline play (docs/DEVELOPMENT.md, "Install and offline"): the web app
    // manifest, and src/sw.ts built with the list of files to cache.
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      // src/main.ts registers the worker itself, in production builds only.
      injectRegister: false,
      // The glob below already takes every icon; the plugin adds the manifest itself.
      includeManifestIcons: false,
      injectManifest: {
        // A classic script, not a module: module service workers are newer, and the
        // worker has no imports left once it is bundled.
        rollupFormat: 'iife',
        globPatterns: ['**/*.{html,js,css,wasm,png,mod,xm,s3m,it,txt}'],
        // libopenmpt.wasm is about 1.6 MB; Workbox skips files over 2 MiB by default.
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        // Files under assets/ have a content hash in their names already.
        dontCacheBustURLsMatching: /^assets\//,
      },
      manifest: {
        id: '/',
        name: BRAND.name,
        short_name: BRAND.shortName,
        description: 'A tunnel shooter whose levels are built from songs.',
        start_url: '/',
        scope: '/',
        display: 'fullscreen',
        orientation: 'landscape',
        background_color: '#000000',
        theme_color: '#000000',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          // The letters sit inside the middle 80% circle (tools/make-icons.ts).
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
});
