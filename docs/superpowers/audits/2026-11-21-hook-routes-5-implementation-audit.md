# Implementation audit: close the routes around the rule hooks (cycle 5)

HEADS: Framework #230 at b906562, Editors #150 at 8b9410b, Examples #88 at 4d9e330, Site #70 at d2b9744.
VERDICT: PASS. Cycle 4's four reds are closed, no new red against the bar below, 5 notes.

Lane 3. Auditor: the same audit session as cycles 1 to 4 (not a writer of this code), Opus 5.5, medium. Started
2026-11-21T18:21:14Z.

Audit all of your work for completeness, consistency, cohesion, and harmony, both within itself and relative to the
spec and relative to the codebase. Assume nothing. Verify everything. Investigate any incomplete implementations or
incomplete integrations. Do your best work.

## The bar (set by the lead for this cycle)

GitHub-side protection and the `pr-rules` check hold merges and the open limit (once the owner commands run).
The hook blocks the routes honest sessions use. It must not block honest work. Cycle 5 checks the four cycle 4
fixes and that last point.

## What ran

- The fix is 102e0ab (`rules.mjs` and `rules.test.mjs`). The heads above add one commit each that only re-wraps one
  assertion in `rules.test.mjs`: `git diff 102e0ab b906562` is that one change, and `rules.mjs` is byte-identical
  across all four heads (one md5).
- `node --test .claude/hooks/rules.test.mjs`: 25 of 25 pass at b906562. `--check`: no blanks.
- CI on the heads when read (18:23 UTC): `rule-hooks` and `commit-authors` success on all four; `gate` not yet run on
  these heads (it was green on the cycle 4 heads). It must be green on the merged head as usual.
- The 101-call battery from cycle 4, the cycle 4 runner cases, and 30 honest-work calls, fed to the hook as
  PreToolUse, as this session's hooks run it. Nothing was sent to GitHub except reads.

## Cycle 4 reds: closed

- R1: `g""h pr list; watch …`, `"gh" --version; watch …`, `ls -t '<del>'; watch <del>`, `git log -m '<del>';
  parallel …` and a `printf '…\n<del>'` that writes a file are refused. The count was replaced by a rule that is
  harder to fool: with GitHub-write text in the line, only a short list of programs may run, and
  echo/printf/cat/jq may not write a file. Escaped `\n`, `\r` and `\t` are read as breaks.
- R2: `watch`, `parallel` and 35 other runners are refused outright. Python and Node running `git push --force` are
  refused. `gh issue reopen|edit|close` is in the write patterns.
- R3: `cd .git && cp /tmp/x hooks/pre-push` and `cd /root/.claude && cp /tmp/x settings.json` are refused (paths
  and redirect targets are resolved against each command's folder).
- R4: Write of `tools/nuke` starting `#!` with a gh write is refused; `#!/bin/sh` + `echo hello` is allowed.
- All 80 refusals from cycles 1 to 4 still refuse. The 3 calls allowed for the right reason (Framework is at 2 open
  pull requests) are still allowed.

## Honest work: runs

Allowed: `pnpm test`, `pnpm test:node`, `pnpm lint && pnpm knip`, `pnpm typecheck && pnpm build`, `pnpm test:engine
chromium`, `node .claude/hooks/rules.mjs --check`, `node -e` that reads a file, python heredocs that edit a doc
(including one replacing "open a PR"), `sed -i`, `git commit -F msg.txt` whose message says "gh pr create" and
"PR #230", `git commit -F - <<'EOF'` with "gh pr create --draft", `git commit -m '… gh pr merge …'`,
`git add && git commit && git push -u origin <branch>`, `git fetch && git merge && git push`, `gh pr create --draft
--body-file` (also after `cd` and after `git push -u`), `mkdir -p … && gh pr view … > file`, `gh pr view`, `gh api`
reads, `gh api -X POST …/issues/230/comments --input file`, `gh run watch`, a `for` loop of `gh pr view`, and
`date … && git rev-parse`.

## Notes (not blocking)

- N1 to N10 from earlier cycles stand.
- N11. Honest friction, each with a clear refusal that says what to do: `sleep 5; gh api -X POST …/comments` (any
  program outside the short list in the same line as a GitHub write, so split the line); a python heredoc that
  replaces the text "gh pr create" in a doc (use Edit). Optional: add `sleep`, `mkdir`, `pwd`, `cd` and `env` to
  `TEXT_SAFE`.
- N12. `node scripts/check-commit-authors.ts` is refused when run by hand. Correct: the script PATCHes pull request
  bodies on api.github.com. CI runs it, not sessions.
- N13. Obfuscation is still possible (for example `echo "g''h api -X DELETE …" | xargs -I{} sh -c '{}'`, Python
  building `"g"+"h"`). That is outside the bar: honest sessions don't write it, and GitHub's side holds merges and the
  limit. The admin-token point in the plan audit is unchanged and is the owner's.
- N14. The owner commands (`/mnt/project-files/setup/hooks-required-checks.md`, cycle 2 PASS) are unchanged. Run
  them after each repo's pull request merges; until then the GitHub-side half of the bar does not hold.
