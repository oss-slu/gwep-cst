// @vitest-environment node
import { execFile } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  AAC,
  AVIF,
  MP3,
  OPUS,
  VORBIS,
  audio,
  haveMediaTools,
  padMp3,
  padPng,
  picture,
  tone,
  twoStreams,
} from "./media-fixtures.ts";

// Runs scripts/validate-media.ts in small temporary projects with real media
// made by ffmpeg. These tests need ffmpeg and ffprobe on PATH. CI installs
// them, so there a missing tool fails the run; elsewhere the tests that need
// them are skipped with a note.
const SCRIPT = fileURLToPath(
  new URL("../../scripts/validate-media.ts", import.meta.url),
);
const tools = await haveMediaTools();
const required = process.env.CI !== undefined;
if (!tools && !required) {
  console.warn(
    "validate-media tests: ffmpeg/ffprobe not on PATH; skipping the real-media tests",
  );
}

interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

function validate(
  cwd: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<RunResult> {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      [SCRIPT],
      { cwd, env },
      (error, stdout, stderr) => {
        const code =
          error === null ? 0 : typeof error.code === "number" ? error.code : 1;
        resolve({ code, stdout, stderr });
      },
    );
  });
}

let root: string;
let library: string; // generated media, copied into each project as needed

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "validate-media-"));
  library = join(root, "library");
  await mkdir(library);
  if (!tools) return;
  const at = (name: string) => join(library, name);
  await Promise.all([
    picture(at("ok.png")),
    picture(at("ok.jpg")),
    picture(at("ok.webp"), ["-c:v", "libwebp"]),
    picture(at("ok.avif"), AVIF),
    picture(at("big.png")),
    picture(at("limit.png")),
    picture(at("over.png")),
    audio(at("ok.mp3"), tone(), MP3),
    audio(at("ok.m4a"), tone(), AAC),
    audio(at("ok-vorbis.ogg"), tone(), VORBIS),
    audio(at("ok-opus.ogg"), tone(), OPUS),
    audio(at("limit.mp3"), tone(), MP3),
    audio(at("over.mp3"), tone(), MP3),
    audio(at("stereo.mp3"), tone(), MP3, 2),
    audio(at("quiet.mp3"), tone(0.07), MP3),
    audio(at("loud.mp3"), tone(0.6), MP3),
    // About -16 LUFS overall, with brief near-full-scale clicks.
    audio(at("peaky.mp3"), tone(0.2238, 4, "+0.95*lt(mod(t,0.5),0.0004)"), MP3),
    audio(at("silent.mp3"), "anullsrc=r=48000:cl=mono:d=3", MP3),
    twoStreams(at("two-streams.m4a")),
  ]);
  await padPng(at("big.png"), 700_000);
  await padPng(at("limit.png"), 2_000_000);
  await padPng(at("over.png"), 2_000_001);
  await padMp3(at("limit.mp3"), 5_000_000);
  await padMp3(at("over.mp3"), 5_000_001);
  // A real PNG signature followed by damaged data.
  const png = await readFile(at("ok.png"));
  await writeFile(
    at("truncated.png"),
    png.subarray(0, Math.floor(png.length * 0.6)),
  );
}, 120_000);

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

let count = 0;
/** A project with the given library files copied to public/media/test/. */
async function project(
  files: Record<string, string>,
  sessions: Record<string, unknown> = {},
) {
  count += 1;
  const dir = join(root, `project-${String(count)}`);
  await mkdir(join(dir, "public/media/test"), { recursive: true });
  await mkdir(join(dir, "content/sessions"), { recursive: true });
  for (const [name, from] of Object.entries(files)) {
    await writeFile(
      join(dir, "public/media/test", name),
      await readFile(join(library, from)),
    );
  }
  for (const [name, data] of Object.entries(sessions)) {
    await writeFile(join(dir, "content/sessions", name), JSON.stringify(data));
  }
  return dir;
}

const realMedia = describe.skipIf(!tools && !required);

