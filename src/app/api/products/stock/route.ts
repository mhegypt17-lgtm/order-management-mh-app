import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

const PRODUCTS_FILE = path.join(process.cwd(), 'data', 'products.json')

type StockStatus = 'available' | 'low' | 'out'
const VALID_STATUSES: StockStatus[] = ['available', 'low', 'out']

export const dynamic = 'force-dynamic'
export const revalidate = 0

function readProducts(): any[] {
  try {
    return JSON.parse(fs.readFileSync(PRODUCTS_FILE, 'utf-8'))
  } catch {
    return []
  }
}

function writeProducts(products: any[]) {
  fs.writeFileSync(PRODUCTS_FILE, JSON.stringify(products, null, 2))
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const role = String(body.role || '').toLowerCase()
    if (role !== 'branch' && role !== 'admin') {
      return NextResponse.json({ error: 'غير مسموح — فقط الفرع أو المدير يمكنه تعديل المخزون' }, { status: 403 })
    }

    const id = String(body.id || '').trim()
    if (!id) return NextResponse.json({ error: 'Missing product id' }, { status: 400 })

    const status = String(body.stockStatus || '').toLowerCase() as StockStatus
    if (!VALID_STATUSES.includes(status)) {
      return NextResponse.json({ error: 'Invalid stockStatus' }, { status: 400 })
    }

    let stockQuantity: number | null = null
    if (body.stockQuantity !== undefined && body.stockQuantity !== null && body.stockQuantity !== '') {
      const n = Number(body.stockQuantity)
      if (!Number.isFinite(n) || n < 0) {
        return NextResponse.json({ error: 'Invalid stockQuantity' }, { status: 400 })
      }
      stockQuantity = Math.floor(n)
    }
    // 'out' implies zero
    if (status === 'out') stockQuantity = 0

    const products = readProducts()
    const idx = products.findIndex((p: any) => p.id === id)
    if (idx === -1) return NextResponse.json({ error: 'Product not found' }, { status: 404 })

    products[idx] = {
      ...products[idx],
      stockStatus: status,
      stockQuantity,
      stockUpdatedAt: new Date().toISOString(),
      stockUpdatedBy: String(body.actor || role),
    }
    writeProducts(products)

    return NextResponse.json({ product: products[idx] }, { status: 200 })
  } catch (err) {
    console.error('stock PATCH error', err)
    return NextResponse.json({ error: 'Failed to update stock' }, { status: 500 })
  }
}
