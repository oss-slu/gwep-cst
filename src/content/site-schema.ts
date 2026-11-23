import { z } from "zod";

// content/site.json holds the site name and every piece of interface text.
// The app imports it directly; this schema checks it at build time.

const text = z.string().trim().min(1, "Text must not be empty");

function template(...placeholders: readonly string[]) {
  return text.refine(
    (value) => placeholders.every((name) => value.includes(`{${name}}`)),
    `Text must contain ${placeholders.map((name) => `{${name}}`).join(" and ")}`,
  );
}

const message = z.strictObject({ heading: text, text });

export const siteSchema = z.strictObject({
  name: text,
  ui: z.strictObject({
    loading: text,
    backToSessions: text,
    sessionList: z.strictObject({
      intro: text,
      heading: text,
      start: text,
      comingSoon: text,
    }),
    player: z.strictObject({
      previous: text,
      next: text,
      controls: text,
      position: template("current", "total"),
    }),
    slides: z.strictObject({
      reveal: z.strictObject({ show: text, hide: text }),
      image: z.strictObject({ failed: text, retry: text, retrying: text }),
      sound: z.strictObject({
        play: text,
        stop: text,
        retry: text,
        loading: text,
        failed: text,
      }),
    }),
    errors: z.strictObject({
      pageNotFound: message,
      sessionNotFound: message,
      sessionComingSoon: message,
      slideNotFound: message.extend({ firstSlide: text }),
      invalidContent: message,
      loadFailed: message.extend({ retry: text, reload: text }),
    }),
  }),
});
