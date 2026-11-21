// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  AUDIO_MAX_BYTES,
  IMAGE_MAX_BYTES,
  IMAGE_MAX_PIXELS,
  IMAGE_TARGET_BYTES,
  checkAudioStreams,
  checkLoudness,
  checkPixels,
  checkSize,
  classifyPath,
  imageDimensions,
  imageFormatOf,
} from "../../scripts/media/rules.ts";

describe("loudness limits: -17.0 to -15.0 LUFS inclusive, true peak at most -1.0 dBTP", () => {
  const ok = { integrated: "-16.00", truePeak: "-3.00" };

  it.each(["-17.00", "-17", "-16.00", "-15.00", "-15"])(
    "accepts %s LUFS",
    (integrated) => {
      expect(checkLoudness({ ...ok, integrated })).toEqual([]);
    },
  );

  it.each([
    [
      "-17.01",
      "integrated loudness -17.01 LUFS is outside the allowed -17 to -15 LUFS (target -16 LUFS)",
    ],
    [
      "-14.99",
      "integrated loudness -14.99 LUFS is outside the allowed -17 to -15 LUFS (target -16 LUFS)",
    ],
  ])("rejects %s LUFS, just outside the range", (integrated, message) => {
    expect(checkLoudness({ ...ok, integrated })).toEqual([message]);
  });

  it.each(["-1.00", "-1", "-20.00"])(
    "accepts a true peak of %s dBTP",
    (truePeak) => {
      expect(checkLoudness({ ...ok, truePeak })).toEqual([]);
    },
  );

  it("rejects -0.99 dBTP, just above the limit", () => {
    expect(checkLoudness({ ...ok, truePeak: "-0.99" })).toEqual([
      "true peak -0.99 dBTP is above the -1.0 dBTP limit",
    ]);
  });

  it.each([["-inf"], ["inf"], ["nan"], [""], [undefined]])(
    "fails when a measurement is missing or not finite (%j)",
    (value) => {
      const problems = checkLoudness({ integrated: value, truePeak: value });
      expect(problems).toHaveLength(2);
      expect(problems[0]).toMatch(/^integrated loudness could not be measured/);
      expect(problems[1]).toMatch(/^true peak could not be measured/);
    },
  );
});

describe("size limits (decimal: 1 MB = 1,000,000 bytes)", () => {
  it("allows images up to 2,000,000 bytes and rejects one byte more", () => {
    expect(checkSize("image", IMAGE_MAX_BYTES).problem).toBeUndefined();
    expect(checkSize("image", IMAGE_MAX_BYTES + 1).problem).toBe(
      "image is 2000001 bytes (2.00 MB), over the 2000000 bytes (2.00 MB) limit",
    );
  });

  it("warns, but passes, above the 500,000-byte target, so a 700 KB image passes", () => {
    expect(checkSize("image", IMAGE_TARGET_BYTES)).toEqual({});
    expect(checkSize("image", IMAGE_TARGET_BYTES + 1).problem).toBeUndefined();
    const result = checkSize("image", 700_000);
    expect(result.problem).toBeUndefined();
    expect(result.warning).toBe(
      "image is 700000 bytes (0.70 MB), above the 500000 bytes (0.50 MB) optimization target (allowed)",
    );
  });

  it("allows sounds up to 5,000,000 bytes and rejects one byte more", () => {
    expect(checkSize("audio", AUDIO_MAX_BYTES)).toEqual({});
    expect(checkSize("audio", AUDIO_MAX_BYTES + 1).problem).toBe(
      "sound is 5000001 bytes (5.00 MB), over the 5000000 bytes (5.00 MB) per-clip limit",
    );
  });
});

