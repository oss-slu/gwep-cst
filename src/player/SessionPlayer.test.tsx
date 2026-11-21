import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Route, Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import type { TestTextSlide } from "../../tests/support/test-slide-fields.ts";
import { testRegistry } from "../../tests/support/test-slides.ts";
import { SESSION_ROUTE } from "../app/paths.ts";
import { ui } from "../app/copy.ts";
import { ContentValidationError } from "../content/errors.ts";
import type { SlideComponent } from "../slides/types.ts";
import { createPlayerData, type PlayableSession } from "./player-data.ts";
import { SessionPlayer } from "./SessionPlayer.tsx";

type Slide = TestTextSlide;

const session: PlayableSession<Slide> = {
  slug: "orientation",
  title: "Fixture session",
  slides: ["one", "two", "three"].map((id) => ({
    type: "test-text" as const,
    id,
    text: `Fixture slide ${id}`,
  })),
};

async function setup(
  path: string,
  {
    loadSession = () => Promise.resolve(session),
    loadComponent = (slide: Slide) => testRegistry.loadComponent(slide),
  }: {
    loadSession?: (slug: string) => Promise<PlayableSession<Slide>>;
    loadComponent?: (slide: Slide) => Promise<SlideComponent<Slide>>;
  } = {},
) {
  const location = memoryLocation({ path, record: true });
  const data = createPlayerData({ loadSession }, { loadComponent });
  // Loading suspends, so rendering and every move happen inside an awaited act().
  await act(async () => {
    render(
      <Router hook={location.hook}>
        <Route path={SESSION_ROUTE}>
          {(params) => (
            <SessionPlayer
              data={data}
              slug={params.slug}
              slideId={params.slideId}
            />
          )}
        </Route>
      </Router>,
    );
    await Promise.resolve();
  });
  return location;
}

const slideArea = (position: string) =>
  screen.getByRole("region", { name: position });
const nextButton = () => screen.getByRole("button", { name: ui.player.next });
const previousButton = () =>
  screen.getByRole("button", { name: ui.player.previous });
const slides = () => document.querySelectorAll("[data-marker]");

async function press(key: string, options: Partial<KeyboardEventInit> = {}) {
  await act(async () => {
    fireEvent.keyDown(document.activeElement ?? document.body, {
      key,
      ...options,
    });
    await Promise.resolve();
  });
}

async function click(element: HTMLElement) {
  await act(async () => {
    fireEvent.click(element);
    await Promise.resolve();
  });
}

