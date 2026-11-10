import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { BRAND } from './src/config/brand.ts';

export default defineConfig({
  build: {
    target: 'es2022',
  },
  // ES module workers, so the audio worklet bundle (src/audio/worklet.ts) is an ES module
  // like AudioWorklet.addModule expects.
  worker: {
    format: 'es',
  },
  plugins: [
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
        globPatterns: ['**/*.{html,js,css,wasm,png,mod,xm,s3m,it}'],
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
