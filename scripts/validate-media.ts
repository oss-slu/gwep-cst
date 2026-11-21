// Checks every file under public/media (relative to the folder it is run
// from) against the media rules in docs/design/M0_DESIGN.md §4.1, and that
// every /media/ path in content/sessions/*.json is one of the files that
// passed. Exits 1 on any problem. It takes no arguments and runs at build
// time only; the viewer never runs it.
// Usage: npm run validate-media
import type { Dirent } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import {
  checkAudioStreams,
  checkDeclaredImage,
  checkLoudness,
  checkPixels,
  checkSize,
  classifyPath,
  imageDimensions,
  imageFormatOf,
  type DeclaredImage,
  type Dimensions,
  type MediaType,
} from "./media/rules.ts";
import {
  checkTools,
  decodeImage,
  measureLoudness,
  probeAudio,
} from "./media/tools.ts";

const MEDIA = "public/media";
const SESSIONS = "content/sessions";

const problems: string[] = [];
const warnings: string[] = [];
const report = (file: string, message: string) =>
  problems.push(`${file}: ${message}`);

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Every entry under public/media, depth first, with its path relative to it. */
async function walk(
  folder: string,
  relative = "",
): Promise<{ entry: Dirent; relative: string }[]> {
  const entries = await readdir(folder, { withFileTypes: true });
  const found: { entry: Dirent; relative: string }[] = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const path = relative === "" ? entry.name : `${relative}/${entry.name}`;
    if (entry.isDirectory())
      found.push(...(await walk(join(folder, entry.name), path)));
    else found.push({ entry, relative: path });
  }
  return found;
}

async function mediaEntries() {
  try {
    return await walk(MEDIA);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

/** Every string at a "src" key in a session file: image, variant and audio paths. */
function mediaReferences(
  value: unknown,
  path = "",
): { path: string; src: string }[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) =>
      mediaReferences(item, `${path}[${String(index)}]`),
    );
  }
  if (typeof value !== "object" || value === null) return [];
  return Object.entries(value).flatMap(([key, item]) => {
    const here = path === "" ? key : `${path}.${key}`;
    if (key === "src" && typeof item === "string")
      return [{ path: here, src: item }];
    return mediaReferences(item, here);
  });
}

/** Every image object (src, width, height, optional variants) in a session file. */
function imageReferences(
  value: unknown,
  path = "",
): { path: string; image: DeclaredImage }[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) =>
      imageReferences(item, `${path}[${String(index)}]`),
    );
  }
  if (typeof value !== "object" || value === null) return [];
  const record = value as Record<string, unknown>;
  const { src, width, height, variants } = record;
  if (
    typeof src === "string" &&
    typeof width === "number" &&
    typeof height === "number"
  ) {
    const list = Array.isArray(variants) ? (variants as unknown[]) : [];
    return [
      {
        path,
        image: {
          src,
          width,
          height,
          variants: list.flatMap((variant) => {
            const entry = variant as Record<string, unknown>;
            return typeof entry.src === "string" &&
              typeof entry.width === "number"
              ? [{ src: entry.src, width: entry.width }]
              : [];
          }),
        },
      },
    ];
  }
  return Object.entries(record).flatMap(([key, item]) =>
    imageReferences(item, path === "" ? key : `${path}.${key}`),
  );
}

const entries = await mediaEntries();
const checks: ({ readonly file: string } & MediaType)[] = [];
for (const { entry, relative } of entries) {
  const file = `${MEDIA}/${relative}`;
  if (!entry.isFile()) {
    report(
      file,
      entry.isSymbolicLink()
        ? "media must be regular files, not symbolic links"
        : "media must be regular files",
    );
    continue;
  }
  const kind = classifyPath(relative);
  if (!kind.ok) {
    report(file, kind.message);
    continue;
  }
  checks.push({ file, ...kind });
}

// The tools are needed only when there is media to inspect.
const passed = new Set<string>();
// The header size of each picture that passed, for the content size check.
const passedSizes = new Map<string, Dimensions>();
if (checks.length > 0) {
  try {
    for (const version of await checkTools())
      console.log(`validate-media: using ${version}`);
  } catch (error) {
    console.error(`validate-media: ${describe(error)}`);
    process.exit(1);
  }
}

for (const check of checks) {
  const { file } = check;
  const before = problems.length;
  try {
    const { size } = await stat(file);
    const sizeCheck = checkSize(check.kind, size);
    if (sizeCheck.warning !== undefined)
      warnings.push(`${file}: ${sizeCheck.warning}`);
    if (sizeCheck.problem !== undefined) {
      // Too big to inspect further: report and do not decode it.
      report(file, sizeCheck.problem);
      continue;
    }
    if (check.kind === "image") {
      // At most 2 MB, checked above, so reading it whole is bounded.
      const bytes = await readFile(file);
      const actual = imageFormatOf(bytes.subarray(0, 64));
      if (actual !== check.format) {
        report(
          file,
          `file contents are ${actual ?? "not a supported image"}, not the ${check.format} format its extension says`,
        );
        continue;
      }
      const dimensions = imageDimensions(bytes, check.format);
      const pixelProblem = checkPixels(dimensions);
      if (dimensions !== undefined) passedSizes.set(file, dimensions);
      if (pixelProblem !== undefined) {
        // Never handed to the decoder.
        report(file, pixelProblem);
        continue;
      }
      const decodeError = await decodeImage(file);
      if (decodeError !== undefined)
        report(file, `image could not be decoded: ${decodeError}`);
    } else {
      const probe = await probeAudio(file);
      const streamProblems = checkAudioStreams(
        check.format,
        probe.container,
        probe.streams,
      );
      for (const message of streamProblems) report(file, message);
      if (streamProblems.length === 0) {
        for (const message of checkLoudness(await measureLoudness(file)))
          report(file, message);
      }
    }
  } catch (error) {
    report(file, describe(error));
  }
  if (problems.length === before) passed.add(file);
  else passedSizes.delete(file);
}

// References must point at files that passed, so a rejected file, a symbolic
// link or a missing file cannot satisfy them.
let sessionFiles: string[] = [];
try {
  sessionFiles = (await readdir(SESSIONS))
    .filter((name) => name.endsWith(".json"))
    .sort();
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}
for (const name of sessionFiles) {
  const sessionFile = `${SESSIONS}/${name}`;
  let data: unknown;
  try {
    data = JSON.parse(await readFile(sessionFile, "utf8"));
  } catch {
    continue; // validate-content reports unreadable or malformed sessions.
  }
  for (const { path, src } of mediaReferences(data)) {
    if (!src.startsWith("/media/")) continue; // validate-content rejects these.
    const file = `public${src}`;
    if (!passed.has(file)) {
      report(
        sessionFile,
        `${path}: ${src} is not a valid media file (${file} is missing or failed its checks)`,
      );
    }
  }
  for (const { path, image } of imageReferences(data)) {
    const sizeOf = (src: string) => passedSizes.get(`public${src}`);
    for (const message of checkDeclaredImage(path, image, sizeOf)) {
      report(sessionFile, message);
    }
  }
}

for (const warning of warnings) console.warn(`warning: ${warning}`);
for (const problem of problems) console.error(problem);
const count = `${String(entries.length)} media file${entries.length === 1 ? "" : "s"}`;
if (problems.length > 0) {
  console.error(
    `\nvalidate-media: ${String(problems.length)} problem(s) in ${count}.`,
  );
  process.exitCode = 1;
} else {
  console.log(`validate-media: ${count} in ${MEDIA}, no problems.`);
}
