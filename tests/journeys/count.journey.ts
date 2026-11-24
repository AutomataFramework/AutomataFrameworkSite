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

/** The site token of the Web Analytics site for automataframework.com, as the page carries it. */
const TOKEN = 'fda104fd676344cf87fa9e1225165470'

/**
 * Serves the home page with its counter token taken out, for every page of the visit: the page as it would be served
 * with no Cloudflare site behind it, which must ask nothing and add nothing. The site's own headers are kept.
 */
async function withoutToken(context: BrowserContext): Promise<void> {
  await context.route(
    (url) => url.pathname === '/',
    async (route) => {
      const response = await route.fetch()
      const served = await response.text()
      const tag = `<meta name="automata-counter-token" content="${TOKEN}" />`
      expect(served, 'the page as served carries the token').toContain(tag)
      await route.fulfill({
        response,
        body: served.replace(tag, '<meta name="automata-counter-token" content="" />'),
      })
    },
  )
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

    test('the question sits over the page, in the window, and moves nothing on the page', async ({
      page,
    }) => {
      const trouble = watchForTrouble(page)
      await arrive(page)
      await expect(notice(page)).toBeVisible()
      // Fixed to the window, all of it inside the window on arrival.
      const placed = await notice(page).evaluate((ask) => {
        const box = ask.getBoundingClientRect()
        return { position: getComputedStyle(ask).position, top: box.top, bottom: box.bottom }
      })
      expect(placed.position).toBe('fixed')
      expect(placed.top).toBeGreaterThanOrEqual(0)
      expect(placed.bottom).toBeLessThanOrEqual(size.height)
      // At the foot of the page, the footer's switch is not under the question: the page leaves it room.
      const room = await page.evaluate(() => {
        window.scrollTo(0, document.documentElement.scrollHeight)
        const ask = document.querySelector('[data-ask]')?.getBoundingClientRect()
        const change = document.querySelector('button[data-count-change]')?.getBoundingClientRect()
        return { askTop: ask?.top ?? 0, changeBottom: change?.bottom ?? Number.POSITIVE_INFINITY }
      })
      expect(room.changeBottom).toBeLessThanOrEqual(room.askTop)
      // Answering takes the question away and moves nothing: the game's sheet is where it was.
      const sheetAt = () =>
        page.evaluate(() => {
          window.scrollTo(0, 0)
          return document.querySelector('.sheet')?.getBoundingClientRect().top
        })
      const before = await sheetAt()
      await press(page, WORDS.no)
      await expect(notice(page)).toBeHidden()
      expect(await sheetAt()).toBe(before)
      expect(trouble()).toEqual([])
    })
  })
}

// With no token in the page there is nothing to count with: nothing is asked, nothing can be switched on, and nothing
// leaves the site, even with the game playing itself.
test.describe('phone-390x844: with no token', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('nothing is asked and nothing leaves the site', async ({ page, baseURL }) => {
    const trouble = watchForTrouble(page)
    const wire = await watchTheWire(page.context(), new URL(baseURL ?? '').origin)
    await withoutToken(page.context())
    await arrive(page)
    await untilWatching(page)
    await expect(notice(page)).toBeHidden()
    await expect(page.getByRole('button', { name: WORDS.start, exact: true })).toBeHidden()
    await expect(page.getByRole('button', { name: WORDS.stop, exact: true })).toBeHidden()
    await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 1_000)))
    expect(wire.away()).toEqual([])
    expect(wire.counted()).toBe(0)
    expect(trouble()).toEqual([])
  })
})

// A Yes given before, on a page that has since lost its token, still adds nothing: no token, nothing to count with.
test.describe('phone-390x844: a Yes from before, and no token now', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('nothing is asked, nothing is added and nothing leaves the site', async ({ page, baseURL }) => {
    const trouble = watchForTrouble(page)
    const wire = await watchTheWire(page.context(), new URL(baseURL ?? '').origin)
    await withoutToken(page.context())
    await page.addInitScript(() => localStorage.setItem('automata.site.counting', 'yes'))
    await arrive(page)
    await untilWatching(page)
    expect(await page.evaluate(() => localStorage.getItem('automata.site.counting'))).toBe('yes')
    await expect(notice(page)).toBeHidden()
    await expect(page.getByRole('button', { name: WORDS.start, exact: true })).toBeHidden()
    await expect(page.getByRole('button', { name: WORDS.stop, exact: true })).toBeHidden()
    await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 1_000)))
    await expect(page.locator('script[src*="cloudflareinsights"]')).toHaveCount(0)
    expect(wire.away()).toEqual([])
    expect(wire.counted()).toBe(0)
    expect(trouble()).toEqual([])
  })
})

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
    // The counter is told which site it counts for: the site's own token, as Cloudflare's script reads it.
    await expect(page.locator('script[src*="cloudflareinsights"]')).toHaveAttribute(
      'data-cf-beacon',
      JSON.stringify({ token: TOKEN }),
    )
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
