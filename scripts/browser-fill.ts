// How a full run cuts the journeys into the six pieces, from the times `main` recorded, and the check in `ci`'s `gate`
// that the pieces played every journey file once.
//
// Every full run of `ci` records how long each journey file took (Playwright's JSON report: the time of its tests,
// summed over the engines, since a piece plays every engine's share of its files) and `gate` uploads that as the
// `test-times` artifact. Each piece asks GitHub for the newest from `main` (from this branch while `main` has none), and
// fills the pieces largest file first, each file to the piece with the least time so far; a file with no time yet counts
// as the median. Every piece computes the same fill from the same list and times, and plays its own share.
//
// Each piece also leaves the engine's file list (`playwright test --list`) and its JSON report, and `check` passes only
// when every listed file played in exactly one piece for every engine the run asked for.
//
// This file has no dependencies on purpose: the workflow runs it with Node alone.
import { appendFileSync, existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PIECES } from './browser-pieces.ts'

/** Seconds per journey file, keyed by the path from `tests/` on. */
export type Times = Readonly<Record<string, number>>

/** A test file's path from `tests/` on, whatever folder the run checked the repository out to. */
export function fromTests(path: string): string {
  const at = path.indexOf('/tests/')
  return path.startsWith('tests/') || at < 0 ? path : path.slice(at + 1)
}

/** The fill: `pieces` lists of files, largest recorded time first, each to the piece with the least time so far. */
export function fill(files: readonly string[], times: Times, pieces: number = PIECES): string[][] {
  // Only a time that is a number of seconds counts: anything else is as if the file had no time yet.
  const usable = (time: unknown): time is number =>
    typeof time === 'number' && Number.isFinite(time) && time >= 0
  const timeOf = (key: string): number | undefined => (usable(times[key]) ? times[key] : undefined)
  const known = files.map(timeOf).filter((time): time is number => time !== undefined)
  const sorted = known.toSorted((a, b) => a - b)
  const median = sorted.length === 0 ? 1 : (sorted[Math.floor((sorted.length - 1) / 2)] ?? 1)
  const weighed = [...new Set(files)]
    .map((file) => ({ file, time: timeOf(file) ?? median }))
    .sort((a, b) => b.time - a.time || (a.file < b.file ? -1 : 1))
  const out = Array.from({ length: pieces }, () => [] as string[])
  const load = Array.from({ length: pieces }, () => 0)
  for (const { file, time } of weighed) {
    const least = load.indexOf(Math.min(...load))
    out[least]?.push(file)
    load[least] = (load[least] ?? 0) + time
  }
  return out.map((piece) => piece.toSorted())
}

type Result = { duration?: number }
type Spec = { tests?: { projectName?: string; results?: Result[] }[] }
type Suite = { file?: string; specs?: Spec[]; suites?: Suite[] }
/** What Playwright's JSON reporter writes, for a run and for `--list` alike: the files are relative to `rootDir`. */
export type Report = { config?: { rootDir?: string }; suites?: Suite[] }

/** Every test result in a file's suite, nested suites included. */
const resultsOf = (suite: Suite): Result[] => [
  ...(suite.specs ?? []).flatMap((spec) => (spec.tests ?? []).flatMap((test) => test.results ?? [])),
  ...(suite.suites ?? []).flatMap(resultsOf),
]

/** A report's files, from `tests/` on, each with its suite. */
function filesOf(report: Report): { file: string; suite: Suite }[] {
  const root = report.config?.rootDir ?? ''
  return (report.suites ?? []).flatMap((suite) =>
    suite.file === undefined ? [] : [{ file: fromTests(`${root}/${suite.file}`), suite }],
  )
}

/** The files a `playwright test --list --reporter=json` listed, from `tests/` on. */
export function listedFiles(list: Report): string[] {
  return [...new Set(filesOf(list).map(({ file }) => file))].toSorted()
}

/**
 * Seconds per file from the pieces' reports, summed over engines and pieces: the time of every test the file played. A
 * piece plays with two workers, so this is the work a file brings to a piece, not the time on the clock.
 */
export function record(reports: readonly Report[]): Record<string, number> {
  const times: Record<string, number> = {}
  for (const report of reports) {
    for (const { file, suite } of filesOf(report)) {
      const ms = resultsOf(suite).reduce((sum, result) => sum + (result.duration ?? 0), 0)
      times[file] = Math.round(((times[file] ?? 0) + ms / 1000) * 10) / 10
    }
  }
  return times
}

/** What the check says, and the lines that make it readable in the log. */
export type Verdict = {
  readonly ok: boolean
  readonly lines: readonly string[]
  readonly failures: readonly string[]
}

/**
 * Every listed file played in exactly one piece, for every engine. `lists` and `reports` are keyed `<piece> <engine>`;
 * a piece that left none for an engine is absent. A file played is one the engine's report has a result for.
 */
