import { execFile, spawn, type ChildProcess } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";

// The local content editor end to end, in a disposable copy made by
// npm run cms:demo-copy: Sveltia CMS at /admin, built and served by the
// copy's own dev server, working on the copy's folder. Nothing here touches
// this repository's content. The dev server gets a free port chosen at run
// time, so a demo left running or an earlier run does not get in the way.
//
// Playwright cannot operate the browser's native folder picker: it aborts
// showDirectoryPicker. So the page gets a picker that returns a folder in
// the browser's private storage, filled with the copy's files, and what the
// editor saves there is written back to the copy. The editor's folder guard
// runs on top of this picker exactly as it does on the real one. Choosing
// the real copy with the native picker is a manual check (README).
const run = promisify(execFile);
/** The copy's dev server, as its "Local:" line reports it. */
let SITE = "";
const UPLOAD = "tests/fixtures/media/cms-replacement.png";
const NEW_PROMPT = "Demo edit: which state is this landmark in?";
const NEW_ALT = "Replacement placeholder picture for the demo edit.";
const LOCAL = "Work with Local Repository";
// Sveltia CMS checks GitHub's status page; the editor's policy refuses it,
// so the request never leaves the browser.
const GITHUB_STATUS_ORIGIN = "https://www.githubstatus.com";

// Terminal colour codes: ESC "[" digits "m".
const COLOUR_CODES = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");

let root: string;
let copy: string;
const servers: ChildProcess[] = [];

interface Entry {
  readonly path: string;
  readonly data: string;
}

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
  const server = spawn(
    process.execPath,
    [
      "node_modules/vite/bin/vite.js",
      "--port",
      String(await freePort()),
      "--strictPort",
    ],
    { cwd: copy },
  );
  servers.push(server);
  await new Promise<void>((resolve, reject) => {
    let output = "";
    const timer = setTimeout(() => {
      reject(new Error(`Dev server not ready:\n${output}`));
    }, 60_000);
    const watch = (chunk: Buffer) => {
      output += chunk.toString().replace(COLOUR_CODES, "");
      const local = /Local:\s+(http:\/\/localhost:\d+)/.exec(output)?.[1];
      if (local !== undefined) {
        SITE = local;
        clearTimeout(timer);
        resolve();
      }
    };
    server.stdout.on("data", watch);
    server.stderr.on("data", watch);
  });
});

test.afterAll(async () => {
  // Wait for each server to exit, so its port is free for the next run.
  await Promise.all(
    servers.map(
      (server) =>
        new Promise<void>((resolve) => {
          if (server.exitCode !== null || server.signalCode !== null) {
            resolve();
            return;
          }
          server.once("exit", () => {
            resolve();
          });
          server.kill("SIGTERM");
        }),
    ),
  );
  await rm(root, { recursive: true, force: true });
});

/** A port no other program is listening on right now. */
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "localhost", () => {
      const address = probe.address();
      probe.close(() => {
        if (typeof address === "object" && address !== null) {
          resolve(address.port);
        } else {
          reject(new Error("No port was assigned"));
        }
      });
    });
  });
}

async function walk(folder: string): Promise<string[]> {
  const entries = await readdir(join(copy, folder), { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) =>
      entry.isDirectory()
        ? walk(join(folder, entry.name))
        : Promise.resolve([join(folder, entry.name)]),
    ),
  );
  return nested.flat();
}

/** The copy's files the editor uses, with its git metadata. */
async function copyFiles(): Promise<Entry[]> {
  const paths = [
    ...(await walk("content")),
    ...(await walk("public/media")),
    ".git/HEAD",
    ".git/config",
    ".git/cms-demo-copy.json",
  ];
  return Promise.all(
    paths.map(async (path) => ({
      path,
      data: (await readFile(join(copy, path))).toString("base64"),
    })),
  );
}

/**
 * Opens /admin with the stand-in folder picker over a folder holding
 * `entries`, and waits for the editor's start screen.
 */
