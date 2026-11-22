# Order Management System (OMS)

نظام متكامل لإدارة الطلبات والعملاء وتتبع التوصيلات

## 🚀 Project Overview

Built with **Next.js 14+**, **Tailwind CSS**, and **Google Sheets** for data storage.

### Architecture
- **Frontend**: Next.js 14+ with App Router, React, Tailwind CSS
- **Backend**: Next.js API Routes
- **Database**: JSON files (local) / Google Sheets (production-ready)
- **Auth**: Session-based role management
- **Deployment**: Vercel-ready

### User Roles
- 👤 **Admin** - Product management & analytics dashboard
- 👤 **Customer Service (CS)** - Create & manage orders
- 👤 **Branch/Factory** - View orders & update delivery status

### Recovering excluded catalogue products

In **Admin > Products**, select the catalogue and enable **عرض المنتجات خارج الكتالوج**.
Search for the product, then select **إعادة لأونلاين** (Online/App) or **إضافة للكتالوج**
to restore membership. This view uses already-loaded products; it adds no database reads.
Online restoration preserves existing prices and active status. Adding to another
catalogue uses the existing Online prices as a starting point. Removing membership
requires confirmation. Excluded products must be added before editing catalogue prices.
Product edits send only changed fields; unrelated visibility, stock and active flags
are not resubmitted, and the server assigns the update timestamp.
Run the isolated recovery/save regression tests with
`node --test scripts/product-recovery.test.cjs` (mocked requests; no database writes).

### B2B branch weight changes

Branch weight previews and saves retain the CS-agreed B2B per-kg rate, derived
from the saved line price and its current weight, rather than choosing the promo
snapshot. Repeated weigh-ins use the current weight, not the original CS weight.
Other order types retain their existing snapshot pricing. B2B weight lines must
have a positive weight; invalid saved price/weight requires CS review rather
than silently substituting a catalogue price. No new columns or price queries
are required. Existing incorrectly repriced orders are not automatically repaired.
Regression tests: `node --test scripts/b2b-weight-price.test.cjs`.

### B2B agreed price per kg on CS edits

On a B2B order the CS form remembers each weight line's own price per kg (saved
unit price ÷ weight, or the price the agent typed) and uses it when the weight is
retyped, instead of the catalogue B2B price. Previously a negotiated 540/kg
turned into the catalogue 518/kg after the branch weighed the item and CS saved.
The form sends `priceEdited` for a line only when the agent typed a price,
changed the product or refreshed prices. The server refuses (409
`B2B_PRICE_LOWERED`, nothing written) a save of an existing B2B weight line whose
price per kg drops without that flag; to lower a price on purpose, type it in the
unit-price box. Raises, other order types and unit-priced lines are unaffected.
Validation errors that carry a message (this one, empty items, lock check
unavailable) are now shown to the agent. No new requests or columns. Orders
already repriced are not repaired automatically.
Tests: `node --test scripts/b2b-line-rate.test.cjs`.

### Retention page (admin) and the 1,000-row limit

PostgREST returns at most 1000 rows per request without any error, so the
retention page was only looking at the first 1000 of 1,629 customers. It now
reads every page (`src/lib/pagedRead.ts`, stable `.order()`), and no longer
downloads the customer list at all: totals are head-only counts and details are
fetched only for the customers that are in a stage. Cancelled orders are
filtered in the query.

The notification engine (`src/app/api/notifications/route.ts`) that auto-creates
stage follow-up tasks had the same 1000-row limit on customers, the 400-day
orders and the auto-follow-up tasks, so customers beyond the first 1000 were
never evaluated. It now pages all three; a failed order read yields no
follow-ups rather than marking everyone inactive. Effect: stage 3 ("task")
creates a task for each newly visible customer once (approved), then the
per-customer cooldown applies as before.

The page also shows, from the nightly `customer_intelligence_scores` (no new
calculation): segment, past spend and order count, usual order rhythm and how
late the customer is ("متأخر ×N"), churn risk, an open-complaint flag, past
spend per stage, and when the scores were last computed. Search by name/phone
and sort by days, spend, lateness or risk use a plain GET form (`?q=&sort=`).
The old 100-row display limit is gone. Logic is in `src/lib/retentionView.ts`;
the shared reads are in `src/lib/retentionData.ts`.
Tests: `node --test scripts/retention-view.test.cjs`.

