# SellerFlow

A Chrome extension + CRM for small Nepali shop owners selling on Instagram and WhatsApp.
Save customer leads with one click. No API keys. No scraping.

---

## Setup

### 1. Backend

```bash
cd backend
npm install

# Copy env file and fill in values
cp .env.example .env
# Edit .env: set MONGODB_URI and JWT_SECRET

npm run dev
```

Backend runs at `http://localhost:5000`

Requires MongoDB running locally (`mongod`) or set `MONGODB_URI` to a MongoDB Atlas URI.

---

### 2. Dashboard

```bash
cd dashboard
npm install
npm run dev
```

Dashboard runs at `http://localhost:5173`

Open that URL in your browser to register an account and manage leads/orders.

---

### 3. Chrome Extension

1. Open Chrome and go to `chrome://extensions`
2. Enable **Developer mode** (toggle in top-right corner)
3. Click **Load unpacked**
4. Select the `extension/` folder from this project

The SellerFlow icon will appear in your Chrome toolbar.

---

## How to use

1. Start the backend and dashboard
2. Click the SellerFlow extension icon → Login with your dashboard account
3. Open `instagram.com` → go to any DM conversation
4. Click the **💾 Save Lead** button that appears in the chat header
5. Open your dashboard at `http://localhost:5173/inbox` to see the saved lead

Same flow works on `web.whatsapp.com`.

---

## Testing flow

| Step | Action |
|------|--------|
| 1 | Run `npm run dev` in both `backend/` and `dashboard/` |
| 2 | Register at `http://localhost:5173/login` |
| 3 | Load extension in Chrome |
| 4 | Login via extension popup |
| 5 | Open Instagram DM or WhatsApp chat |
| 6 | Click "Save Lead" |
| 7 | Check `/inbox` on dashboard |
| 8 | Change status, add notes, create orders |

---

## Notes on DOM selectors

Instagram and WhatsApp frequently update their web app DOM. The content scripts
(`extension/content/instagram.js` and `extension/content/whatsapp.js`) try multiple
selectors in priority order — `data-testid` first, then `aria-label`, then structural
fallbacks. If a platform update breaks detection, update the selector arrays near the
top of those files.

## Project structure

```
sellerflow/
├── extension/          Chrome extension (Manifest V3)
│   ├── manifest.json
│   ├── background.js   Service worker — handles API calls
│   ├── content/
│   │   ├── instagram.js
│   │   └── whatsapp.js
│   └── popup/
│       ├── popup.html
│       └── popup.js
├── backend/            Node.js + Express + MongoDB
│   ├── server.js
│   ├── models/
│   ├── routes/
│   └── middleware/
└── dashboard/          React + Vite
    └── src/
        ├── pages/      Login, Inbox, Orders
        └── components/ LeadCard, OrderForm
```
