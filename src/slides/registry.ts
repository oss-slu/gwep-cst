import { z } from "zod";
import type { AnySlideModule, SlideComponent } from "./types.ts";

/** The validated slide data a module produces. */
export type SlideOf<M extends AnySlideModule> = z.output<M["schema"]>;

export interface SlideRegistry<S extends { readonly type: string }> {
  /** Registered slide types, in registration order. */
  readonly modules: readonly AnySlideModule[];
  /**
   * Checks one slide: its `type` must be registered, and the slide must then
   * pass that type's strict schema. There is no fallback schema.
   */
  readonly slideSchema: z.ZodType<S>;
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
    if (byType.has(module.type)) {
      throw new Error(
        `Slide type "${module.type}" is registered more than once`,
      );
    }
    byType.set(module.type, module);
  }
  const registered = [...byType.keys()].join(", ") || "none yet";

  const slideSchema = z.unknown().transform((value, ctx): Slide => {
    const typed = slideTypeOnly.safeParse(value);
    if (!typed.success) {
      for (const issue of typed.error.issues) {
        ctx.addIssue({
          code: "custom",
          path: issue.path,
          message: issue.message,
        });
      }
      return z.NEVER;
    }

    const module = byType.get(typed.data.type);
    if (module === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["type"],
        message: `Unknown slide type "${typed.data.type}". Registered types: ${registered}`,
      });
      return z.NEVER;
    }

    const result = module.schema.safeParse(value);
    if (!result.success) {
      for (const issue of result.error.issues) {
        ctx.addIssue({
          code: "custom",
          path: issue.path,
          message: issue.message,
        });
      }
      return z.NEVER;
    }
    return result.data as Slide;
  });

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
 * The production slide types. Provisional: the list is empty until the first
 * slide modules land (#8). Until then every slide in a session is rejected as
 * an unknown type.
 */
export const slideRegistry = createSlideRegistry([]);
