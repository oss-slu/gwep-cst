import { useEffect, useRef } from "react";

/**
 * Moves focus to the element when it first appears, so keyboard and screen
 * reader users start from the new page's heading. Give the element
 * tabIndex={-1} so it can take focus without joining the tab order.
 */
export function useFocusOnMount<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return ref;
}