### CS call queue and outcome tracking

**One-time setup:** run `data/retention-contacts-migration.sql` in Supabase (new
table `retention_contacts`). Until then the pages work but calls cannot be
logged, and say so.

- **`/orders/retention` ("اتصل بهم اليوم", CS):** a short list of inactive
  customers, ranked by value tier, then lateness against the customer's own
  order rhythm, then churn risk. Customers with an open complaint appear first
  in a separate "service call first" lane. Each card shows only what is needed
  (phone/WhatsApp, days inactive, usual gap, orders, spend, one reason tag). A
  drawer loads on demand (one request when opened): favourite products, last
  order, survey and weakest area, last complaint, wallet, B2B/status flags,
  earlier calls, and a suggested opening line.
- **Logging a call** (`POST /api/retention/contacts`): result (no answer, wrong
  number, answered, promised, ordered, not interested + required reason), optional
  offer/note/next-call date. The customer leaves the queue until the next-call
  date (defaults: 1 day no answer, 5 promised, 14 answered, 30 ordered, 90 not
  interested). A promise/answer snoozes the auto follow-up engine for that
  customer; a wrong number opts them out. Stage, days, segment and spend are
  stored with the call.
- **Rules (admin, Settings → Retention):** lowest stage that enters the queue,
  minimum past spend and calls shown per day (default stage 1, no minimum, 25).
- **`/admin/retention/outcomes`:** nothing is entered by hand. A call is a win
  when the customer places a non-cancelled order within 30 days after it (or
  before the next call to the same customer, so an order is credited once);
  younger calls are "pending". Shows contact rate, win rate and recovered revenue
  overall and by agent, stage, segment, result, refusal reason and offer, plus
  rule-based recommendations that appear only after 15 matured calls.
- Egress: the queue reads the same data as the admin page; the drawer and the
  outcomes page read only when opened; writes happen only when a call is logged.

Logic: `src/lib/retentionQueue.ts`, `src/lib/retentionDetails.ts`. Tests:
`node --test scripts/retention-queue.test.cjs`.

### Area name on the branch order screen

The branch order page shows a "المنطقة" row (area, plus sub-area when present,
e.g. "التجمع الخامس - التجمع") above the address, and the WhatsApp dispatch
message includes a "🏘️ المنطقة" line. Addresses with no area show "-" on the
page and the line is left out of the message. The data already comes with the
order, so there are no extra requests. Tests:
`node --test scripts/branch-area-name.test.cjs`.

### Branch order lines stay in sync with CS edits

A CS save keeps the id of every line that already existed (new lines get new
ids), so a screen holding the old ids can still match its lines. The branch
order screen reconciles its lines with the server on focus and after each
status/comment save: lines CS changed take the fresh quantity/weight and are
listed in a dismissible notice; lines CS did not change keep the branch
worker's unsaved draft. Saving line edits sends the quantity/weight the screen
believes is saved; if CS changed a line the branch edited, the server refuses
with `ORDER_CHANGED` (409) and writes nothing, and lines the branch did not
touch are never written. No extra requests: the refresh reuses the existing
focus/visibility trigger. Tests (mocked, no database writes):
`node --test scripts/order-line-sync.test.cjs`.

### Branch alert when CS edits a ready order

