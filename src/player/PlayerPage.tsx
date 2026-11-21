import { createStaticContentSource } from "../content/static-content-source.ts";
import { slideRegistry } from "../slides/registry.ts";
import { createPlayerData } from "./player-data.ts";
import { SessionPlayer } from "./SessionPlayer.tsx";

// The start of the player's lazily loaded chunk: production content and the
// production slide types.
const data = createPlayerData(createStaticContentSource(), slideRegistry);

export default function PlayerPage({
  slug,
  slideId,
}: {
  readonly slug: string;
  readonly slideId: string | undefined;
}) {
  return <SessionPlayer data={data} slug={slug} slideId={slideId} />;
}
