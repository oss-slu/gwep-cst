/**
 * One lazy loader per file in content/sessions/. Vite turns each file into its
 * own chunk, so opening a session downloads only that session's JSON.
 */
export const sessionLoaders: Readonly<Record<string, () => Promise<unknown>>> =
  import.meta.glob("/content/sessions/*.json", { import: "default" });
