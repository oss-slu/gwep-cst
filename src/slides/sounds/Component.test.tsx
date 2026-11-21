import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { StrictMode, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ui } from "../../app/copy.ts";
import { AudioProvider } from "../../media/AudioProvider.tsx";
import type { AudioService, PlaybackEvent } from "../../media/audio-service.ts";
import { soundsSlide } from "./index.ts";
import { soundsFields, type SoundsSlideData } from "./schema.ts";

const Sounds = (await soundsSlide.loadComponent()).default;
const { sound } = ui.slides;

const slide: SoundsSlideData = {
  type: "sounds",
  id: "sounds",
  heading: "Fixture: what can you hear?",
  clips: [
    { sound: { src: "/media/test/one.mp3", description: "Fixture sound one" } },
    { sound: { src: "/media/test/two.mp3", description: "Fixture sound two" } },
  ],
};

/** A fake audio service: records play() and lets the test send events. */
function fakeAudio() {
  const plays: {
    src: string;
    send: (event: PlaybackEvent) => void;
    stopped: boolean;
  }[] = [];
  const service: AudioService = {
    play: (src, onEvent) => {
      const entry = { src, send: onEvent, stopped: false };
      plays.push(entry);
      return {
        stop: () => {
          entry.stopped = true;
        },
      };
    },
    stop: vi.fn(),
    dispose: vi.fn(),
  };
  return { service, plays };
}

// Renders the slide with a fake service by replacing the provider's player.
vi.mock("../../media/AudioProvider.tsx", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../media/AudioProvider.tsx")>();
  return {
    ...actual,
    useAudio: () => currentService ?? actual.useAudio(),
  };
});
let currentService: AudioService | undefined;

function renderWith(service: AudioService | undefined, children: ReactNode) {
  currentService = service;
  return render(children);
}

afterEach(() => {
  currentService = undefined;
  vi.restoreAllMocks();
});

const button = (description: string) =>
  within(
    screen.getByText(description).closest("li") ?? document.body,
  ).getByRole("button");

describe("sounds slide", () => {
  it("shows the heading, each description as text and a Play button, with no audio yet", () => {
    const { service, plays } = fakeAudio();
    renderWith(service, <Sounds slide={slide} />);
    expect(
      screen.getByRole("heading", { level: 2, name: slide.heading }),
    ).toBeDefined();
    const items = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    for (const description of ["Fixture sound one", "Fixture sound two"]) {
      expect(screen.getByText(description)).toBeDefined();
      expect(button(description).getAttribute("aria-describedby")).toBe(
        screen.getByText(description).id,
      );
      expect(screen.getAllByRole("button", { name: sound.play })).toContain(
        button(description),
      );
    }
    expect(plays).toHaveLength(0);
    expect(document.querySelector("audio")).toBeNull();
    // No "A, B, C" labels anywhere on the slide.
    expect(document.body.textContent).not.toMatch(/\b[ABC]\b/);
  });

  it("plays on press, offers Stop while loading and playing, and returns to Play at the end", () => {
    const { service, plays } = fakeAudio();
    renderWith(service, <Sounds slide={slide} />);
    const play = button("Fixture sound one");
    play.focus();
    fireEvent.click(play);

    expect(plays.map((entry) => entry.src)).toEqual(["/media/test/one.mp3"]);
    expect(screen.getByRole("button", { name: sound.stop })).toBe(play);
    expect(screen.getByText(sound.loading)).toBeDefined();

    act(() => {
      plays[0]?.send("playing");
    });
    expect(screen.getByRole("button", { name: sound.stop })).toBe(play);
    expect(screen.queryByText(sound.loading)).toBeNull();

    act(() => {
      plays[0]?.send("ended");
    });
    expect(button("Fixture sound one")).toBe(play);
    expect(play.textContent).toContain(sound.play);
    expect(screen.getAllByRole("button", { name: sound.play })).toHaveLength(2);
    expect(document.activeElement).toBe(play);
  });

  it("Stop works while the clip is still loading", () => {
    const { service, plays } = fakeAudio();
    renderWith(service, <Sounds slide={slide} />);
    fireEvent.click(button("Fixture sound one"));
    fireEvent.click(screen.getByRole("button", { name: sound.stop }));
    expect(plays[0]?.stopped).toBe(true);
    expect(screen.getAllByRole("button", { name: sound.play })).toHaveLength(2);
    expect(screen.queryByText(sound.loading)).toBeNull();
  });

  it("starting another clip shows only that one as playing", () => {
    const { service, plays } = fakeAudio();
    renderWith(service, <Sounds slide={slide} />);
    fireEvent.click(button("Fixture sound one"));
    act(() => {
      plays[0]?.send("playing");
    });
    fireEvent.click(button("Fixture sound two"));
    expect(plays.map((entry) => entry.src)).toEqual([
      "/media/test/one.mp3",
      "/media/test/two.mp3",
    ]);
    expect(screen.getByRole("button", { name: sound.stop })).toBe(
      button("Fixture sound two"),
    );
    expect(screen.getByRole("button", { name: sound.play })).toBe(
      button("Fixture sound one"),
    );
  });

  it("explains a failure and keeps focus on the same button through Try again", () => {
    const { service, plays } = fakeAudio();
    renderWith(service, <Sounds slide={slide} />);
    const control = button("Fixture sound one");
    control.focus();
    fireEvent.click(control);
    act(() => {
      plays[0]?.send("failed");
    });

    expect(screen.getByText(sound.failed)).toBeDefined();
    expect(screen.getByRole("button", { name: sound.retry })).toBe(control);
    expect(document.activeElement).toBe(control);

    fireEvent.click(control);
    expect(plays).toHaveLength(2);
    act(() => {
      plays[1]?.send("playing");
    });
    expect(screen.queryByText(sound.failed)).toBeNull();
    expect(screen.getByRole("button", { name: sound.stop })).toBe(control);
    expect(document.activeElement).toBe(control);
  });

  it("stops its clip when the slide unmounts", () => {
    const { service, plays } = fakeAudio();
    const { unmount } = renderWith(service, <Sounds slide={slide} />);
    fireEvent.click(button("Fixture sound one"));
    unmount();
    expect(plays[0]?.stopped).toBe(true);
  });

  it.each(["ended", "failed"] as const)(
    "after a clip has %s, holds no handle, so unmounting has nothing to stop",
    (terminal) => {
      const { service, plays } = fakeAudio();
      const { unmount } = renderWith(service, <Sounds slide={slide} />);
      fireEvent.click(button("Fixture sound one"));
      act(() => {
        plays[0]?.send("playing");
        plays[0]?.send(terminal);
      });
      unmount();
      expect(plays[0]?.stopped).toBe(false);
    },
  );

  it("renders supplied text as text, never as markup", () => {
    const { service } = fakeAudio();
    renderWith(
      service,
      <Sounds
        slide={{
          ...slide,
          heading: "<b>bold</b>",
          clips: [
            {
              sound: {
                src: "/media/test/one.mp3",
                description: "<script>x()</script>",
              },
            },
          ],
        }}
      />,
    );
    expect(document.querySelector("b, script")).toBeNull();
    expect(screen.getByText("<script>x()</script>")).toBeDefined();
  });
});

