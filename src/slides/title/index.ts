import { defineSlide } from "../types.ts";
import { titleCmsFields } from "./cms.ts";
import { titleFields } from "./schema.ts";

export const titleSlide = defineSlide({
  type: "title",
  label: "Title (welcome or closing)",
  fields: titleFields,
  cmsFields: titleCmsFields,
  loadComponent: () => import("./Component.tsx"),
});
