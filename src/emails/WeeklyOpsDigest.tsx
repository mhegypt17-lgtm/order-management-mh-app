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
  Link,
} from '@react-email/components'
import * as React from 'react'
import type { WeeklyReportData } from '@/lib/reports/weekly'
import {
  formatCurrency,
  formatEnglishDate,
  formatNumber,
} from '@/lib/reports/format'

interface Props {
  data: WeeklyReportData
  browserUrl?: string
}

const colors = {
  brand: '#991b1b',
  brandLight: '#fee2e2',
  text: '#111827',
  subtle: '#6b7280',
  border: '#e5e7eb',
  bg: '#f9fafb',
  positive: '#065f46',
  negative: '#b91c1c',
  neutral: '#374151',
  amber: '#b45309',
  blue: '#1d4ed8',
}

const font =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Tahoma, Arial, sans-serif'

export default function WeeklyOpsDigest({ data, browserUrl }: Props) {
  const {
    weekStart,
    weekEnd,
    revenue,
    orders,
    daily,
    revenueByOrderType,
    topProducts,
    customers,
    complaints,
    staff,
    inventory,
    redFlags,
  } = data

  const bestDay = [...daily].sort((a, b) => b.revenue - a.revenue)[0]
  const worstDay = [...daily].sort((a, b) => a.revenue - b.revenue)[0]

  const redFlagRows = [
    { label: 'Overdue scheduled orders (not delivered)', count: redFlags.overdueScheduledOrders },
    { label: 'Open complaints > 3 days', count: redFlags.openComplaintsOver3Days },
    { label: 'Active products out of stock', count: redFlags.outOfStockProducts },
    { label: 'Active products with missing prices', count: redFlags.productsWithMissingPrices },
  ]

  const previewText = `Week ${weekStart} → ${weekEnd} · Sales ${formatCurrency(revenue.totalSales)} · ${revenue.deliveredCount} delivered · ${customers.newCustomers} new`

  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={{ backgroundColor: colors.bg, fontFamily: font, margin: 0, padding: '20px 0' }}>
        <Container style={{ backgroundColor: '#ffffff', maxWidth: 720, margin: '0 auto', border: `1px solid ${colors.border}`, borderRadius: 8, overflow: 'hidden' }}>
          {/* Header */}
          <Section style={{ backgroundColor: colors.brand, padding: '20px 24px' }}>
            <Heading as="h1" style={{ color: '#fff', margin: 0, fontSize: 20, fontWeight: 700 }}>
              📈 Weekly Ops Digest
            </Heading>
            <Text style={{ color: '#fecaca', margin: '4px 0 0', fontSize: 13 }}>
              {formatEnglishDate(weekStart)} — {formatEnglishDate(weekEnd)}
            </Text>
          </Section>

          {/* Section 1 — KPI strip */}
          <Section style={sectionStyle}>
            <SectionHeading emoji="📊" label="Week in a Glance" />
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={thStyle}>Metric</th>
                  <th style={thStyle}>This Week</th>
                  <th style={thStyle}>vs Last Week</th>
                </tr>
              </thead>
              <tbody>
                <KpiRow label="Total Revenue" value={formatCurrency(revenue.totalSales)} change={revenue.salesPctChange} bold />
                <KpiRow label="Total Orders" value={formatNumber(revenue.ordersCount)} change={revenue.ordersPctChange} />
                <KpiRow label="Delivered Orders" value={formatNumber(revenue.deliveredCount)} />
                <KpiRow label="Avg Order Value" value={formatCurrency(revenue.avgOrderValue)} change={revenue.aovPctChange} />
                <KpiRow
                  label="Cancellation Rate"
                  value={`${orders.cancellationRatePct}%`}
                  hint={`prev: ${orders.prevCancellationRatePct}%`}
                />
                <KpiRow label="New Customers" value={formatNumber(customers.newCustomers)} change={customers.newCustomersPctChange} />
              </tbody>
            </table>
          </Section>

          <Hr style={hrStyle} />

          {/* Section 2 — Revenue by Order Type */}
          <Section style={sectionStyle}>
            <SectionHeading emoji="🏷️" label="Revenue by Order Type" />
            {revenueByOrderType.length === 0 ? (
              <Text style={subtleNote}>No orders this week.</Text>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ ...thStyle, textAlign: 'left' }}>Type</th>
                    <th style={thStyle}>Orders</th>
                    <th style={thStyle}>Delivered</th>
                    <th style={thStyle}>Revenue</th>
                    <th style={thStyle}>Share</th>
                    <th style={thStyle}>WoW</th>
                  </tr>
                </thead>
                <tbody>
                  {revenueByOrderType.map((r, i) => (
                    <tr key={r.orderType} style={i % 2 === 1 ? { backgroundColor: colors.bg } : undefined}>
                      <td style={{ ...tdStyle, fontWeight: 600 }}>{r.orderType}</td>
                      <td style={tdStyle}>{formatNumber(r.orders)}</td>
                      <td style={{ ...tdStyle, color: colors.positive }}>{formatNumber(r.delivered)}</td>
                      <td style={{ ...tdStyle, fontWeight: 600 }}>{formatCurrency(r.revenue)}</td>
                      <td style={tdStyle}>{r.sharePct}%</td>
                      <td style={{ ...tdStyle, color: changeColor(r.revenuePctChange.sign) }}>
                        {r.revenuePctChange.text}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Section>

          <Hr style={hrStyle} />

          {/* Section 3 — Day by day */}
          <Section style={sectionStyle}>
            <SectionHeading emoji="📅" label="Day by Day" />
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={thStyle}>Date</th>
                  <th style={thStyle}>Orders</th>
                  <th style={thStyle}>Delivered</th>
                  <th style={thStyle}>Revenue</th>
                </tr>
              </thead>
              <tbody>
                {daily.map((d, i) => (
                  <tr key={d.date} style={i % 2 === 1 ? { backgroundColor: colors.bg } : undefined}>
                    <td style={tdStyle}>{d.date}</td>
                    <td style={tdStyle}>{formatNumber(d.orders)}</td>
                    <td style={{ ...tdStyle, color: colors.positive }}>{formatNumber(d.delivered)}</td>
                    <td style={{ ...tdStyle, fontWeight: 600 }}>{formatCurrency(d.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {bestDay && worstDay && bestDay.date !== worstDay.date && (
              <Text style={{ ...subtleNote, marginTop: 8 }}>
                Best day: <b>{bestDay.date}</b> ({formatCurrency(bestDay.revenue)}) · Worst day: <b>{worstDay.date}</b> ({formatCurrency(worstDay.revenue)})
              </Text>
            )}
          </Section>

          <Hr style={hrStyle} />

          {/* Section 4 — Top 10 products */}
          <Section style={sectionStyle}>
            <SectionHeading emoji="🏆" label="Top 10 Products (by Revenue)" />
            {topProducts.length === 0 ? (
              <Text style={subtleNote}>No delivered orders this week.</Text>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={thStyle}>#</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Product</th>
                    <th style={thStyle}>Qty</th>
                    <th style={thStyle}>Revenue</th>
                    <th style={thStyle}>WoW Rank</th>
                  </tr>
                </thead>
                <tbody>
                  {topProducts.map((p, i) => (
                    <tr key={i} style={i % 2 === 1 ? { backgroundColor: colors.bg } : undefined}>
                      <td style={tdStyle}>{i + 1}</td>
                      <td style={{ ...tdStyle, textAlign: 'right', direction: 'rtl' }}>{p.productName}</td>
                      <td style={tdStyle}>{formatNumber(p.quantity)}</td>
                      <td style={{ ...tdStyle, fontWeight: 600 }}>{formatCurrency(p.revenue)}</td>
                      <td style={{ ...tdStyle, color: rankColor(p.rankDelta) }}>
                        {rankBadge(p.rankDelta, p.prevRank)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Section>

          <Hr style={hrStyle} />

          {/* Section 5 — Customers */}
          <Section style={sectionStyle}>
            <SectionHeading emoji="👥" label="Customers" />
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 12 }}>
              <tbody>
                <MiniRow label="New customers this week" value={formatNumber(customers.newCustomers)} />
                <MiniRow label="Warning (retention risk)" value={formatNumber(customers.warningCount)} />
                <MiniRow label="Suspended" value={formatNumber(customers.suspendedCount)} />
              </tbody>
            </table>
            {customers.topBuyers.length > 0 && (
              <>
                <Text style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 600, color: colors.text }}>
                  Top 5 buyers this week
                </Text>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={thStyle}>#</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>Customer</th>
                      <th style={thStyle}>Orders</th>
                      <th style={thStyle}>Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {customers.topBuyers.map((b, i) => (
                      <tr key={i} style={i % 2 === 1 ? { backgroundColor: colors.bg } : undefined}>
                        <td style={tdStyle}>{i + 1}</td>
                        <td style={{ ...tdStyle, textAlign: 'right', direction: 'rtl' }}>{b.customerName}</td>
                        <td style={tdStyle}>{formatNumber(b.ordersCount)}</td>
                        <td style={{ ...tdStyle, fontWeight: 600 }}>{formatCurrency(b.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </Section>

          <Hr style={hrStyle} />

          {/* Section 6 — Complaints */}
          <Section style={sectionStyle}>
            <SectionHeading emoji="🎫" label="Complaints & Feedback" />
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 12 }}>
              <tbody>
                <MiniRow label="Opened this week" value={formatNumber(complaints.opened)} extra={complaints.openedPctChange.text} extraColor={changeColor(complaints.openedPctChange.sign, true)} />
                <MiniRow label="Closed this week" value={formatNumber(complaints.closed)} />
                <MiniRow label="Still open (all-time)" value={formatNumber(complaints.stillOpen)} extraColor={complaints.stillOpen > 0 ? colors.negative : colors.subtle} />
                <MiniRow label="Compensation paid" value={formatCurrency(complaints.compensationPaid)} />
              </tbody>
            </table>
            {complaints.topReasons.length > 0 && (
              <>
                <Text style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 600, color: colors.text }}>
                  Top complaint reasons
                </Text>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <tbody>
                    {complaints.topReasons.map((r, i) => (
                      <tr key={i} style={i % 2 === 1 ? { backgroundColor: colors.bg } : undefined}>
                        <td style={{ ...tdStyle, textAlign: 'right', direction: 'rtl' }}>{r.reason}</td>
                        <td style={{ ...tdStyle, textAlign: 'right', width: 60 }}>{formatNumber(r.count)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </Section>

          <Hr style={hrStyle} />

          {/* Section 7 — Staff activity */}
          <Section style={sectionStyle}>
            <SectionHeading emoji="👤" label="Staff Activity (Order Receivers)" />
            {staff.length === 0 ? (
              <Text style={subtleNote}>No activity this week.</Text>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Receiver</th>
                    <th style={thStyle}>Orders</th>
                    <th style={thStyle}>Delivered</th>
                    <th style={thStyle}>Cancelled</th>
                    <th style={thStyle}>Completion</th>
                    <th style={thStyle}>Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {staff.map((s, i) => (
                    <tr key={i} style={i % 2 === 1 ? { backgroundColor: colors.bg } : undefined}>
                      <td style={{ ...tdStyle, textAlign: 'right', direction: 'rtl', fontWeight: 600 }}>{s.receiver}</td>
                      <td style={tdStyle}>{formatNumber(s.orders)}</td>
                      <td style={{ ...tdStyle, color: colors.positive }}>{formatNumber(s.delivered)}</td>
                      <td style={{ ...tdStyle, color: colors.negative }}>{formatNumber(s.cancelled)}</td>
                      <td style={tdStyle}>{s.completionRatePct}%</td>
                      <td style={{ ...tdStyle, fontWeight: 600 }}>{formatCurrency(s.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Section>

          <Hr style={hrStyle} />

          {/* Section 8 — Inventory */}
          <Section style={sectionStyle}>
            <SectionHeading emoji="📦" label="Inventory Watch" />
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 8 }}>
              <tbody>
                <MiniRow label="Products out of stock" value={formatNumber(inventory.outOfStock)} extraColor={inventory.outOfStock > 0 ? colors.negative : colors.subtle} />
                <MiniRow label="Products with missing prices" value={formatNumber(inventory.missingPrices)} extraColor={inventory.missingPrices > 0 ? colors.amber : colors.subtle} />
                <MiniRow label="Active products with zero sales this week" value={formatNumber(inventory.zeroSalesTotal)} />
              </tbody>
            </table>
            {inventory.zeroSalesProducts.length > 0 && (
              <>
                <Text style={{ margin: '8px 0 4px', fontSize: 12, color: colors.subtle }}>
                  Slow-mover sample (up to 10):
                </Text>
                <div dir="rtl" style={{ fontSize: 12, color: colors.text, lineHeight: 1.6 }}>
                  {inventory.zeroSalesProducts.map((n, i) => (
                    <span key={i}>
                      {n}
                      {i < inventory.zeroSalesProducts.length - 1 ? ' · ' : ''}
                    </span>
                  ))}
                </div>
              </>
            )}
          </Section>

          <Hr style={hrStyle} />

          {/* Section 9 — Red flags */}
          <Section style={sectionStyle}>
            <SectionHeading emoji="🚨" label="Needs Attention" />
            {redFlagRows.map((flag, i) => (
              <div key={i} style={{ marginBottom: 6 }}>
                <Text style={{ margin: 0, color: colors.text, fontSize: 14 }}>
                  {flag.count === 0 ? '✅' : '⚠️'}{' '}
                  <span style={{ fontWeight: 600 }}>{flag.count}</span>
                  {' — '}
                  {flag.label}
                </Text>
              </div>
            ))}
          </Section>

          {/* Footer */}
          <Section style={{ padding: '16px 24px', backgroundColor: colors.bg, borderTop: `1px solid ${colors.border}` }}>
            {browserUrl && (
              <Text style={{ margin: 0, fontSize: 12, color: colors.subtle }}>
                <Link href={browserUrl} style={{ color: colors.brand, textDecoration: 'underline' }}>
                  View this digest in the browser →
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

function KpiRow({
  label,
  value,
  change,
  hint,
  bold,
}: {
  label: string
  value: string
  change?: { text: string; sign: 'up' | 'down' | 'flat' | 'na' }
  hint?: string
  bold?: boolean
}) {
  return (
    <tr>
      <td style={{ ...tdStyle, color: colors.subtle }}>{label}</td>
      <td style={{ ...tdStyle, fontWeight: bold ? 700 : 500, fontSize: bold ? 15 : 13 }}>
        {value}
      </td>
      <td style={{ ...tdStyle, color: change ? changeColor(change.sign) : colors.subtle }}>
        {change ? change.text : hint || ''}
      </td>
    </tr>
  )
}

function MiniRow({
  label,
  value,
  extra,
  extraColor,
}: {
  label: string
  value: string
  extra?: string
  extraColor?: string
}) {
  return (
    <tr>
      <td style={{ ...tdStyle, color: colors.subtle }}>{label}</td>
      <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600, color: extraColor || colors.text }}>
        {value}
        {extra && <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 400 }}>{extra}</span>}
      </td>
    </tr>
  )
}

function changeColor(sign: 'up' | 'down' | 'flat' | 'na', invert = false): string {
  if (sign === 'na' || sign === 'flat') return colors.subtle
  const positive = invert ? sign === 'down' : sign === 'up'
  return positive ? colors.positive : colors.negative
}

function rankColor(delta: 'up' | 'down' | 'flat' | 'new'): string {
  if (delta === 'up') return colors.positive
  if (delta === 'down') return colors.negative
  if (delta === 'new') return colors.blue
  return colors.subtle
}

function rankBadge(delta: 'up' | 'down' | 'flat' | 'new', prevRank: number | null): string {
  if (delta === 'new') return '🆕 NEW'
  if (delta === 'up') return `▲ from #${prevRank}`
  if (delta === 'down') return `▼ from #${prevRank}`
  return `↔ #${prevRank}`
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
const thStyle: React.CSSProperties = {
  padding: '6px 8px',
  fontSize: 11,
  color: colors.subtle,
  textTransform: 'uppercase',
  letterSpacing: 0.5,
  borderBottom: `1px solid ${colors.border}`,
  textAlign: 'center',
}
const tdStyle: React.CSSProperties = {
  padding: '6px 8px',
  fontSize: 13,
  color: colors.text,
  borderBottom: `1px solid ${colors.border}`,
  textAlign: 'center',
}
