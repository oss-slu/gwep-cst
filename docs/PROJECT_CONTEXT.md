# CST Platform: Project Context

Last updated: November 17, 2026. Owner: Mathew Shereni (developer, SLU Open Source).

This file explains where the project came from, what has been decided, and where it is going. Read it before writing or reviewing any code. `AGENTS.md` at the repository root holds the working rules and the review checklist.

## 1. What we are building

A modern, accessible web app that delivers the fourteen Cognitive Stimulation Therapy (CST) group sessions used by Saint Louis University. Facilitators run the sessions in person or over video calls. GWEP staff edit the content themselves through a simple content editor (CMS), and SLU Open Source (OSS) maintains the code long term as an open-source project.

The app replaces an old WordPress site whose sessions were built in Articulate Storyline and can no longer be edited.

## 2. Background

- **CST** is an evidence-based group intervention for older adults with mild to moderate dementia. A course has fourteen themed sessions that follow the CST protocol.
- SLU's Family Center for Healthy Aging runs a long-standing, HRSA-funded geriatric education grant (current cycle 2024 to 2029) under the Geriatric Workforce Enhancement Program (GWEP).
- SLU is the North America CST Training Center and trains facilitators and trainers several times a year.
- The platform's purpose is to make CST deliverable virtually as well as in person.

## 3. The existing system and why it is being replaced

| Item | Fact |
| --- | --- |
| Address | indigenousdata.com (the name is unrelated to CST) |
| Platform | WordPress 6.8.3, Elementor and Elementor Pro, Header Footer Elementor, Essential Addons, Happy Addons |
| Home page | A list of fourteen "Discover" links to `/presentations/<slug>/` |
| Sessions | Articulate Storyline 360 published output, about 23 to 30 slides each, with audio, images and interactive activities. Content last revised June 2021 |
| Certificate | SSL certificate expired June 19, 2026. Browsers show a full-page security warning, so the site is effectively offline |
| Source files | The fourteen `.story` source files, the hosting (cPanel) login and the WordPress login are held by the original external developer, who has been largely unresponsive for about two years. The repository set up to receive the source files (`oss-slu/SLU-CST-Storyline360-Source`) is empty |

Published Storyline output cannot be meaningfully edited, so without the source files no correction can be made. Even with them, GWEP would stay tied to a paid proprietary tool. Hence the rebuild.

## 4. Decision status

- **Proposed:** rebuild all fourteen sessions from scratch in React, hosted on Cloudflare, with a git-based CMS for GWEP editors, maintained by OSS. The proposal went to the GWEP contacts in November 2026.
- **Not yet approved.** The first prototype is meant to show the idea at the GWEP meeting on **Monday, November 23, 2026**.
- Efforts to recover access from the original developer continue in parallel. Recovery would help (original audio and images, the domain) but the rebuild does not depend on it.
- The existing Scope of Work (SOW) was written for fixing the Storyline modules. If GWEP approves the rebuild, the SOW will be amended. Code must not assume anything about money or contracts.

## 5. Goals and non-goals

Goals:

1. All fourteen sessions rebuilt, following the CST protocol, with GWEP's known corrections built in.
2. GWEP staff can change text, pictures and audio without a developer.
3. Accessible for older adults and people living with dementia or hearing loss (WCAG 2.1 AA as the floor, see `AGENTS.md`).
4. Works on a shared screen in a room, over Zoom, and on computers, tablets and phones.
5. Nothing depends on one person: SLU-owned accounts, code in the OSS GitHub organization, MIT license.

Non-goals (for now):

- Native mobile apps. A responsive web app covers the use cases.
- Collecting personal or health data. The app stores no personal data unless GWEP explicitly asks and approves it (see section 12).
- Clinical content authoring. GWEP supplies and approves all content; developers only implement it.

## 6. Users and how the app is used

Working assumptions until GWEP answers the requirements questions (section 11):

- **Facilitator** presents a session on a shared screen or in a video call and clicks through slides and activities with the group.
- **Participants** watch and respond out loud. They may not use a mouse themselves.
- **Editor** (GWEP staff) updates content in the CMS.
- **Maintainer** (OSS developer) handles code, deployment and larger changes.
- Public, no viewer sign-in. Only the CMS requires a login.

## 7. Architecture

