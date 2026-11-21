// The media rules from docs/design/M0_DESIGN.md §4.1, and the checks that
// need no media tools. Sizes are decimal: 1 MB = 1,000,000 bytes.

export const IMAGE_MAX_BYTES = 2_000_000;
/** A performance target, not a limit: larger images pass with a warning. */
export const IMAGE_TARGET_BYTES = 500_000;
export const AUDIO_MAX_BYTES = 5_000_000;

/** Integrated loudness: −16 LUFS ± 1 LU, inclusive. */
export const LOUDNESS_MIN_LUFS = -17;
export const LOUDNESS_MAX_LUFS = -15;
export const TRUE_PEAK_MAX_DBTP = -1;

export type MediaKind = "image" | "audio";
export type ImageFormat = "jpeg" | "png" | "webp" | "avif";
export type AudioFormat = "mp3" | "m4a" | "ogg";

export const IMAGE_EXTENSIONS: Readonly<Record<string, ImageFormat>> = {
  jpg: "jpeg",
  jpeg: "jpeg",
  png: "png",
  webp: "webp",
  avif: "avif",
};

export const AUDIO_EXTENSIONS: Readonly<Record<string, AudioFormat>> = {
  mp3: "mp3",
  m4a: "m4a",
  ogg: "ogg",
};