realMedia("validate-media with real files", () => {
  it("passes every supported format, a 700 KB picture with a warning, and exact size limits", async () => {
    const dir = await project(
      {
        "a.png": "ok.png",
        "a.jpg": "ok.jpg",
        "a.jpeg": "ok.jpg",
        "a.webp": "ok.webp",
        "a.avif": "ok.avif",
        "big.png": "big.png",
        "limit.png": "limit.png",
        "a.mp3": "ok.mp3",
        "a.m4a": "ok.m4a",
        "vorbis.ogg": "ok-vorbis.ogg",
        "opus.ogg": "ok-opus.ogg",
        "limit.mp3": "limit.mp3",
      },
      {
        "fixture.json": {
          slides: [
            {
              image: {
                src: "/media/test/a.png",
                variants: [{ src: "/media/test/a.webp" }],
              },
            },
            { clips: [{ sound: { src: "/media/test/a.mp3" } }] },
          ],
        },
      },
    );
    const result = await validate(dir);
    expect(result.stderr).toContain(
      "warning: public/media/test/big.png: image is 700000 bytes (0.70 MB), above the 500000 bytes (0.50 MB) optimization target (allowed)",
    );
    expect(result.stdout).toMatch(/validate-media: using ffmpeg version \S+/);
    expect(result.stdout).toMatch(/validate-media: using ffprobe version \S+/);
    expect(result.stdout).toContain(
      "validate-media: 12 media files in public/media, no problems.",
    );
    expect(result.code).toBe(0);
  });

  it.each([
    [
      "over.png",
      "over.png",
      "image is 2000001 bytes (2.00 MB), over the 2000000 bytes (2.00 MB) limit",
    ],
    [
      "over.mp3",
      "over.mp3",
      "sound is 5000001 bytes (5.00 MB), over the 5000000 bytes (5.00 MB) per-clip limit",
    ],
    [
      "renamed.jpg",
      "ok.png",
      "file contents are png, not the jpeg format its extension says",
    ],
    [
      "renamed.ogg",
      "ok.mp3",
      'file contents are "mp3", not the ogg format its .ogg extension says',
    ],
    ["truncated.png", "truncated.png", "image could not be decoded: "],
    [
      "stereo.mp3",
      "stereo.mp3",
      "has 2 channels; sounds must be mono (1 channel)",
    ],
    ["two.m4a", "two-streams.m4a", "has 2 audio streams; exactly 1 is allowed"],
    [
      "quiet.mp3",
      "quiet.mp3",
      "LUFS is outside the allowed -17 to -15 LUFS (target -16 LUFS)",
    ],
    [
      "loud.mp3",
      "loud.mp3",
      "LUFS is outside the allowed -17 to -15 LUFS (target -16 LUFS)",
    ],
    ["peaky.mp3", "peaky.mp3", "dBTP is above the -1.0 dBTP limit"],
    [
      "silent.mp3",
      "silent.mp3",
      "integrated loudness could not be measured (got -inf)",
    ],
    ["a.gif", "ok.png", 'Unsupported file type ".gif"'],
    ["a.wav", "ok.mp3", 'Unsupported file type ".wav"'],
    [
      ".DS_Store",
      "ok.png",
      "Media files must be at public/media/<folder>/<file>.<ext>",
    ],
  ])(
    "rejects %s, naming the file and the limit",
    async (name, from, message) => {
      const dir = await project({ "a.png": "ok.png", [name]: from });
      const result = await validate(dir);
      expect(result.code).toBe(1);
      // One line names the file and states the limit it breaks.
      const line = result.stderr
        .split("\n")
        .find((text) => text.startsWith(`public/media/test/${name}: `));
      expect(line, result.stderr).toContain(message);
      expect(result.stderr).not.toContain("public/media/test/a.png:");
    },
  );

  it("measures the loudness of the passing tone inside the range, without rounding", async () => {
    const dir = await project({ "loud.mp3": "loud.mp3" });
    const result = await validate(dir);
    const measured = /integrated loudness (-?\d+(?:\.\d+)?) LUFS/.exec(
      result.stderr,
    )?.[1];
    expect(Number(measured)).toBeGreaterThan(-15);
  });

  it("rejects a symbolic link and a folder at the wrong depth", async () => {
    const dir = await project({ "a.png": "ok.png" });
    await symlink(
      join(dir, "public/media/test/a.png"),
      join(dir, "public/media/test/link.png"),
    );
    await mkdir(join(dir, "public/media/test/deeper"));
    await writeFile(
      join(dir, "public/media/test/deeper/b.png"),
      await readFile(join(library, "ok.png")),
    );
    const result = await validate(dir);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain(
      "public/media/test/link.png: media must be regular files, not symbolic links",
    );
    expect(result.stderr).toContain(
      "public/media/test/deeper/b.png: Media files must be at public/media/<folder>/<file>.<ext>",
    );
  });

  it("requires each session reference to be a file that passed its checks", async () => {
    const dir = await project(
      { "ok.png": "ok.png", "stereo.mp3": "stereo.mp3" },
      {
        "orientation.json": {
          slides: [
            { image: { src: "/media/test/ok.png" } },
            { image: { src: "/media/test/missing.png" } },
            { clips: [{ sound: { src: "/media/test/stereo.mp3" } }] },
          ],
        },
      },
    );
    await symlink(
      join(dir, "public/media/test/ok.png"),
      join(dir, "public/media/test/link.png"),
    );
    await writeFile(
      join(dir, "content/sessions/linked.json"),
      JSON.stringify({ slides: [{ image: { src: "/media/test/link.png" } }] }),
    );
    const result = await validate(dir);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain(
      "content/sessions/orientation.json: slides[1].image.src: /media/test/missing.png is not a valid media file (public/media/test/missing.png is missing or failed its checks)",
    );
    expect(result.stderr).toContain(
      "content/sessions/orientation.json: slides[2].clips[0].sound.src: /media/test/stereo.mp3 is not a valid media file",
    );
    expect(result.stderr).toContain(
      "content/sessions/linked.json: slides[0].image.src: /media/test/link.png is not a valid media file",
    );
    expect(result.stderr).not.toContain(
      "slides[0].image.src: /media/test/ok.png",
    );
  });
});

describe("validate-media without the media tools", () => {
  it("fails with install instructions when there is media to check", async () => {
    const dir = join(root, "no-tools");
    await mkdir(join(dir, "public/media/test"), { recursive: true });
    await writeFile(join(dir, "public/media/test/a.png"), "not inspected");
    const result = await validate(dir, {
      ...process.env,
      PATH: "/nonexistent",
    });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain(
      "validate-media: ffmpeg was not found. Install FFmpeg",
    );
  });

  it("needs no tools when there is no media", async () => {
    const dir = join(root, "no-media");
    await mkdir(dir, { recursive: true });
    const result = await validate(dir, {
      ...process.env,
      PATH: "/nonexistent",
    });
    expect(result.code).toBe(0);
    expect(result.stdout).toContain(
      "validate-media: 0 media files in public/media, no problems.",
    );
  });
});
