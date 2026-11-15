// TEMPORARY, deleted before this branch is marked ready. The proof of the fix to `.hero .tag` not coming to rest in Firefox:
// the same rounds that failed 5 times in 40 before it (a fresh Firefox, the real game, the page as it ships), now
// against the fixed stylesheet, many more of them.
import { expect, firefox, test } from '@playwright/test'

const AT_REST = /^(none|matrix\(1, 0, 0, 1, 0, 0\))$/


const ROUNDS = 100

test.describe('arrive diagnosis', () => {
  test.skip(({ browserName }) => browserName !== 'firefox', 'only Firefox shows it')

  for (let round = 0; round < ROUNDS; round++) {
    {
      const name = 'fixed'
      // biome-ignore lint/correctness/noEmptyPattern: Playwright reads the fixtures a test needs from this pattern.
      test(`${name} #${round}`, async ({}, testInfo) => {
        const { baseURL, storageState } = testInfo.project.use
        const browser = await firefox.launch()
        try {
          const context = await browser.newContext({
            ...(baseURL === undefined ? {} : { baseURL }),
            ...(storageState === undefined ? {} : { storageState }),
            viewport: { width: 390, height: 844 },
            reducedMotion: 'no-preference',
          })
          const page = await context.newPage()
          await page.addInitScript(() => {
            const log: string[] = []
            Object.assign(window, { __log: log })
            const note = (what: string): void => {
              log.push(`${Math.round(performance.now())} ${what}`)
            }
            for (const type of [
              'transitionrun',
              'transitionstart',
              'transitionend',
              'transitioncancel',
              'animationstart',
              'animationend',
              'animationcancel',
            ]) {
              document.addEventListener(
                type,
                (event) => {
                  if (!(event.target instanceof Element) || !event.target.classList.contains('tag')) return
                  const detail = event as TransitionEvent & AnimationEvent
                  note(`${type} ${detail.propertyName || detail.animationName} at ${detail.elapsedTime}`)
                },
                true,
              )
            }
            document.addEventListener('DOMContentLoaded', () => note('DOMContentLoaded'))
            window.addEventListener('load', () => note('load'))
            new MutationObserver(() => note(`html class="${document.documentElement.className}"`)).observe(
              document.documentElement,
              { attributes: true, attributeFilter: ['class'] },
            )
          })
          await page.goto('/')
          const read = (): Promise<{ opacity: string; transform: string }> =>
            page.locator('.hero .tag').evaluate((element) => {
              const s = getComputedStyle(element)
              return { opacity: s.opacity, transform: s.transform }
            })
          try {
            await expect
              .poll(read, { timeout: 3_000 })
              .toEqual({ opacity: '1', transform: expect.stringMatching(AT_REST) })
          } catch (error) {
            const state = await page.evaluate(() => {
              const tag = document.querySelector('.hero .tag')
              if (!(tag instanceof HTMLElement)) return { missing: true }
              const style = getComputedStyle(tag)
              const animations = tag.getAnimations().map((a) => {
                const what =
                  'transitionProperty' in a ? a.transitionProperty : (a as CSSAnimation).animationName
                return `${a.constructor.name} ${what} ${a.playState} t=${a.currentTime} pending=${a.pending}`
              })
              return {
                opacity: style.opacity,
                transform: style.transform,
                animations,
                everything: document.getAnimations().length,
              }
            })
            // Is the page's clock moving, and are frames being made?
            const clock = await page.evaluate(
              () =>
                new Promise<unknown>((done) => {
                  const before = document.timeline.currentTime
                  let frames = 0
                  const tick = (): void => {
                    frames++
                    requestAnimationFrame(tick)
                  }
                  requestAnimationFrame(tick)
                  setTimeout(
                    () =>
                      done({
                        before,
                        after: document.timeline.currentTime,
                        frames,
                        visibility: document.visibilityState,
                        focus: document.hasFocus(),
                      }),
                    600,
                  )
                }),
            )
            // Does the tag come to rest now, with frames and a restyle of its own?
            const later = await page.evaluate(() => {
              const tag = document.querySelector('.hero .tag')
              if (!(tag instanceof HTMLElement)) return 'missing'
              const afterClock = getComputedStyle(tag).transform
              tag.style.outline = '0 solid transparent'
              const afterRestyle = getComputedStyle(tag).transform
              tag.style.outline = ''
              return `after the clock probe: ${afterClock}; after a restyle: ${afterRestyle}`
            })
            const log = await page.evaluate(() => (window as unknown as { __log: string[] }).__log)
            throw new Error(
              `${name} #${round} stuck: ${JSON.stringify(state)}\nclock: ${JSON.stringify(clock)}\n${later}\n${log.join('\n')}\n${error}`,
            )
          } finally {
            await page.unrouteAll({ behavior: 'ignoreErrors' })
          }
        } finally {
          await browser.close()
        }
      })
    }
  }
})
