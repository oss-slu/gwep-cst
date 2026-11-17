# AI-Assisted Development: Security, Architecture & Production Readiness Review

A reusable, technology-agnostic checklist for developers and AI coding agents. Apply **Gate 1** before implementation and **Gate 2** during testing and before release. Revisit both when scope, dependencies, permissions, or architecture change.

> **Review rule:** Answer applicable questions with concrete reasoning or evidence. Mark each item **Passed / Failed / Not Tested / Not Applicable**. A checked box means *reviewed*, not necessarily *passed*. Do not claim that a system is secure or scalable without supporting evidence.

## Gate 1: Before Development — Architecture, Security & Design

### A. Architecture and simplicity

- [ ] **1.** Is this the simplest architecture that satisfies the requirements without sacrificing security, scalability, or maintainability?
- [ ] **2.** Are we introducing unnecessary abstractions, dependencies, services, or design patterns?
- [ ] **3.** Are responsibilities clearly separated, and can components be modified without breaking unrelated functionality?
- [ ] **4.** What assumptions are we making about users, infrastructure, data, and external systems, and what happens if those assumptions are wrong?

### B. Security by design

- [ ] **5.** What are the system's entry points, trust boundaries, sensitive assets, and likely attack vectors?
- [ ] **6.** How will authentication and authorization be enforced on every protected operation, including object-level and tenant-level access?
- [ ] **7.** How will untrusted input be validated and prevented from becoming SQL, executable code, shell commands, file paths, or other dangerous operations?
- [ ] **8.** How will secrets and sensitive data be protected in storage, transit, logs, backups, and third-party integrations?
- [ ] **9.** If the system uses AI, how will prompt injection, malicious retrieved content, excessive agent permissions, and unauthorized tool execution be contained?

### C. Scalability and performance

- [ ] **10.** What happens when the system grows from hundreds to 100,000 or more users, and which components will become bottlenecks first?
- [ ] **11.** What are the expected peak concurrent users, requests per second, data volumes, and performance targets?
- [ ] **12.** Are database queries, indexing, caching, pagination, and data-access patterns designed to avoid unnecessary work?
- [ ] **13.** Which operations should be asynchronous, queued, batched, or rate-limited instead of blocking user requests?

### D. Reliability and failure handling

- [ ] **14.** What happens when a database, external API, AI provider, network connection, or background worker becomes slow or unavailable?
- [ ] **15.** What timeouts, bounded retries, backoff, circuit breakers, and fallback behaviors are appropriate?
- [ ] **16.** How will the system prevent duplicate operations, race conditions, inconsistent state, and data loss?
- [ ] **17.** How will resource consumption, concurrency, and costs be bounded to prevent overload or abuse?

### E. Maintainability and operations

- [ ] **18.** How will this design be tested, monitored, debugged, deployed, and rolled back safely?
- [ ] **19.** What security and dependency checks must run automatically in CI/CD?
- [ ] **20.** Which design decisions are necessary now, and which can be deferred until actual requirements or measurements justify them?

---

## Gate 2: During Testing and Before Deployment — Security, Performance & Production Audit

### A. Security and attack resistance

- [ ] **1.** Can an unauthenticated or unauthorized user access, modify, delete, or enumerate protected resources?
- [ ] **2.** Can users access another user's or tenant's data by manipulating identifiers, URLs, API parameters, or tokens?
- [ ] **3.** Have SQL injection, command injection, cross-site scripting, path traversal, SSRF, and unsafe file-upload scenarios been tested where applicable?
- [ ] **4.** Are inputs validated at trust boundaries and are database operations parameterized rather than built using string concatenation?
- [ ] **5.** Can malicious prompts, documents, repositories, or retrieved content manipulate AI agents into disclosing information or executing unauthorized actions?
- [ ] **6.** Are API keys, credentials, tokens, and personal data protected from exposure in logs, errors, responses, generated artifacts, and source control?
- [ ] **7.** Have dependencies, containers, CI/CD workflows, and deployment permissions been scanned or reviewed for known vulnerabilities and excessive privileges?

### B. Performance and scalability

- [ ] **8.** Has the system been load-tested against realistic peak concurrency and traffic patterns, rather than only a total user count?
- [ ] **9.** What are the measured p50, p95, and p99 response times, throughput, and error rates under normal and peak loads?
- [ ] **10.** Are there slow database queries, N+1 queries, missing indexes, memory leaks, blocking operations, or unbounded data processing?
- [ ] **11.** Does the system remain responsive when request volume spikes, and does it enforce backpressure or reject excess work safely?
- [ ] **12.** Do caching, pagination, connection pooling, and background processing behave correctly under concurrent load?

### C. Reliability and failure recovery

- [ ] **13.** What actually happens when dependencies respond slowly, time out, return malformed data, or become unavailable?
- [ ] **14.** Are timeouts enforced and retries bounded with backoff and jitter, without creating retry storms?
- [ ] **15.** Can concurrent requests, repeated messages, or duplicate submissions cause race conditions, duplicate writes, or corrupted state?
- [ ] **16.** Can the application recover from process crashes, worker failures, interrupted deployments, and network partitions without losing critical data?
- [ ] **17.** Are database transactions, migrations, backups, and restoration procedures tested for correctness?
- [ ] **18.** Are resource limits, queue sizes, connection limits, and cost controls sufficient to prevent exhaustion?

### D. Operational readiness

- [ ] **19.** Are useful metrics, structured logs, distributed traces where appropriate, and actionable alerts available without leaking sensitive data?
- [ ] **20.** Can operators distinguish application bugs, infrastructure failures, attacks, and external-provider outages?
- [ ] **21.** Are production configurations secure, including TLS, CORS, cookies, security headers, access permissions, and debug settings where applicable?
- [ ] **22.** Can the application be deployed and rolled back safely, including handling incompatible database migrations?
- [ ] **23.** Have disaster recovery, incident response, and credential rotation procedures been documented and exercised?

### E. Code quality and final approval

- [ ] **24.** Is any code unnecessarily complicated, duplicated, fragile, or dependent on behavior that is not guaranteed?
- [ ] **25.** Which security, performance, reliability, and correctness claims have been demonstrated by tests, and which remain unverified?

---

## Mandatory Review Policy for AI Coding Agents

1. **Before implementation:** Answer the applicable Gate 1 questions. Identify risks, explain architectural trade-offs, and propose the simplest defensible solution.
2. **During implementation:** Revisit questions whenever trust boundaries, data flows, permissions, dependencies, or infrastructure change.
3. **Before merge or deployment:** Evaluate applicable Gate 2 questions against actual code, configuration, and observed behavior.
4. **For every significant finding, report:**
   - Risk and severity
   - Affected component and code location
   - Exploit or failure scenario
   - Recommended mitigation
   - Test or evidence verifying the mitigation
   - Status: **Passed / Failed / Not Tested / Not Applicable**
5. **Release decision:** Block release for unresolved critical vulnerabilities and high-risk findings unless explicitly accepted through the team's documented risk process. Record untested requirements as unknown, never as passed.
6. **Independent enforcement:** Use automated tests, security scans, permission boundaries, branch protections, and human review. An AI agent's self-assessment alone is not proof of security.

### Suggested Finding Template

```markdown
| Question | Status | Severity | Evidence / Test | Action / Owner |
|---|---|---|---|---|
| Gate 2, Q3 | Not Tested | High | No injection tests yet | Add tests before release |
```

**Core principle:** Gate 1 prevents poor design decisions. Gate 2 tests whether the implementation actually meets its security, reliability, performance, and operational requirements.
