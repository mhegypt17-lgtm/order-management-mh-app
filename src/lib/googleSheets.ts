import { GoogleSpreadsheet } from 'google-spreadsheet'

const SHEET_ID = process.env.NEXT_PUBLIC_GOOGLE_SHEET_ID
const GOOGLE_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
const GOOGLE_KEY = process.env.GOOGLE_PRIVATE_KEY

if (!SHEET_ID || !GOOGLE_EMAIL || !GOOGLE_KEY) {
  console.error('⚠️ Google Sheets credentials not configured')
}

let cachedDoc: GoogleSpreadsheet | null = null

export async function initializeGoogleSheet() {
  if (cachedDoc) return cachedDoc

  try {
    const doc = new GoogleSpreadsheet(SHEET_ID)

    await doc.useServiceAccountAuth({
      client_email: GOOGLE_EMAIL!,
      private_key: GOOGLE_KEY!.replace(/\\n/g, '\n'),
    })

    await doc.loadInfo()
    cachedDoc = doc
    return doc
  } catch (error) {
    console.error('Failed to initialize Google Sheet:', error)
    throw error
  }
}

export async function getOrCreateSheet(title: string) {
  const doc = await initializeGoogleSheet()
  let sheet = doc.sheetsByTitle[title]

  if (!sheet) {
    sheet = await doc.addSheet({ title, headerValues: [] })
  }

  return sheet
}

export async function getSheetData(sheetTitle: string) {
  try {
    const sheet = await getOrCreateSheet(sheetTitle)
    await sheet.loadCells()
    const rows = await sheet.getRows()
    return rows
  } catch (error) {
    console.error(`Error fetching data from ${sheetTitle}:`, error)
    return []
  }
}

export async function addRow(sheetTitle: string, data: Record<string, any>) {
  try {
    const sheet = await getOrCreateSheet(sheetTitle)
    const newRow = await sheet.addRow(data)
    return newRow
  } catch (error) {
    console.error(`Error adding row to ${sheetTitle}:`, error)
    throw error
  }
}

export async function updateRow(
  sheetTitle: string,
  rowIndex: number,
  data: Record<string, any>
) {
  try {
    const sheet = await getOrCreateSheet(sheetTitle)
    const rows = await sheet.getRows()
    const row = rows[rowIndex]

    if (!row) throw new Error('Row not found')

    Object.entries(data).forEach(([key, value]) => {
      row[key] = value
    })

    await row.save()
    return row
  } catch (error) {
    console.error(`Error updating row in ${sheetTitle}:`, error)
    throw error
  }
}

export async function deleteRow(sheetTitle: string, rowIndex: number) {
  try {
    const sheet = await getOrCreateSheet(sheetTitle)
    const rows = await sheet.getRows()
    const row = rows[rowIndex]

    if (!row) throw new Error('Row not found')

    await row.delete()
  } catch (error) {
    console.error(`Error deleting row from ${sheetTitle}:`, error)
    throw error
  }
}
