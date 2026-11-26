import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { expr, head, job, readWorkflow } from './read.ts'

// These checks read the workflows' text because a workflow only runs on GitHub.
const ci = readWorkflow('ci.yml')
const journeys = readWorkflow('journeys.yml')

test('the workflow as a whole can only read the repository', () => {
  expect(head(ci)).toMatch(/^permissions:\n {2}contents: read$/m)
  expect(head(journeys)).toMatch(/^permissions:\n {2}contents: read$/m)
})

test('every action is pinned to a commit', () => {
  for (const text of [ci, journeys]) {
    const uses = text.match(/^\s+- uses: \S+/gm) ?? []
    expect(uses.length).toBeGreaterThan(0)
    expect(text.match(/^\s+- uses: \S+@[0-9a-f]{40} # v\S+$/gm) ?? []).toHaveLength(uses.length)
  }
})

test("the build has Chromium before it builds, because the build takes the site's pictures", () => {
  const build = job(ci, 'build')
  // Installed before the build, or ready-made in Playwright's own image (how is `ci.yml`'s own pull request's call).
  const image = /\n {4}container:\n {6}image: mcr\.microsoft\.com\/playwright:/.test(build)
  if (!image) {
    expect(build).toContain('pnpm exec playwright install --with-deps chromium')
    expect(build.indexOf('playwright install')).toBeGreaterThan(
      build.indexOf('pnpm install --frozen-lockfile'),
    )
    expect(build.indexOf('playwright install')).toBeLessThan(build.indexOf('run: pnpm build'))
  }
})

// A job that drives a browser and runs in a container runs in Playwright's own image, whose tag is the lockfile's
// `@playwright/test`, pinned by digest, so it installs no browser or system library from the runner's package mirror
// (whose slow days hung `install-deps` until the job's timeout).
const playwright = (
  JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as {
    devDependencies: Record<string, string>
  }
).devDependencies['@playwright/test']
const image = new RegExp(
  `\\n {4}container:\\n {6}image: mcr\\.microsoft\\.com/playwright:v${playwright?.replaceAll('.', '\\.')}-noble@sha256:[0-9a-f]{64}\\n {6}options: --user 1001\\n`,
)

test.each([
  ['the build', () => job(ci, 'build')],
  ['the journeys', () => job(journeys, 'pieces')],
  ['the real build', () => job(readWorkflow('site.yml'), 'build-real')],
  ['the live check', () => job(readWorkflow('site.yml'), 'live')],
])(
  '%s, when it runs in a container, runs in the Playwright image pinned by digest and installs no browser',
  (_, read) => {
    expect(playwright).toMatch(/^\d+\.\d+\.\d+$/)
    const text = read()
    if (!/\n {4}container:/.test(text)) return
    expect(text).toMatch(image)
    expect(text).toContain(`test "$(pnpm exec playwright --version)" = "Version ${playwright}"`)
    const commands = text.split('\n').filter((line) => !line.trim().startsWith('#'))
    expect(commands.filter((line) => /playwright install|install-deps/.test(line))).toEqual([])
  },
)

test('nothing may write, and nothing pushes a branch (the pictures are artifacts only)', () => {
  for (const text of [ci, journeys, readWorkflow('site.yml')]) expect(text).not.toContain('git push')
  expect(ci).not.toContain('contents: write')
  expect(journeys).not.toContain('contents: write')
  expect(journeys).not.toContain('\n  screens:')
  expect(job(ci, 'journeys')).toMatch(/^ {6}actions: read$/m)
})

test('the called workflow is given the artifact', () => {
  expect(head(journeys)).toMatch(/workflow_call:\n {4}inputs:\n {6}site-artifact:/)
})

test('the journeys run in six pieces, each playing its share of every engine, and `gate` names a failing one', () => {
  const pieces = job(journeys, 'pieces')
  expect(pieces).toContain(`name: pieces (${expr('matrix.piece')}/6)`)
  expect(pieces).toContain('piece: [1, 2, 3, 4, 5, 6]')
  expect(pieces).toContain(`ENGINES: ${expr('inputs.engines')}`)
  expect(pieces).toContain('pnpm test:journeys --project "$engine" --shard="$PIECE/6"')
  // A failing engine marks the piece failed but the loop goes on to the next engine.
  expect(pieces).toContain('result=failed\n')
  expect(pieces).toContain('[ "$result" = passed ] || failed=1')
  expect(pieces).toContain(`name: results-piece-${expr('matrix.piece')}`)
  expect(journeys).not.toContain('\n  engines:\n')
  const engines = `${expr(`needs.plan.outputs.full == 'true' && '["chromium", "webkit", "firefox"]' || '["chromium"]'`)}`
  expect(job(ci, 'journeys')).toContain(`engines: ${engines}`)
  expect(job(ci, 'gate')).toContain(`ENGINES: ${engines}`)
  expect(job(ci, 'gate')).toContain('run: node scripts/browser-pieces.ts "$RUNNER_TEMP/results"')
  const script = readFileSync(new URL('../../scripts/browser-pieces.ts', import.meta.url), 'utf8')
  expect(script).toContain('export const PIECES = 6')
})

// Audit F7: a journey failed once on code that had just passed and the run kept nothing to say why.
test('a failed journey leaves its trace and its error behind, for every engine', () => {
  const pieces = job(journeys, 'pieces')
  expect(pieces).toContain('--output="ci-out/test-results/$engine"')
  expect(pieces).toMatch(
    /- uses: actions\/upload-artifact@[0-9a-f]{40} # v\S+\n {8}if: failure\(\)\n {8}with:\n {10}name: test-results-piece-\$\{\{ matrix\.piece \}\}\n {10}path: ci-out\/test-results\/\*\*/,
  )
})

test('a full run plays the files the fill gives this piece, and `gate` checks each played in exactly one piece', () => {
  const pieces = job(journeys, 'pieces')
  expect(pieces).toContain('pnpm exec playwright test --list --reporter=json --project "$engine" > "$list"')
  expect(pieces).toContain(
    'mine="$(node scripts/browser-fill.ts files "$PIECE" "$list" "$RUNNER_TEMP/times/test-times.json")"',
  )
  expect(pieces).toContain('--project "$engine" --reporter=list,json')
  expect(pieces).toContain(`"\${files[@]}"; then result=passed; fi`)
  // The container's own shell is `sh`, which has no lists: the step says Bash.
  expect(pieces).toMatch(/- name: Every engine's share of piece .*\n(?: {8}#.*\n)* {8}shell: bash\n/)
  expect(pieces).toContain(`name: times-piece-${expr('matrix.piece')}`)
  // The times come only from this repository's runs, found by the script, which needs `actions: read`.
  expect(pieces).toContain('run: node scripts/browser-fill.ts pick')
  expect(pieces).toMatch(/\n {4}permissions:\n {6}actions: read\n/)
  expect(job(ci, 'journeys')).toContain(`full: ${expr("needs.plan.outputs.full == 'true'")}`)
  const gate = job(ci, 'gate')
  expect(gate).toContain('run: node scripts/browser-fill.ts check "$RUNNER_TEMP/times"')
  expect(gate).toContain("if: always() && steps.cover.outcome == 'success'")
  expect(gate).toContain('name: test-times')
})

test('one server serves every engine in a piece, started in the step that plays them', () => {
  const pieces = job(journeys, 'pieces')
  expect(pieces.match(/wrangler pages dev dist/g) ?? []).toHaveLength(1)
  expect(pieces).toContain('BASE_URL: http://127.0.0.1:8788')
  const step = pieces.slice(pieces.indexOf("- name: Every engine's share"))
  expect(step.indexOf('wrangler pages dev dist')).toBeLessThan(step.indexOf('for engine in'))
})
