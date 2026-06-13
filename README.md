# 🍽️ Restaurant WhatsApp Management System

A full-stack SaaS web application for restaurants and cafes to manage WhatsApp communications via the official **Meta WhatsApp Cloud API**.

---

## 🚀 Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14, TypeScript, Tailwind CSS, Lucide React |
| Backend | Python, FastAPI, Motor |
| Database | MongoDB |
| Real-time | Socket.io (python-socketio) |
| File Storage | Cloudinary |
| WhatsApp | Meta WhatsApp Cloud API v19.0 |
| Auth | JWT |
| Deployment | Docker + Docker Compose + Nginx |

---

## 📁 Project Structure

```
whatsapp_saas/
├── frontend/         # Next.js 14 App
├── python_backend/   # FastAPI Python Backend
├── docker-compose.yml
├── nginx.conf
└── README.md
```

---

## ⚙️ Local Development Setup

### Prerequisites
- Node.js 20+ (for Frontend)
- Python 3.10+ (for Backend)
- MongoDB (local or Atlas)
### 1. Backend Setup (Python)

```bash
cd python_backend
python -m venv venv
# Activate the virtual environment
# Windows: venv\Scripts\activate
# Mac/Linux: source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python run.py
```

Backend runs on: `http://localhost:5000`

### 2. Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

Frontend runs on: `http://localhost:3000`

---

## 🔐 Login Credentials

Default admin credentials (set in `backend/.env`):
```
Email:    admin@restaurant.com
Password: Admin@123
```

---

## 📡 WhatsApp Webhook Setup

1. Go to [Meta Developer Portal](https://developers.facebook.com)
2. Navigate to your WhatsApp Business App → Configuration → Webhooks
3. Set webhook URL: `https://your-domain.com/api/webhook`
4. Set verify token: `restaurant_webhook_verify_2024` (or your custom `WA_VERIFY_TOKEN`)
5. Subscribe to: `messages`, `message_deliveries`, `message_reads`

> **Note**: For local development, use [ngrok](https://ngrok.com) to expose your local server:
> ```bash
> ngrok http 5000
> # Then use the HTTPS URL as your webhook URL in Meta Developer Portal
> ```

---

## 🐳 Docker Deployment (Raspberry Pi / Linux)

This project is optimized for resource-constrained devices like the **Raspberry Pi** (ARM64 architecture).

### Key Architectural Optimizations:
- **Next.js Standalone Build**: The frontend compiles into a highly optimized, lightweight standalone Node.js server.
- **FastAPI Python Backend**: Fast, asynchronous, and uses very little RAM.
- **MongoDB Resource Limits**: The `docker-compose.yml` restricts MongoDB's WiredTiger cache to `0.25GB` to prevent memory exhaustion (OOM kills) on devices with limited RAM.
- **Cloudflare Tunnels**: Replaces `ngrok` for permanent, free, secure webhook exposure without port forwarding on your home router.

### Setup Instructions:

```bash
# 1. Fill in your environment variables
cp python_backend/.env.example .env.docker

# 2. Add your Cloudflare Tunnel Token to .env.docker
# CLOUDFLARE_TUNNEL_TOKEN=ey...

# 3. Start all services in the background
docker-compose up -d

# 4. Check logs
docker-compose logs -f
```

### Services Overview:
- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:5000
- **Via Nginx**: http://localhost:80
- **Cloudflare Tunnel**: Tunnels traffic securely from the internet to your Nginx/Backend for WhatsApp Webhooks.

---

## 🌐 Environment Variables

### Backend (`backend/.env`)

| Variable | Description |
|---|---|
| `MONGODB_URI` | MongoDB connection string |
| `REDIS_URL` | Redis connection string |
| `JWT_SECRET` | JWT signing secret |
| `ADMIN_EMAIL` | Admin login email |
| `ADMIN_PASSWORD` | Admin login password |
| `WA_PHONE_NUMBER_ID` | WhatsApp Phone Number ID |
| `WA_BUSINESS_ACCOUNT_ID` | WhatsApp Business Account ID |
| `WA_ACCESS_TOKEN` | Meta API access token |
| `WA_VERIFY_TOKEN` | Webhook verify token |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary cloud name |
| `CLOUDINARY_API_KEY` | Cloudinary API key |
| `CLOUDINARY_API_SECRET` | Cloudinary API secret |

### Frontend (`frontend/.env.local`)

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_API_URL` | Backend API URL |
| `NEXT_PUBLIC_SOCKET_URL` | Socket.io server URL |

---

## 📱 Features

1. **Dashboard** — KPIs, recent activity, charts
2. **WhatsApp Inbox** — Real-time chat, send text/images/PDFs
3. **Customer Management** — Tags, notes, conversation history
4. **Quick Replies** — Reusable message templates
5. **Menu Management** — Upload and send menu PDFs/images
6. **Reservation Management** — Full booking workflow
7. **Broadcast Campaigns** — Template message campaigns
8. **Customer Tags** — VIP, Regular, Vegetarian, etc.
9. **Reports** — Conversation analytics, reservation stats
10. **Settings** — WhatsApp API config, business info

---

## 📞 Your WhatsApp Credentials

```
Test Number:          +1 (555) 662-6940
Phone Number ID:      1194805713710366
Business Account ID:  983729331097527
```

> ⚠️ **Security**: Never commit your `.env` file. Keep your `WA_ACCESS_TOKEN` secret.
