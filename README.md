# CST Platform

Web app for the fourteen Cognitive Stimulation Therapy (CST) group sessions at Saint Louis University. Read `docs/PROJECT_CONTEXT.md` for the background and `AGENTS.md` for the working rules.

## Getting started

You need Node 24 (see `.nvmrc`).

```sh
npm ci
npx playwright install chromium
npm run dev
```

The repository's `.npmrc` turns off dependency install scripts (`ignore-scripts=true`). npm therefore also skips `pre*` and `post*` script hooks, so every check is a script you call by name.

## Commands

| Command             | What it does                                                  |
| ------------------- | ------------------------------------------------------------- |
| `npm run dev`       | Start the development server                                  |
| `npm run build`     | Type-check, then build for production into `dist/`            |
| `npm run preview`   | Serve the production build locally                            |
| `npm run lint`      | ESLint and Prettier check                                     |
| `npm run format`    | Format files with Prettier                                    |
| `npm run typecheck` | TypeScript check                                              |
| `npm test`          | Unit and component tests (Vitest)                             |
| `npm run test:e2e`  | Browser and accessibility tests (Playwright with axe-core)    |
| `npm run validate-content` | Check every file in `content/sessions/` against the content schema |
| `npm run cms:generate` | Regenerate `public/admin/config.yml` from the slide registry |
| `npm run cms:check` | Fail if `public/admin/config.yml` is out of date (runs in CI) |
| `npm run check:bundle` | Fail if the initial JavaScript is over 100 kB gzip (run after `build`) |
| `npm run check:lighthouse` | Lighthouse budgets, median of three mobile runs (run after `build`; needs Google Chrome) |

## Content

Each session is one JSON file, `content/sessions/<slug>.json`, checked against the zod schema in `src/content/schema.ts`. `npm run validate-content` runs before every production build and in CI; any problem stops the build and is printed as `file: field.path: message`. The app loads a session only when it is opened, and checks it again with the same schema.

Slides are checked against the slide types registered in `src/slides/registry.ts`. Each slide type is one module made with `defineSlide()`: a strict schema, a lazily loaded component, and its CMS fields. A slide whose type is not registered, or that has fields its type does not define, fails validation. The production list is empty until the first slide types land, so for now every slide is rejected.

Code in `src/content/` and `src/slides/` imports with explicit `.ts` extensions, because the scripts run it directly with Node. Slide modules are `.ts` files that load their component with `import()`, so Node never loads React components.

## CMS config

`public/admin/config.yml` is generated from the slide modules by `npm run cms:generate`; never edit it by hand. CI runs `npm run cms:check`, which fails if the committed file is out of date. The file is JSON, which is also valid YAML.

## Continuous integration

Every pull request and every push to `main` runs the CI workflow, `.github/workflows/ci.yml`. It uses a read-only token and no secrets, so pull requests from forks get nothing extra.

| Check | What it runs |
| --- | --- |
| `checks` | `npm ci`, lint, typecheck, unit tests, build, bundle budget |
| `e2e` | Playwright with axe, including the security-header test |
| `audit` | `npm audit --audit-level=high` (fails on high or critical findings) |
| `lighthouse` | Lighthouse budgets; reports are kept as workflow artifacts, never uploaded publicly |
| `secrets` | gitleaks on the full git history (binary checked against its SHA-256 checksum) |
| CodeQL | GitHub's CodeQL default setup, configured in the repository's code security settings. `.github/workflows/codeql.yml` is kept but only runs when started by hand, because default setup rejects its results |

Dependabot (`.github/dependabot.yml`) proposes npm and GitHub Actions updates weekly, and waits 14 days after each release. Actions are pinned to full commit SHAs.

**Required checks for `main`:** `checks`, `e2e`, `audit` and `secrets`. Add `lighthouse` once it passes reliably on GitHub's runner. The CodeQL check from default setup can also be required.

Security headers live in `public/_headers` (Cloudflare format). `/admin` stays under the strict site policy until the CMS issue adds a verified admin policy.
