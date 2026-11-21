import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { weatherSlide } from "./index.ts";
import { startLevel, weatherFields, type WeatherSlideData } from "./schema.ts";
import { z } from "zod";

const Weather = (await weatherSlide.loadComponent()).default;

function slide(labels: string[]): WeatherSlideData {
  return {
    type: "weather",
    id: "weather",
    heading: "What is the weather like today?",
    levels: labels.map((label) => ({ label })),
  };
}

const thermometer = () =>
  screen.getByRole("slider", { name: "What is the weather like today?" });

describe("weather slide", () => {
  it("shows the heading and every level, labelled by its words", () => {
    render(<Weather slide={slide(["Cold", "Mild", "Hot"])} />);
    expect(
      screen.getByRole("heading", {
        level: 2,
        name: "What is the weather like today?",
      }),
    ).toBeDefined();
    for (const label of ["Cold", "Mild", "Hot"]) {
      expect(screen.getByText(label)).toBeDefined();
    }
    expect(thermometer().getAttribute("aria-valuetext")).toBe("Mild");
    expect(thermometer().getAttribute("min")).toBe("0");
    expect(thermometer().getAttribute("max")).toBe("2");
  });

  it.each([
    [2, 0],
    [3, 1],
    [4, 1],
    [5, 2],
    [6, 2],
    [7, 3],
  ])(
    "with %i levels starts on level %i (the lower middle)",
    (count, expected) => {
      expect(startLevel(count)).toBe(expected);
    },
  );

  it("moves the marker and fills the tube up to it", () => {
    const { container } = render(
      <Weather slide={slide(["Cold", "Cool", "Mild", "Warm", "Hot"])} />,
    );
    fireEvent.change(thermometer(), { target: { value: "4" } });
    expect(thermometer().getAttribute("aria-valuetext")).toBe("Hot");
    expect(
      container.querySelectorAll(".thermometer__level--filled"),
    ).toHaveLength(5);

    fireEvent.change(thermometer(), { target: { value: "0" } });
    expect(thermometer().getAttribute("aria-valuetext")).toBe("Cold");
    expect(
      container.querySelectorAll(".thermometer__level--filled"),
    ).toHaveLength(1);
  });

  it("draws the hottest level at the top", () => {
    const { container } = render(<Weather slide={slide(["Cold", "Hot"])} />);
    const drawn = [...container.querySelectorAll(".thermometer__label")].map(
      (label) => label.textContent,
    );
    expect(drawn).toEqual(["Hot", "Cold"]);
  });

  it("renders supplied text as text, never as markup", () => {
    const { container } = render(
      <Weather slide={slide(['<img src=x onerror="alert(1)">', "Hot"])} />,
    );
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText('<img src=x onerror="alert(1)">')).toBeDefined();
  });
});

describe("weather schema", () => {
  const schema = z.strictObject(weatherFields);
  const levels = (count: number) =>
    Array.from({ length: count }, (_, index) => ({
      label: `Level ${String(index)}`,
    }));

  it("accepts 2 to 7 levels", () => {
    expect(schema.safeParse({ heading: "Q", levels: levels(2) }).success).toBe(
      true,
    );
    expect(schema.safeParse({ heading: "Q", levels: levels(7) }).success).toBe(
      true,
    );
  });

  it.each([
    [levels(1), "A thermometer needs at least 2 levels"],
    [levels(8), "A thermometer can have at most 7 levels"],
    [[{ label: " " }, { label: "Hot" }], "Level words must not be empty"],
    [
      [{ label: "Cold", colour: "blue" }, { label: "Hot" }],
      'Unrecognized key: "colour"',
    ],
  ])("rejects %j", (value, message) => {
    const result = schema.safeParse({ heading: "Q", levels: value });
    expect(result.error?.issues.map((issue) => issue.message)).toContain(
      message,
    );
  });

  it("requires a heading", () => {
    expect(schema.safeParse({ heading: "", levels: levels(3) }).success).toBe(
      false,
    );
  });
});
