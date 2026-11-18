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
