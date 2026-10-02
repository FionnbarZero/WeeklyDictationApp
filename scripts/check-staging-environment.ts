import { resolve } from 'node:path'
import { loadEnv } from 'vite'
import { validateStagingEnvironment } from './stagingEnvironment.ts'

const root = resolve(import.meta.dirname, '..')
const validated = validateStagingEnvironment(loadEnv('staging', root, ''))

console.log(`Staging configuration passed for ${validated.projectId}; synthetic-only and App Check gates are enabled.`)
