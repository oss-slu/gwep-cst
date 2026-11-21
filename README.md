# CST Platform

Web app for the fourteen Cognitive Stimulation Therapy (CST) group sessions at Saint Louis University. Read `docs/PROJECT_CONTEXT.md` for the background and `AGENTS.md` for the working rules.

## Getting started

You need Node 24 (see `.nvmrc`).

```sh
npm ci
npx playwright install chromium
npm run dev
```

To build with media under `public/media/`, or to run the media tests, you also need FFmpeg (`ffmpeg` and `ffprobe`) on `PATH`. See [Media](#media).

The repository's `.npmrc` turns off dependency install scripts (`ignore-scripts=true`). npm therefore also skips `pre*` and `post*` script hooks, so every check is a script you call by name.

## Running the Orientation demo

The production build with the Orientation demo, served locally (FFmpeg must be on `PATH` for the build's media check):

```sh
npm ci
npm run build
npm run preview
```

Then open http://localhost:4173/ and choose Orientation. The demo uses placeholder pictures, sounds and answers (see `docs/MEDIA_PROVENANCE.md`).

## Commands

| Command             | What it does                                                  |
| ------------------- | ------------------------------------------------------------- |
| `npm run dev`       | Start the development server                                  |
| `npm run build`     | Check content and media, type-check, then build for production into `dist/` |
| `npm run preview`   | Serve the production build locally                            |
| `npm run lint`      | ESLint and Prettier check                                     |
| `npm run format`    | Format files with Prettier                                    |
| `npm run typecheck` | TypeScript check                                              |
| `npm test`          | Unit and component tests (Vitest)                             |
| `npm run test:timezones` | Calendar date tests, once per time zone, each in a process started with `TZ` set |
| `npm run test:e2e`  | Browser and accessibility tests (Playwright with axe-core)    |
| `npm run validate-content` | Check every file in `content/sessions/` against the content schema |
| `npm run validate-media` | Check every file in `public/media/` against the media rules (needs FFmpeg when there is media) |
| `npm run cms:generate` | Regenerate `public/admin/config.yml` from the slide registry |
| `npm run cms:check` | Fail if `public/admin/config.yml` is out of date (runs in CI) |
| `npm run cms:demo-copy` | Make a disposable copy of this repository for the local content editor (see below) |
| `npm run cms:local` | Start Decap's local backend, only inside a disposable copy |
| `npm run check:bundle` | Fail if the initial JavaScript is over 100 kB gzip (run after `build`) |
| `npm run check:lighthouse` | Lighthouse budgets, median of three mobile runs (run after `build`; needs Google Chrome) |

## Content

Each session is one JSON file, `content/sessions/<slug>.json`, checked against the zod schema in `src/content/schema.ts`. `npm run validate-content` runs before every production build and in CI; any problem stops the build and is printed as `file: field.path: message`. The app loads a session only when it is opened, and checks it again with the same schema.

Slides are checked against the slide types registered in `src/slides/registry.ts`. Each slide type is one module made with `defineSlide()`: a strict schema, a lazily loaded component, and its CMS fields. A slide whose type is not registered, or that has fields its type does not define, fails validation. The registered types are `title` (welcome and closing), `calendar-day`, `calendar-month`, `calendar-year`, `weather`, `reveal` and `sounds`.

The calendar slides show today's date as plain large text, with no marks around it. "Today" is read each time a calendar slide renders, from the current moment in the viewer's time zone (the facilitator's screen). A player left open overnight shows the new date the next time the slide renders. Tests pin the date with `TodayProvider`, and `npm run test:timezones` checks the unpinned path near midnight in several time zones.

`tests/visual/slides.html` is a test-only page that renders one slide from its URL with a fixed date. The browser tests use it, through the Vite dev server, to check legibility, contrast and fit at phone, tablet and shared-screen sizes. It is never part of the production build.

Code in `src/content/` and `src/slides/` imports with explicit `.ts` extensions, because the scripts run it directly with Node. Slide modules are `.ts` files that load their component with `import()`, so Node never loads React components.

## Media

Pictures and sounds live in `public/media/<folder>/<file>`. `npm run validate-media` runs before every production build and in CI, and stops the build on any problem, printed as `file: problem and the limit it breaks`. It runs only at build time; nothing is added to the app.

| Rule | Limit |
| --- | --- |
| Pictures | `.jpg`, `.jpeg`, `.png`, `.webp` or `.avif`, whose contents really are that format and decode fully; at most 2,000,000 bytes and 16,000,000 pixels (read from the header before decoding, and enforced again by the decoder). Above 500,000 bytes prints a warning (a target, not a limit) |
| Sounds | `.mp3` (MP3), `.m4a` (AAC) or `.ogg` (Vorbis or Opus), with exactly one mono audio stream and no cover art; at most 5,000,000 bytes per clip |
| Loudness | Integrated loudness from -17.0 to -15.0 LUFS (target -16), and true peak at or below -1.0 dBTP, as measured by FFmpeg's `loudnorm` filter (ITU-R BS.1770). A clip that cannot be measured, for example silence or under 0.4 s, fails |
| References | Every `/media/` path in `content/sessions/*.json` must be a file that passed these checks |

Sizes are decimal: 1 MB = 1,000,000 bytes. Files must be regular files (not symbolic links), and other files, including hidden ones such as `.DS_Store`, fail.

The check uses FFmpeg 6 or later. CI installs Ubuntu's `ffmpeg` package on `ubuntu-24.04` and logs the version. Locally, use `brew install ffmpeg` on macOS, or, without admin rights, a release build from [ffmpeg.martin-riedl.de](https://ffmpeg.martin-riedl.de): download `ffmpeg.zip` and `ffprobe.zip` and their `.sha256` files, check them with `shasum -a 256 -c`, unzip into a folder you own (for example `~/.local/ffmpeg`), and add it to `PATH`. Without FFmpeg, `validate-media` fails with install instructions when there is media to check; the media tests are skipped outside CI.

Where each media file came from, and its rights, is recorded in `docs/MEDIA_PROVENANCE.md`. The Orientation demo's placeholder media is generated by `scripts/make-placeholder-media.ts`.

## Local content editor (demo)

GWEP staff will edit content in Decap CMS at `/admin`. For now it runs only on your own computer, with no GitHub account, in a **disposable copy** of the repository, so edits never touch your working copy or GitHub. Production sign-in, publishing and previews are not set up yet.

```sh
# Once: make the copy next to this repository (refuses if it already exists)
npm run cms:demo-copy
cd ../gwep-cst-cms-demo

# Two terminals, both inside the copy (FFmpeg on PATH for the validators):
npm run cms:local                          # Decap's local backend
npm run dev -- --port 5173 --strictPort    # the site and the editor
```

Open http://localhost:5173/admin/ (use `localhost`, not `127.0.0.1`), choose **Login**, and edit. Saving creates a draft, set its status to **Ready**, then **Publish → Publish now**; each step is a commit in the copy's own git history, made as "CMS demo". The player at http://localhost:5173/ shows the change, and `npm run validate-content` and `npm run validate-media` in the copy check it.

**Reset:** delete the copy and make a new one from the current commit (`cd` back to the repository first):

```sh
rm -rf ../gwep-cst-cms-demo
npm run cms:demo-copy
```

Safeguards:

- `cms:demo-copy` clones the current commit onto a local `main`, removes every git remote, sets the commit identity to `CMS demo <cms-demo@localhost>`, links `node_modules` (excluded from git) and writes a marker in `.git/`.
- `cms:local` refuses to start anywhere but the root of such a copy (marker present, its commit known, no remotes). It runs `decap-server` listening on 127.0.0.1:8081 only, accepting requests only from `http://localhost:5173` and only with a loopback `Host`, in git mode. These settings are passed explicitly, so a `.env` file cannot change them.
- Uploads go to `public/media/<session>/` and are referenced as `/media/<session>/<file>`, the path rule both validators enforce. Type the picture's real width and height, and remove variants that no longer match; `validate-media` checks both.
- `decap-server` 3.11.6 depends on `@decap/cli` 0.1.3, whose `@hapi/joi` and unused `zod` 3 have high-severity advisories with no fix in those packages. `package.json` `overrides` replace them inside `@decap/cli` only, with `joi` 17.13.9 (the maintained package, same API) and `zod` 4.6.7. Remove the overrides once a `decap-server` release no longer needs them.

Headers: `public/_headers` gives `/admin` its own content security policy (the pinned Decap script from unpkg with an integrity hash, inline styles, `blob:` for uploads) and no other change. Decap 3.17.3 also needs `'unsafe-eval'`, which only the local dev and preview servers add (with the loopback backend), never the deployed policy, so the editor does not run on the deployed site yet.

Known limits: Decap's own interface fails automated accessibility checks (unnamed icon buttons, contrast, an untitled frame, media cards not reachable by Tab), and with `cms:local` stopped it falls back to a "Login with GitHub" button that does nothing locally. A follow-up will fix or replace the editor in M1.

## CMS config

`public/admin/config.yml` is generated from the slide modules by `npm run cms:generate`; never edit it by hand. CI runs `npm run cms:check`, which fails if the committed file is out of date. The file is JSON, which is also valid YAML.

## Continuous integration

Every pull request and every push to `main` runs the CI workflow, `.github/workflows/ci.yml`. It uses a read-only token and no secrets, so pull requests from forks get nothing extra.

| Check | What it runs |
| --- | --- |
| `checks` | `npm ci`, FFmpeg, lint, typecheck, content and media checks, unit tests, build, bundle budget |
| `e2e` | Playwright with axe, including the security-header test |
| `audit` | `npm audit --audit-level=high` (fails on high or critical findings) |
| `lighthouse` | Lighthouse budgets; reports are kept as workflow artifacts, never uploaded publicly |
| `secrets` | gitleaks on the full git history (binary checked against its SHA-256 checksum) |
| CodeQL | GitHub's CodeQL default setup, configured in the repository's code security settings. `.github/workflows/codeql.yml` is kept but only runs when started by hand, because default setup rejects its results |

Dependabot (`.github/dependabot.yml`) proposes npm and GitHub Actions updates weekly, and waits 14 days after each release. Actions are pinned to full commit SHAs.

**Required checks for `main`:** `checks`, `e2e`, `audit` and `secrets`. Add `lighthouse` once it passes reliably on GitHub's runner. The CodeQL check from default setup can also be required.

Security headers live in `public/_headers` (Cloudflare format). `/admin` stays under the strict site policy until the CMS issue adds a verified admin policy.
