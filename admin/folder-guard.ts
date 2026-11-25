// The local editor changes only a disposable demo copy made by
// npm run cms:demo-copy. Sveltia CMS opens a local folder through the
// browser's folder picker (showDirectoryPicker); guardFolderPicker wraps it so
// any other folder is refused before the editor reads or writes anything.
import { messages, type NoticeText } from "./messages.ts";

/** The browser's folder picker (File System Access API, Chromium only). */
export type DirectoryPicker = (options?: {
  readonly mode?: "read" | "readwrite";
}) => Promise<FileSystemDirectoryHandle>;

declare global {
  interface Window {
    showDirectoryPicker?: DirectoryPicker;
  }
}

/** Written by cms:demo-copy at .git/cms-demo-copy.json (scripts/cms/demo.ts). */
const MARKER = "cms-demo-copy.json";
const COMMIT = /^[0-9a-f]{40}$/;
const REMOTE_SECTION = /^\s*\[remote\s/m;

async function readText(
  folder: FileSystemDirectoryHandle,
  name: string,
): Promise<string | undefined> {
  try {
    return await (await (await folder.getFileHandle(name)).getFile()).text();
  } catch {
    return undefined;
  }
}

function hasCommit(marker: string): boolean {
  try {
    const parsed: unknown = JSON.parse(marker);
    return (
      typeof parsed === "object" &&
      parsed !== null &&
      "commit" in parsed &&
      typeof parsed.commit === "string" &&
      COMMIT.test(parsed.commit)
    );
  } catch {
    return false;
  }
}

/**
 * Why a chosen folder is not a safe demo copy, or undefined if it is: its
 * .git folder must hold the cms:demo-copy marker and no remotes, the same
 * rules the copy is made with.
 */
export async function demoCopyProblem(
  folder: FileSystemDirectoryHandle,
): Promise<NoticeText | undefined> {
  let git: FileSystemDirectoryHandle;
  try {
    git = await folder.getDirectoryHandle(".git");
  } catch {
    return messages.notDemoCopy(folder.name);
  }
  const marker = await readText(git, MARKER);
  if (marker === undefined || !hasCommit(marker)) {
    return messages.notDemoCopy(folder.name);
  }
  const config = await readText(git, "config");
  if (config === undefined) return messages.notDemoCopy(folder.name);
  if (REMOTE_SECTION.test(config)) return messages.hasRemote;
  return undefined;
}

/**
 * Replaces window.showDirectoryPicker with one that checks the chosen folder.
 * A refused folder shows its problem and rejects like a cancelled picker
 * (AbortError), so the editor stays on its start screen. A safe folder
 * clears any notice and is passed on. Without a picker (not Chromium), shows
 * that local editing needs Chrome or Edge.
 */
export function guardFolderPicker(
  win: Window,
  show: (text: NoticeText, urgent: boolean) => void,
  clear: () => void,
): void {
  const pick = win.showDirectoryPicker?.bind(win);
  if (pick === undefined) {
    show(messages.unsupported, false);
    return;
  }
  win.showDirectoryPicker = async (options) => {
    const folder = await pick(options);
    const problem = await demoCopyProblem(folder);
    if (problem !== undefined) {
      show(problem, true);
      throw new DOMException(problem.heading, "AbortError");
    }
    clear();
    return folder;
  };
}
