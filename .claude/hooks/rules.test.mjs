// Tries every route a session can open, ready, reopen or merge a pull request through, and checks the rule
// hooks judge each one. Run: node --test .claude/hooks/rules.test.mjs. It builds a throwaway repo with this
// folder's rules.mjs and rules.json, and a stand-in `gh` that answers from a table and logs every call.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const here = fileURLToPath(new URL('.', import.meta.url))
const sh = (cmd, cwd) => {
  const r = spawnSync('sh', ['-c', cmd], { cwd, encoding: 'utf8' })
  assert.equal(r.status, 0, r.stderr)
  return r.stdout.trim()
}

// A parent folder holding two repos (as a cloud session sees them), each with the hooks.
const top = mkdtempSync(join(tmpdir(), 'rules-test-'))
const makeRepo = (dir, slug) => {
  mkdirSync(join(dir, '.claude', 'hooks'), { recursive: true })
  cpSync(join(here, 'rules.mjs'), join(dir, '.claude', 'hooks', 'rules.mjs'))
  const config = JSON.parse(readFileSync(join(here, 'rules.json'), 'utf8'))
  config.repo = slug
  writeFileSync(join(dir, '.claude', 'hooks', 'rules.json'), JSON.stringify(config))
  writeFileSync(
    join(dir, 'CLAUDE.md'),
    '- **Identity.** Every commit is authored by T <t@example.com> (author and committer). Pull requests end with "Requested by **T**".\n',
  )
  sh(
    [
      'git init -q -b main',
      'git config user.name T',
      'git config user.email t@example.com',
      'git add -A',
      'git commit -qm start',
      `git remote add origin https://github.com/${slug}.git`,
      'git update-ref refs/remotes/origin/main HEAD',
      'git checkout -qb feature',
      'mkdir -p src',
      'echo x > src/a.ts',
      'git add -A',
      'git commit -qm code',
    ].join(' && '),
    dir,
  )
}
const repo = join(top, 'one')
const other = join(top, 'two')
mkdirSync(repo)
mkdirSync(other)
makeRepo(repo, 'mcthaydt/One')
makeRepo(other, 'mcthaydt/Two')

// The stand-in gh: GH_TABLE maps a path to JSON (or to "fail"); every call is logged to GH_LOG.
const bin = join(top, 'bin')
mkdirSync(bin)
writeFileSync(
  join(bin, 'gh'),
  `#!/usr/bin/env node
const fs = require('fs')
const args = process.argv.slice(2)
fs.appendFileSync(process.env.GH_LOG, JSON.stringify(args) + '\\n')
const table = JSON.parse(fs.readFileSync(process.env.GH_TABLE, 'utf8'))
const path = args.find((a, i) => i > 0 && !a.startsWith('-') && args[i - 1] !== '--jq' && args[i - 1] !== '-f' && args[i - 1] !== '-X') ?? ''
const key = Object.keys(table).find((k) => path === k || path.split('?')[0] === k)
if (!key || table[key] === 'fail') { process.stderr.write('HTTP 404: Not Found'); process.exit(1) }
let out = table[key]
const jq = args[args.indexOf('--jq') + 1]
if (args.includes('--jq') && jq === '.[].filename') out = out.map((f) => f.filename).join('\\n')
else if (args.includes('--jq')) out = out.map((o) => JSON.stringify({ number: o.number })).join('\\n')
else out = JSON.stringify(out)
process.stdout.write(out + '\\n')
`,
)
chmodSync(join(bin, 'gh'), 0o755)

const body = (extra = '') =>
  `## Lane\n\nLane 1.\n\n## Acceptance criteria\n\n- it works\n${extra}\nRequested by **T**`
// The open limit this repo's rules.json sets; the tests follow it.
const LIMIT = JSON.parse(readFileSync(join(here, 'rules.json'), 'utf8')).prFlow.maxOpenPrs
const atMost = new RegExp(`${LIMIT} at most`)
const open = (n) => Array.from({ length: n }, (_, i) => ({ number: 100 + i }))
const baseTable = (openCount) => ({
  'repos/mcthaydt/One/pulls': open(openCount),
  'repos/mcthaydt/Two/pulls': open(openCount),
  'repos/mcthaydt/One': { private: false },
  'repos/mcthaydt/One/pulls/7': { number: 7, state: 'closed', head: { ref: 'feature', sha: 'abc1234' } },
})

function hook(
  event,
  input,
  { cwd = repo, project = repo, table = baseTable(0), env = {}, own = false } = {},
) {
  const tablePath = join(top, `table-${Math.random()}.json`)
  writeFileSync(tablePath, JSON.stringify(table))
  const log = join(top, `log-${Math.random()}.txt`)
  writeFileSync(log, '')
  const script =
    project === repo
      ? join(repo, '.claude', 'hooks', 'rules.mjs')
      : join(repo, '.claude', 'hooks', 'rules.mjs')
  // own: the project's own copy runs, as its settings would run it.
  const args = own
    ? [join(project, '.claude', 'hooks', 'rules.mjs')]
    : project === repo
      ? [script]
      : [script, '--find-repo']
  const r = spawnSync('node', args, {
    input: JSON.stringify({ hook_event_name: event, session_id: 't', cwd, ...input }),
    encoding: 'utf8',
    env: {
      ...process.env,
      ...env,
      PATH: `${bin}:${process.env.PATH}`,
      GH_TABLE: tablePath,
      GH_LOG: log,
      CLAUDE_PROJECT_DIR: project,
    },
  })
  const out = r.stdout.trim() ? JSON.parse(r.stdout.trim().split('\n').at(-1)) : null
  const calls = readFileSync(log, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l))
  return {
    out,
    calls,
    denied: out?.hookSpecificOutput?.permissionDecision === 'deny',
    reason: out?.hookSpecificOutput?.permissionDecisionReason ?? '',
  }
}
const bash = (command, opts) => hook('PreToolUse', { tool_name: 'Bash', tool_input: { command } }, opts)
const mcp = (name, input, opts) => hook('PreToolUse', { tool_name: name, tool_input: input }, opts)
const writeJson = (name, value) => {
  const path = join(repo, name)
  writeFileSync(path, JSON.stringify(value))
  return name
}

test('gh api POST .../pulls is judged like gh pr create: lane, draft and the open limit', () => {
  const noLane = writeJson('b1.json', {
    title: 't',
    head: 'feature',
    base: 'main',
    draft: true,
    body: 'Hi\n\nRequested by **T**',
  })
  assert.match(
    bash(`gh api -X POST repos/mcthaydt/One/pulls --input ${noLane}`).reason,
    /names no lane|Requested by/,
  )
  const good = writeJson('b2.json', { title: 't', head: 'feature', base: 'main', draft: true, body: body() })
  assert.equal(bash(`gh api -X POST repos/mcthaydt/One/pulls --input ${good}`).denied, false)
  assert.match(
    bash(`gh api -X POST repos/mcthaydt/One/pulls --input ${good}`, { table: baseTable(LIMIT) }).reason,
    atMost,
  )
  const ready = writeJson('b3.json', { title: 't', head: 'feature', base: 'main', body: body() })
  assert.match(bash(`gh api -X POST repos/mcthaydt/One/pulls --input ${ready}`).reason, /opened ready/)
  assert.match(
    bash(`gh api repos/mcthaydt/One/pulls -f title=t -f head=feature -f base=main -F draft=true -f body=Hi`)
      .reason,
    /names no lane|Requested by/,
  )
})

test('the open limit fails closed when the open list cannot be read', () => {
  const good = writeJson('b4.json', { title: 't', head: 'feature', base: 'main', draft: true, body: body() })
  const table = { ...baseTable(0), 'repos/mcthaydt/One/pulls': 'fail' }
  assert.match(
    bash(`gh api -X POST repos/mcthaydt/One/pulls --input ${good}`, { table }).reason,
    /could not be read/,
  )
})

