// Validates every session file and exits 1 if any problem is found.
// Usage: node scripts/validate-content.ts [folder]   (default: content/sessions)
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Session } from "../src/content/schema.ts";
import {
  checkSessionSet,
  checkSessionText,
  formatProblem,
  type ContentProblem,
} from "../src/content/validate.ts";

const folder = process.argv[2] ?? "content/sessions";

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function sessionFileNames(): Promise<string[]> {
  const entries = await readdir(folder, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => entry.name)
    .sort();
}

let names: string[];
try {
  names = await sessionFileNames();
} catch (error) {
  console.error(
    `validate-content: cannot read session folder "${folder}": ${describe(error)}`,
  );
  process.exit(1);
}

const problems: ContentProblem[] = [];
const sessions: { file: string; session: Session }[] = [];

for (const name of names) {
  const file = join(folder, name);
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
  const result = checkSessionText(file, text);
  if (result.ok) sessions.push({ file, session: result.session });
  else problems.push(...result.problems);
}
problems.push(...checkSessionSet(sessions));

for (const problem of problems) console.error(formatProblem(problem));
const count = `${String(names.length)} session file${names.length === 1 ? "" : "s"}`;
if (problems.length > 0) {
  console.error(
    `\nvalidate-content: ${String(problems.length)} problem(s) in ${count}.`,
  );
  process.exitCode = 1;
} else {
  console.log(`validate-content: ${count} in ${folder}, no problems.`);
}
