import type { SlideProps } from "../../src/slides/types.ts";
import type { TestTextSlide as Slide } from "./test-slide-fields.ts";

export default function TestTextSlide({ slide }: SlideProps<Slide>) {
  return <p data-marker="TEST_TEXT_SLIDE_COMPONENT">{slide.text}</p>;
}
