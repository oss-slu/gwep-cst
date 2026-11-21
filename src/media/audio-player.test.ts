import { describe, expect, it, vi } from "vitest";
import { AudioPlayer } from "./audio-player.ts";
import type { PlaybackEvent } from "./audio-service.ts";

/** A stand-in audio element that records listeners and lets tests fire events. */
class FakeAudio {
  src = "";
  preload = "";
  readonly listeners = new Map<string, Set<() => void>>();
  readonly calls: string[] = [];
  #settle: { resolve: () => void; reject: (error: Error) => void } | undefined;

  addEventListener(type: string, handler: () => void) {
    const set = this.listeners.get(type) ?? new Set();
    set.add(handler);
    this.listeners.set(type, set);
  }
  removeEventListener(type: string, handler: () => void) {
    this.listeners.get(type)?.delete(handler);
  }
  play() {
    this.calls.push(`play ${this.src}`);
    return new Promise<void>((resolve, reject) => {
      this.#settle = { resolve, reject };
    });
  }
  pause() {
    this.calls.push("pause");
  }
  removeAttribute(name: string) {
    if (name === "src") this.src = "";
    this.calls.push(`remove ${name}`);
  }
  load() {
    this.calls.push("load");
  }
  fire(type: string) {
    for (const handler of [...(this.listeners.get(type) ?? [])]) handler();
  }
  resolvePlay() {
    this.#settle?.resolve();
  }
  rejectPlay() {
    this.#settle?.reject(new Error("NotAllowedError"));
  }
  get listenerCount() {
    return [...this.listeners.values()].reduce((sum, set) => sum + set.size, 0);
  }
  get released() {
    return (
      this.src === "" &&
      this.calls.includes("pause") &&
      this.calls.at(-1) === "load"
    );
  }
}

function setup() {
  const elements: FakeAudio[] = [];
  const player = new AudioPlayer(() => {
    const element = new FakeAudio();
    elements.push(element);
    return element as unknown as HTMLAudioElement;
  });
  const events = (name: string) => {
    const seen: PlaybackEvent[] = [];
    return { seen, onEvent: (event: PlaybackEvent) => seen.push(event), name };
  };
  return { player, elements, events };
}

/** Lets promise callbacks run. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("AudioPlayer", () => {
  it("creates no audio element until play() is called", () => {
    const { elements } = setup();
    expect(elements).toHaveLength(0);
  });

  it("plays one clip and reports when it starts and ends, then releases it", async () => {
    const { player, elements, events } = setup();
    const a = events("a");
    player.play("/media/test/a.mp3", a.onEvent);
    const [element] = elements;
    expect(element?.calls).toEqual(["play /media/test/a.mp3"]);
    expect(element?.preload).toBe("auto");

    element?.resolvePlay();
    element?.fire("playing");
    element?.fire("ended");
    await settle();

    expect(a.seen).toEqual(["playing", "ended"]);
    expect(element?.released).toBe(true);
    expect(element?.listenerCount).toBe(0);
  });

  it("Stop releases the element; later events and a late play() rejection are ignored", async () => {
    const { player, elements, events } = setup();
    const a = events("a");
    player.play("/media/test/a.mp3", a.onEvent);
    player.stop();
    const [element] = elements;
    expect(element?.released).toBe(true);
    expect(element?.listenerCount).toBe(0);

    element?.fire("playing");
    element?.fire("ended");
    element?.rejectPlay();
    await settle();
    expect(a.seen).toEqual([]);
  });

  it("switching clips releases the first; its late events cannot touch the second", async () => {
    const { player, elements, events } = setup();
    const a = events("a");
    const b = events("b");
    player.play("/media/test/a.mp3", a.onEvent);
    player.play("/media/test/b.mp3", b.onEvent);
    const [first, second] = elements;
    expect(first?.released).toBe(true);

    // The first clip's play() fails late, and stray events arrive.
    first?.rejectPlay();
    first?.fire("error");
    first?.fire("ended");
    second?.resolvePlay();
    second?.fire("playing");
    await settle();

    expect(a.seen).toEqual([]);
    expect(b.seen).toEqual(["playing"]);
    expect(second?.released).toBe(false);
  });

  it("stopping an old playback does not stop the newer clip", () => {
    const { player, elements, events } = setup();
    const old = player.play("/media/test/a.mp3", events("a").onEvent);
    player.play("/media/test/b.mp3", events("b").onEvent);
    old.stop();
    expect(elements[1]?.released).toBe(false);
  });

  it.each([
    [
      "an error event",
      (element: FakeAudio) => {
        element.fire("error");
      },
    ],
    [
      "a rejected play()",
      (element: FakeAudio) => {
        element.rejectPlay();
      },
    ],
  ])(
    "reports %s as a failure and releases the element",
    async (_name, fail) => {
      const { player, elements, events } = setup();
      const a = events("a");
      player.play("/media/test/a.mp3", a.onEvent);
      const [element] = elements;
      if (element === undefined) throw new Error("no element");
      fail(element);
      await settle();
      expect(a.seen).toEqual(["failed"]);
      expect(element.released).toBe(true);

      // Trying again uses a fresh element, so the browser requests the file again.
      player.play("/media/test/a.mp3", a.onEvent);
      expect(elements).toHaveLength(2);
      expect(elements[1]?.calls).toEqual(["play /media/test/a.mp3"]);
    },
  );

  it("keeps at most one live element and removes every listener over many plays", async () => {
    const { player, elements, events } = setup();
    for (let round = 0; round < 20; round += 1) {
      player.play(
        `/media/test/clip-${String(round % 3)}.mp3`,
        events("x").onEvent,
      );
      expect(elements.filter((element) => !element.released)).toHaveLength(1);
      if (round % 4 === 0) elements.at(-1)?.fire("ended");
    }
    player.stop();
    await settle();
    expect(elements).toHaveLength(20);
    expect(elements.every((element) => element.released)).toBe(true);
    expect(elements.every((element) => element.listenerCount === 0)).toBe(true);
  });

  it("stays usable after dispose(), as React Strict Mode needs", () => {
    const { player, elements, events } = setup();
    player.play("/media/test/a.mp3", events("a").onEvent);
    player.dispose();
    expect(elements[0]?.released).toBe(true);
    player.dispose();

    player.play("/media/test/b.mp3", events("b").onEvent);
    expect(elements[1]?.calls).toEqual(["play /media/test/b.mp3"]);
    expect(elements[1]?.released).toBe(false);
  });

  it("does nothing on stop() with nothing playing", () => {
    const { player } = setup();
    expect(() => {
      player.stop();
    }).not.toThrow();
  });

  it("uses the browser's Audio by default", () => {
    const create = vi.spyOn(window, "Audio");
    const player = new AudioPlayer();
    const play = vi
      .spyOn(HTMLMediaElement.prototype, "play")
      .mockResolvedValue(undefined);
    player.play("/media/test/a.mp3", () => undefined);
    expect(create).toHaveBeenCalledTimes(1);
    expect(play).toHaveBeenCalledTimes(1);
    vi.restoreAllMocks();
  });
});
