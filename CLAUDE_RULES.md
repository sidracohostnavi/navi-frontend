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

## Rule 11 — Verify DB Columns Before Using Them

Never reference a database column that is not already confirmed to exist. Before adding any new column reference in a query, select, update, or insert — stop and say: *"This requires the column `[column]` on `[table]`. Does it exist?"* Then wait for confirmation. Do not assume a column exists because it makes logical sense. The `is_active` incident (which wiped all properties from the UI) happened because I assumed a column existed without verifying.

---

## Rule 12 — Edit, Never Rewrite

When a task requires adding functionality to an existing file, use targeted edits only. Never use Write() to replace an entire working file. If a file needs a new button, add only the button. If a file needs a new state variable, add only that variable. Rewriting a file risks destroying working logic that was not part of the task. The properties page incident (disappearing listings) was caused by a full file rewrite that introduced an unverified column.

---

## Rule 13 — Out-of-Scope Changes Require Permission

If completing a task would benefit from also changing something outside the stated scope, do not make that change. Instead, flag it at the end: *"To fully solve this I would also need to touch [file/feature]. This is outside the current task — should I proceed?"* Then wait. Do not touch it until explicitly approved. This applies even if the out-of-scope change seems small or obviously correct.

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
