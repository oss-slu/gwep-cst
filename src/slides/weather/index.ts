import { slideComponents } from "../components.ts";
import { defineSlide } from "../types.ts";
import { weatherCmsFields } from "./cms.ts";
import { weatherFields } from "./schema.ts";

export const weatherSlide = defineSlide({
  type: "weather",
  label: "Weather: thermometer",
  fields: weatherFields,
  cmsFields: weatherCmsFields,
  loadComponent: slideComponents["weather"],
});
