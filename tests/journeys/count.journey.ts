// Counting visits, and nothing before a yes (the Owner, 2026-11-24: "do not collect anything until after it is
// accepted"). A first visit is asked once; no answer and "No" send nothing to anyone but the site, even after the game
// has started playing itself and after a reload; "Yes" adds Cloudflare's counter, once; and the footer changes the
// answer both ways. Cloudflare is never reached for real: its two addresses are answered here, and counted.
import { type BrowserContext, expect, type Page, test } from '@playwright/test'
import { untilWatching } from './home.ts'
import { arrive } from './look.ts'
import { SIZES } from './sizes.ts'
import { watchForTrouble } from './watch.ts'

const COUNTER = /^https:\/\/static\.cloudflareinsights\.com\/beacon\.min\.js/
const REPORT = /^https:\/\/cloudflareinsights\.com\/cdn-cgi\/rum/
const WORDS = {
  question: 'May we count your visit?',
  more: 'We only want to know how many people come. Cloudflare does the counting, with no cookies. Unless you press Yes, we count nothing.',
  yes: 'Yes',
  no: 'No',
  stop: 'Stop counting my visits',
  start: 'Count my visits',
} as const

/**
 * Every address any page of the visit (and its frames) asks for that is not the site's own, and the two stand-ins for
 * Cloudflare: the counter (a script that reports once, as the real one does) and the place it reports to. `counted()`
 * says how many times the counter was fetched, `reports()` how many reports reached it.
 */
async function watchTheWire(context: BrowserContext, site: string) {
  const away: string[] = []
  let counted = 0
  let reports = 0
  context.on('request', (request) => {
    const url = request.url()
    if (/^(data|blob|about):/.test(url)) return
    if (new URL(url).origin !== site) away.push(url)
  })
  await context.route(COUNTER, (route) => {
    counted++
    return route.fulfill({
      contentType: 'text/javascript',
      body: "fetch('https://cloudflareinsights.com/cdn-cgi/rum', { method: 'POST', body: '{}' })",
    })
  })
  // A report counts once the browser has finished it, not when it is answered: a journey that checks for trouble
  // right after must not catch one still on its way (CI's Chromium marked a 204 answered that way as aborted).
  context.on('requestfinished', (request) => {
    if (REPORT.test(request.url())) reports++
  })
  await context.route(REPORT, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/plain',
      body: 'ok',
      headers: { 'access-control-allow-origin': '*' },
    }),
  )
  return { away: () => [...away], counted: () => counted, reports: () => reports }
}

/**
 * The same visitor comes back: a new page on the same device (the answer is kept there), watched for trouble from its
 * start. A new page rather than a reload, because a reload cancels the game's loads in the page before it, and a
 * cancelled load is not what these journeys are about.
 */
async function comeBack(context: BrowserContext): Promise<{ page: Page; trouble: () => string[] }> {
  const page = await context.newPage()
  const trouble = watchForTrouble(page)
  await arrive(page)
  return { page, trouble }
}

const notice = (page: Page) => page.getByRole('region', { name: WORDS.question })
const press = (page: Page, name: string) => page.getByRole('button', { name, exact: true }).click()

for (const size of SIZES) {
  test.describe(size.name, () => {
    test.use({ viewport: { width: size.width, height: size.height } })

    test('a first visit is asked once, in plain words, and nothing leaves the site before an answer', async ({
      page,
      baseURL,
    }) => {
      const trouble = watchForTrouble(page)
      const wire = await watchTheWire(page.context(), new URL(baseURL ?? '').origin)
      await arrive(page)
      await expect(notice(page)).toBeVisible()
      await expect(notice(page).getByRole('heading')).toHaveText(WORDS.question)
      await expect(notice(page).locator('p')).toHaveText(WORDS.more)
      for (const name of [WORDS.yes, WORDS.no]) {
        const box = await notice(page).getByRole('button', { name, exact: true }).boundingBox()
        expect(box?.height ?? 0, name).toBeGreaterThanOrEqual(48)
        expect(box?.width ?? 0, name).toBeGreaterThanOrEqual(48)
      }
      // A fair question: Yes is not drawn to look like the answer to give. Both buttons share one look and one size.
      const look = (name: string) =>
        notice(page)
          .getByRole('button', { name, exact: true })
          .evaluate((button) => {
            const style = getComputedStyle(button)
            const box = button.getBoundingClientRect()
            return [
              style.color,
              style.backgroundColor,
              style.borderColor,
              style.fontWeight,
              box.width,
              box.height,
            ]
          })
      expect(await look(WORDS.yes)).toEqual(await look(WORDS.no))
      // The game has started playing itself, the page has settled, and still nobody but the site was asked for anything.
      await untilWatching(page)
      await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 1_000)))
      expect(wire.away()).toEqual([])
      expect(wire.counted()).toBe(0)
      await page.screenshot({ path: `tests/journeys/__screenshots__/${size.name}-asked.png` })
      expect(trouble()).toEqual([])
    })
  })
}