describe("sounds slide with the real audio player in Strict Mode", () => {
  it("plays after Strict Mode's extra effect cycle and releases on unmount", () => {
    const play = vi
      .spyOn(HTMLMediaElement.prototype, "play")
      .mockResolvedValue(undefined);
    const pause = vi
      .spyOn(HTMLMediaElement.prototype, "pause")
      .mockImplementation(() => undefined);
    vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(
      () => undefined,
    );
    const { unmount } = renderWith(
      undefined,
      <StrictMode>
        <AudioProvider>
          <Sounds slide={slide} />
        </AudioProvider>
      </StrictMode>,
    );
    fireEvent.click(button("Fixture sound one"));
    expect(play).toHaveBeenCalledTimes(1);
    const element = play.mock.contexts[0] as HTMLAudioElement;
    expect(element.getAttribute("src")).toBe("/media/test/one.mp3");
    expect(screen.getByRole("button", { name: sound.stop })).toBeDefined();

    unmount();
    expect(pause).toHaveBeenCalled();
    expect(element.hasAttribute("src")).toBe(false);
  });
});

describe("sounds schema", () => {
  const schema = z.strictObject(soundsFields);
  const clip = (index: number) => ({
    sound: {
      src: `/media/test/${String(index)}.mp3`,
      description: `Sound ${String(index)}`,
    },
  });
  const clips = (count: number) =>
    Array.from({ length: count }, (_, index) => clip(index));

  it("accepts 1 to 6 clips", () => {
    expect(schema.safeParse({ heading: "Q", clips: clips(1) }).success).toBe(
      true,
    );
    expect(schema.safeParse({ heading: "Q", clips: clips(6) }).success).toBe(
      true,
    );
  });

  it.each([
    [clips(0), "A sounds slide needs at least 1 clip"],
    [clips(7), "A sounds slide can have at most 6 clips"],
    [
      [{ sound: { src: "/media/test/a.mp3", description: " " } }],
      "Audio description must not be empty",
    ],
    [
      [{ sound: { src: "https://cdn.example.com/a.mp3", description: "x" } }],
      "Audio path must look like /media/<folder>/<file> and end in .mp3, .m4a, .ogg",
    ],
    [
      [{ sound: { src: "/media/test/a.wav", description: "x" } }],
      "Audio path must look like /media/<folder>/<file> and end in .mp3, .m4a, .ogg",
    ],
    [[{ ...clip(0), label: "A" }], 'Unrecognized key: "label"'],
  ])("rejects %j", (value, message) => {
    const result = schema.safeParse({ heading: "Q", clips: value });
    expect(result.error?.issues.map((issue) => issue.message)).toContain(
      message,
    );
  });
});
