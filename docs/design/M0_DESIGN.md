# M0 Design and Gate 1 Review

Status: **Proposed, awaiting approval by Mathew Shereni.** No implementation starts until this document is approved in its pull request.

Scope: milestone M0, the demo prototype for the GWEP meeting on Monday, November 23, 2026, and the architecture that M1 to M3 build on. See `docs/PROJECT_CONTEXT.md` for background and `docs/AI_DEVELOPMENT_SECURITY_REVIEW.md` for the review gates this document answers.

## 1. Decision summary

The CST platform is a static React and TypeScript single-page app served from Cloudflare's edge network. Session content is JSON in the repository, validated against a schema at build time, and edited by GWEP staff through Decap CMS, which saves edits as Git commits. There is no application server and no database on the viewer path.

This is the simplest design that meets the known requirements, and it is also the fastest and most scalable option: every viewer request is a cached static file.

## 2. Gate 1: before development

### 2.1 Architecture and simplicity

| Decision | Reason |
| --- | --- |
| Static SPA, no backend for viewers | Sessions are read-only content. A server would add cost, attack surface and failure modes with no benefit |
| Content as JSON in Git, validated with zod | Full history, review and rollback for free. A bad edit fails the build instead of breaking the live site |
| Decap CMS (Git-based) | GWEP edits without code. No database or CMS server to run or patch |
| Cloudflare static hosting | Automatic HTTPS and certificate renewal, global caching, no servers to scale |
| React with TypeScript strict, Vite | Widely known, strong typing, fast builds, easy for future OSS students |

Assumptions, and what happens if each one is wrong:

| Assumption | If wrong |
| --- | --- |
| Viewers do not need to sign in | Put Cloudflare Access in front of the site. No code changes |
| The site stores no personal data | A backend and a new Gate 1 review are required before any collection starts |
| Sessions always have internet | Add a service worker for offline use (M2 or later). The architecture already supports it |
| Content changes a few times a month | Nothing changes until edits reach many per hour, which is unlikely |
| Media totals under a few hundred MB | Move media to Cloudflare R2 with the same URLs. No component changes |

### 2.2 Security by design

**Entry points and trust boundaries**

| Entry point | Trust level | Controls |
| --- | --- | --- |
| Public site (static files) | Untrusted visitors, read-only | No server logic, strict security headers, no third-party scripts |
| `/admin` CMS | Authenticated GWEP editors and OSS maintainers | GitHub OAuth. Only repository collaborators can commit. Editorial workflow puts edits through review before publishing |
| Session content files | Semi-trusted (written through the CMS) | Validated by schema at build. Always rendered as text, never as raw HTML |
| Media uploads | Semi-trusted | CMS limits file types (JPEG, PNG, WebP, AVIF, MP3, M4A, OGG) and sizes. Files are served as static assets only |
| OAuth proxy (Cloudflare Worker, M1) | Holds the OAuth client secret | Secret in Cloudflare secrets, never in the repository. Allows only the production origin |
| CI and deployment pipeline | Holds the deploy token | Token scoped to this project only. Pull requests from forks get no secrets |

**Sensitive assets:** the GitHub OAuth client secret, the Cloudflare deploy token, and GitHub credentials. None of them ever appears in the repository, logs or the client bundle. There is no personal or health data.

