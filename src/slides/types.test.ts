import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { TestTextSlide } from "../../tests/support/test-slide-fields";
import { defineSlide, type SlideProps } from "./types.ts";

// Components with the right and the wrong props, for the compile-time checks.
const TextComponent = ({ slide }: SlideProps<TestTextSlide>) => slide.text;
const NumberComponent = ({ slide }: SlideProps<{ count: number }>) =>
  slide.count;

const textField = {
  name: "text",
  label: "Text",
  widget: "string",
} as const;

describe("defineSlide at compile time", () => {
  it("accepts a component whose props match the schema-derived slide", () => {
    const module = defineSlide({
      type: "test-text",
      label: "Text",
      fields: { text: z.string().trim().min(1) },
      cmsFields: [textField],
      loadComponent: () => Promise.resolve({ default: TextComponent }),
    });
    expect(module.type).toBe("test-text");
  });

  it("rejects incompatible component props, reserved fields and missing parts", () => {
    // Each line below must fail to compile; `tsc` fails if one compiles.
    const attempts = [
      () =>
        defineSlide({
          type: "test-text",
          label: "Text",
          fields: { text: z.string() },
          cmsFields: [textField],
          // @ts-expect-error the component expects a different slide shape
          loadComponent: () => Promise.resolve({ default: NumberComponent }),
        }),
      () =>
        defineSlide({
          type: "test-text",
          label: "Text",
          // @ts-expect-error "id" is reserved and cannot be redefined
          fields: { id: z.string() },
          cmsFields: [],
          loadComponent: () => Promise.resolve({ default: () => null }),
        }),
      () =>
        defineSlide({
          type: "test-text",
          label: "Text",
          // @ts-expect-error "type" is reserved and cannot be redefined
          fields: { type: z.string() },
          cmsFields: [],
          loadComponent: () => Promise.resolve({ default: () => null }),
        }),
      () =>
        // @ts-expect-error a slide module must supply CMS fields
        defineSlide({
          type: "test-text",
          label: "Text",
          fields: {},
          loadComponent: () => Promise.resolve({ default: () => null }),
        }),
      () =>
        // @ts-expect-error a slide module must supply a component loader
        defineSlide({
          type: "test-text",
          label: "Text",
          fields: {},
          cmsFields: [],
        }),
    ];
    expect(attempts).toHaveLength(5);
  });
});

describe("defineSlide at run time", () => {
  const loadComponent = () => Promise.resolve({ default: () => null });

  it.each(["id", "type", "notes"])(
    "throws when fields redefine the reserved %s field",
    (name) => {
      const fields = { [name]: z.string() };
      expect(() =>
        defineSlide({
          type: "test-text",
          label: "Text",
          fields,
          cmsFields: [{ name, label: name, widget: "string" }],
          loadComponent,
        }),
      ).toThrow(`redefines reserved field(s): ${name}`);
    },
  );

  it("throws when CMS fields do not match the schema fields", () => {
    expect(() =>
      defineSlide({
        type: "test-text",
        label: "Text",
        fields: { text: z.string(), caption: z.string() },
        cmsFields: [
          { name: "text", label: "Text", widget: "string" },
          { name: "subtitle", label: "Subtitle", widget: "string" },
        ],
        loadComponent,
      }),
    ).toThrow(
      'Slide type "test-text": CMS fields must match schema fields; missing caption; unknown subtitle',
    );
  });

  it("throws when a CMS field name is used twice", () => {
    expect(() =>
      defineSlide({
        type: "test-text",
        label: "Text",
        fields: { text: z.string() },
        cmsFields: [textField, { ...textField, label: "Text again" }],
        loadComponent,
      }),
    ).toThrow(
      'Slide type "test-text": CMS field(s) defined more than once: text',
    );
  });

  it("throws when a nested CMS field name is used twice", () => {
    expect(() =>
      defineSlide({
        type: "test-text",
        label: "Text",
        fields: { photo: z.string() },
        cmsFields: [
          {
            name: "photo",
            label: "Photo",
            widget: "object",
            fields: [
              { name: "alt", label: "Description", widget: "string" },
              { name: "alt", label: "Description again", widget: "string" },
            ],
          },
        ],
        loadComponent,
      }),
    ).toThrow("CMS field(s) defined more than once: photo.alt");
  });

  it("builds a strict schema with the shared fields and a literal type", () => {
    const module = defineSlide({
      type: "test-text",
      label: "Text",
      fields: { text: z.string() },
      cmsFields: [textField],
      loadComponent,
    });
    const ok = { type: "test-text", id: "welcome", notes: "n", text: "Hi" };
    expect(module.schema.safeParse(ok).success).toBe(true);
    expect(module.schema.safeParse({ ...ok, extra: 1 }).success).toBe(false);
    expect(module.schema.safeParse({ ...ok, type: "other" }).success).toBe(
      false,
    );
    expect(module.schema.safeParse({ ...ok, id: "Bad Id" }).success).toBe(
      false,
    );
  });
});
