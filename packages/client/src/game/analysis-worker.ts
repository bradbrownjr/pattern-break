// Web Worker that runs the analysis pass (docs/PLAN.md, "Analysis pipeline") off the main
// thread. It receives a song file's bytes and a tempo, and replies with the serialized
// LevelData.

import { analyze, loadOpenMpt, type OpenMpt } from '@game/analysis';
import { serializeLevelData } from '@game/core';

export interface AnalysisRequest {
  id: number;
  bytes: ArrayBuffer;
  /** The difficulty's tempo, in thousandths. */
  tempoPermille: number;
}

export type AnalysisReply = { id: number; ok: true; levelData: ArrayBuffer } | { id: number; ok: false; message: string };

let openmpt: Promise<OpenMpt> | null = null;

const scope = self as unknown as {
  onmessage: ((e: MessageEvent<AnalysisRequest>) => void) | null;
  postMessage(message: AnalysisReply, transfer?: Transferable[]): void;
};

scope.onmessage = (e) => {
  const { id, bytes, tempoPermille } = e.data;
  openmpt ??= loadOpenMpt();
  openmpt
    .then((lib) => {
      const out = serializeLevelData(analyze(lib, new Uint8Array(bytes), tempoPermille));
      const buffer = out.byteOffset === 0 && out.byteLength === out.buffer.byteLength ? out.buffer : out.slice().buffer;
      scope.postMessage({ id, ok: true, levelData: buffer as ArrayBuffer }, [buffer as ArrayBuffer]);
    })
    .catch((err: unknown) => {
      scope.postMessage({ id, ok: false, message: err instanceof Error ? err.message : String(err) });
    });
};
