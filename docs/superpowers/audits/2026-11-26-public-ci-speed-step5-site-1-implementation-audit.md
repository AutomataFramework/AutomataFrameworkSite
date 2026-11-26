# Implementation audit: public CI speed, step 5, Site (cycle 1)

Verdict: **a93c99e PASS (0 red)**

Examined: AutomataFrameworkSite draft PR #121 at a93c99e, against step 5 and criteria 1, 2 and 5 of Framework's `docs/superpowers/plans/2026-11-26-public-ci-speed.md`, Framework #337 (PASS at de0ff7e), and the two carry-overs from Site's step 3 audit. Runs on a93c99e: `ci` [45760465122](https://github.com/AutomataFramework/AutomataFrameworkSite/actions/runs/45760465122) and `site` [45760465158](https://github.com/AutomataFramework/AutomataFrameworkSite/actions/runs/45760465158), both green (full runs, since the PR touches `.github/`).

## The carry-overs: both fixed

1. **An empty draft piece passed.**
   - `--shard` is gone from `journeys.yml`. Every run lists (`playwright test --list`, with `--only-changed=origin/main` when only journeys changed), fills by time, and plays its share by name.
   - A draft piece given nothing sets `result=none` and writes `<engine> none`. `browser-pieces.ts` accepts `none` but no other non-pass. On a full run, `files` throws on an empty piece, so the result stays `failed`.
   - `gate`'s `cover` step now runs whenever the journeys apply, drafts included, with the draft's engines and `FULL`. A draft list with nothing in it logs "the change reaches no journey file", and a full run with an empty list fails.
2. **The times lookup could race between pieces.** `pick` reads this run's `created_at` (`GITHUB_RUN_ID` is the caller's run in a called workflow) and keeps only `test-times` artifacts created before it. So all six pieces get the same answer, and a re-run attempt keeps the same cutoff. The same-repo and unexpired filters stay, and unit tests cover the cutoff.

   On 45760465122 and 45760465158, the pieces logged `Times from run 45757302389`, a `main` push run of this repository created at 04:46:16 UTC.

## What else was checked

- **The full runs.** `gate` printed `ok  chromium|webkit|firefox: 15 of 15 files played in exactly one piece` and recorded 15 files. Times are recorded only on full runs.
- **The `site` workflow (deploy path).** It still calls the journeys with the default `full: true`, so an empty piece fails there too.
- **Bash.** `[ "$result" = failed ] && failed=1` is not the last command of the loop body, so it cannot trip `-e`. A `failed` result still makes the job exit 1.
- **The difference from the plan.** The body names it in a section of that name, the same way #337 did: no list from `plan`, every piece starts and says `none`, and drafts are checked.
- No retry, no wider timeout, no new skip.

## Notes (not blocking)

- **The draft path has not run for real yet.** Step 6's throwaway draft should include one that changes a single journey, so pieces say `none` and the coverage check passes on the one file.
- **The plan amendment after #337 should cover Site,** including `--shard` gone and the run-start cutoff.
