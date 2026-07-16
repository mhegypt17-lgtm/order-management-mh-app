import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
  Row,
  Column,
  Link,
} from '@react-email/components'
import * as React from 'react'
import type { DailyReportData } from '@/lib/reports/daily'
import {
  formatArabicDate,
  formatCurrency,
  formatEnglishDate,
  formatNumber,
} from '@/lib/reports/format'

interface Props {
  data: DailyReportData
  /** Optional URL for the "View in browser" link. */
  browserUrl?: string
}

const colors = {
  brand: '#991b1b', // red-800 — matches app navbar
  brandLight: '#fee2e2', // red-100
  text: '#111827', // gray-900
  subtle: '#6b7280', // gray-500
  border: '#e5e7eb', // gray-200
  bg: '#f9fafb', // gray-50
  positive: '#065f46', // emerald-800
  negative: '#b91c1c', // red-700
  neutral: '#374151', // gray-700
  amber: '#b45309', // amber-700
  amberBg: '#fef3c7', // amber-100
}

const font =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Tahoma, Arial, sans-serif'

/**
 * The daily ops report emailed at ~5–6 AM Cairo. Content is intentionally
 * short and glanceable — read time ~45 seconds.
 *
 * Rendered by @react-email/render both server-side (for the email body)
 * and via a preview page in the admin area for iteration.
 */
