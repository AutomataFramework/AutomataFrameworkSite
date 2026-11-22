# Audit: the identity hook allows GitHub's own merge commits (plan and implementation, cycle 1)

Brief: /mnt/project-files/briefs/fix-hook-github-merge-commit.md. Lane 3. Audited 2026-11-21 23:47 UTC.
Model: Opus 5.5 (project default; the coordinator asked for Fable 5.2 medium, which a thread cannot set itself).

Commits examined: AutomataFramework #244 bf82394, AutomataFrameworkEditors #165 c3ced69,
AutomataFrameworkExamples #96 36201d3, AutomataFrameworkSite #80 1576811.

**Verdict: PASS, 0 red, 2 notes.**

## Plan audit

The PR body is the plan: it states the lane, what changes, the acceptance criteria and how the hook matches CI.
It covers every criterion in the brief and touches only the two hook files. No gap.

## Checks run

| Check | Result |
|---|---|
| Diff vs main in each repo: only `.claude/hooks/rules.mjs` and `rules.test.mjs` | Pass: 2 files, +106 -12 in all four |
| Copies match | Pass: rules.mjs sha256 3e727c2d..., rules.test.mjs 4330e6dc... in all four |
| `node --test .claude/hooks/rules.test.mjs` at each head | Pass: 28/28 in all four (Node 22.23.5, the container's) |
| New tests fail on main's rules.mjs (Editors) | Pass: tests 26, 27, 28 fail, 25 pass |
| 1de7e03 shape | Author McThayDT <dawson@...>, committer GitHub <noreply@github.com>, 2 parents. The test builds the same shape (owner name, other email, GitHub committer, merge) on origin/main |
| CI lines named in the body | Pass: check-commit-authors.ts line 164 (`isOwner && !isExactOwner`) and 317 (`pulls/<n>/commits`), same file in all four mains |

## Acceptance criteria

1. GitHub-committed merge authored by the owner passes; other GitHub commits fail. Pass. `identityOk` needs the
   exact author and allows a GitHub committer only when there are 2+ parents. Test 27 covers the merge passing, a
   merge by the owner under another email failing, and a non-merge GitHub commit failing.
2. A test reproduces 1de7e03 and fails before the fix. Pass (test 26: a pull onto the GitHub merge is no longer
   flagged after the call, and a new commit is still flagged).
3. Hook and commit-authors agree. Pass, with the brief's own exception: both judge only the commits the branch adds
   (`--not --remotes` and the new `onRemote` skip; CI reads `pulls/<n>/commits`). The hook is stricter than CI on a
   GitHub web edit, which criterion 1 asks for. The PR body says so.
4. Same file, four PRs, no workflow or tests/** mix. Pass.

PR-body check (the brief's second part): read in `ghApi` and `checkPrBodyBash`. A write to `pulls/<n>` with
`body` or `title` is refused by every field form: `-f`, `-F`, `-Fbody=`, `--field`, `--raw-field=`, `body[]`,
`@file` (read or missing), `@-`, and `--input` JSON (read or unreadable). Method spellings `-X`, `-XPATCH`,
`--method`, PUT/POST, and paths with a leading slash, full URL, query string or `{owner}/{repo}` all reach the
same check. `state=open` stays with the open limit. The test covers inline, `-F @file`, `--field @file`,
`--input` JSON and a title.

## Notes (not blocking, not in this change's scope)

- **Note 1, the issues API can change a PR's words unjudged (already there before this change).** UNIT: rules.mjs
  `GH_WRITE_ALLOWED` (allows `issues/\d+`), `checkPrBodyBash` (judges only `gh pr create|edit` and `pulls` paths).
  EVIDENCE (read from the code): `gh api -X PATCH repos/<o>/<r>/issues/<n> -f body=...` and
  `gh issue edit <n> --body-file f` reach no body check; a PR is an issue, so GitHub applies them to the PR.
  EXPECTED: refused like the `pulls/<n>` route. FIX: in a follow-up, refuse `body`/`title` on `issues/<n>`
  writes and `gh issue edit` with `--body`, `--body-file` or `--title`, with tests; files: the two hook files.
  Not run live: a node script probing these was refused by the hook ("node runs a script that calls gh to change
  a pull request"), which is the hook working, so this note rests on reading the code.
- **Note 2.** Tests ran on Node 22 here; the stack is Node 24. The `rule-hooks` CI job is the Node 24 run.
