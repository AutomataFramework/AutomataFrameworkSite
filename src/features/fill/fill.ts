// Writes the game's facts and the claims into the pages, the way `icons` writes icons: a page author leaves a
// placeholder and the build fills it, so no number, name, hash or stamp on a page is ever typed. The element stays (a
// journey can find it by its attribute); only its words, its address or its markup are written.
//
//   <span data-fact="steps"></span>        the words of one fact; the element must be empty
//   <a data-address="files">…</a>          gains an href; it must not have one
//   <div data-block="level-file"></div>    one of three blocks of markup; the element must be empty
//
// Anything else is a FillError that names the placeholder and the page, so a typo never ships as an empty gap.
import { type Claim, checkClaims } from '../claims/claims.ts'
import type { GameFacts } from '../facts/facts.ts'
import { GAME_REPO, isCommit, shortCommit } from '../version/version.ts'
import { claimCards, engineRows, escapeHtml, levelFile, worldMap } from './blocks.ts'

/** A failure with a plain sentence, ready to print in a build. */
export class FillError extends Error {}

export type FactName =
  | 'name'
  | 'version'
  | 'level-size'
  | 'engines-count'
  | 'engines-list'
  | 'steps'
  | 'files-count'
  | 'licence'
  | 'level-path'
  | 'replay-path'
  | 'replay-ending'
  | 'levels-count'
  | 'plays-recorded'
  | 'players'
  | 'doors-line'
  | 'joins-line'
  | 'world-path'
export type AddressName = 'version' | 'files' | 'level' | 'checks'
type BlockName = 'level-file' | 'engines' | 'claims' | 'world-map'

const plural = (count: number, one: string, many: string): string => `${count} ${count === 1 ? one : many}`

/** "a", "a and b", "a, b and c". */
function list(items: readonly string[]): string {
  if (items.length < 2) return items.join('')
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

/** How many play at once, as a sentence's start: "One player", "One or two players", "1 to 4 players". */
function playersWords(players: number): string {
  if (players <= 1) return 'One player'
  if (players === 2) return 'One or two players'
  return `1 to ${players} players`
}

/** How many doors lead from one level to another, as a sentence. */
function doorsLine(count: number): string {
  if (count === 0) return 'No door leads to another level.'
  return count === 1 ? '1 door leads to another level.' : `${count} doors lead to another level.`
}

/** How many edges join two levels into one place, as a sentence. */
function joinsLine(count: number): string {
  if (count === 0) return 'No two levels join edge to edge.'
  const edges = count === 1 ? '1 edge joins two levels' : `${count} edges join two levels each`
  return `${edges}, so you run from one into the other with no break.`
}

/** Every fact as the words the page shows. */
export function factWords(facts: GameFacts): Record<FactName, string> {
  return {
    name: facts.name,
    version: shortCommit(facts.commit),
    'level-size': `${facts.level.width} × ${facts.level.height} tiles`,
    'engines-count': plural(facts.engines.length, 'place', 'places'),
    'engines-list': list(facts.engines),
    steps: plural(facts.replay.steps, 'step', 'steps'),
    'files-count': plural(facts.files.length, 'small file', 'small files'),
    licence: facts.licence,
    'level-path': facts.level.path,
    'replay-path': facts.replay.path,
    'replay-ending': facts.replay.ending,
    'levels-count': plural(facts.levels, 'level', 'levels'),
    'plays-recorded':
      facts.plays.length === 1
        ? 'One play of the game is recorded.'
        : `${facts.plays.length} plays of the game are recorded.`,
    players: playersWords(facts.players),
    'doors-line': doorsLine(facts.world.doors.length),
    'joins-line': joinsLine(facts.world.joins.length),
    // The file the map is drawn from: the world file, or the one level a game with no world file has.
    'world-path': facts.world.path ?? facts.level.path,
  }
}

/** Every address on GitHub the page links to. A plain word for a commit (off CI) gives addresses that still open. */
export function addresses(facts: GameFacts): Record<AddressName, string> {
  const repo = `https://github.com/${GAME_REPO}`
  const real = isCommit(facts.commit)
  return {
    version: real ? `${repo}/commit/${facts.commit}` : repo,
    files: real ? `${repo}/tree/${facts.commit}` : repo,
    level: `${repo}/blob/${real ? facts.commit : 'main'}/${facts.level.path}`,
    checks: real ? `${repo}/commit/${facts.commit}/checks` : `${repo}/actions`,
  }
}

/** An opening tag with a data attribute on it. The pages are written by us, so no `>` sits inside an attribute. */
const OPENING_TAG = /<([a-z][a-z0-9]*)(\s[^>]*\bdata-(?:fact|address|block)="[^>]*)>/g

function attribute(attributes: string, name: string): string | undefined {
  return new RegExp(`\\bdata-${name}="([^"]*)"`).exec(attributes)?.[1]
}

/**
 * Every placeholder in `html` filled. The claims are checked first, so a page that would say "Works today" about
 * something the game does not back up is never written. An unknown name stops the build, naming it and the page.
 */
export function fillPage(html: string, facts: GameFacts, claims: readonly Claim[], page?: string): string {
  checkClaims(claims, facts)
  const who = page ?? 'A page'
  const words = factWords(facts)
  const where = addresses(facts)
  const blocks: Record<BlockName, string> = {
    'level-file': levelFile(facts),
    engines: engineRows(facts),
    claims: claimCards(claims),
    'world-map': worldMap(facts),
  }
  const known = <T extends string>(table: Record<T, string>, name: string): name is T => name in table

  let out = ''
  let at = 0
  for (const match of html.matchAll(OPENING_TAG)) {
    const [opening, tag = '', attributes = ''] = match
    const start = match.index ?? 0
    const end = start + opening.length
    const fact = attribute(attributes, 'fact')
    const address = attribute(attributes, 'address')
    const block = attribute(attributes, 'block')
    let tagText = opening
    let inside: string | undefined

    if (address !== undefined) {
      if (!known(where, address)) {
        throw new FillError(`${who} asks for the address "${address}", and there is no address of that name.`)
      }
      if (/\shref=/.test(attributes)) {
        throw new FillError(
          `${who} gives the address "${address}" an href of its own. Leave it out: the build writes it.`,
        )
      }
      tagText = `<${tag} href="${escapeHtml(where[address])}"${attributes}>`
    }
    if (fact !== undefined) {
      if (!known(words, fact))
        throw new FillError(`${who} asks for the fact "${fact}", and there is no fact of that name.`)
      inside = escapeHtml(words[fact])
    }
    if (block !== undefined) {
      if (!known(blocks, block)) {
        throw new FillError(`${who} asks for the block "${block}", and there is no block of that name.`)
      }
      inside = blocks[block]
    }
    if (inside !== undefined && !html.startsWith(`</${tag}>`, end)) {
      throw new FillError(
        `${who} has an element with ${fact === undefined ? `data-block="${block}"` : `data-fact="${fact}"`} that is not empty. Leave it empty: the build writes what goes in it.`,
      )
    }
    out += html.slice(at, start) + tagText + (inside ?? '')
    at = end
  }
  return out + html.slice(at)
}
