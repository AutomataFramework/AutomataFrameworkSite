// What every journey shares: the sizes it plays at, and a watch for anything the page reports going wrong.
import type { Page } from '@playwright/test'

/** Small phone, tablet and computer (the device matrix in CLAUDE.md's Settings). */
export const SIZES = [
  { name: 'small phone', width: 390, height: 844 },
  { name: 'tablet', width: 820, height: 1180 },
  { name: 'computer', width: 1440, height: 900 },
] as const

/**
 * Every console error and uncaught error from now on, as a list to check at the end. A file the safety header blocks
 * (a font, a style) shows up here as a console error. `expected` leaves out the one error a journey means to cause,
 * such as the 404 of a missing page.
 */
export function watchForTrouble(page: Page, expected: RegExp | null = null): () => string[] {
  const trouble: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error' && !(expected?.test(message.text()) ?? false)) trouble.push(message.text())
  })
  page.on('pageerror', (error) => trouble.push(error.message))
  return () => trouble
}

/** The colour of a thing's words and of the ground behind it, as the browser drew them. */
export async function colours(page: Page, selector: string): Promise<{ words: string; ground: string }> {
  return page
    .locator(selector)
    .first()
    .evaluate((element) => {
      let ground = 'rgba(0, 0, 0, 0)'
      for (let at: Element | null = element; at !== null; at = at.parentElement) {
        const colour = getComputedStyle(at).backgroundColor
        if (colour !== 'rgba(0, 0, 0, 0)' && colour !== 'transparent') {
          ground = colour
          break
        }
      }
      return { words: getComputedStyle(element).color, ground }
    })
}
