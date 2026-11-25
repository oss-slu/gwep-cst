// Sveltia CMS 0.263.0 renders the slides in a session's slide list only as
// they scroll into view. Until then, keyboard and screen reader users cannot
// reach them: depending on the screen size, Tab can skip from the last
// rendered slide to "Add Slides" (#30). Sveltia renders an item at once when
// told it is in view, so for elements in the edit pane's slide list only,
// this reports each newly observed element as in view one time. After that,
// and everywhere else (menus, the preview, picture grids), the browser's own
// intersection updates apply as usual.

/** The slide list in the edit pane (the preview pane repeats the key path). */
export const SLIDE_LIST =
  '[role="group"][aria-label="Edit Content"] [data-key-path="slides"]';

export function renderSlideListAtOnce(
  scope: Pick<typeof globalThis, "IntersectionObserver">,
): void {
  const Native = scope.IntersectionObserver;
  // Without IntersectionObserver, Sveltia already renders everything.
  if (typeof Native !== "function") return;

  class RenderSlideListAtOnce extends Native {
    readonly #callback: IntersectionObserverCallback;

    constructor(
      callback: IntersectionObserverCallback,
      options?: IntersectionObserverInit,
    ) {
      super(callback, options);
      this.#callback = callback;
    }

    override observe(target: Element): void {
      super.observe(target);
      if (target.closest(SLIDE_LIST) === null) return;
      const bounds = target.getBoundingClientRect();
      const entry: IntersectionObserverEntry = {
        target,
        isIntersecting: true,
        intersectionRatio: 1,
        boundingClientRect: bounds,
        intersectionRect: bounds,
        rootBounds: null,
        time: performance.now(),
      };
      // Before the browser's first report, which would say "not in view".
      queueMicrotask(() => {
        this.#callback([entry], this);
      });
    }
  }

  scope.IntersectionObserver = RenderSlideListAtOnce;
}