export default function DailyOpsReport({ data, browserUrl }: Props) {
  const {
    reportDate,
    revenue,
    orders,
    customers,
    topProducts,
    redFlags,
  } = data

  const redFlagRows: Array<{ label: string; count: number; ok: boolean }> = [
    {
      label: 'Open complaints > 24h',
      count: redFlags.openComplaintsOver24h,
      ok: redFlags.openComplaintsOver24h === 0,
    },
    {
      label: 'Orders past scheduled date, not delivered',
      count: redFlags.ordersPastScheduledDate,
      ok: redFlags.ordersPastScheduledDate === 0,
    },
    {
      label: 'Products out of stock',
      count: redFlags.outOfStockProducts,
      ok: redFlags.outOfStockProducts === 0,
    },
    {
      label: 'Products with missing prices',
      count: redFlags.productsWithMissingPrices,
      ok: redFlags.productsWithMissingPrices === 0,
    },
  ]

  const previewText = `Sales: ${formatCurrency(revenue.totalSales)} · Orders: ${formatNumber(orders.total)} · New: ${customers.newCustomers}`

  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={{ backgroundColor: colors.bg, fontFamily: font, margin: 0, padding: '20px 0' }}>
        <Container style={{ backgroundColor: '#ffffff', maxWidth: 640, margin: '0 auto', border: `1px solid ${colors.border}`, borderRadius: 8, overflow: 'hidden' }}>
          {/* Header */}
          <Section style={{ backgroundColor: colors.brand, padding: '20px 24px' }}>
            <Heading as="h1" style={{ color: '#fff', margin: 0, fontSize: 20, fontWeight: 700 }}>
              📊 Daily Ops Report
            </Heading>
            <Text style={{ color: '#fecaca', margin: '4px 0 0', fontSize: 13 }}>
              {formatEnglishDate(reportDate)}
              {' — '}
              <span dir="rtl">{formatArabicDate(reportDate)}</span>
            </Text>
          </Section>

          {/* Revenue */}
          <Section style={sectionStyle}>
            <SectionHeading emoji="💰" label="Revenue" />
            <Row>
              <Column>
                <Metric
                  label="Total Sales"
                  value={formatCurrency(revenue.totalSales)}
                  change={revenue.salesPctChange}
                />
              </Column>
              <Column>
                <Metric
                  label="Orders Count"
                  value={formatNumber(revenue.ordersCount)}
                  change={revenue.ordersPctChange}
                />
              </Column>
            </Row>
            <Text style={{ ...subtleNote, marginTop: 12 }}>
              Coming soon: revenue by source (B2B, InstaShop, Online, …)
            </Text>
          </Section>

          <Hr style={hrStyle} />

          {/* Orders breakdown */}
          <Section style={sectionStyle}>
            <SectionHeading emoji="📦" label="Orders" />
            <Row>
              <Column style={pillCol}><Pill label="Total" value={orders.total} color={colors.neutral} /></Column>
              <Column style={pillCol}><Pill label="Delivered" value={orders.delivered} color={colors.positive} /></Column>
              <Column style={pillCol}><Pill label="Cancelled" value={orders.cancelled} color={colors.negative} /></Column>
              <Column style={pillCol}><Pill label="Postponed" value={orders.postponed} color={colors.amber} /></Column>
              <Column style={pillCol}><Pill label="Scheduled" value={orders.scheduled} color={colors.brand} /></Column>
            </Row>
            {orders.other > 0 && (
              <Text style={{ ...subtleNote, marginTop: 8 }}>
                {orders.other} order(s) with a status other than the above.
              </Text>
            )}
          </Section>

          <Hr style={hrStyle} />

          {/* Customers */}
          <Section style={sectionStyle}>
            <SectionHeading emoji="👥" label="Customers" />
            <Metric label="New Customers" value={formatNumber(customers.newCustomers)} />
            <Text style={{ ...subtleNote, marginTop: 12 }}>
              Coming soon: customer source breakdown
            </Text>
          </Section>

          <Hr style={hrStyle} />

          {/* Top 5 Products */}
          <Section style={sectionStyle}>
            <SectionHeading emoji="🔝" label="Top 5 Products by Revenue" />
            {topProducts.length === 0 ? (
              <Text style={subtleNote}>No delivered orders yesterday.</Text>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 4 }}>
                <thead>
                  <tr>
                    <th style={thStyle}>#</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Product</th>
                    <th style={thStyle}>Qty</th>
                    <th style={thStyle}>Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {topProducts.map((p, i) => (
                    <tr key={i} style={i % 2 === 1 ? { backgroundColor: colors.bg } : undefined}>
                      <td style={tdStyle}>{i + 1}</td>
                      <td style={{ ...tdStyle, textAlign: 'right', direction: 'rtl' }}>{p.productName}</td>
                      <td style={tdStyle}>{formatNumber(p.quantity)}</td>
                      <td style={tdStyle}>{formatCurrency(p.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Section>

          <Hr style={hrStyle} />

          {/* Red flags */}
          <Section style={sectionStyle}>
            <SectionHeading emoji="🚨" label="Needs Attention" />
            {redFlagRows.map((flag, i) => (
              <Row key={i} style={{ marginBottom: 6 }}>
                <Column style={{ width: 32, verticalAlign: 'top' }}>
                  <Text style={{ margin: 0, fontSize: 16 }}>{flag.ok ? '✅' : '⚠️'}</Text>
                </Column>
                <Column>
                  <Text style={{ margin: 0, color: colors.text, fontSize: 14 }}>
                    <span style={{ fontWeight: 600 }}>{flag.count}</span>
                    {' — '}
                    {flag.label}
                  </Text>
                </Column>
              </Row>
            ))}
          </Section>

          {/* Footer */}
          <Section style={{ padding: '16px 24px', backgroundColor: colors.bg, borderTop: `1px solid ${colors.border}` }}>
            {browserUrl && (
              <Text style={{ margin: 0, fontSize: 12, color: colors.subtle }}>
                <Link href={browserUrl} style={{ color: colors.brand, textDecoration: 'underline' }}>
                  View this report in the browser →
                </Link>
              </Text>
            )}
            <Text style={{ margin: '4px 0 0', fontSize: 11, color: colors.subtle }}>
              Generated automatically by Meathouse Ops · Cairo time zone
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

// ─── Sub-components ──────────────────────────────────────────

function SectionHeading({ emoji, label }: { emoji: string; label: string }) {
  return (
    <Text style={{ margin: '0 0 12px', color: colors.text, fontSize: 16, fontWeight: 700 }}>
      {emoji} {label}
    </Text>
  )
}

function Metric({
  label,
  value,
  change,
}: {
  label: string
  value: string
  change?: { text: string; sign: 'up' | 'down' | 'flat' | 'na' }
}) {
  const changeColor =
    change?.sign === 'up'
      ? colors.positive
      : change?.sign === 'down'
        ? colors.negative
        : colors.subtle

  return (
    <div style={{ padding: '4px 0' }}>
      <Text style={{ margin: 0, fontSize: 12, color: colors.subtle, textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {label}
      </Text>
      <Text style={{ margin: '2px 0 0', fontSize: 24, fontWeight: 700, color: colors.text }}>
        {value}
      </Text>
      {change && (
        <Text style={{ margin: '2px 0 0', fontSize: 12, color: changeColor, fontWeight: 600 }}>
          {change.text}
          <span style={{ color: colors.subtle, fontWeight: 400 }}> vs same weekday last week</span>
        </Text>
      )}
    </div>
  )
}

function Pill({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '8px 4px' }}>
      <Text style={{ margin: 0, fontSize: 20, fontWeight: 700, color }}>{value}</Text>
      <Text style={{ margin: '2px 0 0', fontSize: 11, color: colors.subtle, textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {label}
      </Text>
    </div>
  )
}

// ─── Styles ──────────────────────────────────────────────────

const sectionStyle: React.CSSProperties = { padding: '18px 24px' }
const hrStyle: React.CSSProperties = { borderColor: colors.border, margin: 0 }
const subtleNote: React.CSSProperties = {
  margin: 0,
  fontSize: 11,
  color: colors.subtle,
  fontStyle: 'italic',
}
const pillCol: React.CSSProperties = { width: '20%' }
const thStyle: React.CSSProperties = {
  padding: '6px 8px',
  fontSize: 11,
  color: colors.subtle,
  textTransform: 'uppercase',
  letterSpacing: 0.5,
  borderBottom: `1px solid ${colors.border}`,
  textAlign: 'left',
}
const tdStyle: React.CSSProperties = {
  padding: '6px 8px',
  fontSize: 13,
  color: colors.text,
  borderBottom: `1px solid ${colors.border}`,
}
