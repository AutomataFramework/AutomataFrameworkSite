import { execFileSync } from 'node:child_process'
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { checkNames, head, job, jobIds, readWorkflow } from './read.ts'

// The workflow only runs on GitHub, so these checks read its text and run `plan`'s own script here, with a stand-in
// for `gh` that names the changed files.
const ci = readWorkflow('ci.yml')

/** The `plan` step's script as GitHub runs it: the lines under `run: |`, their indent taken off. */
const script = (() => {
  const lines = job(ci, 'plan').split('run: |\n')[1]?.split('\n') ?? []
  const end = lines.findIndex((line) => line !== '' && !line.startsWith(' '.repeat(10)))
  return (end < 0 ? lines : lines.slice(0, end)).map((line) => line.slice(10)).join('\n')
})()

/** What `plan` decides for a pull request that changes these files (`null`: GitHub could not give the diff). */
function plan(files: string[] | null, { draft = true, labels = '' } = {}): Record<string, string> {
  const dir = mkdtempSync(join(tmpdir(), 'plan-'))
  const gh = join(dir, 'gh')
  writeFileSync(
    gh,
    files === null
      ? '#!/bin/sh\nexit 1\n'
      : `#!/bin/sh\nprintf '%s\\n' ${files.map((f) => `'${f}'`).join(' ')}\n`,
  )
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

test('the workflow as a whole can only read the repository', () => {
  expect(head(ci)).toMatch(/^permissions:\n {2}contents: read$/m)
})

test('every action is pinned to a commit', () => {
  const uses = ci.split('\n').filter((line) => line.includes('uses:'))
  expect(uses.length).toBeGreaterThan(0)
  for (const line of uses) expect(line, line).toMatch(/uses: \S+@[0-9a-f]{40}(\s|$)/)
})

test('a pull request that changes only Markdown that people read is docs-only, draft or not', () => {
  expect(plan(['CLAUDE.md', 'docs/superpowers/progress.md'])).toMatchObject({ docs: 'true' })
  expect(plan(['docs/superpowers/progress.md'], { draft: false })).toMatchObject({ docs: 'true' })
})

test.each(['README.md', 'index.html', 'src/styles.css', 'docs/notes.txt'])(
  'a change to %s is tested',
  (file) => {
    expect(plan(['docs/a.md', file])).toMatchObject({ docs: 'false' })
  },
)

test('a draft gets the quick run, a ready pull request or the `full-tests` label the full one', () => {
  expect(plan(['index.html'])).toMatchObject({ full: 'false' })
  expect(plan(['index.html'], { draft: false })).toMatchObject({ full: 'true' })
  expect(plan(['index.html'], { labels: 'full-tests' })).toMatchObject({ full: 'true' })
})

test('a diff GitHub cannot give runs everything', () => {
  expect(plan(null)).toMatchObject({ docs: 'false', full: 'true' })
})

test('`ci` keeps the names `main` requires, and `site` uses none of them', () => {
  const names = checkNames(ci)
  expect(names).toEqual(expect.arrayContaining(['check', 'build', 'gate']))
  expect(checkNames(readWorkflow('site.yml')).filter((name) => names.includes(name))).toEqual([])
})

test('the `docs` job stands in for exactly the checks main requires beside `gate`', () => {
  expect(job(ci, 'docs')).toMatch(/check:\n {10}- 'check'\n {10}- 'build'\n {4}env:/)
})

test('the gate always runs, needs every other job, and says for each whether it applies', () => {
  const gate = job(ci, 'gate')
  const others = jobIds(ci).filter((id) => id !== 'gate')
  expect(gate).toMatch(/^ {4}if: always\(\)$/m)
  expect(
    gate
      .match(/^ {4}needs: \[(.*)\]$/m)?.[1]
      ?.split(', ')
      .toSorted(),
  ).toEqual(others.toSorted())
  const applies = gate.match(/APPLIES: >-\n\s+(\{.*\})$/m)?.[1] ?? ''
  expect([...applies.matchAll(/"([a-z-]+)":/g)].map((m) => m[1]).toSorted()).toEqual(others.toSorted())
})

test('the journeys run in the pinned Playwright image, in all three engines on a full run', () => {
  const journeys = job(ci, 'journeys')
  expect(journeys).toMatch(/image: mcr\.microsoft\.com\/playwright:v1\.63\.0-noble@sha256:[0-9a-f]{64}/)
  expect(journeys).toContain('--project chromium --project webkit --project firefox')
  expect(journeys).toContain('run: pnpm test:journeys $ENGINES')
})
