// One notice at a time, in a panel at the bottom of the editor page, for the
// local editor's guidance and errors (admin/messages.ts).
import { messages, type NoticeText } from "./messages.ts";

export interface Notice {
  /**
   * Shows a notice, replacing any other. An urgent one is announced at once
   * and takes keyboard focus; Hide this message returns focus where it was.
   */
  readonly show: (text: NoticeText, urgent: boolean) => void;
  readonly clear: () => void;
}

const HEADING_ID = "local-notice-heading";

export function createNotice(doc: Document): Notice {
  let panel: HTMLElement | undefined;

  function clear() {
    panel?.remove();
    panel = undefined;
  }

  function show(text: NoticeText, urgent: boolean) {
    clear();
    const returnFocus =
      doc.activeElement instanceof HTMLElement ? doc.activeElement : null;
    const section = doc.createElement("section");
    section.className = urgent
      ? "local-notice local-notice--urgent"
      : "local-notice";
    section.setAttribute("role", urgent ? "alert" : "status");
    section.setAttribute("aria-labelledby", HEADING_ID);

    const heading = doc.createElement("h2");
    heading.id = HEADING_ID;
    heading.tabIndex = -1;
    heading.textContent = text.heading;
    const paragraph = doc.createElement("p");
    paragraph.textContent = text.text;
    section.append(heading, paragraph);
    if (text.steps.length > 0) {
      const list = doc.createElement(text.steps.length > 1 ? "ol" : "ul");
      for (const step of text.steps) {
        const item = doc.createElement("li");
        item.textContent = step;
        list.append(item);
      }
      section.append(list);
    }
    const hide = doc.createElement("button");
    hide.type = "button";
    hide.textContent = messages.dismiss;
    hide.addEventListener("click", () => {
      clear();
      returnFocus?.focus();
    });
    section.append(hide);

    doc.body.append(section);
    panel = section;
    if (urgent) heading.focus();
  }

  return { show, clear };
}
