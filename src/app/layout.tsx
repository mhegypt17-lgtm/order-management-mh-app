import type { Metadata, Viewport } from 'next'
import { Toaster } from 'react-hot-toast'
import './globals.css'

export const metadata: Metadata = {
  title: 'نظام إدارة الطلبات',
  description: 'Order Management System - نظام متكامل لإدارة الطلبات والعملاء',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ar" dir="rtl">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body className="bg-gray-50">
        {children}
        <Toaster
          position="top-center"
          toastOptions={{
            duration: 3000,
            style: {
              borderRadius: '10px',
              background: '#ffffff',
              color: '#111827',
              border: '1px solid #e5e7eb',
              fontSize: '14px',
            },
          }}
        />
      </body>
    </html>
  )
}
