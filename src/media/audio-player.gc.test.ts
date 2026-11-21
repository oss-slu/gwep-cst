// @vitest-environment node
import { setFlagsFromString } from "node:v8";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { AudioPlayer } from "./audio-player.ts";
import type { Playback } from "./audio-service.ts";

// Real garbage collection, to show that a finished clip's element is no
// longer reachable from the Playback handle its slide may still hold.
setFlagsFromString("--expose-gc");
const collectGarbage = runInNewContext("gc") as () => void;

class FakeAudio {
  src = "";
  preload = "";
  readonly #listeners = new Map<string, Set<() => void>>();
  addEventListener(type: string, handler: () => void) {
    const set = this.#listeners.get(type) ?? new Set();
    set.add(handler);
    this.#listeners.set(type, set);
  }
  removeEventListener(type: string, handler: () => void) {
    this.#listeners.get(type)?.delete(handler);
  }
  play() {
    return Promise.resolve();
  }
  pause() {}
  removeAttribute() {
    this.src = "";
  }
  load() {}
  fire(type: string) {
    for (const handler of [...(this.#listeners.get(type) ?? [])]) handler();
  }
}

async function collected(ref: WeakRef<object>): Promise<boolean> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    collectGarbage();
    if (ref.deref() === undefined) return true;
  }
  return false;
}

describe("AudioPlayer memory", () => {
  it.each(["ended", "error"])(
    "after %s, a Playback handle the slide still holds keeps no audio element alive",
    async (terminal) => {
      let element: WeakRef<FakeAudio> | undefined;
      const player = new AudioPlayer(() => {
        const created = new FakeAudio();
        element = new WeakRef(created);
        return created as unknown as HTMLAudioElement;
      });
      const handle: Playback = player.play(
        "/media/test/a.mp3",
        () => undefined,
      );
      await new Promise((resolve) => setTimeout(resolve, 0));
      element?.deref()?.fire(terminal);

      expect(element && (await collected(element))).toBe(true);
      // The handle is still held and still safe to call.
      expect(() => {
        handle.stop();
      }).not.toThrow();
    },
  );
});