export function check(
  lists: ReadonlyMap<string, Report>,
  reports: ReadonlyMap<string, Report>,
  engines: readonly string[],
): Verdict {
  const lines: string[] = []
  const failures: string[] = []
  const fail = (what: string): void => {
    failures.push(what)
    lines.push(`NO  ${what}`)
  }
  for (const engine of engines) {
    let wanted: string[] | undefined
    const playedIn = new Map<string, number[]>()
    for (let piece = 1; piece <= PIECES; piece += 1) {
      const list = lists.get(`${piece} ${engine}`)
      const report = reports.get(`${piece} ${engine}`)
      if (!list || !report) {
        fail(`${engine} left no file list or no report in piece ${piece}/${PIECES}`)
        continue
      }
      const files = listedFiles(list)
      if (wanted === undefined) wanted = files
      else if (JSON.stringify(files) !== JSON.stringify(wanted))
        fail(`${engine} listed other files in piece ${piece}/${PIECES}`)
      const played = filesOf(report).filter(({ suite }) => resultsOf(suite).length > 0)
      for (const file of new Set(played.map(({ file }) => file))) {
        playedIn.set(file, [...(playedIn.get(file) ?? []), piece])
      }
    }
    if (!wanted || wanted.length === 0) {
      fail(`${engine} listed no journey files`)
      continue
    }
    let once = 0
    for (const file of wanted) {
      const where = playedIn.get(file) ?? []
      if (where.length === 1) once += 1
      else if (where.length === 0) fail(`${engine}: ${file} played in no piece`)
      else fail(`${engine}: ${file} played in pieces ${where.join(', ')}, not in one`)
    }
    for (const file of playedIn.keys())
      if (!wanted.includes(file)) fail(`${engine}: ${file} played but is not in the list`)
    lines.push(
      `${once === wanted.length ? 'ok ' : 'NO '} ${engine}: ${once} of ${wanted.length} files played in exactly one piece`,
    )
  }
  return { ok: failures.length === 0 && engines.length > 0, lines, failures }
}

/** Reads `list-<piece>-<engine>.json` and `report-<piece>-<engine>.json` from the folder the pieces' files went to. */
export function readFolder(folder: string): { lists: Map<string, Report>; reports: Map<string, Report> } {
  const lists = new Map<string, Report>()
  const reports = new Map<string, Report>()
  for (const name of existsSync(folder) ? readdirSync(folder) : []) {
    const match = /^(list|report)-(\d+)-([a-z]+)\.json$/.exec(name)
    if (!match) continue
    const data = JSON.parse(readFileSync(join(folder, name), 'utf8')) as Report
    if (match[1] === 'list') lists.set(`${match[2]} ${match[3]}`, data)
    else reports.set(`${match[2]} ${match[3]}`, data)
  }
  return { lists, reports }
}

/** One `test-times` artifact as GitHub lists it. */
export type Artifact = {
  expired?: boolean
  workflow_run?: { id?: number; head_branch?: string; head_repository_id?: number; repository_id?: number }
}

/**
 * The run whose `test-times` to fill from: the newest unexpired one made on `main`, or else on `branch`, and only from
 * a run of this repository's own branches, never a fork's branch that has the same name. GitHub lists newest first.
 */
export function pickRun(artifacts: readonly Artifact[], branch: string): number | undefined {
  const own = artifacts.filter(
    (artifact) =>
      artifact.expired === false &&
      artifact.workflow_run?.id !== undefined &&
      artifact.workflow_run.head_repository_id === artifact.workflow_run.repository_id,
  )
  for (const wanted of ['main', branch]) {
    const found = own.find((artifact) => wanted !== '' && artifact.workflow_run?.head_branch === wanted)
    if (found) return found.workflow_run?.id
  }
  return undefined
}

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2)
  if (command === 'pick') {
    // pick: writes `run=<id>` (empty when there is none) to the step's outputs.
    const api = process.env.GITHUB_API_URL ?? 'https://api.github.com'
    const response = await fetch(
      `${api}/repos/${process.env.GITHUB_REPOSITORY}/actions/artifacts?name=test-times&per_page=100`,
      { headers: { authorization: `Bearer ${process.env.GH_TOKEN}`, accept: 'application/vnd.github+json' } },
    )
    if (!response.ok) throw new Error(`GitHub answered ${response.status} when asked for the test times.`)
    const { artifacts } = (await response.json()) as { artifacts: Artifact[] }
    const run = pickRun(artifacts, process.env.BRANCH ?? '')
    console.log(
      run === undefined ? 'No recorded times yet: every file counts the same.' : `Times from run ${run}.`,
    )
    appendFileSync(process.env.GITHUB_OUTPUT ?? '/dev/null', `run=${run ?? ''}\n`)
    return
  }
  if (command === 'files') {
    // files <piece> <list.json> [times.json]: this piece's files, one per line.
    const [piece, list, times] = rest
    const all = listedFiles(JSON.parse(readFileSync(list ?? '', 'utf8')) as Report)
    const recorded = times && existsSync(times) ? (JSON.parse(readFileSync(times, 'utf8')) as Times) : {}
    const mine = fill(all, recorded)[Number(piece) - 1]
    if (!mine || mine.length === 0) throw new Error(`Piece ${piece} has no files, out of ${all.length}.`)
    console.log(mine.join('\n'))
    return
  }
  if (command === 'record') {
    // record <folder> <out.json>: the times every report in the folder took, for the next runs to fill from.
    const [folder, out] = rest
    const { reports } = readFolder(folder ?? '')
    const times = record([...reports.values()])
    writeFileSync(out ?? '', `${JSON.stringify(times, null, 2)}\n`)
    console.log(`Recorded the times of ${Object.keys(times).length} files from ${reports.size} reports.`)
    return
  }
  if (command === 'check') {
    const engines = JSON.parse(process.env.ENGINES ?? '[]') as unknown
    if (!Array.isArray(engines) || !engines.every((engine) => typeof engine === 'string')) {
      throw new Error('Give ENGINES as a JSON list of engine names.')
    }
    const { lists, reports } = readFolder(rest[0] ?? '')
    const verdict = check(lists, reports, engines)
    for (const line of verdict.lines) console.log(line)
    if (!verdict.ok) {
      const list = verdict.failures.map((failure) => `- ${failure}`).join('\n')
      console.error(`Every journey file must play in exactly one piece, and these did not:\n${list}`)
      process.exitCode = 1
    }
    return
  }
  throw new Error(
    'Run it as `browser-fill.ts pick`, `files <piece> <list.json> [times.json]`, `record <folder> <out>` or `check <folder>`.',
  )
}

// Run only when started from the command line, not when a test imports the parts above.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
