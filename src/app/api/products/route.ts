import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

function generateId() {
  return `prod_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

export async function GET() {
  try {
    const { data: products, error } = await supabase
      .from('products')
      .select('*')
    
    if (error) {
      console.error('Error fetching products:', error)
      return NextResponse.json({ products: [] }, { status: 200 })
    }

    const normalized = (products || []).map((product: any) => ({
      ...product,
      productCategory: product.productCategory || 'غير محدد',
      packagingType: product.packagingType || 'غير محدد',
    }))

    return NextResponse.json({ products: normalized }, { status: 200 })
  } catch (error) {
    console.error('Error fetching products:', error)
    return NextResponse.json(
      { error: 'Failed to fetch products' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const newProduct = {
      id: generateId(),
      ...body,
      productCategory: body.productCategory || 'غير محدد',
      packagingType: body.packagingType || 'غير محدد',
    }

    const { data: inserted, error } = await supabase
      .from('products')
      .insert([newProduct])
      .select()
      .single()

    if (error) {
      console.error('Error creating product:', error)
      return NextResponse.json(
        { error: 'Failed to create product' },
        { status: 500 }
      )
    }

    return NextResponse.json(inserted || newProduct, { status: 201 })
  } catch (error) {
    console.error('Error creating product:', error)
    return NextResponse.json(
      { error: 'Failed to create product' },
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()

    if (!body.id) {
      return NextResponse.json({ error: 'Product ID required' }, { status: 400 })
    }

    const { data: existing, error: fetchError } = await supabase
      .from('products')
      .select('*')
      .eq('id', body.id)
      .single()

    if (fetchError || !existing) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }

    const updated = {
      ...existing,
      ...body,
      productCategory: body.productCategory || existing.productCategory || 'غير محدد',
      packagingType: body.packagingType || existing.packagingType || 'غير محدد',
    }

    const { data: result, error } = await supabase
      .from('products')
      .update(updated)
      .eq('id', body.id)
      .select()
      .single()

    if (error) {
      console.error('Error updating product:', error)
      return NextResponse.json(
        { error: 'Failed to update product' },
        { status: 500 }
      )
    }

    return NextResponse.json(result || updated, { status: 200 })
  } catch (error) {
    console.error('Error updating product:', error)
    return NextResponse.json(
      { error: 'Failed to update product' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json()

    if (!body.id) {
      return NextResponse.json({ error: 'Product ID required' }, { status: 400 })
    }

    const { error: deleteError } = await supabase
      .from('products')
      .delete()
      .eq('id', body.id)

    if (deleteError) {
      console.error('Error deleting product:', deleteError)
      return NextResponse.json(
        { error: 'Failed to delete product' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true }, { status: 200 })
  } catch (error) {
    console.error('Error deleting product:', error)
    return NextResponse.json(
      { error: 'Failed to delete product' },
      { status: 500 }
    )
  }
}
