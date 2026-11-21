import {
  Suspense,
  use,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";
import { Link, Redirect, useLocation } from "wouter";
import { BackToSessions } from "../app/BackToSessions.tsx";
import { format, ui } from "../app/copy.ts";
import { LoadErrorView } from "../app/LoadErrorView.tsx";
import { slidePath } from "../app/paths.ts";
import { AudioProvider, useAudio } from "../media/AudioProvider.tsx";
import { ErrorBoundary } from "../ui/ErrorBoundary.tsx";
import { Loading } from "../ui/Loading.tsx";
import { StatusMessage } from "../ui/StatusMessage.tsx";
import type { AnySlide, PlayableSession, PlayerData } from "./player-data.ts";
import { usePreloadSlide } from "./preload.ts";
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
  // Already loaded when the player was prepared (see prepareSession), so
  // a deep link does not suspend a second time.
  const session = data.readySession(slug) ?? use(data.loadSession(slug));
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

  // One audio player per session view: stopped on every slide change and
  // released when the session closes.
  return (
    <AudioProvider>
      <Player data={data} session={session} slide={slide} index={index} />
    </AudioProvider>
  );
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
  const audio = useAudio();
  const slideArea = useRef<HTMLElement>(null);
  // Set by the Previous and Next buttons and the slide keys, which leave
  // focus where it is. Any other arrival (a link, a typed address, Back or
  // Forward) moves focus to the slide.
  const keepFocus = useRef(false);

  const total = session.slides.length;
  usePreloadSlide(data, session.slides[index + 1]);
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

  // Moving to another slide stops any sound. The slide that played it has
  // unmounted, so nothing would be left to stop it.
  useEffect(() => {
    audio.stop();
  }, [audio, slide.id]);

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
        {/* The key gives each slide its own frame, so the previous slide
            unmounts, only the current one is mounted, and nothing a slide
            was waiting for carries over to the next. */}
        <SlideFrame
          key={slide.id}
          data={data}
          slide={slide}
          focusSlideArea={() => {
            slideArea.current?.focus();
          }}
        />
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

/** One slide with its own error boundary, loading state and retry. */
function SlideFrame<S extends AnySlide>({
  data,
  slide,
  focusSlideArea,
}: {
  readonly data: PlayerData<S>;
  readonly slide: S;
  readonly focusSlideArea: () => void;
}) {
  // Set by "Try again". Its button goes away, so focus returns to the slide
  // area once this slide appears. It belongs to this slide only: moving to
  // another slide unmounts this frame and discards it.
  const focusWhenShown = useRef(false);
  return (
    <ErrorBoundary
      onRetry={() => {
        focusWhenShown.current = true;
        data.forgetFailures();
      }}
      fallback={(failure) => (
        <LoadErrorView {...failure} level={2} backLink={false} />
      )}
    >
      <SlideContent
        data={data}
        slide={slide}
        onShown={() => {
          if (!focusWhenShown.current) return;
          focusWhenShown.current = false;
          focusSlideArea();
        }}
      />
    </ErrorBoundary>
  );
}

/**
 * One slide's component. A component already loaded (by an earlier slide of
 * its type, or by the next-slide preload) renders at once. Otherwise this
 * shows "Loading…" until it arrives, using plain state rather than Suspense:
 * React holds content that follows a Suspense fallback for at least 300 ms.
 * A failed load is thrown to the slide's error boundary.
 */
function SlideContent<S extends AnySlide>({
  data,
  slide,
  onShown,
}: {
  readonly data: PlayerData<S>;
  readonly slide: S;
  /** Runs once the slide's component has loaded and the slide is on screen. */
  readonly onShown: () => void;
}) {
  const [Slide, setSlide] = useState(() => data.readyComponent(slide));
  const [failure, setFailure] = useState<{ error: unknown }>();
  const shown = useEffectEvent(onShown);

  useEffect(() => {
    if (Slide !== undefined) return;
    let active = true;
    data.loadComponent(slide).then(
      (component) => {
        // A component is a function, so wrap it: setSlide(fn) would call it.
        if (active) setSlide(() => component);
      },
      (error: unknown) => {
        if (active) setFailure({ error });
      },
    );
    return () => {
      active = false;
    };
  }, [Slide, data, slide]);

  useEffect(() => {
    if (Slide !== undefined) shown();
  }, [Slide]);

  if (failure !== undefined) throw failure.error;
  if (Slide === undefined) return <Loading />;
  return <Slide slide={slide} />;
}
