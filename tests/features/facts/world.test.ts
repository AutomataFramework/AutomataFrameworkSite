import { expect, test } from 'vitest'
import { FactsError, type GameFacts, parseFacts } from '#src/features/facts/facts.ts'

// A game shaped like the test game: three levels, a door from the first to the second and back, and the second and
// third placed side by side with their touching edges open on three rows.
const PROJECT = `name = "Three Rooms"
start = "one"
players = 2   # two can play
source = "en"
[[content]]
type = "level"
path = "content/levels/one.json"
[[content]]
type = "level"
path = "content/levels/two.json"
[[content]]
type = "level"
path = "content/levels/three.json"
[[content]]
type = "world"
path = "content/world.json"
[[content]]
type = "messages"
path = "content/messages/fr.json"
[[content]]
type = "messages"
path = "content/messages/en.json"
`
const closed = ['#....#', '#....#', '######']
const FILES: Record<string, string> = {
  'automata.toml': PROJECT,
  'content/levels/one.json': JSON.stringify({
    id: 'one',
    tiles: closed,
    things: [{ id: 'exit', character: 'door', x: 4, y: 1, values: { to: { level: 'two', thing: 'in' } } }],
  }),
  'content/levels/two.json': JSON.stringify({
    id: 'two',
    tiles: ['#....#', '#.....', '######'],
    things: [{ id: 'in', character: 'door', x: 1, y: 1, values: { to: { level: 'one', thing: 'exit' } } }],
  }),
  'content/levels/three.json': JSON.stringify({ id: 'three', tiles: ['#....#', '.....#', '######'] }),
  'content/world.json': JSON.stringify({
    id: 'world',
    levels: [
      { level: 'one', at: { x: 0, y: 0 } },
      { level: 'two', at: { x: 8, y: 0 } },
      { level: 'three', at: { x: 14, y: 0 } },
    ],
  }),
  // The words of the game's own language name its levels; another language's file is not read for them.
  'content/messages/fr.json': JSON.stringify({ id: 'fr', messages: { 'level.one.name': 'Niveau 1' } }),
  'content/messages/en.json': JSON.stringify({
    id: 'en',
    messages: { 'level.one.name': 'Level 1', 'level.two.name': 'Level 2', 'level.three.name': 'Level 3' },
  }),
  'replays/one.json': '{"ticks":12,"finalHash":"0123456789abcdef"}',
  'replays/two.json': '{"ticks":30,"finalHash":"fedcba9876543210"}',
  LICENSE: 'MIT License\n',
}
const facts = (files: Record<string, string | undefined> = {}): GameFacts => {
  const all = { ...FILES, ...files }
  return parseFacts({ commit: 'fixture', read: (path) => all[path] })
}

test('the world map: every level where the world file puts it, the doors between them and the edges that join', () => {
  expect(facts().world).toEqual({
    path: 'content/world.json',
    levels: [
      { id: 'one', name: 'Level 1', x: 0, y: 0, width: 6, height: 3 },
      { id: 'two', name: 'Level 2', x: 8, y: 0, width: 6, height: 3 },
      { id: 'three', name: 'Level 3', x: 14, y: 0, width: 6, height: 3 },
    ],
    doors: [
      { from: 'one', to: 'two' },
      { from: 'two', to: 'one' },
    ],
    joins: [{ a: 'two', b: 'three', open: 1, line: { x1: 14, y1: 1, x2: 14, y2: 2 } }],
  })
})

test('how many play together, and which levels have a recorded play', () => {
  const found = facts()
  expect(found.players).toBe(2)
  expect(found.plays).toEqual(['replays/one.json', 'replays/two.json'])
  expect(found.levels).toBe(3)
})

test('a game with no players line is for one, and a game with no world file is its first level alone', () => {
  const project = PROJECT.replace('players = 2   # two can play\n', '').replace(
    '[[content]]\ntype = "world"\npath = "content/world.json"\n',
    '',
  )
  const found = facts({ 'automata.toml': project, 'content/world.json': undefined })
  expect(found.players).toBe(1)
  expect(found.world).toEqual({
    levels: [{ id: 'one', name: 'Level 1', x: 0, y: 0, width: 6, height: 3 }],
    doors: [
      { from: 'one', to: 'two' },
      { from: 'two', to: 'one' },
    ],
    joins: [],
  })
})

test('a level the game gives no name, or a game with no words, is called by its id', () => {
  const words = JSON.stringify({ id: 'en', messages: { 'level.one.name': 'Level 1' } })
  expect(facts({ 'content/messages/en.json': words }).world.levels.map((l) => l.name)).toEqual([
    'Level 1',
    'two',
    'three',
  ])
  const project = PROJECT.replace('source = "en"\n', '').replace(
    /\[\[content\]\]\ntype = "messages"\npath = "content\/messages\/(fr|en)\.json"\n/g,
    '',
  )
  expect(facts({ 'automata.toml': project }).world.levels.map((l) => l.name)).toEqual(['one', 'two', 'three'])
})

test('two levels that touch with a wall between them do not join', () => {
  const wall = JSON.stringify({ id: 'three', tiles: closed })
  expect(facts({ 'content/levels/three.json': wall }).world.joins).toEqual([])
})

test('levels placed one above the other join where their floor and ceiling are open', () => {
  const world = JSON.stringify({
    id: 'world',
    levels: [
      { level: 'one', at: { x: 0, y: 0 } },
      { level: 'two', at: { x: 0, y: 3 } },
    ],
  })
  const floorOpen = JSON.stringify({ id: 'one', tiles: ['#....#', '#....#', '##..##'] })
  const ceilingOpen = JSON.stringify({ id: 'two', tiles: ['##.###', '#.....', '######'] })
  const found = facts({
    'content/world.json': world,
    'content/levels/one.json': floorOpen,
    'content/levels/two.json': ceilingOpen,
  })
  expect(found.world.joins).toEqual([{ a: 'one', b: 'two', open: 1, line: { x1: 2, y1: 3, x2: 3, y2: 3 } }])
})

test.each([
  ['the world file is not JSON', { 'content/world.json': '{ nope' }, /content\/world\.json/],
  [
    'the world places a level the game does not have',
    { 'content/world.json': JSON.stringify({ levels: [{ level: 'attic', at: { x: 0, y: 0 } }] }) },
    /attic/,
  ],
  [
    'a level in the world has no place',
    { 'content/world.json': JSON.stringify({ levels: [{ level: 'one' }] }) },
    /content\/world\.json/,
  ],
  [
    'players is not a whole number',
    { 'automata.toml': PROJECT.replace('players = 2', 'players = "two"') },
    /players/,
  ],
])('%s: the build stops with a sentence that names it', (_what, files, sentence) => {
  expect(() => facts(files)).toThrow(FactsError)
  expect(() => facts(files)).toThrow(sentence)
})

test('a world with nothing that can stop the build', () => {
  // Every value comes from the game's own files: none of these is a FactsError.
  expect(() => facts()).not.toThrow()
})
