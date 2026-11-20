import { CalendarSlide } from "../calendar/CalendarSlide.tsx";
import { useToday } from "../calendar/today.tsx";
import type { SlideProps } from "../types.ts";
import type { CalendarYearSlideData } from "./schema.ts";

/** Today's year, in the largest text of the calendar slides. */
export default function CalendarYearSlide({
  slide,
}: SlideProps<CalendarYearSlideData>) {
  const today = useToday();
  return (
    <CalendarSlide
      heading={slide.heading}
      value={String(today.year)}
      prominent
    />
  );
}