If CS (or an admin) changes lines of an order whose delivery status is جاهز or
في الطريق, the branch gets an urgent bell alert ("✏️ خدمة العملاء عدّلت طلباً
جاهزاً") naming the order and the change (e.g. "لحم مفروم: الكمية 1 → 2"), linking
to the branch order screen; admin sees it too, CS does not. Nothing extra is
read or written: the line-level diff (quantity, weight, price, added/removed)
is added to the `edit_history` row the save already writes
(`details.lateEdit = true`, `source: 'cs'`), and the bell's existing history
query gets one extra filter (`or=action.eq.status_changed,details->>lateEdit.eq.true`).
The status comes from the lock lookup CS saves already do; an admin save reads it
only if a line actually changed. The order history page shows these changes too.
Saves before the order is ready, or with no line change, are not flagged. Origin:
order 131126online1 (a quantity raised after the branch issued the receipt).
Logic: `src/lib/lateEdit.ts`. Tests: `node --test scripts/late-edit-alert.test.cjs`.

### Complaint notifications (branch)

For branch users, complaint notifications (new ticket, SLA breach, new comment)
link to `/branch/complaints?complaintId=<id>`, and that page opens the ticket
directly. The id comes from the complaint row the notification is built from and
the page uses its normal list load, so there is no extra query. If the ticket is
not in the list the page already holds, it reloads the list once; if it is still
missing (older than the 90-day window) it shows a notice. CS and admin links are
unchanged. Tests (mocked, no database access):
`node --test scripts/branch-complaint-deeplink.test.cjs`.

### Targeted products month

Targeted-product units are counted in the Cairo calendar month in which the
branch marked the order "تم التوصيل" (`order_delivery.deliveredAt`), not the
month it was placed: an order placed 31 Oct and delivered 1 Nov counts toward
November. Only delivered orders count; cancelled (لاغي) orders never do, and an
order that merely has status "تم" without a branch delivery does not count.
The route reads the month's deliveries (3 small columns) and then only those
orders, so there is no extra egress. Tests (mocked, fixed clock, no database
writes): `node --test scripts/targeted-stats-delivery-month.test.cjs`.

### Order save safety

A full order save must carry its item list: a save with no items (or none that
match a product) is refused with `EMPTY_ITEMS` and changes nothing. The narrow
"attachments / notes / payment method" save (`attachmentsOnly`) is always
handled as a narrow save and can never fall through to a full save, even if the
delivery-lock lookup returns nothing. If the lock lookup itself fails, a full
save is refused (503) instead of being treated as unlocked. Tests (mocked, no
database writes): `node --test scripts/order-save-safety.test.cjs`.

---

## 📋 Phase Roadmap

| Phase | Focus | Status |
|-------|-------|--------|
| **1** | Foundation & Setup | ✅ ACTIVE |
| **2** | Customer Database & Order Creation | ⏳ Next |
| **3** | Branch & Delivery Module | 🔄 Planned |
| **4** | Management Dashboard & Reports | 🔄 Planned |
| **5** | Polish, Testing & Deployment | 🔄 Planned |

---

## 🛠️ Phase 1: Foundation & Setup

### What's Included ✅
- ✅ Next.js 14+ with RTL Arabic layout
- ✅ Tailwind CSS configured for RTL (dir="rtl")
- ✅ Supabase Auth integration (demo users)
- ✅ Role-based route protection
- ✅ Product Catalog CRUD (/admin/products)
- ✅ Demo data with 2 sample products
- ✅ Responsive design for desktop & tablet

### Demo Credentials

```
Admin:
  Email: admin@example.com
  Password: 123456

Customer Service:
  Email: cs@example.com
  Password: 123456

Branch:
  Email: branch@example.com
  Password: 123456
```

---

## 📦 Installation & Setup

### Prerequisites
- Node.js 16+ installed
- npm or yarn

### Quick Start

```bash
# 1. Clone the repository
git clone <your-github-url>
cd "Order Management MH APP"

# 2. Install dependencies
npm install

# 3. Set up environment variables
cp .env.local.example .env.local
# Edit .env.local with your Google Sheets credentials (optional for Phase 1)

# 4. Run development server
npm run dev

# 5. Open in browser
# http://localhost:3000
```

### Development Commands

```bash
# Start dev server
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Run linter
npm run lint
```

---

## 📁 Project Structure

```
Order Management MH APP/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   └── products/        # Product CRUD API
│   │   ├── admin/
│   │   │   ├── products/        # Product Catalog page
│   │   │   └── layout.tsx       # Admin protected layout
│   │   ├── orders/              # CS order management (Phase 2)
│   │   ├── branch/              # Branch delivery (Phase 3)
│   │   ├── dashboard/           # Admin reports (Phase 4)
│   │   ├── layout.tsx           # Root layout (RTL)
│   │   ├── globals.css          # Global styles
│   │   └── page.tsx             # Login page
│   ├── components/
│   │   └── Navbar.tsx           # Navigation component
│   └── lib/
│       ├── auth.ts              # Auth store (Zustand)
│       └── googleSheets.ts      # Google Sheets integration
├── data/
│   └── products.json            # Local data file
├── public/                      # Static assets
├── .env.local.example           # Environment template
├── .gitignore
├── package.json
├── tsconfig.json
├── tailwind.config.js
├── postcss.config.js
├── next.config.js
└── README.md
```

---

## 🔐 Authentication

### How It Works
1. User logs in with email/password
2. Role stored in Zustand state store (persisted in localStorage)
3. Route middleware checks user role
4. Redirect to role-specific dashboard

### Role-Based Redirects
- `admin` → `/admin/products`
- `cs` → `/orders`
- `branch` → `/branch`

### Protected Routes
All pages require authentication. Unauthorized access redirects to login.

---

## 📦 Product Catalog (Phase 1)

### Admin can:
✅ Add new products with:
- Product name (required)
- Description
- Weight (grams)
- Base price (required)
- Offer price (optional)
- Product condition (Fresh/Chilled)
- Active/Inactive toggle

✅ Edit existing products
✅ Delete products
✅ Search by product name
✅ Toggle product active status

### Data Storage
- **Phase 1**: JSON file (`/data/products.json`)
- **Phase 2+**: Ready for Google Sheets integration

---

## 🌍 RTL (Arabic) Support

The app is fully configured for RTL:
- ✅ `dir="rtl"` on HTML element
- ✅ Tailwind CSS `direction: rtl` in CSS
- ✅ Input fields with `dir="rtl"` for text inputs
- ✅ Numbers remain LTR within RTL context
- ✅ All labels in Arabic

---

## 📱 Responsive Design

Tested and optimized for:
- 💻 Desktop (1920×1080, 1366×768)
- 📱 Tablet (iPad 768×1024)
- 📱 Mobile (320px+)

---

## 🚀 Ready for Phases 2-5

The foundation is ready for:

### Phase 2: Customer Database & Order Creation
- Customer phone lookup
- Multi-address management
- Order form with line items
- Auto-generated order numbers

### Phase 3: Branch & Delivery
- Delivery status tracking
- Photo uploads
- Real-time updates

### Phase 4: Management Dashboard
- KPI metrics
- Sales charts & analytics
- Agent performance reports

### Phase 5: Polish & Deployment
- Edit history logging
- Toast notifications
- Deployment to Vercel

---

## 📝 Google Sheets Integration (Optional)

To connect to Google Sheets (for later phases):

1. Create a Google Service Account
2. Share your Google Sheet with the service account email
3. Add credentials to `.env.local`:
   ```
   NEXT_PUBLIC_GOOGLE_SHEET_ID=your_sheet_id
   GOOGLE_SERVICE_ACCOUNT_EMAIL=your_email@iam.gserviceaccount.com
   GOOGLE_PRIVATE_KEY=your_private_key
   ```

---

## 🎯 Next Steps (Phase 2)

After Phase 1 approval:
1. ✅ Implement Customer Database
2. ✅ Build Order Creation Form
3. ✅ Add line-item CRUD
4. ✅ Implement auto-generated order numbers

---

## 🛡️ Security Notes

- Credentials are in `.env.local` (never commit)
- Role-based route protection on all pages
- Input validation on all forms
- CORS headers ready for API calls

---

## 📚 Technologies Used

- **Next.js 14** - React framework
- **Tailwind CSS** - Styling & RTL support
- **Zustand** - State management
- **React Hot Toast** - Toast notifications
- **Google Spreadsheet SDK** - Google Sheets integration (optional)
- **TypeScript** - Type safety

---

## 🐛 Troubleshooting

### Port 3000 already in use?
```bash
npm run dev -- -p 3001
```

### Clear Next.js cache
```bash
rm -rf .next
npm run dev
```

### Node modules issues
```bash
rm -rf node_modules
npm install
```

---

## 📞 Support

For questions or issues, refer to the OMS_Vibe_Coding_Phases document or contact the development team.

---

## 📄 License

Internal use only - Sherif El Touny

---

**Version**: 1.0 (Phase 1)
**Last Updated**: May 4, 2026
