import { z } from "zod/mini";
import { describeSchemaIssue } from "../content/schema-issue.ts";
import { calendarDaySlide } from "./calendar-day/index.ts";
import { calendarMonthSlide } from "./calendar-month/index.ts";
import { calendarYearSlide } from "./calendar-year/index.ts";
import { revealSlide } from "./reveal/index.ts";
import { soundsSlide } from "./sounds/index.ts";
import { titleSlide } from "./title/index.ts";
import { weatherSlide } from "./weather/index.ts";
import {
  isDefinedSlideModule,
  type AnySlideModule,
  type SlideComponent,
} from "./types.ts";

/** The validated slide data a module produces. */
export type SlideOf<M extends AnySlideModule> = z.output<M["schema"]>;

export interface SlideRegistry<S extends { readonly type: string }> {
  /** Registered slide types, in registration order. */
  readonly modules: readonly AnySlideModule[];
  /**
   * Checks one slide: its `type` must be registered, and the slide must then
   * pass that type's strict schema. There is no fallback schema.
   */
  readonly slideSchema: z.ZodMiniType<S>;
  /** Loads the component for a validated slide; nothing loads before this call. */
  loadComponent<T extends S>(slide: T): Promise<SlideComponent<T>>;
}

const slideTypeOnly = z.looseObject({ type: z.string() });

export function createSlideRegistry<const M extends readonly AnySlideModule[]>(
  modules: M,
): SlideRegistry<SlideOf<M[number]>> {
  type Slide = SlideOf<M[number]>;

  const byType = new Map<string, AnySlideModule>();
  for (const module of modules) {
    if (!isDefinedSlideModule(module)) {
      throw new Error(
        `Slide type "${module.type}" was not created with defineSlide(); register only defined slide modules`,
      );
    }
    if (byType.has(module.type)) {
      throw new Error(
        `Slide type "${module.type}" is registered more than once`,
      );
    }
    byType.set(module.type, module);
  }
  const registered = [...byType.keys()].join(", ") || "none yet";

  const slideSchema = z.pipe(
    z.unknown(),
    z.transform((value, ctx): Slide => {
      const typed = slideTypeOnly.safeParse(value);
      if (!typed.success) {
        for (const issue of typed.error.issues) {
          ctx.issues.push({
            code: "custom",
            input: value,
            path: issue.path,
            message: issue.message,
          });
        }
        return z.NEVER;
      }

      const module = byType.get(typed.data.type);
      if (module === undefined) {
        ctx.issues.push({
          code: "custom",
          input: value,
          path: ["type"],
          message: `Unknown slide type "${typed.data.type}". Registered types: ${registered}`,
        });
        return z.NEVER;
      }

      const result = module.schema.safeParse(value);
      if (!result.success) {
        for (const issue of result.error.issues) {
          ctx.issues.push({
            code: "custom",
            input: value,
            path: issue.path,
            message: describeSchemaIssue(issue),
          });
        }
        return z.NEVER;
      }
      return result.data as Slide;
    }),
  ) as unknown as z.ZodMiniType<Slide>;

  return {
    modules: [...byType.values()],
    slideSchema,
    async loadComponent<T extends Slide>(slide: T) {
      const module = byType.get(slide.type);
      if (module === undefined) {
        throw new Error(`Unknown slide type "${slide.type}"`);
      }
      const { default: Component } = await module.loadComponent();
      // Safe: the module was found by this slide's own type, and the slide
      // passed that module's schema, so its component accepts this slide.
      return Component as unknown as SlideComponent<T>;
    },
  };
}

/**
 * The production slide types. A slide whose type is not listed here is
 * rejected by validate-content and when the app loads a session.
 */
export const slideRegistry = createSlideRegistry([
  titleSlide,
  calendarDaySlide,
  calendarMonthSlide,
  calendarYearSlide,
  weatherSlide,
  revealSlide,
  soundsSlide,
]);