async function openEditor(page: Page, entries: readonly Entry[]) {
  await page.addInitScript(() => {
    window.showDirectoryPicker = async () =>
      (await navigator.storage.getDirectory()).getDirectoryHandle("repo", {
        create: true,
      });
  });
  await page.goto(`${SITE}/admin/`);
  await page.evaluate(async (files) => {
    const storage = await navigator.storage.getDirectory();
    await storage.removeEntry("repo", { recursive: true }).catch(() => {});
    const repo = await storage.getDirectoryHandle("repo", { create: true });
    for (const { path, data } of files) {
      const parts = path.split("/");
      let folder = repo;
      for (const part of parts.slice(0, -1)) {
        folder = await folder.getDirectoryHandle(part, { create: true });
      }
      const file = await folder.getFileHandle(parts.at(-1) ?? "", {
        create: true,
      });
      const writable = await file.createWritable();
      await writable.write(Uint8Array.from(atob(data), (c) => c.charCodeAt(0)));
      await writable.close();
    }
  }, entries);
  await page.reload();
  await expect(page.getByRole("button", { name: LOCAL })).toBeVisible();
}

/** The files the editor saved in the stand-in folder, written to the copy. */
async function saveToCopy(page: Page, before: readonly Entry[]) {
  const known = new Map(before.map((entry) => [entry.path, entry.data]));
  const saved = await page.evaluate(async () => {
    const read = async (
      folder: FileSystemDirectoryHandle,
      prefix: string,
    ): Promise<{ path: string; data: string }[]> => {
      const files: { path: string; data: string }[] = [];
      for await (const [name, handle] of folder.entries()) {
        const path = prefix === "" ? name : `${prefix}/${name}`;
        if (handle instanceof FileSystemDirectoryHandle) {
          files.push(...(await read(handle, path)));
        } else if (handle instanceof FileSystemFileHandle) {
          const bytes = new Uint8Array(
            await (await handle.getFile()).arrayBuffer(),
          );
          let text = "";
          for (const byte of bytes) text += String.fromCharCode(byte);
          files.push({ path, data: btoa(text) });
        }
      }
      return files;
    };
    const storage = await navigator.storage.getDirectory();
    return read(await storage.getDirectoryHandle("repo"), "");
  });
  const changed = saved.filter(
    (file) =>
      !file.path.startsWith(".git/") && known.get(file.path) !== file.data,
  );
  for (const file of changed) {
    await mkdir(dirname(join(copy, file.path)), { recursive: true });
    await writeFile(join(copy, file.path), Buffer.from(file.data, "base64"));
  }
  return changed.map((file) => file.path).sort();
}

/** A field in the edit pane (the preview pane repeats the same key paths). */
const field = (page: Page, keyPath: string) =>
  page
    .getByRole("group", { name: "Edit Content" })
    .locator(`[data-key-path="${keyPath}"]`);

/** Scrolls the edit pane until a field has rendered (fields render as they come into view). */
async function reachField(page: Page, keyPath: string) {
  const target = field(page, keyPath);
  const parent = field(page, keyPath.split(".").slice(0, -1).join("."));
  for (let tries = 0; tries < 30 && (await target.count()) === 0; tries += 1) {
    if ((await parent.count()) > 0) await parent.scrollIntoViewIfNeeded();
    await page.mouse.move(300, 600);
    await page.mouse.wheel(0, tries % 2 === 0 ? 200 : -100);
    await page.waitForTimeout(150);
  }
  await target.scrollIntoViewIfNeeded();
  return target;
}

/** Presses Tab (or Shift+Tab) until `target` has focus: keyboard reachable. */
async function tabTo(
  page: Page,
  target: Locator,
  direction: "forward" | "backward" = "forward",
  limit = 80,
) {
  for (let presses = 0; presses < limit; presses += 1) {
    // A control that has not rendered yet appears as Tab scrolls to it.
    if (
      (await target.count()) === 1 &&
      (await target.evaluate((element) => element === document.activeElement))
    )
      return;
    await page.keyboard.press(direction === "forward" ? "Tab" : "Shift+Tab");
    await page.waitForTimeout(40);
  }
  throw new Error(`Tab did not reach ${target.toString()}`);
}

/** The focused control shows a visible focus indicator. */
async function expectFocusVisible(target: Locator) {
  await expect(target).toBeFocused();
  const style = await target.evaluate((element) => {
    const s = getComputedStyle(element);
    return {
      outline: s.outlineStyle,
      width: s.outlineWidth,
      shadow: s.boxShadow,
    };
  });
  const ring =
    (style.outline !== "none" && parseFloat(style.width) > 0) ||
    style.shadow !== "none";
  expect(ring, `${target.toString()}: ${JSON.stringify(style)}`).toBe(true);
}

