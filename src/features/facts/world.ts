// The game's world map, as the home page draws it: each level where the world file puts it (the first level alone, at
// 0, 0, when the game has no world file), the doors that lead from one level to another, and the levels that join edge
// to edge. Pure: it is given the levels and the world file already read, and says in a sentence what it cannot use.
import { FactsError } from './project.ts'

/** One level as the parse has read it: its id, its rows of tiles and its things. */
export interface LevelRead {
  readonly id: string
  readonly path: string
  readonly rows: readonly string[]
  readonly things: readonly unknown[]
}

/** What the page says and draws of the world. Sizes and places are in tiles. */
export interface WorldFacts {
  /** The world file, when the game has one. */
  readonly path?: string
  readonly levels: readonly {
    readonly id: string
    readonly x: number
    readonly y: number
    readonly width: number
    readonly height: number
  }[]
  /** One for each door that leads to another level, in the order of the levels and their things. */
  readonly doors: readonly { readonly from: string; readonly to: string }[]
  /**
   * Two levels whose sides touch on the map, with `open` tiles of that side open in both, so a hero runs across. `line`
   * runs along the shared side from the first open tile to the end of the last, for the map's join bar.
   */
  readonly joins: readonly {
    readonly a: string
    readonly b: string
    readonly open: number
    readonly line: { readonly x1: number; readonly y1: number; readonly x2: number; readonly y2: number }
  }[]
}

type Placed = WorldFacts['levels'][number] & { readonly rows: readonly string[] }

/** A tile a hero can pass: anything but a wall. A row shorter than the level is open past its end. */
const isOpen = (rows: readonly string[], x: number, y: number): boolean => (rows[y]?.[x] ?? '.') !== '#'

type Join = WorldFacts['joins'][number]

/** Where `a` and `b` touch with tiles open on both sides, or `undefined` when they do not touch or a wall is between. */
function joinOf(a: Placed, b: Placed): Join | undefined {
  // Each open tile of the shared side, as its place along that side (a row number, or a column number).
  const open: number[] = []
  let line: (first: number, last: number) => Join['line']
  if (a.x + a.width === b.x || b.x + b.width === a.x) {
    // Side by side: the left one's last column against the right one's first, on the rows they share.
    const [left, right] = a.x < b.x ? [a, b] : [b, a]
    for (let y = Math.max(a.y, b.y); y < Math.min(a.y + a.height, b.y + b.height); y++)
      if (isOpen(left.rows, left.width - 1, y - left.y) && isOpen(right.rows, 0, y - right.y)) open.push(y)
    const x = right.x
    line = (first, last) => ({ x1: x, y1: first, x2: x, y2: last + 1 })
  } else if (a.y + a.height === b.y || b.y + b.height === a.y) {
    // One above the other: the upper one's last row against the lower one's first, on the columns they share.
    const [upper, lower] = a.y < b.y ? [a, b] : [b, a]
    for (let x = Math.max(a.x, b.x); x < Math.min(a.x + a.width, b.x + b.width); x++)
      if (isOpen(upper.rows, x - upper.x, upper.height - 1) && isOpen(lower.rows, x - lower.x, 0))
        open.push(x)
    const y = lower.y
    line = (first, last) => ({ x1: first, y1: y, x2: last + 1, y2: y })
  } else return undefined
  const first = open[0]
  const last = open[open.length - 1]
  if (first === undefined || last === undefined) return undefined
  return { a: a.id, b: b.id, open: open.length, line: line(first, last) }
}

/** The level a thing's door leads to, when it is a door that leads to another level. */
function leadsTo(thing: unknown): string | undefined {
  if (typeof thing !== 'object' || thing === null) return undefined
  const to = (thing as { values?: { to?: { level?: unknown } } }).values?.to?.level
  return typeof to === 'string' ? to : undefined
}

/** The world facts of a game, from its levels (in the project file's order) and its world file, if it has one. */
export function readWorld(input: {
  readonly levels: readonly LevelRead[]
  readonly start: string
  readonly world?: { readonly path: string; readonly json: Record<string, unknown> }
}): WorldFacts {
  const { levels, world } = input
  const byId = new Map(levels.map((level) => [level.id, level]))
  const sized = (level: LevelRead, x: number, y: number): Placed => ({
    id: level.id,
    x,
    y,
    width: level.rows[0]?.length ?? 0,
    height: level.rows.length,
    rows: level.rows,
  })

  let placed: Placed[]
  if (world === undefined) {
    const first = byId.get(input.start)
    placed = first === undefined ? [] : [sized(first, 0, 0)]
  } else {
    const entries = world.json.levels
    if (!Array.isArray(entries)) throw new FactsError(`${world.path} has no "levels": where each level sits.`)
    placed = entries.map((entry: unknown) => {
      const { level, at } = (entry ?? {}) as { level?: unknown; at?: { x?: unknown; y?: unknown } }
      if (typeof level !== 'string' || typeof at?.x !== 'number' || typeof at.y !== 'number')
        throw new FactsError(`A level in ${world.path} has no "level" and "at" with an x and a y.`)
      const found = byId.get(level)
      if (found === undefined)
        throw new FactsError(`${world.path} places "${level}", and the game has no level with that id.`)
      return sized(found, at.x, at.y)
    })
  }

  const doors = levels.flatMap((level) =>
    level.things.flatMap((thing) => {
      const to = leadsTo(thing)
      return to === undefined || to === level.id ? [] : [{ from: level.id, to }]
    }),
  )
  const joins: Join[] = []
  for (let i = 0; i < placed.length; i++)
    for (let j = i + 1; j < placed.length; j++) {
      const a = placed[i]
      const b = placed[j]
      if (a === undefined || b === undefined) continue
      const join = joinOf(a, b)
      if (join !== undefined) joins.push(join)
    }

  return {
    ...(world === undefined ? {} : { path: world.path }),
    levels: placed.map(({ rows: _rows, ...level }) => level),
    doors,
    joins,
  }
}
