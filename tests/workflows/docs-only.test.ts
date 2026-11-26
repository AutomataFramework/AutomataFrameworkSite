import { execFileSync } from 'node:child_process'
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'

// The docs-only fast path (the Owner, 2026-11-15): a pull request that changes only Markdown that people read runs no
// tests, and the `docs` job passes every check main requires under its exact name. The workflow only runs on GitHub,
// so these checks run the `plan` step's own script here, with a stand-in for `gh` that names the changed files.
const ci = readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8')
const jobs = ci.slice(ci.indexOf('\njobs:'))

/** One job's text: from its id (two spaces in) to the next job's id. */
const job = (id: string): string => {
  const rest = jobs.slice(jobs.indexOf(`\n  ${id}:\n`) + 1)
  const next = rest.slice(1).search(/\n {2}[\w-]+:\n/)
  return next < 0 ? rest : rest.slice(0, next + 1)
}

/** The `plan` step's script as GitHub runs it: the lines under `run: |`, their indent taken off. */
const script = (() => {
  const lines = job('plan').split('run: |\n')[1]?.split('\n') ?? []
  const end = lines.findIndex((line) => line !== '' && !line.startsWith(' '.repeat(10)))
  return (end < 0 ? lines : lines.slice(0, end)).map((line) => line.slice(10)).join('\n')
})()

/** What `plan` decides for a pull request that changes these files. */
function plan(files: string[], { draft = true, labels = '' } = {}): Record<string, string> {
  const dir = mkdtempSync(join(tmpdir(), 'plan-'))
  const gh = join(dir, 'gh')
  writeFileSync(gh, `#!/bin/sh\nprintf '%s\\n' ${files.map((file) => `'${file}'`).join(' ')}\n`)
  chmodSync(gh, 0o755)
  const output = join(dir, 'output')
  writeFileSync(output, '')
  execFileSync('bash', ['-c', script], {
    stdio: 'pipe',
    env: {
      PATH: `${dir}:${process.env.PATH ?? ''}`,
      EVENT: 'pull_request',
      DRAFT: String(draft),
      LABELS: labels,
      PR: '1',
      GITHUB_REPOSITORY: 'owner/repo',
      GITHUB_OUTPUT: output,
    },
  })
  const pairs = readFileSync(output, 'utf8').trim().split('\n')
  return Object.fromEntries(pairs.map((pair) => [pair.split('=')[0] ?? '', pair.split('=')[1] ?? '']))
}

test('a pull request that changes only Markdown that people read is docs-only, draft or not', () => {
  const files = ['CLAUDE.md', 'docs/superpowers/progress.md', 'docs/superpowers/plans/2026-11-15-a-plan.md']
  expect(plan(files)).toMatchObject({ docs: 'true' })
  expect(plan(files, { draft: false })).toMatchObject({ docs: 'true' })
})

test.each(['README.md', 'docs/notes.txt', 'index.html', 'src/index.ts'])(
  '%s, which a test reads or is not Markdown, is tested',
  (file) => {
    expect(plan(['CLAUDE.md', file])).toMatchObject({ docs: 'false' })
    expect(plan(['CLAUDE.md', file], { draft: false })).toMatchObject({ docs: 'false', full: 'true' })
  },
)

test('the `full-tests` label runs everything, Markdown or not', () => {
  expect(plan(['CLAUDE.md'], { labels: 'full-tests' })).toMatchObject({ docs: 'false', full: 'true' })
})

test('a draft that changes code still gets the quick run', () => {
  expect(plan(['CLAUDE.md', 'src/index.ts'])).toMatchObject({ docs: 'false', full: 'false' })
})

// Step 6 (throwaway #123): a draft that changed only `wrangler.toml` played no journey and passed, though the journeys'
// server refused the date it set. What the server reads reruns everything, as the build and test config do.
test.each(['wrangler.toml', 'pnpm-workspace.yaml', 'playwright.config.ts', 'vite.config.ts'])(
  'a draft that changes %s, which the journeys depend on, runs everything',
  (file) => {
    expect(plan([file])).toMatchObject({ docs: 'false', full: 'true', journeys: 'true' })
  },
)

