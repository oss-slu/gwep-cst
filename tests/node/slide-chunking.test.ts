// @vitest-environment node
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { build, type Rolldown } from "vite";
import { describe, expect, it } from "vitest";

// Builds an entry that registers a test slide through the real registry entry
// point (src/slides/registry.ts) and renders it through registry.loadComponent,
// then checks that the component is only reachable through a dynamic import.
const path = (relative: string) =>
  fileURLToPath(new URL(relative, import.meta.url));
const registryModule = path("../../src/slides/registry.ts");
const testSlidesModule = path("../support/test-slides.ts");
const MARKER = "TEST_TEXT_SLIDE_COMPONENT";
const ENTRY = "\0slide-entry";

async function buildEntry(): Promise<Rolldown.OutputChunk[]> {
  const output = await build({
    root: path("../fixtures/chunking"),
    configFile: false,
    logLevel: "silent",
    plugins: [
      react(),
      {
        name: "slide-entry",
        resolveId: (id) => (id === "slide-entry" ? ENTRY : undefined),
        load: (id) =>
          id === ENTRY
            ? [
                `import { createSlideRegistry } from ${JSON.stringify(registryModule)};`,
                `import { testTextSlide } from ${JSON.stringify(testSlidesModule)};`,
                `const registry = createSlideRegistry([testTextSlide]);`,
                `globalThis.render = () => registry.loadComponent({ type: "test-text", id: "welcome", text: "Hi" });`,
              ].join("\n")
            : undefined,
      },
    ],
    build: {
      write: false,
      minify: false,
      rollupOptions: { input: "slide-entry" },
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

/** Every chunk loaded together with `start` through static imports. */
function staticClosure(
  start: Rolldown.OutputChunk,
  byName: Map<string, Rolldown.OutputChunk>,
): Set<string> {
  const seen = new Set<string>();
  const queue = [start.fileName];
  while (queue.length > 0) {
    const name = queue.pop();
    if (name === undefined || seen.has(name)) continue;
    seen.add(name);
    queue.push(...(byName.get(name)?.imports ?? []));
  }
  return seen;
}

describe("slide components in the production build", () => {
  it("are reached only through a dynamic import, never from the entry's static graph", async () => {
    const chunks = await buildEntry();
    const byName = new Map(chunks.map((chunk) => [chunk.fileName, chunk]));
    const entry = chunks.find((chunk) => chunk.isEntry);
    const component = chunks.filter((chunk) => chunk.code.includes(MARKER));

    expect(component).toHaveLength(1);
    const componentFile = component[0]?.fileName ?? "";
    if (entry === undefined)
      throw new Error("The build produced no entry chunk");

    const loadedUpFront = staticClosure(entry, byName);
    expect(loadedUpFront.has(componentFile)).toBe(false);
    for (const name of loadedUpFront) {
      expect(byName.get(name)?.code.includes(MARKER)).toBe(false);
    }
    const dynamicTargets = [...loadedUpFront].flatMap(
      (name) => byName.get(name)?.dynamicImports ?? [],
    );
    expect(dynamicTargets).toContain(componentFile);
  });
});
