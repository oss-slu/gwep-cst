import { act, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { IMAGE_SIZES } from "../slides/image/sources.ts";
import type { SlideComponent } from "../slides/types.ts";
import type { AnySlide, PlayerData } from "./player-data.ts";
import { imagesIn, usePreloadSlide } from "./preload.ts";

const picture = {
  src: "/media/o/a.png",
  alt: "A",
  width: 1200,
  height: 900,
  variants: [{ src: "/media/o/a-400.png", width: 400 }],
};
const reveal = {
  type: "reveal",
  id: "r",
  prompt: "Q",
  image: picture,
  answer: "A",
};
const sounds = {
  type: "sounds",
  id: "s",
  heading: "H",
  clips: [{ sound: { src: "/media/o/a.mp3", description: "A sound" } }],
};

function Preload({
  data,
  slide,
}: {
  data: PlayerData<AnySlide>;
  slide: AnySlide | undefined;
}) {
  usePreloadSlide(data, slide);
  return null;
}

function fakeData(load: () => Promise<SlideComponent<AnySlide>>) {
  return {
    loadSession: vi.fn(),
    loadComponent: vi.fn(load),
    readyComponent: vi.fn(() => undefined),
    forgetFailures: vi.fn(),
  } satisfies PlayerData<AnySlide>;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("imagesIn", () => {
  it("finds pictures anywhere in a slide, and never sounds", () => {
    expect(imagesIn(reveal)).toEqual([picture]);
    expect(imagesIn({ nested: [{ deeper: picture }] })).toEqual([picture]);
    expect(imagesIn(sounds)).toEqual([]);
    expect(imagesIn({ type: "title", id: "t", heading: "Hi" })).toEqual([]);
  });
});

describe("usePreloadSlide", () => {
  it("loads the slide's code and its pictures without adding them to the page", () => {
    const created: HTMLImageElement[] = [];
    const NativeImage = window.Image;
    // A constructor (not an arrow function), since the hook calls new Image().
    vi.spyOn(window, "Image").mockImplementation(function () {
      const element = new NativeImage();
      created.push(element);
      return element;
    });
    const data = fakeData(() => new Promise(() => undefined));
    render(<Preload data={data} slide={reveal} />);

    expect(data.loadComponent).toHaveBeenCalledWith(reveal);
    expect(created).toHaveLength(1);
    expect(created[0]?.getAttribute("src")).toBe(picture.src);
    expect(created[0]?.getAttribute("srcset")).toBe(
      "/media/o/a.png 1200w, /media/o/a-400.png 400w",
    );
    expect(created[0]?.getAttribute("sizes")).toBe(IMAGE_SIZES);
    expect(created[0]?.isConnected).toBe(false);
    expect(document.querySelectorAll("img")).toHaveLength(0);
  });

  it("drops the previous preload when the next slide changes, and when it unmounts", () => {
    const created: HTMLImageElement[] = [];
    const NativeImage = window.Image;
    // A constructor (not an arrow function), since the hook calls new Image().
    vi.spyOn(window, "Image").mockImplementation(function () {
      const element = new NativeImage();
      created.push(element);
      return element;
    });
    const data = fakeData(() => new Promise(() => undefined));
    const { rerender, unmount } = render(
      <Preload data={data} slide={reveal} />,
    );
    const other = {
      ...reveal,
      id: "other",
      image: { ...picture, src: "/media/o/b.png", variants: undefined },
    };
    rerender(<Preload data={data} slide={other} />);
    expect(created[0]?.hasAttribute("src")).toBe(false);
    expect(created[0]?.hasAttribute("srcset")).toBe(false);
    expect(created.at(-1)?.getAttribute("src")).toBe("/media/o/b.png");

    unmount();
    expect(created.at(-1)?.hasAttribute("src")).toBe(false);
  });

  it("requests no audio and creates no audio element for a Sounds slide", () => {
    const audio = vi.spyOn(window, "Audio");
    const image = vi.spyOn(window, "Image");
    const data = fakeData(() => new Promise(() => undefined));
    render(<Preload data={data} slide={sounds} />);
    expect(data.loadComponent).toHaveBeenCalledWith(sounds);
    expect(audio).not.toHaveBeenCalled();
    expect(image).not.toHaveBeenCalled();
  });

  it("forgets a failed preload so the real load starts fresh", async () => {
    const data = fakeData(() =>
      Promise.reject(new TypeError("Failed to fetch")),
    );
    render(<Preload data={data} slide={reveal} />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(data.forgetFailures).toHaveBeenCalled();
  });

  it("does nothing on the last slide", () => {
    const data = fakeData(() => new Promise(() => undefined));
    render(<Preload data={data} slide={undefined} />);
    expect(data.loadComponent).not.toHaveBeenCalled();
  });
});