/** The origin of the URL a policy violation names, if it names one. */
function blockedOrigin(text: string): string | undefined {
  // Chrome names the URL in quotes in one message and bare in the other.
  const url = /https?:\/\/[^\s'"]+/.exec(text)?.[0];
  if (url === undefined) return undefined;
  try {
    return new URL(url).origin;
  } catch {
    return undefined;
  }
}

/** Policy violations other than the refused GitHub status check. */
function watchPolicy(page: Page): string[] {
  const violations: string[] = [];
  page.on("console", (message) => {
    const text = message.text();
    if (
      text.includes("Content Security Policy") &&
      blockedOrigin(text) !== GITHUB_STATUS_ORIGIN
    )
      violations.push(text);
  });
  return violations;
}

async function blockingAxe(page: Page, state: string, found: string[]) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  for (const violation of results.violations) {
    if (violation.impact === "serious" || violation.impact === "critical") {
      found.push(
        `${state}: ${violation.id} (${violation.impact}) x${String(violation.nodes.length)}`,
      );
    }
  }
}

/** Slide 7 (the first Reveal slide), expanded in the edit pane. */
async function openFirstReveal(page: Page) {
  await page.getByRole("button", { name: "Collapse All" }).first().click();
  const item = page.getByRole("group", { name: "Item 7 of 11" });
  // Slides render as they scroll into view.
  for (let tries = 0; tries < 30 && (await item.count()) === 0; tries += 1) {
    await page.mouse.move(300, 700);
    await page.mouse.wheel(0, 400);
    await page.waitForTimeout(150);
  }
  await item.getByRole("button", { name: "Expand" }).click();
  await expect(item.getByRole("textbox", { name: "Question" })).toBeVisible();
  return item;
}

test("/admin is served with the deployed editor policy, and redirects like the host", async ({
  request,
}) => {
  const deployed =
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; media-src 'self' blob:; font-src 'self'; connect-src 'self' blob: data:; manifest-src 'self' blob:; frame-src blob:; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
  for (const path of ["/admin", "/admin/index.html"]) {
    const response = await request.get(`${SITE}${path}`, { maxRedirects: 0 });
    expect(response.status(), path).toBe(307);
    expect(response.headers().location, path).toBe("/admin/");
    expect(response.headers()["content-security-policy"], path).toBe(deployed);
  }
  const page = await request.get(`${SITE}/admin/`);
  expect(page.status()).toBe(200);
  const headers = page.headers();
  expect(headers["content-security-policy"]).toBe(deployed);
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  // The built editor: no live-reload client, no inline script.
  const html = await page.text();
  expect(html).not.toContain("/@vite/client");
  expect(html).not.toMatch(/<script(?![^>]*\bsrc=)[^>]*>/i);
});

test("the editor shows how to open the demo copy, and opens it with no account", async ({
  page,
}) => {
  const violations = watchPolicy(page);
  await openEditor(page, await copyFiles());
  const notice = page.getByRole("status").filter({
    has: page.getByRole("heading", { name: "Editing on this computer" }),
  });
  await expect(notice).toContainText("gwep-cst-cms-demo");
  await page.getByRole("button", { name: LOCAL }).click();
  await expect(page.getByRole("row", { name: "Orientation" })).toBeVisible();
  await expect(notice).toHaveCount(0);
  expect(violations).toEqual([]);
  expect(await page.context().cookies()).toEqual([]);
});

