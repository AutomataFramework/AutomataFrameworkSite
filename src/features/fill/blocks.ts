// The four blocks of the home page that are made of the game's facts rather than written by hand: the level's file as
// rows, the table of places the recorded play runs, the cards of the five claims and the world map. Pure: facts in, markup out. Every
// value that came from a game passes through `escapeHtml`, so a name or a row with markup in it is shown as words.
import type { Claim } from '../claims/claims.ts'
import { STAMP_WORDS, titleShown } from '../claims/claims.ts'
import type { GameFacts } from '../facts/facts.ts'

/** Words as the page shows them: the four characters that could open or close markup are written out. */
export function escapeHtml(words: string): string {
  return words.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** One row of the file panel, with an optional note on the right (a label, set in capitals by the stylesheet). */
function row(text: string, note?: string): string {
  const leader =
    note === undefined ? '' : `<i class="leader"></i><span class="note">${escapeHtml(note)}</span>`
  return `<div class="row"><code>${escapeHtml(text)}</code>${leader}</div>`
}

/** `word` in quotes the way the file writes it, so a quote or a backslash in a game's own words is shown as it is there. */
const quoted = (word: string): string => JSON.stringify(word)

/**
 * The level's file as rows: its id, its first and last row of tiles with a count of the rows left out between, and its
 * first thing. The three notes describe the file's format, so they are true of any level an editor saves; none names
 * anything of the game's art.
 */
export function levelFile(facts: GameFacts): string {
  const { id, firstRow, lastRow, height, thing } = facts.level
  const rows: string[] = [row(`"id": ${quoted(id)},`), row('"tiles": [', 'The level, row by row')]
  rows.push(row(`  ${quoted(firstRow)}${height > 1 ? ',' : ''}`))
  const between = height - 2
  if (between > 0) rows.push(row(`  … ${between} more ${between === 1 ? 'row' : 'rows'}`))
  if (height > 1) rows.push(row(`  ${quoted(lastRow)}`))
  if (thing === undefined) {
    rows.push(row(']'))
  } else {
    rows.push(
      row('],'),
      row('"things": ['),
      row(`  { "character": ${quoted(thing.character)},`, 'What it is'),
      row(`    "x": ${thing.x}, "y": ${thing.y} }`, 'Where it starts'),
      row(']'),
    )
  }
  return rows.join('')
}

/** One row a place the recorded play runs: its name, and that it ends the same as the others. */
export function engineRows(facts: GameFacts): string {
  return facts.engines
    .map(
      (engine) =>
        `<tr><th scope="row">${escapeHtml(engine)}</th><td class="same"><i data-icon="check-circle"></i><span>Same ending</span></td></tr>`,
    )
    .join('')
}

/** One card a claim, numbered from 01, each with the stamp that says where it stands. */
export function claimCards(claims: readonly Claim[]): string {
  return claims
    .map((claim, at) => {
      const icon = claim.state === 'works' ? '<i data-icon="check"></i>' : ''
      const stamp = `<span class="stamp ${claim.state}">${icon}<span>${STAMP_WORDS[claim.state]}</span></span>`
      const number = String(at + 1).padStart(2, '0')
      return `<li class="claim"><span class="number">${number}</span><h3>${escapeHtml(titleShown(claim))}</h3><p>${escapeHtml(claim.line)}</p>${stamp}</li>`
    })
    .join('')
}

type Box = GameFacts['world']['levels'][number]

const plural = (count: number, one: string, many: string): string => `${count} ${count === 1 ? one : many}`

/** A number for an SVG attribute: whole, or with at most two decimals. */
const n = (value: number): string => String(Math.round(value * 100) / 100)

/** "level-2" with a capital first letter, to start a sentence. */
const capital = (words: string): string => words.charAt(0).toUpperCase() + words.slice(1)

/**
 * The line between two levels a door joins, from `a`'s side to `b`'s: across the gap when one is beside or above the
 * other, at the middle of the stretch they share, else from middle to middle.
 */
function doorLine(a: Box, b: Box): { x1: number; y1: number; x2: number; y2: number } {
  const middle = (from: number, to: number): number => (from + to) / 2
  const shareY = middle(Math.max(a.y, b.y), Math.min(a.y + a.height, b.y + b.height))
  const shareX = middle(Math.max(a.x, b.x), Math.min(a.x + a.width, b.x + b.width))
  if (a.x + a.width <= b.x) return { x1: a.x + a.width, y1: shareY, x2: b.x, y2: shareY }
  if (b.x + b.width <= a.x) return { x1: a.x, y1: shareY, x2: b.x + b.width, y2: shareY }
  if (a.y + a.height <= b.y) return { x1: shareX, y1: a.y + a.height, x2: shareX, y2: b.y }
  if (b.y + b.height <= a.y) return { x1: shareX, y1: a.y, x2: shareX, y2: b.y + b.height }
  return {
    x1: a.x + a.width / 2,
    y1: a.y + a.height / 2,
    x2: b.x + b.width / 2,
    y2: b.y + b.height / 2,
  }
}

/**
 * The world map as an SVG drawn in tiles: a box for each level where the world file puts it, with its id; one line for
 * each pair of levels a door joins, with an arrow at each end a door leads to; and a bar along each edge where two
 * levels join. Colours are the stylesheet's (by class), so the map is in the site's palette. Its spoken name says the
 * same in words.
 */
export function worldMap(facts: GameFacts): string {
  const { levels, doors, joins } = facts.world
  const left = Math.min(...levels.map((l) => l.x))
  const top = Math.min(...levels.map((l) => l.y))
  const right = Math.max(...levels.map((l) => l.x + l.width))
  const bottom = Math.max(...levels.map((l) => l.y + l.height))
  const byId = new Map(levels.map((level) => [level.id, level]))

  const said = [`A map of ${plural(levels.length, 'level', 'levels')}.`]
  for (const door of doors) said.push(`${capital(door.from)} has a door to ${door.to}.`)
  for (const join of joins) said.push(`${capital(join.a)} and ${join.b} join edge to edge.`)

  // One line for each pair, in the order the first door between them comes.
  const pairs: { a: Box; b: Box; ab: boolean; ba: boolean }[] = []
  for (const door of doors) {
    const from = byId.get(door.from)
    const to = byId.get(door.to)
    if (from === undefined || to === undefined) continue
    const found = pairs.find(
      (pair) => (pair.a === from && pair.b === to) || (pair.a === to && pair.b === from),
    )
    if (found === undefined) pairs.push({ a: from, b: to, ab: true, ba: false })
    else if (found.a === from) found.ab = true
    else found.ba = true
  }

  const parts: string[] = [
    '<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path class="arrow" d="M0 0 10 5 0 10z"/></marker></defs>',
  ]
  for (const level of levels) {
    parts.push(
      `<rect class="level" x="${n(level.x)}" y="${n(level.y)}" width="${n(level.width)}" height="${n(level.height)}"/>`,
    )
  }
  for (const level of levels) {
    parts.push(
      `<text class="name" x="${n(level.x + 0.6)}" y="${n(level.y + 2.2)}">${escapeHtml(level.id)}</text>`,
    )
  }
  for (const { a, b, ab, ba } of pairs) {
    const line = doorLine(a, b)
    const ends = `${ba ? ' marker-start="url(#arrow)"' : ''}${ab ? ' marker-end="url(#arrow)"' : ''}`
    parts.push(
      `<line class="door" x1="${n(line.x1)}" y1="${n(line.y1)}" x2="${n(line.x2)}" y2="${n(line.y2)}"${ends}/>`,
    )
  }
  for (const { line } of joins) {
    parts.push(
      `<line class="join" x1="${n(line.x1)}" y1="${n(line.y1)}" x2="${n(line.x2)}" y2="${n(line.y2)}"/>`,
    )
  }
  const box = `${n(left - 1)} ${n(top - 1)} ${n(right - left + 2)} ${n(bottom - top + 2)}`
  return `<svg class="world" viewBox="${box}" role="img" aria-label="${escapeHtml(said.join(' '))}">${parts.join('')}</svg>`
}
