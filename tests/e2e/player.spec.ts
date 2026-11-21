import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import site from "../../content/site.json" with { type: "json" };
import orientation from "../../content/sessions/orientation.json" with { type: "json" };

// Runs against the production build with the real Orientation fixture.
const { ui } = site;
const ids = orientation.slides.map((slide) => slide.id);
const total = ids.length;
const path = (id: string) => `/sessions/orientation/${id}`;
const position = (n: number) =>
  ui.player.position
    .replace("{current}", String(n))
    .replace("{total}", String(total));

const viewports = [
  { name: "phone", width: 375, height: 667 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "shared screen", width: 1920, height: 1080 },
];

const slideArea = (page: Page, n: number) =>
  page.getByRole("region", { name: position(n) });
const next = (page: Page) => page.getByRole("button", { name: ui.player.next });
const previous = (page: Page) =>
  page.getByRole("button", { name: ui.player.previous });

/** Waits until slide n of the session is shown, with its own address. */
async function expectSlide(page: Page, n: number) {
  const id = ids[n - 1] ?? "";
  await expect(page).toHaveURL(path(id));
  await expect(slideArea(page, n).locator(".slide")).toBeVisible();
  await expect(page.locator(".player__position")).toHaveText(position(n));
}

async function expectNoBlockingAxe(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(
    results.violations.filter(
      (violation) =>
        violation.impact === "serious" || violation.impact === "critical",
    ),
  ).toEqual([]);
}

test.describe("entering from the list", () => {
  test("clicking Orientation opens its first slide with focus on the slide", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Orientation" }).click();
    await expectSlide(page, 1);
    await expect(slideArea(page, 1)).toBeFocused();
    await expect(
      page.getByRole("heading", { level: 2, name: "Welcome to Orientation" }),
    ).toBeVisible();
  });

  test("Tab reaches only Orientation in the list, and Enter opens it", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { level: 1, name: site.name }),
    ).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Orientation" })).toBeFocused();
    await page.keyboard.press("Tab");
    // Nothing else on the page takes focus: the thirteen others are text,
    // so the next Tab leaves the page.
    expect(
      await page.evaluate(
        () =>
          document.activeElement === null ||
          document.activeElement === document.body,
      ),
    ).toBe(true);
    await expect(page.getByText(ui.sessionList.comingSoon)).toHaveCount(13);

    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Enter");
    await expectSlide(page, 1);
  });
});

test.describe("moving between slides", () => {
  test("by keyboard: arrows and page keys, focus stays put", async ({
    page,
  }) => {
    await page.goto(path(ids[0] ?? ""));
    await expectSlide(page, 1);
    await page.keyboard.press("ArrowRight");
    await expectSlide(page, 2);
    await page.keyboard.press("PageDown");
    await expectSlide(page, 3);
    await page.keyboard.press("PageUp");
    await expectSlide(page, 2);
    await page.keyboard.press("ArrowLeft");
    await expectSlide(page, 1);
    await expect(slideArea(page, 1)).toBeFocused();

    // Buttons work from the keyboard too, and keep focus.
    await next(page).focus();
    await page.keyboard.press("Enter");
    await expectSlide(page, 2);
    await expect(next(page)).toBeFocused();
    await page.keyboard.press("Space");
    await expectSlide(page, 3);
    await expect(next(page)).toBeFocused();
  });

  test("by pointer: Next and Previous, focus moves to the slide at the end", async ({
    page,
  }) => {
    await page.goto(path(ids[0] ?? ""));
    await expect(previous(page)).toBeDisabled();
    for (let n = 2; n <= total; n += 1) {
      await next(page).click();
      await expectSlide(page, n);
    }
    await expect(next(page)).toBeDisabled();
    // The pressed button is now disabled, so focus moved to the slide.
    await expect(slideArea(page, total)).toBeFocused();
    await previous(page).click();
    await expectSlide(page, total - 1);
    await expect(previous(page)).toBeFocused();
  });

  test("a key that disables the focused button moves focus to the slide", async ({
    page,
  }) => {
    await page.goto(path(ids[1] ?? ""));
    await previous(page).focus();
    await page.keyboard.press("ArrowLeft");
    await expectSlide(page, 1);
    await expect(slideArea(page, 1)).toBeFocused();
  });

  test("mounts only the current slide; the previous one unmounts", async ({
    page,
  }) => {
    await page.goto(path(ids[0] ?? ""));
    await expectSlide(page, 1);
    const first = await page.locator(".slide").elementHandle();
    await next(page).click();
    await expectSlide(page, 2);
    expect(await first.evaluate((element) => element.isConnected)).toBe(false);
    await expect(page.locator(".slide")).toHaveCount(1);

    // Same slide type twice in a row (closing is a title like welcome), by
    // an in-app move to the address: still a fresh mount.
    await page.goto(path(ids[0] ?? ""));
    await expectSlide(page, 1);
    const welcome = await page.locator(".slide").elementHandle();
    await page.evaluate(
      (address) => {
        history.pushState(null, "", address);
        dispatchEvent(new PopStateEvent("popstate"));
      },
      path(ids[total - 1] ?? ""),
    );
    await expectSlide(page, total);
    expect(await welcome.evaluate((element) => element.isConnected)).toBe(
      false,
    );
    await expect(page.locator(".slide")).toHaveCount(1);
  });
});