test('a body the hook cannot read before the call is refused, not waved through', () => {
  assert.match(bash('gh pr create --draft --title t --body "$(make-body)"').reason, /cannot be read/)
  assert.match(bash('gh pr create --draft --title t --body-file missing.md').reason, /cannot be read/)
  assert.match(
    bash('make-json | gh api -X POST repos/mcthaydt/One/pulls --input -').reason,
    /could not be read as JSON|cannot be read/,
  )
  const quoted = bash(
    `gh api -X POST repos/mcthaydt/One/pulls --input - <<'EOF'\n${JSON.stringify({ title: 't', head: 'feature', base: 'main', draft: true, body: body('Uses `code` and $HOME.') })}\nEOF`,
  )
  assert.equal(quoted.denied, false, quoted.reason)
})

test('reopening counts against the open limit on every route', () => {
  const table = baseTable(LIMIT)
  assert.match(bash('gh pr reopen 7', { table }).reason, atMost)
  assert.match(bash('gh api -X PATCH repos/mcthaydt/One/pulls/7 -f state=open', { table }).reason, atMost)
  assert.match(
    mcp(
      'mcp__github__update_pull_request',
      { owner: 'mcthaydt', repo: 'One', pullNumber: 7, state: 'open' },
      { table },
    ).reason,
    atMost,
  )
  assert.equal(bash('gh pr reopen 7', { table: baseTable(1) }).denied, false)
})

test('the GitHub MCP create tool is held to the same limit', () => {
  const input = {
    owner: 'mcthaydt',
    repo: 'One',
    title: 't',
    head: 'feature',
    base: 'main',
    draft: true,
    body: body(),
  }
  assert.equal(mcp('mcp__github__create_pull_request', input).denied, false)
  assert.match(mcp('mcp__github__create_pull_request', input, { table: baseTable(LIMIT) }).reason, atMost)
})

test('a call that names another repo is judged by that repo, even from a folder that is no repo', () => {
  const good = writeJson('b5.json', { title: 't', head: 'feature', base: 'main', draft: true, body: body() })
  const fromTop = bash(`gh api -X POST repos/mcthaydt/Two/pulls --input ${join(repo, good)}`, {
    cwd: top,
    project: top,
    table: baseTable(LIMIT),
  })
  assert.match(fromTop.reason, atMost)
  const ghR = bash(`gh pr create -R mcthaydt/Two --draft --title t --body-file ${join(repo, 'missing.md')}`, {
    cwd: top,
    project: top,
  })
  assert.match(ghR.reason, /cannot be read/)
  const noClone = bash(`gh api -X POST repos/mcthaydt/Three/pulls --input ${join(repo, good)}`, { cwd: repo })
  assert.match(noClone.reason, /no checkout here/)
  assert.match(
    mcp('mcp__github__merge_pull_request', {
      owner: 'mcthaydt',
      repo: 'Three',
      pullNumber: 1,
      merge_method: 'merge',
    }).reason,
    /no checkout here/,
  )
})

test('routes the hooks cannot read are refused: raw HTTP, scripts, aliases, extensions, GraphQL', () => {
  assert.match(
    bash('curl -X POST https://api.github.com/repos/mcthaydt/One/pulls -d @b.json').reason,
    /curl writes/,
  )
  assert.match(
    bash('curl https://api.github.com/repos/mcthaydt/One/pulls --json \'{"a":1}\'').reason,
    /curl writes/,
  )
  assert.match(
    bash('wget --post-data=x https://api.github.com/repos/mcthaydt/One/pulls').reason,
    /wget writes/,
  )
  assert.match(
    bash(`node -e "fetch('https://api.github.com/repos/mcthaydt/One/pulls', { method: 'POST' })"`).reason,
    /writes to the GitHub API/,
  )
  assert.match(
    bash(`python3 -c "import requests; requests.post('https://api.github.com/repos/x/y/pulls')"`).reason,
    /writes to the GitHub API|POST/,
  )
  writeFileSync(
    join(repo, 'open.mjs'),
    "import { execFileSync } from 'node:child_process'\nexecFileSync('gh', ['pr', 'create', '--fill'])\n",
  )
  assert.match(bash('node open.mjs').reason, /calls gh/)
  assert.match(bash('gh alias set pc "pr create"').reason, /gh alias/)
  assert.match(bash('gh pc --draft').reason, /alias or extension/)
  assert.match(bash('gh extension install someone/gh-thing').reason, /gh extension/)
  assert.match(bash('git -c alias.p=push p origin feature').reason, /alias/)
  assert.match(bash("git config alias.p '!gh api -X POST repos/o/r/pulls'").reason, /alias|gh write inside/)
  assert.match(bash('git config alias.p push').reason, /alias|run another program/)
  assert.match(
    bash(`gh api graphql -f query='mutation { mergePullRequest(input: {}) { clientMutationId } }'`).reason,
    /GraphQL mutation/,
  )
})

test('a shell script file is read, so a call inside it is judged', () => {
  writeFileSync(
    join(repo, 'open.sh'),
    'gh api -X POST repos/mcthaydt/One/pulls -F draft=true -f body=Hi -f head=feature\n',
  )
  assert.match(bash('bash open.sh').reason, /names no lane|Requested by/)
  assert.match(bash('sh ./open.sh').reason, /names no lane|Requested by/)
})

test('reads stay allowed', () => {
  for (const c of [
    'gh api repos/mcthaydt/One/pulls',
    'curl -s https://api.github.com/repos/mcthaydt/One/pulls',
    'gh pr list',
    'gh alias list',
    'node --check .claude/hooks/rules.mjs',
    'node .claude/hooks/rules.mjs --check',
    'git config --get alias.p',
  ])
    assert.equal(bash(c).denied, false, `${c}: ${bash(c).reason}`)
})

test('a broken rules.json or a crash fails closed for GitHub writes only', () => {
  const broken = join(top, 'broken')
  mkdirSync(join(broken, '.claude', 'hooks'), { recursive: true })
  cpSync(join(here, 'rules.mjs'), join(broken, '.claude', 'hooks', 'rules.mjs'))
  writeFileSync(join(broken, '.claude', 'hooks', 'rules.json'), '{ not json')
  const run = (command) =>
    spawnSync('node', [join(broken, '.claude', 'hooks', 'rules.mjs')], {
      input: JSON.stringify({
        hook_event_name: 'PreToolUse',
        tool_name: 'Bash',
        tool_input: { command },
        cwd: broken,
      }),
      encoding: 'utf8',
      env: { ...process.env, CLAUDE_PROJECT_DIR: broken },
    }).stdout
  assert.match(run('git push origin feature'), /fail closed/)
  assert.doesNotMatch(run('ls'), /deny/)
})

test('on GitHub, --github-pr sets the pr-rules status and closes a pull request opened past the limit', () => {
  const pr = (n, extra = {}) => ({
    number: n,
    state: 'open',
    draft: true,
    body: body(),
    head: { ref: 'feature', sha: 'abc1234def' },
    ...extra,
  })
  const table = {
    'repos/mcthaydt/One/pulls/199': pr(199),
    'repos/mcthaydt/One/pulls/199/files': [{ filename: 'src/a.ts' }],
    'repos/mcthaydt/One/pulls': open(LIMIT).concat([{ number: 199 }]),
    'repos/mcthaydt/One/statuses/abc1234def': {},
    'repos/mcthaydt/One/issues/199/comments': {},
    ...Object.fromEntries(
      open(LIMIT).map(({ number: n }) => [`repos/mcthaydt/One/pulls/${n}/files`, [{ filename: 'src/b.ts' }]]),
    ),
  }
  const env = { GITHUB_REPOSITORY: 'mcthaydt/One', PR_NUMBER: '199', PR_ACTION: 'opened' }
  const tablePath = join(top, 'gh-table.json')
  writeFileSync(tablePath, JSON.stringify(table))
  const log = join(top, 'gh-log.txt')
  writeFileSync(log, '')
  const r = spawnSync('node', [join(repo, '.claude', 'hooks', 'rules.mjs'), '--github-pr'], {
    cwd: repo,
    encoding: 'utf8',
    env: { ...process.env, ...env, PATH: `${bin}:${process.env.PATH}`, GH_TABLE: tablePath, GH_LOG: log },
  })
  assert.equal(r.status, 1, r.stdout + r.stderr)
  const calls = readFileSync(log, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l))
  assert.ok(
    calls.some(
      (c) =>
        c.includes('repos/mcthaydt/One/statuses/abc1234def') &&
        c.includes('state=failure') &&
        c.includes('context=pr-rules'),
    ),
  )
  assert.ok(calls.some((c) => c.includes('repos/mcthaydt/One/pulls/199') && c.includes('state=closed')))

  writeFileSync(
    tablePath,
    JSON.stringify({ ...table, 'repos/mcthaydt/One/pulls': open(LIMIT - 1).concat([{ number: 199 }]) }),
  )
  writeFileSync(log, '')
  const ok = spawnSync('node', [join(repo, '.claude', 'hooks', 'rules.mjs'), '--github-pr'], {
    cwd: repo,
    encoding: 'utf8',
    env: { ...process.env, ...env, PATH: `${bin}:${process.env.PATH}`, GH_TABLE: tablePath, GH_LOG: log },
  })
  assert.equal(ok.status, 0, ok.stdout + ok.stderr)
  assert.ok(readFileSync(log, 'utf8').includes('state=success'))
})