test("another folder is refused with recovery steps, and nothing opens", async ({
  page,
}) => {
  const files = await copyFiles();
  for (const [folder, heading] of [
    [
      files.filter((file) => file.path !== ".git/cms-demo-copy.json"),
      "This folder is not the demo copy",
    ],
    [
      files.map((file) =>
        file.path === ".git/config"
          ? {
              path: file.path,
              data: Buffer.from(
                `${Buffer.from(file.data, "base64").toString()}[remote "origin"]\n\turl = https://github.com/oss-slu/gwep-cst.git\n`,
              ).toString("base64"),
            }
          : file,
      ),
      "This copy is linked to GitHub",
    ],
  ] as const) {
    await openEditor(page, folder);
    await page.getByRole("button", { name: LOCAL }).click();
    const alert = page.getByRole("alert").filter({
      has: page.getByRole("heading", { name: heading }),
    });
    await expect(alert).toBeVisible();
    await expect(alert.getByRole("listitem").first()).toBeVisible();
    await expect(page.getByRole("heading", { name: heading })).toBeFocused();
    await expect(page.getByRole("row", { name: "Orientation" })).toHaveCount(0);
    // Hide returns focus to where it was.
    await alert.getByRole("button", { name: "Hide this message" }).click();
    await expect(alert).toHaveCount(0);
  }
});

test("without a folder picker, the editor says local editing needs Chrome or Edge", async ({
  page,
}) => {
  await page.addInitScript(() => {
    delete window.showDirectoryPicker;
  });
  await page.goto(`${SITE}/admin/`);
  await expect(
    page.getByRole("heading", { name: "Local editing needs Chrome or Edge" }),
  ).toBeVisible();
});

test("axe finds no serious or critical issues in the editor", async ({
  page,
}) => {
  const found: string[] = [];
  await openEditor(page, await copyFiles());
  await blockingAxe(page, "start", found);
  await page.getByRole("button", { name: LOCAL }).click();
  await page.getByRole("row", { name: "Orientation" }).waitFor();
  await blockingAxe(page, "collection", found);
  await page.getByRole("row", { name: "Orientation" }).click();
  await page.getByRole("textbox", { name: "Session title" }).waitFor();
  await blockingAxe(page, "entry", found);
  await openFirstReveal(page);
  await blockingAxe(page, "reveal slide", found);
  await (
    await reachField(page, "slides.6.image.src")
  )
    .getByRole("button", { name: "Replace" })
    .click();
  await page.getByRole("dialog", { name: "Select Image" }).waitFor();
  await blockingAxe(page, "image dialog", found);
  test.info().annotations.push({
    type: "axe (editor)",
    description: found.join("; ") || "none",
  });
  expect(found).toEqual([]);
});

test("every slide is in the Tab order: Tab alone reaches slide 7 and the closing slide", async ({
  page,
}) => {
  // Sveltia CMS 0.263.0 renders slides only as they scroll into view; at
  // this screen size Tab used to stop at slide 6 (admin/render-at-once.ts).
  test.setTimeout(120_000);
  await openEditor(page, await copyFiles());
  await page.getByRole("button", { name: LOCAL }).click();
  await page.getByRole("row", { name: "Orientation" }).click();
  const title = page.getByRole("textbox", { name: "Session title" });
  await title.focus();
  for (const [item, heading] of [
    ["Item 7 of 11", /7 Reveal/],
    ["Item 11 of 11", /11 Title/],
  ] as const) {
    // The slide's own Expand or Collapse button, which shows its number
    // and type.
    const toggle = page
      .getByRole("group", { name: item })
      .getByRole("button", { name: /^(Expand|Collapse)$/ })
      .first();
    await tabTo(page, toggle, "forward", 400);
    await expect(toggle).toHaveText(heading);
    await expectFocusVisible(toggle);
  }
});

