# Progress

Last updated: 2026-11-16 18:32 UTC (from `date`).

## Active milestone: the World slice (roadmap slice 3)

### Current work

- Installing the new workflow and its CI gate (this repo's setup pull request).

### Completed outcomes

- The flaky Firefox journey "each Play button hands the same game over" (failed once on `main`, e5dfc97) is fixed at its
  cause: the journey moved the page on while the game's font was still downloading. It now waits for the game's fonts,
  and the journey delays them so the race shows on every run.

### Remaining

- **The website demo uses World:** three levels with a door, for one or two players, and two levels joined on a world
  map, so the demo shows what World makes. The test game already has the levels and the door; the site picks it up
  once the test game has the world map part.
- The crate's numbers change when the test game's E4 lands.

### Blockers

- Waits on the test game's World demo.

### Previews

- The live site: https://automataframework.pages.dev (every merge to `main` deploys it).

### Material decisions

- None in this milestone yet.
