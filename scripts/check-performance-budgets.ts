import { readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

type ManifestChunk = {
  file: string
  src?: string
  isEntry?: boolean
  imports?: string[]
  dynamicImports?: string[]
  css?: string[]
}

type Budgets = {
  initialJavaScriptBytes: number
  initialCssBytes: number
}

const root = resolve(import.meta.dirname, '..')
const dist = resolve(root, 'dist')
const manifest = JSON.parse(readFileSync(resolve(dist, '.vite/manifest.json'), 'utf8')) as Record<string, ManifestChunk>
const budgets = JSON.parse(readFileSync(resolve(root, 'performance-budgets.json'), 'utf8')) as Budgets
const appEntry = Object.entries(manifest).find(([, chunk]) => chunk.isEntry && chunk.src === 'index.html')
if (!appEntry) throw new Error('The production manifest does not contain the application entry.')

const initialChunkKeys = new Set<string>()
function visitInitialChunk(key: string) {
  if (initialChunkKeys.has(key)) return
  initialChunkKeys.add(key)
  for (const dependency of manifest[key]?.imports || []) visitInitialChunk(dependency)
}
visitInitialChunk(appEntry[0])

const initialChunks = [...initialChunkKeys].map((key) => manifest[key])
const initialJavaScript = initialChunks.reduce(
  (total, chunk) => total + (chunk.file.endsWith('.js') ? statSync(resolve(dist, chunk.file)).size : 0),
  0,
)
const initialCssFiles = new Set(initialChunks.flatMap((chunk) => chunk.css || []))
const initialCss = [...initialCssFiles].reduce((total, file) => total + statSync(resolve(dist, file)).size, 0)

const requiredLazyChunks = ['PracticeView', 'HistoryView', 'Tier2ReadingPractice', 'LocalBackupTools']
for (const chunkName of requiredLazyChunks) {
  const entry = Object.entries(manifest).find(([, chunk]) => chunk.name === chunkName)
  if (!entry || initialChunkKeys.has(entry[0])) {
    throw new Error(`${chunkName} must remain outside the initial application bundle.`)
  }
}

const forbiddenInitialSources = /(Harness|Prototype|testing\.tsx)/i
for (const key of initialChunkKeys) {
  const source = manifest[key]?.src || key
  if (forbiddenInitialSources.test(source)) {
    throw new Error(`Development-only module ${source} is present in the initial application bundle.`)
  }
}

if (initialJavaScript > budgets.initialJavaScriptBytes) {
  throw new Error(
    `Initial JavaScript is ${initialJavaScript} bytes; budget is ${budgets.initialJavaScriptBytes} bytes.`,
  )
}
if (initialCss > budgets.initialCssBytes) {
  throw new Error(`Initial CSS is ${initialCss} bytes; budget is ${budgets.initialCssBytes} bytes.`)
}

console.log(
  `Performance budgets passed: ${initialJavaScript}/${budgets.initialJavaScriptBytes} initial JS bytes, ${initialCss}/${budgets.initialCssBytes} initial CSS bytes.`,
)
