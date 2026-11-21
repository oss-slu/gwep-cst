import { Route, Switch } from "wouter";
import { SessionList } from "../sessions/SessionList.tsx";
import "./app.css";
import { PageNotFound } from "./PageNotFound.tsx";
import { HOME, SESSION_ROUTE } from "./paths.ts";
import { SessionRoute } from "./SessionRoute.tsx";

export function App() {
  return (
    <Switch>
      <Route path={HOME}>
        <SessionList />
      </Route>
      <Route path={SESSION_ROUTE}>
        {(params) => (
          <SessionRoute slug={params.slug} slideId={params.slideId} />
        )}
      </Route>
      <Route>
        <PageNotFound />
      </Route>
    </Switch>
  );
}
