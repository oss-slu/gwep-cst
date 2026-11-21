import { createStaticContentSource } from "../content/static-content-source.ts";
import { slideRegistry } from "../slides/registry.ts";
import { createPlayerData } from "./player-data.ts";
import { prepareSession } from "./prepare.ts";
import { SessionPlayer } from "./SessionPlayer.tsx";

// The start of the player's lazily loaded chunk: production content and the
// production slide types.
const data = createPlayerData(createStaticContentSource(), slideRegistry);

/** Loads a session and its first slide's code before the player is shown. */
export function prepare(slug: string, slideId: string | undefined) {
  return prepareSession(data, slug, slideId);
}

export default function PlayerPage({
  slug,
  slideId,
}: {
  readonly slug: string;
  readonly slideId: string | undefined;
}) {
  return <SessionPlayer data={data} slug={slug} slideId={slideId} />;
}
