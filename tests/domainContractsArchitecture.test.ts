import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

function source(relativePath: string) {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8')
}

const domainDirectory = fileURLToPath(new URL('../src/domain/', import.meta.url))

function isTypeScriptFamilyFile(fileName: string) {
  return /\.(?:ts|tsx|mts|cts)$/.test(fileName)
}

function domainTypeScriptFiles(directory = domainDirectory): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = join(directory, entry.name)
    if (entry.isDirectory()) return domainTypeScriptFiles(entryPath)
    if (!entry.isFile() || !isTypeScriptFamilyFile(entry.name)) return []
    return [relative(domainDirectory, entryPath).split(sep).join('/')]
  }).sort()
}

test('the domain inventory recognizes every TypeScript-family extension', () => {
  for (const fileName of ['example.ts', 'example.tsx', 'example.mts', 'example.cts']) {
    assert.equal(isTypeScriptFamilyFile(fileName), true)
  }
  for (const fileName of ['example.js', 'example.jsx', 'example.mjs', 'example.cjs']) {
    assert.equal(isTypeScriptFamilyFile(fileName), false)
  }
})

test('the foundational domain boundary contains only dependency-free approved contracts', () => {
  const approvedFiles = ['contracts.ts']
  assert.deepEqual(domainTypeScriptFiles(), approvedFiles)

  for (const file of approvedFiles) {
    const fileSource = source(`../src/domain/${file}`)
    assert.doesNotMatch(fileSource, /^\s*import\b/m)
    assert.doesNotMatch(fileSource, /\bfrom\s*['"]/)
    assert.doesNotMatch(fileSource, /\brequire\s*\(/)
    assert.doesNotMatch(fileSource, /\bimport\s*\(/)
    assert.doesNotMatch(fileSource, /^\s*\/\/\/\s*<reference\b/m)
  }
})

test('the Slides importer depends on foundational contracts instead of the domain facade', () => {
  const importer = source('../src/slidesImporter.ts')
  assert.match(importer, /from ['"]\.\/domain\/contracts\.ts['"]/)
  assert.doesNotMatch(importer, /['"]\.\/domain(?:\.ts)?['"]/)
})

test('the domain facade preserves the public Word and Dataset type exports', () => {
  assert.match(source('../src/domain.ts'), /export type \{ Dataset, Word \} from ['"]\.\/domain\/contracts\.ts['"]/)
})
