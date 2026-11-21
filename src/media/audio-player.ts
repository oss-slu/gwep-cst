import type { AudioService, Playback, PlaybackEvent } from "./audio-service.ts";

interface Current {
  readonly element: HTMLAudioElement;
  readonly handle: PlaybackHandle;
  readonly removeListeners: (() => void)[];
}

/**
 * What play() returns. It reaches its clip only until the clip is
 * released, so a slide that keeps the handle after a clip ends does not
 * keep that clip's audio element alive. It is a class rather than a closure
 * inside play(), because closures created there share one scope that also
 * holds the element.
 */
class PlaybackHandle implements Playback {
  #stop: (() => void) | undefined;

  constructor(stop: () => void) {
    this.#stop = stop;
  }

  readonly stop = () => {
    this.#stop?.();
  };

  /** Called when the clip is released: forget it. */
  detach(): void {
    this.#stop = undefined;
  }
}

/**
 * The shared audio player. It holds at most one audio element, created only
 * when play() is called (so nothing downloads or plays before someone asks)
 * and released on stop, on a switch to another clip, at the end and on
 * failure.
 *
 * Every listener and the play() promise first check that their clip is
 * still the current one, so a late event or a play() that settles after
 * Stop or a switch is ignored and cannot affect a newer clip.
 */
export class AudioPlayer implements AudioService {
  #current: Current | undefined;
  readonly #createElement: () => HTMLAudioElement;

  /** createElement is replaceable so tests can watch the element. */
  constructor(createElement: () => HTMLAudioElement = () => new Audio()) {
    this.#createElement = createElement;
  }

  play(src: string, onEvent: (event: PlaybackEvent) => void): Playback {
    this.stop();
    const element = this.#createElement();
    const current: Current = {
      element,
      handle: new PlaybackHandle(() => {
        if (this.#current === current) this.#release(current);
      }),
      removeListeners: [],
    };
    this.#current = current;

    const isCurrent = () => this.#current === current;
    const listen = (type: string, handler: () => void) => {
      element.addEventListener(type, handler);
      current.removeListeners.push(() => {
        element.removeEventListener(type, handler);
      });
    };
    const finish = (event: PlaybackEvent) => {
      if (!isCurrent()) return;
      this.#release(current);
      onEvent(event);
    };

    listen("playing", () => {
      if (isCurrent()) onEvent("playing");
    });
    listen("ended", () => {
      finish("ended");
    });
    listen("error", () => {
      finish("failed");
    });

    element.preload = "auto";
    element.src = src;
    element.play().catch(() => {
      // Also rejects when the clip was stopped before it started; then it
      // is no longer current and finish() ignores it.
      finish("failed");
    });

    return current.handle;
  }

  stop(): void {
    if (this.#current !== undefined) this.#release(this.#current);
  }

  dispose(): void {
    // The same as stop(): there is nothing else to release, and staying
    // usable keeps React Strict Mode's extra cleanup and setup harmless.
    this.stop();
  }

  /** Removes the listeners, stops the sound and frees the download. */
  #release(current: Current): void {
    if (this.#current === current) this.#current = undefined;
    current.handle.detach();
    for (const remove of current.removeListeners.splice(0)) remove();
    const { element } = current;
    element.pause();
    element.removeAttribute("src");
    element.load();
  }
}
