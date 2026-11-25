import { afterEach, describe, expect, it, vi } from "vitest";
import {
  demoCopyProblem,
  guardFolderPicker,
  type DirectoryPicker,
} from "../../admin/folder-guard.ts";
import { messages } from "../../admin/messages.ts";
import { createNotice } from "../../admin/notice.ts";

// A folder as the browser's File System Access API presents it: a tree of
// names to text, with only the calls the guard makes.
type Tree = { readonly [name: string]: string | Tree };

function folder(name: string, tree: Tree): FileSystemDirectoryHandle {
  const missing = () =>
    Promise.reject(new DOMException("Not found", "NotFoundError"));
  return {
    kind: "directory",
    name,
    getDirectoryHandle: (child: string) => {
      const entry = tree[child];
      return typeof entry === "object"
        ? Promise.resolve(folder(child, entry))
        : missing();
    },
    getFileHandle: (child: string) => {
      const entry = tree[child];
      return typeof entry === "string"
        ? Promise.resolve({
            getFile: () => Promise.resolve(new File([entry], child)),
          })
        : missing();
    },
  } as unknown as FileSystemDirectoryHandle;
}

const COMMIT = "39ff89f4ced644b64f5f86140c6d00ec363b33c7";
const marker = JSON.stringify({
  source: "/work/gwep-cst",
  commit: COMMIT,
  created: "2026-11-25T10:00:00.000Z",
});
const config = "[core]\n\trepositoryformatversion = 0\n";
const remote =
  '[remote "origin"]\n\turl = https://github.com/oss-slu/gwep-cst.git\n';

const demoCopy = () =>
  folder("gwep-cst-cms-demo", {
    ".git": { "cms-demo-copy.json": marker, config, HEAD: "ref: main\n" },
    content: {},
  });

describe("demoCopyProblem", () => {
  it("accepts a copy made by cms:demo-copy", async () => {
    expect(await demoCopyProblem(demoCopy())).toBeUndefined();
  });

  it.each([
    ["a folder that is not a git repository", folder("Documents", {})],
    [
      "the real repository (no marker)",
      folder("gwep-cst", { ".git": { config } }),
    ],
    [
      "a marker that is not JSON",
      folder("copy", { ".git": { "cms-demo-copy.json": "{", config } }),
    ],
    [
      "a marker without a commit",
      folder("copy", { ".git": { "cms-demo-copy.json": "{}", config } }),
    ],
    [
      "a marker without git config",
      folder("copy", { ".git": { "cms-demo-copy.json": marker } }),
    ],
  ])("refuses %s, naming the folder", async (_, chosen) => {
    expect(await demoCopyProblem(chosen)).toEqual(
      messages.notDemoCopy(chosen.name),
    );
  });

  it("refuses a copy that has a git remote", async () => {
    const linked = folder("gwep-cst-cms-demo", {
      ".git": { "cms-demo-copy.json": marker, config: config + remote },
    });
    expect(await demoCopyProblem(linked)).toBe(messages.hasRemote);
  });
});

describe("guardFolderPicker", () => {
  const setup = (picked: FileSystemDirectoryHandle | undefined) => {
    const show = vi.fn();
    const clear = vi.fn();
    const win = {
      showDirectoryPicker:
        picked === undefined
          ? undefined
          : vi.fn<DirectoryPicker>(() => Promise.resolve(picked)),
    } as unknown as Window;
    guardFolderPicker(win, show, clear);
    return { win, show, clear };
  };

  it("passes the demo copy on and clears any notice", async () => {
    const copy = demoCopy();
    const { win, show, clear } = setup(copy);
    await expect(
      win.showDirectoryPicker?.({ mode: "readwrite" }),
    ).resolves.toBe(copy);
    expect(clear).toHaveBeenCalledOnce();
    expect(show).not.toHaveBeenCalled();
  });

  it("refuses another folder like a cancelled picker and shows why, urgently", async () => {
    const { win, show, clear } = setup(folder("gwep-cst", { ".git": {} }));
    await expect(win.showDirectoryPicker?.()).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(show).toHaveBeenCalledWith(messages.notDemoCopy("gwep-cst"), true);
    expect(clear).not.toHaveBeenCalled();
  });

  it("without a folder picker, says local editing needs Chrome or Edge", () => {
    const { show } = setup(undefined);
    expect(show).toHaveBeenCalledWith(messages.unsupported, false);
  });
});

describe("the notice", () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it("shows the heading, text and steps, announced politely when not urgent", () => {
    const button = document.createElement("button");
    document.body.append(button);
    button.focus();
    createNotice(document).show(messages.start, false);
    const panel = document.querySelector(".local-notice");
    expect(panel?.getAttribute("role")).toBe("status");
    expect(panel?.querySelector("h2")?.textContent).toBe(
      messages.start.heading,
    );
    expect(panel?.querySelectorAll("li")).toHaveLength(
      messages.start.steps.length,
    );
    expect(document.activeElement).toBe(button);
  });

  it("an urgent notice is an alert that takes focus; Hide returns focus", () => {
    const button = document.createElement("button");
    document.body.append(button);
    button.focus();
    const notice = createNotice(document);
    notice.show(messages.hasRemote, true);
    const panel = document.querySelector(".local-notice");
    expect(panel?.getAttribute("role")).toBe("alert");
    expect(document.activeElement).toBe(panel?.querySelector("h2"));
    expect(panel?.querySelectorAll("ol li")).toHaveLength(3);

    const hide = panel?.querySelector("button");
    expect(hide?.textContent).toBe(messages.dismiss);
    hide?.click();
    expect(document.querySelector(".local-notice")).toBeNull();
    expect(document.activeElement).toBe(button);
  });

  it("shows one notice at a time", () => {
    const notice = createNotice(document);
    notice.show(messages.start, false);
    notice.show(messages.unsupported, false);
    expect(document.querySelectorAll(".local-notice")).toHaveLength(1);
    notice.clear();
    expect(document.querySelectorAll(".local-notice")).toHaveLength(0);
  });
});
