import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { head, job, readWorkflow } from './read.ts'

// `site` puts `main` on the live address. It only runs on GitHub, so these checks read its text.
const site = readWorkflow('site.yml')

test('it runs on a push to main, or by hand, and never on a pull request', () => {
  expect(head(site)).toMatch(/^on:\n {2}push:\n {4}branches: \[main\]\n {2}workflow_dispatch:\n\n/m)
})

test('the workflow as a whole can only read the repository, and a run is never cancelled part way', () => {
  expect(head(site)).toMatch(/^permissions:\n {2}contents: read$/m)
  expect(head(site)).toContain('cancel-in-progress: false')
})

test('every action is pinned to a commit', () => {
  for (const line of site.split('\n').filter((l) => l.includes('uses:')))
    expect(line, line).toMatch(/uses: \S+@[0-9a-f]{40}(\s|$)/)
})

test('only the deploy job is given the Cloudflare token, and only on main', () => {
  expect(site.match(/secrets\.CLOUDFLARE_API_TOKEN/g)).toHaveLength(1)
  const deploy = job(site, 'deploy')
  expect(deploy).toContain('secrets.CLOUDFLARE_API_TOKEN')
  expect(deploy).toContain("if: github.ref == 'refs/heads/main'")
  expect(deploy).toMatch(/concurrency:\n {6}group: deploy\n {6}cancel-in-progress: false/)
})

test('the project it deploys to is the one in wrangler.toml', () => {
  const name = /^name = "([^"]+)"$/m.exec(
    readFileSync(new URL('../../wrangler.toml', import.meta.url), 'utf8'),
  )?.[1]
  expect(job(site, 'deploy')).toContain(`--project-name ${name} --branch main`)
})

test('the build names its commit, and the live job waits for exactly that commit before the other journeys', () => {
  expect(job(site, 'site-build')).toContain(`SITE_COMMIT: \${{ github.sha }}`)
  const live = job(site, 'live')
  expect(live).toContain('needs: deploy')
  expect(live).toContain(`EXPECT_SITE: \${{ github.sha }}`)
  const wait = live.indexOf('run: pnpm test:journeys tests/journeys/live.journey.ts --project chromium')
  const rest = live.indexOf('run: pnpm test:journeys --project chromium --grep-invert "the live address"')
  expect(wait).toBeGreaterThan(0)
  expect(rest).toBeGreaterThan(wait)
})

test("the live address is the one in index.html's share tags", () => {
  const url = /BASE_URL: (\S+)/.exec(job(site, 'live'))?.[1]
  const page = readFileSync(new URL('../../index.html', import.meta.url), 'utf8')
  expect(page).toContain(`<meta property="og:url" content="${url}/" />`)
})
