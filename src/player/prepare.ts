import type { AnySlide, PlayerData } from "./player-data.ts";

/**
 * Loads a session and the code of the slide that will open first, before
 * the player is shown, so opening a session (from the list or a deep link)
 * waits once rather than once per step. Never rejects: a failure stays in
 * the player's cache and the player shows its usual message for it.
 */
export async function prepareSession<S extends AnySlide>(
  data: PlayerData<S>,
  slug: string,
  slideId: string | undefined,
): Promise<void> {
  try {
    const session = await data.loadSession(slug);
    const slide =
      slideId === undefined
        ? session.slides[0]
        : session.slides.find((candidate) => candidate.id === slideId);
    if (slide !== undefined) await data.loadComponent(slide);
  } catch {
    // Shown by the player: the failed load is still in its cache.
  }
}
