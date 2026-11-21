import { useId, useState, type CSSProperties } from "react";
import type { SlideProps } from "../types.ts";
import { startLevel, type WeatherSlideData } from "./schema.ts";
import "../slides.css";
import "./weather.css";

/**
 * One thermometer with a movable marker. The control is a native range
 * input laid over the levels: arrow keys, Home and End move the marker, and
 * one click or tap on a level's words or on the tube sets it there.
 */
export default function WeatherSlide({ slide }: SlideProps<WeatherSlideData>) {
  const headingId = useId();
  const { levels } = slide;
  const [level, setLevel] = useState(() => startLevel(levels.length));
  const current = levels[level];

  return (
    <section className="slide weather">
      <h2 id={headingId} className="slide__heading">
        {slide.heading}
      </h2>
      <div
        className="thermometer"
        style={{ "--levels": levels.length } as CSSProperties}
      >
        {/* The levels are drawn hottest at the top. The range input below
            covers them and is what keyboard, pointer and screen reader use. */}
        <ol className="thermometer__levels" aria-hidden="true">
          {levels
            .map((entry, index) => (
              <li
                key={index}
                className={
                  index <= level
                    ? "thermometer__level thermometer__level--filled"
                    : "thermometer__level"
                }
              >
                <span className="thermometer__label">{entry.label}</span>
                <span className="thermometer__segment" />
              </li>
            ))
            .reverse()}
        </ol>
        <input
          type="range"
          className="thermometer__input"
          min={0}
          max={levels.length - 1}
          step={1}
          value={level}
          aria-labelledby={headingId}
          aria-valuetext={current?.label}
          onChange={(event) => {
            setLevel(Number(event.currentTarget.value));
          }}
        />
      </div>
    </section>
  );
}
