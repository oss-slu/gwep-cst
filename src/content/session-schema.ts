import type { z } from "zod/mini";
import { slideRegistry } from "../slides/registry.ts";
import { createSessionSchema } from "./schema.ts";

/**
 * The schema every production session must pass, both at build time
 * (validate-content) and when the app loads a session. Slides are checked
 * against the registered slide types only.
 */
export const sessionSchema = createSessionSchema(slideRegistry.slideSchema);

export type Session = z.output<typeof sessionSchema>;
