import { ui } from "../app/copy.ts";

/** Shown while a page, session or slide downloads. */
export function Loading() {
  return (
    <p role="status" className="loading">
      {ui.loading}
    </p>
  );
}
