import type { SlideProps } from "../../src/slides/types.ts";
import type { TestMediaSlide as Slide } from "./test-slide-fields.ts";

export default function TestMediaSlide({ slide }: SlideProps<Slide>) {
  return <img src={slide.image.src} alt={slide.image.alt} />;
}
