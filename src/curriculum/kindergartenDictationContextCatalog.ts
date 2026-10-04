import rawCatalog from './contextCatalogs/kindergarten.json' with { type: 'json' }
import {
  type DictationContextCatalog,
  validateDictationContextCatalog,
} from './contextCatalog.ts'

const catalog = rawCatalog as unknown as DictationContextCatalog
const validation = validateDictationContextCatalog(catalog)

if (!validation.valid) {
  throw new Error(`The Kindergarten dictation context catalog is invalid: ${validation.errors.join(' ')}`)
}

/**
 * Generated only from the separate curriculum-owner review Sheet. Draft and
 * Revise rows remain in the artifact for review traceability, while the runtime
 * overlay accepts only Approved rows.
 */
export const kindergartenDictationContextCatalog = catalog
