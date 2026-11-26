import { execFileSync } from 'node:child_process'
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'

// Plan step 7 (`docs/superpowers/plans/2026-11-26-public-ci-speed.md`): GitHub's merge queue tests each pull request
// merged with current `main`, and waits only on `gate`. So the workflow must run for the queue, run everything there,
// and check the commits and words of the pull request inside `gate`. The workflow only runs on GitHub, so these checks
// read its text and run `plan`'s own script.
const ci = readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8')
const jobs = ci.slice(ci.indexOf('\njobs:'))

const job = (id: string): string => {
  const rest = jobs.slice(jobs.indexOf(`\n  ${id}:\n`) + 1)
  const next = rest.slice(1).search(/\n {2}[\w-]+:\n/)
  return next < 0 ? rest : rest.slice(0, next + 1)
}

test('the workflow runs for the merge queue', () => {
  expect(ci.slice(0, ci.indexOf('\njobs:'))).toMatch(/^ {2}merge_group:\n {4}types: \[checks_requested\]$/m)
})

test('a merge queue run tests everything, without reading a diff', () => {
  const lines = job('plan').split('run: |\n')[1]?.split('\n') ?? []
  const end = lines.findIndex((line) => line !== '' && !line.startsWith(' '.repeat(10)))
  const script = (end < 0 ? lines : lines.slice(0, end)).map((line) => line.slice(10)).join('\n')
  const dir = mkdtempSync(join(tmpdir(), 'queue-'))
  // A `gh` that fails if `plan` asks it for a diff: a queue run has no pull request to ask about.
  writeFileSync(join(dir, 'gh'), '#!/bin/sh\necho "gh was called" >&2\nexit 1\n')
  chmodSync(join(dir, 'gh'), 0o755)
  const output = join(dir, 'output')
  writeFileSync(output, '')
  execFileSync('bash', ['-c', script], {
    stdio: 'pipe',
    env: {
      PATH: `${dir}:${process.env.PATH ?? ''}`,
      EVENT: 'merge_group',
      DRAFT: '',
      LABELS: '',
      PR: '',
      GITHUB_REPOSITORY: 'owner/repo',
      GITHUB_OUTPUT: output,
    },
  })
  const got = Object.fromEntries(
    readFileSync(output, 'utf8')
      .trim()
      .split('\n')
      .map((pair) => pair.split('=')),
  )
  expect(got).toMatchObject({ docs: 'false', full: 'true', journeys: 'true' })
})

test('commit-authors runs inside gate on every pull request and merge queue run, and only reads', () => {
  const check = job('commit-authors')
  expect(check).toContain("if: github.event_name != 'push'")
  expect(check).toContain('- run: node scripts/check-commit-authors.ts')
  expect(check).toContain(`PR_NUMBER: \${{ github.event.pull_request.number }}`)
  expect(check).toContain(`QUEUE_REF: \${{ github.event.merge_group.head_ref }}`)
  expect(check).toContain(`GH_TOKEN: \${{ github.token }}`)
  expect(check).not.toContain(': write')
  expect(check).not.toMatch(/github\.event\.pull_request\.(title|body|head\.ref)/)
  const gate = job('gate')
  expect(gate).toMatch(/^ {4}needs: \[.*\bcommit-authors\b.*\]$/m)
  expect(gate).toContain(`"commit-authors": \${{ github.event_name != 'push' }}`)
})
