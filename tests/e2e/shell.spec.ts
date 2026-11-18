import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import site from "../../content/site.json" with { type: "json" };

const viewports = [
  { name: "phone", width: 375, height: 667 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "shared screen", width: 1920, height: 1080 },
];

test.describe("app shell without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("still has the page title", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(site.name);
  });
});

for (const viewport of viewports) {
  test.describe(`app shell on a ${viewport.name}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test.beforeEach(async ({ page }) => {
      await page.goto("/");
    });

    test("shows the site name as heading and page title", async ({ page }) => {
      await expect(
        page.getByRole("heading", { level: 1, name: site.name }),
      ).toBeVisible();
      await expect(page).toHaveTitle(site.name);
    });

    test("has no horizontal scroll", async ({ page }) => {
      const overflows = await page.evaluate(
        () =>
          document.documentElement.scrollWidth >
          document.documentElement.clientWidth,
      );
      expect(overflows).toBe(false);
    });

    test("uses body text of at least 24 px", async ({ page }) => {
      const fontSize = await page.evaluate(() =>
        parseFloat(getComputedStyle(document.body).fontSize),
      );
      expect(fontSize).toBeGreaterThanOrEqual(24);
    });

    test("has no serious or critical axe violations", async ({ page }) => {
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
      const blocking = results.violations.filter(
        (violation) =>
          violation.impact === "serious" || violation.impact === "critical",
      );
      expect(blocking).toEqual([]);
    });
  });
}
