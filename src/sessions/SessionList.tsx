import { Link } from "wouter";
import { catalog } from "../app/catalog.ts";
import { siteName, ui } from "../app/copy.ts";
import { sessionPath } from "../app/paths.ts";
import { useFocusOnMount } from "../ui/focus.ts";

/**
 * The fourteen sessions in project order. Only available sessions are links;
 * the others are plain text marked "Coming soon", so they are not in the tab
 * order.
 */
export function SessionList() {
  const headingRef = useFocusOnMount<HTMLHeadingElement>();
  return (
    <main className="page">
      <h1 ref={headingRef} tabIndex={-1}>
        {siteName}
      </h1>
      <h2>{ui.sessionList.heading}</h2>
      <ol className="sessions">
        {catalog.map((entry) => (
          <li key={entry.slug} className="sessions__item">
            {entry.available ? (
              <Link href={sessionPath(entry.slug)} className="sessions__link">
                {entry.title}
              </Link>
            ) : (
              <span className="sessions__unavailable">
                <span>{entry.title}</span>
                <span className="sessions__soon">
                  {ui.sessionList.comingSoon}
                </span>
              </span>
            )}
          </li>
        ))}
      </ol>
    </main>
  );
}
