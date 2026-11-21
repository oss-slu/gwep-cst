// Makes the placeholder media for the Orientation demo in
// public/media/orientation/. Everything is generated here, so the files are
// original work with no outside rights: pictures are drawn with a small
// pixel font defined below (no font files), and sounds are tones made by
// FFmpeg and normalised to -16 LUFS. See docs/MEDIA_PROVENANCE.md.
// Usage (needs ffmpeg on PATH): node scripts/make-placeholder-media.ts
import { execFile } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { crc32, deflateSync } from "node:zlib";

const run = promisify(execFile);
const OUT = "public/media/orientation";

// 5 x 7 pixel glyphs for the letters the labels use.
const GLYPHS: Readonly<Record<string, readonly string[]>> = {
  P: ["####.", "#...#", "#...#", "####.", "#....", "#....", "#...."],
  L: ["#....", "#....", "#....", "#....", "#....", "#....", "#####"],
  A: [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  C: [".###.", "#...#", "#....", "#....", "#....", "#...#", ".###."],
  E: ["#####", "#....", "#....", "####.", "#....", "#....", "#####"],
  H: ["#...#", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  O: [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  D: ["####.", "#...#", "#...#", "#...#", "#...#", "#...#", "####."],
  R: ["####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"],
  I: ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "#####"],
  M: ["#...#", "##.##", "#.#.#", "#.#.#", "#...#", "#...#", "#...#"],
  G: [".###.", "#...#", "#....", "#.###", "#...#", "#...#", ".###."],
  "1": ["..#..", ".##..", "..#..", "..#..", "..#..", "..#..", ".###."],
  "2": [".###.", "#...#", "....#", "...#.", "..#..", ".#...", "#####"],
  "3": ["####.", "....#", "....#", ".###.", "....#", "....#", "####."],
  "4": ["...#.", "..##.", ".#.#.", "#..#.", "#####", "...#.", "...#."],
  " ": [".....", ".....", ".....", ".....", ".....", ".....", "....."],
};

type Rgb = readonly [number, number, number];

/** A width x height RGB picture with centred lines of large text and a border. */
function draw(
  width: number,
  height: number,
  background: Rgb,
  lines: readonly string[],
): Buffer {
  const ink: Rgb = [255, 255, 255];
  const pixels = Buffer.alloc(width * height * 3);
  const set = (x: number, y: number, color: Rgb) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    pixels.set(color, (y * width + x) * 3);
  };
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1) set(x, y, background);
  const border = Math.max(2, Math.round(width / 100));
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const edge = Math.min(x, y, width - 1 - x, height - 1 - y);
      if (edge >= border && edge < border * 2) set(x, y, ink);
    }
  }
  // Text scale: the longest line fills about 80% of the width.
  const longest = Math.max(...lines.map((line) => line.length));
  const scale = Math.floor((width * 0.8) / (longest * 6));
  const lineHeight = 9 * scale;
  const top = Math.round((height - lines.length * lineHeight + 2 * scale) / 2);
  lines.forEach((line, row) => {
    const left = Math.round((width - (line.length * 6 - 1) * scale) / 2);
    // Labels are plain ASCII, so one character is one UTF-16 unit.
    for (let column = 0; column < line.length; column += 1) {
      const char = line.charAt(column);
      const glyph = GLYPHS[char];
      if (glyph === undefined) throw new Error(`No glyph for "${char}"`);
      glyph.forEach((bits, gy) => {
        for (let gx = 0; gx < bits.length; gx += 1) {
          if (bits.charAt(gx) !== "#") continue;
          for (let dy = 0; dy < scale; dy += 1) {
            for (let dx = 0; dx < scale; dx += 1) {
              set(
                left + (column * 6 + gx) * scale + dx,
                top + row * lineHeight + gy * scale + dy,
                ink,
              );
            }
          }
        }
      });
    }
  });
  return png(width, height, pixels);
}

