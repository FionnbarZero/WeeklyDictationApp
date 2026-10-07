import { execFileSync } from 'node:child_process'
import { prepareOfflineRollback } from './familyOfflineRollback.ts'

if (!process.argv[2]) throw new Error('Supply the exact retained previous family artifact directory.')
if (execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim())
  throw new Error('Commit the compatibility source before preparing rollback.')
const revision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
const { directory, manifest } = prepareOfflineRollback(process.argv[2], revision)
console.log(
  JSON.stringify(
    {
      directory,
      sourceRevision: manifest.sourceRevision,
      compatibilityRevision: revision,
      fileTreeSha256: manifest.fileTreeSha256,
    },
    null,
    2,
  ),
)
