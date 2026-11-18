import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import site from "../../content/site.json" with { type: "json" };
import { App } from "./App";

describe("App shell", () => {
  it("shows the site name as the only level-one heading", () => {
    render(<App />);

    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]?.textContent).toBe(site.name);
  });

  it("has a main landmark", () => {
    render(<App />);

    expect(screen.getByRole("main").tagName).toBe("MAIN");
  });
});
