import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

// Runs against the test-only request-fixture build (vite.config.ts), which
// holds a second session, childhood, that the catalog marks not available.
// The build manifest names the file of each source module, so these tests
// can state exactly which downloads each step needs.
const ORIGIN = "http://localhost:4177";
const OUT_DIR = "dist-request-fixture";

interface ManifestChunk {
  readonly file: string;
  readonly imports?: readonly string[];
  readonly css?: readonly string[];
}
type Manifest = Readonly<Record<string, ManifestChunk>>;

function readManifest(): Manifest {
  return JSON.parse(
    readFileSync(`${OUT_DIR}/.vite/manifest.json`, "utf8"),
  ) as Manifest;
}

const SOURCES = {
  entry: "index.html",
  player: "src/player/PlayerPage.tsx",
  orientation: "content/sessions/orientation.json",
  childhood: "tests/fixtures/requests/sessions/childhood.json",
  title: "src/slides/title/Component.tsx",
  day: "src/slides/calendar-day/Component.tsx",
  month: "src/slides/calendar-month/Component.tsx",
  year: "src/slides/calendar-year/Component.tsx",
  weather: "src/slides/weather/Component.tsx",
  sounds: "src/slides/sounds/Component.tsx",
  reveal: "src/slides/reveal/Component.tsx",
} as const;

/** The files a module needs: its own, its static imports' and their CSS. */
function filesFor(manifest: Manifest, ...keys: string[]): Set<string> {
  const files = new Set<string>();
  const visit = (key: string) => {
    const chunk = manifest[key];
    if (chunk === undefined) throw new Error(`Not in the manifest: ${key}`);
    if (files.has(chunk.file)) return;
    files.add(chunk.file);
    for (const css of chunk.css ?? []) files.add(css);
    for (const imported of chunk.imports ?? []) visit(imported);
  };
  keys.forEach(visit);
  return files;
}

/** Records every built asset the page requests. */
function recordAssets(page: Page) {
  const requested: string[] = [];
  page.on("request", (request) => {
    const { pathname } = new URL(request.url());
    if (pathname.startsWith("/assets/")) requested.push(pathname.slice(1));
  });
  return {
    /** Assets requested since the last call. */
    take(): Set<string> {
      return new Set(requested.splice(0));
    },
  };
}

function file(manifest: Manifest, key: keyof typeof SOURCES): string {
  const chunk = manifest[SOURCES[key]];
  if (chunk === undefined) throw new Error(`Not in the manifest: ${key}`);
  return chunk.file;
}

test.use({ baseURL: ORIGIN });

test("the build contains a second session that is not available", () => {
  const manifest = readManifest();
  const chunk = readFileSync(
    `${OUT_DIR}/${file(manifest, "childhood")}`,
    "utf8",
  );
  expect(chunk).toContain("REQUEST_FIXTURE_SECOND_SESSION");
  expect(file(manifest, "childhood")).not.toBe(file(manifest, "orientation"));
});

test("each step downloads only what it needs", async ({ page }) => {
  const manifest = readManifest();
  const assets = recordAssets(page);
  const entry = filesFor(manifest, SOURCES.entry);

  // 1. The list: the entry chunk and its CSS only. No player, no schema
  //    library, no session data, no slide components.
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Orientation" })).toBeVisible();
  expect(assets.take()).toEqual(entry);

  // 2. Opening Orientation: the player, Orientation's data, the title slide
  //    component (the first slide is a title), and the preloaded code of
  //    the next slide (calendar day). Nothing further ahead.
  await page.getByRole("link", { name: "Orientation" }).click();
  await expect(page.locator(".slide h2")).toHaveText("Welcome to Orientation");
  await page.waitForLoadState("networkidle");
  const opened = assets.take();
  const expected = new Set(
    [
      ...filesFor(
        manifest,
        SOURCES.player,
        SOURCES.orientation,
        SOURCES.title,
        SOURCES.day,
      ),
    ].filter((name) => !entry.has(name)),
  );
  expect(opened).toEqual(expected);
  for (const other of [
    "childhood",
    "month",
    "year",
    "weather",
    "sounds",
    "reveal",
  ] as const) {
    expect(opened.has(file(manifest, other)), other).toBe(false);
  }
  // Preloading never mounts the next slide.
  await expect(page.locator(".slide")).toHaveCount(1);

  // 3. The next slide was already downloaded; now only the slide after it
  //    (calendar month) is preloaded.
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.locator(".player__position")).toHaveText("Slide 2 of 11");
  await page.waitForLoadState("networkidle");
  const loaded = new Set([...entry, ...opened]);
  expect(assets.take()).toEqual(
    new Set(
      [...filesFor(manifest, SOURCES.month)].filter(
        (name) => !loaded.has(name),
      ),
    ),
  );

  // 4. Back to the welcome slide: everything is already downloaded.
  await page.getByRole("button", { name: "Previous" }).click();
  await expect(page.locator(".player__position")).toHaveText("Slide 1 of 11");
  await page.waitForLoadState("networkidle");
  expect(assets.take()).toEqual(new Set());
});

test("a deep link loads the current slide's component, not the first slide's", async ({
  page,
}) => {
  const manifest = readManifest();
  const assets = recordAssets(page);
  await page.goto("/sessions/orientation/year");
  await expect(page.locator(".player__position")).toHaveText("Slide 4 of 11");
  await page.waitForLoadState("networkidle");
  const requested = assets.take();
  expect(requested.has(file(manifest, "year"))).toBe(true);
  // The next slide (weather) is preloaded; nothing else.
  expect(requested.has(file(manifest, "weather"))).toBe(true);
  for (const other of [
    "title",
    "day",
    "month",
    "childhood",
    "sounds",
    "reveal",
  ] as const) {
    expect(requested.has(file(manifest, other)), other).toBe(false);
  }
});

test("an unavailable session's address downloads nothing beyond the list", async ({
  page,
}) => {
  const manifest = readManifest();
  const assets = recordAssets(page);
  await page.goto("/sessions/childhood");
  await expect(
    page.getByRole("heading", { level: 1, name: "Coming soon" }),
  ).toBeVisible();
  expect(assets.take()).toEqual(filesFor(manifest, SOURCES.entry));
});

test("a failed preload of the next slide's code does not stop that slide loading", async ({
  page,
}) => {
  const manifest = readManifest();
  const reveal = file(manifest, "reveal");
  let failures = 0;
  // Fail only the first request for the Reveal code: the speculative one.
  await page.route(`**/${reveal}`, async (route) => {
    if (failures === 0) {
      failures += 1;
      await route.abort("internetdisconnected");
    } else {
      await route.fallback();
    }
  });
  await page.goto("/sessions/orientation/sounds");
  await expect(page.locator(".player__position")).toHaveText("Slide 6 of 11");
  await expect.poll(() => failures).toBe(1);

  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.locator(".player__position")).toHaveText("Slide 7 of 11");
  await expect(
    page.getByRole("button", { name: "Reveal answer" }),
  ).toBeVisible();
});