/** The same file path rule as session content: /media/<folder>/<file>.<ext>. */
const MEDIA_FILE =
  /^[a-z0-9]+(?:-[a-z0-9]+)*\/[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*$/;

export function formatMegabytes(bytes: number): string {
  return `${String(bytes)} bytes (${(bytes / 1_000_000).toFixed(2)} MB)`;
}

/**
 * Checks a path relative to public/media and says what kind of media it is.
 * Returns a problem message instead when the path or type is not allowed.
 */
export type MediaType =
  | { readonly kind: "image"; readonly format: ImageFormat }
  | { readonly kind: "audio"; readonly format: AudioFormat };

export function classifyPath(
  relative: string,
):
  | ({ readonly ok: true } & MediaType)
  | { readonly ok: false; readonly message: string } {
  if (!MEDIA_FILE.test(relative)) {
    return {
      ok: false,
      message:
        "Media files must be at public/media/<folder>/<file>.<ext>, with a lowercase folder name and a file name of letters, digits, _ and -",
    };
  }
  const extension = relative.split(".").pop()?.toLowerCase() ?? "";
  const image = IMAGE_EXTENSIONS[extension];
  if (image !== undefined) return { ok: true, kind: "image", format: image };
  const audio = AUDIO_EXTENSIONS[extension];
  if (audio !== undefined) return { ok: true, kind: "audio", format: audio };
  return {
    ok: false,
    message: `Unsupported file type ".${extension}". Pictures: .${Object.keys(IMAGE_EXTENSIONS).join(", .")}. Sounds: .${Object.keys(AUDIO_EXTENSIONS).join(", .")}`,
  };
}

/** Size problems and warnings for one file. */
export function checkSize(
  kind: MediaKind,
  bytes: number,
): { readonly problem?: string; readonly warning?: string } {
  if (kind === "image") {
    if (bytes > IMAGE_MAX_BYTES) {
      return {
        problem: `image is ${formatMegabytes(bytes)}, over the ${formatMegabytes(IMAGE_MAX_BYTES)} limit`,
      };
    }
    if (bytes > IMAGE_TARGET_BYTES) {
      return {
        warning: `image is ${formatMegabytes(bytes)}, above the ${formatMegabytes(IMAGE_TARGET_BYTES)} optimization target (allowed)`,
      };
    }
    return {};
  }
  return bytes > AUDIO_MAX_BYTES
    ? {
        problem: `sound is ${formatMegabytes(bytes)}, over the ${formatMegabytes(AUDIO_MAX_BYTES)} per-clip limit`,
      }
    : {};
}

/** The image format a file's first bytes show, if any. */
export function imageFormatOf(bytes: Uint8Array): ImageFormat | undefined {
  const ascii = (start: number, end: number) =>
    String.fromCharCode(...bytes.subarray(start, end));
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return "jpeg";
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (png.every((value, index) => bytes[index] === value)) return "png";
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "webp";
  if (ascii(4, 8) === "ftyp") {
    // The major brand, then compatible brands, inside the ftyp box.
    const boxSize = new DataView(bytes.buffer, bytes.byteOffset).getUint32(0);
    const brands: string[] = [ascii(8, 12)];
    for (
      let offset = 16;
      offset + 4 <= Math.min(boxSize, bytes.length);
      offset += 4
    ) {
      brands.push(ascii(offset, offset + 4));
    }
    if (brands.includes("avif") || brands.includes("avis")) return "avif";
  }
  return undefined;
}

export interface AudioStream {
  readonly codecType: string;
  readonly codecName: string | undefined;
  readonly channels: number | undefined;
}

const EXPECTED_AUDIO: Readonly<
  Record<
    AudioFormat,
    { readonly container: string; readonly codecs: readonly string[] }
  >
> = {
  mp3: { container: "mp3", codecs: ["mp3"] },
  m4a: { container: "mov,mp4,m4a,3gp,3g2,mj2", codecs: ["aac"] },
  ogg: { container: "ogg", codecs: ["vorbis", "opus"] },
};

/**
 * The file must be the container and codec its extension says, with exactly
 * one stream: a single mono audio stream (no second track, no cover art).
 */
export function checkAudioStreams(
  format: AudioFormat,
  container: string | undefined,
  streams: readonly AudioStream[],
): string[] {
  const expected = EXPECTED_AUDIO[format];
  if (container !== expected.container) {
    return [
      `file contents are "${container ?? "unknown"}", not the ${format} format its .${format} extension says`,
    ];
  }
  const problems: string[] = [];
  const audio = streams.filter((stream) => stream.codecType === "audio");
  const other = streams.filter((stream) => stream.codecType !== "audio");
  if (audio.length !== 1) {
    problems.push(
      `has ${String(audio.length)} audio streams; exactly 1 is allowed`,
    );
  }
  if (other.length > 0) {
    problems.push(
      `has ${String(other.length)} non-audio stream(s) (${other.map((stream) => stream.codecType).join(", ")}), such as embedded cover art; only one audio stream is allowed`,
    );
  }
  const [stream] = audio;
  if (audio.length === 1 && stream !== undefined) {
    if (!expected.codecs.includes(stream.codecName ?? "")) {
      problems.push(
        `audio codec is "${stream.codecName ?? "unknown"}"; .${format} files must use ${expected.codecs.join(" or ")}`,
      );
    }
    if (stream.channels !== 1) {
      problems.push(
        `has ${String(stream.channels ?? "an unknown number of")} channels; sounds must be mono (1 channel)`,
      );
    }
  }
  return problems;
}

/**
 * Loudness rules. Values are compared exactly as the measuring tool reports
 * them, without rounding again. A missing or non-finite value fails.
 */
export function checkLoudness(measured: {
  readonly integrated: string | undefined;
  readonly truePeak: string | undefined;
}): string[] {
  const problems: string[] = [];
  const integrated = parseMeasurement(measured.integrated);
  if (integrated === undefined) {
    problems.push(
      `integrated loudness could not be measured (got ${measured.integrated ?? "nothing"}); the clip may be silent or shorter than 0.4 s`,
    );
  } else if (integrated < LOUDNESS_MIN_LUFS || integrated > LOUDNESS_MAX_LUFS) {
    problems.push(
      `integrated loudness ${String(integrated)} LUFS is outside the allowed ${String(LOUDNESS_MIN_LUFS)} to ${String(LOUDNESS_MAX_LUFS)} LUFS (target -16 LUFS)`,
    );
  }
  const truePeak = parseMeasurement(measured.truePeak);
  if (truePeak === undefined) {
    problems.push(
      `true peak could not be measured (got ${measured.truePeak ?? "nothing"})`,
    );
  } else if (truePeak > TRUE_PEAK_MAX_DBTP) {
    problems.push(
      `true peak ${String(truePeak)} dBTP is above the ${TRUE_PEAK_MAX_DBTP.toFixed(1)} dBTP limit`,
    );
  }
  return problems;
}

function parseMeasurement(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === "") return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}
