import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

const DATA_DIR = path.join(process.cwd(), 'data')
const PRODUCTS_FILE = path.join(DATA_DIR, 'products.json')

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true })
}

// Initialize products file if it doesn't exist
if (!fs.existsSync(PRODUCTS_FILE)) {
  const defaultProducts = [
    {
      id: 'prod_1',
      productName: 'تمر عجوة',
      productDescription: 'تمر عجوة من المدينة المنورة',
      productCategory: 'أخرى',
      packagingType: 'أطباق',
      weightGrams: 500,
      basePrice: 120,
      offerPrice: 100,
      productCondition: 'فريش',
      isActive: true,
    },
    {
      id: 'prod_2',
      productName: 'عسل أبيض',
      productDescription: 'عسل أبيض طبيعي 100%',
      productCategory: 'أخرى',
      packagingType: 'أطباق',
      weightGrams: 250,
      basePrice: 180,
      offerPrice: null,
      productCondition: 'فريش',
      isActive: true,
    },
  ]
  fs.writeFileSync(PRODUCTS_FILE, JSON.stringify(defaultProducts, null, 2))
}

function readProducts() {
  try {
    const data = fs.readFileSync(PRODUCTS_FILE, 'utf-8')
    const parsed = JSON.parse(data)
    return parsed.map((product: any) => {
      const validStatus = product.stockStatus === 'low' || product.stockStatus === 'out' ? product.stockStatus : 'available'
      const qty = product.stockQuantity
      return {
        ...product,
        productCategory: product.productCategory || 'غير محدد',
        packagingType: product.packagingType || 'غير محدد',
        stockStatus: validStatus,
        stockQuantity: qty === undefined || qty === null || qty === '' ? null : Number(qty),
        stockUpdatedAt: product.stockUpdatedAt || null,
        stockUpdatedBy: product.stockUpdatedBy || null,
      }
    })
  } catch {
    return []
  }
}

function writeProducts(products: any[]) {
  fs.writeFileSync(PRODUCTS_FILE, JSON.stringify(products, null, 2))
}

function generateId() {
  return `prod_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

export async function GET() {
  try {
    const products = readProducts()
    return NextResponse.json({ products }, { status: 200 })
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch products' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const products = readProducts()

    const newProduct = {
      id: generateId(),
      ...body,
      productCategory: body.productCategory || 'غير محدد',
      packagingType: body.packagingType || 'غير محدد',
    }

    products.push(newProduct)
    writeProducts(products)

    return NextResponse.json(newProduct, { status: 201 })
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to create product' },
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const products = readProducts()

    const index = products.findIndex((p: any) => p.id === body.id)
    if (index === -1) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }

    products[index] = {
      ...products[index],
      ...body,
      productCategory: body.productCategory || products[index].productCategory || 'غير محدد',
      packagingType: body.packagingType || products[index].packagingType || 'غير محدد',
    }
    writeProducts(products)

    return NextResponse.json(products[index], { status: 200 })
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to update product' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json()
    const products = readProducts()

    const index = products.findIndex((p: any) => p.id === body.id)
    if (index === -1) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }

    products.splice(index, 1)
    writeProducts(products)

    return NextResponse.json({ success: true }, { status: 200 })
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to delete product' },
      { status: 500 }
    )
  }
}