| Concern | Choice | Notes |
| --- | --- | --- |
| Framework | React with TypeScript (strict), built with Vite | Static single-page app, no server code for viewers |
| Routing | wouter | `/` session list, `/sessions/:slug` player, `/sessions/:slug/:slide` deep links. Chosen in M0-06 (#9) |
| Content | JSON files in the repository, one per session, validated with zod at build time | Content never hardcoded in components |
| CMS | Decap CMS (git-based), loaded at `/admin` | Edits become commits to GitHub. Local development uses `decap-server`. Production login through a GitHub OAuth proxy on Cloudflare (to be set up). Sveltia CMS is a compatible fallback |
| Media | `public/media/<session>/...` in the repository for the prototype | Move large audio to Cloudflare R2 later if needed |
| Hosting | Cloudflare (static assets on Workers or Pages) | Automatic HTTPS and certificate renewal |
| Testing | Vitest and React Testing Library for units, Playwright for end-to-end, axe-core for automated accessibility checks | |
| Quality | ESLint, Prettier, TypeScript `strict`, `npm run validate-content` | |
| CI | GitHub Actions: lint, type-check, test, validate content, build | Runs on every pull request |
| License | MIT for code | Content and media rights are separate and still to be confirmed by GWEP |

### Content model (draft)

```json
{
  "slug": "orientation",
  "number": 9,
  "title": "Orientation Session",
  "slides": [
    { "type": "title", "id": "welcome", "heading": "Welcome to CST" },
    { "type": "calendar-day", "id": "day" },
    { "type": "weather", "id": "weather" },
    {
      "type": "reveal",
      "id": "landmark-1",
      "prompt": "What state is the famous landmark located in?",
      "image": { "src": "/media/orientation/landmark-1.jpg", "alt": "..." },
      "answer": "..."
    }
  ]
}
```

Each slide has a `type` that maps to one React component and a stable `id`. Shared slides (day, month, year, weather) are reusable types, so a fix to one applies to every session.

## 8. Slide types (component catalogue)

| Type | Purpose | Notes |
| --- | --- | --- |
| `title` | Session title, welcome, closing | |
| `calendar-day`, `calendar-month`, `calendar-year` | Orientation slides | No red circle. Large calendar text |
| `weather` | Today's weather | One thermometer with a marker the facilitator can move (replaces separate hot and cold thermometers) |
| `sounds` | Play sound clips and guess | No "A, B, C" labels. Every clip normalized to one loudness target. Each clip has a text description |
| `reveal` | Picture or question, answer appears on click | Used heavily, including the four new Orientation slides |
| `image-choice` | Choose among pictures | |
| `drag-drop` | Sort or match items | Must also work with clicks or keyboard only, never drag alone |
| `quiz` | Question with options and a reveal | |
| `meal-builder` and `meal-summary` | Food Planning session: choose meal items, then show the whole meal together | |
| `discussion` | Open prompt with an image | |

## 9. The fourteen sessions

| # | Title | Old path | New slug |
| --- | --- | --- | --- |
| 1 | Childhood | `/presentations/childhood/` | `childhood` |
| 2 | Physical Games | `/presentations/phisicalgames/` | `physical-games` |
| 3 | Food Planning | `/presentations/foodplanning/` | `food-planning` |
| 4 | Current Affairs | `/presentations/currentaffairs/` | `current-affairs` |
| 5 | Famous People | `/presentations/famouspeople/` | `famous-people` |
| 6 | Word Association | `/presentations/wordassociation/` | `word-association` |
| 7 | Art | `/presentations/artpresentation/` | `art` |
| 8 | Animal Categorization | `/presentations/animalpresentation` | `animals` |
| 9 | Orientation | `/presentations/orientation/` | `orientation` |
| 10 | Using Money | `/presentations/usingmoney/` | `using-money` |
| 11 | Number Games | `/presentations/numberspresentation/` | `number-games` |
| 12 | Word Games | `/presentations/wordgames/` | `word-games` |
| 13 | Transportation | `/presentations/transportation/` | `transportation` |
| 14 | Quiz Game (formerly "What Would Be Worst") | `/presentations/whatwoudlbeworse/` | `quiz-game` |

If the old domain is ever recovered, each old path gets a permanent redirect to its new slug.

## 10. Corrections and enhancements GWEP has already requested

From GWEP's document `CST virtual edits.docx`, to be built into the new sessions:

- Session 14 renamed to "Quiz Game Session".
- Day and Month slides: remove the red circle.
- Year slide: larger calendar text.
- Sounds slides: remove the "A, B, C" labels.
- Number Game: the Beatles question "When I'm ___" must reveal 64, not 65.
- Audio clips that do not play, play the wrong sound or are too quiet (Word Game, Food Planning, Childhood, Orientation). In the rebuild, all audio is checked and normalized.
- Weather slide: one thermometer with a movable marker.
- Food Planning: a final slide showing all of the meal choices together.
- Childhood: replace "When did you finish school?" with "How did you get to school?".
- Orientation: four new reveal slides from `orientation session updates.pptx` (landmark state, landmark country, food countries, clothing countries). We will request the original PowerPoint and its twelve images from GWEP for M1.

### Orientation reveal prompts (verbatim)

Source: the signed Scope of Work, Deliverable #7, which quotes GWEP's `orientation session updates.pptx`. Use these prompts exactly as written and in this order.

1. What state is the famous landmark located?
2. The famous landmark is located in what country?
3. What countries are known for this food?
4. What country is known for this type of clothing?

Each prompt is a `reveal` slide that pairs an image with an answer; the answer appears only when the facilitator activates the Reveal control. In M0, both the image and the answer are placeholders and are clearly labeled as placeholders.

Note: Mathew will ask GWEP to confirm whether prompt 1 is missing a final "in". M0 keeps the supplied wording above.

## 11. Open questions sent to GWEP (answers requested by November 20, 2026)

1. How sessions are run (room, Zoom, own devices) and which devices are used most.
2. Who uses the site, and whether it should be public or require sign-in.
3. Whether the fourteen sessions keep their current order and slides.
4. Which activities must work in every session.
5. What editors need to change themselves, and whether changes need review before going live.
6. Accessibility needs beyond large text and clear audio (captions, transcripts, languages).
7. Whether the site should collect any information (feedback, attendance).
8. Whether sessions ever run without reliable internet.
9. Branding (SLU or GWEP logos, colors, site name).
10. What the mid-December prototype must show to count as a success.

Until answers arrive, follow the assumptions in section 6 and keep choices easy to change.

## 12. Constraints

- **Privacy:** no analytics, tracking, cookies or third-party scripts, and no personal data, unless GWEP approves in writing. GWEP is responsible for IRB and other regulatory requirements.
- **Media rights:** existing images and audio may be licensed stock from the original developer. Until GWEP confirms rights, the prototype uses clearly marked placeholder or openly licensed media.
- **Secrets:** no credentials, tokens or keys in the repository. Ever.
- **Ownership:** domain, Cloudflare and GitHub accounts belong to SLU or GWEP, with OSS as administrators.

## 13. Roadmap

| Milestone | Target date | Scope |
| --- | --- | --- |
| M0: Demo prototype | Monday, November 23, 2026 | Session list, session player, core slide types, Orientation session with placeholder media, CMS editing shown locally |
| M1: MVP | Mid-December 2026 (by December 18) | Deployed on Cloudflare, CMS with editor login, Orientation complete with the four new slides, shared slides finished, accessibility checks passing in CI |
| M2: All sessions | End of February 2027 | Remaining thirteen sessions, all corrections built in, GWEP review of each session |
| M3: Launch | March 2027 | Accessibility review, testing with facilitators, editor training, operations handbook, switch to the new address |
| Handover | Before May 2027 | Documentation complete so other OSS developers can take over |

Status reports go to GWEP every Friday before the biweekly Monday meetings (starting November 23, 2026).

## 14. Team and workflow

| Who | Role |
| --- | --- |
| Mathew Shereni | Developer and project owner. Final say on technical decisions and merges |
| Claude | Writes the code: features, tests and documentation, on feature branches with pull requests |
| Codex and Antigravity | Review every pull request against `AGENTS.md`. They comment and suggest; they do not push to the author's branch unless Mathew asks |
| Daniel Shown | OSS Program Director, kept informed |
| GWEP contacts (Marla Berg-Weger, Max Zubatsky) | Requirements, content approval, acceptance |

Flow: issue, then branch `feat/<short-name>`, then pull request with a filled-in template, then reviews from Codex and Antigravity, then Mathew merges.
