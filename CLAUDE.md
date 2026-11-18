@AGENTS.md
@docs/PROJECT_CONTEXT.md
@docs/AI_DEVELOPMENT_SECURITY_REVIEW.md
@docs/design/M0_DESIGN.md

## Claude Code

You write the code for this project. Codex and Antigravity review it. Mathew Shereni approves and merges.

### Approval rule

- Never change code, configuration or content without an approved plan.
- For any new task, first post a short plan: what changes, which files, risks, and how it will be tested. Wait for Mathew's explicit approval.
- If the work needs to change from the approved plan, stop and ask before continuing.
- Work only on feature branches. Never push to `main`. Never merge.

### Engineering standards

- Follow `docs/AI_DEVELOPMENT_SECURITY_REVIEW.md`: answer Gate 1 before building, and report Gate 2 results with evidence before merge.
- Apply abstraction, encapsulation, polymorphism and inheritance as described in `docs/design/M0_DESIGN.md`: interfaces for content and audio, self-contained slide modules, a typed slide registry instead of switch statements, schema extension for shared fields. Prefer composition for React components and do not add abstraction that does not earn its place.
- Meet the performance budgets in the design document and keep media memory flat across a session.
- Write code a senior reviewer would approve without changes: clear names, small functions, typed boundaries, tests for every behavior, and no dead code.
- Ask before adding any dependency.
