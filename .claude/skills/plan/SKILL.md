---
name: plan
description: Design a feature before writing code. Spawns a planner subagent that reads the Memory Bank and writes a plan to swarm-report/. Use BEFORE /build, for any feature touching 2+ files or with unclear scope. Skip for typos and one-line fixes.
---

# Skill: /plan

You are the ORCHESTRATOR. You do not design the plan yourself — you run the planner
subagent and write down its output. No code edits here.

## Invocation
`/plan "<one-sentence feature>"`

## Steps

1. **Slugify** the feature → `<slug>` (kebab-case, short).
2. **Read context yourself** (cheap, keeps subagents focused): `.memory-bank/index.md`
   if it exists. If it does not, tell the user: "No Memory Bank found — plan will rest
   only on your description." and continue.
3. **Spawn the planner** — one `Task` call, `subagent_type: general-purpose`. Prompt:
   > Answer TERSE: terse, drop filler, keep all technical substance.
   > Read `.claude/agents/planner.md` and follow it exactly. Feature: <verbatim>.
4. **Check** (orchestrator only): list the planner's unresolved `risks` and any assumption
   the Memory Bank does not back under **Blockers**.
5. **Write** `swarm-report/<slug>-plan.md`:
   ```
   # Plan: <feature>   (slug: <slug>)
   ## TL;DR
   ## Acceptance criteria  — observable "done" conditions; /review checks these
   ## Plan                 — steps + affected files + tests
   ## Blockers             — unresolved risks and assumptions (human decides)
   ## Out of scope
   ## Assumptions
   ```
6. **Report to user**: TL;DR + any Blockers. If Blockers exist, ask the user to resolve
   them before `/build`.
