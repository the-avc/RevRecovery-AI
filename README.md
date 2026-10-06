# AI Revenue Recovery Agent 🚀

> **Problem Statement:** Build an agent that detects revenue at risk, determines the right intervention, and executes a bounded recovery workflow — from payment failures and checkout abandonment to overdue receivables.

---

## Architecture

```
client/           → React 19 + Vite + TypeScript + Tailwind v4 (Dashboard UI)
server-node/      → Node.js + Express 5 + Prisma ORM (Orchestrator, Webhooks, DB)
server-python/    → Python + FastAPI (AI Engine: Gemini 2.5 Flash + Math Model + TTS)
```

**Flow:** Razorpay Webhook → Node (orchestrator) → Python AI Engine (decision) → Node (Razorpay link + DB + audit log) → Cron (scheduled follow-ups)

---

## Problem Statement Coverage

| Requirement | Implementation |
|-------------|---------------|
| Payment degradation → root cause → recovery action | `payment.failed` webhook + Gemini 2.5 Flash root-cause analysis + bounded action selection |
| Checkout drop-off recovery | `CHECKOUT_ABANDONED` failure type → immediate retry link (5% discount if >₹1000) |
| Failed-subscription recovery | `subscription.charged.failed` → `MANDATE_RETRY` (60 min delay, salary-time cron on 1st–3rd) |
| B2B receivables chaser | 3-step escalation: `B2B_REMINDER_EMAIL` → `B2B_FIRM_EMAIL` → `B2B_ESCALATION_EMAIL` (hourly cron) |
| Mandate retry sequencer | Cron: every 9am on days 1–3 of month (payroll time) |
| Hinglish voice recovery | gTTS-powered personalised Hinglish MP3 for high-value B2C (>₹50,000) |
| Promise-to-pay tracker | Gemini NLP extracts promised dates from free-text customer replies |
| Measured money recovered | Dashboard: At Risk / Recovered / Recovery Rate across batch runs |
| Stopping rules | Cancelled on `payment.captured` webhook, max 3 retries → `ABANDONED` |
| Compliant escalation | B2B email order enforced in both math model + LLM sanitizer; fraud → `NO_ACTION` always |
| Audit trail | Immutable `AuditLog` table, every event logged with actor + timestamp |

---

## Quick Start

