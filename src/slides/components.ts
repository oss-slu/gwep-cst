// The code of every slide type, loaded on demand. The single list of
// component loaders: each slide module's loadComponent is the entry here,
// and the app shell uses it to start downloading the opening slide's code
// early, without loading the schemas (see src/app/SessionRoute.tsx).

export const slideComponents = {
  title: () => import("./title/Component.tsx"),
  "calendar-day": () => import("./calendar-day/Component.tsx"),
  "calendar-month": () => import("./calendar-month/Component.tsx"),
  "calendar-year": () => import("./calendar-year/Component.tsx"),
  weather: () => import("./weather/Component.tsx"),
  reveal: () => import("./reveal/Component.tsx"),
  sounds: () => import("./sounds/Component.tsx"),
} as const;

/** Starts downloading a slide type's code; unknown types are ignored. */
export function startComponentDownload(type: string): void {
  const load = (
    slideComponents as Readonly<Record<string, () => Promise<unknown>>>
  )[type];
  load?.().catch(() => undefined);
}
