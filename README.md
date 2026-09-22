# AI Revenue Recovery Agent 🚀

> **Razorpay Hackathon — "AI Revenue Recovery"**
> 
> Detects revenue at risk, diagnoses the root cause using AI, and executes bounded recovery workflows — from payment failures to B2B receivables.

---

## Architecture

```
client/           → React + Vite + TypeScript (Dashboard UI)
server-node/      → Node.js + Express (Orchestrator, Razorpay Webhooks)
server-python/    → Python + FastAPI (AI/ML Engine: Gemini + Math Model + TTS)
```

## What it Does (Hackathon Problem Statement Coverage)

| Feature | Implementation |
|---------|---------------|
| Payment degradation → root cause → action | Razorpay webhook + Gemini LLM root cause analysis |
| Checkout drop-off recovery | `CHECKOUT_ABANDONED` failure type + immediate retry link |
| Failed-subscription recovery | `subscription.charged.failed` webhook + mandate retry |
| B2B receivables chaser | Escalation chain: polite → firm → escalate (3-step cron) |
| Mandate retry sequencer | Cron job retries at month start (payroll time) |
| Hinglish voice recovery | gTTS-powered personalized Hinglish MP3 generation |
| Promise-to-pay tracker | Gemini NLP extracts promised dates from customer replies |
| Measured money recovered | Dashboard shows `At Risk / Recovered / Recovery Rate` |
| Stopping rules | Cancelled on `payment.paid` webhook, max 3 retries |
| Audit trail | Immutable `AuditLog` table, viewable on dashboard |

---

## Quick Start

### Prerequisites
- Node.js v18+, Python 3.10+
- A free PostgreSQL database (Supabase or Neon)
- Razorpay account (test mode, free)
- Google Gemini API key (free)

### 1. Configure Environment Variables

**`client/.env`** (copy from `.env.example`):
```env
VITE_RAZORPAY_KEY_ID=rzp_test_xxxx
```

**`server-node/.env`** (copy from `.env.example`):
```env
PORT=4000
RAZORPAY_KEY_ID=rzp_test_xxxx
RAZORPAY_KEY_SECRET=xxxx
RAZORPAY_WEBHOOK_SECRET=xxxx
DATABASE_URL=postgresql://user:pass@host:5432/dbname
PYTHON_ENGINE_URL=http://localhost:8000
CLIENT_URL=http://localhost:5173
```

**`server-python/.env`** (copy from `.env.example`):
```env
GEMINI_API_KEY=AIzaSy_xxxx
PORT=8000
ALLOWED_ORIGINS=http://localhost:4000,http://localhost:5173
```

### 2. Database Setup
```bash
cd server-node
npm run db:generate
npm run db:push
```

### 3. Install Python Dependencies
```bash
cd server-python
pip install -r requirements.txt
```

### 4. Start All Three Servers

**Terminal 1 — Python AI Engine:**
```bash
cd server-python
python -m uvicorn main:app --reload --port 8000
```

**Terminal 2 — Node Orchestrator:**
```bash
cd server-node
npm run dev
```

**Terminal 3 — React Dashboard:**
```bash
cd client
npm run dev
```

Open **http://localhost:5173** 🎉

### 5. Demo the Full Flow
1. Click **"Generate Mock Data"** — creates 50 failed transactions
2. Click **"Run AI Recovery Batch"** — AI agent processes every transaction
3. Watch the dashboard update with recovery actions, audit logs, and probability scores
4. Click any transaction to see the AI's root cause analysis and decision timeline

---

## Razorpay Webhooks (Real-time Mode)

To receive live webhooks locally:
```bash
# Install ngrok
ngrok http 4000
# Copy the HTTPS URL e.g. https://abc123.ngrok.io
```

In Razorpay Dashboard → Settings → Webhooks:
- URL: `https://abc123.ngrok.io/api/webhooks/razorpay`
- Events: `payment.failed`, `payment.captured`, `subscription.charged.failed`, `invoice.expired`

---

## Tech Stack
- **Frontend:** React 18, TypeScript, Vite, Tailwind CSS v4, Recharts
- **Backend:** Node.js, Express, TypeScript, Prisma ORM
- **AI Engine:** Python 3.13, FastAPI, Google Gemini 1.5 Flash, gTTS, NumPy
- **Database:** PostgreSQL (Supabase/Neon free tier)
- **Payments:** Razorpay (Test Mode — free)
