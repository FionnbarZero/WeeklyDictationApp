import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  DICTATION_CONTEXT_CATALOG_SCHEMA_VERSION,
  type DictationContextCandidate,
  type DictationContextCatalog,
  validateDictationContextCatalog,
} from '../src/curriculum/contextCatalog.ts'

const gradeKey = process.argv[2]
const csvPath = process.argv[3]

if (gradeKey !== 'kindergarten' || !csvPath) {
  throw new Error('Usage: npm run import:dictation-contexts -- kindergarten /absolute/path/to/export.csv')
}

function parseCsv(value: string) {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index]
    if (quoted) {
      if (character === '"' && value[index + 1] === '"') {
        cell += '"'
        index += 1
      } else if (character === '"') quoted = false
      else cell += character
      continue
    }
    if (character === '"') quoted = true
    else if (character === ',') {
      row.push(cell)
      cell = ''
    } else if (character === '\n') {
      row.push(cell.replace(/\r$/, ''))
      rows.push(row)
      row = []
      cell = ''
    } else cell += character
  }
  if (cell || row.length) {
    row.push(cell.replace(/\r$/, ''))
    rows.push(row)
  }
  return rows
}

const requiredHeaders = [
  'Grade',
  'School year',
  'Source spreadsheet ID',
  'Source tab gid',
  'Tier',
  'Target occurrence ID',
  'Target',
  'Context words',
  'Status',
] as const

const rows = parseCsv(readFileSync(resolve(csvPath), 'utf8'))
const headerIndex = rows.findIndex((row) => requiredHeaders.every((header) => row.includes(header)))
if (headerIndex < 0) throw new Error(`The CSV does not contain the required review headers: ${requiredHeaders.join(', ')}.`)
const headers = rows[headerIndex]
const column = (name: string) => {
  const index = headers.indexOf(name)
  if (index < 0) throw new Error(`The CSV is missing the ${name} column.`)
  return index
}

const candidates: DictationContextCandidate[] = rows.slice(headerIndex + 1)
  .filter((row) => row[column('Target occurrence ID')]?.trim())
  .map((row) => {
    const targetOccurrenceId = row[column('Target occurrence ID')].trim()
    const contextTokens = row[column('Context words')].trim().split(/\s+/).filter(Boolean)
    return {
      id: targetOccurrenceId,
      grade: row[column('Grade')].trim(),
      schoolYear: row[column('School year')].trim(),
      sourceDocumentId: row[column('Source spreadsheet ID')].trim(),
      sourceUnitId: row[column('Source tab gid')].trim(),
      tier: row[column('Tier')].trim() as DictationContextCandidate['tier'],
      targetOccurrenceId,
      targetText: row[column('Target')].trim(),
      contextTokens,
      status: row[column('Status')].trim() as DictationContextCandidate['status'],
      ...(headers.includes('Reviewer notes') && row[column('Reviewer notes')]?.trim()
        ? { reviewerNotes: row[column('Reviewer notes')].trim() }
        : {}),
    }
  })

const catalog: DictationContextCatalog = {
  schemaVersion: DICTATION_CONTEXT_CATALOG_SCHEMA_VERSION,
  generatedAt: new Date().toISOString(),
  candidates,
}
const validation = validateDictationContextCatalog(catalog)
if (!validation.valid) throw new Error(validation.errors.join('\n'))

const outputPath = resolve(import.meta.dirname, '../src/curriculum/contextCatalogs/kindergarten.json')
writeFileSync(outputPath, `${JSON.stringify(catalog, null, 2)}\n`)
console.log(`Imported ${candidates.length} Kindergarten context rows into ${outputPath}.`)
console.log(`${candidates.filter((candidate) => candidate.status === 'Approved').length} rows are approved for child-facing use.`)
