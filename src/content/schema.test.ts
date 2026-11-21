import { describe, expect, it } from "vitest";
import { validSession } from "../../tests/support/session-fixture";
import { testSessionSchema as sessionSchema } from "../../tests/support/test-slides";
import { audioSchema, imageSchema } from "./schema.ts";

function messages(result: {
  success: boolean;
  error?: { issues: { message: string }[] };
}) {
  return result.error?.issues.map((issue) => issue.message) ?? [];
}

describe("createSessionSchema (with the test slide types)", () => {
  it("accepts a valid session", () => {
    expect(sessionSchema.safeParse(validSession()).success).toBe(true);
  });

  it.each([
    ["slug", { slug: "Orientation Session" }],
    ["number below 1", { number: 0 }],
    ["number above 14", { number: 15 }],
    ["non-integer number", { number: 9.5 }],
    ["empty title", { title: "   " }],
    ["no slides", { slides: [] }],
  ])("rejects an invalid %s", (_name, overrides) => {
    expect(sessionSchema.safeParse(validSession(overrides)).success).toBe(
      false,
    );
  });

  it.each(["slug", "number", "title", "slides"])(
    "rejects a session missing %s",
    (field) => {
      const session = Object.fromEntries(
        Object.entries(validSession()).filter(([key]) => key !== field),
      );
      expect(sessionSchema.safeParse(session).success).toBe(false);
    },
  );

  it("rejects unknown top-level fields, so typos are caught", () => {
    const result = sessionSchema.safeParse(validSession({ titel: "typo" }));
    expect(messages(result).join()).toMatch(/titel/);
  });

  it("rejects duplicate slide ids and points at the duplicate", () => {
    const result = sessionSchema.safeParse(
      validSession({
        slides: [
          { type: "test-text", id: "welcome", text: "One" },
          { type: "test-text", id: "welcome", text: "Two" },
        ],
      }),
    );
    expect(result.error?.issues[0]?.path).toEqual(["slides", 1, "id"]);
    expect(messages(result)).toContain(
      'Slide id "welcome" is used more than once',
    );
  });
});

describe("imageSchema", () => {
  const src = "/media/orientation/landmark-1.webp";
  const size = { width: 1600, height: 1200 };

  it("accepts an image with alt text", () => {
    expect(
      imageSchema.safeParse({ src, alt: "A lighthouse on a cliff", ...size })
        .success,
    ).toBe(true);
  });

  it("requires alt text unless the image is decorative", () => {
    expect(messages(imageSchema.safeParse({ src, alt: " ", ...size }))).toEqual(
      ["Alt text is required unless the image is marked decorative"],
    );
    expect(imageSchema.safeParse({ src, ...size }).success).toBe(false);
  });

  it("requires empty alt text on a decorative image", () => {
    expect(
      imageSchema.safeParse({ src, alt: "", decorative: true, ...size })
        .success,
    ).toBe(true);
    expect(
      messages(
        imageSchema.safeParse({ src, alt: "Swirl", decorative: true, ...size }),
      ),
    ).toEqual(["A decorative image must have empty alt text"]);
  });

  it.each([
    ["an external URL", "https://cdn.example.com/a.jpg"],
    ["a protocol-relative URL", "//cdn.example.com/a.jpg"],
    ["a parent-folder path", "/media/orientation/../secret.jpg"],
    ["a path outside /media", "/assets/a.jpg"],
    ["an unsupported type", "/media/orientation/a.gif"],
    ["a script file", "/media/orientation/a.js"],
    ["a missing folder", "/media/a.jpg"],
    [
      "a comma, which could add srcset entries",
      "/media/orientation/a.jpg,/x.jpg",
    ],
    ["a space", "/media/orientation/a b.jpg"],
  ])("rejects %s", (_name, path) => {
    expect(
      imageSchema.safeParse({ src: path, alt: "x", ...size }).success,
    ).toBe(false);
    expect(
      imageSchema.safeParse({
        src,
        alt: "x",
        ...size,
        variants: [{ src: path, width: 800 }],
      }).success,
    ).toBe(false);
  });

  it("requires a positive whole-number width and height", () => {
    expect(
      messages(
        imageSchema.safeParse({ src, alt: "x", width: 0, height: 10.5 }),
      ),
    ).toEqual([
      "Image width must be more than 0",
      "Image height must be a whole number of pixels",
    ]);
    expect(imageSchema.safeParse({ src, alt: "x", width: 10 }).success).toBe(
      false,
    );
  });

  it("accepts variants with unique positive widths", () => {
    expect(
      imageSchema.safeParse({
        src,
        alt: "x",
        ...size,
        variants: [
          { src: "/media/orientation/landmark-1-800.webp", width: 800 },
          { src: "/media/orientation/landmark-1-400.webp", width: 400 },
        ],
      }).success,
    ).toBe(true);
  });

  it("rejects a repeated or invalid variant width, reporting each one", () => {
    const result = imageSchema.safeParse({
      src,
      alt: "x",
      ...size,
      variants: [
        { src: "/media/orientation/a-800.webp", width: 800 },
        { src: "/media/orientation/b-800.webp", width: 800 },
        { src: "/media/orientation/c.webp", width: 1600 },
        { src: "/media/orientation/d.webp", width: -1 },
      ],
    });
    expect(
      result.error?.issues.map(
        (issue) => `${issue.path.join(".")}: ${issue.message}`,
      ),
    ).toEqual([
      "variants.3.width: Variant width must be more than 0",
      "variants.1.width: Width 800 is already used by this image or another variant",
      "variants.2.width: Width 1600 is already used by this image or another variant",
    ]);
  });
});

describe("audioSchema", () => {
  it("requires a text description for every sound", () => {
    const src = "/media/orientation/birdsong.mp3";
    expect(
      audioSchema.safeParse({ src, description: "Birds singing" }).success,
    ).toBe(true);
    expect(messages(audioSchema.safeParse({ src, description: "" }))).toEqual([
      "Audio description must not be empty",
    ]);
    expect(audioSchema.safeParse({ src }).success).toBe(false);
  });

  it("accepts only approved audio types", () => {
    expect(
      audioSchema.safeParse({ src: "/media/x/a.wav", description: "d" })
        .success,
    ).toBe(false);
  });
});
