import type { AudioService, Playback, PlaybackEvent } from "./audio-service.ts";

interface Current {
  readonly element: HTMLAudioElement;
  readonly onEvent: (event: PlaybackEvent) => void;
  readonly removeListeners: (() => void)[];
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
    const current: Current = { element, onEvent, removeListeners: [] };
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

    return {
      stop: () => {
        if (isCurrent()) this.#release(current);
      },
    };
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
    for (const remove of current.removeListeners.splice(0)) remove();
    const { element } = current;
    element.pause();
    element.removeAttribute("src");
    element.load();
  }
}
