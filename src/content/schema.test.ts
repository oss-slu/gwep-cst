import { describe, expect, it } from "vitest";
import { validSession } from "../../tests/support/session-fixture";
import {
  audioSchema,
  baseSlideSchema,
  imageSchema,
  sessionSchema,
} from "./schema.ts";

function messages(result: {
  success: boolean;
  error?: { issues: { message: string }[] };
}) {
  return result.error?.issues.map((issue) => issue.message) ?? [];
}

describe("sessionSchema", () => {
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
          { type: "title", id: "welcome" },
          { type: "title", id: "welcome" },
        ],
      }),
    );
    expect(result.error?.issues[0]?.path).toEqual(["slides", 1, "id"]);
    expect(messages(result)).toContain(
      'Slide id "welcome" is used more than once',
    );
  });
});

describe("baseSlideSchema", () => {
  it("requires a kebab-case id and type, and allows notes", () => {
    expect(
      baseSlideSchema.safeParse({
        id: "day-1",
        type: "calendar-day",
        notes: "x",
      }).success,
    ).toBe(true);
    expect(
      baseSlideSchema.safeParse({ id: "Day 1", type: "calendar-day" }).success,
    ).toBe(false);
    expect(baseSlideSchema.safeParse({ type: "title" }).success).toBe(false);
  });

  it("lets type-specific fields through until the slide registry exists", () => {
    const result = baseSlideSchema.safeParse({
      id: "welcome",
      type: "title",
      heading: "Hi",
    });
    expect(result.data).toMatchObject({ heading: "Hi" });
  });
});

describe("imageSchema", () => {
  const src = "/media/orientation/landmark-1.webp";

  it("accepts an image with alt text", () => {
    expect(
      imageSchema.safeParse({ src, alt: "A lighthouse on a cliff" }).success,
    ).toBe(true);
  });

  it("requires alt text unless the image is decorative", () => {
    expect(messages(imageSchema.safeParse({ src, alt: " " }))).toEqual([
      "Alt text is required unless the image is marked decorative",
    ]);
    expect(imageSchema.safeParse({ src }).success).toBe(false);
  });

  it("requires empty alt text on a decorative image", () => {
    expect(
      imageSchema.safeParse({ src, alt: "", decorative: true }).success,
    ).toBe(true);
    expect(
      messages(imageSchema.safeParse({ src, alt: "Swirl", decorative: true })),
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
  ])("rejects %s", (_name, path) => {
    expect(imageSchema.safeParse({ src: path, alt: "x" }).success).toBe(false);
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
