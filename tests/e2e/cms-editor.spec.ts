import { execFile, spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, readFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// The local content editor end to end, in a disposable copy made by
// npm run cms:demo-copy: Decap at /admin (loaded from unpkg, so this needs
// internet), the local backend in git mode (npm run cms:local) and the copy's
// own dev server. Nothing here touches this repository's content.
const run = promisify(execFile);
const SITE = "http://localhost:5173";
const UPLOAD = "tests/fixtures/media/cms-replacement.png";
const NEW_PROMPT = "Demo edit: which state is this landmark in?";
const NEW_ALT = "Replacement placeholder picture for the demo edit.";

// Terminal colour codes: ESC "[" digits "m".
const COLOUR_CODES = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");

let root: string;
let copy: string;
const servers: ChildProcess[] = [];

function start(args: string[], ready: string): Promise<ChildProcess> {
  const child = spawn(process.execPath, args, { cwd: copy });
  servers.push(child);
  return new Promise((resolve, reject) => {
    let output = "";
    const timer = setTimeout(() => {
      reject(new Error(`Not ready (${ready}):\n${output}`));
    }, 60_000);
    const watch = (chunk: Buffer) => {
      // Drop terminal colour codes, which Vite puts inside its "Local:" line.
      output += chunk.toString().replace(COLOUR_CODES, "");
      if (output.includes(ready)) {
        clearTimeout(timer);
        resolve(child);
      }
    };
    child.stdout.on("data", watch);
    child.stderr.on("data", watch);
  });
}

let backend: ChildProcess;

test.describe.configure({ mode: "serial" });
test.use({ viewport: { width: 1400, height: 1000 }, actionTimeout: 20_000 });

test.beforeAll(async () => {
  test.setTimeout(180_000);
  root = await mkdtemp(join(tmpdir(), "cms-editor-"));
  // cms:demo-copy takes no arguments and makes ../gwep-cst-cms-demo, so run
  // it from a temporary clone of this repository.
  const clone = join(root, "gwep-cst");
  await run("git", ["clone", "--quiet", process.cwd(), clone]);
  await symlink(
    join(process.cwd(), "node_modules"),
    join(clone, "node_modules"),
  );
  await run(
    process.execPath,
    [join(process.cwd(), "scripts/cms-demo-copy.ts")],
    { cwd: clone },
  );
  copy = join(root, "gwep-cst-cms-demo");
  backend = await start(
    ["scripts/cms-local.ts"],
    "listening on 127.0.0.1:8081",
  );
  await start(
    ["node_modules/vite/bin/vite.js", "--port", "5173", "--strictPort"],
    "Local:",
  );
});

test.afterAll(async () => {
  for (const server of servers) server.kill("SIGTERM");
  await rm(root, { recursive: true, force: true });
});

async function openOrientation(page: Page) {
  await page.goto(`${SITE}/admin/`);
  await page.getByRole("button", { name: "Login" }).click();
  await page.getByRole("link", { name: "Orientation" }).click();
  await expect(
    page.getByRole("textbox", { name: "Session title" }),
  ).toBeVisible();
}

/** The first Reveal slide, expanded. Decap's list buttons have no names (see the axe test). */
async function openFirstReveal(page: Page) {
  const slide = page
    .locator('[class*="SortableListItem"]')
    .filter({ visible: true })
    .nth(6);
  await expect(slide.locator("label").first()).toHaveText(/Reveal/);
  await slide.locator("button").first().click();
  await expect(slide.getByRole("textbox", { name: "Question" })).toBeVisible();
  return slide;
}

test("/admin is served with the local editor policy, and redirects like the host", async ({
  request,
}) => {
  for (const path of ["/admin", "/admin/index.html"]) {
    const response = await request.get(`${SITE}${path}`, { maxRedirects: 0 });
    expect(response.status(), path).toBe(307);
    expect(response.headers().location, path).toBe("/admin/");
    expect(response.headers()["content-security-policy"], path).toContain(
      "'unsafe-eval'",
    );
  }
  const page = await request.get(`${SITE}/admin/`);
  expect(page.status()).toBe(200);
  const headers = page.headers();
  expect(headers["content-security-policy"]).toContain(
    "script-src 'self' 'unsafe-eval' https://unpkg.com/decap-cms@3.17.3/dist/decap-cms.js",
  );
  expect(headers["content-security-policy"]).toContain(
    "connect-src 'self' http://localhost:8081 blob:",
  );
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  // The viewer on the same server keeps none of the editor's allowances.
  const viewer = await request.get(`${SITE}/`);
  expect(viewer.headers()["content-security-policy"] ?? "").not.toContain(
    "unsafe-eval",
  );
});

test("the editor loads under that policy and signs in with no credentials", async ({
  page,
}) => {
  const violations: string[] = [];
  page.on("console", (message) => {
    if (message.text().includes("Content Security Policy"))
      violations.push(message.text());
  });
  await openOrientation(page);
  expect(violations).toEqual([]);
  // The local backend needs no account, token or password.
  expect(await page.context().cookies()).toEqual([]);
});

test("keyboard: Tab reaches the controls with a visible focus ring", async ({
  page,
}) => {
  await page.goto(`${SITE}/admin/`);
  const login = page.getByRole("button", { name: "Login" });
  await expect(login).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(login).toBeFocused();
  await page.keyboard.press("Enter");
  const sessions = page.getByRole("link", { name: "Sessions" });
  await expect(sessions).toBeVisible();
  await sessions.focus();
  await page.keyboard.press("Enter");
  await page.getByRole("link", { name: "Orientation" }).focus();
  await page.keyboard.press("Enter");
  // Decap shows text-field focus by turning the field's border and label
  // blue: compare the border before and after reaching it by Tab.
  const title = page.getByRole("textbox", { name: "Session title" });
  await expect(title).toBeVisible();
  const border = () =>
    title.evaluate((element) => getComputedStyle(element).borderTopColor);
  const unfocused = await border();
  await page.getByRole("spinbutton", { name: "Session number" }).focus();
  await page.keyboard.press("Tab");
  await expect(title).toBeFocused();
  await expect.poll(border).not.toBe(unfocused);
  test.info().annotations.push({
    type: "text field focus",
    description: `border ${unfocused} -> ${await border()}`,
  });
  // Buttons get a focus outline.
  const add = page.getByRole("button", { name: "Add slides" });
  await add.focus();
  expect(
    await add.evaluate((element) => getComputedStyle(element).outlineStyle),
  ).not.toBe("none");
});

test("axe finds no serious or critical issues in the editor", async ({
  page,
}) => {
  // Known failure: Decap 3.17.3's own interface fails axe (unnamed icon
  // buttons, contrast, an untitled frame) and its media cards cannot be
  // reached by Tab. Recorded as failed; follow-up to fix or replace the
  // editor in M1. If Decap is fixed this test passes and CI flags it.
  test.fail();
  const blocking: string[] = [];
  const check = async (view: string) => {
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    for (const violation of results.violations) {
      if (violation.impact === "serious" || violation.impact === "critical") {
        blocking.push(
          `${view}: ${violation.id} (${violation.impact}) x${String(violation.nodes.length)}`,
        );
      }
    }
  };
  await page.goto(`${SITE}/admin/`);
  await page.getByRole("button", { name: "Login" }).waitFor();
  await check("login");
  await page.getByRole("button", { name: "Login" }).click();
  await page.getByRole("link", { name: "Orientation" }).waitFor();
  await check("collection");
  await page.getByRole("link", { name: "Orientation" }).click();
  await page.getByRole("textbox", { name: "Session title" }).waitFor();
  await check("entry");
  test.info().annotations.push({
    type: "axe (editor)",
    description: blocking.join("; "),
  });
  console.log(`EDITOR AXE: ${blocking.join("; ")}`);
  expect(blocking).toEqual([]);
});

test("an Orientation prompt, picture and description are edited, saved and published locally", async ({
  page,
}) => {
  test.setTimeout(120_000);
  page.on("dialog", (dialog) => void dialog.accept());
  await openOrientation(page);
  const slide = await openFirstReveal(page);
  await slide.getByRole("textbox", { name: "Question" }).fill(NEW_PROMPT);

  await slide.getByRole("button", { name: "Choose different image" }).click();
  await page.locator('input[type="file"]').setInputFiles(UPLOAD);
  // Decap selects an uploaded file itself.
  await expect(
    page
      .locator('[class*="-Card "]')
      .filter({ hasText: "cms-replacement.png" })
      .first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Choose selected" }).click();
  await slide
    .getByRole("textbox", { name: "Picture description (optional)" })
    .fill(NEW_ALT);
  await slide
    .getByRole("spinbutton", { name: "Picture width in pixels" })
    .fill("1000");
  await slide
    .getByRole("spinbutton", { name: "Picture height in pixels" })
    .fill("750");
  // The old variants no longer match the new picture.
  for (const path of [
    "/media/orientation/placeholder-1-800.png",
    "/media/orientation/placeholder-1-400.png",
  ]) {
    const variant = slide
      .locator('[class*="SortableListItem"]')
      .filter({ has: page.getByText(path, { exact: true }) })
      .last();
    await variant
      .locator('[class*="TopBar"]')
      .first()
      .locator("button")
      .last()
      .click();
  }

  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Entry saved")).toBeVisible();
  await page.getByRole("button", { name: /^Status: / }).click();
  await page.getByRole("menuitem", { name: "Ready" }).click();
  await expect(page.getByRole("button", { name: "Status: Ready" })).toBeVisible(
    { timeout: 15_000 },
  );
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await page.getByRole("menuitem", { name: "Publish now" }).click();
  await expect(page.getByText("Entry published")).toBeVisible({
    timeout: 15_000,
  });

  // Saved in the copy's git history, by the demo identity, and nowhere else.
  const git = async (...args: string[]) =>
    (await run("git", args, { cwd: copy })).stdout.trim();
  expect(await git("remote")).toBe("");
  expect(await git("log", "-1", "--format=%an <%ae>")).toBe(
    "CMS demo <cms-demo@localhost>",
  );
  expect(await git("status", "--porcelain")).toBe("");
  const changed = (await git("show", "--name-only", "--format=", "HEAD"))
    .split("\n")
    .sort();
  expect(changed).toEqual([
    "content/sessions/orientation.json",
    "public/media/orientation/cms-replacement.png",
  ]);

  const session = JSON.parse(
    await readFile(join(copy, "content/sessions/orientation.json"), "utf8"),
  ) as {
    slides: { id: string; type: string; prompt?: string; image?: unknown }[];
  };
  const reveal = session.slides.find(
    (candidate) => candidate.id === "landmark-state",
  );
  expect(reveal?.prompt).toBe(NEW_PROMPT);
  expect(reveal?.image).toMatchObject({
    src: "/media/orientation/cms-replacement.png",
    alt: NEW_ALT,
    width: 1000,
    height: 750,
  });
  expect((reveal?.image as { variants?: unknown[] }).variants ?? []).toEqual(
    [],
  );
  // The other three GWEP prompts are untouched.
  expect(
    session.slides
      .filter((candidate) => candidate.type === "reveal")
      .slice(1)
      .map((s) => s.prompt),
  ).toEqual([
    "The famous landmark is located in what country?",
    "What countries are known for this food?",
    "What country is known for this type of clothing?",
  ]);

  // Both validators pass on the saved content and media.
  for (const script of [
    "scripts/validate-content.ts",
    "scripts/validate-media.ts",
  ]) {
    const { stdout } = await run(process.execPath, [join(copy, script)], {
      cwd: copy,
    });
    expect(stdout, script).toContain("no problems");
  }
});

test("the published edit appears in the player", async ({ page }) => {
  await page.goto(`${SITE}/sessions/orientation/landmark-state`);
  await expect(page.locator(".player__slide h2")).toHaveText(NEW_PROMPT);
  const picture = page.getByAltText(NEW_ALT);
  await expect(picture).toBeVisible();
  expect(
    await picture.evaluate(
      (image: HTMLImageElement) => new URL(image.currentSrc).pathname,
    ),
  ).toBe("/media/orientation/cms-replacement.png");
});

test("with the local backend stopped, the editor reports it and the player still works", async ({
  page,
}) => {
  backend.kill("SIGTERM");
  await new Promise((resolve) => setTimeout(resolve, 1000));
  await page.goto(`${SITE}/admin/`);
  await page.getByRole("button", { name: "Login" }).click();
  const shown = await page.locator("body").innerText();
  test.info().annotations.push({
    type: "editor without backend",
    description: shown.slice(0, 300),
  });
  await expect(page.getByRole("link", { name: "Orientation" })).toHaveCount(0);

  await page.goto(`${SITE}/sessions/orientation/landmark-state`);
  await expect(page.locator(".player__slide h2")).toHaveText(NEW_PROMPT);
});