test("the Orientation edit, by keyboard with visible focus: saved, valid and shown in the player", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const violations = watchPolicy(page);
  const before = await copyFiles();
  await openEditor(page, before);

  const start = page.getByRole("button", { name: LOCAL });
  await tabTo(page, start);
  await expectFocusVisible(start);
  await page.keyboard.press("Enter");

  const orientation = page.getByRole("row", { name: "Orientation" });
  await orientation.waitFor();
  await tabTo(page, orientation);
  await expectFocusVisible(orientation);
  await page.keyboard.press("Enter");
  await page.getByRole("textbox", { name: "Session title" }).waitFor();

  const collapse = page.getByRole("button", { name: "Collapse All" }).first();
  await tabTo(page, collapse);
  await expectFocusVisible(collapse);
  await page.keyboard.press("Enter");
  const item = page.getByRole("group", { name: "Item 7 of 11" });
  const expand = item.getByRole("button", { name: "Expand" });
  await tabTo(page, expand);
  await expectFocusVisible(expand);
  await page.keyboard.press("Enter");

  const question = item.getByRole("textbox", { name: "Question" });
  await tabTo(page, question);
  await expectFocusVisible(question);
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type(NEW_PROMPT);

  const replace = field(page, "slides.6.image.src").getByRole("button", {
    name: "Replace",
  });
  await tabTo(page, replace);
  await expectFocusVisible(replace);
  const dialog = page.getByRole("dialog", { name: "Select Image" });
  // Escape closes the picture dialog and returns focus to Replace Image.
  await page.keyboard.press("Enter");
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(replace).toBeFocused();
  await expect(replace).toHaveAccessibleName("Replace Image");
  await page.keyboard.press("Enter");
  const upload = dialog.getByRole("button", { name: "Upload" });
  await tabTo(page, upload);
  await expectFocusVisible(upload);
  // Enter on Upload makes the editor click its file input, which asks the
  // browser for its file chooser. Headless Chromium does not always open
  // that chooser for a keyboard-started click on a slow machine, so the
  // test checks the click reached the input, then gives the file to that
  // input directly: the change the chooser would make. The real chooser is
  // a manual check (README).
  await page.evaluate(() => {
    for (const input of document.querySelectorAll<HTMLInputElement>(
      'input[type="file"]',
    )) {
      input.addEventListener(
        "click",
        () => {
          input.dataset.keyboardClicked = "true";
        },
        { once: true },
      );
    }
  });
  await page.keyboard.press("Enter");
  const fileInput = page.locator(
    'input[type="file"][data-keyboard-clicked="true"]',
  );
  await expect(fileInput).toHaveCount(1);
  await fileInput.setInputFiles(UPLOAD);
  await expect(
    dialog.getByRole("option", {
      name: /cms-replacement\.png/,
      selected: true,
    }),
  ).toBeVisible();
  const insert = dialog.getByRole("button", { name: "Insert" });
  await tabTo(page, insert);
  await expectFocusVisible(insert);
  await page.keyboard.press("Enter");
  await expect(dialog).toHaveCount(0);

  for (const [keyPath, role, name, value] of [
    ["slides.6.image.alt", "textbox", "Picture description", NEW_ALT],
    ["slides.6.image.width", "spinbutton", "Picture width in pixels", "1000"],
    ["slides.6.image.height", "spinbutton", "Picture height in pixels", "750"],
  ] as const) {
    const input = field(page, keyPath).getByRole(role, { name });
    await tabTo(page, input);
    await expectFocusVisible(input);
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.type(value);
  }

  // The old variants no longer match the new picture.
  const variants = field(page, "slides.6.image.variants");
  for (let removed = 0; removed < 2; removed += 1) {
    const remove = variants.getByRole("button", { name: "Remove" }).first();
    await tabTo(page, remove);
    await expectFocusVisible(remove);
    await page.keyboard.press("Enter");
  }
  await expect(variants.getByRole("group", { name: /^Item / })).toHaveCount(0);

  const save = page.getByRole("button", { name: "Save" });
  // Save is in the toolbar at the top, before every field.
  await tabTo(page, save, "backward", 300);
  await expectFocusVisible(save);
  await page.keyboard.press("Enter");
  // Saved once the session file in the folder has the new question.
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          const storage = await navigator.storage.getDirectory();
          let folder = await storage.getDirectoryHandle("repo");
          for (const name of ["content", "sessions"]) {
            folder = await folder.getDirectoryHandle(name);
          }
          const file = await folder.getFileHandle("orientation.json");
          return (await file.getFile()).text();
        }),
      { timeout: 15_000 },
    )
    .toContain(NEW_PROMPT);

  // What the editor saved, written to the copy: the session and the picture.
  expect(await saveToCopy(page, before)).toEqual([
    "content/sessions/orientation.json",
    "public/media/orientation/cms-replacement.png",
  ]);
  expect(violations).toEqual([]);

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
      .map((slide) => slide.prompt),
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

  // The copy's player shows the edit. The dev server learns about the new
  // picture from its file watcher, so wait until it serves it.
  await expect
    .poll(
      async () =>
        (
          await page.request.get(
            `${SITE}/media/orientation/cms-replacement.png`,
          )
        ).status(),
      { timeout: 15_000 },
    )
    .toBe(200);
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