test('audit 1: a query string, a variable or a config file cannot hide the route', () => {
  const good = writeJson('b6.json', { title: 't', head: 'feature', base: 'main', draft: true, body: body() })
  const table = baseTable(LIMIT)
  assert.match(
    bash(`gh api -X POST 'repos/mcthaydt/One/pulls?x=1' --input ${good}`, { table }).reason,
    atMost,
  )
  assert.match(
    bash(`gh api -X PUT 'repos/mcthaydt/One/pulls/230/merge?a=1' -f merge_method=squash`).reason,
    /squash|merge_method/,
  )
  assert.match(bash(`gh api -X PATCH 'repos/mcthaydt/One/pulls/7?' -f state=open`, { table }).reason, atMost)
  assert.match(
    bash(`gh api -X POST '/repos//mcthaydt/One/pulls#x' --input ${good}`, { table }).reason,
    atMost,
  )
  assert.match(bash(`P=repos/mcthaydt/One/pulls; gh api -X POST $P --input ${good}`).reason, /cannot read/)
  assert.match(
    bash('U=https://api.github.com/repos/o/r/pulls; curl -X POST "$U" -d @b.json').reason,
    /curl writes/,
  )
  assert.match(bash('curl -K /tmp/cfg -X POST').reason, /curl writes/)
  assert.equal(bash('curl -s -H "Authorization: Bearer $T" https://example.com/x').denied, false)
})

test('audit 1: checks, protection, settings and API commits are refused', () => {
  for (const c of [
    'gh api -X POST repos/mcthaydt/One/statuses/abc -f state=success -f context=pr-rules',
    'gh api -X POST repos/mcthaydt/One/check-runs -f name=gate',
    'gh api -X DELETE repos/mcthaydt/One/branches/main/protection',
    'gh api -X DELETE repos/mcthaydt/One/branches/main/protection/enforce_admins',
    'gh api -X PATCH repos/mcthaydt/One -F allow_squash_merge=true',
    'gh api -X PUT repos/mcthaydt/One/contents/README.md -f message=x -f content=eA== -f branch=b',
    'gh api -X POST repos/mcthaydt/One/git/commits -f message=x',
    'gh api -X PATCH repos/mcthaydt/One/git/refs/heads/b -f sha=abc',
    'gh repo edit --enable-squash-merge',
    'gh pr update-branch 7',
  ])
    assert.equal(bash(c).denied, true, c)
  for (const c of [
    'gh api -X POST repos/mcthaydt/One/issues/7/comments -f body=hi',
    'gh api -X POST repos/mcthaydt/One/pulls/7/requested_reviewers -f "reviewers[]=x"',
  ])
    assert.equal(bash(c).denied, false, `${c}: ${bash(c).reason}`)
})

test('audit 1: reopening through the issues API counts against the limit', () => {
  const table = {
    ...baseTable(LIMIT),
    'repos/mcthaydt/One/issues/7': { number: 7, state: 'closed', pull_request: {} },
  }
  assert.match(bash('gh api -X PATCH repos/mcthaydt/One/issues/7 -f state=open', { table }).reason, atMost)
  assert.match(bash('gh issue reopen 7', { table }).reason, atMost)
  assert.match(
    mcp(
      'mcp__github__issue_write',
      { method: 'update', owner: 'mcthaydt', repo: 'One', issue_number: 7, state: 'open' },
      { table },
    ).reason,
    atMost,
  )
  assert.equal(
    bash('gh api -X PATCH repos/mcthaydt/One/issues/7 -f state=open', {
      table: { ...table, 'repos/mcthaydt/One/pulls': open(1) },
    }).denied,
    false,
  )
})

test('audit 1: a positional parameter in the path is unknown too', () => {
  assert.match(bash('gh api -X PATCH repos/mcthaydt/$1/pulls/$2 --input x.json').reason, /cannot read/)
})

test('audit 2: gh that the shell builds, wraps or feeds in is refused', () => {
  const del = 'gh api -X DELETE repos/mcthaydt/One/branches/main/protection'
  writeFileSync(join(repo, 'y.sh'), `${del}\n`)
  for (const c of [
    'GH=gh; $GH api -X DELETE repos/mcthaydt/One/branches/main/protection',
    '$(echo gh) api -X DELETE repos/mcthaydt/One/branches/main/protection',
    `f(){ gh "$@"; }; f api -X DELETE repos/mcthaydt/One/branches/main/protection`,
    `function f { gh "$@"; }; f api -X DELETE repos/mcthaydt/One/branches/main/protection`,
    `echo '${del}' | bash`,
    `printf '%s\\n' '${del}' | sh`,
    `bash -s <<'EOS'\n${del}\nEOS`,
    `bash <<'EOS'\n${del}\nEOS`,
    `source <(echo '${del}')`,
    `echo '${del}' > z.sh && bash z.sh`,
    'bash y.sh',
    `python3 -c 'import subprocess; subprocess.run(["gh","api","-X","DELETE","repos/mcthaydt/One/branches/main/protection"])'`,
    `python3 - <<'EOS'\nimport subprocess\nsubprocess.run(["gh", "api", "-X", "DELETE", "repos/mcthaydt/One/branches/main/protection"])\nEOS`,
    `find . -maxdepth 0 -exec gh api -X DELETE repos/mcthaydt/One/branches/main/protection ;`,
  ])
    assert.equal(bash(c).denied, true, c)
})

test("audit 2: workflow runs and releases are the owner's", () => {
  for (const c of ['gh workflow run release.yml', 'gh release create v9.9.9', 'gh release delete v1.0.0'])
    assert.equal(bash(c).denied, true, c)
  assert.equal(
    mcp('mcp__github__actions_run_trigger', {
      method: 'run_workflow',
      owner: 'mcthaydt',
      repo: 'One',
      workflow_id: 'release.yml',
      ref: 'main',
    }).denied,
    true,
  )
  assert.equal(
    mcp('mcp__github__actions_run_trigger', {
      method: 'rerun_workflow_run',
      owner: 'mcthaydt',
      repo: 'One',
      run_id: 1,
    }).denied,
    false,
  )
  for (const c of [
    'gh run rerun 123 --failed',
    'gh workflow list',
    'gh release list',
    `bash -s <<'EOS'\necho hi\nEOS`,
    'find . -maxdepth 1 -name "*.md" -exec cat {} ;',
    'echo hi | sh -c "cat"',
    'npx -y @biomejs/biome@2.5.15 check --write x.mjs',
    'pnpm dlx @scope/tool@1.0.0 --help',
  ])
    assert.equal(bash(c).denied, false, `${c}: ${bash(c).reason}`)
})

test('audit 3: a gh write under a program the hook does not peel is refused', () => {
  const del = 'gh api -X DELETE repos/mcthaydt/One/branches/main/protection'
  for (const c of [
    `builtin command ${del}`,
    `watch -n 999 ${del}`,
    'parallel gh api -X DELETE ::: repos/mcthaydt/One/branches/main/protection',
    `dash -c '${del}'`,
    `ksh -c '${del}'`,
    `busybox sh -c '${del}'`,
    `su root -c '${del}'`,
    `python3.12 -c 'import subprocess; subprocess.run(["gh","api","-X","DELETE","repos/mcthaydt/One/branches/main/protection"])'`,
    `uv run python -c 'import os; os.system("${del}")'`,
    `node -pe "require('child_process').execSync('${del}')"`,
    `git -c core.pager='sh -c "${del}"' log -1`,
    `cat <<'EOS' > notes.txt\n${del}\nEOS`,
  ])
    assert.equal(bash(c).denied, true, c)
})

