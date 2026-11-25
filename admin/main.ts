// The content editor at /admin: Sveltia CMS, with the local folder picker
// limited to the disposable demo copy.
import { init } from "@sveltia/cms";
import { guardFolderPicker } from "./folder-guard.ts";
import { messages } from "./messages.ts";
import { createNotice } from "./notice.ts";

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

const notice = createNotice(document);
guardFolderPicker(window, notice.show, notice.clear);
// On this computer, say how to open the demo copy: GitHub sign-in is not set
// up until the editor is deployed (M1).
if (
  LOOPBACK.has(location.hostname) &&
  window.showDirectoryPicker !== undefined
) {
  notice.show(messages.start, false);
}
await init();
