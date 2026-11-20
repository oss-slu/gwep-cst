import { CalendarSlide } from "../calendar/CalendarSlide.tsx";
import { monthName } from "../calendar/date.ts";
import { useToday } from "../calendar/today.tsx";
import type { SlideProps } from "../types.ts";
import type { CalendarMonthSlideData } from "./schema.ts";

/** Today's month. */
export default function CalendarMonthSlide({
  slide,
}: SlideProps<CalendarMonthSlideData>) {
  const today = useToday();
  return <CalendarSlide heading={slide.heading} value={monthName(today)} />;
}
