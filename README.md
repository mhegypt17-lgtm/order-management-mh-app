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
