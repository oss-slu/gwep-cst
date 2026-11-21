import { hasText } from "../text.ts";
import "../slides.css";

/** The shared layout of the day, month and year slides: text only, no marks. */
export function CalendarSlide({
  heading,
  value,
  detail,
  prominent = false,
}: {
  readonly heading: string | undefined;
  readonly value: string;
  readonly detail?: string;
  readonly prominent?: boolean;
}) {
  return (
    <section className="slide">
      {hasText(heading) && <h2 className="slide__heading">{heading}</h2>}
      <p
        className={
          prominent
            ? "calendar__value calendar__value--year"
            : "calendar__value"
        }
      >
        {value}
      </p>
      {detail !== undefined && <p className="calendar__detail">{detail}</p>}
    </section>
  );
}