describe("file paths and types", () => {
  it.each([
    ["orientation/landmark-1.jpg", "image", "jpeg"],
    ["orientation/landmark-1.JPEG", "image", "jpeg"],
    ["orientation/a.png", "image", "png"],
    ["orientation/a.webp", "image", "webp"],
    ["orientation/a.avif", "image", "avif"],
    ["orientation/birds.mp3", "audio", "mp3"],
    ["orientation/birds.m4a", "audio", "m4a"],
    ["orientation/birds.ogg", "audio", "ogg"],
  ])("accepts %s", (path, kind, format) => {
    expect(classifyPath(path)).toEqual({ ok: true, kind, format });
  });

  it.each([
    "orientation/a.gif",
    "orientation/a.wav",
    "orientation/notes.txt",
    "orientation/a.svg",
  ])("rejects the unsupported type %s", (path) => {
    const result = classifyPath(path);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.message).toMatch(/^Unsupported file type/);
  });

  it.each([
    "orientation/.DS_Store",
    "a.jpg",
    "orientation/deeper/a.jpg",
    "Orientation/a.jpg",
    "orientation/a b.jpg",
    "orientation/a,b.jpg",
  ])("rejects the path %s", (path) => {
    const result = classifyPath(path);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.message).toMatch(
      /^Media files must be at public\/media/,
    );
  });
});

