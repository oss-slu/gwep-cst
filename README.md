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
| `npm run check:bundle` | Fail if the initial JavaScript is over 100 kB gzip (run after `build`) |
| `npm run check:lighthouse` | Lighthouse budgets, median of three mobile runs (run after `build`; needs Google Chrome) |

## Content

Each session is one JSON file, `content/sessions/<slug>.json`, checked against the zod schema in `src/content/schema.ts`. `npm run validate-content` runs before every production build and in CI; any problem stops the build and is printed as `file: field.path: message`. The app loads a session only when it is opened, and checks it again with the same schema.

Slides are checked against the slide types registered in `src/slides/registry.ts`. Each slide type is one module made with `defineSlide()`: a strict schema, a lazily loaded component, and its CMS fields. A slide whose type is not registered, or that has fields its type does not define, fails validation. The registered types are `title` (welcome and closing), `calendar-day`, `calendar-month` and `calendar-year`.

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
