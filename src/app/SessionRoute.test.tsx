import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";

// What opening a session starts downloading, before the player's code has
// arrived: the session data, then the code of the slide that opens first.
const sessionData = {
  slug: "orientation",
  slides: [
    { type: "title", id: "welcome" },
    { type: "reveal", id: "landmark-state" },
  ],
};
const loadSession = vi.fn(() => Promise.resolve(sessionData));
const startComponentDownload = vi.fn();
const preparePlayer = vi.fn(() => new Promise<void>(() => undefined));

vi.mock("../content/session-loaders.ts", () => ({
  sessionLoaders: { "/content/sessions/orientation.json": loadSession },
}));
vi.mock("../slides/components.ts", () => ({ startComponentDownload }));
vi.mock("../player/PlayerPage.tsx", () => ({
  default: () => null,
  prepare: preparePlayer,
}));

const { SessionRoute } = await import("./SessionRoute.tsx");

async function open(path: string, slideId: string | undefined) {
  const location = memoryLocation({ path });
  await act(async () => {
    render(
      <Router hook={location.hook}>
        <SessionRoute slug="orientation" slideId={slideId} />
      </Router>,
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe("opening a session", () => {
  it("starts the session data and the deep-linked slide's code alongside the player", async () => {
    await open("/sessions/orientation/landmark-state", "landmark-state");
    expect(loadSession).toHaveBeenCalledTimes(1);
    expect(startComponentDownload).toHaveBeenCalledWith("reveal");
    expect(preparePlayer).toHaveBeenCalledWith("orientation", "landmark-state");
    // A plain loading message, not a Suspense fallback.
    expect(screen.getByRole("status").textContent).toBe("Loading…");
  });
});