describe("image signatures", () => {
  const bytes = (...values: (number | string)[]) =>
    new Uint8Array(
      values.flatMap((value) =>
        typeof value === "string"
          ? Array.from(new TextEncoder().encode(value))
          : [value],
      ),
    );

  it("recognizes each supported format", () => {
    expect(imageFormatOf(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("jpeg");
    expect(imageFormatOf(bytes(0x89, "PNG", 0x0d, 0x0a, 0x1a, 0x0a))).toBe(
      "png",
    );
    expect(imageFormatOf(bytes("RIFF", 0, 0, 0, 0, "WEBP"))).toBe("webp");
    expect(
      imageFormatOf(bytes(0, 0, 0, 0x14, "ftypavif", 0, 0, 0, 0, "mif1")),
    ).toBe("avif");
    expect(
      imageFormatOf(bytes(0, 0, 0, 0x18, "ftypmif1", 0, 0, 0, 0, "mif1avif")),
    ).toBe("avif");
  });

  it("recognizes nothing else", () => {
    expect(imageFormatOf(bytes("GIF89a"))).toBeUndefined();
    expect(
      imageFormatOf(bytes(0, 0, 0, 0x14, "ftypisom", 0, 0, 0, 0, "mp41")),
    ).toBeUndefined();
    expect(imageFormatOf(bytes("ID3"))).toBeUndefined();
    expect(imageFormatOf(new Uint8Array())).toBeUndefined();
  });
});

describe("audio streams", () => {
  const mono = { codecType: "audio", codecName: "mp3", channels: 1 };

  it("accepts one mono stream in the format its extension says", () => {
    expect(checkAudioStreams("mp3", "mp3", [mono])).toEqual([]);
    expect(
      checkAudioStreams("m4a", "mov,mp4,m4a,3gp,3g2,mj2", [
        { ...mono, codecName: "aac" },
      ]),
    ).toEqual([]);
    expect(
      checkAudioStreams("ogg", "ogg", [{ ...mono, codecName: "opus" }]),
    ).toEqual([]);
    expect(
      checkAudioStreams("ogg", "ogg", [{ ...mono, codecName: "vorbis" }]),
    ).toEqual([]);
  });

  it("rejects contents that do not match the extension", () => {
    expect(checkAudioStreams("ogg", "mp3", [mono])).toEqual([
      'file contents are "mp3", not the ogg format its .ogg extension says',
    ]);
    expect(checkAudioStreams("m4a", "mov,mp4,m4a,3gp,3g2,mj2", [mono])).toEqual(
      ['audio codec is "mp3"; .m4a files must use aac'],
    );
  });

  it("rejects stereo, a second audio stream and embedded cover art", () => {
    expect(checkAudioStreams("mp3", "mp3", [{ ...mono, channels: 2 }])).toEqual(
      ["has 2 channels; sounds must be mono (1 channel)"],
    );
    expect(checkAudioStreams("mp3", "mp3", [mono, mono])).toEqual([
      "has 2 audio streams; exactly 1 is allowed",
    ]);
    expect(
      checkAudioStreams("mp3", "mp3", [
        mono,
        { codecType: "video", codecName: "mjpeg", channels: undefined },
      ]),
    ).toEqual([
      "has 1 non-audio stream(s) (video), such as embedded cover art; only one audio stream is allowed",
    ]);
    expect(checkAudioStreams("mp3", "mp3", [])).toEqual([
      "has 0 audio streams; exactly 1 is allowed",
    ]);
  });
});

describe("picture size in pixels, read from the header before decoding", () => {
  const u32 = (value: number) => [
    value >>> 24,
    (value >>> 16) & 255,
    (value >>> 8) & 255,
    value & 255,
  ];
  const u16 = (value: number) => [value >>> 8, value & 255];
  const le16 = (value: number) => [value & 255, value >>> 8];
  const le24 = (value: number) => [
    value & 255,
    (value >>> 8) & 255,
    value >>> 16,
  ];
  const ascii = (text: string) => Array.from(new TextEncoder().encode(text));
  const bytes = (...parts: number[][]) => new Uint8Array(parts.flat());

  it("reads PNG, JPEG, WebP and AVIF headers", () => {
    const png = bytes(
      [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
      u32(13),
      ascii("IHDR"),
      u32(5000),
      u32(4000),
    );
    expect(imageDimensions(png, "png")).toEqual({ width: 5000, height: 4000 });

    // SOI, an APP0 segment to skip, then SOF0 with height then width.
    const jpeg = bytes(
      [0xff, 0xd8],
      [0xff, 0xe0],
      u16(4),
      [0, 0],
      [0xff, 0xc0],
      u16(11),
      [8],
      u16(480),
      u16(640),
      [1, 1, 0x11, 0],
    );
    expect(imageDimensions(jpeg, "jpeg")).toEqual({ width: 640, height: 480 });

    const riff = (chunk: string, body: number[]) =>
      bytes(ascii("RIFF"), u32(0), ascii("WEBP"), ascii(chunk), u32(0), body);
    expect(
      imageDimensions(
        riff("VP8X", [0, 0, 0, 0, ...le24(4999), ...le24(3999)]),
        "webp",
      ),
    ).toEqual({ width: 5000, height: 4000 });
    const vp8l = (4999 & 0x3fff) | ((3999 & 0x3fff) << 14);
    expect(
      imageDimensions(
        riff("VP8L", [
          0x2f,
          vp8l & 255,
          (vp8l >>> 8) & 255,
          (vp8l >>> 16) & 255,
          vp8l >>> 24,
        ]),
        "webp",
      ),
    ).toEqual({ width: 5000, height: 4000 });
    expect(
      imageDimensions(
        riff("VP8 ", [0, 0, 0, 0x9d, 0x01, 0x2a, ...le16(640), ...le16(480)]),
        "webp",
      ),
    ).toEqual({ width: 640, height: 480 });

    // Two ispe properties (say a thumbnail and the main image): the largest counts.
    const ispe = (width: number, height: number) => [
      ...u32(20),
      ...ascii("ispe"),
      0,
      0,
      0,
      0,
      ...u32(width),
      ...u32(height),
    ];
    const avif = bytes(
      u32(20),
      ascii("ftypavif"),
      u32(0),
      ascii("mif1"),
      ispe(64, 48),
      ispe(5000, 4000),
    );
    expect(imageDimensions(avif, "avif")).toEqual({
      width: 5000,
      height: 4000,
    });
  });

  it("returns nothing when the header is cut short", () => {
    expect(
      imageDimensions(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), "png"),
    ).toBeUndefined();
    expect(
      imageDimensions(new Uint8Array([0xff, 0xd8, 0xff, 0xda]), "jpeg"),
    ).toBeUndefined();
    expect(
      imageDimensions(
        bytes(ascii("RIFF"), u32(0), ascii("WEBP"), ascii("ALPH")),
        "webp",
      ),
    ).toBeUndefined();
    expect(
      imageDimensions(bytes(u32(20), ascii("ftypavif")), "avif"),
    ).toBeUndefined();
  });

  it("allows up to 16,000,000 pixels and rejects one row more", () => {
    expect(IMAGE_MAX_PIXELS).toBe(16_000_000);
    expect(checkPixels({ width: 4000, height: 4000 })).toBeUndefined();
    expect(checkPixels({ width: 4000, height: 4001 })).toBe(
      "image is 4000 x 4001 = 16004000 pixels, over the 16000000-pixel limit",
    );
  });

  it("fails when the size cannot be read", () => {
    expect(checkPixels(undefined)).toBe(
      "image size could not be read from its header",
    );
    expect(checkPixels({ width: 0, height: 10 })).toBe(
      "image size could not be read from its header",
    );
  });
});
