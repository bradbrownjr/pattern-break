import { GEN_VERSION } from '@game/core';
import { BRAND } from './config/brand.ts';
import { markCaptureReady, readCaptureParams } from './capture.ts';

// Placeholder entry point. Pixi renderer, audio and UI land in M1+.
document.title = BRAND.name;
const app = document.querySelector<HTMLDivElement>('#app');
if (app) {
  app.textContent = `${BRAND.name} (gen ${GEN_VERSION})`;
}
if (readCaptureParams()) markCaptureReady();
