import type { ReactNode } from "react";
import { Link } from "wouter";
import { catalog } from "../app/catalog.ts";
import { siteName, ui } from "../app/copy.ts";
import { sessionPath } from "../app/paths.ts";
import { useFocusOnMount } from "../ui/focus.ts";
import { ArrowRight } from "../ui/icons.tsx";

/**
 * A welcome band, then the fourteen sessions as cards in project order. An
 * available session's whole card is one link whose name includes the
 * session's title; the others are plain text marked "Coming soon", so they
 * are not in the tab order.
 */
export function SessionList() {
  const headingRef = useFocusOnMount<HTMLHeadingElement>();
  return (
    <main className="home">
      <header className="home__intro">
        <div className="home__intro-inner">
          <h1 ref={headingRef} tabIndex={-1} className="home__title">
            {siteName}
          </h1>
          <p className="home__lead">{ui.sessionList.intro}</p>
        </div>
      </header>
      <section className="home__sessions" aria-labelledby="sessions-heading">
        <h2 id="sessions-heading" className="home__sessions-heading">
          {ui.sessionList.heading}
        </h2>
        {/* role="list" keeps list semantics, which list-style: none can
            remove in Safari. */}
        <ol className="sessions" role="list">
          {catalog.map((entry) => (
            <li key={entry.slug} className="session-card">
              {entry.available ? (
                <Link
                  href={sessionPath(entry.slug)}
                  className="session-card__link"
                >
                  <SessionCardContent number={entry.number} title={entry.title}>
                    <span className="session-card__start">
                      {ui.sessionList.start}
                      <ArrowRight />
                    </span>
                  </SessionCardContent>
                </Link>
              ) : (
                <div className="session-card__body">
                  <SessionCardContent number={entry.number} title={entry.title}>
                    <span className="session-card__soon">
                      {ui.sessionList.comingSoon}
                    </span>
                  </SessionCardContent>
                </div>
              )}
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}

function SessionCardContent({
  number,
  title,
  children,
}: {
  readonly number: number;
  readonly title: string;
  readonly children: ReactNode;
}) {
  return (
    <>
      <span className="session-card__number">{number}</span>
      <span className="session-card__title">{title}</span>
      <span className="session-card__status">{children}</span>
    </>
  );
}
