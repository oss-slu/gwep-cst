// Test-only player page: the real SessionPlayer and production slide types,
// playing tests/visual/player-session.json, which passes the production
// session schema. The address is kept in memory, so this page never touches
// the app's routes. /tests/visual/player.html?slide=<slide id>
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Route, Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import "../../src/app/global.css";
import "../../src/app/app.css";
import { SESSION_ROUTE } from "../../src/app/paths.ts";
import { sessionSchema } from "../../src/content/session-schema.ts";
import { StaticContentSource } from "../../src/content/static-content-source.ts";
import { createPlayerData } from "../../src/player/player-data.ts";
import { SessionPlayer } from "../../src/player/SessionPlayer.tsx";
import { slideRegistry } from "../../src/slides/registry.ts";
import session from "./player-session.json" with { type: "json" };

const slideId = new URLSearchParams(window.location.search).get("slide");
const source = new StaticContentSource({
  loaders: { "/tests/visual/fixture.json": () => Promise.resolve(session) },
  schema: sessionSchema,
});
const data = createPlayerData(source, slideRegistry);
const location = memoryLocation({
  path: `/sessions/fixture${slideId === null ? "" : `/${slideId}`}`,
});

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root");
createRoot(root).render(
  <StrictMode>
    <Router hook={location.hook}>
      <Route path={SESSION_ROUTE}>
        {(params) => (
          <SessionPlayer
            data={data}
            slug={params.slug}
            slideId={params.slideId}
          />
        )}
      </Route>
    </Router>
  </StrictMode>,
);
