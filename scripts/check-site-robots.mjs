/*
  Asserts that a site-wide robots directive reaches the search index. Rebuilds the
  exampleSite with params.meta.robots set to noindex (through Hugo's
  HUGO_PARAMS_META_ROBOTS environment variable) into a temporary directory, then
  expects only "Robots index page" and "Robots partial-word page" to remain: they
  are the two fixtures whose own indexable directive overrides the site's. Run
  after `pnpm build`, which vendors the modules this build reads.
*/
import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dest = await mkdtemp(join(tmpdir(), 'flexsearch-site-robots-'))
let titles
try {
  execFileSync('hugo', ['--gc', '-s', 'exampleSite', '-d', dest, '--logLevel', 'error'], {
    env: { ...process.env, HUGO_PARAMS_META_ROBOTS: 'noindex' },
    stdio: ['ignore', 'ignore', 'inherit']
  })
  const docs = JSON.parse(await readFile(join(dest, 'js/flexsearch-index.en.json'), 'utf8'))
  titles = docs.map((doc) => doc.title)
} finally {
  await rm(dest, { recursive: true, force: true })
}

const EXPECTED = ['Robots index page', 'Robots partial-word page']
if (JSON.stringify(titles) !== JSON.stringify(EXPECTED)) {
  console.error('FAIL site-wide robots: noindex')
  console.error(`  - expected only ${JSON.stringify(EXPECTED)} in the index, got ${JSON.stringify(titles)}`)
  process.exit(1)
}

console.log('PASS site-wide robots: noindex leaves only the pages that override it')