test.describe("tapping on a touch screen", () => {
  test.use({ hasTouch: true, viewport: { width: 375, height: 667 } });

  test("Next and Previous respond to a single tap", async ({ page }) => {
    await page.goto(path(ids[0] ?? ""));
    await next(page).tap();
    await expectSlide(page, 2);
    await previous(page).tap();
    await expectSlide(page, 1);
    await page.getByRole("link", { name: ui.backToSessions }).tap();
    await expect(page).toHaveURL("/");
  });
});

test.describe("addresses and history", () => {
  test("a direct link opens that slide, and refresh keeps it", async ({
    page,
  }) => {
    await page.goto(path(ids[2] ?? ""));
    await expectSlide(page, 3);
    await expect(slideArea(page, 3)).toBeFocused();
    await page.reload();
    await expectSlide(page, 3);
  });

  test("the session address opens the first slide without a history entry", async ({
    page,
  }) => {
    await page.goto("/");
    await page.goto("/sessions/orientation");
    await expectSlide(page, 1);
    await page.goBack();
    await expect(page).toHaveURL("/");
  });

  test("Back and Forward step through the slides shown, then the list", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Orientation" }).click();
    await expectSlide(page, 1);
    await next(page).click();
    await expectSlide(page, 2);
    await page.keyboard.press("ArrowRight");
    await expectSlide(page, 3);

    await page.goBack();
    await expectSlide(page, 2);
    await expect(slideArea(page, 2)).toBeFocused();
    await page.goBack();
    await expectSlide(page, 1);
    await page.goBack();
    await expect(page).toHaveURL("/");
    await expect(
      page.getByRole("heading", { level: 1, name: site.name }),
    ).toBeFocused();

    await page.goForward();
    await expectSlide(page, 1);
    await expect(slideArea(page, 1)).toBeFocused();
    await page.goForward();
    await expectSlide(page, 2);
  });

  test("Back to sessions returns to the list with focus on its heading", async ({
    page,
  }) => {
    await page.goto(path(ids[1] ?? ""));
    await page.getByRole("link", { name: ui.backToSessions }).click();
    await expect(page).toHaveURL("/");
    await expect(
      page.getByRole("heading", { level: 1, name: site.name }),
    ).toBeFocused();
  });
});

test.describe("addresses that do not match", () => {
  for (const [address, message] of [
    ["/sessions/not-a-session", ui.errors.sessionNotFound],
    ["/sessions/not-a-session/welcome", ui.errors.sessionNotFound],
    ["/sessions/childhood", ui.errors.sessionComingSoon],
    ["/no-such-page", ui.errors.pageNotFound],
  ] as const) {
    test(`${address} explains itself and leads back to the list`, async ({
      page,
    }) => {
      await page.goto(address);
      const heading = page.getByRole("heading", {
        level: 1,
        name: message.heading,
      });
      await expect(heading).toBeFocused();
      await expect(page.getByText(message.text)).toBeVisible();
      await expectNoBlockingAxe(page);
      await page.getByRole("link", { name: ui.backToSessions }).click();
      await expect(page).toHaveURL("/");
    });
  }

  test("an unknown slide id offers the first slide and the list", async ({
    page,
  }) => {
    await page.goto("/sessions/orientation/not-a-slide");
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: ui.errors.slideNotFound.heading,
      }),
    ).toBeFocused();
    await expectNoBlockingAxe(page);
    await expect(
      page.getByRole("link", { name: ui.backToSessions }),
    ).toHaveAttribute("href", "/");
    await page
      .getByRole("link", { name: ui.errors.slideNotFound.firstSlide })
      .click();
    await expectSlide(page, 1);
  });
});

