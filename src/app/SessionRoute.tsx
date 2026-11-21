import { useEffect, useState } from "react";
import { sessionLoaders } from "../content/session-loaders.ts";
import { startComponentDownload } from "../slides/components.ts";
import { ErrorBoundary } from "../ui/ErrorBoundary.tsx";
import { createLoadCache } from "../ui/load-cache.ts";
import { Loading } from "../ui/Loading.tsx";
import { StatusMessage } from "../ui/StatusMessage.tsx";
import { BackToSessions } from "./BackToSessions.tsx";
import { findCatalogEntry } from "./catalog.ts";
import { ui } from "./copy.ts";
import { LoadErrorView } from "./LoadErrorView.tsx";

interface SessionRouteProps {
  readonly slug: string;
  readonly slideId: string | undefined;
}

// The player, the content schema and the slide types download only when a
// session opens, keeping them out of the first page load.
type PlayerModule = typeof import("../player/PlayerPage.tsx");
const loadPlayer = createLoadCache<PlayerModule>();

/**
 * Starts downloading the session's data now, alongside the player's code,
 * instead of after it. The player's own load of the same file then finds it
 * already downloaded. Failures are left for the player to report.
 */
function startSessionDownload(slug: string, slideId: string | undefined) {
  const file = Object.keys(sessionLoaders).find((path) =>
    path.endsWith(`/${slug}.json`),
  );
  const load = file === undefined ? undefined : sessionLoaders[file];
  load?.().then(
    (data) => {
      startOpeningSlideCode(data, slideId);
    },
    () => undefined,
  );
}

/**
 * As soon as the session data arrives, starts downloading the code of the
 * slide that will open first, alongside the player's code. The data is not
 * validated yet; an unknown type is simply ignored.
 */
function startOpeningSlideCode(data: unknown, slideId: string | undefined) {
  const slides = (data as { slides?: unknown } | null)?.slides;
  if (!Array.isArray(slides)) return;
  const slide = (
    slideId === undefined
      ? slides[0]
      : slides.find(
          (candidate: unknown) =>
            (candidate as { id?: unknown } | null)?.id === slideId,
        )
  ) as { type?: unknown } | undefined;
  if (typeof slide?.type === "string") startComponentDownload(slide.type);
}

/**
 * The player's code, with the session and its first slide's code already
 * loaded, so opening a session shows "Loading…" once and then the slide.
 * One per session: moving between slides reuses it.
 */
function openPlayer(slug: string, slideId: string | undefined) {
  return loadPlayer.get(slug, async () => {
    startSessionDownload(slug, slideId);
    const player = await import("../player/PlayerPage.tsx");
    await player.prepare(slug, slideId);
    return player;
  });
}

/**
 * Shows "Loading…" until the player is ready, then the player. This uses
 * plain state rather than Suspense on purpose: React keeps content that
 * follows a Suspense fallback hidden for at least 300 ms, which delayed every
 * opened session. With the session and first slide prepared, nothing inside
 * the player suspends either.
 */
function Player({ slug, slideId }: SessionRouteProps) {
  const [player, setPlayer] = useState(() => loadPlayer.peek(slug));
  const [failure, setFailure] = useState<{ error: unknown }>();

  useEffect(() => {
    if (player !== undefined) return;
    let active = true;
    openPlayer(slug, slideId).then(
      (loaded) => {
        if (active) setPlayer(loaded);
      },
      (error: unknown) => {
        if (active) setFailure({ error });
      },
    );
    return () => {
      active = false;
    };
  }, [player, slug, slideId]);

  // Thrown during render so the error boundary above shows it.
  if (failure !== undefined) throw failure.error;
  if (player === undefined) {
    return (
      <main className="page">
        <Loading />
      </main>
    );
  }
  const { default: PlayerPage } = player;
  return <PlayerPage slug={slug} slideId={slideId} />;
}

/**
 * /sessions/:slug and /sessions/:slug/:slideId. Only sessions the catalog
 * marks available are loaded; any other address is answered without
 * downloading anything.
 */
export function SessionRoute({ slug, slideId }: SessionRouteProps) {
  const entry = findCatalogEntry(slug);
  if (entry === undefined || !entry.available) {
    const message =
      entry === undefined
        ? ui.errors.sessionNotFound
        : ui.errors.sessionComingSoon;
    return (
      <main className="page">
        <StatusMessage {...message}>
          <BackToSessions primary />
        </StatusMessage>
      </main>
    );
  }
  return (
    <ErrorBoundary
      key={slug}
      onRetry={loadPlayer.forgetFailures}
      fallback={(failure) => (
        <main className="page">
          <LoadErrorView {...failure} />
        </main>
      )}
    >
      <Player slug={slug} slideId={slideId} />
    </ErrorBoundary>
  );
}