test.describe('desktop-1440x900: the answer', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('No sends nothing, now or when they come back, and the question is not asked again', async ({
    page,
    baseURL,
  }) => {
    const trouble = watchForTrouble(page)
    const wire = await watchTheWire(page.context(), new URL(baseURL ?? '').origin)
    await arrive(page)
    await press(page, WORDS.no)
    await expect(notice(page)).toBeHidden()
    expect(trouble()).toEqual([])
    const back = await comeBack(page.context())
    await untilWatching(back.page)
    await expect(notice(back.page)).toBeHidden()
    await expect(back.page.getByRole('button', { name: WORDS.start, exact: true })).toBeVisible()
    await back.page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 1_000)))
    expect(wire.away()).toEqual([])
    expect(wire.counted()).toBe(0)
    expect(back.trouble()).toEqual([])
  })

  test('Yes adds the counter once, and once again when they come back', async ({ page, baseURL }) => {
    const trouble = watchForTrouble(page)
    const wire = await watchTheWire(page.context(), new URL(baseURL ?? '').origin)
    await arrive(page)
    expect(wire.counted()).toBe(0)
    await press(page, WORDS.yes)
    await expect(notice(page)).toBeHidden()
    await expect.poll(wire.counted).toBe(1)
    await expect.poll(wire.reports).toBe(1)
    // Only Cloudflare's two addresses, nobody else.
    expect(wire.away().every((url) => COUNTER.test(url) || REPORT.test(url))).toBe(true)
    await expect(page.locator('script[src*="cloudflareinsights"]')).toHaveCount(1)
    expect(trouble()).toEqual([])
    const back = await comeBack(page.context())
    await expect(notice(back.page)).toBeHidden()
    await expect.poll(wire.counted).toBe(2)
    await expect.poll(wire.reports).toBe(2)
    await expect(back.page.locator('script[src*="cloudflareinsights"]')).toHaveCount(1)
    await expect(back.page.getByRole('button', { name: WORDS.stop, exact: true })).toBeVisible()
    expect(back.trouble()).toEqual([])
  })

  test('the footer changes the answer both ways', async ({ page, baseURL }) => {
    const trouble = watchForTrouble(page)
    const wire = await watchTheWire(page.context(), new URL(baseURL ?? '').origin)
    await arrive(page)
    await press(page, WORDS.yes)
    await expect.poll(wire.reports).toBe(1)
    // Yes to no: the counter on this page is cut off at once (a report it tries is refused), and none comes back.
    await press(page, WORDS.stop)
    await expect(page.getByRole('button', { name: WORDS.start, exact: true })).toBeVisible()
    await page.evaluate(() =>
      fetch('https://cloudflareinsights.com/cdn-cgi/rum', { method: 'POST', body: '{}' }).catch(
        () => 'refused',
      ),
    )
    expect(wire.reports()).toBe(1)
    // The one refused report is the browser keeping its word after "Stop"; nothing else may go wrong.
    expect(trouble().filter((line) => !line.includes('cloudflareinsights.com/cdn-cgi/rum'))).toEqual([])
    const back = await comeBack(page.context())
    await expect(notice(back.page)).toBeHidden()
    expect(wire.counted()).toBe(1)
    // No to yes, from the footer.
    await press(back.page, WORDS.start)
    await expect.poll(wire.counted).toBe(2)
    await expect.poll(wire.reports).toBe(2)
    await expect(back.page.getByRole('button', { name: WORDS.stop, exact: true })).toBeVisible()
    expect(back.trouble()).toEqual([])
  })
})