function png(width: number, height: number, rgb: Buffer): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8); // 8-bit RGB
  const rows = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    rgb.copy(rows, y * (width * 3 + 1) + 1, y * width * 3, (y + 1) * width * 3);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(rows, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// Calm, dark backgrounds; white text on each is over 7:1.
const PICTURES: readonly Rgb[] = [
  [31, 78, 121],
  [27, 94, 72],
  [110, 52, 32],
  [76, 52, 110],
];
const WIDTHS = [1200, 800, 400] as const;

async function pictures() {
  for (const [index, background] of PICTURES.entries()) {
    const number = String(index + 1);
    for (const width of WIDTHS) {
      const name =
        width === 1200
          ? `placeholder-${number}.png`
          : `placeholder-${number}-${String(width)}.png`;
      const file = draw(width, (width * 3) / 4, background, [
        "PLACEHOLDER",
        `IMAGE ${number}`,
      ]);
      await writeFile(join(OUT, name), file);
      console.log(
        `${OUT}/${name}: ${String(width)} x ${String((width * 3) / 4)}, ${String(file.length)} bytes`,
      );
    }
  }
}

// Gentle tones, about 3 seconds each, as FFmpeg aevalsrc expressions.
const SOUNDS: Readonly<Record<string, string>> = {
  // A bell-like chime: three partials fading out.
  "placeholder-chime":
    "(sin(2*PI*660*t)+0.5*sin(2*PI*1320*t)+0.25*sin(2*PI*1980*t))*exp(-1.6*t)",
  // Four soft, rounded knocks, 0.6 s apart (slow decay keeps the peaks low
  // enough for -16 LUFS within the true-peak limit).
  "placeholder-knock":
    "(sin(2*PI*180*t)+0.4*sin(2*PI*360*t))*exp(-9*mod(t,0.6))*lt(t,2.4)",
  // A whistle rising from 600 Hz to 1200 Hz.
  "placeholder-whistle": "sin(2*PI*(600*t+100*t*t))*min(1,t*4)*min(1,(3-t)*4)",
};

async function ffmpeg(args: string[]): Promise<string> {
  const { stderr } = await run(
    "ffmpeg",
    ["-nostdin", "-hide_banner", "-y", ...args],
    { maxBuffer: 10_000_000 },
  );
  return stderr;
}

async function sounds() {
  for (const [name, expression] of Object.entries(SOUNDS)) {
    const raw = join(OUT, `${name}.raw.wav`);
    await ffmpeg([
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      `aevalsrc='${expression}':s=48000:d=3`,
      "-ac",
      "1",
      raw,
    ]);
    // Two-pass loudness normalisation to -16 LUFS, true peak at most -1.5 dBTP.
    const target = "I=-16:TP=-1.5:LRA=11";
    const first = await ffmpeg([
      "-i",
      raw,
      "-af",
      `loudnorm=${target}:print_format=json`,
      "-f",
      "null",
      "-",
    ]);
    const measured = JSON.parse(
      first.slice(first.lastIndexOf("{"), first.lastIndexOf("}") + 1),
    ) as Record<string, string>;
    const second = [
      target,
      `measured_I=${measured.input_i ?? ""}`,
      `measured_TP=${measured.input_tp ?? ""}`,
      `measured_LRA=${measured.input_lra ?? ""}`,
      `measured_thresh=${measured.input_thresh ?? ""}`,
      `offset=${measured.target_offset ?? ""}`,
      "linear=true",
    ].join(":");
    const out = join(OUT, `${name}.mp3`);
    await ffmpeg([
      "-v",
      "error",
      "-i",
      raw,
      "-af",
      `loudnorm=${second}`,
      "-ar",
      "48000",
      "-ac",
      "1",
      "-c:a",
      "libmp3lame",
      "-b:a",
      "96k",
      "-map_metadata",
      "-1",
      "-id3v2_version",
      "0",
      out,
    ]);
    await rm(raw);
    console.log(`${out}: made`);
  }
}

await mkdir(OUT, { recursive: true });
await pictures();
await sounds();
