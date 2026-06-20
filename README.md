# 💬 RestoChat — Restaurant WhatsApp Marketing Solution

A full-stack, self-hosted SaaS application for restaurants and cafes to manage WhatsApp communications via the official **Meta WhatsApp Cloud API**. Deploy on a client's PC using Docker — no cloud server required.

---

## 🚀 Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14, TypeScript, Tailwind CSS, Lucide React, PWA |
| Backend | Python 3.10+, FastAPI, Motor (async MongoDB driver) |
| Database | MongoDB 7 |
| Real-time | Socket.io (python-socketio) |
| Rate Limiting | SlowAPI |
| File Storage | Cloudinary |
| WhatsApp | Meta WhatsApp Cloud API v19.0 |
| Auth | JWT (python-jose) + bcrypt |
| Deployment | Docker + Docker Compose + Nginx + Cloudflare Tunnel |

---

## 📁 Project Structure

```
whatsapp_marketing_solution/
├── frontend/                  # Next.js 14 PWA
│   ├── src/
│   │   ├── app/               # App Router pages
│   │   ├── components/        # Sidebar, TopHeader
│   │   ├── lib/               # API client, socket, stores, hooks
│   │   └── middleware.ts      # Server-side auth route protection
│   ├── .env.local.example
│   └── Dockerfile
├── python_backend/            # FastAPI backend
│   ├── app/
│   │   ├── routes/            # auth, webhook, conversations, broadcasts, ...
│   │   ├── models/            # Pydantic models
│   │   ├── utils/             # auth helpers, phone normalization
│   │   ├── config.py          # Settings (pydantic-settings)
│   │   ├── database.py        # Motor MongoDB connection
│   │   ├── limiter.py         # SlowAPI rate limiter
│   │   ├── socket.py          # Socket.io server
│   │   └── main.py            # FastAPI app + health endpoint
│   ├── .env.example
│   └── Dockerfile
├── docker-compose.yml
├── nginx.conf
├── setup.bat                  # One-click pendrive installer (Windows)
├── autostart.bat              # Boot auto-start script
├── start.bat                  # Manual start
├── stop.bat                   # Manual stop
└── README_PENDRIVE.txt        # Plain-English client guide
```

---

## 📱 Features

| # | Feature | Description |
|---|---------|-------------|
| 1 | **Dashboard** | KPIs, recent activity, message charts |
| 2 | **WhatsApp Inbox** | Real-time chat via Socket.io, send text & templates |
| 3 | **Customer Management** | Tags, notes, conversation history |
| 4 | **Quick Replies** | Reusable message templates |
| 5 | **Menu Management** | Upload and send menu PDFs/images |
| 6 | **Reservation Management** | Full booking workflow |
| 7 | **Broadcast Campaigns** | Send template messages to tagged audiences — runs in background (no timeout) |
| 8 | **Reports** | Conversation analytics, reservation stats |
| 9 | **Settings** | WhatsApp API config, test connection, business info |
| 10 | **PWA Splash Screen** | Boot-aware loading screen with live Backend + MongoDB status |

---

## ⚙️ Local Development Setup

### Prerequisites
- Node.js 20+
- Python 3.10+
- MongoDB (local or Atlas)
- Docker Desktop (for production deployment)

### 1. Backend Setup

```bash
cd python_backend

# Create and activate virtual environment
python -m venv venv
venv\Scripts\activate          # Windows
# source venv/bin/activate     # Mac/Linux

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env and fill in your WhatsApp credentials

# Run the server
python run.py
```

Backend runs on: `http://localhost:5000`

### 2. Frontend Setup

```bash
cd frontend
cp .env.local.example .env.local
npm install
npm run dev
```

Frontend runs on: `http://localhost:3000`

---

## 🐳 Docker Deployment (Client PC / Raspberry Pi)

This project is optimized for self-hosted deployment on client PCs and resource-constrained devices.

### Key Optimizations
- **Next.js Standalone Build** — lightweight Node.js server output
- **FastAPI + Motor** — fully async, low memory footprint
- **MongoDB WiredTiger cache limit** — set to `0.25 GB` to prevent OOM on low-RAM devices
- **Cloudflare Tunnel** — free, permanent HTTPS tunnel for WhatsApp webhooks (no port forwarding needed)
- **`restart: unless-stopped`** — all containers auto-restart after a reboot

### Quick Start

