import { describe, expect, it } from "vitest";
import { keyBelongsToTarget } from "./slide-keys.ts";

function element(html: string, selector: string): Element {
  const host = document.createElement("div");
  host.innerHTML = html;
  const found = host.querySelector(selector);
  if (found === null) throw new Error(`No ${selector}`);
  return found;
}

describe("keyBelongsToTarget", () => {
  it.each([
    ["a text field", "<input id=t>", "#t"],
    ["a text area", "<textarea id=t></textarea>", "#t"],
    ["a select", "<select id=t></select>", "#t"],
    ["audio controls", "<audio id=t controls></audio>", "#t"],
    ["editable text", "<div contenteditable id=t></div>", "#t"],
    ["a slider", '<div role="slider" id=t></div>', "#t"],
    [
      "inside a tab list",
      '<div role="tablist"><button id=t></button></div>',
      "#t",
    ],
  ])("leaves keys to %s", (_name, html, selector) => {
    expect(keyBelongsToTarget(element(html, selector), "ArrowRight")).toBe(
      true,
    );
  });

  it.each([
    ["a button", "<button id=t></button>", "#t"],
    ["a link", "<a href='/' id=t></a>", "#t"],
    [
      "text that is not editable",
      '<div contenteditable="false" id=t></div>',
      "#t",
    ],
  ])("handles keys on %s", (_name, html, selector) => {
    expect(keyBelongsToTarget(element(html, selector), "ArrowRight")).toBe(
      false,
    );
  });

  it("handles keys with no target", () => {
    expect(keyBelongsToTarget(null, "ArrowRight")).toBe(false);
  });

  it.each([
    ["a range input", '<input type="range" id=t>'],
    ["an ARIA slider", '<div role="slider" id=t></div>'],
  ])(
    "leaves arrows, Home and End to %s but not Page Up or Page Down",
    (_name, html) => {
      const slider = element(html, "#t");
      for (const key of [
        "ArrowLeft",
        "ArrowRight",
        "ArrowUp",
        "ArrowDown",
        "Home",
        "End",
      ]) {
        expect(keyBelongsToTarget(slider, key), key).toBe(true);
      }
      for (const key of ["PageUp", "PageDown"]) {
        expect(keyBelongsToTarget(slider, key), key).toBe(false);
      }
    },
  );

  it("leaves Page Up and Page Down to a text field", () => {
    expect(keyBelongsToTarget(element("<input id=t>", "#t"), "PageDown")).toBe(
      true,
    );
  });
});
