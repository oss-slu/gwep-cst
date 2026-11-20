import type { ReactNode } from "react";
import { z } from "zod";
import { baseSlideShape } from "../content/schema.ts";
import type { CmsField } from "./cms-field.ts";

// A slide module is the single source for one slide type: its schema, its
// lazily loaded component and its CMS fields. Modules are .ts files and load
// their component with import(), so Node can read a module (for validation
// and CMS generation) without loading React components.

// Only defineSlide() can make a slide module. The brand makes a hand-built
// object fail to compile, and definedModules catches one forced through with
// a cast, so the registry can trust every module's schema and component.
declare const slideModuleBrand: unique symbol;
const definedModules = new WeakSet();

/** True only for modules created by defineSlide(). */
export function isDefinedSlideModule(module: object): boolean {
  return definedModules.has(module);
}

/** Field names every slide already has; slide-specific fields cannot reuse them. */
export const RESERVED_FIELDS = ["id", "type", "notes"] as const;
type ReservedField = (typeof RESERVED_FIELDS)[number];

type SlideShape<
  T extends string,
  F extends z.ZodRawShape,
> = typeof baseSlideShape & {
  type: z.ZodLiteral<T>;
} & F;

/** The validated data for a slide type, derived from its schema. */
export type SlideData<T extends string, F extends z.ZodRawShape> = z.output<
  z.ZodObject<SlideShape<T, F>>
>;

export interface SlideProps<S> {
  readonly slide: S;
}

/** Slide components are function components (AGENTS.md) that render one slide. */
export type SlideComponent<S> = (props: SlideProps<S>) => ReactNode;

export interface SlideModule<T extends string, S> {
  readonly [slideModuleBrand]: true;
  readonly type: T;
  /** Name of the slide type shown to editors. */
  readonly label: string;
  /** Strict schema: unknown fields are rejected. */
  readonly schema: z.ZodType<S>;
  readonly cmsFields: readonly CmsField[];
  readonly loadComponent: () => Promise<{ default: SlideComponent<S> }>;
}

/** Any slide module, with its slide type erased, for use in the registry. */
export interface AnySlideModule {
  readonly [slideModuleBrand]: true;
  readonly type: string;
  readonly label: string;
  readonly schema: z.ZodType<{ readonly id: string; readonly type: string }>;
  readonly cmsFields: readonly CmsField[];
  readonly loadComponent: () => Promise<{ default: SlideComponent<never> }>;
}

export interface SlideDefinition<T extends string, F extends z.ZodRawShape> {
  readonly type: T;
  readonly label: string;
  /** Slide-specific fields. Must not redefine id, type or notes. */
  readonly fields: F & { readonly [K in ReservedField]?: never };
  readonly cmsFields: readonly CmsField[];
  readonly loadComponent: () => Promise<{
    default: SlideComponent<SlideData<T, F>>;
  }>;
}

/**
 * Defines a slide type. The schema is always a strict object built from the
 * shared base fields, a literal `type`, and the slide's own fields.
 */
export function defineSlide<const T extends string, F extends z.ZodRawShape>(
  definition: SlideDefinition<T, F>,
): SlideModule<T, SlideData<T, F>> {
  const fieldNames = Object.keys(definition.fields);
  const reserved = fieldNames.filter((name) =>
    (RESERVED_FIELDS as readonly string[]).includes(name),
  );
  if (reserved.length > 0) {
    throw new Error(
      `Slide type "${definition.type}" redefines reserved field(s): ${reserved.join(", ")}`,
    );
  }

  const duplicates = duplicateFieldNames(definition.cmsFields);
  if (duplicates.length > 0) {
    throw new Error(
      `Slide type "${definition.type}": CMS field(s) defined more than once: ${duplicates.join(", ")}`,
    );
  }

  const cmsNames = definition.cmsFields.map((field) => field.name);
  const missing = fieldNames.filter((name) => !cmsNames.includes(name));
  const extra = cmsNames.filter((name) => !fieldNames.includes(name));
  if (missing.length > 0 || extra.length > 0) {
    throw new Error(
      `Slide type "${definition.type}": CMS fields must match schema fields` +
        (missing.length > 0 ? `; missing ${missing.join(", ")}` : "") +
        (extra.length > 0 ? `; unknown ${extra.join(", ")}` : ""),
    );
  }

  const shape = {
    ...baseSlideShape,
    type: z.literal(definition.type),
    ...definition.fields,
  } as SlideShape<T, F>;

  const module = {
    type: definition.type,
    label: definition.label,
    schema: z.strictObject(shape),
    cmsFields: definition.cmsFields,
    loadComponent: definition.loadComponent,
  };
  definedModules.add(module);
  // The brand exists only in the type system; definedModules is its run-time
  // counterpart.
  return module as typeof module & { readonly [slideModuleBrand]: true };
}

/** Names used twice in a field list, checked in nested lists too ("image.alt"). */
function duplicateFieldNames(
  fields: readonly CmsField[],
  prefix = "",
): string[] {
  const seen = new Set<string>();
  const duplicates: string[] = [];
  for (const field of fields) {
    const name = `${prefix}${field.name}`;
    if (seen.has(field.name)) duplicates.push(name);
    seen.add(field.name);
    if ("fields" in field)
      duplicates.push(...duplicateFieldNames(field.fields, `${name}.`));
  }
  return duplicates;
}