```bash
# 1. Copy and fill in environment variables
cp python_backend/.env.example python_backend/.env

# 2. Start all services
docker-compose up -d --build

# 3. Open the app
start http://localhost:3000

# 4. Check logs
docker-compose logs -f
```

### Services

| Service | URL |
|---------|-----|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:5000 |
| Health Check | http://localhost:5000/api/health |
| Via Nginx | http://localhost:80 |
| Cloudflare Tunnel | Your public HTTPS URL |

---

## 💾 Pendrive Deployment (Client PC Setup)

Deploy to a new client PC in ~30 minutes using the included scripts.

### What is Required (Prerequisites)
Before you paste the folder on the client's PC, you **must** ensure the following:
1. **Docker Desktop Installer**: You must download the `Docker Desktop Installer.exe` from [docker.com](https://www.docker.com/products/docker-desktop/) and place it inside the `installers/` folder on your pendrive. The setup script will automatically install it on the client PC.
2. **Cloudflare Tunnel (Optional but Recommended)**: To receive live WhatsApp messages, the client PC needs a public URL. You will need to install `cloudflared` or ngrok to expose port 5000 securely.

### Pendrive Contents
Your pendrive should look exactly like this before plugging it into the client's PC:
```
📁 RestoChat-Setup/
├── 📁 app/                     ← Full cloned repo
├── 📁 installers/
│   └── DockerDesktopInstaller.exe  ← YOU MUST DOWNLOAD THIS MANUALLY AND PLACE IT HERE
├── setup.bat                   ← Run this first (as Administrator)
├── start.bat
├── stop.bat
└── README_PENDRIVE.txt
```

### Setup Steps
1. Copy the `RestoChat-Setup` folder from your pendrive to the client PC's Desktop.
2. Right-click `setup.bat` → **Run as Administrator**
3. Follow the prompts (restaurant name, WhatsApp credentials)
5. The script will:
   - Install Docker if missing
   - Copy app to `C:\RestoChat`
   - Generate `.env` with a random JWT secret
   - Register auto-start in Windows Task Scheduler
   - Run `docker-compose up -d --build`
6. Open `http://localhost:3000` → register the admin account
7. Set up Cloudflare Tunnel for the webhook URL
8. Install the PWA from the browser

### Auto-Start on Boot
`setup.bat` registers `autostart.bat` in Windows Task Scheduler to run on every login.  
It waits 35 seconds for Docker Desktop to initialise, then runs `docker-compose up -d`.

> **Tip**: Enable **"Start Docker Desktop when you log in"** in Docker Desktop Settings for the smoothest experience.

---

## 📡 WhatsApp Webhook Setup

1. Go to [Meta Developer Portal](https://developers.facebook.com)
2. Navigate to: **Your App → WhatsApp → Configuration → Webhooks**
3. Set **Webhook URL**: `https://your-cloudflare-tunnel-domain.com/api/webhook`
4. Set **Verify Token**: same value as `WA_VERIFY_TOKEN` in your `.env`
5. Subscribe to: `messages`, `message_deliveries`, `message_reads`
6. *(Optional but recommended)* Copy your **App Secret** from App Settings → Basic → App Secret into `WA_APP_SECRET` in `.env` to enable webhook signature verification

> **For local dev**: Use [ngrok](https://ngrok.com) or [Cloudflare Quick Tunnels](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/do-more-with-tunnels/trycloudflare/) to expose port 5000.

---

## 🌐 Environment Variables

### Backend — `python_backend/.env`

| Variable | Required | Description |
|----------|----------|-------------|
| `MONGODB_URI` | ✅ | MongoDB connection string |
| `DB_NAME` | ✅ | Database name (default: `resto_chat`) |
| `JWT_SECRET` | ✅ | Strong random string for JWT signing |
| `WA_PHONE_NUMBER_ID` | ✅ | WhatsApp Phone Number ID |
| `WA_BUSINESS_ACCOUNT_ID` | ✅ | WhatsApp Business Account ID |
| `WA_ACCESS_TOKEN` | ✅ | Meta API permanent access token |
| `WA_VERIFY_TOKEN` | ✅ | Your custom webhook verify password |
| `WA_APP_SECRET` | ⭐ Recommended | App Secret for webhook signature verification |
| `CLOUDINARY_CLOUD_NAME` | Optional | For image/file uploads |
| `CLOUDINARY_API_KEY` | Optional | Cloudinary API key |
| `CLOUDINARY_API_SECRET` | Optional | Cloudinary API secret |

> Generate a strong JWT secret: `python -c "import secrets; print(secrets.token_hex(32))"`

### Frontend — `frontend/.env.local`

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_API_URL` | Backend URL (default: `http://localhost:5000`) |
| `NEXT_PUBLIC_SOCKET_URL` | Socket.io URL (same as API URL) |

---

## 🔐 First Login

On first run, no users exist. Open `http://localhost:3000` and register your admin account.  
Registration is automatically **disabled after the first user** is created (single-tenant design).

> ⚠️ There are no hardcoded default credentials. You create your own on first run.

---

## 🔒 Security Features

| Feature | Detail |
|---------|--------|
| **Webhook Signature Verification** | HMAC-SHA256 validation of every incoming webhook (requires `WA_APP_SECRET`) |
| **Rate Limiting** | Login: 10 req/min · Register: 5 req/min (SlowAPI) |
| **JWT Auth** | 7-day tokens, verified on every API request |
| **CORS** | Restricted to `localhost:3000` origins only |
| **Server-side Route Protection** | Next.js middleware redirects unauthenticated users |
| **Password Hashing** | bcrypt via passlib |
| **Cookie-based Auth Sync** | Token stored in HttpOnly-compatible cookie for SSR middleware |

---

## 🏗️ Architecture Notes

### Broadcast Campaigns
Broadcasts run as **FastAPI BackgroundTasks** — the HTTP response returns immediately with a `"sending"` status, and the actual message delivery loop runs in the background. This prevents HTTP timeouts for large audiences. Final status is `sent`, `partial`, or `failed`.

### Real-time Messaging
Socket.io rooms are keyed by `conversationId`. The frontend joins a room when opening a chat; the backend emits `message:new` and `conversation:updated` events on every inbound or outbound message.

### Message Pagination
Messages endpoint supports `page` and `page_size` query params (default: page 1, 50 messages). Response includes `total`, `has_more` for infinite scroll.

### PWA Splash Screen
The root page (`/`) polls `/api/health` which pings MongoDB. The splash screen shows live **Backend** and **MongoDB** status indicators and only navigates to the app once both services are healthy.

### Meta Webhook Retry Behaviour
Meta retries failed webhook deliveries for **up to 72 hours** with exponential backoff. If your server is offline (e.g. PC shut down), messages will be delivered when you come back online — as long as downtime is under 72 hours.

---

## 🐛 Development Tips

### Mock Mode
Set `WA_ACCESS_TOKEN=test_token` in your `.env` to enable mock mode. All WhatsApp API calls are simulated — no real messages are sent. Useful for local development without real credentials.

### Health Check
```
GET http://localhost:5000/api/health
→ { "status": "ok", "db": "ok", "timestamp": "..." }
```

### Useful Docker Commands
```bash
docker-compose up -d          # Start all services (background)
docker-compose down           # Stop all services
docker-compose logs -f        # Follow logs
docker-compose ps             # Check container status
docker-compose restart        # Restart all containers
```

---

## 📁 Key Files Reference

| File | Purpose |
|------|---------|
| `python_backend/app/main.py` | FastAPI app, CORS, health endpoint |
| `python_backend/app/limiter.py` | Shared SlowAPI rate limiter |
| `python_backend/app/routes/webhook.py` | Incoming WhatsApp messages & signature verification |
| `python_backend/app/routes/broadcasts.py` | Background broadcast task |
| `python_backend/app/routes/conversations.py` | Paginated messages, send text/template |
| `python_backend/app/utils/phone.py` | Indian phone number normalisation |
| `frontend/src/app/page.tsx` | PWA splash screen with health polling |
| `frontend/src/middleware.ts` | Next.js server-side auth guard |
| `frontend/src/components/Sidebar.tsx` | Dynamic WhatsApp connection status |
| `frontend/src/lib/store/authStore.ts` | Zustand auth store + cookie sync |
| `setup.bat` | Full pendrive installer for client PCs |
| `autostart.bat` | Windows Task Scheduler boot script |

---

> ⚠️ **Security Reminder**: Never commit your `.env` file. Keep `WA_ACCESS_TOKEN` and `WA_APP_SECRET` private. Rotate them immediately if exposed.
