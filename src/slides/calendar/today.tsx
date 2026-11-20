import { createContext, useContext, type ReactNode } from "react";
import { calendarDateIn, viewerTimeZone, type CalendarDate } from "./date.ts";

const FixedToday = createContext<CalendarDate | undefined>(undefined);

/** Pins "today" to a fixed date, for tests and previews (or a player that pins a session's date). */
export function TodayProvider({
  date,
  children,
}: {
  readonly date: CalendarDate;
  readonly children: ReactNode;
}) {
  return <FixedToday value={date}>{children}</FixedToday>;
}

/**
 * Today's date for the calendar slides.
 *
 * Without a TodayProvider it is read each time a calendar slide renders, from
 * the current moment in the viewer's time zone (the facilitator's screen,
 * which remote participants also see). Nothing is stored: a player left open
 * overnight shows the new date the next time the slide renders, but a slide
 * that stays on screen without re-rendering keeps the old one (see M0-06).
 */
export function useToday(): CalendarDate {
  return useContext(FixedToday) ?? calendarDateIn(new Date(), viewerTimeZone());
}
