import { fetchGoogleSpreadsheet } from './googleSheets.ts'
import { googleAccessToken, type GoogleOAuthConfig } from './googleSlides.ts'
import { kindergartenSheetsProfile, inspectKindergartenWorkbook } from '../src/kindergartenSheetsImporter.ts'

export type ReadOnlySheetsInspectionConfig = {
  spreadsheetId: string
  googleOAuth: GoogleOAuthConfig
}

export type ReadOnlySheetsInspectionDependencies = {
  googleAccessToken: typeof googleAccessToken
  fetchGoogleSpreadsheet: typeof fetchGoogleSpreadsheet
}

const defaults: ReadOnlySheetsInspectionDependencies = { googleAccessToken, fetchGoogleSpreadsheet }

// This boundary obtains OAuth credentials and performs Google read requests only.
// It returns blocked canonical candidates for review and has no hydration or
// Firestore dependency.
export async function inspectKindergartenSheetsReadOnly(
  config: ReadOnlySheetsInspectionConfig,
  dependencies: ReadOnlySheetsInspectionDependencies = defaults,
) {
  if (config.spreadsheetId !== kindergartenSheetsProfile.sourceWorkbookId) {
    throw new Error('The requested spreadsheet is not the registered Kindergarten workbook.')
  }
  const accessToken = await dependencies.googleAccessToken(config.googleOAuth)
  const workbook = await dependencies.fetchGoogleSpreadsheet(config.spreadsheetId, accessToken)
  return inspectKindergartenWorkbook(workbook)
}
