// Runs ffmpeg and ffprobe for build-time media checks. Each run gets an
// argument list (no shell), local file input only, a time limit and an
// output limit, so a hostile or broken file cannot run commands, read other
// sources or hang the build.
import { execFile } from "node:child_process";
import { IMAGE_MAX_PIXELS, type AudioStream } from "./rules.ts";

const TIMEOUT_MS = 60_000;
const MAX_OUTPUT_BYTES = 1_000_000;
const MIN_MAJOR_VERSION = 6;

export const INSTALL_HELP =
  "Install FFmpeg (it includes ffprobe) and put it on PATH. Ubuntu: sudo apt-get install ffmpeg. macOS: brew install ffmpeg, or a checksum-verified build from https://ffmpeg.martin-riedl.de (see README).";

interface RunResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

function run(command: string, args: readonly string[]): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    execFile(
      command,
      args,
      { timeout: TIMEOUT_MS, maxBuffer: MAX_OUTPUT_BYTES, windowsHide: true },
      (error, stdout, stderr) => {
        if (error === null) {
          resolve({ code: 0, stdout, stderr });
          return;
        }
        if (error.code === "ENOENT") {
          reject(new Error(`${command} was not found. ${INSTALL_HELP}`));
          return;
        }
        if (error.killed) {
          reject(
            new Error(
              `${command} stopped after ${String(TIMEOUT_MS / 1000)} s or ${String(MAX_OUTPUT_BYTES)} bytes of output`,
            ),
          );
          return;
        }
        resolve({
          code: typeof error.code === "number" ? error.code : 1,
          stdout,
          stderr,
        });
      },
    );
  });
}

/** Local files only: never URLs or other protocols. */
function input(path: string): string[] {
  return ["-protocol_whitelist", "file", "-i", `file:${path}`];
}

/** Checks both tools are installed and recent enough; returns their versions. */
export async function checkTools(): Promise<string[]> {
  const versions: string[] = [];
  for (const tool of ["ffmpeg", "ffprobe"]) {
    const { stdout } = await run(tool, ["-hide_banner", "-version"]);
    const line = stdout.split("\n")[0] ?? "";
    const major = Number(/version n?(\d+)/.exec(line)?.[1]);
    if (!(major >= MIN_MAJOR_VERSION)) {
      throw new Error(
        `${tool} ${String(MIN_MAJOR_VERSION)} or later is required, found "${line}". ${INSTALL_HELP}`,
      );
    }
    versions.push(line);
  }
  return versions;
}

/**
 * Fully decodes the first picture. Any decoder error, including a cut-off
 * or damaged file with a correct signature, is returned. The decoder also
 * refuses pictures over the pixel limit (a second guard: validate-media
 * checks the header's size first).
 */
export async function decodeImage(path: string): Promise<string | undefined> {
  const result = await run("ffmpeg", [
    "-nostdin",
    "-hide_banner",
    "-v",
    "error",
    "-xerror",
    "-err_detect",
    "explode",
    "-max_pixels",
    String(IMAGE_MAX_PIXELS),
    ...input(path),
    "-frames:v",
    "1",
    "-f",
    "null",
    "-",
  ]);
  const errors = result.stderr.trim();
  if (result.code === 0 && errors === "") return undefined;
  // The first message is the cause; later ones repeat it or say nothing
  // was written. Drop ffmpeg's "[codec @ 0x...]" prefixes.
  const [first] = errors
    .split("\n")
    .map((line) => line.replace(/^(?:\[[^\]]*\]\s*)+/, "").trim())
    .filter((line) => line !== "");
  return first ?? `ffmpeg exited with ${String(result.code)}`;
}

export interface AudioProbe {
  readonly container: string | undefined;
  readonly streams: readonly AudioStream[];
}

export async function probeAudio(path: string): Promise<AudioProbe> {
  const result = await run("ffprobe", [
    "-hide_banner",
    "-v",
    "error",
    "-show_entries",
    "format=format_name:stream=codec_type,codec_name,channels",
    "-of",
    "json",
    ...input(path),
  ]);
  if (result.code !== 0) {
    throw new Error(
      `ffprobe could not read the file: ${result.stderr.trim() || `exit ${String(result.code)}`}`,
    );
  }
  const parsed = JSON.parse(result.stdout) as {
    format?: { format_name?: string };
    streams?: { codec_type?: string; codec_name?: string; channels?: number }[];
  };
  return {
    container: parsed.format?.format_name,
    streams: (parsed.streams ?? []).map((stream) => ({
      codecType: stream.codec_type ?? "unknown",
      codecName: stream.codec_name,
      channels: stream.channels,
    })),
  };
}

/**
 * Integrated loudness (ITU-R BS.1770, gated) and true peak, from ffmpeg's
 * loudnorm filter in measurement mode, exactly as it reports them.
 */
export async function measureLoudness(path: string): Promise<{
  integrated: string | undefined;
  truePeak: string | undefined;
}> {
  const result = await run("ffmpeg", [
    "-nostdin",
    "-hide_banner",
    "-nostats",
    ...input(path),
    "-map",
    "0:a:0",
    "-af",
    "loudnorm=print_format=json",
    "-f",
    "null",
    "-",
  ]);
  const start = result.stderr.lastIndexOf("{");
  const end = result.stderr.lastIndexOf("}");
  if (result.code !== 0 || start === -1 || end < start) {
    return { integrated: undefined, truePeak: undefined };
  }
  const report = JSON.parse(result.stderr.slice(start, end + 1)) as {
    input_i?: string;
    input_tp?: string;
  };
  return { integrated: report.input_i, truePeak: report.input_tp };
}
