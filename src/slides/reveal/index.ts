import { defineSlide } from "../types.ts";
import { revealCmsFields } from "./cms.ts";
import { revealFields } from "./schema.ts";

export const revealSlide = defineSlide({
  type: "reveal",
  label: "Reveal: picture with a hidden answer",
  fields: revealFields,
  cmsFields: revealCmsFields,
  loadComponent: () => import("./Component.tsx"),
});