test.describe("download failures", () => {
  const failed = ui.errors.loadFailed;

  /**
   * Fails every request matching the pattern until restore() is called, as
   * when the connection drops and comes back.
   */
  async function failUntilRestored(page: Page, pattern: string) {
    let offline = true;
    let failures = 0;
    await page.route(pattern, async (route) => {
      if (offline) {
        failures += 1;
        await route.abort("internetdisconnected");
      } else {
        await route.fallback();
      }
    });
    return {
      failures: () => failures,
      restore: () => {
        offline = false;
      },
    };
  }

  for (const [what, pattern] of [
    ["the player", "**/assets/PlayerPage-*.js"],
    ["the session data", "**/assets/orientation-*.js"],
  ] as const) {
    test(`${what} failing, then the connection returns: Try again recovers in place`, async ({
      page,
    }) => {
      const network = await failUntilRestored(page, pattern);
      await page.goto(path(ids[1] ?? ""));
      const heading = page.getByRole("heading", {
        level: 1,
        name: failed.heading,
      });
      await expect(heading).toBeFocused();
      expect(network.failures()).toBeGreaterThan(0);
      await expectNoBlockingAxe(page);

      network.restore();
      await page.getByRole("button", { name: failed.retry }).click();
      await expectSlide(page, 2);
      await expect(page).toHaveURL(path(ids[1] ?? ""));
    });
  }

  test("a slide component failing: the controls stay, Try again recovers", async ({
    page,
  }) => {
    const network = await failUntilRestored(page, "**/assets/Component-*.js");
    await page.goto(path(ids[0] ?? ""));
    const heading = slideArea(page, 1).getByRole("heading", {
      level: 2,
      name: failed.heading,
    });
    await expect(heading).toBeFocused();
    expect(network.failures()).toBeGreaterThan(0);
    await expect(next(page)).toBeEnabled();
    await expectNoBlockingAxe(page);

    network.restore();
    await page.getByRole("button", { name: failed.retry }).click();
    await expectSlide(page, 1);
  });

  test("still failing after Try again: Reload page keeps the address", async ({
    page,
  }) => {
    await page.route("**/assets/orientation-*.js", (route) =>
      route.abort("internetdisconnected"),
    );
    await page.goto(path(ids[3] ?? ""));
    await page.getByRole("button", { name: failed.retry }).click();
    const reload = page.getByRole("button", { name: failed.reload });
    await expect(reload).toBeVisible();

    await page.unroute("**/assets/orientation-*.js");
    await reload.click();
    await expectSlide(page, 4);
  });

  test("content that fails validation is explained, not shown", async ({
    page,
  }) => {
    await page.route("**/assets/orientation-*.js", (route) =>
      route.fulfill({
        contentType: "text/javascript",
        body: 'export default { slug: "orientation", number: 9, title: "Broken", slides: [] };',
      }),
    );
    await page.goto(path(ids[0] ?? ""));
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: ui.errors.invalidContent.heading,
      }),
    ).toBeFocused();
    await expect(page.getByRole("button")).toHaveCount(0);
    await expect(page.getByText("Broken")).toHaveCount(0);
  });
});

/** Layout facts for the current page. */
function layout(page: Page) {
  return page.evaluate(() => {
    const root = document.documentElement;
    const targets = [...document.querySelectorAll("a, button")].map(
      (element) => {
        const box = element.getBoundingClientRect();
        return {
          name: element.textContent,
          width: box.width,
          height: box.height,
        };
      },
    );
    const texts = [
      ...document.querySelectorAll("h1, h2, p, li, a, button, span"),
    ]
      .filter((element) => element.textContent.trim() !== "")
      .map((element) => ({
        text: element.textContent,
        size: parseFloat(getComputedStyle(element).fontSize),
      }));
    const slide = document.querySelector(".player__slide");
    return {
      horizontalScroll: root.scrollWidth > root.clientWidth,
      pageScrolls: root.scrollHeight > window.innerHeight,
      slideScrolls:
        slide !== null && slide.scrollHeight > slide.clientHeight + 1,
      targets,
      texts,
    };
  });
}

for (const viewport of viewports) {
  test.describe(`layout on a ${viewport.name}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test("the list: readable, large targets, no sideways scroll, no axe issues", async ({
      page,
    }) => {
      await page.goto("/");
      const facts = await layout(page);
      expect(facts.horizontalScroll).toBe(false);
      for (const target of facts.targets) {
        expect(target.width, target.name).toBeGreaterThanOrEqual(44);
        expect(target.height, target.name).toBeGreaterThanOrEqual(44);
      }
      for (const text of facts.texts) {
        expect(text.size, text.text).toBeGreaterThanOrEqual(24);
      }
      await expectNoBlockingAxe(page);
    });

    test("every slide fits the screen with large controls and no axe issues", async ({
      page,
    }) => {
      for (let n = 1; n <= total; n += 1) {
        await page.goto(path(ids[n - 1] ?? ""));
        await expectSlide(page, n);
        const facts = await layout(page);
        expect(facts.horizontalScroll, `slide ${String(n)}`).toBe(false);
        expect(facts.pageScrolls, `slide ${String(n)}`).toBe(false);
        expect(facts.slideScrolls, `slide ${String(n)}`).toBe(false);
        for (const target of facts.targets) {
          expect(target.width, target.name).toBeGreaterThanOrEqual(44);
          expect(target.height, target.name).toBeGreaterThanOrEqual(44);
        }
        for (const text of facts.texts) {
          expect(text.size, text.text).toBeGreaterThanOrEqual(24);
        }
        await expectNoBlockingAxe(page);
      }
    });
  });
}

test("controls show a visible focus ring", async ({ page }) => {
  await page.goto(path(ids[1] ?? ""));
  await expect(slideArea(page, 2)).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(previous(page)).toBeFocused();
  const outline = await page.evaluate(() => {
    const style = getComputedStyle(document.activeElement ?? document.body);
    return { style: style.outlineStyle, width: parseFloat(style.outlineWidth) };
  });
  expect(outline.style).toBe("solid");
  expect(outline.width).toBeGreaterThanOrEqual(4);
});
