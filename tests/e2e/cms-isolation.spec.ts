import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { effectiveHeaders, parseHeadersFile } from "../../scripts/headers.ts";

// The viewer never loads the content editor: no editor code in its files
// and no requests to /admin or any other origin, so it works the same
// whether or not anyone is editing.

test("the built viewer contains no editor code", () => {
  const files = [
    "dist/index.html",
    ...readdirSync("dist/assets").map((name) => join("dist/assets", name)),
  ];
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    expect(text, file).not.toMatch(/sveltia|decap|unpkg/i);
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

test("the dev and preview servers serve /admin with exactly the deployed policy", async ({
  request,
}) => {
  const deployed = effectiveHeaders(
    parseHeadersFile(readFileSync("public/_headers", "utf8")),
    "/admin/",
  )["content-security-policy"];
  // The production preview and the dev server.
  for (const origin of ["http://localhost:4173", "http://localhost:4175"]) {
    const response = await request.get(`${origin}/admin/`);
    const policy = response.headers()["content-security-policy"];
    expect(policy, origin).toBe(deployed);
    expect(policy, origin).not.toContain("unsafe-eval");
    expect(await response.text(), origin).not.toContain("/@vite/client");
  }
});
