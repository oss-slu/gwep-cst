import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { titleSlide } from "./index.ts";

const Title = (await titleSlide.loadComponent()).default;

describe("title slide", () => {
  it("shows the heading and text supplied by the session", () => {
    render(
      <Title
        slide={{
          type: "title",
          id: "welcome",
          heading: "Welcome to CST",
          subheading: "Today we look at the date and the weather.",
        }}
      />,
    );
    expect(
      screen.getByRole("heading", { level: 2, name: "Welcome to CST" }),
    ).toBeDefined();
    expect(
      screen.getByText("Today we look at the date and the weather."),
    ).toBeDefined();
  });

  it.each([undefined, "", "   "])(
    "leaves out blank text (%j)",
    (subheading) => {
      const { container } = render(
        <Title
          slide={{
            type: "title",
            id: "welcome",
            heading: "Welcome",
            ...(subheading === undefined ? {} : { subheading }),
          }}
        />,
      );
      expect(container.querySelectorAll("p")).toHaveLength(0);
    },
  );

  it("has a strict schema that requires a heading", () => {
    const ok = { type: "title", id: "welcome", heading: "Welcome" };
    expect(titleSlide.schema.safeParse(ok).success).toBe(true);
    expect(titleSlide.schema.safeParse({ ...ok, heading: "  " }).success).toBe(
      false,
    );
    expect(
      titleSlide.schema.safeParse({ type: "title", id: "welcome" }).success,
    ).toBe(false);
    expect(titleSlide.schema.safeParse({ ...ok, colour: "red" }).success).toBe(
      false,
    );
  });

  it("has CMS fields for the heading and text, with help for editors", () => {
    expect(titleSlide.cmsFields.map((field) => field.name)).toEqual([
      "heading",
      "subheading",
    ]);
    expect(titleSlide.cmsFields.every((field) => field.hint)).toBe(true);
  });
});