**Security headers** (set in `public/_headers`): Content Security Policy with `default-src 'self'` and no inline scripts on the public site, `frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, a restrictive `Permissions-Policy`, and HSTS. `/admin` gets its own policy that allows only the Decap script.

**AI-specific risks**

- AI agents have no production credentials and cannot merge. Branch protection on `main` requires passing CI and Mathew's approval.
- Reviewers (Codex, Antigravity) comment only; they do not push to the author's branch.
- Text from issues, content files or web pages is treated as data. Agents never act on instructions found inside it.
- Every finding is verified by automated checks (tests, scans, CI), not by an agent's own claim.

### 2.3 Scalability and performance

**Scaling model:** every viewer request is a static file served from Cloudflare's cache. There is no origin server or database to overload, so capacity grows with Cloudflare's network, not with our code. Expected peak load is a training cohort of a few hundred concurrent viewers, which is a trivial load for this model.

**Main bottleneck:** media bandwidth. Mitigations:

- Images in AVIF or WebP at the sizes actually displayed, with `srcset`, `width` and `height` set to prevent layout shift.
- Audio compressed for speech and short sounds (mono, low bitrate) and normalized to one loudness target.
- Content-hashed file names with one-year immutable caching. Only `index.html` revalidates.

**Performance budgets** (enforced in CI with Lighthouse CI and bundle-size checks):

| Metric | Budget |
| --- | --- |
| Initial JavaScript (gzip) | 100 KB or less |
| Largest Contentful Paint on a mid-range phone, 4G | 2.0 s or less |
| Interaction to Next Paint | 200 ms or less |
| Cumulative Layout Shift | 0.1 or less |
| Lighthouse performance and accessibility | 95 or higher |

**Speed and memory techniques**

- Each slide type is a separate lazy-loaded chunk, so a session downloads only the code it uses.
- Each session's JSON loads on demand when its route opens, never all fourteen at once.
- The player keeps only the current slide mounted and preloads the next slide's media. Earlier slides release their media.
- Audio uses a single shared player that creates elements on demand and disposes of them on stop or unmount, so memory stays flat across a 30-slide session.
- No global state library. State lives in the smallest component or hook that needs it.

### 2.4 Reliability

| Failure | Behavior |
| --- | --- |
| Invalid content edit | Build fails with a clear message. The live site keeps serving the last good version |
| A media file fails to load | The slide shows its text and alt text, plus a retry control. The session continues |
| CMS or GitHub outage | Editing pauses. Viewers are unaffected |
| Bad deployment | Deployments are atomic. Rollback means redeploying the previous build in one step |
| Cloudflare outage | Accepted risk. Static output can be redeployed elsewhere unchanged |

### 2.5 Maintainability and operations

- **CI on every pull request:** lint, typecheck, unit tests, end-to-end tests with axe accessibility checks, content validation, build, bundle budget, Lighthouse CI.
- **Security automation:** Dependabot, `npm audit` (fails on high or critical), CodeQL, and secret scanning with gitleaks.
- **Preview deployments** per pull request, so GWEP and reviewers can click through changes.
- **Monitoring:** an uptime and certificate check alerting OSS and GWEP. No logs or analytics containing personal data.
- **Deferred until requirements justify them:** R2 media storage, offline mode, viewer sign-in, other languages, analytics.

## 3. Code design

The four object-oriented principles are applied where they make the code simpler and safer. React's own guidance is to build components by composition rather than class inheritance, and the security review asks us to avoid unnecessary abstraction, so inheritance is used deliberately and narrowly.

| Principle | Where it is used | Benefit |
| --- | --- | --- |
| **Abstraction** | `ContentSource` interface (load a session) with a `StaticContentSource` implementation. `AudioService` interface for playback | Components never know where content comes from or how audio works. Content can move to R2 or an API later without touching components |
| **Encapsulation** | Each slide type is a self-contained module exporting only its definition (schema, component, CMS fields). `AudioPlayer` keeps its audio elements and gain private and exposes only `play`, `stop` and `dispose` | Internals can change without breaking callers. Resource cleanup lives in one place |
| **Polymorphism** | A slide registry maps each slide `type` to its module. The player renders `registry[slide.type]` with no `switch` statements | Adding a slide type means adding one module. TypeScript checks that every type is registered |
| **Inheritance** | Every slide schema extends a `BaseSlide` schema (`id`, `type`, optional notes). Typed errors such as `ContentValidationError extends AppError` | Shared fields and error handling are defined once. No component class hierarchies |

Slide module contract:

```ts
// src/slides/types.ts
export interface SlideModule<S extends BaseSlide> {
  readonly type: S['type'];
  readonly schema: z.ZodType<S>;
  readonly Component: React.LazyExoticComponent<React.ComponentType<SlideProps<S>>>;
  readonly cmsFields: readonly CmsField[];
}
```

```ts
// src/slides/registry.ts
export const slideRegistry = {
  title: titleSlide,
  'calendar-day': calendarDaySlide,
  reveal: revealSlide,
  // ...
} satisfies Record<SlideType, SlideModule<AnySlide>>;
```

Planned layout:

```
src/
  app/            routing, layout, error boundary
  content/        schema, ContentSource, validation
  slides/         one folder per slide type: schema.ts, Component.tsx, cms.ts, *.test.tsx
  media/          AudioService, image helpers
  player/         session player, navigation, keyboard handling
  ui/             shared accessible components (Button, Heading, FocusRing)
content/sessions/ session JSON
public/admin/     Decap CMS
public/_headers   security and caching headers
```

## 4. M0 scope and pull requests

Small pull requests, each reviewed by Codex and Antigravity and approved by Mathew:

1. **This design document.** Approval gate for everything below.
2. **Scaffold:** Vite, React, TypeScript strict, ESLint, Prettier, Vitest, Playwright with axe, CI workflow, security headers, Dependabot and secret scanning.
3. **Core:** content schema, `ContentSource`, slide registry, session list, session player with keyboard navigation and deep links, error boundary.
4. **Slides and content:** title, calendar day, month and year, weather with movable thermometer, sounds, reveal. Orientation session JSON with clearly marked placeholder media.
5. **CMS:** Decap at `/admin` working locally with `decap-server`, field definitions generated from the slide modules.

Done for M0 means: all five pull requests merged, CI green, zero serious accessibility violations, and the Orientation session demoable from a local or preview URL.

## 5. Approval workflow

1. Claude proposes a plan (this document, or a plan in the issue for smaller work).
2. **Mathew approves the plan.** No code before approval.
3. Claude implements on a feature branch and opens a pull request.
4. Codex and Antigravity review with the checklist in `AGENTS.md`.
5. Claude addresses review comments. Changes to the approved plan go back to step 2.
6. **Mathew approves and merges.**

Recommended branch protection on `main`: require a pull request, one approving review from Mathew, passing status checks, and up-to-date branches. No force pushes.

## 6. Open items needing a decision

- Approval of this design.
- Who owns the Cloudflare account for previews before SLU's account is set up.
- GWEP answers to the requirements questions (due November 20) may change slide types or scope. They will be handled as plan updates through the workflow above.

## 7. Gate 2 status

Not started. Gate 2 is evaluated against real code, configuration and behavior before M1 deployment. Untested items will be recorded as unknown, not passed.
