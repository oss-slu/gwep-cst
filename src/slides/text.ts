/** True when optional slide text has something to show (not absent, empty or only spaces). */
export function hasText(text: string | undefined): text is string {
  return text !== undefined && text.trim() !== "";
}
