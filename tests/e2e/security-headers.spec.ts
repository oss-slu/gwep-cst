import { expect, test } from "@playwright/test";
import { findRule, parseHeadersFile } from "../support/headers";

const viewports = [
  { name: "phone", width: 375, height: 667 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "shared screen", width: 1920, height: 1080 },
];

// The preview server does not apply public/_headers, so this test adds the
// site-wide headers to every response, the way the host would.
for (const viewport of viewports) {
  test(`app shell runs under the site headers on a ${viewport.name}`, async ({
    page,
    request,
  }) => {
    await page.setViewportSize({
      width: viewport.width,
      height: viewport.height,
    });
    const headersFile = await (await request.get("/_headers")).text();
    const siteHeaders = findRule(parseHeadersFile(headersFile), "/*").headers;

    await page.route("**/*", async (route) => {
      const response = await route.fetch();
      await route.fulfill({
        response,
        headers: { ...response.headers(), ...siteHeaders },
      });
    });

    const violations: string[] = [];
    page.on("console", (message) => {
      if (
        message.type() === "error" &&
        message.text().includes("Content Security Policy")
      ) {
        violations.push(message.text());
      }
    });

    const response = await page.goto("/");
    expect(response?.headers()["content-security-policy"]).toBe(
      siteHeaders["content-security-policy"],
    );
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(violations).toEqual([]);
  });
}
