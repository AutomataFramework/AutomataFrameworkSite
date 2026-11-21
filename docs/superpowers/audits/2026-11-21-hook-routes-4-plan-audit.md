# Plan audit: close the routes around the rule hooks (cycle 4)

HEADS: Framework #230 at 7c9adf7, Editors #150 at f8797af, Examples #88 at 9c3eff3, Site #70 at defa84b.
VERDICT: FAIL until the implementation audit's R1 to R4 close. Lane 3. Auditor: Opus 5.5, medium.

Audit all of your work for completeness, consistency, cohesion, and harmony, both within itself and relative to the
spec and relative to the codebase. Assume nothing. Verify everything. Investigate any incomplete implementations or
incomplete integrations. Do your best work.

## Where the plan stands

Cycle 3 asked for generic fixes, and they arrived: a whole-line scan, a file-write scan, git settings that run
programs, the hook switch and the environment tools. Cycle 4's reds are weak points in those generic checks (they
count instead of placing, and they skip a few runners and a cwd), not new classes. The plan is right. The checks
need to be exact.

## Still for the owner (repeated from cycle 3, unchanged)

The session hook reads text, so it can be made strict but never complete. After the owner commands run, GitHub
itself holds merges and the open limit. It does not hold admin actions, because the sessions' token is a repo
admin: protection, settings, the release. Only a narrower token or a proxy rule closes those for good. That is the
owner's decision. If it has not been put to the owner yet, the lead thread should put it on a decision card.
