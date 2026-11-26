import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import {
  type Artifact,
  check,
  fill,
  fromTests,
  listedFiles,
  pickRun,
  type Report,
  readFolder,
  record,
} from '../../scripts/browser-fill.ts'
import { PIECES } from '../../scripts/browser-pieces.ts'

const names = Array.from({ length: 15 }, (_, index) => `j${String(index).padStart(2, '0')}.journey.ts`)
const files = names.map((name) => `tests/journeys/${name}`)

/** A Playwright JSON report (or `--list`) of `played` files, each test taking `ms`, checked out under `/w`. */
const report = (played: readonly string[], ms = 1000, engine = 'chromium'): Report => ({
  config: { rootDir: '/w/tests/journeys' },
  suites: played.map((file) => ({
    file: file.replace('tests/journeys/', ''),
    specs: [{ tests: [{ projectName: engine, results: [{ duration: ms }] }] }],
    suites: [{ specs: [{ tests: [{ projectName: engine, results: [{ duration: ms }] }] }] }],
  })),
})

describe('fill: the pieces take every file once, largest first', () => {
  test('a time that is not a number of seconds counts as no time', () => {
    const bad = {
      [files[0] ?? '']: Number.NaN,
      [files[1] ?? '']: -5,
      [files[2] ?? '']: Number.POSITIVE_INFINITY,
      [files[3] ?? '']: 'x',
    }
    expect(fill(files, bad as unknown as Record<string, number>)).toEqual(fill(files, {}))
  })

  test('every file is in exactly one of the six pieces, and no piece is empty, with times or without', () => {
    for (const times of [{}, Object.fromEntries(files.map((file, index) => [file, index + 1]))]) {
      const pieces = fill(files, times)
      expect(pieces).toHaveLength(PIECES)
      expect(pieces.flat().toSorted()).toEqual(files)
      for (const piece of pieces) expect(piece.length).toBeGreaterThan(0)
    }
  })

  test('one very slow file gets a piece to itself, and the fill is the same every time', () => {
    const times = { ...Object.fromEntries(files.map((file) => [file, 10])), [files[9] ?? '']: 200 }
    expect(fill(files, times).find((piece) => piece.includes(files[9] ?? ''))).toEqual([files[9]])
    expect(fill(files, times)).toEqual(fill([...files].reverse(), times))
  })

  test('balances by recorded time: the slowest piece is within the largest file of the fastest', () => {
    const times = Object.fromEntries(files.map((file, index) => [file, ((index * 37) % 50) + 5]))
    const loads = fill(files, times).map((piece) => piece.reduce((sum, file) => sum + (times[file] ?? 0), 0))
    expect(Math.max(...loads) - Math.min(...loads)).toBeLessThanOrEqual(Math.max(...Object.values(times)))
  })
})

test('a file is kept from `tests/` on, wherever the run checked out', () => {
  expect(fromTests('/__w/x/x/tests/journeys/a.journey.ts')).toBe('tests/journeys/a.journey.ts')
  expect(listedFiles(report([files[1] ?? '', files[0] ?? '', files[0] ?? '']))).toEqual([files[0], files[1]])
})

test('record sums the time of every test in a file, nested ones too, over engines, in seconds', () => {
  const chromium = report([files[0] ?? '', files[1] ?? ''], 1500)
  const webkit = report([files[0] ?? ''], 250, 'webkit')
  expect(record([chromium, webkit])).toEqual({ [files[0] ?? '']: 3.5, [files[1] ?? '']: 3 })
})

/** Lists and reports as the pieces leave them: piece n played `played[n - 1]` for each engine. */
function folder(engines: readonly string[], played: readonly (readonly string[])[]) {
  const lists = new Map<string, Report>()
  const reports = new Map<string, Report>()
  for (const engine of engines) {
    played.forEach((mine, index) => {
      lists.set(`${index + 1} ${engine}`, report(files, 0, engine))
      reports.set(`${index + 1} ${engine}`, report(mine, 1000, engine))
    })
  }
  return { lists, reports }
}

