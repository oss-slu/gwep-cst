import type { ContentSource } from "../content/content-source.ts";
import type { SlideRegistry } from "../slides/registry.ts";
import type { SlideComponent } from "../slides/types.ts";
import { createLoadCache } from "../ui/load-cache.ts";

export interface AnySlide {
  readonly id: string;
  readonly type: string;
}

/** The parts of a session the player uses. */
export interface PlayableSession<S extends AnySlide> {
  readonly slug: string;
  readonly title: string;
  readonly slides: readonly S[];
}

/**
 * What the player loads, remembered so moving between slides reuses
 * downloads, and forgotten on failure so "Try again" downloads again.
 */
export interface PlayerData<S extends AnySlide> {
  loadSession(slug: string): Promise<PlayableSession<S>>;
  loadComponent(slide: S): Promise<SlideComponent<S>>;
  /** Called by "Try again": failed downloads start again on the next render. */
  readonly forgetFailures: () => void;
}

export function createPlayerData<S extends AnySlide>(
  source: ContentSource<PlayableSession<S>>,
  registry: Pick<SlideRegistry<S>, "loadComponent">,
): PlayerData<S> {
  const sessions = createLoadCache<PlayableSession<S>>();
  const components = createLoadCache<SlideComponent<S>>();
  return {
    loadSession: (slug) => sessions.get(slug, () => source.loadSession(slug)),
    // One download per slide type: every slide of a type shares its component.
    loadComponent: (slide) =>
      components.get(slide.type, () => registry.loadComponent(slide)),
    forgetFailures() {
      sessions.forgetFailures();
      components.forgetFailures();
    },
  };
}
