import { useEffect, useEffectEvent } from "react";

const PREVIOUS_KEYS = new Set(["ArrowLeft", "PageUp"]);
const NEXT_KEYS = new Set(["ArrowRight", "PageDown"]);

// Elements that use these keys themselves: text fields, media controls and
// widgets such as sliders and tab lists.
const USES_ARROW_KEYS = [
  "input",
  "textarea",
  "select",
  "audio",
  "video",
  '[contenteditable]:not([contenteditable="false"])',
  ...[
    "slider",
    "spinbutton",
    "textbox",
    "combobox",
    "listbox",
    "menu",
    "menubar",
    "radiogroup",
    "tablist",
    "tree",
    "grid",
  ].map((role) => `[role="${role}"]`),
].join(", ");

// Sliders, such as the Weather thermometer, keep the arrow keys for their
// marker but let Page Up and Page Down through, so a presentation clicker
// still changes slides while the thermometer has focus.
const SLIDERS = 'input[type="range"], [role="slider"]';
const PAGE_KEYS = new Set(["PageUp", "PageDown"]);

/** True when a key press belongs to the focused element, not to the player. */
export function keyBelongsToTarget(
  target: EventTarget | null,
  key: string,
): boolean {
  if (!(target instanceof Element)) return false;
  if (PAGE_KEYS.has(key) && target.closest(SLIDERS) !== null) return false;
  return target.closest(USES_ARROW_KEYS) !== null;
}

/**
 * Left arrow and Page Up go back a slide, Right arrow and Page Down go
 * forward (presentation clickers send Page Up and Page Down). Presses with a
 * modifier key, held-down repeats and presses inside elements that use these
 * keys are left alone. A key the player uses has its default action
 * cancelled, so a focused slider does not also move on Page Up or Page Down.
 */
export function useSlideKeys(onPrevious: () => void, onNext: () => void) {
  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (
      event.defaultPrevented ||
      event.repeat ||
      event.isComposing ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      keyBelongsToTarget(event.target, event.key)
    ) {
      return;
    }
    if (PREVIOUS_KEYS.has(event.key)) {
      event.preventDefault();
      onPrevious();
    } else if (NEXT_KEYS.has(event.key)) {
      event.preventDefault();
      onNext();
    }
  });

  useEffect(() => {
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);
}
