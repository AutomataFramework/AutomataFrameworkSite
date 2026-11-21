# Site #74: implementation audit, cycle 1 (lane 3)

Audited 2026-11-21 (UTC, from `date`). Commit examined: `f6cd477`. See the plan audit in this folder.

Audit all of your work for completeness, consistency, cohesion, and harmony, both within itself and relative to the spec
and relative to the codebase. Assume nothing. Verify everything. Investigate any incomplete implementations or incomplete
integrations. Do your best work.

## Read and checked

- `build-real`: two checkouts (site, then the game with `persist-credentials: false`), the pnpm match step, setup-node's
  cache over both lockfiles, the game build, the site install, the version step, then `pnpm build`. Nothing uses `gh`,
  `sudo` or apt, so the image (it has git and bash, seen in #68's logs) has everything it needs. Only the install
  step was removed.
- `live`: checkout, pnpm, node, install, the version step, then the two journey commands, both unchanged.
- `ci.yml` `check`: only `ONLY` and `fetch-depth` changed. Criteria 4 and 5 are met by reading.
- No live-state file is on the head. Every body ends "Requested by **McThayDT**".

## Findings

UNIT: PR body, "After". VERDICT: red. REQUIREMENT: `release` "before and after numbers from real runs". REASON: still a
placeholder. EXPECTED: `build-real` setup and step times from this PR's full run, measured. `live`'s After is stated as
pending the first `site` run on `main`, as the body already says. FIX: body only.

UNIT: CI on `f6cd477`. VERDICT: red (until it ends). REQUIREMENT: criterion 3. EVIDENCE: at 16:4x UTC `build` and `check`
were running and `build-real` was queued. EXPECTED: `build-real` and `journeys-real` green on the first attempt. FIX: none
beyond the run. #73 merges first.

## Verdict

`f6cd477` FAIL: 2 red, and both clear without a code change. Once the After numbers for `build-real` are in the body and
the run on the same head is green the first time, I re-check and post PASS.
