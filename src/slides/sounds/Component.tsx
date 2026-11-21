import { useEffect, useId, useRef, useState } from "react";
import { ui } from "../../app/copy.ts";
import { useAudio } from "../../media/AudioProvider.tsx";
import type { Playback } from "../../media/audio-service.ts";
import type { SlideProps } from "../types.ts";
import type { SoundsSlideData } from "./schema.ts";
import "../slides.css";
import "./sounds.css";

type ClipStatus = "idle" | "loading" | "playing" | "failed";

/**
 * Sound clips, each with a Play button and its description as text. Nothing
 * loads or plays until a button is pressed, and only one clip plays at a
 * time. Leaving the slide stops the sound.
 */
export default function SoundsSlide({ slide }: SlideProps<SoundsSlideData>) {
  const audio = useAudio();
  const [status, setStatus] = useState<readonly ClipStatus[]>(() =>
    slide.clips.map(() => "idle"),
  );
  const playback = useRef<Playback | null>(null);

  useEffect(
    () => () => {
      playback.current?.stop();
    },
    [],
  );

  function setClip(index: number, next: ClipStatus) {
    // Starting one clip stops the others, so every other clip is idle.
    setStatus(slide.clips.map((_, other) => (other === index ? next : "idle")));
  }

  function start(index: number) {
    const clip = slide.clips[index];
    if (clip === undefined) return;
    setClip(index, "loading");
    playback.current = audio.play(clip.sound.src, (event) => {
      if (event === "playing") {
        setClip(index, "playing");
        return;
      }
      // The clip is over and its element released: drop the handle too, so
      // nothing here keeps the finished clip alive.
      playback.current = null;
      setClip(index, event === "ended" ? "idle" : "failed");
    });
  }

  function stop(index: number) {
    playback.current?.stop();
    playback.current = null;
    setClip(index, "idle");
  }

  return (
    <section className="slide sounds">
      <h2 className="slide__heading">{slide.heading}</h2>
      {/* role="list" keeps list semantics without bullets in every browser. */}
      <ul className="sounds__clips" role="list">
        {slide.clips.map((clip, index) => (
          <Clip
            key={index}
            description={clip.sound.description}
            status={status[index] ?? "idle"}
            onPlay={() => {
              start(index);
            }}
            onStop={() => {
              stop(index);
            }}
          />
        ))}
      </ul>
    </section>
  );
}

const { sound } = ui.slides;

/**
 * One clip. It has a single button whose label changes (Play, Stop, Try
 * again), so keyboard focus stays on it through every state.
 */
function Clip({
  description,
  status,
  onPlay,
  onStop,
}: {
  readonly description: string;
  readonly status: ClipStatus;
  readonly onPlay: () => void;
  readonly onStop: () => void;
}) {
  const descriptionId = useId();
  const busy = status === "loading" || status === "playing";
  const labels = [
    [sound.play, status === "idle"],
    [sound.stop, busy],
    [sound.retry, status === "failed"],
  ] as const;

  return (
    <li className="sounds__clip">
      <p id={descriptionId} className="sounds__description">
        {description}
      </p>
      <button
        type="button"
        className="button sounds__button"
        aria-describedby={descriptionId}
        onClick={busy ? onStop : onPlay}
      >
        {/* All labels share one cell, so the button keeps one width. */}
        {labels.map(([label, shown]) => (
          <span
            key={label}
            className={shown ? undefined : "sounds__label--hidden"}
            aria-hidden={!shown}
          >
            {label}
          </span>
        ))}
      </button>
      <p className="sounds__status" role="status">
        {status === "loading" && sound.loading}
        {status === "failed" && sound.failed}
      </p>
    </li>
  );
}
