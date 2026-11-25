import { afterEach, describe, expect, it, vi } from "vitest";
import { renderSlideListAtOnce } from "../../admin/render-at-once.ts";

// A stand-in for the browser's IntersectionObserver that records what it is
// asked to observe and never reports anything by itself.
class FakeObserver {
  static observed: Element[] = [];
  readonly callback: IntersectionObserverCallback;
  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
  }
  observe(target: Element) {
    FakeObserver.observed.push(target);
  }
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}

function setup() {
  document.body.innerHTML = `
    <div role="group" aria-label="Edit Content">
      <section data-key-path="slides"><div id="slide-7"></div></section>
      <section data-key-path="title"><div id="title-field"></div></section>
    </div>
    <div role="group" aria-label="Preview">
      <section data-key-path="slides"><div id="preview-slide"></div></section>
    </div>
    <div id="menu-anchor"></div>`;
  const scope = {
    IntersectionObserver:
      FakeObserver as unknown as typeof globalThis.IntersectionObserver,
  };
  renderSlideListAtOnce(scope);
  return scope.IntersectionObserver;
}

const byId = (id: string) => {
  const element = document.getElementById(id);
  if (element === null) throw new Error(`missing #${id}`);
  return element;
};

afterEach(() => {
  FakeObserver.observed = [];
  document.body.replaceChildren();
});

describe("renderSlideListAtOnce", () => {
  it("reports a slide in the edit pane's slide list as in view, once, right away", async () => {
    const Observer = setup();
    const callback = vi.fn<IntersectionObserverCallback>();
    const observer = new Observer(callback, { rootMargin: "0px" });
    const slide = byId("slide-7");
    observer.observe(slide);

    expect(FakeObserver.observed).toEqual([slide]);
    expect(callback).not.toHaveBeenCalled();
    await Promise.resolve();
    expect(callback).toHaveBeenCalledOnce();
    const [[entries, from]] = callback.mock.calls as [
      [IntersectionObserverEntry[], IntersectionObserver],
    ];
    expect(from).toBe(observer);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      target: slide,
      isIntersecting: true,
      intersectionRatio: 1,
    });
  });

  it.each([
    ["another field in the edit pane", "title-field"],
    ["the preview pane's slide list", "preview-slide"],
    ["a menu anchor outside the editor fields", "menu-anchor"],
  ])("leaves %s to the browser", async (_, id) => {
    const Observer = setup();
    const callback = vi.fn<IntersectionObserverCallback>();
    const target = byId(id);
    new Observer(callback).observe(target);
    await Promise.resolve();
    expect(FakeObserver.observed).toEqual([target]);
    expect(callback).not.toHaveBeenCalled();
  });

  it("does nothing without IntersectionObserver", () => {
    const scope = {
      IntersectionObserver:
        undefined as unknown as typeof globalThis.IntersectionObserver,
    };
    renderSlideListAtOnce(scope);
    expect(scope.IntersectionObserver).toBeUndefined();
  });
});
