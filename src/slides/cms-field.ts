// The content editor's field types (widgets) slide modules may use, typed so a field cannot be
// misspelled. Labels and hints are shown to GWEP editors, so write them in
// plain language.

interface CmsFieldBase {
  /** Must match the field name in the slide's schema. */
  readonly name: string;
  readonly label: string;
  /** Help text shown under the field. */
  readonly hint?: string;
  readonly required?: boolean;
}

export type CmsField =
  | (CmsFieldBase & {
      readonly widget: "string" | "text";
      readonly pattern?: readonly [regex: string, message: string];
    })
  | (CmsFieldBase & { readonly widget: "boolean" | "image" | "file" })
  | (CmsFieldBase & {
      readonly widget: "number";
      readonly value_type?: "int" | "float";
      readonly min?: number;
      readonly max?: number;
    })
  | (CmsFieldBase & {
      readonly widget: "select";
      readonly options: readonly string[];
    })
  | (CmsFieldBase & {
      readonly widget: "object" | "list";
      readonly fields: readonly CmsField[];
    });

/** CMS fields for an image, matching imageSchema in src/content/schema.ts. */
export function imageFields(
  name: string,
  label: string,
  hint?: string,
): CmsField {
  return {
    name,
    label,
    widget: "object",
    ...(hint === undefined ? {} : { hint }),
    fields: [
      { name: "src", label: "Picture", widget: "image" },
      {
        name: "alt",
        label: "Picture description",
        widget: "string",
        required: false,
        hint: "Describe the picture for someone who cannot see it. Leave empty only if the picture is decorative.",
      },
      {
        name: "decorative",
        label: "Decorative picture",
        widget: "boolean",
        required: false,
        hint: "Tick only if the picture adds nothing to the meaning of the slide.",
      },
      {
        name: "width",
        label: "Picture width in pixels",
        widget: "number",
        value_type: "int",
        min: 1,
        hint: "The width of the picture file, so the page can save its space while it loads.",
      },
      {
        name: "height",
        label: "Picture height in pixels",
        widget: "number",
        value_type: "int",
        min: 1,
      },
      {
        name: "variants",
        label: "Smaller copies",
        widget: "list",
        required: false,
        hint: "The same picture saved at other widths, with the same shape. Phones then download a smaller file.",
        fields: [
          { name: "src", label: "Picture", widget: "image" },
          {
            name: "width",
            label: "Width in pixels",
            widget: "number",
            value_type: "int",
            min: 1,
          },
        ],
      },
    ],
  };
}

/** CMS fields for a sound clip, matching audioSchema in src/content/schema.ts. */
export function audioFields(
  name: string,
  label: string,
  hint?: string,
): CmsField {
  return {
    name,
    label,
    widget: "object",
    ...(hint === undefined ? {} : { hint }),
    fields: [
      { name: "src", label: "Sound file", widget: "file" },
      {
        name: "description",
        label: "Sound description",
        widget: "string",
        hint: "Say in words what the sound is, for people who cannot hear it.",
      },
    ],
  };
}
