// Validates content/catalog.json and every session file in content/sessions/
// (relative to the folder it is run from), and checks them against each other.
// Exits 1 if any problem is found. It takes no arguments.
// Usage: npm run validate-content
import type { Dirent } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { catalogSchema } from "../src/content/catalog-schema.ts";
import { sessionSchema, type Session } from "../src/content/session-schema.ts";
import {
  checkCatalogAgainstSessions,
  checkSessionSet,
  checkSessionText,
  formatProblem,
  type ContentProblem,
} from "../src/content/validate.ts";

const folder = "content/sessions";
const catalogFile = "content/catalog.json";

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// Every *.json entry counts, whatever it is: Vite's session glob also picks up
// symbolic links, so anything that is not a regular file is reported, never
// skipped.
async function sessionEntries(): Promise<Dirent[]> {
  const entries = await readdir(folder, { withFileTypes: true });
  return entries
    .filter((entry) => entry.name.endsWith(".json"))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function notARegularFile(entry: Dirent): string {
  return entry.isSymbolicLink()
    ? "Session files must be regular files, not symbolic links"
    : "Session files must be regular files";
}

let entries: Dirent[];
try {
  entries = await sessionEntries();
} catch (error) {
  console.error(
    `validate-content: cannot read session folder "${folder}": ${describe(error)}`,
  );
  process.exit(1);
}

const problems: ContentProblem[] = [];
const sessions: { file: string; session: Session }[] = [];

for (const entry of entries) {
  const file = join(folder, entry.name);
  if (!entry.isFile()) {
    problems.push({ file, path: "", message: notARegularFile(entry) });
    continue;
  }
  let text: string;
  try {
    text = await readFile(file, "utf8");
  } catch (error) {
    problems.push({
      file,
      path: "",
      message: `Cannot read file: ${describe(error)}`,
    });
    continue;
  }
  const result = checkSessionText(file, text, sessionSchema);
  if (result.ok) sessions.push({ file, session: result.session });
  else problems.push(...result.problems);
}
problems.push(...checkSessionSet(sessions));

// The catalog goes through the same JSON and schema checks as a session file.
let catalogText: string | undefined;
try {
  catalogText = await readFile(catalogFile, "utf8");
} catch (error) {
  problems.push({
    file: catalogFile,
    path: "",
    message: `Cannot read file: ${describe(error)}`,
  });
}
if (catalogText !== undefined) {
  const catalog = checkSessionText(catalogFile, catalogText, catalogSchema);
  if (catalog.ok) {
    problems.push(
      ...checkCatalogAgainstSessions(
        catalogFile,
        catalog.session,
        entries.map((entry) => join(folder, entry.name)),
        sessions,
      ),
    );
  } else {
    problems.push(...catalog.problems);
  }
}

for (const problem of problems) console.error(formatProblem(problem));
const count = `${String(entries.length)} session file${entries.length === 1 ? "" : "s"}`;
if (problems.length > 0) {
  console.error(
    `\nvalidate-content: ${String(problems.length)} problem(s) in ${count}.`,
  );
  process.exitCode = 1;
} else {
  console.log(
    `validate-content: ${count} in ${folder} and ${catalogFile}, no problems.`,
  );
}
