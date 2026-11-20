import { describe, expect, it, vi } from "vitest";
import { validSession } from "../../tests/support/session-fixture";
import { testSessionSchema } from "../../tests/support/test-slides";
import {
  AppError,
  ContentValidationError,
  SessionNotFoundError,
} from "./errors.ts";
import { StaticContentSource } from "./static-content-source.ts";

function sourceWith(sessions: Record<string, unknown>) {
  const loaders = Object.fromEntries(
    Object.entries(sessions).map(([slug, data]) => [
      `/content/sessions/${slug}.json`,
      vi.fn(() => Promise.resolve(data)),
    ]),
  );
  return {
    source: new StaticContentSource({ loaders, schema: testSessionSchema }),
    loaders,
  };
}

describe("StaticContentSource", () => {
  it("loads and validates only the requested session", async () => {
    const { source, loaders } = sourceWith({
      orientation: validSession(),
      childhood: validSession({ slug: "childhood", number: 1 }),
    });

    const session = await source.loadSession("orientation");

    expect(session.title).toBe("Fixture: Orientation");
    expect(loaders["/content/sessions/orientation.json"]).toHaveBeenCalledTimes(
      1,
    );
    expect(loaders["/content/sessions/childhood.json"]).not.toHaveBeenCalled();
  });

  it("rejects an unknown session without loading anything", async () => {
    const { source, loaders } = sourceWith({ orientation: validSession() });

    const error = await source
      .loadSession("art")
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(SessionNotFoundError);
    expect(error).toBeInstanceOf(AppError);
    expect(
      loaders["/content/sessions/orientation.json"],
    ).not.toHaveBeenCalled();
  });

  it.each(["../orientation", "orientation.json", "Orientation", ""])(
    "treats %j as not found rather than a path",
    async (slug) => {
      const { source } = sourceWith({ orientation: validSession() });
      await expect(source.loadSession(slug)).rejects.toBeInstanceOf(
        SessionNotFoundError,
      );
    },
  );

  it("rejects invalid content with the file and field", async () => {
    const { source } = sourceWith({
      orientation: validSession({ number: 99 }),
    });

    const error = await source
      .loadSession("orientation")
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ContentValidationError);
    expect((error as ContentValidationError).problems[0]).toMatchObject({
      file: "/content/sessions/orientation.json",
      path: "number",
    });
  });

  it("rejects a file whose slug does not match its name", async () => {
    const { source } = sourceWith({
      orientation: validSession({ slug: "childhood" }),
    });
    await expect(source.loadSession("orientation")).rejects.toThrow(
      'slug: Slug "childhood" must match the file name "orientation"',
    );
  });

  it.each([
    [
      "an unregistered slide type",
      { type: "calendar-day", id: "day" },
      'slides[0].type: Unknown slide type "calendar-day". Registered types: test-text, test-media',
    ],
    [
      "an unknown slide field",
      { type: "test-text", id: "welcome", text: "Hi", colour: "red" },
      'slides[0]: Unrecognized key: "colour"',
    ],
    [
      "invalid image metadata",
      {
        type: "test-media",
        id: "photo",
        image: { src: "https://cdn.example.com/a.jpg", alt: "" },
        sound: { src: "/media/orientation/a.mp3", description: "Birds" },
      },
      "slides[0].image.src: Image path must look like /media/<folder>/<file>",
    ],
  ])(
    "rejects a session with %s when it loads",
    async (_name, slide, message) => {
      const { source } = sourceWith({
        orientation: validSession({ slides: [slide] }),
      });
      await expect(source.loadSession("orientation")).rejects.toThrow(message);
    },
  );

  it("passes through a failed download", async () => {
    const source = new StaticContentSource({
      loaders: {
        "/content/sessions/orientation.json": () =>
          Promise.reject(new Error("network down")),
      },
      schema: testSessionSchema,
    });
    await expect(source.loadSession("orientation")).rejects.toThrow(
      "network down",
    );
  });
});
