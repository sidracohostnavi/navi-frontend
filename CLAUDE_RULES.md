# CLAUDE_RULES.md — Behavioral Guardrails for All Claude Sessions
**Environment:** Antigravity  
**Project:** Navi CoHost  
**These rules apply to every single task. No exceptions.**

---

## Rule 1 — Read Before You Write

Before writing any code, state:
1. Which files you will touch (by exact path)
2. What you will change in each file (one sentence per file)
3. What you will NOT touch

Wait for confirmation if the change touches more than 2 files or any service layer file.

---

## Rule 2 — Minimum Footprint

Only modify what is explicitly required by the task. If fixing a bug in `ical-processor.ts`, do not clean up unrelated code in the same file. Do not rename variables. Do not restructure imports. Do not "improve" adjacent logic.

**The rule:** Touch the smallest possible surface area to achieve the stated goal.

---

## Rule 3 — No Surprise Files

Never create a new file unless the task explicitly asks for one. If you believe a new file is needed, say: *"This would require creating [filename]. Should I proceed?"* — then wait.

---

## Rule 4 — No Surprise Dependencies

Never add a new npm package or import from a library not already in the codebase. If a package would genuinely solve the problem better, surface it: *"This could use [package]. It is not currently installed. Should I add it?"* — then wait.

---

## Rule 5 — No Schema Changes

Never suggest or write SQL migrations unless the task explicitly says "update the schema" or "write a migration." If your solution requires a schema change, say so and stop: *"This solution requires a schema change. Please confirm before I proceed."*

---

## Rule 6 — One Task, One Response

Complete exactly the task stated. Do not fix related issues you notice unless asked. If you notice a real problem nearby, flag it at the end: *"I noticed [issue] in [file] but did not touch it. Want me to address it separately?"*

---

## Rule 7 — Show Your Work in Plain English

After completing any code change, summarize in plain English (not bullet-pointed technical jargon):
- What you changed
- Why it solves the problem
- What to test to verify it works

Keep this to 3–5 sentences maximum.

---

## Rule 8 — Respect the Contracts

Before implementing anything related to: booking creation, enrichment logic, sync behavior, message sending, or property deletion — re-read the relevant contract from `docs/`. If your implementation would violate a contract rule, say so explicitly and propose an alternative that respects the contract.

---

## Rule 9 — Cron is Fragile

Any task involving `app/api/cron/` requires extra caution. Before touching cron:
- State exactly what the current behavior is
- State exactly what will change
- Confirm that idempotency is preserved
- Do not expand what the cron does beyond the fix requested

---

## Rule 10 — When Unsure, Ask One Question

If the task is ambiguous, ask exactly one clarifying question before proceeding. Do not write code while waiting for an answer. Do not make assumptions and proceed anyway.

---

## What a Good Response Looks Like

```
I will modify: `lib/services/email-processor.ts` only.

Change: Update the match condition on line ~47 to check `eligible_unenriched_count` 
before assigning guest name. No other files touched.

[code block]

To verify: Trigger a manual sync and confirm that when two properties share the same 
check-in date, neither gets auto-enriched and both appear in the Review Inbox.
```

## What a Bad Response Looks Like

- Rewriting the entire file because it "could be cleaner"
- Adding a helper utility file "to keep things DRY"
- Changing the API route signature because it "seemed inconsistent"
- Fixing 3 things when asked to fix 1
- Writing 200 lines when 20 would do
