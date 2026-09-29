import type { SheetsWorkbookPayload } from '../src/curriculum/model.ts'

type FetchLike = typeof fetch

type GoogleSheetsMetadataResource = {
  spreadsheetId?: string
  sheets?: Array<{ properties?: { sheetId?: number; title?: string; index?: number } }>
  error?: { message?: string }
}

type GoogleSheetsValuesResource = {
  valueRanges?: Array<{ range?: string; values?: unknown[][] }>
  error?: { message?: string }
}

function apiError(body: { error?: { message?: string } }, fallback: string) {
  return body.error?.message || fallback
}

function quotedSheetRange(title: string) {
  return `'${title.replace(/'/g, "''")}'!A1:V200`
}

export async function fetchGoogleSpreadsheet(
  spreadsheetId: string,
  accessToken: string,
  fetchImpl: FetchLike = fetch,
): Promise<SheetsWorkbookPayload> {
  const headers = { Authorization: `Bearer ${accessToken}` }
  const metadataUrl = new URL(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}`)
  metadataUrl.searchParams.set('includeGridData', 'false')
  metadataUrl.searchParams.set('fields', 'spreadsheetId,sheets(properties(sheetId,title,index))')
  const metadataResponse = await fetchImpl(metadataUrl, { headers })
  const metadata = await metadataResponse.json().catch(() => ({})) as GoogleSheetsMetadataResource
  if (!metadataResponse.ok) throw new Error(`Google Sheets metadata read failed: ${apiError(metadata, metadataResponse.statusText)}`)

  const sheets = (metadata.sheets || [])
    .map((sheet) => sheet.properties || {})
    .filter((properties): properties is { sheetId: number; title: string; index?: number } => typeof properties.sheetId === 'number' && typeof properties.title === 'string')
    .sort((left, right) => (left.index || 0) - (right.index || 0))

  if (sheets.length === 0) {
    return { sourceType: 'google-sheets', spreadsheetId: metadata.spreadsheetId || spreadsheetId, sheets: [] }
  }

  const valuesUrl = new URL(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values:batchGet`)
  valuesUrl.searchParams.set('majorDimension', 'ROWS')
  valuesUrl.searchParams.set('valueRenderOption', 'FORMATTED_VALUE')
  for (const sheet of sheets) valuesUrl.searchParams.append('ranges', quotedSheetRange(sheet.title))
  const valuesResponse = await fetchImpl(valuesUrl, { headers })
  const valuesBody = await valuesResponse.json().catch(() => ({})) as GoogleSheetsValuesResource
  if (!valuesResponse.ok) throw new Error(`Google Sheets values read failed: ${apiError(valuesBody, valuesResponse.statusText)}`)

  return {
    sourceType: 'google-sheets',
    spreadsheetId: metadata.spreadsheetId || spreadsheetId,
    sheets: sheets.map((sheet, index) => ({
      sheetId: sheet.sheetId,
      title: sheet.title,
      values: Array.isArray(valuesBody.valueRanges?.[index]?.values) ? valuesBody.valueRanges![index].values : [],
    })),
  }
}