test('audit 3: a file written earlier cannot run gh later', () => {
  const gh = 'gh api -X DELETE repos/mcthaydt/One/branches/main/protection'
  writeFileSync(join(repo, 'Makefile'), `nuke:\n\t${gh}\n`)
  for (const c of [
    'make nuke',
    'make -f Makefile nuke',
    'git -c core.sshCommand=/tmp/x fetch',
    'git -c alias.x=push x',
    'git nuke',
    'GIT_PAGER=/tmp/x.sh git log',
    'PATH=/tmp/fake:$PATH gh pr list',
    'export PATH=/tmp/fake:$PATH; gh pr list',
    'git config core.pager /tmp/x.sh',
    'cp /tmp/x .git/hooks/pre-push',
    'echo x > .git/hooks/pre-push',
  ])
    assert.equal(bash(c).denied, true, c)
  rmSync(join(repo, 'Makefile'))
  const write = (file_path, content) =>
    hook('PreToolUse', { tool_name: 'Write', tool_input: { file_path, content } })
  const home = process.env.HOME ?? '/root'
  for (const [p, t] of [
    [join(repo, '.git', 'hooks', 'pre-push'), 'echo hi'],
    [join(repo, '.git', 'config'), '[alias]\n\tnuke = push'],
    [join(home, '.gitconfig'), '[core]\n\tpager = less'],
    [join(home, '.config', 'gh', 'config.yml'), 'aliases: {}'],
    [join(repo, 'Makefile'), `nuke:\n\t${gh}\n`],
    [join(repo, 'tools', 'nuke.mk'), `nuke:\n\t${gh}\n`],
    [join(repo, 'nuke.py'), `import os\nos.system("${gh}")\n`],
  ])
    assert.equal(write(p, t).denied, true, p)
  assert.equal(write(join(repo, 'notes.md'), `Run \`${gh}\` to clear it.`).denied, false)
  for (const c of [
    'git status',
    'git log -1',
    'git config --get user.name',
    'git config user.email a@b.c',
    'git -c color.ui=never log -1',
    'cat .git/config',
  ])
    assert.equal(bash(c).denied, false, `${c}: ${bash(c).reason}`)
})

test('audit 3: the hooks cannot be switched off', () => {
  const off = ['disable', 'AllHooks'].join('')
  const write = (file_path, content) =>
    hook('PreToolUse', { tool_name: 'Write', tool_input: { file_path, content } })
  assert.equal(write(join(repo, '.claude', 'settings.local.json'), '{}').denied, true)
  assert.equal(write(join(process.env.HOME ?? '/root', '.claude', 'settings.json'), '{}').denied, true)
  assert.equal(write(join(repo, '.claude', 'other.json'), `{"${off}": true}`).denied, true)
  assert.equal(write(join(repo, 'notes.md'), `A session must never set ${off}.`).denied, false)
  assert.equal(bash(`echo '{"${off}":true}' > x.json`).denied, true)
  assert.equal(bash(`git -c core.${'hooks'}Path=/tmp/h push origin feature`).denied, true)
  for (const n of [
    'mcp__claude-code-remote__update_environment',
    'mcp__claude-code-remote__create_environment',
    'mcp__claude-code-remote__switch_environment',
  ])
    assert.equal(mcp(n, { setup_script: 'true' }).denied, true, n)
  assert.equal(mcp('mcp__claude-code-remote__list_environments', {}).denied, false)
  assert.equal(mcp('mcp__hearthbot__message_thread', { text: `The hook now refuses ${off}.` }).denied, false)
  assert.equal(
    mcp('mcp__github__create_or_update_file', {
      path: '.claude/settings.local.json',
      content: `{"${off}":true}`,
    }).denied,
    true,
  )
})

test('audit 4: a decoy gh word, a cut value or an escaped newline cannot hide a gh write', () => {
  const del = 'gh api -X DELETE repos/mcthaydt/One/branches/main/protection'
  for (const c of [
    `g""h pr list; watch -n 999 ${del}`,
    `"gh" --version; watch ${del}`,
    `ls -t '${del}'; parallel ${del} ::: 1`,
    `watch ${del} and git log -1 -m '${del}'`,
    `printf '#!/bin/sh\\n${del}\\n' > tools/nuke`,
    `echo '${del}' | sh`,
    `tee tools/nuke <<'EOS'\n${del}\nEOS`,
  ])
    assert.equal(bash(c).denied, true, c)
  // A gh write typed plainly, or quoted only as data, still passes to the usual checks.
  for (const c of [
    'gh pr list',
    `git log -1 -m '${del}'`,
    `ls -t '${del}'`,
    'gh api repos/mcthaydt/One/pulls --jq ".[].number" | head -3',
  ])
    assert.equal(bash(c).denied, false, `${c}: ${bash(c).reason}`)
})

test('audit 4: programs that run other programs are refused outright', () => {
  writeFileSync(join(repo, 'nuke.sh'), 'gh api -X DELETE repos/mcthaydt/One/branches/main/protection\n')
  for (const c of [
    'watch git push --force origin HEAD:claude/x',
    'watch git push origin HEAD:main',
    'watch curl -X DELETE https://api.github.com/repos/mcthaydt/One/branches/main/protection',
    'watch gh issue reopen 210',
    'watch -n 1 ./nuke.sh',
    'parallel bash ::: nuke.sh',
    'tmux new -d "gh pr list"',
    'screen -dm gh pr list',
    'echo nuke.sh | entr sh nuke.sh',
    'chronic gh pr list',
    'nq gh pr list',
    'at now < nuke.sh',
    'systemd-run gh pr list',
    'firejail gh pr list',
    'bwrap --bind / / gh pr list',
    'unshare -r gh pr list',
    'nsenter -t 1 gh pr list',
    'chroot / gh pr list',
    'pkexec gh pr list',
    'strace -f gh pr list',
    'ltrace gh pr list',
    'valgrind gh pr list',
    'rlwrap gh pr list',
  ])
    assert.equal(bash(c).denied, true, c)
  rmSync(join(repo, 'nuke.sh'))
})

test('audit 4: scripts and recipes cannot force-push, push main, reopen or write the API', () => {
  for (const c of [
    `python3 -c 'import subprocess; subprocess.run(["git","push","--force","origin","HEAD:claude/x"])'`,
    `node -e "require('child_process').execSync('git push --force origin HEAD:claude/x')"`,
    `python3 -c 'import os; os.system("git push origin HEAD:main")'`,
    `node -e "require('child_process').execSync('gh issue reopen 210')"`,
  ])
    assert.equal(bash(c).denied, true, c)
  for (const recipe of [
    'git push --force origin HEAD:claude/x',
    'git push origin +HEAD:claude/x',
    'git push origin --delete claude/x',
    'git push origin HEAD:main',
    'curl -X DELETE https://api.github.com/repos/mcthaydt/One/branches/main/protection',
    'gh issue reopen 210',
  ]) {
    writeFileSync(join(repo, 'Makefile'), `nuke:\n\t${recipe}\n`)
    assert.equal(bash('make -f Makefile nuke').denied, true, recipe)
  }
  rmSync(join(repo, 'Makefile'))
})

test('audit 4: guarded files are found after cd, by their real path', () => {
  const home = process.env.HOME ?? '/root'
  for (const c of [
    'cd .git && cp /tmp/x hooks/pre-push',
    'cd .git/hooks && echo x > pre-push',
    'cd .git && ln -s /tmp/x hooks/pre-push',
    `cd ${home}/.claude && cp /tmp/x settings.json`,
    `cd ${home} && cp /tmp/x .gitconfig`,
  ])
    assert.equal(bash(c).denied, true, c)
  for (const c of ['cd .git && ls hooks', 'cd .git && cat config'])
    assert.equal(bash(c).denied, false, `${c}: ${bash(c).reason}`)
})

