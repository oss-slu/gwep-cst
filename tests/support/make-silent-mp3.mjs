// Writes a silent test MP3: MPEG-1 Layer III, mono, 32 kbps, 44.1 kHz.
// Each frame is a 4-byte header followed by zeros; zero side information
// decodes as silence. Used only to make the test fixtures in
// tests/fixtures/media/. Usage: node tests/support/make-silent-mp3.mjs <out> <seconds>
import { Buffer } from "node:buffer";
import console from "node:console";
import { writeFileSync } from "node:fs";
import process from "node:process";

const [out, secondsText] = process.argv.slice(2);
const seconds = Number(secondsText);
if (out === undefined || !(seconds > 0)) {
  throw new Error("Usage: make-silent-mp3.mjs <out> <seconds>");
}

const SAMPLE_RATE = 44100;
const SAMPLES_PER_FRAME = 1152;
// 144 * 32000 / 44100 = 104.49 bytes, so about every other frame is padded.
const BYTES = (144 * 32000) / SAMPLE_RATE;

const frames = Math.ceil((seconds * SAMPLE_RATE) / SAMPLES_PER_FRAME);
const parts = [];
let written = 0;
for (let index = 1; index <= frames; index += 1) {
  const size = Math.floor(index * BYTES) - Math.floor((index - 1) * BYTES);
  const pad = size > Math.floor(BYTES) ? 1 : 0;
  const frame = Buffer.alloc(Math.floor(BYTES) + pad);
  // Sync, MPEG-1, Layer III, no CRC | 32 kbps, 44.1 kHz, padding | mono.
  frame.set([0xff, 0xfb, 0x10 | (pad << 1), 0xc0]);
  parts.push(frame);
  written += frame.length;
}
writeFileSync(out, Buffer.concat(parts));
console.log(`${out}: ${String(frames)} frames, ${String(written)} bytes`);
