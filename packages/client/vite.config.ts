import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    target: 'es2022',
  },
  // ES module workers, so the audio worklet bundle (src/audio/worklet.ts) is an ES module
  // like AudioWorklet.addModule expects.
  worker: {
    format: 'es',
  },
});
