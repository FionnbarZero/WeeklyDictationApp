import { KINDERGARTEN_SHEETS_ID } from '../src/config.ts'
import { inspectKindergartenSheetsReadOnly } from '../backend/readOnlySheetsInspection.ts'
import { kindergartenSheetsDryRunSummary } from '../src/kindergartenSheetsImporter.ts'

function required(name: string) {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required read-only Sheets configuration: ${name}`)
  return value
}

const args = process.argv.slice(2)
const spreadsheetId = args.find((arg) => arg.startsWith('--spreadsheet-id='))?.slice('--spreadsheet-id='.length)
  || process.env.GOOGLE_SHEETS_SPREADSHEET_ID
  || KINDERGARTEN_SHEETS_ID
const candidates = await inspectKindergartenSheetsReadOnly({
  spreadsheetId,
  googleOAuth: {
    clientId: required('GOOGLE_OAUTH_CLIENT_ID'),
    clientSecret: required('GOOGLE_OAUTH_CLIENT_SECRET'),
    refreshToken: required('GOOGLE_OAUTH_REFRESH_TOKEN'),
  },
})

console.log(JSON.stringify(kindergartenSheetsDryRunSummary(candidates), null, 2))
