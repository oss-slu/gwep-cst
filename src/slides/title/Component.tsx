import type { SlideProps } from "../types.ts";
import { hasText } from "../text.ts";
import type { TitleSlideData } from "./schema.ts";
import "../slides.css";

/** A welcome or closing slide: the heading and optional text from the session. */
export default function TitleSlide({ slide }: SlideProps<TitleSlideData>) {
  return (
    <section className="slide">
      <h2 className="slide__heading">{slide.heading}</h2>
      {hasText(slide.subheading) && (
        <p className="slide__text">{slide.subheading}</p>
      )}
    </section>
  );
}
