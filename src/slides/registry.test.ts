import { describe, expect, it } from "vitest";
import { validSession } from "../../tests/support/session-fixture";
import {
  testMediaSlide,
  testRegistry,
  testSessionSchema,
  testTextSlide,
} from "../../tests/support/test-slides";
import { sessionSchema } from "../content/session-schema.ts";
import { createSlideRegistry, slideRegistry } from "./registry.ts";

function problems(result: {
  error?: { issues: { path: PropertyKey[]; message: string }[] };
}) {
  return (result.error?.issues ?? []).map(
    (issue) => `${issue.path.map(String).join(".")}: ${issue.message}`,
  );
}

describe("createSlideRegistry", () => {
  it("accepts slides of registered types", () => {
    expect(testSessionSchema.safeParse(validSession()).success).toBe(true);
  });

  it("rejects an unregistered type instead of falling back to base fields", () => {
    const result = testSessionSchema.safeParse(
      validSession({ slides: [{ type: "calendar-day", id: "day" }] }),
    );
    expect(problems(result)).toEqual([
      'slides.0.type: Unknown slide type "calendar-day". Registered types: test-text, test-media',
    ]);
  });

  it("rejects a slide with no type", () => {
    const result = testSessionSchema.safeParse(
      validSession({ slides: [{ id: "day" }] }),
    );
    expect(problems(result)[0]).toMatch(/^slides\.0\.type: /);
  });

  it("rejects unknown fields on every registered type", () => {
    const base = validSession().slides as Record<string, unknown>[];
    for (const slide of base) {
      const result = testSessionSchema.safeParse(
        validSession({ slides: [{ ...slide, unexpected: true }] }),
      );
      expect(problems(result)).toEqual([
        'slides.0: Unrecognized key: "unexpected"',
      ]);
    }
  });

  it.each([
    [
      "an external image",
      { image: { src: "https://cdn.example.com/a.jpg", alt: "Photo" } },
      "slides.0.image.src",
    ],
    [
      "missing alt text",
      { image: { src: "/media/orientation/a.jpg", alt: "" } },
      "slides.0.image.alt",
    ],
    [
      "a missing sound description",
      { sound: { src: "/media/orientation/a.mp3", description: "" } },
      "slides.0.sound.description",
    ],
  ])("rejects %s and points at the field", (_name, change, path) => {
    const media = (validSession().slides as Record<string, unknown>[])[1];
    const result = testSessionSchema.safeParse(
      validSession({ slides: [{ ...media, ...change }] }),
    );
    expect(problems(result)[0]).toMatch(
      new RegExp(`^${path.replace(/\./g, "\\.")}: `),
    );
  });

  it("throws when a slide type is registered twice", () => {
    expect(() => createSlideRegistry([testTextSlide, testTextSlide])).toThrow(
      'Slide type "test-text" is registered more than once',
    );
  });

  it("loads a component only when asked, for that slide's type", async () => {
    const Component = await testRegistry.loadComponent({
      type: "test-media",
      id: "photo",
      image: { src: "/media/orientation/a.jpg", alt: "A photo" },
      sound: { src: "/media/orientation/a.mp3", description: "Birds" },
    });
    expect((await testMediaSlide.loadComponent()).default).toBe(Component);
  });
});

describe("the production registry", () => {
  it("has no slide types yet, so every slide is rejected (provisional until #8)", () => {
    expect(slideRegistry.modules).toEqual([]);
    const result = sessionSchema.safeParse(
      validSession({
        slides: [{ type: "test-text", id: "welcome", text: "Hi" }],
      }),
    );
    expect(problems(result)).toEqual([
      'slides.0.type: Unknown slide type "test-text". Registered types: none yet',
    ]);
  });
});
