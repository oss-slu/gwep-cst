import { describe, expect, it } from "vitest";
import site from "../../content/site.json" with { type: "json" };
import { siteSchema } from "../content/site-schema.ts";
import { format } from "./copy.ts";

describe("interface text", () => {
  it("content/site.json passes its schema", () => {
    expect(siteSchema.safeParse(site).error?.issues).toBeUndefined();
  });

  it("rejects empty text and a missing placeholder", () => {
    const broken = structuredClone(site);
    broken.ui.player.next = " ";
    broken.ui.player.position = "Slide {current}";
    const issues = siteSchema.safeParse(broken).error?.issues ?? [];
    expect(issues.map((issue) => issue.path.join("."))).toEqual([
      "ui.player.next",
      "ui.player.position",
    ]);
  });

  it("fills placeholders and leaves unknown ones as written", () => {
    expect(format("Slide {current} of {total}", { current: 2, total: 5 })).toBe(
      "Slide 2 of 5",
    );
    expect(format("{unknown}", {})).toBe("{unknown}");
  });
});
