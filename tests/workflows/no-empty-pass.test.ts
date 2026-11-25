import { readdirSync, readFileSync } from 'node:fs'
import { expect, test } from 'vitest'

// CI never lets an empty suite pass (the workflow page's `build`, Verification): no workflow may hand a test runner
// `--passWithNoTests` or `--pass-with-no-tests`, so a run that tested nothing turns red instead of green.
const folder = new URL('../../.github/workflows/', import.meta.url)
const files = readdirSync(folder).filter((name) => name.endsWith('.yml'))

test('there are workflows to read', () => {
  expect(files).toContain('ci.yml')
})

test.each(files)('%s never lets an empty suite pass', (name) => {
  // Comments may name the flag to say why it is gone; only what runs is judged.
  const code = readFileSync(new URL(name, folder), 'utf8')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('#'))
    .join('\n')
  expect(code).not.toMatch(/--pass-?with-?no-?tests/i)
})
