import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

// The viewer never loads the content editor: no Decap code in its files and
// no requests to unpkg, /admin or the local CMS backend, so it works the
// same whether or not the local CMS is running.

test("the built viewer contains no editor code", () => {
  const files = [
    "dist/index.html",
    ...readdirSync("dist/assets").map((name) => join("dist/assets", name)),
  ];
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    expect(text, file).not.toMatch(/decap|unpkg|localhost:8081/i);
  }
});

test("walking through Orientation makes no editor or CMS requests", async ({
  page,
}) => {
  const requests: URL[] = [];
  page.on("request", (request) => requests.push(new URL(request.url())));

  await page.goto("/");
  await page.getByRole("link", { name: "Orientation" }).click();
  for (let n = 1; n <= 11; n += 1) {
    await expect(page.locator(".player__position")).toHaveText(
      `Slide ${String(n)} of 11`,
    );
    if (n < 11) await page.keyboard.press("ArrowRight");
  }
  await page.waitForLoadState("networkidle");

  expect(requests.length).toBeGreaterThan(0);
  for (const url of requests) {
    expect(url.origin, url.href).toBe("http://localhost:4173");
    expect(url.pathname, url.href).not.toMatch(/^\/admin/);
  }
});
