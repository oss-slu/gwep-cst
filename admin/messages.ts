// Text for the notices the local editor shows (admin/notice.ts). Plain
// language, with the steps that get the editor working again.

export interface NoticeText {
  readonly heading: string;
  readonly text: string;
  readonly steps: readonly string[];
}

const COPY = "gwep-cst-cms-demo";

export const messages = {
  /** Shown on this computer before a folder is chosen. */
  start: {
    heading: "Editing on this computer",
    text: `Choose Work with Local Repository, then pick the folder named ${COPY}. Signing in with GitHub is not set up yet.`,
    steps: [
      `No copy yet? In the project folder, run npm run cms:demo-copy. It makes ${COPY} next to the project folder.`,
    ],
  },
  unsupported: {
    heading: "Local editing needs Chrome or Edge",
    text: "This browser cannot open a folder on your computer, so the editor cannot open the demo copy.",
    steps: ["Open this page in Google Chrome or Microsoft Edge."],
  },
  notDemoCopy: (folder: string): NoticeText => ({
    heading: "This folder is not the demo copy",
    text: `“${folder}” was not made by npm run cms:demo-copy, so the editor did not open it and changed nothing.`,
    steps: [
      "Choose Work with Local Repository again.",
      `Pick the folder named ${COPY}, next to the project folder.`,
      `No copy yet? In the project folder, run npm run cms:demo-copy.`,
    ],
  }),
  hasRemote: {
    heading: "This copy is linked to GitHub",
    text: "The demo copy must have no git remotes, so an edit can never reach GitHub. The editor did not open it and changed nothing.",
    steps: [
      `Delete the ${COPY} folder.`,
      "In the project folder, run npm run cms:demo-copy to make a fresh copy.",
      "Choose Work with Local Repository and pick the new copy.",
    ],
  },
  dismiss: "Hide this message",
} as const satisfies Record<
  string,
  NoticeText | string | ((folder: string) => NoticeText)
>;
