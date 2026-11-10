// The service worker that lets the game install and run with no connection
// (docs/DEVELOPMENT.md, "Install and offline"). vite-plugin-pwa builds it with Workbox and
// fills in `self.__WB_MANIFEST`, the list of every file in the build: the page, scripts,
// the libopenmpt WASM, the images and the bundled songs. They are all downloaded when the
// worker installs, so the first visit online is enough to play offline afterwards.
//
// Built files carry a content hash in their names, so they are served from the cache. The
// page itself is fetched from the network first, so a player online always gets the newest
// build; offline, or when the server doesn't answer within NAVIGATION_TIMEOUT_MS, the
// cached page is used. Imported songs and cached levels live in IndexedDB, not here.

/// <reference lib="webworker" />

import { clientsClaim } from 'workbox-core';
import { cleanupOutdatedCaches, matchPrecache, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

declare const self: ServiceWorkerGlobalScope;

const NAVIGATION_TIMEOUT_MS = 4000;

/** The newest page from the network, or the cached one when that fails or is slow. */
async function page(request: Request): Promise<Response> {
  try {
    const response = await fetch(request, { signal: AbortSignal.timeout(NAVIGATION_TIMEOUT_MS) });
    if (response.ok) return response;
  } catch {
    // Offline, or too slow: fall through to the cached page.
  }
  return (await matchPrecache('index.html')) ?? Response.error();
}

// Registered before the precache's own route, so it is the one that answers navigations.
registerRoute(new NavigationRoute(({ request }) => page(request)));
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// A new build's worker takes over at once rather than waiting for every tab to close. A page
// already open keeps running the build it loaded, which fetched everything it needs at
// start; the next load is the new build.
self.addEventListener('install', () => void self.skipWaiting());
clientsClaim();