### Prerequisites
- **Node.js v18+** and **npm**
- **Python 3.10+** and **pip**
- A free **PostgreSQL** database — [Supabase](https://supabase.com) or [Neon](https://neon.tech) (free tier)
- **Razorpay** account in test mode — [razorpay.com](https://razorpay.com) (free)
- **Google Gemini API key** — [aistudio.google.com](https://aistudio.google.com) (free)

---

### Step 1 — Clone and configure environment variables

Copy the example env files and fill in your values:

```bash
# Node server
cp server-node/.env.example server-node/.env

# Python AI engine
cp server-python/.env.example server-python/.env

# React client
cp client/.env.example client/.env
```

**`server-node/.env`**
```env
PORT=4000
RAZORPAY_KEY_ID=rzp_test_XXXXXXXXXX
RAZORPAY_KEY_SECRET=XXXXXXXXXXXXXXXXXX
RAZORPAY_WEBHOOK_SECRET=your_webhook_secret_here
DATABASE_URL=postgresql://username:password@host:5432/dbname
PYTHON_ENGINE_URL=http://localhost:8000
CLIENT_URL=http://localhost:5173
```

**`server-python/.env`**
```env
GEMINI_API_KEY=AIzaSy_xxxx
PORT=8000
ALLOWED_ORIGINS=http://localhost:4000,http://localhost:5173
```

**`client/.env`**
```env
VITE_RAZORPAY_KEY_ID=rzp_test_XXXXXXXXXX
```

> **Note:** The system works without Razorpay keys — payment links will be mocked (logged to console). Gemini is optional too — the math model handles all decisions as a deterministic fallback.

---

### Step 2 — Database Setup

```bash
cd server-node
npm install
npx prisma generate
npx prisma db push
```

To open the Prisma visual DB browser (optional):
```bash
npx prisma studio
```

---

### Step 3 — Install Python dependencies

```bash
cd server-python
pip install -r requirements.txt
```

---

### Step 4 — Install client dependencies

```bash
cd client
npm install
```

---

### Step 5 — Start all three servers (3 separate terminals)

**Terminal 1 — Python AI Engine (port 8000):**
```bash
cd server-python
python -m uvicorn main:app --reload --port 8000
```

**Terminal 2 — Node Orchestrator (port 4000):**
```bash
cd server-node
npm run dev
```

**Terminal 3 — React Dashboard (port 5173):**
```bash
cd client
npm run dev
```

Open **http://localhost:5173** 🎉

---

### Step 6 — Demo the Full Flow

1. Click **"Generate Mock Data"** → creates 50 realistic failed transactions covering all failure types
2. Click **"Run AI Recovery Batch"** → AI agent processes every transaction (math model + Gemini)
3. Watch the dashboard update live: recovery actions, probability scores, Hinglish voice clips
4. Click any transaction → see AI root-cause analysis, reasoning, and the full decision timeline
5. Download the CSV for a full dataset audit trail

---

## Razorpay Webhooks (Real-time Mode)

To receive live Razorpay webhooks on localhost:

```bash
# Install ngrok (one-time)
npm install -g ngrok
# or download from https://ngrok.com/download

# Expose port 4000
ngrok http 4000
# Note your HTTPS URL, e.g. https://abc123.ngrok-free.app
```

In **Razorpay Dashboard → Settings → Webhooks → Add New Webhook**:
- **Webhook URL:** `https://abc123.ngrok-free.app/api/webhooks/razorpay`
- **Secret:** Same value as `RAZORPAY_WEBHOOK_SECRET` in your `.env`
- **Active Events:** `payment.failed`, `payment.captured`, `payment_link.paid`, `order.paid`, `invoice.paid`, `invoice.expired`, `subscription.charged`, `subscription.charged.failed`

---

## API Endpoints Reference

### Node Server (`http://localhost:4000`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/webhooks/razorpay` | Razorpay event receiver |
| `POST` | `/api/agent/run-batch` | Trigger AI recovery on all FAILED transactions |
| `GET`  | `/api/agent/batches` | Last 20 batch runs with recovery metrics |
| `GET`  | `/api/dashboard/stats` | Totals, recovery rate, breakdowns |
| `GET`  | `/api/dashboard/transactions` | Paginated list (filter: `?status=FAILED&failureType=PAYMENT_FAILED`) |
| `GET`  | `/api/dashboard/transactions/:id` | Single transaction with actions + audit logs |
| `GET`  | `/api/dashboard/audit-logs` | Paginated audit trail (filter: `?transactionId=xxx`) |
| `POST` | `/api/payment/create-order` | Create Razorpay order (amount in paise) |
| `POST` | `/api/payment/verify-payment` | Verify payment + mark RECOVERED + cancel pending actions |
| `POST` | `/api/seed/generate` | Generate mock failed transactions (e.g. `?count=50`) |
| `GET`  | `/api/seed/download-csv` | Download generated dataset as CSV |

### Python AI Engine (`http://localhost:8000`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/analyze` | Two-stage AI decision (math model → Gemini validation) |
| `POST` | `/generate-voice` | Generate Hinglish TTS MP3 for high-value recovery |
| `POST` | `/extract-promise` | Extract promise-to-pay date from customer message |
| `GET`  | `/audio/{filename}` | Serve generated MP3 / TXT audio files |
| `GET`  | `/health` | Health check |

---

## Recovery Decision Logic (Bounded, in Precedence Order)

```
1. SUSPECTED_FRAUD or P(recovery) < 10%  → NO_ACTION  (never contact)
2. retryCount >= 3                        → NO_ACTION  (max retries, mark ABANDONED)
3. B2B + INVOICE_OVERDUE                 → Email chain:
     retryCount 0 → B2B_REMINDER_EMAIL
     retryCount 1 → B2B_FIRM_EMAIL
     retryCount 2 → B2B_ESCALATION_EMAIL
4. SUBSCRIPTION_FAILED / MANDATE_FAILED  → MANDATE_RETRY (60 min delay)
5. B2C + amount > ₹50,000 + P > 0.6     → HINGLISH_VOICE_CALL
6. GATEWAY_ERROR / SERVER_ERROR + P>0.7  → IMMEDIATE_RETRY_LINK
7. INSUFFICIENT_FUNDS / BAD_REQUEST      → DISCOUNT_OFFER 10% (>₹2000) or DELAYED_RETRY_LINK
8. CARD_EXPIRED                          → DELAYED_RETRY_LINK (24h)
9. CHECKOUT_ABANDONED                    → IMMEDIATE_RETRY_LINK (+ 5% discount if >₹1000)
```

Gemini acts as a second-opinion layer — it can override the math model with justification but always defers by default. If Gemini is unavailable, the system runs fully on the math model (no degradation in functionality).

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript, Vite 8, Tailwind CSS v4, Recharts |
| Node Backend | Node.js 18+, Express 5, TypeScript, Prisma ORM 6 |
| Python AI Engine | Python 3.10+, FastAPI 0.115, Google Gemini 2.5 Flash, gTTS |
| Database | PostgreSQL (Supabase / Neon free tier) |
| Payments | Razorpay (Test Mode — free) |
| Scheduling | node-cron (every 5 min + hourly + daily 9am on days 1–3) |
