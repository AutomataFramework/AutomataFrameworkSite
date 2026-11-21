# Plan audit: close the routes around the rule hooks (cycle 5)

HEADS: Framework #230 at b906562, Editors #150 at 8b9410b, Examples #88 at 4d9e330, Site #70 at d2b9744.
VERDICT: PASS against the cycle 5 bar. Lane 3. Auditor: Opus 5.5, medium.

Audit all of your work for completeness, consistency, cohesion, and harmony, both within itself and relative to the
spec and relative to the codebase. Assume nothing. Verify everything. Investigate any incomplete implementations or
incomplete integrations. Do your best work.

The plan now has two layers that fit together. The hook refuses every route an honest session uses to reach GitHub,
fails closed on what it cannot read, and refuses runners, hook switches and files that run later. GitHub, once the
owner commands run, holds merges (`gate`, `pr-rules`, `commit-authors`, each pinned to GitHub Actions; merge commits
only) and the open limit (`pr-rules` closes a pull request opened past it).

What the plan cannot reach is unchanged, and it is the owner's to decide: the sessions' GitHub token is a repo admin,
so deliberately hidden calls to settings, protection or the release are stopped only by the hook's text reading. A
narrower token or a proxy rule would close that. The owner should be told this before or at the merge approval.

Merge needs, per CLAUDE.md lane 3: `gate` green on the merged head, the owner's approval, then the owner commands.
