import { act, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { App } from "./App.tsx";
import { catalog } from "./catalog.ts";
import { siteName, ui } from "./copy.ts";

async function renderAt(path: string) {
  const location = memoryLocation({ path });
  await act(async () => {
    render(
      <Router hook={location.hook}>
        <App />
      </Router>,
    );
    await Promise.resolve();
  });
}

describe("session list", () => {
  it("shows the site name as the only level-one heading, focused", async () => {
    await renderAt("/");
    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]?.textContent).toBe(siteName);
    expect(document.activeElement).toBe(headings[0]);
    expect(screen.getByRole("main").tagName).toBe("MAIN");
  });

  it("lists all fourteen sessions in project order", async () => {
    await renderAt("/");
    const items = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(items).toHaveLength(14);
    expect(items.map((item) => item.textContent)).toEqual(
      catalog.map(
        (entry) =>
          String(entry.number) +
          entry.title +
          (entry.available ? ui.sessionList.start : ui.sessionList.comingSoon),
      ),
    );
    expect(catalog.map((entry) => entry.number)).toEqual(
      Array.from({ length: 14 }, (_, index) => index + 1),
    );
  });

  it("links only Orientation, by name; the other thirteen say Coming soon and are not focusable", async () => {
    await renderAt("/");
    const links = screen.getAllByRole("link");
    // The link's name includes the session's title, so it makes sense in a
    // screen reader's list of links.
    expect(links.map((link) => link.textContent)).toEqual([
      `9Orientation${ui.sessionList.start}`,
    ]);
    expect(links[0]?.getAttribute("href")).toBe("/sessions/orientation");
    expect(screen.getAllByText(ui.sessionList.comingSoon)).toHaveLength(13);
    const list = screen.getByRole("list");
    expect(
      list.querySelectorAll("a, button, [tabindex]:not([tabindex='-1'])"),
    ).toHaveLength(1);
  });
});

describe("routes answered without loading the player", () => {
  it.each([
    ["/sessions/childhood", ui.errors.sessionComingSoon.heading],
    ["/sessions/childhood/welcome", ui.errors.sessionComingSoon.heading],
    ["/sessions/not-a-session", ui.errors.sessionNotFound.heading],
    ["/sessions/..%2Fetc", ui.errors.sessionNotFound.heading],
    ["/nope", ui.errors.pageNotFound.heading],
    ["/sessions", ui.errors.pageNotFound.heading],
  ])("%s shows %j with a way back", async (path, heading) => {
    await renderAt(path);
    const shown = screen.getByRole("heading", { level: 1, name: heading });
    expect(document.activeElement).toBe(shown);
    expect(
      screen
        .getByRole("link", { name: ui.backToSessions })
        .getAttribute("href"),
    ).toBe("/");
  });
});