test('audit 4: any file that starts with #! counts as a file that runs later', () => {
  const del = 'gh api -X DELETE repos/mcthaydt/One/branches/main/protection'
  const write = (file_path, content) =>
    hook('PreToolUse', { tool_name: 'Write', tool_input: { file_path, content } })
  assert.equal(write(join(repo, 'tools', 'nuke'), `#!/bin/sh\n${del}\n`).denied, true)
  assert.equal(
    write(join(repo, 'tools', 'nuke'), `#!/usr/bin/env python3\nimport os\nos.system("${del}")\n`).denied,
    true,
  )
  assert.equal(write(join(repo, 'tools', 'hello'), '#!/bin/sh\necho hello\n').denied, false)
})

// A repo whose main holds a merge made on GitHub: committed by GitHub, authored by the owner under
// another email (Site main's 1de7e03). Pushes are judged without a fetch, so the test needs no network.
const merged = join(top, 'merged')
mkdirSync(merged)
makeRepo(merged, 'mcthaydt/Merged')
{
  const file = join(merged, '.claude', 'hooks', 'rules.json')
  writeFileSync(file, JSON.stringify({ ...JSON.parse(readFileSync(file, 'utf8')), fetchBeforePush: false }))
}
const asGitHub = (author = 'T', email = 't@example.com') =>
  `GIT_AUTHOR_NAME=${author} GIT_AUTHOR_EMAIL=${email} GIT_COMMITTER_NAME=GitHub GIT_COMMITTER_EMAIL=noreply@github.com`
sh(
  [
    'git checkout -qb side main',
    'echo y > side.txt',
    'git add -A',
    'git commit -qm side',
    'git checkout -q main',
    `${asGitHub('T', 'owner@elsewhere.example')} git merge -q --no-ff side -m "Merge pull request #1"`,
    'git update-ref refs/remotes/origin/main HEAD',
  ].join(' && '),
  merged,
)
const inMerged = { cwd: merged, project: merged, own: true }
const verify = (command) =>
  hook('PostToolUse', { tool_name: 'Bash', tool_input: { command }, tool_response: '' }, inMerged).out

test("GitHub's merge commit on main, brought in by a pull, is not judged as a new commit", () => {
  sh('git checkout -q -B feature origin/main', merged)
  assert.equal(
    verify('git pull origin main')?.decision,
    undefined,
    JSON.stringify(verify('git pull origin main')),
  )
  assert.equal(verify('git merge origin/main')?.decision, undefined)
  assert.equal(bash('git push -u origin feature', inMerged).denied, false)
  // A commit made here is still judged.
  sh(`${asGitHub()} git commit -q --allow-empty -m mine`, merged)
  assert.equal(verify('git commit -m mine')?.decision, 'block')
})

test('only a GitHub-committed merge by the owner passes the push check; other GitHub commits fail', () => {
  const push = () => bash('git push -u origin feature', inMerged)
  const reset = () =>
    sh(
      'git checkout -q -B feature origin/main && git checkout -q -B side2 origin/main && echo z > z.txt && git add -A && git commit -qm z && git checkout -q feature',
      merged,
    )
  reset()
  sh(`${asGitHub()} git merge -q --no-ff side2 -m "Merge branch side2"`, merged)
  assert.equal(push().denied, false, push().reason)
  reset()
  sh(`${asGitHub('T', 'owner@elsewhere.example')} git merge -q --no-ff side2 -m "Merge branch side2"`, merged)
  assert.match(push().reason, /committed by GitHub/)
  reset()
  sh(`${asGitHub()} git commit -q --allow-empty -m "Edited on GitHub"`, merged)
  assert.match(push().reason, /committed by GitHub/)
})

test('a pull request is never edited with raw gh api: body or title, inline, from a file or as JSON', () => {
  writeFileSync(join(repo, 'pr-body.md'), body())
  const json = writeJson('pr-edit.json', { body: body() })
  for (const c of [
    'gh api -X PATCH repos/mcthaydt/One/pulls/7 -F body=@pr-body.md',
    'gh api -X PATCH repos/mcthaydt/One/pulls/7 --field body=@pr-body.md',
    `gh api -X PATCH repos/mcthaydt/One/pulls/7 -f body='${body()}'`,
    `gh api -X PATCH repos/mcthaydt/One/pulls/7 --input ${json}`,
    'gh api repos/mcthaydt/One/pulls/7 -f title=New',
  ])
    assert.match(bash(c).reason, /never with raw gh api on pulls/, c)
  // Reopening stays judged by the open limit, as before.
  assert.equal(bash('gh api -X PATCH repos/mcthaydt/One/pulls/7 -f state=open').denied, false)
})

test("a pull request's words cannot be changed through the issues API either", () => {
  // #7 is a pull request, #8 a plain issue, #9 cannot be read.
  const table = {
    ...baseTable(0),
    'repos/mcthaydt/One/issues/7': { number: 7, state: 'open', pull_request: {} },
    'repos/mcthaydt/One/issues/8': { number: 8, state: 'open' },
  }
  writeFileSync(join(repo, 'pr-body.md'), body())
  const json = writeJson('issue-edit.json', { body: body() })
  const edits = (n) => [
    `gh api -X PATCH repos/mcthaydt/One/issues/${n} -F body=@pr-body.md`,
    `gh api -X PATCH repos/mcthaydt/One/issues/${n} -f title=New`,
    `gh api -X PATCH repos/mcthaydt/One/issues/${n} --input ${json}`,
    `gh issue edit ${n} --body-file pr-body.md`,
    `gh issue edit ${n} --title New`,
    `gh issue edit https://github.com/mcthaydt/One/issues/${n} -b Hi`,
  ]
  for (const c of edits(7)) assert.match(bash(c, { table }).reason, /through the issues API/, c)
  for (const c of edits(9)) assert.match(bash(c, { table }).reason, /could not be read/, c)
  for (const c of edits(8))
    assert.equal(bash(c, { table }).denied, false, `${c}: ${bash(c, { table }).reason}`)
  // gh edits every issue it is given, and a flag's value is not an issue (audit 1).
  for (const c of [
    'gh issue edit 8 7 --body-file pr-body.md',
    'gh issue edit -t 8 7',
    'gh issue edit -b 8 7',
  ])
    assert.match(bash(c, { table }).reason, /through the issues API/, c)
  assert.match(bash('gh issue edit --title New', { table }).reason, /could not be read/)
  const mcpEdit = (n) =>
    mcp(
      'mcp__github__issue_write',
      { method: 'update', owner: 'mcthaydt', repo: 'One', issue_number: n, body: body() },
      { table },
    )
  assert.match(mcpEdit(7).reason, /through the issues API/)
  assert.match(mcpEdit(9).reason, /could not be read/)
  assert.equal(mcpEdit(8).denied, false, mcpEdit(8).reason)
  // Labels and other issue fields stay allowed on a pull request.
  assert.equal(bash('gh issue edit 7 --add-label bug', { table }).denied, false)
})

test('turning a pull request back to draft is allowed on both routes; body edits through the API are not', () => {
  const table = {
    ...baseTable(0),
    'repos/mcthaydt/One/pulls/7': { number: 7, state: 'open', head: { ref: 'feature', sha: 'abc1234' } },
  }
  const toDraft = bash('gh api -X POST repos/mcthaydt/One/pulls/7/ccr/convert_to_draft', { table })
  assert.equal(toDraft.denied, false, toDraft.reason)
  const mcpDraft = mcp(
    'mcp__github__update_pull_request',
    { owner: 'mcthaydt', repo: 'One', pullNumber: 7, draft: true },
    { table },
  )
  assert.equal(mcpDraft.denied, false, mcpDraft.reason)
  for (const c of [
    'gh api -X PATCH repos/mcthaydt/One/pulls/7 -f body=Hi',
    'gh api -X POST repos/mcthaydt/One/pulls/7 -f title=New',
  ])
    assert.equal(bash(c, { table }).denied, true, c)
})

