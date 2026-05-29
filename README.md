# SigFleet — Self-Drive Vehicle Rental Platform

A full-stack vehicle rental platform for customers, vehicle managers, and administrators. Supports vehicle discovery, bookings, KYC verification, wallet payments, manager operations, admin controls, analytics, notifications, and support workflows.

---

## Quick Start (Local — without Docker)

### Prerequisites
- Python 3.11+
- Node.js 18+
- MySQL 8.0 running locally
- MongoDB 7.0 running locally
- Redis 8.x running locally

### 1. Start infrastructure services
```bash
brew services start mongodb-community@7.0
brew services start redis
# MySQL should already be running
```

### 2. Backend
```bash
cd backend
source venv/bin/activate          # or: python -m venv venv && pip install -r requirements.txt
cp .env.example .env               # edit .env with your MySQL/SMTP credentials
alembic upgrade head               # run DB migrations
python app/seed.py                 # seed demo data
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### 3. Frontend
```bash
cd frontend
npm install
npm run dev
# Opens at http://localhost:5173 (or next available port)
```

---

## Quick Start (Docker)

```bash
git clone <repo>
cd sigfleet
cp .env.example .env
# Edit .env — set SMTP credentials (Gmail or Mailtrap)
docker-compose up --build
# First boot: ~3 minutes for migrations + seeding
# App: http://localhost:3001
# API docs: http://localhost:8000/api/docs
```

---

## Default Login Credentials

> All passwords follow the pattern: `Role@123`

### Admin
| Email | Password |
|---|---|
| admin@sigfleet.com | Admin@123 |
| ops@sigfleet.com | Admin@123 |

### Vehicle Managers
| Email | Password | City |
|---|---|---|
| ravi@sigfleet.com | Manager@123 | Bengaluru |
| priya@sigfleet.com | Manager@123 | Mumbai |
| arjun@sigfleet.com | Manager@123 | Delhi |
| sneha@sigfleet.com | Manager@123 | Chennai |
| karan@sigfleet.com | Manager@123 | Pune |
| anika@sigfleet.com | Manager@123 | Hyderabad |
| deepak@sigfleet.com | Manager@123 | Jaipur |

### Customers
| Email | Password | KYC Status |
|---|---|---|
| amit@example.com | Customer@123 | Approved ✓ |
| divya@example.com | Customer@123 | Approved ✓ |
| meera@example.com | Customer@123 | Approved ✓ |
| pooja@example.com | Customer@123 | Approved ✓ |
| sid@example.com | Customer@123 | Approved ✓ |
| nikhil@example.com | Customer@123 | Approved ✓ |
| tanvi@example.com | Customer@123 | Approved ✓ |
| rohan@example.com | Customer@123 | Pending |
| vikram@example.com | Customer@123 | Pending |
| lakshmi@example.com | Customer@123 | Pending |

> **Note:** Customers with KYC Approved can book vehicles immediately. Pending KYC customers must complete verification first.

---

## Seeded Demo Data

| Entity | Count |
|---|---|
| Admin users | 2 |
| Vehicle Managers | 7 |
| Customers | 10 |
| Vehicles | 33 (all approved, all cities) |
| Coupons | 5 active (FIRST5, FLEET5, EV5, WEEKEND5, CITY5) |
| Bookings | 25 (15 completed, 5 confirmed, 3 active, 2 cancelled) |
| Support tickets | 8 |

### Cities with vehicles
| City | Vehicles |
|---|---|
| Bengaluru | 5 |
| Mumbai | 5 |
| Delhi | 5 |
| Chennai | 4 |
| Pune | 4 |
| Hyderabad | 4 |
| Goa | 3 |
| Jaipur | 3 |

### Active Coupon Codes
| Code | Discount | Min Booking | Max Discount |
|---|---|---|---|
| FIRST5 | 5% | ₹500 | ₹150 |
| FLEET5 | 5% | ₹2,000 | ₹200 |
| EV5 | 5% | ₹1,000 | ₹150 |
| WEEKEND5 | 5% | ₹1,500 | ₹175 |
| CITY5 | 5% | ₹800 | ₹120 |

---

## Application URLs

| URL | Description |
|---|---|
| http://localhost:5176 | Frontend (Vite dev server) |
| http://localhost:8000 | Backend API |
| http://localhost:8000/api/docs | Swagger UI |
| http://localhost:8000/api/redoc | ReDoc |
| http://localhost:3001 | Docker Nginx (production build) |

---

## User Roles & Dashboards

### Customer (`/customer/dashboard`)
- Browse and search vehicles by city, date, category, price
- Book vehicles with insurance and optional chauffeur
- KYC document upload and verification
- Wallet: add money, pay for bookings
- Booking history, active trip tracking
- Wishlist, reviews, support tickets
- OTP email verification on registration

### Vehicle Manager (`/manager/dashboard`)
- Add and manage vehicle listings (pending admin approval)
- Accept/reject booking requests
- Start and end trips with odometer readings
- Earnings dashboard, payout requests
- Availability calendar, block dates
- Statistics and analytics charts

### Admin (`/admin/dashboard`)
- User management (customers + managers)
- Vehicle approval/rejection workflow
- KYC review and approval
- Support ticket management with reply
- Coupon CRUD (max 5% discount enforced)
- Payments, payouts, bookings overview
- Analytics: revenue, bookings, users, vehicles

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, Tailwind CSS, Zustand, TanStack Query, Recharts, Leaflet |
| Backend | FastAPI, SQLAlchemy (async), Alembic, Celery |
| Primary DB | MySQL 8.0 (users, vehicles, bookings, payments, coupons) |
| Document DB | MongoDB 7.0 (reviews, notifications, support messages, analytics) |
| Cache / Queue | Redis 8 (JWT blacklist, rate limits, Celery broker) |
| Email | Gmail SMTP (OTP verification, booking confirmations, KYC notifications) |
| Infrastructure | Docker Compose, Nginx |

---

## Booking Flow

1. Customer browses vehicles (public — no login required)
2. Customer clicks "Rent Now" → redirected to login if not authenticated
3. Customer selects dates, insurance, chauffeur option
4. Booking created → auto-confirmed (all demo vehicles have `auto_accept_bookings=true`)
5. Customer proceeds to payment page
6. Selects payment method: Card / UPI / Net Banking / Wallet
7. Payment processed (simulated — no real money)
8. Booking confirmation page with booking reference

---

## Environment Variables (backend/.env)

```env
MYSQL_URL=mysql+aiomysql://root:password@127.0.0.1:3306/zoomcar
MONGODB_URL=mongodb://127.0.0.1:27017/zoomcar_docs
REDIS_URL=redis://127.0.0.1:6379/0
SECRET_KEY=your-secret-key-min-32-chars
ACCESS_TOKEN_EXPIRE_MINUTES=60
REFRESH_TOKEN_EXPIRE_DAYS=30
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your@gmail.com
SMTP_PASSWORD=your-app-password
SMTP_FROM=your@gmail.com
FRONTEND_URL=http://localhost:5176
```

---

## Common Issues

| Issue | Fix |
|---|---|
| "Booking is not ready for payment" | All vehicles must have `auto_accept_bookings=true`. Run: `UPDATE vehicles SET auto_accept_bookings=1` |
| 401 on admin endpoints | Token expired — log out and log back in |
| OTP not received | Check Gmail SMTP credentials in backend/.env |
| Vehicles not showing | Run `UPDATE vehicles SET is_approved=1, is_available=1` |
| KYC stuck on loading | Backend `/kyc/status` returns 200 with `{status: "not_submitted"}` for new users |
