import { describe, expect, it, vi } from "vitest";
import type { SlideComponent } from "../slides/types.ts";
import type { AnySlide, PlayableSession, PlayerData } from "./player-data.ts";
import { prepareSession } from "./prepare.ts";

const session: PlayableSession<AnySlide> = {
  slug: "orientation",
  title: "Fixture",
  slides: [
    { type: "title", id: "welcome" },
    { type: "reveal", id: "landmark-state" },
  ],
};

function fakeData(
  loadSession: () => Promise<PlayableSession<AnySlide>>,
  loadComponent: () => Promise<SlideComponent<AnySlide>> = () =>
    Promise.resolve(() => null),
) {
  return {
    loadSession: vi.fn(loadSession),
    readySession: vi.fn(() => undefined),
    loadComponent: vi.fn(loadComponent),
    readyComponent: vi.fn(() => undefined),
    forgetFailures: vi.fn(),
  } satisfies PlayerData<AnySlide>;
}

describe("prepareSession", () => {
  it("loads the session, then the code of the deep-linked slide", async () => {
    const data = fakeData(() => Promise.resolve(session));
    await prepareSession(data, "orientation", "landmark-state");
    expect(data.loadSession).toHaveBeenCalledWith("orientation");
    expect(data.loadComponent).toHaveBeenCalledTimes(1);
    expect(data.loadComponent).toHaveBeenCalledWith(session.slides[1]);
  });

  it("loads the first slide's code when no slide is named", async () => {
    const data = fakeData(() => Promise.resolve(session));
    await prepareSession(data, "orientation", undefined);
    expect(data.loadComponent).toHaveBeenCalledWith(session.slides[0]);
  });

  it("loads no slide code for an unknown slide id", async () => {
    const data = fakeData(() => Promise.resolve(session));
    await prepareSession(data, "orientation", "not-a-slide");
    expect(data.loadComponent).not.toHaveBeenCalled();
  });

  it("never rejects, leaving failures for the player to show", async () => {
    await expect(
      prepareSession(
        fakeData(() => Promise.reject(new Error("offline"))),
        "orientation",
        undefined,
      ),
    ).resolves.toBeUndefined();
    await expect(
      prepareSession(
        fakeData(
          () => Promise.resolve(session),
          () => Promise.reject(new Error("offline")),
        ),
        "orientation",
        undefined,
      ),
    ).resolves.toBeUndefined();
  });
});
