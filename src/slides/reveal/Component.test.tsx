import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ui } from "../../app/copy.ts";
import { revealSlide } from "./index.ts";
import { revealFields, type RevealSlideData } from "./schema.ts";

const Reveal = (await revealSlide.loadComponent()).default;

const slide: RevealSlideData = {
  type: "reveal",
  id: "landmark-1",
  prompt: "Fixture question?",
  image: {
    src: "/media/test/landmark.png",
    alt: "Fixture picture description",
    width: 1600,
    height: 1200,
  },
  answer: "Fixture answer",
};

const button = () => screen.getByRole("button", { name: /answer/ });

describe("reveal slide", () => {
  it("shows the question and picture, and keeps the answer off the page", () => {
    render(<Reveal slide={slide} />);
    expect(
      screen.getByRole("heading", { level: 2, name: "Fixture question?" }),
    ).toBeDefined();
    expect(screen.getByAltText("Fixture picture description")).toBeDefined();
    expect(screen.queryByText("Fixture answer")).toBeNull();
    expect(screen.getByRole("button", { name: ui.slides.reveal.show })).toBe(
      button(),
    );
    expect(button().getAttribute("aria-expanded")).toBe("false");
  });

  it("toggles the answer in a polite live region, keeping focus on the button", () => {
    render(<Reveal slide={slide} />);
    button().focus();
    fireEvent.click(button());

    const answer = screen.getByText("Fixture answer");
    expect(answer.closest("[aria-live='polite']")?.id).toBe(
      button().getAttribute("aria-controls"),
    );
    expect(button().getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("button", { name: ui.slides.reveal.hide })).toBe(
      button(),
    );
    expect(document.activeElement).toBe(button());

    fireEvent.click(button());
    expect(screen.queryByText("Fixture answer")).toBeNull();
    expect(button().getAttribute("aria-expanded")).toBe("false");
  });

  it("renders supplied text as text, never as markup", () => {
    const { container } = render(
      <Reveal
        slide={{
          ...slide,
          prompt: "<b>bold</b>",
          answer: "<script>x()</script>",
        }}
      />,
    );
    fireEvent.click(button());
    expect(container.querySelector("b, script")).toBeNull();
    expect(screen.getByText("<b>bold</b>")).toBeDefined();
    expect(screen.getByText("<script>x()</script>")).toBeDefined();
  });
});

describe("reveal schema", () => {
  const schema = z.strictObject(revealFields);
  it("accepts a complete slide", () => {
    const { prompt, image, answer } = slide;
    expect(schema.safeParse({ prompt, image, answer }).success).toBe(true);
  });

  it.each([
    [{ answer: " " }, "Answer must not be empty"],
    [{ prompt: "" }, "Question must not be empty"],
  ])("rejects %j", (change, message) => {
    const { prompt, image, answer } = slide;
    const result = schema.safeParse({ prompt, image, answer, ...change });
    expect(result.error?.issues.map((issue) => issue.message)).toEqual([
      message,
    ]);
  });

  it("requires the picture's size", () => {
    const { prompt, answer } = slide;
    const result = schema.safeParse({
      prompt,
      answer,
      image: { src: slide.image.src, alt: slide.image.alt },
    });
    expect(result.error?.issues.map((issue) => issue.path.join("."))).toEqual([
      "image.width",
      "image.height",
    ]);
  });
});
