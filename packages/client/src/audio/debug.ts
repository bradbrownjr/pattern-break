// The audio debug page (audio-debug.html on the dev server). Development only: it plays
// the analysis fixture and shows the clock next to what the worklet reports.

import fixtureUrl from '@game/analysis/fixtures/pb-fixture-01.mod?url';
import { SAMPLE_RATE } from '@game/core';
import { createAudioPlayer, type AudioPlayer } from './index.ts';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const readout = $<HTMLTableElement>('readout');

let player: AudioPlayer | null = null;
let error = '';
// The context's frame minus the song frame a position message describes, on receipt.
let receiptLag = 0;
// contextFrame - songFrames - anchor frame for the last message. Nonzero means quanta were lost.
let graphDrift = 0;

async function getPlayer(): Promise<AudioPlayer> {
  if (player) return player;
  const p = await createAudioPlayer();
  const response = await fetch(fixtureUrl);
  await p.load(new Uint8Array(await response.arrayBuffer()));
  p.userOffsetMs = Number($<HTMLInputElement>('offset').value) || 0;
  p.onPosition = (m) => {
    const start = p.startTime;
    if (start === null) return;
    const anchor = Math.round(start * SAMPLE_RATE);
    receiptLag = Math.round(p.context.currentTime * SAMPLE_RATE) - anchor - m.songFrames;
    graphDrift = m.contextFrame - m.songFrames - anchor;
  };
  p.onError = (message) => {
    error = message;
  };
  player = p;
  return p;
}

function run(action: (p: AudioPlayer) => Promise<void> | void): () => void {
  return () => {
    getPlayer()
      .then(action)
      .catch((err: unknown) => {
        error = String(err);
      });
  };
}

$('play').onclick = run((p) => p.start());
$('pause').onclick = run((p) => p.pause());
$('resume').onclick = run((p) => p.resume());
$('stop').onclick = run((p) => p.stop());
$<HTMLInputElement>('offset').oninput = (e) => {
  if (player) player.userOffsetMs = Number((e.target as HTMLInputElement).value) || 0;
};

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

function row(label: string, value: string): string {
  return `<tr><td>${label}</td><td>${escape(value)}</td></tr>`;
}

function frame(): void {
  const p = player;
  const ms = (frames: number) => `${frames} frames (${((frames / SAMPLE_RATE) * 1000).toFixed(1)} ms)`;
  if (p) {
    const samples = p.songTimeSamples();
    const pos = p.lastPosition;
    readout.innerHTML = [
      row('libopenmpt', p.libraryVersion),
      row('state', p.state),
      row('context', `${p.context.state}, ${p.context.sampleRate} Hz, time ${p.context.currentTime.toFixed(3)} s`),
      row('song time', `${(samples / SAMPLE_RATE).toFixed(3)} s (${samples} samples)`),
      row('start time', p.startTime === null ? '-' : `${p.startTime.toFixed(4)} s`),
      row('latency', `${(p.latency * 1000).toFixed(1)} ms`),
      row('order, row', pos ? `${pos.order}, ${pos.row}` : '-'),
      row('reported position', pos ? ms(pos.songFrames) : '-'),
      row('context ahead of report on receipt', ms(receiptLag)),
      row('graph drift (should be 0)', ms(graphDrift)),
      row('ended at', p.endedAtSongFrames === null ? '-' : ms(p.endedAtSongFrames)),
      row('error', error || '-'),
    ].join('');
  } else {
    readout.innerHTML = row('state', error || 'not started: press Play');
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
