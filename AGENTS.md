# AGENTS.md

Instructions for AI coding agents working in this repository (Codex, Antigravity, Claude and others).

## Project in one paragraph

A React and TypeScript web app that delivers the fourteen Cognitive Stimulation Therapy (CST) group sessions for Saint Louis University. Older adults with mild to moderate dementia take part, led by a facilitator in a room or over a video call. GWEP staff edit content through a git-based CMS at `/admin`; SLU Open Source maintains the code. It replaces an old WordPress and Articulate Storyline site that can no longer be edited.

**Read `docs/PROJECT_CONTEXT.md` first.** It covers the background, decisions, content model, slide types, the fourteen sessions, open questions and the roadmap.

## Roles

- **Claude** writes the code on feature branches and opens pull requests.
- **Codex and Antigravity** review pull requests. Leave comments and suggested changes. Do not push to someone else's branch or merge unless Mathew asks you to.
- **Mathew Shereni** owns the project and makes the final call on every merge.

## Commands

Available once the project is scaffolded:

| Command | What it does |
| --- | --- |
| `npm install` | Install dependencies |
| `npm run dev` | Start the development server |
| `npm run build` | Production build |
| `npm run lint` | ESLint and Prettier check |
| `npm run typecheck` | TypeScript check (`tsc --noEmit`) |
| `npm test` | Unit and component tests (Vitest) |
| `npm run test:e2e` | End-to-end and accessibility tests (Playwright with axe-core) |
| `npm run validate-content` | Validate every session file against the content schema |
| `npx decap-server` | Local backend for trying the CMS without GitHub login |

Every pull request must pass lint, typecheck, test, validate-content and build in CI.

## Planned layout

```
content/sessions/<slug>.json   session content, edited through the CMS
public/admin/                  Decap CMS (index.html and config.yml)
public/media/<slug>/           images and audio per session
src/components/slides/         one component per slide type
src/content/schema.ts          zod schema for sessions and slides
src/pages/                     session list and session player
tests/e2e/                     Playwright tests
docs/                          project context, decisions, handbook
```

## Conventions

- TypeScript `strict`. No `any` without a comment explaining why.
- Function components and hooks only.
- **Content never lives in components.** Every visible string, image and audio file comes from `content/sessions/*.json`. Components only render data.
- Every slide type has: a zod schema entry, a component, a unit test, and a CMS field definition in `public/admin/config.yml`. All four or none.
- New dependencies need a one-line reason in the pull request. Prefer the platform and small libraries.
- Keep components small and readable; a student maintainer should understand a file in a few minutes.
- Commit messages follow Conventional Commits (`feat:`, `fix:`, `docs:`, `test:`, `chore:`).

## Accessibility rules (non-negotiable)

The audience is older adults, many with dementia, low vision or hearing loss. WCAG 2.1 AA is the minimum, and these rules go further:

1. Body text on slides at least 24 px, headings larger. Never below 18 px anywhere.
2. Text contrast at least 4.5:1, aim for 7:1 on slides.
3. Every interaction works by keyboard and by single click or tap. Drag-and-drop always has a click or keyboard alternative.
4. Visible focus indicator on every interactive element.
5. Click and tap targets at least 44 by 44 px.
6. No audio or video plays automatically. Every sound has a visible play control and a text description.
7. Audio is normalized to one loudness target so no clip is much quieter than others.
8. Respect `prefers-reduced-motion`. No flashing content.
9. Plain language, one idea per slide, no clutter. Avoid anything that could disorient (no unexplained red circles, no "A, B, C" labels).
10. Images have meaningful `alt` text from the content file; decorative images use empty `alt`.
11. Pages pass automated axe checks with zero serious or critical violations.

## Privacy and security rules (non-negotiable)

- No analytics, tracking, cookies, fingerprinting or third-party scripts, and no collection of personal or health data, unless the project owner confirms GWEP has approved it in writing.
- No secrets, tokens, passwords or keys in the repository, in code, tests, fixtures or commit history.
- No runtime loading from external CDNs except the CMS script at `/admin`.
- Set a strict Content Security Policy in production headers.
- Content from the CMS is treated as data: never rendered with `dangerouslySetInnerHTML` without sanitizing.

## Review checklist

Rate each finding:

- **P0, must fix:** accessibility rule broken, privacy or security rule broken, content can break the site, data loss, build or CI broken.
- **P1, should fix:** incorrect behavior, missing tests for new logic, schema and CMS config out of sync, poor error handling.
- **P2, consider:** readability, structure, naming, performance.
- **P3, nit:** style preferences. Keep these rare.

Check every pull request for:

1. Does it do what the linked issue asks, and nothing unrelated?
2. Accessibility rules above, including keyboard-only use.
3. Privacy and security rules above.
4. Content separation: no hardcoded session text or media paths in components.
5. Schema, component, test and CMS config all updated together for slide-type changes.
6. Tests cover the new behavior; end-to-end test for user-visible flows.
7. Invalid content fails `validate-content` with a clear message instead of crashing the page.
8. No new dependency without a stated reason.
9. Works on a small phone, a tablet and a large shared screen.

## Review output format

```
Summary: <one or two sentences: overall verdict>
Verdict: approve | approve with changes | request changes

P0
- <file>:<line> <problem> -> <suggested fix>

P1
- ...

P2
- ...

Questions
- ...
```

Be specific, quote the code you mean, and suggest the fix. If something is fine, say so briefly.

## Things not to do

- Do not change the meaning of session content. Content is clinical material approved by GWEP; flag concerns instead.
- Do not add features beyond the issue being worked on.
- Do not rename session slugs or slide ids without updating every reference and noting it in the pull request.
- Do not commit generated files, build output or media you do not have rights to use.
