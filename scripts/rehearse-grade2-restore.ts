import { readFileSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import { rehearseVerifiedBackup } from './restoreRehearsal.ts'

function flag(name: string) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

const requested = flag('--backup')
if (!requested) throw new Error('Pass the private verified backup path with --backup <file>.')
const backupPath = resolve(requested)
const report = await rehearseVerifiedBackup(readFileSync(backupPath, 'utf8'))

console.log(
  JSON.stringify(
    {
      backupFile: basename(backupPath),
      ...report,
      privacy: 'No child identifier, origin, word content, answer, or score value was printed or copied.',
    },
    null,
    2,
  ),
)
