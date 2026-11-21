import { Suspense, use } from "react";
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
const loadPlayer = createLoadCache<typeof import("../player/PlayerPage.tsx")>();

function Player(props: SessionRouteProps) {
  const { default: PlayerPage } = use(
    loadPlayer.get("player", () => import("../player/PlayerPage.tsx")),
  );
  return <PlayerPage {...props} />;
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
      <Suspense
        fallback={
          <main className="page">
            <Loading />
          </main>
        }
      >
        <Player slug={slug} slideId={slideId} />
      </Suspense>
    </ErrorBoundary>
  );
}
