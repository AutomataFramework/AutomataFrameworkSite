// The game's place is the game's (the Owner, 2026-11-15): a finger on it never zooms the page, selects words, offers to
// save the picture or flashes grey, and once the game fills a phone held sideways it stays clear of the notch and the
// home bar. Read as text, like the colours; the journeys play the page itself.
import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'

const hero = readFileSync(new URL('../../src/styles/hero.css', import.meta.url), 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  '',
)
/** The declarations of the first rule whose selector is exactly `selector`. */
const rule = (selector: string): string => {
  const at = hero.indexOf(`${selector} {`)
  return at < 0 ? '' : hero.slice(at, hero.indexOf('}', at))
}

test("a finger on the game's place is never the browser's", () => {
  const game = rule('#game')
  for (const declaration of [
    'touch-action: manipulation;',
    'user-select: none;',
    '-webkit-user-select: none;',
    '-webkit-touch-callout: none;',
    '-webkit-tap-highlight-color: transparent;',
  ]) {
    expect(game).toContain(declaration)
  }
})

test('a game that fills a phone held sideways keeps inside the safe area', () => {
  const sideways = hero.slice(hero.indexOf('@media (max-height: 499px)'))
  for (const side of ['top', 'right', 'bottom', 'left']) expect(sideways).toContain(`env(safe-area-inset-${side})`)
})
