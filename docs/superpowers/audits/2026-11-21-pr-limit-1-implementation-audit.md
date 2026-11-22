# PR limit raise: implementation audit, cycle 1 (lane 3)

Audit 2026-11-21 17:15 UTC (from `date`). Fresh reviewer. Commits examined:

| Repo | Where | Head | Base |
| --- | --- | --- | --- |
| AutomataFramework | #233 | `899d2f7` | `43eca8b` (= main) |
| AutomataFrameworkEditors | branch `claude/raise-pr-limit`, no PR | `940b18f` | `0ad6a63` (= main) |
| AutomataFrameworkExamples | #91 | `4f42206` | `fae1ce0` (= main) |
| AutomataFrameworkSite | #76 | `4c61d68` | `3d34c7c` (main is now `2525e93`; merges clean) |

Brief: the owner's "Increase PR limit" (2026-11-21 16:54 UTC), the card approving the push (17:10 UTC), and the
acceptance criteria in #233's body.

## Results

1. Same change in all four: PASS. Each diff is one commit, 2 files, 2 lines: `CLAUDE.md` Settings line ("Pull requests
   open: 6 ... 7 at most") and `.claude/hooks/rules.json` `prFlow.maxOpenPrs` 3 -> 6. The four diffs are identical
   line for line; `prFlow` parses to `{enabled: true, maxOpenPrs: 6}` in all four. `rules.mjs` is byte-identical in all
   four, and unchanged by these commits.
2. Matches the kit: PASS. `/mnt/project-files/kit/message.md` line 80 equals the new `CLAUDE.md` line exactly (diff
   empty), and the kit's `rules.json` has `"maxOpenPrs": 6`.
3. Nothing else changes: PASS. `git diff --stat base...head` shows only those two files in each repo. Author and
   committer are McThayDT <107786093+mcthaydt@users.noreply.github.com> on all four commits. The PR bodies of #233, #91
   and #76 name Lane 3, have acceptance criteria, are drafts, and end "Requested by **McThayDT**".
4. Hook enforces the new number: PASS. I fed `rules.mjs` a `mcp__github__create_pull_request` call (draft, lane 1 body)
   with a stub `gh` reporting N open PRs, in each repo at its head:
   - heads: 2, 3, 5 open -> allowed; 6, 7 open -> refused "Pull requests open: 6 at most". So a 4th, 5th and 6th PR
     can open and a 7th cannot.
   - control, Framework `main` (`43eca8b`): 2 open allowed, 3 and 5 refused "3 at most". The limit is read from
     `rules.json`.
   - `node .claude/hooks/rules.mjs --check`: "CLAUDE.md and rules.json: no blanks" in all four.
   - `tests/workflows/compaction-hook.test.ts` (the repo test that reads the hook wiring) in Framework at `899d2f7`:
     5/5 passed. The repos have no unit test of `rules.mjs` itself.
5. Green: not yet. At 17:15 UTC, Framework had 10 success, 6 skipped, 1 queued; Examples 9 success, 1 skipped, 1
   queued; Site 6 success, 2 skipped, 6 running, 1 queued; nothing failed. Editors has no PR, so no CI. `gate` must be
   green on each head before its merge (#233's own criterion).

## Notes (not blocking, not fixed here)

- N1. The branch cap (7) is words only. No hook or check counts branches; the old 5 was not enforced either.
- N2. The hook reads `rules.json` from the working tree, so a branch that raises the limit applies it to itself before
  merge (Editors' branch can open its PR at 3 open). That is the owner-approved change here, but a branch could raise
  it without approval the same way; the server-side `pr-rules` check is not on `main` in any repo yet, and no
  workflow on `main` reads `maxOpenPrs`. Follow-up for the hooks thread.
- N3. Site #76 is behind `main` by #74 (only `site.yml` and a test); it merges clean.

## Verdict

- AutomataFramework #233: `899d2f7` PASS
- AutomataFrameworkExamples #91: `4f42206` PASS
- AutomataFrameworkSite #76: `4c61d68` PASS
- AutomataFrameworkEditors `claude/raise-pr-limit`: `940b18f` PASS (post on its PR once it opens; same head)

Each merge still waits for `gate` green on that head and the owner's lane 3 approval.
