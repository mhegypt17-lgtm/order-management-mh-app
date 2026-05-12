# 🚀 Order Management System - Phase 1 Setup Instructions

## Prerequisites

Before starting, make sure you have:

1. **Node.js 16+** - [Download here](https://nodejs.org/)
2. **Git** (optional, for version control)
3. **A code editor** (VS Code recommended)

## ✅ Step-by-Step Setup

### Step 1: Install Node.js

1. Go to [nodejs.org](https://nodejs.org/)
2. Download **LTS version** (recommended)
3. Run the installer and follow the prompts
4. **Important**: After installation, close and reopen your terminal/PowerShell for changes to take effect

**Verify installation:**
```bash
node --version
npm --version
```

---

### Step 2: Navigate to Project Folder

Open your terminal/PowerShell and navigate to the project:

```bash
cd "c:\Users\sheltoni\OneDrive - Microsoft\Vibe Coding ST\Order Management MH APP"
```

---

### Step 3: Install Dependencies

Run the following command to install all required packages:

```bash
npm install
```

This will create a `node_modules` folder with all dependencies. ⏳ This may take 2-5 minutes.

---

### Step 4: Start the Development Server

Once installation is complete, start the app:

```bash
npm run dev
```

You should see output like:
```
▲ Next.js 14.x.x
- Local:        http://localhost:3000
- Environments: .env.local

✓ Ready in 2.5s
```

---

### Step 5: Open in Browser

1. Open your browser
2. Go to **http://localhost:3000**
3. You should see the login page!

---

## 🔐 Demo Credentials

Use any of these accounts to test different roles:

### Admin (Product Management)
```
Email: admin@example.com
Password: 123456
```

### Customer Service (Orders)
```
Email: cs@example.com
Password: 123456
```

### Branch/Factory (Delivery)
```
Email: branch@example.com
Password: 123456
```

---

## 🚀 Quick Start Scripts

### Option A: Windows Batch Script
```bash
setup.bat
```

### Option B: PowerShell Script
```bash
powershell -ExecutionPolicy Bypass -File setup.ps1
```

### Option C: Manual Commands
```bash
npm install
npm run dev
```

---

## 📁 Project Structure

```
Order Management MH APP/
├── src/
│   ├── app/              # Next.js app pages
│   ├── components/       # Reusable components
│   ├── lib/             # Utilities & stores
│   └── data/            # Local JSON data
├── public/              # Static files
├── package.json         # Dependencies
├── tailwind.config.js   # Tailwind config
└── README.md            # Full documentation
```

---

## 🛠️ Available Commands

```bash
# Start development server
npm run dev

# Build for production
npm build

# Start production server
npm start

# Run linter (check code quality)
npm run lint
```

---

## ✅ Phase 1 Features

Once running, you can:

✅ **Login** with role-based credentials
✅ **Admin Dashboard**: Manage product catalog
  - View all products
  - Add new products
  - Edit existing products
  - Delete products
  - Search by name
  - Toggle active/inactive

✅ **Placeholder Pages** for future phases
  - Orders page (Phase 2)
  - Branch page (Phase 3)
  - Dashboard page (Phase 4)

---

## 🐛 Troubleshooting

### Issue: "npm is not recognized"

**Solution**: Node.js may not be properly installed or the PATH isn't updated.
1. Restart your terminal/PowerShell completely
2. Run `node --version` to verify
3. If still not working, reinstall Node.js

---

### Issue: "Port 3000 already in use"

**Solution**: Run on a different port:
```bash
npm run dev -- -p 3001
```
Then visit: http://localhost:3001

---

### Issue: "Cannot find module..."

**Solution**: Reinstall dependencies:
```bash
rm -r node_modules
npm install
```

---

### Issue: "Next.js build fails"

**Solution**: Clear the cache:
```bash
rm -r .next
npm run dev
```

---

## 📱 Testing the App

### Test Login
1. Go to http://localhost:3000
2. Use one of the demo credentials
3. Click "تسجيل الدخول" (Login)
4. You should be redirected based on your role

### Test Product Catalog (Admin only)
1. Login as admin@example.com
2. Click "📦 المنتجات" (Products) in the navbar
3. Try:
   - ✅ View 2 default products
   - ✅ Search for "تمر" (date)
   - ✅ Add a new product
   - ✅ Edit a product
   - ✅ Toggle active status
   - ✅ Delete a product

---

## 🌍 Arabic RTL Support

The app is fully configured for right-to-left (RTL) Arabic:
- ✅ All text is right-aligned
- ✅ Input fields support Arabic typing
- ✅ Buttons and forms are RTL-optimized
- ✅ Numbers remain left-to-right for readability

---

## 📊 Next Phase (Phase 2)

After this phase is tested and approved, we'll build:
- Customer database with phone lookup
- Order creation form with line items
- Multi-address management
- Auto-generated order numbers

---

## 📞 Support

If you encounter any issues:
1. Check the troubleshooting section above
2. Review the full README.md
3. Check the console output for error messages

---

## 📝 Environment Variables

The app comes with a template file: `.env.local.example`

For Phase 1, no environment variables are required. The app works with demo data by default.

For later phases (Google Sheets integration), you'll need to add:
```
NEXT_PUBLIC_GOOGLE_SHEET_ID=your_sheet_id
GOOGLE_SERVICE_ACCOUNT_EMAIL=your_email
GOOGLE_PRIVATE_KEY=your_key
```

---

**Phase 1 Status**: ✅ READY FOR TESTING

Once you approve Phase 1, we'll proceed to Phase 2! 🚀