describe("session player", () => {
  it("opens the first slide and replaces the address, so Back skips the redirect", async () => {
    const location = await setup("/sessions/orientation");
    expect(await screen.findByText("Fixture slide one")).toBeDefined();
    expect(location.history).toEqual(["/sessions/orientation/one"]);
  });

  it("opens the slide named in the address and focuses the slide area", async () => {
    await setup("/sessions/orientation/two");
    expect(await screen.findByText("Fixture slide two")).toBeDefined();
    expect(document.activeElement).toBe(slideArea("Slide 2 of 3"));
    expect(
      screen.getByRole("heading", { level: 1, name: "Fixture session" }),
    ).toBeDefined();
  });

  it("moves with the buttons, one history entry per slide, keeping focus on the button", async () => {
    const location = await setup("/sessions/orientation/one");
    await screen.findByText("Fixture slide one");
    expect(previousButton()).toHaveProperty("disabled", true);

    nextButton().focus();
    await click(nextButton());

    expect(await screen.findByText("Fixture slide two")).toBeDefined();
    expect(document.activeElement).toBe(nextButton());
    expect(location.history).toEqual([
      "/sessions/orientation/one",
      "/sessions/orientation/two",
    ]);
  });

  it("mounts only the current slide and unmounts the previous one", async () => {
    await setup("/sessions/orientation/one");
    const first = await screen.findByText("Fixture slide one");

    await click(nextButton());
    const second = await screen.findByText("Fixture slide two");

    // Both slides use the same component, so without a fresh mount React
    // would reuse the first element. It must be a new element instead.
    expect(first.isConnected).toBe(false);
    expect(second).not.toBe(first);
    expect(slides()).toHaveLength(1);
  });

  it("moves focus to the slide when the pressed button becomes disabled", async () => {
    await setup("/sessions/orientation/two");
    await screen.findByText("Fixture slide two");

    nextButton().focus();
    await click(nextButton());

    await screen.findByText("Fixture slide three");
    expect(nextButton()).toHaveProperty("disabled", true);
    expect(document.activeElement).toBe(slideArea("Slide 3 of 3"));
  });

  it("moves with the arrow and page keys, leaving focus in place", async () => {
    await setup("/sessions/orientation/one");
    await screen.findByText("Fixture slide one");
    const back = screen.getByRole("link", { name: ui.backToSessions });
    back.focus();

    await press("ArrowRight");
    expect(await screen.findByText("Fixture slide two")).toBeDefined();
    expect(document.activeElement).toBe(back);

    await press("PageDown");
    expect(await screen.findByText("Fixture slide three")).toBeDefined();
    await press("PageUp");
    expect(await screen.findByText("Fixture slide two")).toBeDefined();
    await press("ArrowLeft");
    expect(await screen.findByText("Fixture slide one")).toBeDefined();
    expect(document.activeElement).toBe(back);
  });

  it("moves focus to the slide when a key disables the focused button", async () => {
    await setup("/sessions/orientation/two");
    await screen.findByText("Fixture slide two");
    previousButton().focus();

    await press("ArrowLeft");

    await screen.findByText("Fixture slide one");
    expect(document.activeElement).toBe(slideArea("Slide 1 of 3"));
  });

  it("does nothing past the first or last slide", async () => {
    const location = await setup("/sessions/orientation/one");
    await screen.findByText("Fixture slide one");
    await press("ArrowLeft");
    await press("PageUp");
    expect(location.history).toEqual(["/sessions/orientation/one"]);
  });

  it.each([
    ["with a modifier key", { ctrlKey: true }],
    ["with Shift", { shiftKey: true }],
    ["held down", { repeat: true }],
  ])("ignores keys pressed %s", async (_name, options) => {
    const location = await setup("/sessions/orientation/one");
    await screen.findByText("Fixture slide one");
    await press("ArrowRight", options);
    expect(location.history).toEqual(["/sessions/orientation/one"]);
  });

  it("ignores keys typed into a text field", async () => {
    const location = await setup("/sessions/orientation/one");
    await screen.findByText("Fixture slide one");
    const field = document.createElement("input");
    document.body.append(field);
    try {
      field.focus();
      await press("ArrowRight");
      expect(location.history).toEqual(["/sessions/orientation/one"]);
    } finally {
      field.remove();
    }
  });

  it("explains an unknown slide id and links to the first slide", async () => {
    await setup("/sessions/orientation/nope");
    const heading = await screen.findByRole("heading", {
      name: ui.errors.slideNotFound.heading,
    });
    expect(document.activeElement).toBe(heading);
    expect(
      screen
        .getByRole("link", { name: ui.errors.slideNotFound.firstSlide })
        .getAttribute("href"),
    ).toBe("/sessions/orientation/one");
    expect(
      screen
        .getByRole("link", { name: ui.backToSessions })
        .getAttribute("href"),
    ).toBe("/");
  });

  it("explains invalid content without offering a retry", async () => {
    await setup("/sessions/orientation/one", {
      loadSession: () =>
        Promise.reject(
          new ContentValidationError([
            { file: "orientation.json", path: "number", message: "Bad" },
          ]),
        ),
    });
    const heading = await screen.findByRole("heading", {
      name: ui.errors.invalidContent.heading,
    });
    expect(document.activeElement).toBe(heading);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("recovers from a failed session download with Try again", async () => {
    const loadSession = vi
      .fn<() => Promise<PlayableSession<Slide>>>()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValue(session);
    await setup("/sessions/orientation/one", { loadSession });

    const heading = await screen.findByRole("heading", {
      name: ui.errors.loadFailed.heading,
    });
    expect(document.activeElement).toBe(heading);
    await click(
      screen.getByRole("button", { name: ui.errors.loadFailed.retry }),
    );

    expect(await screen.findByText("Fixture slide one")).toBeDefined();
    expect(loadSession).toHaveBeenCalledTimes(2);
  });

  it("offers Reload page when trying again fails too", async () => {
    await setup("/sessions/orientation/one", {
      loadSession: () => Promise.reject(new TypeError("Failed to fetch")),
    });
    await click(
      await screen.findByRole("button", { name: ui.errors.loadFailed.retry }),
    );
    expect(
      await screen.findByRole("button", { name: ui.errors.loadFailed.reload }),
    ).toBeDefined();
  });

  it("keeps the controls when a slide component fails, and recovers", async () => {
    const loadComponent = vi
      .fn<(slide: Slide) => Promise<SlideComponent<Slide>>>()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockImplementation((slide) => testRegistry.loadComponent(slide));
    await setup("/sessions/orientation/one", { loadComponent });

    const heading = await screen.findByRole("heading", {
      level: 2,
      name: ui.errors.loadFailed.heading,
    });
    expect(slideArea("Slide 1 of 3").contains(heading)).toBe(true);
    expect(document.activeElement).toBe(heading);
    expect(nextButton()).toBeDefined();

    screen.getByRole("button", { name: ui.errors.loadFailed.retry }).focus();
    await click(
      screen.getByRole("button", { name: ui.errors.loadFailed.retry }),
    );
    expect(await screen.findByText("Fixture slide one")).toBeDefined();
    expect(document.activeElement).toBe(slideArea("Slide 1 of 3"));
  });

  it("does not carry a pending retry's focus over to another slide", async () => {
    // Slides one and two share a type, so both wait on the same retried
    // download, which stays pending until the facilitator has moved on.
    let finishRetry: (component: SlideComponent<Slide>) => void = () => {};
    const [first] = session.slides;
    if (first === undefined) throw new Error("The fixture has slides");
    const component = await testRegistry.loadComponent(first);
    const loadComponent = vi
      .fn<(slide: Slide) => Promise<SlideComponent<Slide>>>()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockReturnValueOnce(
        new Promise((resolve) => {
          finishRetry = resolve;
        }),
      );
    await setup("/sessions/orientation/one", { loadComponent });
    await click(
      await screen.findByRole("button", { name: ui.errors.loadFailed.retry }),
    );

    nextButton().focus();
    await click(nextButton());
    await act(async () => {
      finishRetry(component);
      await Promise.resolve();
    });

    expect(await screen.findByText("Fixture slide two")).toBeDefined();
    expect(document.activeElement).toBe(nextButton());
  });
});
