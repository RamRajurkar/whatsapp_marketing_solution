# 🚀 RestoChat Deployment & Operations Guide

This document describes the offline-first pendrive installation process, Docker service configurations, Windows task scheduling startup, and setup steps required to deploy **RestoChat** at client sites.

---

## 💾 Pendrive-Based Client Site Deployment

To deploy RestoChat on a client's local PC without cloning from Git or configuring development tools manually, the project includes automated setup files designed to run from a USB pendrive.

### 📁 USB Pendrive Directory Structure
Your installation pendrive must be structured as follows:
```
📁 RestoChat-Setup/
├── 📁 app/                         ← Cloned repository files
├── 📁 installers/
│   └── DockerDesktopInstaller.exe  ← Manual download from docker.com/products/docker-desktop
├── setup.bat                       ← Double-click installer (Run as Administrator)
├── start.bat                       ← Start script
├── stop.bat                        ← Stop script
└── README_PENDRIVE.txt             ← Client operations guide
```

---

## 🛠️ Step-by-Step Installation Flow

### Step 1: File Copying & Environment Extraction
1. Copy the `RestoChat-Setup` directory from the USB drive to the target client PC (preferably to the `Desktop` or `C:\` partition).
2. Right-click `setup.bat` and select **Run as Administrator**.
3. The script verifies administrative rights. If missing, it halts with an instructions warning.
4. The script copies the core application folder to `C:\RestoChat`.

### Step 2: Docker Automated Check & Installation
1. The setup script checks if the Docker CLI is installed.
2. If Docker is missing:
    * It checks for `installers\DockerDesktopInstaller.exe` on the pendrive.
    * If found, it runs the installer in quiet mode (`install --quiet`) and prompts for a system reboot.
    * If missing, it provides a download link, halts execution, and instructs the installer to run Docker manually.
3. If Docker is present but closed, the script starts the Docker daemon service (`C:\Program Files\Docker\Docker\Docker Desktop.exe`) and polls for 30 seconds until the daemon is active.

### Step 3: Interactive Configuration & Configuration Generation
The script prompts the user for local business credentials:
*   **Restaurant Name** (e.g. *Spice Garden*)
*   **WhatsApp Phone Number ID** (From Meta Developer Portal)
*   **WhatsApp Business Account ID** (From Meta Developer Portal)
*   **WhatsApp System User Access Token** (Permanent token from Meta Business Manager)
*   **Webhook Verify Token** (A secure password phrase created by the installer)
*   **WhatsApp App Secret** (Optional, used to verify incoming webhook signatures)

The script automatically generates a cryptographically secure 128-character JWT secret and writes all configurations directly to the local backend configuration file:
`C:\RestoChat\python_backend\.env`.

### Step 4: Automating Startup on Windows Login
To ensure the system boots automatically if the client's PC restarts:
1. `setup.bat` registers `autostart.bat` inside the **Windows Task Scheduler** using the command line:
   ```cmd
   schtasks /create /tn "RestoChat AutoStart" /tr "C:\RestoChat\autostart.bat" /sc onlogon /ru "%USERNAME%" /rl highest /f
   ```
2. The task is configured to trigger on user login with elevated privileges (`highest`).

---

## 🕒 Windows Boot Orchestration & Smart Polling

Because Docker Desktop can take some time to boot on average client computers, a simple startup script could run before Docker is ready, leading to startup failures.

To address this, both `autostart.bat` and `start.bat` run a polling loop:
1. They check if Docker is running using `docker info`.
2. If inactive, they attempt to launch Docker Desktop and initiate a loop:
   ```cmd
   :wait_docker
   docker info >nul 2>&1
   if %errorlevel% equ 0 goto docker_ready
   set /a RETRY+=1
   if %RETRY% geq %MAX_RETRIES% (
       echo [ERROR] Docker Desktop failed to start.
       exit /b 1
   )
   timeout /t 5 /nobreak >nul
   goto wait_docker
   ```
3. The script polls every 5 seconds for up to 2 minutes (24 retries).
4. Once Docker returns a success code, it runs `docker-compose up -d` to boot the application containers.

---

## 🌐 Webhook Tunneling (Cloudflare Tunnel)

To receive webhooks from Meta's API without setting up port forwarding on the restaurant's router or purchasing a static public IP:
1. The stack includes a `cloudflared` service in `docker-compose.yml`.
2. The user registers a free tunnel in their Cloudflare Dashboard and copies the **Tunnel Token**.
3. Provide the token via the `CLOUDFLARE_TUNNEL_TOKEN` environment variable in the `.env` file.
4. The local container connects to Cloudflare's edge network, mapping the local Nginx Gateway to a secure public domain (e.g. `https://resto-webhook.yourdomain.com`).
5. Configure the Webhook URL in the Meta Developer Portal to point to:
   `https://resto-webhook.yourdomain.com/webhook`

---

## 🔒 Single-Tenant Authentication Bootstrap

To secure the application without using default admin credentials:
1. On initial deployment, the database contains no user profiles.
2. The API endpoint `GET /api/auth/registration-status` returns `{"registered": false}`.
3. The Next.js middleware detects this status and routes the browser to the `/register` screen.
4. The first user to access the URL creates the administrator account with their email, password, and business name.
5. Once a user is created, any subsequent registration requests are blocked:
   ```python
   existing_count = await db.db.users.count_documents({})
   if existing_count > 0:
       raise HTTPException(status_code=400, detail="Registration is disabled. A user is already registered.")
   ```
6. This single-tenant design prevents external registrations while keeping the initial setup simple.

---

## 🏥 Service Health Checks & Diagnostic Startup

The Next.js frontend uses a loading splash screen to ensure services are fully initialized before letting the user log in:
1. The frontend polls the backend's `/api/health` check endpoint.
2. The backend health check runs a diagnostic ping query to MongoDB:
   ```python
   @app.get("/api/health")
   async def health_check():
       try:
           await db.client.admin.command("ping")
           db_status = "ok"
       except Exception:
           db_status = "unavailable"
       return {"status": "ok", "db": db_status}
   ```
3. The splash screen updates the status indicators for the **Backend** and **MongoDB** databases in real-time.
4. Once both indicators show healthy, the screen transitions to the application login view.