test('a merged branch may be deleted through the API; the default branch and unmerged branches may not', () => {
  const pr = (number, ref, state, merged, sha) => ({
    number,
    state,
    merged_at: merged ? '2026-11-21T00:00:00Z' : null,
    head: { ref, sha },
  })
  const R = 'repos/mcthaydt/One'
  const ref = (b, sha) => ({ [`${R}/git/ref/heads/${b}`]: { object: { sha } } })
  const table = {
    ...baseTable(0),
    [R]: { private: false, default_branch: 'main' },
    [`${R}/pulls`]: [
      pr(1, 'claude/done', 'closed', true, 'd1'),
      pr(2, 'claude/dropped', 'closed', false, 'x2'),
      pr(3, 'claude/again', 'closed', true, 'a3'),
      pr(4, 'claude/again', 'open', false, 'a4'),
      pr(5, 'claude/reused', 'closed', true, 'r5'),
      pr(6, 'claude/inmain', 'closed', true, 'm6'),
    ],
    ...ref('claude/done', 'd1'),
    ...ref('claude/dropped', 'x2'),
    ...ref('claude/reused', 'r9'),
    ...ref('claude/inmain', 'm9'),
    [`${R}/compare/main...r9`]: { status: 'ahead' },
    [`${R}/compare/main...m9`]: { status: 'behind' },
  }
  const del = (b, t = table) => bash(`gh api -X DELETE ${R}/git/refs/heads/${b}`, { table: t })
  assert.equal(del('claude/done').denied, false, del('claude/done').reason)
  // Its newest commit moved on after the merge, but main already holds it.
  assert.equal(del('claude/inmain').denied, false, del('claude/inmain').reason)
  assert.match(del('main').reason, /default branch/)
  assert.match(del('claude/dropped').reason, /not merged/)
  assert.match(del('claude/never').reason, /not merged/)
  assert.match(del('claude/again').reason, /open pull request #4/)
  // Merged once, then reused with new work that no merged pull request holds.
  assert.match(del('claude/reused').reason, /commits no merged pull request holds/)
  for (const b of ['claude/done', 'main', 'claude/dropped', 'claude/reused'])
    assert.doesNotMatch(del(b).reason, /writes a commit/, b)
  // Anything it cannot read refuses.
  for (const key of [R, `${R}/pulls`, `${R}/git/ref/heads/claude/reused`, `${R}/compare/main...r9`])
    assert.match(del('claude/reused', { ...table, [key]: 'fail' }).reason, /could not be read/, key)
  const many = Array.from({ length: 100 }, (_, i) => pr(200 + i, 'claude/done', 'closed', true, 'd1'))
  assert.match(del('claude/done', { ...table, [`${R}/pulls`]: many }).reason, /100 or more/)
  // Moving a branch or deleting a tag through the API stays refused.
  assert.equal(
    bash('gh api -X PATCH repos/mcthaydt/One/git/refs/heads/claude/done -f sha=abc', { table }).denied,
    true,
  )
  assert.equal(bash('gh api -X DELETE repos/mcthaydt/One/git/refs/tags/v1.0.0', { table }).denied, true)
})

test('a script is judged by its own text: read-only gh calls beside it pass, a quoted gh write in it is named', () => {
  const reads = `python3 - <<'EOF'\nopen('notes.md', 'a').write('a line\\n')\nEOF\nfor s in abc def; do gh api -X GET repos/mcthaydt/One/commits/$s/check-runs --jq '.check_runs[].conclusion'; done`
  assert.equal(bash(reads).denied, false, bash(reads).reason)
  // A string the script holds could be handed to a shell, so it still counts; the reason says so.
  const quoted = `python3 - <<'EOF'\nopen('notes.md', 'a').write('use gh api -X POST repos/o/r/pulls/1/ccr/ready_for_review alone\\n')\nEOF`
  assert.match(bash(quoted).reason, /quoted in a string counts/)
  assert.doesNotMatch(bash(quoted).reason, /change a pull request/)
  assert.match(bash(quoted).reason, /Write or Edit tool/)
})

test('a data block in a message that quotes a gh api write is not a command for the owner', () => {
  // A settings block quoting the command in a JSON string (what a thread posted when it was refused).
  const settings = (lang) =>
    `Add this:\n\`\`\`${lang}\n{\n  "allow": [\n    "Mark ready with gh api -X POST repos/mcthaydt/One/pulls/7/ccr/ready_for_review alone",\n    "git push origin HEAD:x"\n  ]\n}\n\`\`\``
  for (const [name, field] of [
    ['mcp__hearthbot__post_message', 'text'],
    ['mcp__hearthbot__message_coordinator', 'text'],
    ['mcp__hearthbot__message_thread', 'text'],
    ['mcp__claude-code-remote__send_message', 'message'],
  ])
    for (const lang of ['json', 'JSON', 'jsonc', 'json5', 'yaml', 'yml', 'toml']) {
      const r = mcp(name, { [field]: settings(lang) })
      assert.equal(r.denied, false, `${name} ${lang}: ${r.reason}`)
    }
  const post = (text) => mcp('mcp__hearthbot__post_message', { text })
  // Every other fence is judged as before, and a fence after a data block is judged again.
  for (const fence of ['```', '```sh', '```bash', '```text', '```powershell', '```md', '~~~'])
    assert.match(
      post(`Run:\n${fence}\ngh api -X PATCH repos/mcthaydt/One/pulls/1 -f body=x\n${fence.slice(0, 3)}`)
        .reason,
      /GH_PAGER=cat/,
      fence,
    )
  assert.match(
    post(`${settings('json')}\nThen:\n\`\`\`\ngh api repos/mcthaydt/One\n\`\`\``).reason,
    /GH_PAGER=cat/,
  )
  assert.match(post('Run:\n```\n$ git push origin feature\n```').reason, /never plain git/)
  assert.equal(post('Run:\n```bash\nGH_PAGER=cat gh api repos/mcthaydt/One\n```').denied, false)
  // A data-labelled fence is not judged whatever it holds, to its end or, unclosed, to the message's end.
  assert.equal(post('```json bash\ngh api repos/mcthaydt/One\n```').denied, false)
  assert.equal(post('```yaml\nrun: |\n  gh api repos/mcthaydt/One\n```').denied, false)
  assert.equal(post('```json\n{"a": 1}\ngh api repos/mcthaydt/One\ngit push origin x').denied, false)
  assert.equal(post('The hook refused `gh api -X PATCH repos/mcthaydt/One/pulls/1` in prose.').denied, false)
})

test('a command after do, then or else is judged like any other', () => {
  for (const c of [
    'for i in 1; do curl -X POST https://api.github.com/repos/mcthaydt/One/pulls/7/merge; done',
    `for i in 1; do python3 -c "import os; os.system('gh pr merge 7 --merge')"; done`,
    'if true; then git push origin --delete main; fi',
    'if false; then true; else git push --force origin feature; fi',
    'while true; do git push origin feature:main; done',
    'if true; then gh pr merge 5 --squash; fi',
    '{ gh pr merge 5 --squash; }',
    'until gh pr merge 5 --squash; do echo x; done',
    // An inline NAME=value after a reserved word, and coproc, hide nothing either (plan audit 1, R1).
    'if true; then FOO=1 git -c user.name=x -c user.email=x@y commit --allow-empty -m bad; fi',
    'coproc git -c user.name=x -c user.email=x@y commit --allow-empty -m bad',
    'coproc w { git -c user.name=x -c user.email=x@y commit --allow-empty -m bad; }',
    'time GIT_AUTHOR_NAME=x git commit --allow-empty -m bad',
    'if true; then GIT_AUTHOR_NAME=x git commit --allow-empty -m y; fi',
  ])
    assert.equal(bash(c).denied, true, c)
})

test('a foreground CI watch loop of gh api GETs is allowed; the same loop with a write is not', () => {
  const runs = 'repos/mcthaydt/One/commits/abc1234/check-runs'
  for (const c of [
    `for i in 1 2 3; do gh api -X GET ${runs} -f per_page=100 --jq '.check_runs[].status'; sleep 60; done`,
    `until gh api --method GET ${runs} -F per_page=100 --jq .total_count | grep -q 5; do sleep 60; done`,
    `while true; do s=$(gh api --method=GET ${runs} -f per_page=100 --jq '.check_runs[].status'); echo "$s" | grep -qE 'queued|in_progress' || break; sleep 60; done`,
    `while true; do s=$(gh api -X GET ${runs} --jq '.check_runs[] | select(.status != "completed") | .name' -f per_page=100); [ -z "$s" ] && break; sleep 30; done`,
  ])
    assert.equal(bash(c).denied, false, `${c}: ${bash(c).reason}`)
  for (const c of [
    // -f with no -X GET is a POST.
    'for i in 1 2; do gh api repos/mcthaydt/One/issues/7/comments -f body=hi; sleep 60; done',
    'for i in 1 2; do gh api -X GET -X POST repos/mcthaydt/One/issues/7/comments -f body=hi; sleep 60; done',
    `for i in 1 2; do gh api -X GET ${runs} -f per_page=1; gh pr merge 7 --merge; sleep 60; done`,
    `for i in 1 2; do gh api -X GET ${runs} -f q="$(gh pr merge 7 --merge)"; sleep 60; done`,
    `for i in 1 2; do gh api -X GET ${runs}; curl -X POST https://api.github.com/repos/mcthaydt/One/pulls/7/merge; sleep 60; done`,
    `for i in 1 2; do gh api -XPOST repos/mcthaydt/One/issues/7/comments -f body=hi; sleep 60; done`,
    // Only the gh api call itself is left out of the text, never what another program runs (plan audit 1, R2).
    `gh api -X GET ${runs} > >(caffeinate gh pr merge 5 --squash)`,
    `gh api -X GET ${runs} > >(caffeinate gh pr merge 5 --squash); sleep 1`,
  ])
    assert.equal(bash(c).denied, true, c)
})

test("a PASS carries across commits that only change audit or live-state files, and no further (#256's shape)", () => {
  const dir = join(top, 'carry')
  mkdirSync(dir)
  makeRepo(dir, 'mcthaydt/One')
  const commit = (cmds) =>
    sh([...cmds, 'git add -A', 'git commit -qm c', 'git rev-parse HEAD'].join(' && '), dir)
  const reviewed = sh('git rev-parse HEAD', dir)
  const at = (head) => ({
    ...baseTable(0),
    'repos/mcthaydt/One/pulls/9': {
      number: 9,
      state: 'open',
      body: body().replace('Lane 1.', 'Lane 3.'),
      head: { ref: 'feature', sha: head },
    },
    'repos/mcthaydt/One/issues/9/comments': [
      { body: `${reviewed.slice(0, 7)} PASS`, created_at: '2026-11-22T00:00:00Z' },
    ],
    'repos/mcthaydt/One/pulls/9/reviews': [],
  })
  const ready = (head) =>
    bash('gh api -X POST repos/mcthaydt/One/pulls/9/ccr/ready_for_review', {
      cwd: dir,
      project: dir,
      own: true,
      table: at(head),
    })
  const branch = (name) => sh(`git checkout -qb ${name} ${reviewed}`, dir)
  // #256: the audit file lands after the PASS; a live-state file comes and goes.
  branch('audit-only')
  commit([
    'mkdir -p docs/superpowers/audits',
    'echo ok > docs/superpowers/audits/a-1-implementation-audit.md',
  ])
  const live = commit(['mkdir -p docs/superpowers/live', 'echo x > docs/superpowers/live/old.md'])
  assert.equal(ready(live).denied, false, ready(live).reason)
  // Anything else in the range makes the PASS stale.
  branch('audit-and-code')
  const mixed = commit([
    'mkdir -p docs/superpowers/audits',
    'echo ok > docs/superpowers/audits/b.md',
    'echo y > src/b.ts',
  ])
  branch('code-into-audits')
  const moved = commit(['mkdir -p docs/superpowers/audits', 'git mv src/a.ts docs/superpowers/audits/a.ts'])
  branch('other-doc')
  const doc = commit([
    'mkdir -p docs/superpowers/audits',
    'echo ok > docs/superpowers/audits/c.md',
    'echo z > docs/notes.md',
  ])
  // Only Markdown in those folders: code there could be imported by what the review covered.
  branch('code-in-audits')
  const code = commit(['mkdir -p docs/superpowers/audits', 'echo x > docs/superpowers/audits/run.mjs'])
  for (const head of [mixed, moved, doc, code])
    assert.match(ready(head).reason, /no passing review that names its head/, head)
})

test('a branch delete by git push is judged like the API delete, from one table', () => {
  const pr = (number, ref, state, merged, sha) => ({
    number,
    state,
    merged_at: merged ? '2026-11-21T00:00:00Z' : null,
    head: { ref, sha },
  })
  const R = 'repos/mcthaydt/One'
  const ref = (b, sha) => ({ [`${R}/git/ref/heads/${b}`]: { object: { sha } } })
  const table = {
    ...baseTable(0),
    [R]: { private: false, default_branch: 'main' },
    [`${R}/pulls`]: [
      pr(1, 'claude/done', 'closed', true, 'd1'),
      pr(2, 'claude/dropped', 'closed', false, 'x2'),
      pr(4, 'claude/again', 'open', false, 'a4'),
      pr(5, 'claude/reused', 'closed', true, 'r5'),
    ],
    ...ref('claude/done', 'd1'),
    ...ref('claude/dropped', 'x2'),
    ...ref('claude/reused', 'r9'),
    [`${R}/compare/main...r9`]: { status: 'ahead' },
    [`${R}/pulls/1`]: pr(1, 'claude/done', 'closed', true, 'd1'),
    [`${R}/pulls/2`]: pr(2, 'claude/dropped', 'closed', false, 'x2'),
    [`${R}/pulls/4`]: pr(4, 'claude/again', 'open', false, 'a4'),
    [`${R}/pulls/5`]: pr(5, 'claude/reused', 'closed', true, 'r5'),
  }
  const number = { 'claude/done': 1, 'claude/dropped': 2, 'claude/again': 4, 'claude/reused': 5 }
  // Every route and form git and gh take for a delete (plan audit 1, R3 and R4).
  const both = (b) => [
    `git push origin --delete ${b}`,
    `git push -d origin ${b}`,
    `git push -vd origin ${b}`,
    `git push origin --del ${b}`,
    `git push origin --dele ${b}`,
    `git push origin ${b} --delete`,
    `gh api -X DELETE ${R}/git/refs/heads/${b}`,
    ...(number[b] ? [`gh pr close ${number[b]} --delete-branch`, `gh pr close ${number[b]} -d`] : []),
  ]
  for (const c of [
    ...both('claude/done'),
    'git push origin :claude/done',
    'git push origin :refs/heads/claude/done',
  ])
    assert.equal(bash(c, { table }).denied, false, `${c}: ${bash(c, { table }).reason}`)
  for (const [b, why] of [
    ['claude/dropped', /not merged/],
    ['claude/never', /not merged/],
    ['claude/again', /open pull request #4/],
    ['claude/reused', /commits no merged pull request holds/],
  ])
    for (const c of both(b)) {
      const r = bash(c, { table })
      assert.match(r.reason, why, c)
      assert.match(r.reason, /merged|close|owner/, c)
    }
  // The default branch, by every push form.
  for (const c of [
    ...both('main'),
    'git push --delete origin main',
    'git push origin :main',
    'git push origin +:main',
    'git push origin :refs/heads/main',
    'git push origin --delete claude/done main',
    'git push origin feature :claude/done :main',
  ])
    assert.equal(bash(c, { table }).denied, true, c)
  // A list is judged branch by branch: one branch that may not go refuses the whole push.
  assert.match(bash('git push origin --delete claude/done claude/dropped', { table }).reason, /not merged/)
  assert.match(bash('git push origin :claude/done :claude/again', { table }).reason, /open pull request #4/)
  // A tag, and anything the hook cannot read, refuses.
  assert.equal(bash('git push origin --delete refs/tags/v1.0.0', { table }).denied, true)
  assert.equal(bash('git push origin :refs/tags/v1.0.0', { table }).denied, true)
  assert.match(
    bash('git push origin --delete claude/done', { table: { ...table, [R]: 'fail' } }).reason,
    /could not be read/,
  )
  assert.equal(bash('git push nowhere --delete claude/done', { table }).denied, true)
  assert.equal(bash('git push origin --delete "$B"', { table }).denied, true)
  assert.match(bash('gh pr close 77 --delete-branch', { table }).reason, /could not be read/)
  // Every way gh takes the delete flag (plan audit 2, R7); a comment that starts with -d is no flag.
  for (const c of ['gh pr close 4 -dc bye', 'gh pr close 4 --delete-branch=true', 'gh pr close 4 -d=true'])
    assert.match(bash(c, { table }).reason, /open pull request #4/, c)
  assert.equal(bash('gh pr close 4 --delete-branch=false', { table }).denied, false)
  assert.equal(bash('gh pr close 4 -c -dull', { table }).denied, false)
  // A push whose words the shell builds could hide a delete (plan audit 2, R6).
  for (const c of [
    'D=--delete; git push origin $D claude/again',
    'git push origin $(printf -- --delete) claude/again',
  ])
    assert.match(bash(c, { table }).reason, /shell builds/, c)
  assert.equal(bash('git push -u origin claude/x', { table }).denied, false)
  // Brace expansion, ANSI-C quoting and xargs build words too (plan audit 3, R8, R10, R12).
  for (const c of [
    'git push origin {-d,main}',
    'git push {origin,-d,claude/again}',
    'git push origin -{d,} claude/again',
    'git push origin {-d,claude/again}',
    "git push origin $'\\x2d\\x2ddelete' claude/again",
    "git push origin $'\\055\\055delete' claude/again",
    "git push origin $'\\x2d'd claude/again",
    'echo main | xargs git push origin --delete',
    'echo claude/again | xargs git push origin -d',
    'echo :claude/again | xargs git push origin',
  ])
    assert.match(bash(c, { table }).reason, /shell builds/, c)
  // Digits bundle with d too (R9); a dry run is judged as real, since --no-dry-run after it wins (R11).
  for (const c of [
    'git push -4d origin claude/again',
    'git push -6vd origin claude/again',
    'git push --dry-run --no-dry-run origin :claude/again',
    'git push --dry-run -d origin claude/again',
  ])
    assert.match(bash(c, { table }).reason, /open pull request #4/, c)
  for (const c of [
    'git push -n --no-dry-run --delete origin main',
    'git push -n --no-dry-run origin HEAD:main',
  ])
    assert.equal(bash(c, { table }).denied, true, c)
  // --prune deletes branches nobody names, so it is refused outright; a plain close or merge -d is not judged here.
  for (const c of [
    'git push --prune origin refs/heads/claude/*:refs/heads/claude/*',
    'git push --pru origin x',
  ])
    assert.match(bash(c, { table }).reason, /--pru/, c)
  assert.equal(bash('gh pr close 4', { table }).denied, false, bash('gh pr close 4', { table }).reason)
  assert.equal(bash('git push origin --progress claude/x', { table }).denied, false)
})

test('gh pr close and gh pr subcommands whose words the shell builds are refused, as for git push', () => {
  const R = 'repos/mcthaydt/One'
  const table = {
    ...baseTable(0),
    [R]: { private: false, default_branch: 'main' },
    [`${R}/pulls/4`]: { number: 4, state: 'open', merged_at: null, head: { ref: 'claude/again', sha: 'a4' } },
  }
  for (const c of [
    'gh pr close 4 {-d,}',
    'gh pr close 4 -{d,}',
    "gh pr close 4 $'-d'",
    "gh pr close 4 $'\\x2dd'",
    "gh pr close 4 $'--delete-branch'",
    'D=-d; gh pr close 4 $D',
    'gh pr close 4 $(printf -- -d)',
    'echo -d | xargs gh pr close 4',
    "gh pr $'close' 4 -d",
    "gh pr $'merge' 4 --squash",
    'gh pr {merge,} 4 --squash',
    // Every gh group, not only pr (plan audit 1).
    "gh issue $'reopen' 5",
    "gh issue $'edit' 5 --body x",
    "gh release $'create' v9",
  ])
    assert.match(bash(c, { table }).reason, /shell builds|xargs/, c)
  for (const c of ['gh pr close 4', "gh pr close 4 -c 'not needed'", 'gh pr view 4', 'gh issue view 5'])
    assert.equal(bash(c, { table }).denied, false, `${c}: ${bash(c, { table }).reason}`)
})

test('git push takes @{u}, @{upstream} and @{push} on a source, and still refuses brace expansion', () => {
  const track = (to) =>
    sh(`git update-ref refs/remotes/origin/${to} HEAD && git branch -q -u origin/${to} feature`, repo)
  const untrack = (to) =>
    sh(`git branch -q --unset-upstream feature && git update-ref -d refs/remotes/origin/${to}`, repo)
  track('feature')
  try {
    for (const c of [
      'git push origin HEAD@{u}',
      'git push origin HEAD@{upstream}',
      'git push origin feature@{push}',
      'git push -u origin HEAD@{u}',
    ])
      assert.equal(bash(c).denied, false, `${c}: ${bash(c).reason}`)
    for (const c of [
      'git push origin HEAD@{u,-d}',
      'git push origin HEAD@{u}{,-d}',
      'git push origin {HEAD@{u},-d}',
      'git push origin HEAD:HEAD@{u}',
      'git push origin HEAD@{1}',
      'git push origin -d HEAD@{u}',
    ])
      assert.match(bash(c).reason, /shell builds/, c)
  } finally {
    untrack('feature')
  }
  // An upstream that is the default branch is a push to it.
  track('main')
  try {
    assert.match(bash('git push origin HEAD@{u}').reason, /Nothing is pushed straight to main/)
  } finally {
    sh('git branch -q --unset-upstream feature', repo)
  }
  // No upstream: what the push targets cannot be read.
  assert.match(bash('git push origin HEAD@{u}').reason, /could not be read/)
})

test('a script file written and run in the same command is refused, with a reason to split them', () => {
  writeFileSync(join(repo, 'safe.sh'), '#!/bin/sh\necho fine\n')
  chmodSync(join(repo, 'safe.sh'), 0o755)
  writeFileSync(join(repo, 'other.sh'), 'echo other\n')
  writeFileSync(join(repo, 'safe.mjs'), 'console.log(1)\n')
  writeFileSync(join(repo, 'writes.sh'), "printf 'x' > safe.sh\n")
  mkdirSync(join(repo, 'sub'), { recursive: true })
  writeFileSync(join(repo, 'sub', 'other.sh'), 'echo other\n')
  try {
    for (const c of [
      "printf '\\x67h pr merge 5 --squash\\n' > safe.sh && bash safe.sh",
      "printf '\\x67h pr merge 5 --squash\\n' >> safe.sh; sh ./safe.sh",
      'echo Z2ggcHIgbWVyZ2UgNQ== | base64 -d > safe.sh && ./safe.sh',
      'echo Z2ggcHIgbWVyZ2UgNQ== | base64 -d | tee safe.sh && source safe.sh',
      'cp other.sh safe.sh && bash safe.sh',
      'cp other.sh sub/ && bash sub/other.sh',
      "sed -i 's/fine/x/' safe.sh && bash safe.sh",
      `cat > safe.sh <<'EOS'\necho fine\nEOS\nbash safe.sh`,
      "printf 'x' > safe.mjs && node safe.mjs",
      'echo all: > Makefile && make',
      'base64 -d < x.b64 > "$F" && bash safe.sh',
      'dd if=other.sh of=safe.sh && bash safe.sh',
      'curl -s --output=safe.sh https://example.com/x && bash safe.sh',
      'git diff --output=safe.sh && bash safe.sh',
      // A command read from a script counts as a writer too (plan audit 1, N6).
      'bash writes.sh && bash safe.sh',
    ])
      assert.match(bash(c).reason, /written and run in the same command|split/, c)
    for (const c of [
      'bash safe.sh',
      'cat safe.sh && bash safe.sh',
      'chmod +x safe.sh && ./safe.sh',
      'bash safe.sh > out.txt 2>/dev/null',
      'node safe.mjs > out.txt',
      'echo hi > notes.txt && bash safe.sh',
      'git diff safe.sh && git add safe.sh && bash safe.sh',
      "awk '{print $1}' notes.txt && sed -i 's/`a`/$b/' notes.md && bash safe.sh",
    ])
      assert.equal(bash(c).denied, false, `${c}: ${bash(c).reason}`)
  } finally {
    for (const f of ['safe.sh', 'other.sh', 'safe.mjs', 'writes.sh', 'sub'])
      rmSync(join(repo, f), { force: true, recursive: true })
  }
})
