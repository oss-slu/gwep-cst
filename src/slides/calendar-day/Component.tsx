import { CalendarSlide } from "../calendar/CalendarSlide.tsx";
import { weekdayName, fullDate } from "../calendar/date.ts";
import { useToday } from "../calendar/today.tsx";
import type { SlideProps } from "../types.ts";
import type { CalendarDaySlideData } from "./schema.ts";

/** Today's day of the week, with the full date below it. */
export default function CalendarDaySlide({
  slide,
}: SlideProps<CalendarDaySlideData>) {
  const today = useToday();
  return (
    <CalendarSlide
      heading={slide.heading}
      value={weekdayName(today)}
      detail={fullDate(today)}
    />
  );
}