// Every top-level file and folder chooses what a draft that changes it runs, so a new config file cannot slip past the
// selection the way `wrangler.toml` and `pnpm-workspace.yaml` did. A folder is named by one file in it; `docs/` and
// `tests/` hold more than one kind, and their other paths are tested above and in `ci.test.ts`.
const DRAFT_RUNS: Record<string, { path: string; runs: 'docs' | 'everything' | 'journeys' | 'no journeys' }> =
  {
    '.claude': { path: '.claude/settings.json', runs: 'no journeys' },
    '.github': { path: '.github/workflows/ci.yml', runs: 'everything' },
    '.gitignore': { path: '.gitignore', runs: 'no journeys' },
    '404.html': { path: '404.html', runs: 'journeys' },
    'CLAUDE.md': { path: 'CLAUDE.md', runs: 'docs' },
    LICENSE: { path: 'LICENSE', runs: 'no journeys' },
    'README.md': { path: 'README.md', runs: 'no journeys' },
    'biome.json': { path: 'biome.json', runs: 'no journeys' },
    docs: { path: 'docs/notes.md', runs: 'docs' },
    'index.html': { path: 'index.html', runs: 'journeys' },
    'knip.json': { path: 'knip.json', runs: 'no journeys' },
    'package.json': { path: 'package.json', runs: 'everything' },
    'playwright.config.ts': { path: 'playwright.config.ts', runs: 'everything' },
    'pnpm-lock.yaml': { path: 'pnpm-lock.yaml', runs: 'everything' },
    'pnpm-workspace.yaml': { path: 'pnpm-workspace.yaml', runs: 'everything' },
    public: { path: 'public/_headers', runs: 'journeys' },
    scripts: { path: 'scripts/browser-fill.ts', runs: 'journeys' },
    src: { path: 'src/build.ts', runs: 'journeys' },
    tests: { path: 'tests/fixtures/contrast.ts', runs: 'everything' },
    'tsconfig.json': { path: 'tsconfig.json', runs: 'everything' },
    'vite.config.ts': { path: 'vite.config.ts', runs: 'everything' },
    'vitest.config.ts': { path: 'vitest.config.ts', runs: 'everything' },
    'wrangler.toml': { path: 'wrangler.toml', runs: 'everything' },
  }

test('every top-level file and folder says what a draft that changes it runs', () => {
  const root = new URL('../../', import.meta.url).pathname
  const top = [
    ...new Set(execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' }).trim().split('\n')),
  ]
    .map((path) => path.split('/')[0] ?? '')
    .filter((name, index, all) => all.indexOf(name) === index)
    .toSorted()
  expect(top).toEqual(Object.keys(DRAFT_RUNS).toSorted())
  const expected = {
    docs: { docs: 'true' },
    everything: { docs: 'false', full: 'true', journeys: 'true' },
    journeys: { docs: 'false', full: 'false', journeys: 'true' },
    'no journeys': { docs: 'false', full: 'false', journeys: 'false' },
  }
  for (const [name, { path, runs }] of Object.entries(DRAFT_RUNS))
    expect(plan([path]), name).toMatchObject(expected[runs])
})

test('the `docs` job stands in for exactly the checks main requires, and only on a docs-only run', () => {
  const docs = job('docs')
  expect(docs).toContain("if: needs.plan.outputs.docs == 'true'")
  const names = [...docs.matchAll(/^ {10}- '([^']+)'$/gm)].map((match) => match[1])
  expect(names).toEqual(['check', 'build'])
})

test('every job that tests is left out of a docs-only run, so no skipped job wears a required name', () => {
  for (const id of ['check', 'build', 'journeys']) {
    expect(job(id), id).toMatch(/^ {4}if: .*needs\.plan\.outputs\.docs != 'true'/m)
  }
  expect(job('plan')).toContain("'skipped '")
})
