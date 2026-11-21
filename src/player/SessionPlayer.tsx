import { Suspense, use, useEffect, useRef } from "react";
import { Link, Redirect, useLocation } from "wouter";
import { BackToSessions } from "../app/BackToSessions.tsx";
import { format, ui } from "../app/copy.ts";
import { LoadErrorView } from "../app/LoadErrorView.tsx";
import { slidePath } from "../app/paths.ts";
import { ErrorBoundary } from "../ui/ErrorBoundary.tsx";
import { Loading } from "../ui/Loading.tsx";
import { StatusMessage } from "../ui/StatusMessage.tsx";
import type { AnySlide, PlayableSession, PlayerData } from "./player-data.ts";
import { useSlideKeys } from "./slide-keys.ts";
import "./player.css";

interface SessionPlayerProps<S extends AnySlide> {
  readonly data: PlayerData<S>;
  readonly slug: string;
  /** The slide id from the address; undefined opens the first slide. */
  readonly slideId: string | undefined;
}

/**
 * Plays one session. The address holds the session slug and the slide id, so
 * every slide has its own link and each move between slides is a history
 * entry: Back and Forward step through the slides that were shown.
 */
export function SessionPlayer<S extends AnySlide>(
  props: SessionPlayerProps<S>,
) {
  return (
    <ErrorBoundary
      key={props.slug}
      onRetry={props.data.forgetFailures}
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
        <LoadedSession {...props} />
      </Suspense>
    </ErrorBoundary>
  );
}

function LoadedSession<S extends AnySlide>({
  data,
  slug,
  slideId,
}: SessionPlayerProps<S>) {
  const session = use(data.loadSession(slug));
  const first = session.slides[0];
  if (first === undefined) {
    // The schema requires at least one slide; this is a safety net.
    return (
      <main className="page">
        <StatusMessage {...ui.errors.invalidContent}>
          <BackToSessions />
        </StatusMessage>
      </main>
    );
  }

  // /sessions/:slug opens the first slide. Replacing the history entry means
  // Back from the first slide returns to the page before, not to this redirect.
  if (slideId === undefined) {
    return <Redirect to={slidePath(slug, first.id)} replace />;
  }

  const index = session.slides.findIndex((slide) => slide.id === slideId);
  const slide = session.slides[index];
  if (slide === undefined) {
    const { firstSlide, ...message } = ui.errors.slideNotFound;
    return (
      <main className="page">
        <StatusMessage {...message}>
          <Link href={slidePath(slug, first.id)} className="button">
            {firstSlide}
          </Link>
          <BackToSessions />
        </StatusMessage>
      </main>
    );
  }

  return <Player data={data} session={session} slide={slide} index={index} />;
}

function Player<S extends AnySlide>({
  data,
  session,
  slide,
  index,
}: {
  readonly data: PlayerData<S>;
  readonly session: PlayableSession<S>;
  readonly slide: S;
  readonly index: number;
}) {
  const [, navigate] = useLocation();
  const slideArea = useRef<HTMLElement>(null);
  // Set by the Previous and Next buttons and the slide keys, which leave
  // focus where it is. Any other arrival (a link, a typed address, Back or
  // Forward) moves focus to the slide.
  const keepFocus = useRef(false);

  const total = session.slides.length;
  const position = format(ui.player.position, { current: index + 1, total });

  function goTo(target: number) {
    const next = session.slides[target];
    if (next === undefined) return;
    keepFocus.current = true;
    navigate(slidePath(session.slug, next.id));
  }

  useSlideKeys(
    () => {
      goTo(index - 1);
    },
    () => {
      goTo(index + 1);
    },
  );

  useEffect(() => {
    const area = slideArea.current;
    const active = document.activeElement;
    // Something in the new slide already took focus, such as the heading of
    // a "didn't load" message that appeared in the same update.
    const focusInSlide =
      area !== null && active !== area && area.contains(active);
    // Reaching the first or last slide disables the button that was pressed
    // (or that was focused when a key was pressed), and a disabled button
    // cannot keep focus.
    const focusLost =
      active === null ||
      active === document.body ||
      (active instanceof HTMLButtonElement && active.disabled);
    if (!focusInSlide && (!keepFocus.current || focusLost)) area?.focus();
    keepFocus.current = false;
  }, [slide.id]);

  return (
    <main className="player">
      <header className="player__header">
        <BackToSessions />
        <h1 className="player__title">{session.title}</h1>
      </header>
      <section
        ref={slideArea}
        tabIndex={-1}
        aria-label={position}
        className="player__slide"
      >
        {/* The key gives each slide its own boundary and component, so the
            previous slide unmounts and only the current one is mounted. */}
        <ErrorBoundary
          key={slide.id}
          onRetry={data.forgetFailures}
          fallback={(failure) => (
            <LoadErrorView {...failure} level={2} backLink={false} />
          )}
        >
          <Suspense fallback={<Loading />}>
            <SlideContent data={data} slide={slide} />
          </Suspense>
        </ErrorBoundary>
      </section>
      <nav aria-label={ui.player.controls} className="player__controls">
        <button
          type="button"
          className="button"
          disabled={index === 0}
          onClick={() => {
            goTo(index - 1);
          }}
        >
          {ui.player.previous}
        </button>
        <p className="player__position" aria-live="polite">
          {position}
        </p>
        <button
          type="button"
          className="button"
          disabled={index === total - 1}
          onClick={() => {
            goTo(index + 1);
          }}
        >
          {ui.player.next}
        </button>
      </nav>
    </main>
  );
}

function SlideContent<S extends AnySlide>({
  data,
  slide,
}: {
  readonly data: PlayerData<S>;
  readonly slide: S;
}) {
  const Slide = use(data.loadComponent(slide));
  // The component is not created here: it comes from a cache that holds one
  // per slide type, so it is the same on every render of this slide.
  // eslint-disable-next-line react-hooks/static-components
  return <Slide slide={slide} />;
}
