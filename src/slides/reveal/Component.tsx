import { useId, useState } from "react";
import { ui } from "../../app/copy.ts";
import { SlideImage } from "../image/SlideImage.tsx";
import type { SlideProps } from "../types.ts";
import type { RevealSlideData } from "./schema.ts";
import "../slides.css";
import "./reveal.css";

/**
 * A question with a picture. The answer is not on the page until the
 * facilitator presses Reveal answer; pressing again hides it. Focus stays
 * on the button, and the answer is announced politely when it appears.
 */
export default function RevealSlide({ slide }: SlideProps<RevealSlideData>) {
  const answerId = useId();
  const [revealed, setRevealed] = useState(false);
  const { show, hide } = ui.slides.reveal;

  return (
    <section className="slide reveal">
      <h2 className="slide__heading">{slide.prompt}</h2>
      <SlideImage image={slide.image} />
      <button
        type="button"
        className="button reveal__toggle"
        aria-expanded={revealed}
        aria-controls={answerId}
        onClick={() => {
          setRevealed((shown) => !shown);
        }}
      >
        {/* Both labels share one cell, so the button keeps the width of the
            longer one and does not move when its label changes. The hidden
            label is left out of the button's name. */}
        <span
          className={revealed ? "reveal__label--hidden" : undefined}
          aria-hidden={revealed}
        >
          {show}
        </span>
        <span
          className={revealed ? undefined : "reveal__label--hidden"}
          aria-hidden={!revealed}
        >
          {hide}
        </span>
      </button>
      <div id={answerId} className="reveal__answer" aria-live="polite">
        {revealed && <p className="slide__text">{slide.answer}</p>}
      </div>
    </section>
  );
}