describe('check: every listed file played in exactly one piece, for every engine', () => {
  const ALL = ['chromium', 'webkit', 'firefox']

  test('passes on the fill, with one line per engine', () => {
    const { lists, reports } = folder(ALL, fill(files, {}))
    const verdict = check(lists, reports, ALL)
    expect(verdict.failures).toEqual([])
    expect(verdict.lines).toContain('ok  webkit: 15 of 15 files played in exactly one piece')
  })

  test('fails on a file no piece played, and on one two pieces played', () => {
    const pieces = fill(files, {})
    const first = pieces[0]?.[0] ?? ''
    const missing = pieces.map((piece, index) => (index === 0 ? piece.slice(1) : piece))
    const a = folder(['chromium'], missing)
    expect(check(a.lists, a.reports, ['chromium']).failures).toEqual([
      `chromium: ${first} played in no piece`,
    ])
    const twice = pieces.map((piece, index) => (index === 1 ? [...piece, first] : piece))
    const b = folder(['chromium'], twice)
    expect(check(b.lists, b.reports, ['chromium']).failures).toEqual([
      `chromium: ${first} played in pieces 1, 2, not in one`,
    ])
  })

  test('a file in the report with no result (it never started) did not play', () => {
    const pieces = fill(files, {})
    const { lists, reports } = folder(['chromium'], pieces)
    const first = pieces[0]?.[0] ?? ''
    const started = report(pieces[0] ?? [])
    for (const suite of started.suites ?? []) {
      if (`tests/journeys/${suite.file}` === first) suite.specs = [{ tests: [{ results: [] }] }]
      if (`tests/journeys/${suite.file}` === first) suite.suites = []
    }
    reports.set('1 chromium', started)
    expect(check(lists, reports, ['chromium']).failures).toEqual([`chromium: ${first} played in no piece`])
  })

  test('fails when a piece left nothing for an engine, or listed other files', () => {
    const { lists, reports } = folder(ALL, fill(files, {}))
    reports.delete('4 firefox')
    lists.set('2 webkit', report(['tests/journeys/other.journey.ts']))
    const verdict = check(lists, reports, ALL)
    expect(verdict.ok).toBe(false)
    expect(verdict.failures).toContain('firefox left no file list or no report in piece 4/6')
    expect(verdict.failures).toContain('webkit listed other files in piece 2/6')
  })

  test('no engine asked for is never a pass', () => {
    expect(check(new Map(), new Map(), []).ok).toBe(false)
  })

  test('reads the files the pieces left, by piece and engine', () => {
    const dir = mkdtempSync(join(tmpdir(), 'browser-fill-'))
    writeFileSync(join(dir, 'list-3-webkit.json'), JSON.stringify(report([files[0] ?? ''])))
    writeFileSync(join(dir, 'report-3-webkit.json'), JSON.stringify(report([])))
    writeFileSync(join(dir, 'other.json'), '{}')
    const { lists, reports } = readFolder(dir)
    expect([...lists.keys()]).toEqual(['3 webkit'])
    expect([...reports.keys()]).toEqual(['3 webkit'])
  })
})

describe("pickRun: times only from this repository's own runs, `main` first", () => {
  const artifact = (id: number, branch: string, expired = false, fork = false): Artifact => ({
    expired,
    workflow_run: { id, head_branch: branch, head_repository_id: fork ? 2 : 1, repository_id: 1 },
  })

  test("the newest from main, then this branch's, and none when there is neither", () => {
    const listed = [artifact(9, 'feature'), artifact(8, 'main'), artifact(7, 'main')]
    expect(pickRun(listed, 'feature')).toBe(8)
    expect(pickRun([artifact(9, 'feature'), artifact(5, 'other')], 'feature')).toBe(9)
    expect(pickRun([artifact(5, 'other')], 'feature')).toBeUndefined()
    expect(pickRun([artifact(5, 'other')], '')).toBeUndefined()
  })

  test("never an expired one, and never a fork's branch called `main`", () => {
    expect(
      pickRun([artifact(9, 'main', true), artifact(8, 'main', false, true), artifact(7, 'main')], 'x'),
    ).toBe(7)
  })
})
