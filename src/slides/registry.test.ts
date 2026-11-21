import { describe, expect, it } from "vitest";
import { z } from "zod";
import { validSession } from "../../tests/support/session-fixture";
import {
  testMediaSlide,
  testRegistry,
  testSessionSchema,
  testTextSlide,
} from "../../tests/support/test-slides";
import { sessionSchema } from "../content/session-schema.ts";
import { createSlideRegistry, slideRegistry } from "./registry.ts";
import type { AnySlideModule } from "./types.ts";

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
      {
        image: {
          src: "https://cdn.example.com/a.jpg",
          alt: "Photo",
          width: 4,
          height: 3,
        },
      },
      "slides.0.image.src",
    ],
    [
      "missing alt text",
      {
        image: {
          src: "/media/orientation/a.jpg",
          alt: "",
          width: 4,
          height: 3,
        },
      },
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
    expect(problems(result)[0]?.startsWith(`${path}: `)).toBe(true);
  });

  // A plain object with a loose schema whose type differs from the module's.
  const handBuilt = {
    type: "test-text",
    label: "Hand-built",
    schema: z.looseObject({
      id: z.string(),
      type: z.literal("something-else"),
    }),
    cmsFields: [],
    loadComponent: () => Promise.resolve({ default: () => null }),
  };

  it("does not compile with a module that was not made by defineSlide()", () => {
    const attempt = () =>
      // @ts-expect-error registry entries must come from defineSlide()
      createSlideRegistry([handBuilt]);
    expect(attempt).toBeTypeOf("function");
  });

  it("throws for a hand-built module forced through with a cast", () => {
    expect(() =>
      createSlideRegistry([handBuilt as unknown as AnySlideModule]),
    ).toThrow(
      'Slide type "test-text" was not created with defineSlide(); register only defined slide modules',
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
      image: {
        src: "/media/orientation/a.jpg",
        alt: "A photo",
        width: 4,
        height: 3,
      },
      sound: { src: "/media/orientation/a.mp3", description: "Birds" },
    });
    expect((await testMediaSlide.loadComponent()).default).toBe(Component);
  });
});

describe("the production registry", () => {
  it("registers the production slide types", () => {
    expect(slideRegistry.modules.map((module) => module.type)).toEqual([
      "title",
      "calendar-day",
      "calendar-month",
      "calendar-year",
      "weather",
      "reveal",
      "sounds",
    ]);
  });

  it("accepts registered slides and rejects unregistered ones", () => {
    const session = (slides: unknown[]) =>
      sessionSchema.safeParse(validSession({ slides }));
    expect(
      session([
        { type: "title", id: "welcome", heading: "Welcome" },
        { type: "calendar-day", id: "day" },
      ]).success,
    ).toBe(true);
    expect(problems(session([{ type: "quiz", id: "quiz" }]))).toEqual([
      'slides.0.type: Unknown slide type "quiz". Registered types: title, calendar-day, calendar-month, calendar-year, weather, reveal, sounds',
    ]);
  });

  it("points at the field when registered slide data is invalid", () => {
    expect(
      problems(
        sessionSchema.safeParse(
          validSession({
            slides: [{ type: "title", id: "welcome", heading: "" }],
          }),
        ),
      ),
    ).toEqual(["slides.0.heading: Heading must not be empty"]);
  });
});
