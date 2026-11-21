import site from "../../content/site.json" with { type: "json" };

/** The site name and all interface text, from content/site.json. */
export const siteName = site.name;
export const ui = site.ui;

/** Fills "{name}" placeholders: format("Slide {current}", { current: 2 }). */
export function format(
  template: string,
  values: Readonly<Record<string, string | number>>,
): string {
  return template.replace(/\{(\w+)\}/g, (placeholder, name: string) => {
    const value = values[name];
    return value === undefined ? placeholder : String(value);
  });
}
