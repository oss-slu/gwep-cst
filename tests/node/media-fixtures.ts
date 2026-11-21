// Builds real media files for the media validation tests with ffmpeg, so no
// binary fixtures are committed. Tones are mono 1 kHz sines; amplitude 0.2238
// (-13 dBFS) measures close to -16 LUFS.
import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { crc32 } from "node:zlib";

const run = promisify(execFile);

export async function haveMediaTools(): Promise<boolean> {
  try {
    await run("ffmpeg", ["-version"]);
    await run("ffprobe", ["-version"]);
    return true;
  } catch {
    return false;
  }
}

async function ffmpeg(args: string[]): Promise<void> {
  await run("ffmpeg", ["-nostdin", "-v", "error", "-y", ...args]);
}

/** A tone: amplitude 0.2238 is about -16 LUFS once encoded. */
export function tone(amplitude = 0.2238, seconds = 4, extra = ""): string {
  // Quoted, so commas inside the expression are not read as separators.
  return `aevalsrc='${String(amplitude)}*sin(2*PI*1000*t)${extra}':s=48000:d=${String(seconds)}`;
}

export async function audio(
  out: string,
  source: string,
  codec: string[],
  channels = 1,
): Promise<void> {
  await ffmpeg([
    "-f",
    "lavfi",
    "-i",
    source,
    "-ac",
    String(channels),
    ...codec,
    out,
  ]);
}

export const MP3 = ["-c:a", "libmp3lame", "-b:a", "64k"];
export const AAC = ["-c:a", "aac", "-b:a", "64k"];
export const VORBIS = ["-c:a", "libvorbis"];
export const OPUS = ["-c:a", "libopus"];

/** Two audio streams in one M4A file. */
export async function twoStreams(out: string): Promise<void> {
  await ffmpeg([
    "-f",
    "lavfi",
    "-i",
    tone(),
    "-f",
    "lavfi",
    "-i",
    tone(0.2238, 4, "*0+0.2238*sin(2*PI*500*t)"),
    "-map",
    "0",
    "-map",
    "1",
    ...AAC,
    out,
  ]);
}

/** A one-colour picture (64 x 48 unless given) in the extension's format. */
export async function picture(
  out: string,
  codec: string[] = [],
  size = "64x48",
): Promise<void> {
  await ffmpeg([
    "-f",
    "lavfi",
    "-i",
    `color=c=0x2a5d8f:s=${size}:d=1`,
    "-frames:v",
    "1",
    ...codec,
    out,
  ]);
}

export const AVIF = ["-c:v", "libaom-av1", "-still-picture", "1"];

/**
 * Pads a PNG to exactly `bytes` long with a private ancillary chunk, which
 * decoders skip, so the file stays a valid picture.
 */
export async function padPng(file: string, bytes: number): Promise<void> {
  const png = await readFile(file);
  const end = png.length - 12; // the IEND chunk is the last 12 bytes
  const data = Buffer.alloc(bytes - png.length - 12);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typeAndData = Buffer.concat([Buffer.from("prVt"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData));
  await writeFile(
    file,
    Buffer.concat([
      png.subarray(0, end),
      length,
      typeAndData,
      crc,
      png.subarray(end),
    ]),
  );
}

/** Pads an MP3 to exactly `bytes` long with an empty ID3v2 tag of padding. */
export async function padMp3(file: string, bytes: number): Promise<void> {
  const mp3 = await readFile(file);
  const padding = bytes - mp3.length - 10;
  // ID3v2 sizes are "syncsafe": 7 bits per byte.
  const size = [21, 14, 7, 0].map((shift) => (padding >> shift) & 0x7f);
  const header = Buffer.from([0x49, 0x44, 0x33, 3, 0, 0, ...size]);
  await writeFile(file, Buffer.concat([header, Buffer.alloc(padding), mp3]));
}
