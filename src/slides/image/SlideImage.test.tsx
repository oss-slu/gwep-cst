import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ui } from "../../app/copy.ts";
import type { Image } from "../../content/schema.ts";
import { SlideImage } from "./SlideImage.tsx";
import { IMAGE_SIZES, srcSet } from "./sources.ts";

const image: Image = {
  src: "/media/test/landmark.png",
  alt: "Fixture picture description",
  width: 1600,
  height: 1200,
};
const { failed, retry, retrying } = ui.slides.image;

const picture = () => screen.getByAltText(image.alt);
const retryButton = () => screen.getByRole("button");

describe("SlideImage", () => {
  it("reserves the picture's shape and passes its size to the browser", () => {
    const { container } = render(<SlideImage image={image} />);
    const frame = container.querySelector<HTMLElement>(".slide-image");
    expect(frame?.style.getPropertyValue("--image-shape")).toBe(
      String(1600 / 1200),
    );
    expect(frame?.style.getPropertyValue("--image-width")).toBe("1600px");
    expect(picture().getAttribute("width")).toBe("1600");
    expect(picture().getAttribute("height")).toBe("1200");
    expect(picture().hasAttribute("srcset")).toBe(false);
  });

  it("lists variants as a srcset, widest first", () => {
    const withVariants: Image = {
      ...image,
      variants: [
        { src: "/media/test/landmark-400.png", width: 400 },
        { src: "/media/test/landmark-800.png", width: 800 },
      ],
    };
    expect(srcSet(withVariants)).toBe(
      "/media/test/landmark.png 1600w, /media/test/landmark-800.png 800w, /media/test/landmark-400.png 400w",
    );
    render(<SlideImage image={withVariants} />);
    expect(picture().getAttribute("srcset")).toBe(srcSet(withVariants));
    expect(picture().getAttribute("sizes")).toBe(IMAGE_SIZES);
  });

  it("on failure shows the message, the description and a retry button", () => {
    render(<SlideImage image={image} />);
    fireEvent.error(picture());
    expect(screen.getByText(failed)).toBeDefined();
    expect(screen.getByText(image.alt)).toBeDefined();
    expect(retryButton().textContent).toBe(retry);
    expect(screen.queryByRole("img")).toBeNull();
    // A focusable region, so a long description can be scrolled by keyboard;
    // the button comes before the description so it is always in view.
    const panel = screen.getByRole("region", { name: failed });
    expect(panel.tabIndex).toBe(0);
    expect([...panel.children].map((child) => child.tagName)).toEqual([
      "P",
      "BUTTON",
      "P",
    ]);
  });

  it("shows the picture as it arrives, without waiting for its load event", () => {
    render(<SlideImage image={image} />);
    expect(picture().className).toBe("slide-image__picture");
  });

  it("while retrying keeps the button (and its focus) and loads a new picture", () => {
    render(<SlideImage image={image} />);
    fireEvent.error(picture());
    retryButton().focus();
    fireEvent.click(retryButton());

    expect(retryButton().textContent).toBe(retrying);
    expect(retryButton().getAttribute("aria-disabled")).toBe("true");
    expect(document.activeElement).toBe(retryButton());
    expect(picture().className).toContain("slide-image__picture--pending");

    fireEvent.click(retryButton());
    expect(retryButton().textContent).toBe(retrying);
  });

  it("moves focus to the picture when it loads while Retry still has focus", () => {
    render(<SlideImage image={image} />);
    fireEvent.error(picture());
    retryButton().focus();
    fireEvent.click(retryButton());
    fireEvent.load(picture());

    expect(screen.queryByRole("button")).toBeNull();
    expect(document.activeElement).toBe(picture());
  });

  it("moves focus to the picture when it loads while the panel itself has focus", () => {
    render(<SlideImage image={image} />);
    fireEvent.error(picture());
    fireEvent.click(retryButton());
    const panel = screen.getByRole("region", { name: failed });
    panel.focus();
    fireEvent.load(picture());

    expect(screen.queryByRole("region")).toBeNull();
    expect(document.activeElement).toBe(picture());
  });

  it("leaves focus alone when the facilitator moved on before it loaded", () => {
    render(
      <>
        <SlideImage image={image} />
        <button type="button">Elsewhere</button>
      </>,
    );
    fireEvent.error(picture());
    screen.getByRole("button", { name: retry }).focus();
    fireEvent.click(screen.getByRole("button", { name: retry }));
    const elsewhere = screen.getByRole("button", { name: "Elsewhere" });
    elsewhere.focus();
    fireEvent.load(picture());

    expect(document.activeElement).toBe(elsewhere);
  });

  it("keeps focus on Retry when retrying fails again", () => {
    render(<SlideImage image={image} />);
    fireEvent.error(picture());
    retryButton().focus();
    fireEvent.click(retryButton());
    fireEvent.error(picture());

    expect(retryButton().textContent).toBe(retry);
    expect(document.activeElement).toBe(retryButton());
  });

  it("shows no description for a decorative picture", () => {
    render(<SlideImage image={{ ...image, alt: "", decorative: true }} />);
    const img = document.querySelector("img");
    expect(img?.getAttribute("alt")).toBe("");
    if (img) fireEvent.error(img);
    expect(screen.getByText(failed)).toBeDefined();
    expect(document.querySelector(".slide-image__alt")).toBeNull();
  });
});
