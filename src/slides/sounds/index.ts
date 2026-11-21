import { slideComponents } from "../components.ts";
import { defineSlide } from "../types.ts";
import { soundsCmsFields } from "./cms.ts";
import { soundsFields } from "./schema.ts";

export const soundsSlide = defineSlide({
  type: "sounds",
  label: "Sounds: play clips and guess",
  fields: soundsFields,
  cmsFields: soundsCmsFields,
  loadComponent: slideComponents["sounds"],
});
