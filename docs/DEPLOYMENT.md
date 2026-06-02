# SigFleet — Docker Deployment Guide

## Option 1: Deploy Locally with Docker Compose (Quickest)

### Prerequisites
- Docker Desktop installed ([download](https://www.docker.com/products/docker-desktop/))
- At least 4GB RAM available for Docker

### Steps

```bash
# 1. Navigate to project root
cd sigFleet

# 2. Copy the Docker environment file
cp .env.docker .env

# 3. Build the frontend for production
cd frontend
npm run build
cp -r dist/* ../nginx/html/
cd ..

# 4. Start everything
docker-compose up --build -d

# 5. Wait ~2-3 minutes for first boot (migrations + seeding)
docker-compose logs -f backend

# 6. Access the app
# App: http://localhost:3001
# API docs: http://localhost:3001/api/docs
```

### Stop
```bash
docker-compose down
```

### Reset (wipe all data)
```bash
docker-compose down -v   # removes volumes (databases)
docker-compose up --build -d
```

---

## Option 2: Deploy Free on Oracle Cloud (Permanent)

Oracle Cloud Always Free tier gives you 2 VMs with 1GB RAM each (or 1 VM with 24GB on ARM). This is enough to run the full stack permanently for free.

### Step 1: Create Oracle Cloud Account
1. Go to [cloud.oracle.com](https://cloud.oracle.com)
2. Sign up for a free account (requires credit card for verification — never charged)
3. Select your home region (Mumbai for India)

### Step 2: Create a VM
1. Go to Compute → Instances → Create Instance
2. Choose **Always Free eligible** shape:
   - AMD: VM.Standard.E2.1.Micro (1 OCPU, 1GB RAM) — limited
   - ARM: Ampere A1 (4 OCPU, 24GB RAM) — **recommended**
3. OS: Ubuntu 22.04
4. Add your SSH key
5. Create

### Step 3: Set Up the VM
```bash
# SSH into your VM
ssh ubuntu@<your-vm-ip>

# Install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
logout  # then SSH back in

# Install Docker Compose
sudo apt install docker-compose-plugin -y

# Clone your repo (or upload via scp)
git clone <your-repo-url> sigFleet
cd sigFleet
```

### Step 4: Build Frontend & Deploy
```bash
# Install Node.js for frontend build
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install nodejs -y

# Build frontend
cd frontend
npm install
npm run build
cp -r dist/* ../nginx/html/
cd ..

# Set up environment
cp .env.docker .env
# Edit .env — change FRONTEND_URL and BACKEND_URL to your VM's public IP:
# FRONTEND_URL=http://<your-vm-ip>:3001
# BACKEND_URL=http://<your-vm-ip>:3001/api

# Start
docker compose up --build -d

# Check logs
docker compose logs -f backend
```

### Step 5: Open Firewall
In Oracle Cloud Console:
1. Go to Networking → Virtual Cloud Networks → your VCN → Security Lists
2. Add Ingress Rule: Source 0.0.0.0/0, Port 3001, TCP
3. Also on the VM: `sudo iptables -I INPUT -p tcp --dport 3001 -j ACCEPT`

### Access
- App: `http://<your-vm-ip>:3001`
- API: `http://<your-vm-ip>:3001/api/docs`

---

## Option 3: Deploy on Railway.app (Easiest, $5 free credit)

### Steps
1. Go to [railway.app](https://railway.app) and sign in with GitHub
2. Click "New Project" → "Deploy from GitHub repo"
3. Select your sigFleet repo
4. Railway auto-detects the docker-compose.yml
5. Add environment variables from `.env.docker`
6. Deploy

**Note:** The $5 free credit lasts ~2 weeks with MySQL + MongoDB + Redis running.

---

## Option 4: Deploy on Render.com (Free backend, external DBs)

### Free External Databases
- **MySQL**: [PlanetScale](https://planetscale.com) (free tier, 5GB)
- **MongoDB**: [MongoDB Atlas](https://www.mongodb.com/atlas) (free tier, 512MB)
- **Redis**: [Upstash](https://upstash.com) (free tier, 10K commands/day)

### Steps
1. Create free accounts on PlanetScale, MongoDB Atlas, and Upstash
2. Get connection strings for each
3. Go to [render.com](https://render.com) → New Web Service
4. Connect your GitHub repo
5. Set:
   - Build Command: `cd backend && pip install -r requirements.txt`
   - Start Command: `cd backend && alembic upgrade head && python app/seed.py && uvicorn app.main:app --host 0.0.0.0 --port $PORT`
6. Add environment variables with your external DB URLs
7. For frontend: New Static Site → `cd frontend && npm run build` → Publish `dist/`

---

## Troubleshooting

| Issue | Fix |
|---|---|
| Backend won't start | Check `docker compose logs backend` — usually MySQL not ready yet |
| Frontend shows blank | Ensure `npm run build` was run and files copied to `nginx/html/` |
| Can't connect to DB | Verify `.env` has Docker hostnames (mysql, mongodb, redis) not localhost |
| Port 3001 not accessible | Open firewall rules (Oracle Cloud security list + iptables) |
| Images not loading | Check `uploads/` volume is mounted correctly |
| OTP email not sending | Verify Gmail SMTP credentials and App Password in `.env` |

---

## Default Credentials (after seed)

| Role | Email | Password |
|---|---|---|
| Admin | admin@sigfleet.com | Admin@123 |
| Manager | ravi@sigfleet.com | Manager@123 |
| Customer | amit@example.com | Customer@123 |
