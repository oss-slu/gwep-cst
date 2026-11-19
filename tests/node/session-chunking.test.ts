// @vitest-environment node
import { fileURLToPath } from "node:url";
import { build, type Rolldown } from "vite";
import { describe, expect, it } from "vitest";

// Builds the app's real src/content/session-loaders.ts against a fixture
// project with two sessions, to check Vite's production chunking.
const fixtureRoot = fileURLToPath(
  new URL("../fixtures/chunking", import.meta.url),
);
const loadersModule = fileURLToPath(
  new URL("../../src/content/session-loaders.ts", import.meta.url),
);
const ENTRY = "\0chunking-entry";

async function buildFixture(): Promise<Rolldown.OutputChunk[]> {
  const output = await build({
    root: fixtureRoot,
    configFile: false,
    logLevel: "silent",
    plugins: [
      {
        name: "chunking-entry",
        resolveId: (id) => (id === "chunking-entry" ? ENTRY : undefined),
        // Uses the loaders the way the player will, so the build keeps them.
        load: (id) =>
          id === ENTRY
            ? `import { sessionLoaders } from ${JSON.stringify(loadersModule)};\n` +
              `globalThis.sessionLoaders = sessionLoaders;`
            : undefined,
      },
    ],
    build: {
      write: false,
      minify: false,
      rollupOptions: { input: "chunking-entry" },
    },
  });
  const results = Array.isArray(output) ? output : [output];
  return results.flatMap((result) =>
    "output" in result
      ? result.output.filter(
          (item): item is Rolldown.OutputChunk => item.type === "chunk",
        )
      : [],
  );
}

describe("session chunking in the production build", () => {
  it("puts each session in its own chunk, outside the entry chunk", async () => {
    const chunks = await buildFixture();
    const chunksWith = (text: string) =>
      chunks.filter((chunk) => chunk.code.includes(text));

    const alpha = chunksWith("Chunking fixture alpha");
    const beta = chunksWith("Chunking fixture beta");

    expect(alpha).toHaveLength(1);
    expect(beta).toHaveLength(1);
    expect(alpha[0]?.fileName).not.toBe(beta[0]?.fileName);
    expect(alpha[0]?.isEntry).toBe(false);
    expect(beta[0]?.isEntry).toBe(false);

    const entry = chunks.find((chunk) => chunk.isEntry);
    expect(entry?.dynamicImports).toHaveLength(2);
  });
});
