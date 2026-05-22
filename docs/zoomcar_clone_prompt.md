# Zoomcar Clone — Full Build Prompt (React.js + FastAPI + MySQL + MongoDB + Docker)

> **How to use this document:** Feed each Phase to your AI coding assistant (Claude, GPT-4, Cursor, etc.) one at a time, in order. Each phase is self-contained with exact instructions, file paths, models, and edge cases. Never skip a phase; every phase builds on the last.

---

## Master Architecture Overview

```
zoomcar-clone/
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── config.py
│   │   ├── database.py          # MySQL (SQLAlchemy async, aiomysql)
│   │   ├── mongodb.py           # MongoDB (Motor async client)
│   │   ├── models/              # SQLAlchemy ORM models → MySQL
│   │   ├── mongo_models/        # Pydantic document models → MongoDB
│   │   ├── schemas/             # Pydantic request/response schemas
│   │   ├── routers/             # FastAPI route groups
│   │   ├── services/            # Business logic
│   │   ├── utils/               # auth, email, pricing helpers
│   │   └── seed.py              # Seeds both MySQL + MongoDB
│   ├── uploads/
│   ├── requirements.txt
│   ├── entrypoint.sh
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── context/
│   │   ├── hooks/
│   │   ├── services/
│   │   ├── utils/
│   │   └── assets/
│   ├── index.html
│   ├── vite.config.js
│   ├── tailwind.config.js
│   └── Dockerfile
├── nginx/
│   └── nginx.conf
├── docker-compose.yml
└── .env.example
```

---

## Database Responsibility Split

### MySQL (Relational — SQLAlchemy + aiomysql)
Stores all structured, transactional, integrity-critical data:
- users, user_kyc, email_verifications, password_resets
- cars, car_images, car_availability_blocks, car_pricing_rules
- bookings, booking_extensions
- payments, wallet_transactions, user_wallet
- coupons, coupon_usages
- host_profiles, host_payout_requests
- support_tickets

### MongoDB (Hierarchical / Document — Motor async)
Stores all nested, variable-schema, or log-style data:
- **notifications** — per-user arrays with embedded action metadata
- **reviews** — nested doc: review body + host reply + reviewer snapshot
- **support_messages** — embedded message threads per ticket
- **car_view_events** — analytics event log (city, car, timestamp, user_id)
- **activity_feed** — admin event log (who did what, when, full payload)
- **user_sessions** — login session metadata (device, IP, location)
- **search_logs** — search query history per user for recommendations
- **notification_preferences** — per-user nested prefs object

---

## Tech Stack

- **Frontend:** React 18 + Vite, TailwindCSS, React Router v6, Axios, TanStack React Query v5, Zustand, React Hook Form + Zod, Recharts, Leaflet.js, Framer Motion, Swiper, react-hot-toast, Radix UI primitives
- **Backend:** FastAPI, SQLAlchemy 2.0 async (aiomysql driver), MySQL 8, Motor (async MongoDB), Alembic (MySQL migrations), Redis (JWT blacklist + rate limiting + Celery broker), Celery (background tasks), Pydantic v2, python-jose (JWT), Bcrypt, Pillow, aiosmtplib
- **Infrastructure:** Docker Compose, Nginx, MySQL 8, MongoDB 7, Redis 7

---

## PHASE 1 — Project Scaffolding & Docker Infrastructure

### Prompt

```
You are a senior DevOps and full-stack engineer. Set up the complete Docker-based project structure for a Zoomcar clone using MySQL and MongoDB as the two databases.

TASK: Create the full project scaffold with a working Docker Compose that boots entirely in one command: docker-compose up --build

### 1. docker-compose.yml

Services (all on network zoomcar-net):

- **mysql**:
  image: mysql:8.0
  environment: MYSQL_ROOT_PASSWORD=rootpass, MYSQL_DATABASE=zoomcar, MYSQL_USER=zoomuser, MYSQL_PASSWORD=zoompass
  volumes: mysql_data:/var/lib/mysql
  healthcheck: mysqladmin ping -h localhost -u zoomuser -pzoompass
  ports: 3306:3306 (internal only, no host port needed beyond dev)
  command: --default-authentication-plugin=mysql_native_password --character-set-server=utf8mb4 --collation-server=utf8mb4_unicode_ci

- **mongodb**:
  image: mongo:7.0
  environment: MONGO_INITDB_ROOT_USERNAME=mongouser, MONGO_INITDB_ROOT_PASSWORD=mongopass, MONGO_INITDB_DATABASE=zoomcar_docs
  volumes: mongo_data:/data/db
  healthcheck: mongosh --quiet --eval "db.adminCommand('ping')"
  ports: 27017:27017 (internal only)

- **redis**:
  image: redis:7-alpine
  volumes: redis_data:/data
  healthcheck: redis-cli ping
  command: redis-server --appendonly yes

- **backend**:
  build: ./backend
  depends_on: mysql (healthy), mongodb (healthy), redis (healthy)
  env_file: .env
  volumes: ./backend/uploads:/app/uploads
  ports: 8000:8000
  restart: unless-stopped
  entrypoint: ["/app/entrypoint.sh"]

- **celery-worker**:
  build: ./backend
  command: celery -A app.celery_app worker --loglevel=info -c 2
  depends_on: mysql (healthy), mongodb (healthy), redis (healthy)
  env_file: .env
  restart: unless-stopped

- **nginx**:
  build: ./nginx
  ports: 80:80
  depends_on: [backend]
  restart: unless-stopped

volumes: mysql_data, mongo_data, redis_data

### 2. backend/Dockerfile

FROM python:3.11-slim as builder
RUN apt-get update && apt-get install -y build-essential default-libmysqlclient-dev pkg-config curl
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

FROM python:3.11-slim
RUN apt-get update && apt-get install -y default-mysql-client curl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=builder /install /usr/local
COPY . .
RUN mkdir -p uploads/cars uploads/kyc uploads/avatars
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh
EXPOSE 8000

### 3. backend/entrypoint.sh

#!/bin/bash
set -e
echo ">>> Waiting for MySQL..."
until mysqladmin ping -h "${MYSQL_HOST:-mysql}" -u "${MYSQL_USER:-zoomuser}" -p"${MYSQL_PASSWORD:-zoompass}" --silent; do
  sleep 2
done
echo ">>> MySQL ready."

echo ">>> Waiting for MongoDB..."
until python -c "import asyncio; import motor.motor_asyncio; client = motor.motor_asyncio.AsyncIOMotorClient('${MONGODB_URL}'); asyncio.run(client.admin.command('ping'))" 2>/dev/null; do
  sleep 2
done
echo ">>> MongoDB ready."

echo ">>> Running Alembic migrations..."
alembic upgrade head

echo ">>> Checking if seed is needed..."
SEED_NEEDED=$(python -c "
import asyncio, sys
from app.database import async_session_maker
from app.models.user import User
from sqlalchemy import select, func
async def check():
    async with async_session_maker() as s:
        r = await s.execute(select(func.count(User.id)))
        return r.scalar()
count = asyncio.run(check())
print('YES' if count == 0 else 'NO')
")

if [ "$SEED_NEEDED" = "YES" ]; then
  echo ">>> Seeding database..."
  python -m app.seed
  echo ">>> Seed complete."
else
  echo ">>> Database already seeded. Skipping."
fi

echo ">>> Starting FastAPI server..."
exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

### 4. frontend/Dockerfile

FROM node:20-alpine as builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80

### 5. nginx/nginx.conf

server {
    listen 80;
    client_max_body_size 20M;
    gzip on;
    gzip_types text/plain text/css application/json application/javascript;

    location / {
        root /usr/share/nginx/html;
        index index.html;
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://backend:8000/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 120s;
    }

    location /uploads/ {
        alias /app/uploads/;
        expires 7d;
        add_header Cache-Control "public";
    }
}

### 6. .env.example

# MySQL
MYSQL_HOST=mysql
MYSQL_PORT=3306
MYSQL_USER=zoomuser
MYSQL_PASSWORD=zoompass
MYSQL_DATABASE=zoomcar
MYSQL_URL=mysql+aiomysql://zoomuser:zoompass@mysql:3306/zoomcar

# MongoDB
MONGODB_URL=mongodb://mongouser:mongopass@mongodb:27017/zoomcar_docs?authSource=admin
MONGODB_DB_NAME=zoomcar_docs

# Redis
REDIS_URL=redis://redis:6379/0

# Auth
SECRET_KEY=your-super-secret-key-change-this-in-production-minimum-32-chars
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60
REFRESH_TOKEN_EXPIRE_DAYS=30

# Email (use Mailtrap.io free for dev)
SMTP_HOST=smtp.mailtrap.io
SMTP_PORT=587
SMTP_USER=your_mailtrap_user
SMTP_PASSWORD=your_mailtrap_password
SMTP_FROM=noreply@zoomcarclone.com

# App
FRONTEND_URL=http://localhost
BACKEND_URL=http://localhost/api
UPLOAD_DIR=/app/uploads
MAX_UPLOAD_SIZE_MB=10

# Payment (simulated — no real gateway)
PAYMENT_SIMULATE=true

### 7. backend/requirements.txt (exact versions)

fastapi==0.111.0
uvicorn[standard]==0.30.1
sqlalchemy[asyncio]==2.0.30
aiomysql==0.2.0
alembic==1.13.1
motor==3.4.0
pymongo==4.7.2
pydantic[email]==2.7.1
pydantic-settings==2.2.1
python-jose[cryptography]==3.3.0
passlib[bcrypt]==1.7.4
python-multipart==0.0.9
pillow==10.3.0
redis==5.0.4
celery==5.4.0
aiosmtplib==3.0.1
httpx==0.27.0
tenacity==8.3.0
geopy==2.4.1
mysqlclient==2.2.4

### 8. frontend/package.json dependencies

react@18, react-dom@18, react-router-dom@6,
@tanstack/react-query@5, axios, zustand,
react-hook-form, @hookform/resolvers, zod,
tailwindcss@3, @tailwindcss/forms, autoprefixer, postcss,
framer-motion, leaflet, react-leaflet,
recharts, date-fns, react-datepicker,
react-image-gallery, react-hot-toast, lucide-react,
@radix-ui/react-dialog, @radix-ui/react-dropdown-menu,
@radix-ui/react-slider, @radix-ui/react-tabs,
@radix-ui/react-accordion, swiper,
react-helmet-async, react-dropzone
```

---

## PHASE 2 — Database Setup: MySQL + MongoDB Connection Layer

### Prompt

```
You are a senior backend engineer. Set up the dual-database connection layer for MySQL (SQLAlchemy async) and MongoDB (Motor async).

### backend/app/database.py  — MySQL via SQLAlchemy + aiomysql

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from app.config import settings

engine = create_async_engine(
    settings.MYSQL_URL,
    pool_pre_ping=True,
    pool_recycle=3600,
    pool_size=10,
    max_overflow=20,
    echo=False
)

AsyncSessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

class Base(DeclarativeBase):
    pass

async def get_db() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()

async def init_db():
    async with engine.begin() as conn:
        # Tables created via Alembic; this just verifies connection
        pass

### backend/app/mongodb.py — MongoDB via Motor

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from app.config import settings
from typing import Optional

_mongo_client: Optional[AsyncIOMotorClient] = None
_mongo_db: Optional[AsyncIOMotorDatabase] = None

async def connect_mongo():
    global _mongo_client, _mongo_db
    _mongo_client = AsyncIOMotorClient(settings.MONGODB_URL)
    _mongo_db = _mongo_client[settings.MONGODB_DB_NAME]
    # Verify connection
    await _mongo_client.admin.command("ping")
    # Create indexes on startup
    await _create_indexes()

async def disconnect_mongo():
    global _mongo_client
    if _mongo_client:
        _mongo_client.close()

def get_mongo_db() -> AsyncIOMotorDatabase:
    return _mongo_db

async def _create_indexes():
    db = _mongo_db
    # notifications: fast lookup by user_id + is_read
    await db.notifications.create_index([("user_id", 1), ("created_at", -1)])
    await db.notifications.create_index([("user_id", 1), ("is_read", 1)])
    # reviews: lookup by car_id, booking_id
    await db.reviews.create_index([("car_id", 1), ("created_at", -1)])
    await db.reviews.create_index([("booking_id", 1)], unique=True)
    await db.reviews.create_index([("reviewer_id", 1)])
    # support_messages: by ticket_id
    await db.support_messages.create_index([("ticket_id", 1), ("created_at", 1)])
    # car_view_events: by car_id, by city, TTL 90 days
    await db.car_view_events.create_index("created_at", expireAfterSeconds=7776000)
    await db.car_view_events.create_index([("car_id", 1)])
    # activity_feed: TTL 180 days
    await db.activity_feed.create_index("created_at", expireAfterSeconds=15552000)
    await db.activity_feed.create_index([("actor_id", 1)])
    # search_logs: by user_id, TTL 30 days
    await db.search_logs.create_index("created_at", expireAfterSeconds=2592000)
    await db.search_logs.create_index([("user_id", 1)])
    # user_sessions: by user_id, TTL 30 days
    await db.user_sessions.create_index("created_at", expireAfterSeconds=2592000)
    await db.user_sessions.create_index([("user_id", 1)])

### backend/app/config.py

from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    MYSQL_URL: str
    MONGODB_URL: str
    MONGODB_DB_NAME: str = "zoomcar_docs"
    REDIS_URL: str
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30
    SMTP_HOST: str
    SMTP_PORT: int = 587
    SMTP_USER: str
    SMTP_PASSWORD: str
    SMTP_FROM: str
    FRONTEND_URL: str = "http://localhost"
    BACKEND_URL: str = "http://localhost/api"
    UPLOAD_DIR: str = "/app/uploads"
    MAX_UPLOAD_SIZE_MB: int = 10
    PAYMENT_SIMULATE: bool = True

    class Config:
        env_file = ".env"

settings = Settings()

### backend/app/main.py

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager
from app.database import init_db
from app.mongodb import connect_mongo, disconnect_mongo
from app.routers import auth, users, cars, bookings, payments, reviews, notifications, support, wishlist, host_earnings, admin, kyc

@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    await connect_mongo()
    yield
    await disconnect_mongo()

app = FastAPI(
    title="Zoomcar Clone API",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost", "http://localhost:3000", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)

app.mount("/uploads", StaticFiles(directory=settings.UPLOAD_DIR), name="uploads")

# Include all routers with /api prefix
for router in [auth.router, users.router, cars.router, bookings.router, payments.router,
               reviews.router, notifications.router, support.router, wishlist.router,
               host_earnings.router, admin.router, kyc.router]:
    app.include_router(router, prefix="/api")
```

---

## PHASE 3 — MySQL ORM Models (Complete Schema)

### Prompt

```
You are a senior backend engineer. Create ALL SQLAlchemy async ORM models for MySQL. Use SQLAlchemy 2.0 declarative style. All stored in backend/app/models/.

IMPORTANT MySQL-specific notes:
- Use String(36) for UUID primary keys (MySQL has no native UUID column; store as CHAR(36))
- Use default=lambda: str(uuid.uuid4()) for UUID generation in Python
- Use DECIMAL(10,2) for all money columns (never Float for currency)
- Use TINYINT(1) for boolean columns (SQLAlchemy Boolean maps correctly)
- All Enum columns: use SQLAlchemy Enum with explicit values list
- All text columns that may exceed 255 chars: use Text()
- Add explicit __tablename__ to every model
- CharSet: utf8mb4 implied by docker-compose config

### models/__init__.py
Import all models so Alembic can detect them:
from app.models.user import User, UserKYC, EmailVerification, PasswordReset
from app.models.car import Car, CarImage, CarAvailabilityBlock, CarPricingRule
from app.models.booking import Booking, BookingExtension
from app.models.payment import Payment, WalletTransaction, UserWallet
from app.models.coupon import Coupon, CouponUsage
from app.models.host import HostProfile, HostPayoutRequest
from app.models.support import SupportTicket

### models/base.py
import uuid
from sqlalchemy import Column, String, DateTime, func
from app.database import Base

class TimestampMixin:
    created_at = Column(DateTime, default=func.now(), nullable=False)
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now(), nullable=False)

def generate_uuid():
    return str(uuid.uuid4())

### models/user.py

Table: users
- id: String(36) PK default=generate_uuid
- email: String(255) unique indexed not null
- hashed_password: String(255) not null
- full_name: String(200) not null
- phone: String(20) nullable
- profile_picture: String(500) nullable
- is_active: Boolean default True
- is_verified: Boolean default False
- is_host: Boolean default False
- role: Enum('guest','host','admin') default 'guest'
- last_login: DateTime nullable
+ TimestampMixin

Table: user_kyc
- id: String(36) PK
- user_id: String(36) FK(users.id) unique
- dl_number: String(50) nullable
- dl_front_image: String(500) nullable
- dl_back_image: String(500) nullable
- aadhar_number: String(20) nullable
- aadhar_front_image: String(500) nullable
- aadhar_back_image: String(500) nullable
- kyc_status: Enum('pending','under_review','approved','rejected') default 'pending'
- rejection_reason: Text nullable
- submitted_at: DateTime nullable
- reviewed_at: DateTime nullable
- reviewed_by: String(36) FK(users.id) nullable

Table: email_verifications
- id: String(36) PK
- user_id: String(36) FK(users.id)
- token: String(255) unique indexed
- expires_at: DateTime not null
- is_used: Boolean default False
+ created_at

Table: password_resets
- id: String(36) PK
- user_id: String(36) FK(users.id)
- token: String(255) unique indexed
- expires_at: DateTime not null
- is_used: Boolean default False
+ created_at

### models/car.py

Table: cars
- id: String(36) PK
- host_id: String(36) FK(users.id) indexed
- title: String(300) not null
- make: String(100) not null
- model: String(100) not null  [NOTE: avoid "model" as attr name in SQLAlchemy; use car_model]
- year: Integer not null
- color: String(50)
- transmission: Enum('manual','automatic')
- fuel_type: Enum('petrol','diesel','electric','hybrid','cng')
- seats: Integer
- category: Enum('hatchback','sedan','suv','muv','luxury','electric','convertible','minivan')
- description: Text
- registration_number: String(20) unique indexed
- location_city: String(100) indexed
- location_area: String(200)
- location_lat: DECIMAL(9,6)
- location_lng: DECIMAL(9,6)
- location_address: Text
- price_per_hour: DECIMAL(10,2)
- price_per_day: DECIMAL(10,2)
- min_trip_hours: Integer default 4
- max_trip_days: Integer default 30
- security_deposit: DECIMAL(10,2) default 0
- extra_km_charge: DECIMAL(10,2) default 0
- included_km_per_day: Integer default 300
- is_available: Boolean default True
- is_approved: Boolean default False
- is_featured: Boolean default False
- has_gps_tracker: Boolean default False
- has_keyless_entry: Boolean default False
- has_ac: Boolean default True
- has_music_system: Boolean default True
- has_sunroof: Boolean default False
- has_child_seat: Boolean default False
- has_luggage_carrier: Boolean default False
- minimum_guest_rating: DECIMAL(3,2) nullable
- auto_accept_bookings: Boolean default False
- average_rating: DECIMAL(3,2) default 0.00
- total_trips: Integer default 0
- total_earnings: DECIMAL(12,2) default 0
+ TimestampMixin

Table: car_images
- id: String(36) PK
- car_id: String(36) FK(cars.id) indexed
- image_url: String(500)
- is_primary: Boolean default False
- order_index: Integer default 0
+ created_at

Table: car_availability_blocks
- id: String(36) PK
- car_id: String(36) FK(cars.id)
- blocked_from: DateTime not null
- blocked_to: DateTime not null
- reason: String(200) nullable
+ created_at

Table: car_pricing_rules
- id: String(36) PK
- car_id: String(36) FK(cars.id)
- rule_type: Enum('weekend_discount','long_trip_discount','peak_surcharge')
- discount_percent: DECIMAL(5,2) nullable
- surcharge_percent: DECIMAL(5,2) nullable
- min_days: Integer nullable
- applies_on: String(100) nullable

### models/booking.py

Table: bookings
- id: String(36) PK
- booking_ref: String(12) unique indexed (e.g. JPSNABC123)
- car_id: String(36) FK(cars.id)
- guest_id: String(36) FK(users.id)
- host_id: String(36) FK(users.id)
- status: Enum('pending','confirmed','active','completed','cancelled','rejected')
- pickup_datetime: DateTime not null
- return_datetime: DateTime not null
- actual_pickup_time: DateTime nullable
- actual_return_time: DateTime nullable
- pickup_location: Text
- total_hours: DECIMAL(8,2)
- base_amount: DECIMAL(10,2)
- discount_amount: DECIMAL(10,2) default 0
- coupon_code: String(50) nullable
- insurance_amount: DECIMAL(10,2) default 0
- insurance_plan: Enum('basic','standard','platinum') nullable
- security_deposit_amount: DECIMAL(10,2) default 0
- total_amount: DECIMAL(10,2)
- platform_fee: DECIMAL(10,2) default 0
- host_earnings: DECIMAL(10,2) default 0
- extra_km_charged: DECIMAL(10,2) default 0
- odometer_start: Integer nullable
- odometer_end: Integer nullable
- cancellation_reason: Text nullable
- cancelled_by: String(36) FK(users.id) nullable
- cancelled_at: DateTime nullable
- refund_amount: DECIMAL(10,2) default 0
- refund_status: Enum('not_applicable','pending','processed') default 'not_applicable'
- host_accepted_at: DateTime nullable
- guest_notes: Text nullable
+ TimestampMixin

Table: booking_extensions
- id: String(36) PK
- booking_id: String(36) FK(bookings.id)
- extended_return_datetime: DateTime
- additional_amount: DECIMAL(10,2)
- status: Enum('pending','approved','rejected') default 'pending'
- requested_at: DateTime default now
- responded_at: DateTime nullable

### models/payment.py

Table: payments
- id: String(36) PK
- booking_id: String(36) FK(bookings.id) unique
- user_id: String(36) FK(users.id)
- amount: DECIMAL(10,2)
- currency: String(5) default 'INR'
- payment_method: Enum('simulated','wallet','upi','card') default 'simulated'
- simulated_transaction_id: String(100) nullable  (e.g. SIM_TXN_xxxxx)
- status: Enum('created','paid','failed','refunded') default 'created'
- paid_at: DateTime nullable
+ created_at

Table: user_wallet
- id: String(36) PK
- user_id: String(36) FK(users.id) unique
- balance: DECIMAL(12,2) default 0.00
+ updated_at

Table: wallet_transactions
- id: String(36) PK
- user_id: String(36) FK(users.id)
- transaction_type: Enum('credit','debit')
- amount: DECIMAL(10,2)
- balance_after: DECIMAL(10,2)
- description: String(500)
- reference_id: String(100) nullable
+ created_at

### models/coupon.py

Table: coupons
- id: String(36) PK
- code: String(50) unique indexed
- description: String(500)
- discount_type: Enum('percent','flat')
- discount_value: DECIMAL(10,2)
- max_discount: DECIMAL(10,2) nullable
- min_booking_amount: DECIMAL(10,2) default 0
- usage_limit: Integer nullable
- used_count: Integer default 0
- valid_from: DateTime
- valid_until: DateTime
- is_active: Boolean default True
- applicable_for: Enum('all','new_users','specific_users') default 'all'
+ TimestampMixin

Table: coupon_usages
- id: String(36) PK
- coupon_id: String(36) FK(coupons.id)
- user_id: String(36) FK(users.id)
- booking_id: String(36) FK(bookings.id)
+ created_at

### models/host.py

Table: host_profiles
- id: String(36) PK
- user_id: String(36) FK(users.id) unique
- bio: Text nullable
- response_time: String(100) nullable
- acceptance_rate: DECIMAL(5,2) default 0
- total_listings: Integer default 0
- average_rating: DECIMAL(3,2) default 0
- total_reviews: Integer default 0
- is_superhost: Boolean default False
- joined_as_host_at: DateTime default now
- payout_bank_name: String(200) nullable
- payout_account_number: String(50) nullable
- payout_ifsc: String(20) nullable
- payout_account_holder: String(200) nullable

Table: host_payout_requests
- id: String(36) PK
- host_id: String(36) FK(users.id)
- amount: DECIMAL(10,2)
- status: Enum('pending','processing','paid','failed') default 'pending'
- requested_at: DateTime default now
- processed_at: DateTime nullable

### models/support.py

Table: support_tickets
- id: String(36) PK
- booking_ref: String(12) nullable
- user_id: String(36) FK(users.id)
- subject: String(500)
- description: Text
- category: Enum('booking','payment','car_issue','account','other')
- status: Enum('open','in_progress','resolved','closed') default 'open'
- priority: Enum('low','medium','high') default 'medium'
+ TimestampMixin

NOTE: Support messages are stored in MongoDB (see mongo_models), NOT in MySQL.

After writing all models, create alembic.ini and alembic/env.py:
- target_metadata = Base.metadata
- Use MYSQL_URL from environment
- Run: alembic revision --autogenerate -m "initial_schema"
```

---

## PHASE 4 — MongoDB Document Models

### Prompt

```
You are a senior backend engineer. Create all MongoDB document models (Pydantic classes) and service functions for the Zoomcar clone's MongoDB collections. These live in backend/app/mongo_models/.

### mongo_models/__init__.py
from app.mongo_models.notification import NotificationDoc, create_notification, get_user_notifications, mark_notification_read, mark_all_read, get_unread_count
from app.mongo_models.review import ReviewDoc, create_review, get_car_reviews, get_user_reviews, add_host_reply
from app.mongo_models.support_message import SupportMessageDoc, add_support_message, get_ticket_messages
from app.mongo_models.analytics import log_car_view, log_search, log_activity, get_car_view_count
from app.mongo_models.session import create_session, get_user_sessions

### mongo_models/notification.py

from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional, Literal
from bson import ObjectId
from app.mongodb import get_mongo_db

class NotificationDoc(BaseModel):
    id: Optional[str] = Field(None, alias="_id")
    user_id: str                    # FK to MySQL users.id
    title: str
    message: str
    notification_type: Literal['booking','payment','review','kyc','promotion','system','host']
    is_read: bool = False
    action_url: Optional[str] = None
    meta: dict = {}                 # e.g. {booking_ref: "JPSNABC", car_title: "Honda City"}
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        populate_by_name = True

Implement these async functions:

async def create_notification(user_id: str, title: str, message: str, 
                               notification_type: str, action_url: str = None,
                               meta: dict = {}) -> str:
    db = get_mongo_db()
    doc = NotificationDoc(user_id=user_id, title=title, message=message,
                           notification_type=notification_type, action_url=action_url, meta=meta)
    result = await db.notifications.insert_one(doc.model_dump(exclude={"id"}))
    return str(result.inserted_id)

async def get_user_notifications(user_id: str, page: int = 1, limit: int = 20) -> list[dict]:
    db = get_mongo_db()
    skip = (page - 1) * limit
    cursor = db.notifications.find({"user_id": user_id}).sort("created_at", -1).skip(skip).limit(limit)
    docs = await cursor.to_list(length=limit)
    for d in docs: d["_id"] = str(d["_id"])
    return docs

async def get_unread_count(user_id: str) -> int:
    return await get_mongo_db().notifications.count_documents({"user_id": user_id, "is_read": False})

async def mark_notification_read(notification_id: str) -> bool:
    from bson import ObjectId
    result = await get_mongo_db().notifications.update_one(
        {"_id": ObjectId(notification_id)}, {"$set": {"is_read": True}})
    return result.modified_count > 0

async def mark_all_read(user_id: str):
    await get_mongo_db().notifications.update_many(
        {"user_id": user_id, "is_read": False}, {"$set": {"is_read": True}})

async def delete_notification(notification_id: str):
    from bson import ObjectId
    await get_mongo_db().notifications.delete_one({"_id": ObjectId(notification_id)})

### mongo_models/review.py

class ReviewDoc(BaseModel):
    id: Optional[str] = Field(None, alias="_id")
    booking_id: str             # FK to MySQL bookings.id (unique index)
    reviewer_id: str            # FK to MySQL users.id
    reviewer_name: str          # Snapshot at time of review
    reviewer_photo: Optional[str] = None
    reviewee_id: Optional[str] = None
    car_id: Optional[str] = None
    rating: int                 # 1-5
    title: Optional[str] = None
    body: Optional[str] = None
    review_type: Literal['guest_to_car','guest_to_host','host_to_guest']
    is_published: bool = True
    host_reply: Optional[str] = None
    host_replied_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    # Embedded meta
    car_snapshot: dict = {}     # {title, make, model, year, primary_image}
    trip_snapshot: dict = {}    # {pickup_date, return_date, duration_days}

Implement:
async def create_review(data: dict) -> str — insert review, verify booking_id unique per review_type
async def get_car_reviews(car_id: str, page: int = 1, limit: int = 10, sort: str = "recent") -> dict
  — returns {reviews: [], total: int, avg_rating: float, rating_breakdown: {5:X,4:X,...}}
async def get_user_reviews(user_id: str, review_type: str = "received") -> list
async def add_host_reply(booking_id: str, reply: str, host_id: str) -> bool
async def get_booking_reviews(booking_id: str) -> list
async def update_car_avg_rating(car_id: str) -> float:
  — aggregate avg rating for car_id where review_type=guest_to_car, return float

### mongo_models/support_message.py

class SupportMessageDoc(BaseModel):
    id: Optional[str] = Field(None, alias="_id")
    ticket_id: str              # FK to MySQL support_tickets.id
    sender_id: str              # FK to MySQL users.id
    sender_name: str
    sender_role: Literal['user','admin','staff']
    message: str
    attachment_url: Optional[str] = None
    is_staff_reply: bool = False
    created_at: datetime = Field(default_factory=datetime.utcnow)

Implement:
async def add_support_message(ticket_id, sender_id, sender_name, sender_role, message, attachment_url=None) -> str
async def get_ticket_messages(ticket_id: str) -> list[dict]

### mongo_models/analytics.py

async def log_car_view(car_id: str, user_id: Optional[str], city: str, 
                        source: str = "search"):
    """Log every car detail page view. Used for popularity ranking."""
    db = get_mongo_db()
    await db.car_view_events.insert_one({
        "car_id": car_id, "user_id": user_id,
        "city": city, "source": source,
        "created_at": datetime.utcnow()
    })

async def get_car_view_count(car_id: str, days: int = 30) -> int:
    from datetime import timedelta
    since = datetime.utcnow() - timedelta(days=days)
    return await get_mongo_db().car_view_events.count_documents(
        {"car_id": car_id, "created_at": {"$gte": since}})

async def log_search(user_id: Optional[str], city: str, filters: dict, results_count: int):
    await get_mongo_db().search_logs.insert_one({
        "user_id": user_id, "city": city, "filters": filters,
        "results_count": results_count, "created_at": datetime.utcnow()
    })

async def log_activity(actor_id: str, action: str, entity_type: str,
                        entity_id: str, payload: dict = {}):
    """Admin activity feed: who did what."""
    await get_mongo_db().activity_feed.insert_one({
        "actor_id": actor_id, "action": action,
        "entity_type": entity_type, "entity_id": entity_id,
        "payload": payload, "created_at": datetime.utcnow()
    })

async def get_admin_activity_feed(page: int = 1, limit: int = 50) -> list[dict]:
    skip = (page-1)*limit
    cursor = get_mongo_db().activity_feed.find().sort("created_at",-1).skip(skip).limit(limit)
    docs = await cursor.to_list(length=limit)
    for d in docs: d["_id"] = str(d["_id"])
    return docs

async def get_city_search_trends(days: int = 30) -> list[dict]:
    """Top searched cities."""
    from datetime import timedelta
    since = datetime.utcnow() - timedelta(days=days)
    pipeline = [
        {"$match": {"created_at": {"$gte": since}}},
        {"$group": {"_id": "$city", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 10}
    ]
    return await get_mongo_db().search_logs.aggregate(pipeline).to_list(length=10)

### mongo_models/session.py

async def create_session(user_id: str, device_info: str, ip: str):
    await get_mongo_db().user_sessions.insert_one({
        "user_id": user_id, "device_info": device_info,
        "ip": ip, "created_at": datetime.utcnow()
    })

async def get_user_sessions(user_id: str) -> list:
    cursor = get_mongo_db().user_sessions.find({"user_id": user_id}).sort("created_at",-1).limit(10)
    docs = await cursor.to_list(length=10)
    for d in docs: d["_id"] = str(d["_id"])
    return docs
```

---

## PHASE 5 — Authentication System (Email Only, No OAuth)

### Prompt

```
You are a senior backend security engineer. Build the complete email-only authentication system.

### backend/app/utils/auth.py

- get_password_hash(password: str) → str  (bcrypt, cost factor 12)
- verify_password(plain: str, hashed: str) → bool
- create_access_token(data: dict) → str  (JWT, HS256, exp = ACCESS_TOKEN_EXPIRE_MINUTES)
- create_refresh_token(data: dict) → str  (JWT, HS256, exp = REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60)
- verify_token(token: str) → dict  (raises HTTPException 401 if invalid or blacklisted)
  → Check Redis blacklist: key = "blacklist:{token_jti}"
- oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")
- async get_current_user(token, db) → User  (raises 401 if user not found or inactive)
- async get_current_active_user(current_user) → User  (raises 403 if not active)
- async require_verified_user(current_user) → User  (raises 403 if not is_verified)
- async require_kyc_user(current_user, db) → User  (raises 403 if KYC not approved)
- async require_host(current_user) → User  (raises 403 if not is_host)
- async require_admin(current_user) → User  (raises 403 if role != admin)

Password validation regex: min 8 chars, at least 1 uppercase, 1 digit, 1 special char [!@#$%^&*]

JWT payload structure: {"sub": user_id, "email": email, "role": role, "jti": uuid4_string, "exp": ...}

### backend/app/utils/email.py

Use aiosmtplib + Python's email.mime for HTML emails.
All email functions are async. Call via Celery task for background sending.

Build these HTML email templates (inline CSS, clean design, Zoomcar red #E31837):

send_verification_email(to_email, full_name, token):
  Subject: "Verify your Zoomcar account"
  Body: Welcome message + big CTA button linking to {FRONTEND_URL}/auth/verify-email?token={token}
  Note: token expires in 24 hours

send_password_reset_email(to_email, full_name, token):
  Subject: "Reset your Zoomcar password"
  Body: Reset instructions + CTA button → {FRONTEND_URL}/auth/reset-password?token={token}
  Note: expires in 2 hours

send_booking_confirmation_email(to_email, booking: dict):
  Subject: "Booking Confirmed — {booking_ref}"
  Body: Car name, pickup/return dates, location, total amount, booking ref

send_booking_request_to_host_email(to_email, booking: dict):
  Subject: "New Booking Request — {car_title}"
  Body: Guest name, dates, amount, link to host dashboard

send_booking_cancelled_email(to_email, booking: dict, refund_amount: float):
  Subject: "Booking Cancelled — {booking_ref}"

send_kyc_approved_email(to_email, full_name):
  Subject: "KYC Verified ✓ — You're ready to book"

send_kyc_rejected_email(to_email, full_name, reason: str):
  Subject: "KYC Verification — Action Required"

send_trip_reminder_email(to_email, booking: dict):
  Subject: "Your trip starts in 2 hours!"

send_review_request_email(to_email, full_name, booking_ref: str):
  Subject: "How was your Zoomcar trip?"

send_host_payout_email(to_email, amount: float):
  Subject: "Payout Processed — ₹{amount}"

### backend/app/routers/auth.py

Router prefix: /auth  (full path: /api/auth/...)

POST /register
  Schema in: {email, password, confirm_password, full_name, phone}
  - Validate: email format, password strength, confirm match, phone 10 digits
  - Check duplicate email: 409 if exists
  - hash password, create User row (MySQL), create UserWallet row, create HostProfile stub if needed
  - Generate verification token (UUID), save to email_verifications (expires 24h)
  - Fire Celery task: send_verification_email.delay(email, full_name, token)
  - Log activity to MongoDB: log_activity(user.id, "register", "user", user.id)
  - Return 201: {message: "Account created. Please check your email to verify."}

POST /verify-email?token=xxx
  - Look up token in email_verifications
  - If not found or is_used=True: 400 "Invalid or already used token"
  - If expired: 400 "Verification link expired. Please request a new one."
  - Mark user.is_verified=True, token.is_used=True
  - Return 200: {message: "Email verified successfully. You can now log in."}

POST /resend-verification
  Body: {email}
  - Rate limit via Redis: key="resend:{email}" TTL=60s, 429 if exists
  - If user exists and not verified: generate new token, fire email task
  - Always return: {message: "If unverified, a new link has been sent."}

POST /login
  Body: {email, password}
  - Find user by email. If not found: 401 "Invalid email or password"
  - verify_password. If fail: 401 "Invalid email or password"
  - If not is_active: 403 "Account suspended"
  - If not is_verified: 403 with body {detail: "EMAIL_NOT_VERIFIED", message: "Please verify your email first."}
  - Generate access_token + refresh_token
  - Update user.last_login = now()
  - Create MongoDB session: create_session(user.id, request.headers.get("user-agent"), request.client.host)
  - Return: {access_token, refresh_token, token_type: "bearer",
             user: {id, email, full_name, role, is_host, profile_picture, is_kyc_verified, wallet_balance}}

POST /refresh
  Body: {refresh_token}
  - Verify refresh token, check not blacklisted
  - Return new access_token (same jti in blacklist-safe way)

POST /logout  (protected)
  - Add jti to Redis blacklist (TTL = remaining token lifetime)
  - Return {message: "Logged out successfully."}

POST /forgot-password
  Body: {email}
  - Rate limit: 1 per 5 min per email
  - If user exists: create password_resets token (UUID, expires 2h), fire email task
  - Always return: {message: "If that email exists, a password reset link has been sent."}

POST /reset-password
  Body: {token, new_password, confirm_password}
  - Validate token (not found/used/expired: 400)
  - Validate new password strength
  - Hash + save new password, mark token used
  - Blacklist all existing tokens for this user in Redis (key="force_logout:{user_id}")
  - Return: {message: "Password reset successfully. You can now log in."}

GET /me  (protected)
  Return full user object + kyc_status + wallet_balance

PATCH /change-password  (protected)
  Body: {current_password, new_password, confirm_new_password}

### Frontend Auth Pages

All in frontend/src/pages/auth/

#### LoginPage.jsx
- Two-column layout on desktop: left = illustration/tagline, right = form
- Form: Email input, Password input with show/hide eye icon toggle
- "Forgot Password?" link aligned right
- Submit button (full width, red)
- On 403 EMAIL_NOT_VERIFIED: show amber banner "Email not verified. [Resend verification email]"
  - Resend button calls POST /api/auth/resend-verification
- On success: navigate to previous page (useLocation state) or /
- Divider + "New to Zoomcar? Create an account" link
- Loading spinner in button while submitting

#### RegisterPage.jsx
- Two-column layout on desktop
- Form fields in order: Full Name, Email, Phone (Indian +91 format), Password, Confirm Password
- Password strength meter: 4 levels (Too Weak / Weak / Good / Strong)
  - Logic: <8 chars=Too Weak, no special=Weak, no number=Weak, all criteria met + length>10=Strong
  - Visual: colored progress bar below password field
- Show/hide toggle on both password fields
- Terms checkbox: "I agree to the Terms of Service and Privacy Policy" (links open in new tab)
- Submit → success state (shows envelope icon + "Check your inbox" message, NOT a redirect)
- Link to login

#### ForgotPasswordPage.jsx
- Simple centered card
- Email input + Submit
- Success state: "If an account exists, a reset link has been sent."

#### ResetPasswordPage.jsx
- Read token from URL query param
- New password + confirm with strength meter
- On success: show "Password reset! Redirecting to login..." with 3s countdown

#### EmailVerificationPage.jsx
- Reads token from URL query param
- Shows spinner "Verifying your email..."
- Success: green checkmark, "Email Verified! You're ready to explore Zoomcar." + Login button
- Failure: red X, "Link expired or invalid." + form to enter email and request new link

#### AuthContext + Zustand store (frontend/src/context/AuthContext.jsx)

Zustand store:
  state: {user: null, accessToken: null, refreshToken: null, isLoading: true}
  actions: setUser, setTokens, logout, hydrateFromStorage

On app mount: read tokens from localStorage, call GET /api/auth/me to rehydrate user
Axios interceptor:
  - Request: attach Authorization: Bearer {accessToken}
  - Response 401: attempt POST /api/auth/refresh using stored refreshToken
    - On success: update accessToken, retry original request
    - On failure: clear store, redirect to /auth/login
Auto-refresh: set timeout to call /refresh 5 minutes before access token expiry (decode JWT exp)

Components:
- <PrivateRoute> → if not logged in, redirect to /auth/login?next={currentPath}
- <GuestRoute> → if logged in, redirect to /
- <HostRoute> → if not host, redirect to /become-a-host
- <AdminRoute> → if not admin, redirect to /
```

---

## PHASE 6 — Car Listing System (Host Side)

### Prompt

```
You are a senior full-stack engineer. Build the complete car listing and management system.

### backend/app/routers/cars.py

All routes prefixed /api/cars

GET /  (search + list)
Query params: city, category, transmission, fuel_type, seats, min_price, max_price,
              start_date (ISO8601), end_date (ISO8601), lat, lng, radius_km,
              sort_by (recommended|price_asc|price_desc|rating|most_booked),
              features (comma-separated: ac,sunroof,gps,keyless,child_seat),
              page (default 1), limit (default 12)

Logic:
1. Base query: cars WHERE is_approved=True AND is_available=True
2. If start_date/end_date: exclude cars with confirmed/active bookings overlapping range
   (use NOT EXISTS subquery on bookings where status IN ('confirmed','active','pending'))
3. If start_date/end_date: exclude cars with availability_blocks overlapping range
4. Apply city, category, transmission, fuel_type, seats filters
5. Apply min_price/max_price on price_per_day
6. Apply features filters (has_ac, has_sunroof, etc.)
7. If lat/lng: calculate Haversine distance in SQL using formula, filter <= radius_km
8. Sort: recommended = weighted (rating*0.4 + trips*0.3 + is_featured*0.3)
9. Paginate
10. Log search to MongoDB: log_search(user_id, city, filters_dict, result_count)
Return: {cars: [...], total, page, pages, has_next, has_prev}
Each car includes: id, title, make, car_model, year, category, transmission,
fuel_type, seats, location_city, location_area, location_lat, location_lng,
price_per_hour, price_per_day, average_rating, total_trips,
primary_image_url, features (list), host_name, host_id, is_featured, distance_km

GET /{car_id}
- Return full car detail
- Include: all images sorted by order_index, host_profile (name, photo, rating, response_time, is_superhost, joined_date, total_reviews)
- Include: car_pricing_rules list
- Include: availability_blocks for next 90 days
- Include: last 5 published reviews from MongoDB
- Include: review stats from MongoDB (avg, breakdown)
- Log view: log_car_view(car_id, user_id, city)
- Increment view_count in Redis: INCR car_views:{car_id}

GET /featured  
Return: cars WHERE is_featured=True AND is_approved=True LIMIT 6

GET /city/{city}
Return: cars in city, sorted by rating DESC, limit 20

POST /  (host only, verified KYC required)
Body: full car creation schema
- Set is_approved=False (needs admin approval)
- Auto-create HostProfile if not exists
- Update host_profiles.total_listings += 1
- Notify all admins via MongoDB notifications
- Log activity: log_activity(host_id, "car_listed", "car", car.id, {title, city})
Return 201: {car_id, message: "Listing submitted for review. You'll be notified within 24 hours."}

PATCH /{car_id}  (host only, must own car)
- Partial update any car field
- If price changes: notify all guests with pending bookings for this car

DELETE /{car_id}  (host only, must own car)
- Check no active/confirmed bookings: 400 if exists
- Set is_available=False (soft delete)

POST /{car_id}/images  (multipart, host only)
- Validate: jpg/png/webp only, max 5MB each, max 10 total per car
- Pillow processing: resize to max 1920×1080 maintaining aspect ratio, quality=85, convert to WebP
- Create thumbnail: 400×300, quality=75, WebP
- Save to {UPLOAD_DIR}/cars/{car_id}/{uuid}.webp and {uuid}_thumb.webp
- Create CarImage record; if first image, set is_primary=True
Return: {image_id, image_url, thumb_url}

DELETE /{car_id}/images/{image_id}  (host only)
POST /{car_id}/images/{image_id}/set-primary  (host only)
PATCH /{car_id}/images/reorder  body: [{image_id, order_index}]  (host only)

POST /{car_id}/block-dates  (host only)
DELETE /{car_id}/block-dates/{block_id}  (host only)

GET /{car_id}/availability?month=2024-12
Return: [{date: "2024-12-25", status: "unavailable|booked|available"}] for every day in month

POST /{car_id}/pricing-rules  (host only)
DELETE /{car_id}/pricing-rules/{rule_id}  (host only)

GET /host/my-cars  (host only)
Return: all cars with stats {total_bookings, total_earnings, average_rating, pending_bookings_count}

PATCH /host/{car_id}/toggle-availability  (host only)
Return: {is_available: bool}

### backend/app/services/pricing.py

def calculate_booking_price(car, start_dt: datetime, end_dt: datetime,
                              insurance_plan: str, coupon_code: str = None,
                              db_coupon = None) -> dict:

    # Step 1: Duration
    total_seconds = (end_dt - start_dt).total_seconds()
    total_hours = total_seconds / 3600
    total_days = total_hours / 24

    # Step 2: Base calculation
    if total_hours <= 24:
        base_amount = float(car.price_per_hour) * total_hours
    else:
        full_days = int(total_days)
        remaining_hours = total_hours - (full_days * 24)
        base_amount = (float(car.price_per_day) * full_days) + (float(car.price_per_hour) * remaining_hours)

    # Step 3: Apply pricing rules (if any)
    discount_from_rules = 0
    # Weekend discount: check if majority of trip is on weekend
    # Long trip: apply if total_days >= rule.min_days
    # (iterate car.pricing_rules, apply first matching rule)

    # Step 4: Insurance
    insurance_rates = {"basic": 0.05, "standard": 0.08, "platinum": 0.12}
    insurance_amount = base_amount * insurance_rates.get(insurance_plan, 0)

    # Step 5: Coupon
    coupon_discount = 0
    if db_coupon:
        if db_coupon.discount_type == "percent":
            coupon_discount = base_amount * (float(db_coupon.discount_value) / 100)
            if db_coupon.max_discount:
                coupon_discount = min(coupon_discount, float(db_coupon.max_discount))
        else:
            coupon_discount = float(db_coupon.discount_value)

    # Step 6: Platform fee (10% of base after discount)
    taxable = base_amount - coupon_discount
    platform_fee = taxable * 0.10

    # Step 7: Security deposit (not counted in total payment, shown separately)
    security_deposit = float(car.security_deposit)

    total_amount = taxable + insurance_amount + platform_fee
    host_earnings = taxable + insurance_amount - platform_fee

    return {
        "base_amount": round(base_amount, 2),
        "discount_from_rules": round(discount_from_rules, 2),
        "coupon_discount": round(coupon_discount, 2),
        "insurance_amount": round(insurance_amount, 2),
        "insurance_plan": insurance_plan,
        "platform_fee": round(platform_fee, 2),
        "security_deposit": security_deposit,
        "total_amount": round(total_amount, 2),
        "host_earnings": round(host_earnings, 2),
        "duration_hours": round(total_hours, 2),
        "duration_days": round(total_days, 2),
    }

### Frontend: Car Listing Wizard

frontend/src/pages/host/ListCarPage.jsx

Multi-step form with 6 steps. Progress bar at top.
Each step validates with Zod before allowing Next.
State managed with Zustand (persist across step navigation).

--- Step 1: Basic Info ---
Fields:
- Make: searchable Select (50+ Indian car brands: Maruti Suzuki, Hyundai, Honda, Tata, Toyota, Mahindra, Kia, MG, Ford, Volkswagen, Skoda, Renault, Nissan, Jeep, BMW, Mercedes-Benz, Audi, Volvo, Jaguar, Land Rover + more)
- Car Model: text input (auto-suggest based on selected make)
- Year: Select 2010–2024
- Color: color picker + label (8 preset colors)
- Registration Number: text input, uppercase enforced
- Category: icon-grid selector (Hatchback, Sedan, SUV, MUV, Luxury, Electric, Convertible)
- Transmission: radio card (Manual | Automatic)
- Fuel Type: radio card (Petrol, Diesel, Electric, Hybrid, CNG)
- Seats: number selector (2/4/5/6/7/8+)

--- Step 2: Features & Description ---
Feature toggles with icons (each is a visual toggle card):
AC | Music System | GPS Tracker | Keyless Entry | Sunroof | Child Seat | Luggage Carrier

Description: textarea (min 50 chars, max 1000 chars, live char counter)
"Good description tips" collapsible tips section

--- Step 3: Location ---
- City: Select (50 Indian cities with state labels)
- Area/Locality: text input
- Full address: textarea
- Leaflet map (default center = selected city coordinates)
  - Click to place pin → auto-fill location_lat, location_lng
  - Drag marker to fine-tune
  - Show 200m fuzzy radius circle (exact location protected)
- Note: "Exact address only shared with confirmed guests"

--- Step 4: Pricing ---
Fields:
- Price per hour: INR input (min ₹20)
- Price per day: INR input (auto-suggest = hourly × 18, editable)
- Security deposit: INR input (optional, can be 0)
- Included KM per day: number input (default 300)
- Extra KM charge: INR input per km
- Minimum trip duration: Select (2h / 4h / 8h / 12h / 24h)
- Maximum trip duration: Radix Slider (1–30 days)
- Auto-accept bookings: toggle switch with explanation tooltip

Monthly earnings estimator (live):
- "If booked 15 days/month: Estimated ~₹{calc} in earnings"
- Updates as user types price

--- Step 5: Photos ---
- react-dropzone area (drag and drop + click to browse)
- Accepts: jpg, png, webp; max 5MB each; max 10 files
- Photo grid preview with:
  - Drag to reorder (react-beautiful-dnd or dnd-kit)
  - Click star icon → mark as primary (yellow star)
  - X button to remove
- Minimum 3 photos required to proceed
- Photo tips checklist: Front view ✓ | Back view ✓ | Interior ✓ | Dashboard ✓ | Trunk ✓
- Upload progress bar per image

--- Step 6: Review & Submit ---
Read-only summary of all entered data
3 sections: Car Details | Location & Features | Pricing
"Edit" link on each section goes back to that step
Submit button → POST /api/cars
On success: show "🎉 Listing Submitted for Review" modal with confetti
  - "We'll review your listing within 24 hours and notify you."
  - "Go to My Cars" button

### frontend/src/pages/host/ManageCarsPage.jsx
- Summary stat cards: Total Cars | Active | Pending Review | Total Earnings
- Car list with filter tabs: All | Active | Pending | Inactive
- Each car row: primary image, title, city, status badge, price/day, rating, trips, earnings
- Quick actions: Toggle availability | Edit | View Bookings | Delete
- Inline availability toggle switch

### frontend/src/pages/host/EditCarPage.jsx
- All same steps as listing wizard but pre-filled
- Additional section: "Block Dates" calendar
  - Mini calendar UI showing existing blocks in red
  - "Block Dates" form: date range picker + reason
  - List of existing blocks with remove button
- Additional section: "Pricing Rules"
  - Add rule: type selector + value + condition
  - List of existing rules
```

---

## PHASE 7 — Car Search & Discovery

### Prompt

```
You are a senior frontend engineer. Build the complete car search and discovery experience.

### frontend/src/pages/SearchPage.jsx

LAYOUT:
- Desktop: 280px left sidebar + fluid right content
- Mobile: full-width results + bottom-sheet filter drawer

TOP SEARCH BAR (reusable component, also on homepage):
frontend/src/components/search/SearchBar.jsx
- City selector: Combobox with 50 cities, quick-access chips for top 8 cities
- Pickup Date & Time: react-datepicker, inline time selector (30-min intervals)
- Return Date & Time: same, minimum = pickup + 4 hours
- Duration preview chip: "2 Days 4 Hours" auto-updating
- "Search Cars" button
- On submit: navigate to /search with all params in URL query string
- URL sync: on mount, read params from URL and pre-fill form

FILTER SIDEBAR (frontend/src/components/search/FilterSidebar.jsx):

Section 1 — Price Range (₹/day)
  - Radix Slider dual handle: 0–10000
  - Histogram background bars (pre-computed from result set)
  - Input fields showing current values

Section 2 — Category (icon grid, multi-select)
  - Hatchback 🚗 | Sedan 🚙 | SUV 🚐 | MUV 🛻
  - Luxury 💎 | Electric ⚡ | Convertible 🏎️ | Minivan 🚌
  - Each is a toggleable card with icon + label + count badge

Section 3 — Transmission
  - 3 radio cards: Any | Manual | Automatic

Section 4 — Fuel Type (checkbox)
  - Petrol | Diesel | Electric | Hybrid | CNG (with count badges)

Section 5 — Seats (checkbox)
  - 2 | 4 | 5 | 6 | 7 | 8+

Section 6 — Features (checkbox grid with icons)
  - AC | Sunroof | GPS Tracker | Keyless Entry | Child Seat | Music System

Section 7 — Rating
  - Radio: Any | 3+ Stars | 4+ Stars

Section 8 — Sort (on mobile, inside filter sheet; on desktop, above results)
  - Select: Recommended | Price ↑ | Price ↓ | Top Rated | Most Trips | Newest

Mobile filter trigger: sticky "Filters (X)" button (X = active filter count, red badge)
  - Opens Radix Dialog bottom-sheet with all filters
  - "Apply Filters" and "Clear All" buttons

RESULTS AREA:

View toggle: Grid | List | Map (icon buttons)
Result count: "127 cars in Bengaluru for 24 Dec – 26 Dec"

Grid View:
  - 3 cols desktop, 2 cols tablet, 1 col mobile
  - CarCard component (see below)
  - Infinite scroll: intersection observer triggers next page load when last card 200px from bottom
  - Loading state: 6 skeleton CarCards

List View:
  - Horizontal card: image left (200px), details right
  - More info visible: description snippet, all features

Map View:
  - Full Leaflet map (react-leaflet)
  - Custom car markers: white circle with car emoji or price bubble (₹999)
  - Cluster at zoom < 12 using leaflet.markercluster
  - Click marker → slide-in panel on right showing CarCard
  - Map bounds sync: re-fetch /api/cars with lat/lng/radius on map pan/zoom (debounced 500ms)

Empty state: illustration + "No cars found. Try adjusting your filters." + "Clear All Filters" button

frontend/src/components/car/CarCard.jsx (BOTH grid and list variants):
  Props: car object, viewMode (grid|list)

Grid card:
  - 16:9 image with lazy loading (loading="lazy") + shimmer placeholder
  - Heart button top-right (toggles wishlist, fills red when saved)
  - Category badge top-left (color coded: SUV=green, Luxury=gold, Electric=teal)
  - Features row: AC icon | Transmission | Seats | Fuel type icon
  - Car title + year
  - Location: 📍 Area, City
  - Rating: ★ 4.8 · 156 trips (or "New" badge if 0 trips)
  - Price: ₹999/day (prominent)
  - "Book Now" button (outline style, fills on hover)

Hover state: subtle shadow lift + image zoom

### frontend/src/pages/CarDetailPage.jsx

STICKY HEADER: appears when user scrolls past hero section
  - Car title + price + "Book Now" button

HERO GALLERY:
  - Main image: 60vh height, object-cover
  - Thumbnail strip: horizontal scroll, 5 visible
  - Photo count badge
  - Click main image or thumbnail → Lightbox (react-image-gallery full-screen mode)
  - Swipe support on mobile (touch events)

CAR HEADER SECTION:
  - Title (H1): "Honda City 2022"
  - Badges row: category badge | transmission badge | fuel badge
  - Rating row: ★ 4.8 · 156 trips · Bengaluru
  - Action buttons: Share (copy link) | ♡ Wishlist

BOOKING WIDGET (sticky right column desktop / sticky bottom bar mobile):
Desktop — floated right card, sticky top-20:
  - Date range picker (compact, single-line pickup/return)
  - Duration display: "2 Days 4 Hours"
  - Insurance selector: 3 cards side by side
    * Basic — 5% — "Covers minor damage"
    * Standard — 8% — "Covers damage + theft"
    * Platinum — 12% — "Full coverage + roadside"
    * Cards are selectable; selected = red border + checkmark
  - Coupon code: input + Apply button
    * On valid: green tick + "₹100 discount applied"
    * On invalid: red text error
  - Price breakdown (collapsible):
    * Base: ₹999 × 2 days = ₹1998
    * Insurance (Standard): ₹159
    * Coupon discount: -₹100
    * Platform fee: ₹195
    * Total: ₹2252
    * Security Deposit: ₹500 (refundable, shown separately)
  - "Book Now" CTA (full width, red)
  - Login prompt if not logged in
  - KYC prompt if KYC not approved

Mobile — sticky bottom bar with:
  - Price + "Book Now" button
  - Tap "Book Now" → full-screen bottom sheet with booking widget content

FEATURES GRID:
  - Icons with labels: 5 Seats | Manual | Petrol | AC | Music | GPS etc.
  - Organized in 4-col grid

DESCRIPTION:
  - Expandable text (truncate at 200 chars, "Read more" link)

AVAILABILITY CALENDAR:
  - 2-month calendar using a custom CSS grid calendar (no library needed, build from scratch)
  - Color key: 🔴 Unavailable | 🟢 Available | 🟡 Partially booked | ⬜ Past
  - Fetch from GET /api/cars/{car_id}/availability?month=YYYY-MM
  - Clicking an available date range auto-fills the booking widget dates

HOST SECTION:
  - Avatar + name + "Member since {year}"
  - Rating + total reviews + response time + acceptance rate
  - Superhost badge if applicable
  - "View all {N} listings by this host" link → /search?host_id=xxx

REVIEWS SECTION:
  Fetched from MongoDB via GET /api/reviews/car/{car_id}
  - Overall rating + stars visual (e.g. ★★★★★ 4.8)
  - Rating distribution bars: 5★ ████████ 89 | 4★ ████ 34 ...
  - Filter tabs: All | 5★ | 4★ | 3★ | 2★ | 1★
  - Review cards:
    * Guest avatar (or initials placeholder), name, date (formatted "2 months ago")
    * Star rating
    * Review body
    * Host reply (if exists): indented, labeled "Response from [Host Name]"
    * Verified trip badge (green checkmark)
  - "Load 5 more reviews" button (not infinite scroll)

LOCATION MAP:
  - Leaflet map at ~14 zoom, centered on location_lat/lng
  - Circle marker with 200m radius (fuzzy, privacy-safe)
  - Note: "Exact pickup address shared after booking confirmation"

SIMILAR CARS:
  - Horizontal scroll row (mobile) / 4-col grid (desktop)
  - Fetch from /api/cars?city={city}&category={category}&exclude={car_id}&limit=4

### frontend/src/pages/WishlistPage.jsx
- Grid of CarCards
- Empty state: car icon + "No saved cars yet. Start exploring!"
- Remove heart → card fades out with animation
- Wishlist stored: logged-out = localStorage, logged-in = synced to backend

### backend/app/routers/wishlist.py
GET /api/wishlist  (protected)
POST /api/wishlist  body: {car_id}
DELETE /api/wishlist/{car_id}
Table: wishlists (id, user_id FK, car_id FK, created_at) — add to MySQL models
```

---

## PHASE 8 — Booking Flow (Complete End-to-End)

### Prompt

```
You are a senior full-stack engineer. Build the COMPLETE booking flow. Payment is SIMULATED — no real payment gateway. A dialog box confirms payment and booking. No Razorpay. No external payment API calls.

### backend/app/routers/bookings.py

POST /api/bookings/preview  (no auth required)
  Body: {car_id, pickup_datetime, return_datetime, insurance_plan, coupon_code}
  - Validate dates: pickup >= now+1h, return-pickup >= car.min_trip_hours
  - Check car exists and is approved
  - Calculate pricing using pricing.calculate_booking_price()
  - Validate coupon if provided (without consuming it)
  - Return: full price_breakdown dict + any coupon error

POST /api/bookings  (protected, verified user, KYC approved)
  Body: {car_id, pickup_datetime, return_datetime, insurance_plan, coupon_code, guest_notes}

  Validations (return 400 with specific error for each):
  1. Car is_approved=True and is_available=True
  2. No conflicting booking (confirmed/active/pending) for this car in date range
  3. No availability block overlapping date range
  4. pickup_datetime >= now + 1 hour
  5. duration >= car.min_trip_hours
  6. duration in days <= car.max_trip_days
  7. Guest has no other confirmed booking with overlapping times
  8. Coupon valid (if provided): active, not expired, not over limit, applicable to this user

  Logic:
  1. Calculate price breakdown
  2. If coupon: create CouponUsage record, increment coupon.used_count
  3. Create Booking with status='pending'
  4. Generate booking_ref: "JPSN" + random_uppercase(6) — e.g. "JPSNKW9SBT"
     Ensure uniqueness by checking MySQL
  5. Create Payment with status='created', payment_method='simulated'
  6. If car.auto_accept_bookings=True: set status='confirmed', payment status='paid', paid_at=now
     generate simulated_transaction_id = "SIM_TXN_" + uuid4().hex[:12].upper()
  7. If NOT auto-accept: status='pending', payment_status='created'
  8. Notify host: create_notification + send email (Celery task)
  9. Notify guest: create_notification
  10. If auto-accepted: send booking confirmation email to guest + host

  Return 201: {
    booking_id, booking_ref, status,
    price_breakdown, car_title, car_primary_image,
    requires_payment: true/false (true if not auto-accepted yet — payment triggered after host accept)
    NOTE: In this simulated system, for non-auto-accept, payment dialog shows AFTER host confirms
  }

NOTE ON PAYMENT FLOW:
  In the simulated system, all bookings work like this:
  - Non-auto-accept cars: Guest submits booking → status=pending → host accepts → 
    guest sees "Complete Payment" prompt → clicks "Pay ₹XXXX" → dialog shows → 
    clicks "Confirm Payment" → payment record set to paid, booking confirmed → done
  - Auto-accept cars: Booking created + payment completed in one step (dialog shows immediately)

POST /api/bookings/{booking_id}/simulate-payment  (protected, must be booking's guest)
  - Verify booking status is 'confirmed' OR (status='pending' + auto_accept)
  - Verify payment status is 'created'
  - Set payment.status='paid'
  - Set payment.paid_at=now
  - Set payment.simulated_transaction_id = "SIM_TXN_" + uuid4().hex[:12].upper()
  - If booking was pending+auto_accept: confirm booking
  - Send booking confirmation email to guest + host
  - Credit/debit wallet if payment_method='wallet'
  - Create wallet transaction records for both guest (debit) and host (pending credit)
  - Notify guest via MongoDB notification
  Return: {success: true, booking_ref, transaction_id, message: "Payment successful. Booking confirmed!"}

PATCH /api/bookings/{booking_id}/accept  (host only)
  - Verify booking status='pending'
  - Set status='confirmed'
  - Send notification to guest: "Your booking request was accepted! Complete payment to confirm."
  - Send email to guest with payment link

PATCH /api/bookings/{booking_id}/reject  (host only)
  Body: {reason}
  - Set status='rejected', cancellation_reason=reason
  - If payment was made: set refund_status='pending', trigger wallet refund
  - Notify guest

POST /api/bookings/{booking_id}/cancel  (guest or host, protected)
  Body: {reason}
  Cancellation refund policy:
  - Host cancels: 100% refund always
  - Guest cancels > 48h before pickup: 90% refund
  - Guest cancels 24–48h before: 50% refund
  - Guest cancels < 24h before: 0% refund
  - If booking not yet paid: no refund needed, just cancel
  
  Logic:
  - Set status='cancelled', cancelled_by=current_user.id, cancelled_at=now
  - Calculate refund_amount
  - If refund > 0 and payment was made: credit guest wallet, create wallet_transaction
  - Set refund_status='processed' (instant wallet credit)
  - If host cancelled: reduce host acceptance_rate in host_profiles
  - Notify both parties

PATCH /api/bookings/{booking_id}/start-trip  (host only)
  Body: {odometer_start}
  - status must be 'confirmed'
  - Set status='active', actual_pickup_time=now, odometer_start

PATCH /api/bookings/{booking_id}/end-trip  (host only)
  Body: {odometer_end, condition_notes}
  - status must be 'active'
  - Calculate extra_km_charged if odometer_end - odometer_start > included_km_per_day * days
  - Set status='completed', actual_return_time=now, odometer_end
  - Release security deposit: credit to guest wallet if no damage claim
  - Credit host_earnings to host wallet: create wallet_transaction
  - Update car.total_trips += 1
  - Update host_profiles.acceptance_rate
  - Queue Celery task: send_review_request_email (fire after 2 hours)

GET /api/bookings  (protected)
  Query: as_role (guest|host), status, page, limit, start_date, end_date
  Return: paginated bookings with car snapshot + counterparty name/photo

GET /api/bookings/{booking_id}  (protected, guest or host of booking only)
  Return: full booking + car details + payment info + review status (has_reviewed: bool)

POST /api/bookings/{booking_id}/extend  (guest, booking must be active)
  Body: {new_return_datetime}
  - Validate: new_return_datetime > current return_datetime
  - Validate: no conflicting bookings for car in extension period
  - Calculate additional_amount
  - Create BookingExtension with status='pending'
  - Notify host

PATCH /api/bookings/extensions/{extension_id}/respond  (host only)
  Body: {approved: bool}
  - If approved: update booking.return_datetime, create additional payment task
  - Notify guest

### backend/app/routers/payments.py

GET /api/payments/wallet  (protected)
  Return: {balance: float, transactions: [...last 20...]}

POST /api/payments/wallet/add  (protected)
  Body: {amount: float}  (min ₹100, max ₹10000)
  - SIMULATED: instantly credit wallet
  - Create wallet_transaction (type=credit, description="Wallet top-up")
  - Return: {new_balance: float, transaction_id}

POST /api/payments/wallet/pay-booking  (protected)
  Body: {booking_id}
  - Check wallet balance >= booking total_amount
  - Deduct from wallet, mark payment paid
  - Calls same logic as simulate-payment

GET /api/payments/booking/{booking_id}  (protected)
  Return: payment record for this booking

### Frontend Pages

#### frontend/src/pages/booking/BookingConfirmPage.jsx
Route: /booking/confirm/:carId  (reads dates/insurance from location state or URL params)

Layout: 2-column (car summary left, price breakdown right on desktop)

Left column:
  - Car primary image + title + location
  - Trip details: Pickup date/time + Return date/time + Duration
  - Pickup location (from car listing)
  - Change dates link (goes back)

Right column — Booking Summary Card:
  - Insurance plan selector (3 radio cards: Basic / Standard / Platinum)
    Each card: plan name + price % + bullet list of coverage
  - Coupon code: text input + "Apply" button
    States: empty, loading, applied (green ✓ + discount shown), invalid (red message)
  - Price breakdown table:
    * Base amount (hourly/daily rate × duration)
    * Rule discount (if any, shown green)
    * Coupon discount (if applied, green)
    * Insurance
    * Platform fee
    * ──────────
    * Total (bold, large)
    * Security deposit: ₹500 (refundable, separate note)
  - Guest notes: textarea (optional, placeholder: "Any specific instructions for the host?")
  - KYC warning banner (if KYC not approved): amber banner with "Complete KYC" link
  - "Confirm & Proceed" CTA button (disabled if KYC not approved)
  - Cancellation policy summary (collapsible)

On submit → POST /api/bookings → navigate to /booking/pay/:bookingId

#### frontend/src/pages/booking/PaymentPage.jsx
Route: /booking/pay/:bookingId

Shows booking summary at top (car, dates, total).

PAYMENT METHOD SECTION:
Two options presented as selectable cards:

Card 1 — "Pay Now" (Simulated)
  - Icon: credit card / UPI icon (decorative)
  - Title: "Card / UPI / Net Banking"
  - Subtitle: "Secure simulated payment"
  - When selected: show simulated card input fields (decorative, not validated):
    * Card number input (auto-formats XXXX XXXX XXXX XXXX)
    * Expiry input (MM/YY)
    * CVV input (masked)
    * Cardholder name
    (These are purely UI — not sent to any backend. The "Pay" button just calls simulate-payment.)

Card 2 — "Pay with Wallet"
  - Show current wallet balance
  - If balance >= total: enabled + "Sufficient balance" green text
  - If balance < total: show deficit + "Add ₹{deficit} to wallet" link (opens add-money modal)
  - When selected: no sub-form needed

"Pay ₹{total}" CTA button (full width, red, animated loading state)

On click "Pay ₹{total}":
  → Show PAYMENT PROCESSING DIALOG (Radix Dialog):
    Content:
    ┌─────────────────────────────────────┐
    │  💳 Confirm Payment                  │
    │                                     │
    │  Amount: ₹2,252                     │
    │  Booking: JPSNKW9SBT               │
    │  Car: Honda City 2022               │
    │                                     │
    │  Method: Simulated Card Payment     │
    │  (Safe demo environment)            │
    │                                     │
    │  [Cancel]    [Confirm & Pay ₹2,252] │
    └─────────────────────────────────────┘
  
  On "Confirm & Pay":
    1. Show loading spinner inside dialog: "Processing payment..."
    2. Call POST /api/bookings/{booking_id}/simulate-payment (or wallet pay)
    3. On success (after 1.5s simulated delay for UX):
       - Dialog content changes to success state:
         ┌────────────────────────────────┐
         │  ✅ Payment Successful!         │
         │                                │
         │  Transaction ID: SIM_TXN_X4K9  │
         │  Amount: ₹2,252 paid           │
         │                                │
         │     [View Booking Details]     │
         └────────────────────────────────┘
    4. Navigate to /booking/success?ref={booking_ref}

#### frontend/src/pages/booking/BookingSuccessPage.jsx
Route: /booking/success?ref=JPSNKW9SBT

Full-screen success view:
- Framer Motion confetti burst (CSS keyframe-based colored circles)
- Giant green ✅ checkmark (animated scale-in)
- "Booking Confirmed!" headline
- Booking ref in code block: JPSNKW9SBT (with copy button)
- Summary: car name, dates, total paid
- CTA buttons: "View Booking Details" | "Explore More Cars" | "Go Home"
- "A confirmation email has been sent to {email}"

#### frontend/src/pages/booking/BookingDetailsPage.jsx
Route: /dashboard/bookings/:bookingId

Status Timeline (horizontal stepper):
  Pending → Confirmed → Active → Completed
  Current step highlighted in red, completed steps in green

Booking Info Card:
  - Booking ref + QR code (generate SVG QR using a pure JS lib — qrcode.js)
  - Status badge (colored)
  - Car: image + name + registration number (shown after confirmed)
  - Host: name + phone (phone revealed only after confirmed status)
  - Dates: pickup + return
  - Pickup location (full address after confirmed)
  - Duration + total paid

Payment Info:
  - Amount paid + transaction ID
  - Insurance plan
  - Refund info (if cancelled)

Action Buttons (contextual based on status):
  - status=pending: [Cancel Booking]
  - status=confirmed: [Cancel Booking] [Extend Trip request]
  - status=active: [Extend Trip] [Get Help]
  - status=completed: [Write a Review] (if not reviewed) | [View Review] (if reviewed)
  - All statuses: [Contact Support]

Invoice Download: 
  - "Download Invoice" button → generate PDF-like HTML in a new tab with print-ready CSS
  - Include: booking details, price breakdown, Zoomcar branding

#### frontend/src/pages/booking/MyBookingsPage.jsx
Route: /dashboard/bookings

Tabs: Upcoming (confirmed/pending) | Active | Completed | Cancelled

Booking cards per tab:
  - Car image + title
  - Date range
  - Duration
  - Amount
  - Status badge
  - [View Details] button
  - [Cancel] (if cancellable)
  - [Write Review] (if completed, not yet reviewed)

Date range filter + status filter dropdown
"No bookings yet" empty state per tab with appropriate CTA

### Host Booking Management

#### frontend/src/pages/host/BookingRequestsPage.jsx
Route: /host/bookings

Tabs: Pending Requests | Upcoming | Active | Completed | Cancelled | All

Pending request card (prominent):
  - Guest photo + name + "verified guest" badge
  - Car name
  - Requested dates + duration
  - Total earnings highlighted
  - "Expires in: X hours" countdown (24h window)
  - [Accept] [Reject] buttons (side by side, green/red)
  - Reject → modal with reason dropdown: "Dates not available" | "Car maintenance" | "Other" + optional text

Accepted bookings:
  - Similar card, no accept/reject, shows "Confirmed" badge
  - [Start Trip] button (shows when pickup time is within 2 hours)
  
Active trips:
  - "Trip in progress" badge
  - Elapsed time counter
  - [End Trip] button → modal: odometer reading input + condition notes

#### frontend/src/pages/host/ActiveTripsPage.jsx
  - Only active trips shown
  - Large card per trip with all details
  - "End Trip" modal with:
    * Odometer end reading input
    * Condition: radio (Perfect | Minor scratches | Damage) 
    * Notes textarea
    * Submit → PATCH /api/bookings/{id}/end-trip
```

---

## PHASE 9 — User Dashboard, Profiles & KYC

### Prompt

```
You are a senior full-stack engineer. Build the complete user-facing dashboard system.

### backend/app/routers/users.py

GET /api/users/profile  (protected)
  Return: user + kyc_status + wallet_balance + {
    total_trips_as_guest, upcoming_trips_count,
    total_spent, member_since, unread_notifications_count
  }

PATCH /api/users/profile  (protected)
  Body: {full_name, phone}
  Validate phone: 10-digit Indian format

POST /api/users/profile/avatar  (multipart, protected)
  - Validate: image file (jpg/png/webp), max 2MB
  - Pillow: crop to square, resize to 400×400, save as WebP
  - Save to uploads/avatars/{user_id}.webp
  - Update user.profile_picture with relative path

GET /api/users/{user_id}/public
  Return: {full_name, profile_picture, member_since, rating_as_guest, total_trips}
  If is_host: also include {host_rating, total_listings, is_superhost, host_bio}

### backend/app/routers/kyc.py

GET /api/kyc/status  (protected)
  Return: kyc record (with masked document numbers) + status

POST /api/kyc/submit  (multipart, protected)
  Fields: dl_number, aadhar_number
  Files: dl_front (image), dl_back (image), aadhar_front (image), aadhar_back (image)
  - Validate: jpg/png/pdf, max 5MB each
  - For each image: compress with Pillow, save to uploads/kyc/{user_id}/
  - Aadhar number: mask all but last 4 before storing (e.g. XXXX-XXXX-1234)
  - Create/update KYC record, set status='under_review', submitted_at=now
  - Notify all admins via MongoDB notification
  - Fire email task: kyc_submission_confirmation to user
  Return: {message: "KYC submitted successfully. We'll review within 24 hours."}

POST /api/kyc/resubmit  (protected, only if status='rejected')
  Same as submit but replaces existing record

(Admin) GET /api/admin/kyc  query: status, page, limit
(Admin) POST /api/admin/kyc/{kyc_id}/approve
  - Set status='approved', reviewed_at=now, reviewed_by=admin_id
  - Set user.is_verified=True (already is, but ensure)
  - Fire email: send_kyc_approved_email
  - Create MongoDB notification for user
  - Log activity: log_activity(admin_id, "kyc_approved", "user_kyc", kyc_id)

(Admin) POST /api/admin/kyc/{kyc_id}/reject
  Body: {reason}
  - Set status='rejected', rejection_reason=reason, reviewed_by=admin_id
  - Fire email: send_kyc_rejected_email
  - Create MongoDB notification for user

### Frontend Dashboard

frontend/src/pages/user/DashboardPage.jsx
Route: /dashboard

Layout: sidebar nav on desktop (collapsible), bottom nav on mobile

Sidebar nav items with icons:
  Overview | My Bookings | KYC Verification | Wallet | Notifications
  Wishlist | Reviews | Support | Settings

Overview page content:

Welcome header: "Good morning, Priya! 👋"

Stats row (4 cards):
  - Total Trips: N (with car icon)
  - Wallet Balance: ₹X,XXX (with wallet icon, clickable → /dashboard/wallet)
  - Upcoming Trips: N (with calendar icon)
  - Saved Cars: N (with heart icon)

KYC Status Banner (conditional):
  - Not submitted (yellow): "Complete KYC to unlock bookings" [Complete Now →]
  - Under review (blue): "KYC under review. Expected 24-48 hours."
  - Approved (green): "✓ KYC Verified — You're all set!"
  - Rejected (red): "KYC rejected. Please resubmit." [Resubmit →]

Upcoming Trips section (next 2 bookings):
  - Small booking cards with dates + car name + countdown ("Trip in 3 days")
  - "View All Bookings" link

Recent Notifications (last 4):
  - Notification items with icons
  - "View All" link

Quick Actions grid:
  - 🚗 Book a Car | 🏠 List Your Car | 📋 Complete KYC | 🎫 Refer a Friend (placeholder)

### frontend/src/pages/user/ProfilePage.jsx

Two-column form layout:
Left: profile photo (circle, 120px) with edit/upload overlay button
Right: form fields

Personal Info form:
  - Full Name (editable)
  - Email (display only, grayed out)
  - Phone (editable, with +91 prefix)
  - Profile photo upload (hidden input triggered by overlay button)
  - [Save Changes] button

Security section:
  - [Change Password] button → inline expandable form:
    * Current password
    * New password (with strength meter)
    * Confirm new password
    * [Update Password] button

Notification Preferences (checkboxes):
  - ✉ Booking updates via email
  - 📢 Promotions and offers
  - 🏠 Host activity updates

Danger Zone (red section):
  - [Delete Account] button → confirmation modal:
    "This action is irreversible. Type DELETE to confirm."
    Input field + confirm button

### frontend/src/pages/user/KYCPage.jsx

STATE 1 — Not Submitted:
  Header: "Verify Your Identity"
  Why KYC? explanation box:
    - "Required to book any car on Zoomcar"
    - "Takes 2-3 minutes to submit"
    - "Documents reviewed within 24 hours"
  
  Upload form:
  Section A — Driver's License
    - DL Number: text input (format hint: "e.g. DL-0420110012345")
    - Front side: file upload (drag/click, preview) 
    - Back side: file upload (drag/click, preview)
  
  Section B — Aadhaar Card
    - Aadhaar Number: text input, auto-mask after entry (show last 4 only)
    - Front side: file upload with preview
    - Back side: file upload with preview
  
  File upload component:
    - Dashed border drop zone
    - Accepted formats: JPG, PNG, PDF
    - Max 5MB
    - Preview image after upload
    - Remove button
    - If PDF: show PDF icon instead of preview
  
  [Submit KYC] button (disabled until all 5 fields filled)

STATE 2 — Under Review:
  - Large clock illustration
  - "Documents Under Review"
  - "Submitted: {submitted_at date}"
  - "Expected: Within 24 hours"
  - Submitted documents summary (masked): DL ending in XXX | Aadhaar ending in XXXX
  - Yellow info box: "We'll send you an email and notification once verified."

STATE 3 — Approved:
  - Large green checkmark
  - "KYC Verified ✓"
  - Verified badge
  - Submission date + approval date
  - "You're fully verified and can book any car on Zoomcar!"
  - [Book a Car] CTA

STATE 4 — Rejected:
  - Red X illustration
  - "Verification Failed"
  - Rejection reason in amber box
  - Tips to fix (e.g. "Make sure all documents are clearly visible")
  - [Resubmit Documents] → same form as STATE 1, pre-filled where possible

### frontend/src/pages/user/WalletPage.jsx

Balance card:
  - Large balance: ₹2,450.00
  - "Add Money" button → opens modal

Add Money Modal:
  - Preset amounts: [₹500] [₹1000] [₹2000] [₹5000]
  - Custom amount input
  - "Add ₹{amount} to Wallet" button
  - On click → show simulated payment dialog (same pattern as booking payment)
  - On confirm → POST /api/payments/wallet/add
  - Close dialog, show success toast, update balance

Transaction history:
  - Filter tabs: All | Credits | Debits
  - Date range filter
  - Table columns: Date | Description | Type | Amount (green credit / red debit) | Balance After
  - Paginated (20 per page)
  - "Download CSV" button: generates CSV in frontend from loaded data
    (Create blob URL from array, trigger download)

### frontend/src/pages/user/NotificationsPage.jsx

Full-page notifications list.
Filter tabs: All | Unread | Booking | Payment | KYC | System

Notification item:
  - Icon by type (colored)
  - Title (bold if unread) + message
  - Time ago (react-timeago or date-fns formatDistanceToNow)
  - Unread indicator dot (left border blue)
  - Click → mark as read + navigate to action_url (if any)

"Mark all as read" button (top right)
Infinite scroll (poll MongoDB: GET /api/notifications?page={n})
Empty state per filter tab
```

---

## PHASE 10 — Reviews, Notifications & Support

### Prompt

```
You are a senior full-stack engineer. Build the reviews system (MongoDB), notifications routing, and customer support system.

### backend/app/routers/reviews.py

POST /api/reviews  (protected, verified user)
  Body: {booking_id, rating (1-5), title, body, review_type}
  
  Validations:
  - Booking must exist and belong to current user (as guest or host)
  - Booking status must be 'completed'
  - review_type must match caller's role (guest → guest_to_car or guest_to_host, host → host_to_guest)
  - Booking completed_at must be within 14 days (review window)
  - No existing review for this booking + review_type combination
  - Rating must be integer 1-5
  
  Logic:
  - Fetch reviewer's name + photo snapshot from MySQL
  - Fetch car snapshot (title, make, model, year, primary_image)
  - Fetch trip snapshot (pickup_date, return_date)
  - Create ReviewDoc in MongoDB
  - Update car.average_rating in MySQL: recalculate from MongoDB aggregate
  - Update car.total_trips if first review for this booking
  - Create notification for the reviewee (host or car owner, or guest)
  - Log activity

POST /api/reviews/{booking_id}/host-reply  (host only)
  Body: {reply}
  - booking must have a guest_to_car or guest_to_host review in MongoDB
  - car must belong to current host
  - Update ReviewDoc: set host_reply, host_replied_at
  - Notify reviewer of host reply

GET /api/reviews/car/{car_id}?page&limit&sort&rating_filter
  - Fetch from MongoDB with aggregation
  - Return: {reviews: [], total, avg_rating, rating_breakdown: {5:N, 4:N, 3:N, 2:N, 1:N}, has_more}

GET /api/reviews/user/{user_id}?type=received  (protected)
  Return reviews about this user (as guest or host)

GET /api/reviews/my/given  (protected)
  Return reviews submitted by current user

GET /api/reviews/booking/{booking_id}  (protected)
  Return: reviews for this booking (both guest_to_car and host_to_guest if exist)

### backend/app/routers/notifications.py

GET /api/notifications?page&limit&type  (protected)
  - Call get_user_notifications(user_id, page, limit) from MongoDB
  - Optionally filter by notification_type
  Return: {notifications: [], total_unread: N, has_more: bool}

GET /api/notifications/unread-count  (protected)
  Return: {count: N}
  Cache result in Redis with 30s TTL per user

PATCH /api/notifications/{notification_id}/read  (protected)
  Call mark_notification_read(notification_id)

PATCH /api/notifications/mark-all-read  (protected)
  Call mark_all_read(user_id)

DELETE /api/notifications/{notification_id}  (protected)
  Call delete_notification(notification_id)

### backend/app/routers/support.py

POST /api/support/tickets  (protected or anonymous — allow no-auth with email field)
  Body: {booking_ref, subject, description, category, email (if not auth)}
  - Create SupportTicket in MySQL
  - Auto-set priority: payment/car_issue → high, booking → medium, others → low
  - Add initial message to MongoDB: add_support_message(ticket_id, user_id, name, 'user', description)
  - Notify all admins (MongoDB notification)
  Return: {ticket_id, message: "Ticket #{id} created. We'll respond within 24 hours."}

GET /api/support/tickets  (protected)
  Return: user's tickets with latest message preview and status

GET /api/support/tickets/{ticket_id}  (protected, must own ticket or be admin)
  Return: ticket + all messages from MongoDB

POST /api/support/tickets/{ticket_id}/messages  (protected)
  Body: {message, attachment (optional file)}
  - Add to MongoDB: add_support_message(...)
  - If user replying: notify assigned admin/staff
  - If staff replying: notify ticket owner
  - Update ticket.updated_at in MySQL (signals new activity)

PATCH /api/support/tickets/{ticket_id}/close  (protected, ticket owner)
  - Set status='closed'
  - Add system message: "Ticket closed by user."

POST /api/support/contact  (no auth required)
  Body: {name, email, phone, category, message}
  - Create anonymous support ticket
  - Return: {message: "Thank you. We'll get back to you within 24 hours."}

### Celery Tasks (backend/app/tasks.py)

@celery_app.task
def send_email_task(email_type: str, to_email: str, data: dict):
    """Routes to appropriate email function"""

@celery_app.task
def send_review_request_task(booking_id: str):
    """Fires 2 hours after trip end to send review emails"""

@celery_app.task
def auto_cancel_unpaid_bookings():
    """Every 30 min: cancel pending bookings not actioned in 24h (host timeout)"""
    # Find bookings: status=pending AND created_at < now - 24h
    # Set status='cancelled', cancellation_reason='Host did not respond'
    # Notify guest, refund if paid

@celery_app.task  
def update_superhost_status():
    """Daily task: check all hosts for superhost eligibility"""

@celery_app.task
def send_trip_reminder_task(booking_id: str):
    """Queued at booking confirmation: fires 2h before pickup"""

Setup Celery beat schedule:
  - auto_cancel_unpaid_bookings: every 30 minutes
  - update_superhost_status: daily at 2am

### Frontend: Reviews

#### frontend/src/pages/booking/WriteReviewPage.jsx
Route: /booking/review/:bookingId

Sections (tabs if both needed):
  Tab 1: "Rate the Car"
  Tab 2: "Rate the Host"
  (tabs only shown if both review types pending)

Each tab:
  - Car/host image + name
  - Star selector: 5 large interactive stars (hover to preview, click to set)
    Animation: stars fill with color + subtle bounce on selection
  - Title input: "Summarize your experience" (optional, max 100 chars)
  - Body textarea: "Tell others about your trip..." (min 30 chars, max 2000, live counter)
  - Submit button

On success: Lottie-like CSS animation (star burst) + "Review submitted! Thank you." + navigate to booking

#### frontend/src/components/reviews/ReviewCard.jsx
- Reviewer avatar (circle, 40px) with initials fallback
- Reviewer name + "Verified Trip" green badge
- Date formatted as "December 2024"
- Star rating (filled stars visual)
- Title (bold) + body text (expandable if > 200 chars)
- Host reply block (if exists):
  * Indented left border in red
  * "Response from [Host Name]" header
  * Reply text
  * Reply date

#### frontend/src/pages/user/ReviewsPage.jsx
Route: /dashboard/reviews

Tabs: Reviews I've Given | Reviews I've Received

Each tab shows ReviewCards with relevant context
Empty states with CTAs

### Frontend: Support

#### frontend/src/pages/user/SupportPage.jsx
Route: /dashboard/support

Left panel: Ticket list
  - Filter: All | Open | In Progress | Resolved
  - Ticket item: subject, category badge, status badge, last updated, unread message indicator
  - "New Ticket" button → modal

New Ticket Modal:
  - Category: Select (Booking Issue | Payment | Car Issue | Account | Other)
  - Booking Ref: text input (optional, with lookup: GET /api/bookings to validate)
  - Subject: text input
  - Description: textarea (min 20 chars)
  - [Submit Ticket] button

Right panel (when ticket selected): Chat view
  - Ticket subject + status + priority badges at top
  - Message thread (chronological)
    * User messages: right-aligned (blue bubble)
    * Staff messages: left-aligned (gray bubble) with "Zoomcar Support" label
    * System messages: center-aligned (italic)
  - Reply input at bottom: textarea + Send button + file attachment button
  - [Close Ticket] button

### Frontend: Notification Bell Component
frontend/src/components/layout/NotificationBell.jsx

- Bell icon with red badge showing unread count (hidden if 0)
- Click → dropdown panel (max-h 400px, overflow-y scroll)
- Poll /api/notifications/unread-count every 30 seconds (React Query refetchInterval)
- Panel shows last 8 notifications:
  * Icon by type + title + time ago
  * Unread items have blue left border + light background
  * Click item → mark read + navigate to action_url
- Footer: "Mark all read" | "View all notifications"
- On new notifications (count increases): show toast "You have N new notifications"
```

---

## PHASE 11 — Admin Dashboard

### Prompt

```
You are a senior full-stack engineer. Build the complete Admin Dashboard.

Admin routes: all prefixed /admin/* in React. All backend routes require role='admin'.
Admin panel is a completely separate layout from the main site.

### backend/app/routers/admin.py

All routes prefixed /api/admin/ — require require_admin dependency.

GET /stats/overview
  Return:
  - users: {total, new_today, new_this_week}
  - hosts: {total, new_this_month}
  - cars: {total, approved, pending_approval, inactive}
  - bookings: {total, this_month, active_now, completed_this_month}
  - revenue: {total_all_time, this_month, this_week, platform_fees_this_month}
  - pending: {kyc_count, car_approval_count, support_tickets_count, payout_requests_count}
  Pull stats from MySQL aggregates + Redis for active counts

GET /analytics/revenue?period=monthly&year=2024
  Return: [{month: "Jan", gross: X, platform_fee: X, host_payouts: X, refunds: X}] × 12

GET /analytics/cities
  Return: [{city, booking_count, revenue, active_cars}] top 10

GET /analytics/top-cars?limit=10
  Return: cars sorted by revenue, with: title, host_name, trips, revenue, rating

GET /analytics/activity-feed?page&limit
  Return: MongoDB activity_feed documents

GET /users?search&role&is_active&is_verified&page&limit
  Search across full_name, email, phone

GET /users/{user_id}/details
  Return: full user + kyc + booking summary + wallet balance

PATCH /users/{user_id}
  Body: {is_active, role}
  - If deactivating: cancel all pending bookings, notify user

GET /cars?status&city&category&host_id&page&limit
  status options: pending|approved|inactive|all

PATCH /cars/{car_id}/approve
  - Set is_approved=True
  - Notify host (email + MongoDB notification)
  - Log activity

PATCH /cars/{car_id}/reject
  Body: {reason}
  - Set is_available=False (not approved)
  - Notify host with reason

PATCH /cars/{car_id}/feature  (toggle is_featured)

GET /bookings?status&city&start_date&end_date&page&limit
GET /bookings/{booking_id}

GET /kyc?status&page&limit  (paginate, sorted by submitted_at ASC for queue order)
POST /kyc/{kyc_id}/approve  (same as user-facing kyc route)
POST /kyc/{kyc_id}/reject

GET /payments?status&start_date&end_date&page&limit
POST /payments/{payment_id}/manual-refund
  Body: {amount, reason}
  - Credit user wallet
  - Create wallet_transaction
  - Update payment.status='refunded'

GET /support?status&priority&page&limit
POST /support/{ticket_id}/reply
  Body: {message}
  - add_support_message with is_staff_reply=True
  - Update ticket status to 'in_progress' if was 'open'
  - Notify ticket owner
PATCH /support/{ticket_id}/status
PATCH /support/{ticket_id}/priority

GET /coupons?active&page&limit
POST /coupons
PATCH /coupons/{coupon_id}
DELETE /coupons/{coupon_id}

GET /payouts?status&page&limit
PATCH /payouts/{payout_id}/process  (set status=processing)
PATCH /payouts/{payout_id}/complete (set status=paid, processed_at=now, send email to host)
PATCH /payouts/{payout_id}/fail     (set status=failed, refund to wallet, notify host)

### Frontend Admin Pages

All in frontend/src/pages/admin/

#### AdminLayout.jsx
Dark sidebar (width 240px, collapsible to 64px icon-only mode).
Color scheme: dark gray sidebar (#1F2937), red accents (#E31837), white content area.

Sidebar menu items with icons (lucide-react):
  📊 Dashboard | 👥 Users | 🚗 Cars (N badge) | 📅 Bookings
  🆔 KYC (N badge) | 💳 Payments | 🎫 Coupons | 🎧 Support (N badge)
  📈 Analytics | 💰 Payouts | ⚙️ Settings

Header: Admin name + role badge + logout button

#### AdminDashboardPage.jsx

Stats grid (6 cards, 2 rows):
  Row 1: Total Users | Total Cars | Revenue This Month | Active Bookings Now
  Row 2: Pending KYC | Open Tickets | Pending Car Approvals | Payout Requests

Each stat card: big number + subtitle + trend arrow (up/down vs last week)

Charts section (2×2 grid using Recharts):
  1. Line chart: Daily bookings (last 30 days) — tooltip with count
  2. Bar chart: Monthly revenue (last 12 months, stacked: platform fee + host payouts)
  3. Donut chart: Booking status distribution (confirmed/active/completed/cancelled)
  4. Area chart: New users (last 12 months)

Pending actions section:
  Quick links to KYC queue, car approvals, support tickets (with counts)

Activity feed (last 10 events from MongoDB):
  Each item: actor avatar initials + action description + entity + time ago

#### AdminUsersPage.jsx

Search bar + filters (role dropdown, active status dropdown)
Data table (shadcn Table or custom):
  Columns: # | Avatar+Name | Email | Phone | Role | KYC | Bookings | Status | Actions

Row actions (dropdown menu per row):
  - View Details (opens side panel)
  - Suspend / Reactivate
  - Change Role (modal)

User Details Side Panel (slide-in from right):
  - Full profile info
  - KYC status with document thumbnails
  - Recent bookings list (last 5)
  - Wallet balance
  - Account actions

Bulk select + Bulk Suspend action

#### AdminCarsPage.jsx

Tabs: Pending (badge with count) | Approved | Rejected | All

Car table:
  Columns: Car Image | Title+City | Host | Category | Price/day | Trips | Status | Listed Date | Actions

Row actions:
  - Approve (green, shows for pending)
  - Reject (red, modal for reason, shows for pending)
  - Feature/Unfeature (star toggle)
  - View Details (opens full car detail in modal/panel)

Filter: city select, category select, sort by: newest | oldest | price | rating

Car Details Panel:
  - All car images (scrollable)
  - All car details
  - Host info
  - Approve/Reject buttons (large, at top)
  - Rejection reason textarea

#### AdminKYCPage.jsx

Tab: Under Review (queue, oldest first) | Approved | Rejected

KYC table:
  Columns: Submitted Date | User Name | Email | DL Number | Aadhar | Status | Actions

Click row → KYC Review Panel (full-screen modal or side panel):
  - User info (name, email, phone, member since)
  - DL Number + DL Front image + DL Back image (lightbox on click)
  - Aadhaar Number + Aadhaar Front + Aadhaar Back (lightbox on click)
  - Images shown large enough to read
  - [Approve] (green button) + [Reject] (red button with reason dropdown):
    Rejection reasons: "Documents unclear/blurry" | "DL expired" | "Documents don't match" |
    "Fake documents suspected" | "Incomplete submission" | "Other (specify)"
  - After action: row removed from tab, move to approved/rejected tab

#### AdminAnalyticsPage.jsx

Date range selector: preset (7d | 30d | 3m | 6m | 1y | custom date range picker)

Charts (all Recharts, all responsive):
  1. Revenue trend: composed chart (bar = gross, line = platform fee), filterable by period
  2. Top cities: horizontal bar chart (booking count + revenue per city)
  3. Top 10 cars table: rank | image | title | host | trips | revenue | rating
  4. Car category distribution: pie chart
  5. Booking funnel: funnel chart or horizontal bars: Views → Bookings → Completed → Reviewed
  6. New users trend: area chart

All charts: hover tooltips, export to PNG button (html2canvas)

#### AdminCouponsPage.jsx

Coupon list table: Code | Type | Value | Min Amount | Usage | Valid Until | Status | Actions

Create/Edit Coupon Modal:
  - Code (uppercase enforced, check uniqueness)
  - Description
  - Type: Percent / Flat Off
  - Value input
  - Max discount (if percent)
  - Min booking amount
  - Usage limit (optional, empty = unlimited)
  - Valid From + Valid Until (date range picker)
  - Applicable for: All Users / New Users Only
  - Active toggle
  [Save Coupon]

Per coupon: usage stats: "{used_count} / {limit} uses"

#### AdminSupportPage.jsx

Split view: ticket list (left 40%) + active ticket (right 60%)

Ticket list with filters: All | Open | In Progress | Resolved | Closed
Each ticket item:
  - Subject (bold if unread by staff)
  - Category badge + Priority badge (color-coded)
  - User name + booking ref (if any)
  - Last activity time
  - Unread indicator

Active ticket panel:
  - Ticket header: subject + ID + status + priority
  - User info bar (name, email, booking ref)
  - Message thread (same chat UI as user side)
  - Status change + priority change dropdowns at top
  - Reply textarea + [Send Reply] button
  - Staff reply marked as "Zoomcar Support"
```

---

## PHASE 12 — Host Earnings, Payouts & Superhost

### Prompt

```
You are a senior full-stack engineer. Build the complete host earnings, payout, and superhost systems.

### backend/app/routers/host_earnings.py

GET /api/host/earnings/summary  (host only)
  Return:
  - total_earned_all_time (from wallet_transactions)
  - total_earned_this_month
  - total_earned_last_month
  - wallet_balance (from user_wallet)
  - total_trips_completed
  - average_earnings_per_trip
  - best_car: {id, title, trips, earnings}
  - month_over_month_change_percent

GET /api/host/earnings/monthly?year=2024  (host only)
  Return: [{month: "Jan", trips: N, gross: X, platform_fees: X, net: X}] × 12

GET /api/host/earnings/per-car  (host only)
  Return: [{car_id, title, primary_image, trips, gross, platform_fees, net, avg_rating}]

GET /api/host/earnings/transactions?page&limit  (host only)
  Return: paginated wallet transactions (credits only) with booking_ref if applicable

POST /api/host/payouts/request  (host only)
  Body: {amount: float}
  Validations:
  - amount >= 500 (min payout)
  - amount <= wallet_balance
  - host has bank account details in host_profiles
  - No pending payout request exists
  - Deduct from wallet immediately (hold state)
  - Create HostPayoutRequest with status='pending'
  - Notify admins
  Return: {message: "Payout of ₹{amount} requested. Processed within 2-3 business days."}

GET /api/host/payouts  (host only)
  Return: payout history list

POST /api/host/profile/bank-details  (host only)
  Body: {bank_name, account_number, ifsc, account_holder}
  - Validate IFSC: 11-char alphanumeric format
  - Mask account number: store but show only last 4 digits
  - Update host_profiles

GET /api/host/profile  (host only)
  Return: host_profile + all stats

### backend/app/services/superhost.py

async def check_and_update_superhost(host_id: str, db: AsyncSession):
    """
    Superhost criteria:
    1. total completed trips >= 10
    2. average_rating >= 4.7 (from host_profiles)
    3. acceptance_rate >= 85%
    4. No host-initiated cancellations in last 90 days
    
    If all met AND not currently superhost: set is_superhost=True, notify host
    If any not met AND currently superhost: set is_superhost=False, notify host
    """
    host = await db.get(HostProfile, host_id)
    # check bookings, cancellations in last 90 days
    # update is_superhost accordingly

### Frontend Host Pages

#### frontend/src/pages/host/HostDashboardPage.jsx
Route: /host/dashboard

Layout: host-specific sidebar + content

Summary cards (animated number counters on page load):
  - This Month Earnings: ₹X,XXX
  - Total Trips (All Time): N
  - Active Listings: N
  - Avg Car Rating: 4.8 ★
  - Pending Requests: N (red badge if > 0)

Superhost banner (if is_superhost):
  - Gold gradient card: "🏆 You're a Superhost!" + criteria breakdown

Charts row (Recharts):
  - Bar chart: Earnings last 6 months
  - Donut: Trips per car (top 3 cars)

Active listings grid (max 3, "View All"):
  - Car image + name + quick stats (rating, trips, status toggle)

Recent bookings table (last 5):
  - Guest | Car | Dates | Amount | Status | Action

Quick actions: [+ List New Car] [Manage Bookings] [Withdraw Earnings]

#### frontend/src/pages/host/HostEarningsPage.jsx
Route: /host/earnings

Summary stats row (5 cards):
  All-Time Earnings | This Month | Last Month | Avg per Trip | Total Trips

Per-Car Earnings Table:
  Columns: Car (image + name) | Trips | Gross Earnings | Platform Fee | Net Earnings | Avg Rating
  Sortable columns

Monthly Trend Chart (Recharts area chart):
  - Year selector
  - Stacked area: platform_fees + net_earnings

Transaction History:
  - Filter: All / This Month / Custom Date
  - Table: Date | Description | Booking Ref | Amount | Type

Download Earnings Report:
  - [Download CSV] button: generates CSV from current filtered data in frontend

#### frontend/src/pages/host/PayoutsPage.jsx
Route: /host/payouts

Top section:
  - Wallet balance (large)
  - Bank account summary: "{bank_name} ••••{last4}" or "No bank account added"
  - [Add/Edit Bank Account] button → side panel form

Request Payout section:
  - Amount input (min ₹500)
  - Shows available balance
  - [Request Payout] button
  - If no bank account: button disabled + "Add bank account first" message
  - On click: confirmation modal "Request payout of ₹{amount}?"

Payout History table:
  Date | Amount | Bank Account | Status (badge) | Processed Date

Status badge colors: pending=yellow | processing=blue | paid=green | failed=red

#### frontend/src/pages/host/HostProfilePage.jsx
Route: /host/profile

Host stats card:
  - Rating | Total Reviews | Total Trips | Acceptance Rate | Member Since
  - Superhost badge (if applicable)

Bio editor: textarea (max 500 chars)
Response time preference: Select (Within 1 hour | Within a few hours | Within a day)

Notification preferences (host-specific):
  - New booking requests
  - Guest messages
  - Payout updates
  - Platform announcements

Verification status:
  - KYC: Verified ✓
  - Phone: Verified ✓ (or prompt)
  - Bank Account: Added ✓ (or "Add account for payouts")
```

---

## PHASE 13 — Homepage & Static Pages

### Prompt

```
You are a senior frontend engineer with strong design instincts. Build the full homepage and all static/informational pages.

Primary color: #E31837 (Zoomcar red)
Accent: #FF6B35 (warm orange)
Dark: #111827
Light: #F9FAFB
Font: Use Google Fonts — display font: "Syne" (headings), body: "DM Sans" (body text)
Animations: Framer Motion for page-level, CSS keyframes for micro-animations

### frontend/src/pages/HomePage.jsx

HERO SECTION:
  Background: dark gradient overlay on full-width road/car background image
  Use: https://images.unsplash.com/photo-1449965408869-eaa3f722e40d?w=1920 (free unsplash)
  
  Content:
  - Eyebrow text: "India's #1 Self-Drive Platform"
  - H1: "Drive on your own terms"
  - Subtitle: "Choose from 25,000+ verified cars across 100+ cities. No driver, no hassle."
  
  SEARCH WIDGET (floating glass-morphism card, max-w-3xl centered):
  - Row: [City ▼] [Pickup Date & Time 📅] [Return Date & Time 📅] [Search →]
  - Popular cities below as pill chips: Bengaluru | Mumbai | Delhi | Pune | Chennai | Goa | Hyderabad | Jaipur
  - Clicking a city chip fills the city selector

  Stats strip: animated counter on scroll into view
  - 10M+ Trips | 25,000+ Cars | 100+ Cities | ₹4.8 Avg Rating

HOW IT WORKS (tabbed section):
  Tab selector: [For Guests] [For Hosts]
  
  Guest tab: numbered cards (1-2-3)
  1. 🔍 Search & Book — "Find the perfect car in seconds. Filter by city, date, and type."
  2. 🚗 Pick Up Your Car — "Meet your host, complete a quick inspection, and get the keys."
  3. 🏁 Drive & Return — "Drive anywhere you want, return on time, and you're done."
  
  Host tab: numbered cards (1-2-3)
  1. 📋 List Your Car Free — "Add your car in 10 minutes. No subscription fees ever."
  2. 📲 Get Bookings — "Guests find your car, book, and pay. You approve each trip."
  3. 💰 Earn Weekly — "Earn ₹15,000–₹40,000/month. Instant payouts after each trip."

BROWSE BY CATEGORY:
  Heading: "Find your perfect ride"
  Grid (8 items, 4 cols desktop, 2 mobile):
  Hatchback | Sedan | SUV | Luxury | Electric | MUV | Convertible | Minivan
  Each: icon (SVG car silhouette, different per category) + label + "Browse →"
  Click → /search?category={cat}
  Hover: red underline slides in, card lifts

FEATURED CARS SECTION:
  Heading: "Top picks near you"
  Subheading: "Hand-picked, highly-rated cars by verified hosts"
  
  CarCard grid (3 cols desktop, 2 tablet, 1 mobile)
  Fetch: GET /api/cars/featured (up to 6 cars)
  Loading: skeleton cards
  
  "View all cars in your city →" link

POPULAR CITIES:
  Heading: "Explore India, your way"
  8-city grid with photo backgrounds (use Unsplash photo IDs):
  - Bengaluru: https://images.unsplash.com/photo-1596176530529-78163a4f7af2?w=400
  - Mumbai: https://images.unsplash.com/photo-1595658658481-d53d3f999875?w=400
  - Delhi: https://images.unsplash.com/photo-1587474260584-136574528ed5?w=400
  - Pune: https://images.unsplash.com/photo-1570168007204-dfb528c6958f?w=400
  - Chennai: https://images.unsplash.com/photo-1582510003544-4d00b7f74220?w=400
  - Hyderabad: https://images.unsplash.com/photo-1545431781-3e1b506e9a37?w=400
  - Jaipur: https://images.unsplash.com/photo-1477587458883-47145ed68d72?w=400
  - Goa: https://images.unsplash.com/photo-1512343879784-a960bf40e7f2?w=400
  
  Each city card: photo background + dark overlay + city name + "N cars" count
  Hover: overlay lightens, scale up slightly

EARNINGS CALCULATOR (host acquisition):
  Background: light gray section
  Heading: "How much can you earn?"
  
  Interactive controls:
  - "Days per month I can share my car:" slider (5-25, default 15)
  - "My car category:" Select (Hatchback | Sedan | SUV | Luxury | Electric)
  
  Live calculation (frontend logic):
  Base rates: hatchback=550, sedan=750, suv=1050, luxury=2500, electric=850 (per day)
  estimated = days × rate × 0.85 (platform fee ~15%)
  
  Display: "Estimated monthly earnings: ₹XX,XXX"
  Below: "Host 10M+ guests have already earned with Zoomcar"
  CTA: [🏠 List Your Car Free →]

TRUST SECTION:
  4 cards in a row:
  🔐 KYC Verified Guests — "Every guest is identity-verified before booking."
  🛡️ Comprehensive Insurance — "Choose from Basic, Standard, or Platinum coverage."
  📞 24/7 Support — "Round-the-clock assistance for guests and hosts."
  💳 Secure Payments — "Your money is safe with our simulated escrow system."

TESTIMONIALS:
  Heading: "What our guests say"
  
  Swiper carousel (autoplay 4s, loop, show 3 on desktop, 1 on mobile):
  3 static testimonials (seeded in frontend, not API):
  1. ★★★★★ "Booked a Creta for our Coorg trip — host was amazing and car was spotless." — Radhika M., Bengaluru
  2. ★★★★★ "Easy booking, clean car, smooth pickup. Way better than cabs for road trips!" — Aryan K., Mumbai  
  3. ★★★★★ "The Thar we rented for Leh was perfect. Highly recommend Zoomcar!" — Priya S., Delhi

FAQ SECTION:
  Radix Accordion, 6 questions:
  Q1: How does the booking process work?
  Q2: What documents do I need to book a car?
  Q3: What happens if I return the car late?
  Q4: Can I extend my trip while on the go?
  Q5: Is insurance mandatory?
  Q6: How do hosts get paid?
  
  Write complete realistic answers for each.

APP DOWNLOAD BANNER:
  Left: "Drive smarter with the Zoomcar app"
  Right: two decorative badge images (App Store + Google Play, use placeholder SVG badges)
  Background: #E31837 gradient

### Navbar (frontend/src/components/layout/Navbar.jsx)

Desktop layout:
  [Logo] [Explore] [How it Works] [List Your Car]  ..... [🔔 N] [Avatar ▼]
  
Logo: "Zoom" in red + "car" in dark gray, custom font treatment

If logged in — Avatar dropdown:
  [Profile photo/initials]
  ├── My Profile
  ├── My Bookings  
  ├── Wallet (₹{balance})
  ├── Wishlist ♡
  ├── KYC Verification
  ├── Host Dashboard (if is_host)
  ├── ─────────────
  ├── Support
  └── Logout

If not logged in:
  [Login] (outline button) [Register] (filled red button)

Mobile (< 768px): hamburger → slide-out drawer from right

Sticky: becomes slightly opaque with backdrop blur after 80px scroll

### All Static Pages

#### frontend/src/pages/HowItWorksPage.jsx
Full detailed explanation with:
- For Guests: 6-step visual flow (search → select → KYC → book → pickup → return)
- For Hosts: 6-step visual flow (list → photos → pricing → receive bookings → meet guest → earn)
- Features grid: GPS tracking, KYC, insurance, support
- FAQ section at bottom

#### frontend/src/pages/InsurancePage.jsx
Three-tier comparison table:
  | Feature                    | Basic (5%) | Standard (8%) | Platinum (12%) |
  | Own Damage                 | ₹10,000    | ₹5,000         | ₹0              |
  | Third Party                | ✓          | ✓              | ✓               |
  | Theft                      | ✗          | ✓              | ✓               |
  | Roadside Assistance        | ✗          | ✗              | ✓               |
  | Zero Depreciation          | ✗          | ✗              | ✓               |

Explain excess amounts, claim process, etc.

#### frontend/src/pages/BecomeHostPage.jsx
- Hero: "Turn your car into a business"
- Earnings calculator (same as homepage)
- Requirements: valid DL, KYC, car under 10 years old, clean record
- Step-by-step: Register → KYC → List car → Get approved → Earn
- Protection section: GPS device, insurance, verified guests
- FAQ: 5 host-specific questions
- CTA: [Start Earning Free]

#### frontend/src/pages/SafetyPage.jsx
- KYC verification process explained
- Trip monitoring features
- Emergency support
- Insurance coverage
- Reporting bad actors

#### frontend/src/pages/AboutPage.jsx
- Mission statement
- "Founded in 2013 in Bengaluru..." (fictionalized for clone)
- Stats: 10M+ trips, 100+ cities, 25K+ cars
- Leadership cards (placeholder names + photos from UI Faces API)

#### frontend/src/pages/ContactPage.jsx
- Form: Name, Email, Phone, Category (dropdown), Message
- Submit → POST /api/support/contact
- Success state: "Thank you! We'll respond within 24 hours."
- Contact info: support@zoomcarclone.com | +91-80-XXXX-XXXX

#### frontend/src/pages/TermsPage.jsx
Full realistic ToS including: user eligibility, booking rules, cancellation policy,
damage liability, payment terms, host responsibilities, prohibited uses.

#### frontend/src/pages/PrivacyPage.jsx
Full realistic privacy policy: data collection, usage, sharing, security, cookies, rights.

#### frontend/src/pages/RefundPage.jsx
Full refund policy: cancellation tiers, refund timeline (wallet = instant), 
damage deposits, insurance claims.

#### frontend/src/pages/CityPage.jsx (dynamic: /cities/:city)
- Hero banner for the city (use Unsplash photo per city)
- "Self-drive cars in {City}"
- Popular areas chips: Koramangala | Indiranagar | Whitefield | HSR Layout (city-specific)
- Car grid (fetch /api/cars?city={city}&limit=12)
- Travel tips for the city (static, 3–4 tips)
- Popular routes from city (static)

#### frontend/src/pages/NotFoundPage.jsx
- Large "404" text
- Illustration (empty road SVG)
- "Looks like this road leads nowhere."
- [Take Me Home] button

### Complete React Router Setup (frontend/src/App.jsx)

import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'

ALL routes wrapped in <Suspense fallback={<PageLoader />}>
ALL route components use React.lazy()
ALL protected routes use <PrivateRoute>
ALL admin routes use <AdminRoute>
ALL host routes use <HostRoute>

Complete route list:
/ → HomePage
/search → SearchPage
/cars/:carId → CarDetailPage
/cities/:city → CityPage
/wishlist → WishlistPage
/auth/login → LoginPage (GuestRoute)
/auth/register → RegisterPage (GuestRoute)
/auth/verify-email → EmailVerificationPage
/auth/forgot-password → ForgotPasswordPage
/auth/reset-password → ResetPasswordPage
/dashboard → DashboardPage (PrivateRoute)
/dashboard/profile → ProfilePage (PrivateRoute)
/dashboard/kyc → KYCPage (PrivateRoute)
/dashboard/bookings → MyBookingsPage (PrivateRoute)
/dashboard/bookings/:bookingId → BookingDetailsPage (PrivateRoute)
/dashboard/wallet → WalletPage (PrivateRoute)
/dashboard/notifications → NotificationsPage (PrivateRoute)
/dashboard/reviews → ReviewsPage (PrivateRoute)
/dashboard/wishlist → WishlistPage (PrivateRoute)
/dashboard/support → SupportPage (PrivateRoute)
/host/dashboard → HostDashboardPage (HostRoute)
/host/cars → ManageCarsPage (HostRoute)
/host/cars/new → ListCarPage (HostRoute)
/host/cars/:carId/edit → EditCarPage (HostRoute)
/host/bookings → BookingRequestsPage (HostRoute)
/host/trips/active → ActiveTripsPage (HostRoute)
/host/earnings → HostEarningsPage (HostRoute)
/host/profile → HostProfilePage (HostRoute)
/host/payouts → PayoutsPage (HostRoute)
/booking/confirm/:carId → BookingConfirmPage (PrivateRoute)
/booking/pay/:bookingId → PaymentPage (PrivateRoute)
/booking/success → BookingSuccessPage (PrivateRoute)
/booking/review/:bookingId → WriteReviewPage (PrivateRoute)
/admin → AdminDashboardPage (AdminRoute)
/admin/users → AdminUsersPage (AdminRoute)
/admin/cars → AdminCarsPage (AdminRoute)
/admin/kyc → AdminKYCPage (AdminRoute)
/admin/bookings → AdminBookingsPage (AdminRoute)
/admin/payments → AdminPaymentsPage (AdminRoute)
/admin/support → AdminSupportPage (AdminRoute)
/admin/coupons → AdminCouponsPage (AdminRoute)
/admin/analytics → AdminAnalyticsPage (AdminRoute)
/admin/payouts → AdminPayoutsPage (AdminRoute)
/how-it-works → HowItWorksPage
/safety → SafetyPage
/insurance → InsurancePage
/become-a-host → BecomeHostPage
/about → AboutPage
/terms → TermsPage
/privacy → PrivacyPage
/refund-policy → RefundPage
/contact → ContactPage
* → NotFoundPage
```

---

## PHASE 14 — Complete Seed File (MySQL + MongoDB)

### Prompt

```
You are a backend engineer. Create backend/app/seed.py that seeds BOTH MySQL and MongoDB with rich, realistic demo data. The seed runs automatically on first Docker boot. Check if DB is empty before seeding.

### Seed order and data:

#### 1. Admin User (MySQL)
email: admin@zoomcar.com | password: Admin@1234
role: admin, is_active: True, is_verified: True
Create: user_wallet (₹0), host_profile stub

#### 2. Host Users (MySQL) — 5 hosts, all KYC approved, is_host=True, is_verified=True
- Priya Sharma | priya@host.com | Pass@1234 | Bengaluru
- Arjun Mehta | arjun@host.com | Pass@1234 | Mumbai  
- Kavitha Nair | kavitha@host.com | Pass@1234 | Chennai
- Rohit Verma | rohit@host.com | Pass@1234 | Delhi
- Sneha Patel | sneha@host.com | Pass@1234 | Pune

For each host:
- user_wallet: ₹5000–₹15000 balance (realistic range)
- user_kyc: status='approved', dl_number=fake DL, aadhar_number masked
- host_profile: acceptance_rate=88-95%, total_reviews=20-80, avg_rating=4.5-4.9
  Priya + Arjun: is_superhost=True

#### 3. Guest Users (MySQL) — 10 guests
guest1@guest.com through guest10@guest.com | password: Guest@1234
Names: Amit Kumar, Divya Reddy, Rahul Singh, Ananya Das, Karan Mehta,
       Pooja Iyer, Vivek Sharma, Meera Nair, Siddharth Raj, Lakshmi Pillai
Cities: mix of all 5 cities
KYC: guest1-guest7 = approved, guest8-guest9 = under_review, guest10 = pending
wallet balances: ₹200–₹3000 (varied)

#### 4. Cars (MySQL) — 25 cars total, all is_approved=True

BENGALURU (8 cars, host: Priya & Arjun):
1. Maruti Swift 2022 | Hatchback | Manual | Petrol | 5 seats | ₹50/hr ₹599/day
   lat: 12.9716, lng: 77.5946 | area: "Koramangala" | avg_rating: 4.7 | 45 trips
   features: AC, Music | auto_accept: True | has_gps_tracker: True
2. Hyundai Creta 2023 | SUV | Automatic | Petrol | 5 seats | ₹80/hr ₹999/day
   lat: 12.9352, lng: 77.6245 | area: "Indiranagar" | avg_rating: 4.8 | 62 trips
   features: AC, Sunroof, Music, Keyless Entry | is_featured: True
3. Tata Nexon EV 2023 | Electric | Automatic | Electric | 5 seats | ₹70/hr ₹850/day
   lat: 12.9698, lng: 77.7500 | area: "Whitefield" | avg_rating: 4.9 | 30 trips
   features: AC, Music, GPS, Keyless Entry | is_featured: True
4. Honda City 2022 | Sedan | Automatic | Petrol | 5 seats | ₹65/hr ₹750/day
   lat: 12.9279, lng: 77.6271 | area: "HSR Layout" | avg_rating: 4.6 | 38 trips
5. Mahindra Thar 2023 | SUV | Manual | Diesel | 4 seats | ₹100/hr ₹1299/day
   lat: 13.0358, lng: 77.5970 | area: "Yelahanka" | avg_rating: 4.9 | 55 trips | is_featured: True
6. Toyota Innova Crysta 2022 | MUV | Automatic | Diesel | 7 seats | ₹90/hr ₹1100/day
   lat: 12.9141, lng: 77.6101 | area: "JP Nagar" | avg_rating: 4.7 | 28 trips
7. Kia Seltos 2023 | SUV | Automatic | Petrol | 5 seats | ₹85/hr ₹1050/day
   lat: 12.9784, lng: 77.6408 | area: "Domlur" | avg_rating: 4.5 | 20 trips
8. BMW 3 Series 2022 | Luxury | Automatic | Petrol | 5 seats | ₹200/hr ₹2500/day
   lat: 12.9611, lng: 77.6387 | area: "Koramangala" | avg_rating: 4.8 | 15 trips | is_featured: True
   features: AC, Sunroof, Music, Keyless Entry, GPS

MUMBAI (5 cars, host: Arjun & Priya):
9. Maruti Baleno 2023 | Hatchback | Automatic | Petrol | 5 seats | ₹55/hr ₹650/day
   lat: 19.0760, lng: 72.8777 | area: "Andheri West" | avg_rating: 4.4 | 33 trips
10. Hyundai Venue 2022 | SUV | Manual | Diesel | 5 seats | ₹70/hr ₹850/day
    lat: 19.1136, lng: 72.8697 | area: "Borivali" | avg_rating: 4.6 | 18 trips
11. Tata Harrier 2023 | SUV | Automatic | Diesel | 5 seats | ₹90/hr ₹1150/day
    lat: 18.9220, lng: 72.8347 | area: "Worli" | avg_rating: 4.6 | 24 trips
12. MG Hector 2022 | SUV | Automatic | Petrol | 5 seats | ₹85/hr ₹1099/day
    lat: 19.0544, lng: 72.8400 | area: "Bandra" | avg_rating: 4.5 | 16 trips
13. Mercedes GLA 2021 | Luxury | Automatic | Petrol | 5 seats | ₹250/hr ₹3000/day
    lat: 19.0176, lng: 72.8562 | area: "Lower Parel" | avg_rating: 4.9 | 22 trips | is_featured: True

DELHI (4 cars, host: Rohit & Sneha):
14. Maruti Dzire 2023 | Sedan | Manual | CNG | 5 seats | ₹45/hr ₹550/day
    lat: 28.6692, lng: 77.2241 | area: "Rohini" | avg_rating: 4.3 | 48 trips
15. Hyundai i20 2022 | Hatchback | Automatic | Petrol | 5 seats | ₹55/hr ₹650/day
    lat: 28.5355, lng: 77.3910 | area: "Noida Sec-62" | avg_rating: 4.5 | 29 trips
16. Toyota Fortuner 2022 | SUV | Automatic | Diesel | 7 seats | ₹120/hr ₹1500/day
    lat: 28.6328, lng: 77.2197 | area: "Dwarka" | avg_rating: 4.8 | 41 trips | is_featured: True
17. Mahindra XUV700 2023 | SUV | Automatic | Diesel | 7 seats | ₹100/hr ₹1299/day
    lat: 28.5672, lng: 77.3210 | area: "Greater Noida" | avg_rating: 4.7 | 19 trips

PUNE (4 cars, host: Sneha & Kavitha):
18. Renault Kwid 2022 | Hatchback | Manual | Petrol | 5 seats | ₹35/hr ₹450/day
    lat: 18.5204, lng: 73.8567 | area: "Kothrud" | avg_rating: 4.2 | 31 trips
    features: Music (no AC)
19. Kia Carens 2023 | MUV | Automatic | Petrol | 7 seats | ₹80/hr ₹999/day
    lat: 18.5911, lng: 73.7384 | area: "Hinjewadi" | avg_rating: 4.6 | 12 trips
20. Audi A4 2021 | Luxury | Automatic | Petrol | 5 seats | ₹220/hr ₹2800/day
    lat: 18.5018, lng: 73.8636 | area: "Camp Area" | avg_rating: 4.8 | 9 trips | is_featured: True
21. Tata Altroz 2023 | Hatchback | Automatic | Petrol | 5 seats | ₹48/hr ₹580/day
    lat: 18.4526, lng: 73.8498 | area: "Hadapsar" | avg_rating: 4.4 | 22 trips

CHENNAI (4 cars, host: Kavitha & Rohit):
22. Hyundai Tucson 2022 | SUV | Automatic | Petrol | 5 seats | ₹95/hr ₹1200/day
    lat: 13.0827, lng: 80.2707 | area: "Anna Nagar" | avg_rating: 4.5 | 14 trips
23. Maruti Grand Vitara 2023 | SUV | Automatic | Hybrid | 5 seats | ₹85/hr ₹1050/day
    lat: 13.0418, lng: 80.2341 | area: "Velachery" | avg_rating: 4.7 | 27 trips | is_featured: True
24. Honda Amaze 2022 | Sedan | Manual | Petrol | 5 seats | ₹55/hr ₹650/day
    lat: 13.0600, lng: 80.2101 | area: "Porur" | avg_rating: 4.4 | 19 trips
25. Jeep Compass 2022 | SUV | Automatic | Diesel | 5 seats | ₹110/hr ₹1400/day
    lat: 12.9236, lng: 80.1315 | area: "OMR" | avg_rating: 4.6 | 11 trips

For ALL cars:
- Add 4-6 car_images using picsum.photos:
  primary: https://picsum.photos/seed/{make}{id}/800/500
  additional: different seeds for gallery variety
- All features set correctly per above
- registration_number: auto-generated format TN{year}AB{nnnn} or KA{year}MN{nnnn}
- security_deposit: hatchback=₹500, sedan=₹750, suv=₹1000, luxury=₹3000
- included_km_per_day: 300 (all cars)
- extra_km_charge: ₹8–₹15 depending on category

#### 5. Car Pricing Rules (MySQL) — add to featured cars:
- Mahindra Thar: long_trip_discount, min_days=3, discount=10%
- BMW 3 Series: weekend surcharge, surcharge=15%
- Toyota Fortuner: long_trip_discount, min_days=5, discount=15%

#### 6. Bookings (MySQL) — 20 bookings with realistic data:

COMPLETED (status=completed, paid, actual times set):
B1: guest1 books Creta (Bengaluru), 7 days ago → 5 days ago, ₹1,998, insurance=standard, coupon=FLAT100
B2: guest2 books Thar (Bengaluru), 10 days ago → 8 days ago, ₹2,598, insurance=platinum
B3: guest3 books Mercedes GLA (Mumbai), 15 days ago → 12 days ago, ₹9,000, insurance=platinum

ACTIVE (status=active, actual_pickup_time set, future return):
B4: guest4 books Fortuner (Delhi), started yesterday → returns in 2 days, ₹3,000
B5: guest5 books Innova (Bengaluru), started this morning → returns tonight, ₹1,100
B6: guest6 books Harrier (Mumbai), started 2 days ago → returns tomorrow, ₹2,300

CONFIRMED (upcoming, payment done):
B7: guest7 books Seltos (Bengaluru), pickup in 3 days, return +2 days, ₹2,100
B8: guest1 books Baleno (Mumbai), pickup in 5 days, return +1 day, ₹650
B9: guest2 books XUV700 (Delhi), pickup in 7 days, return +3 days, ₹3,897
B10: guest3 books Grand Vitara (Chennai), pickup in 10 days, return +2 days, ₹2,100

PENDING (awaiting host action):
B11: guest4 books Honda City (Bengaluru), pickup in 2 days
B12: guest5 books Dzire (Delhi), pickup in 3 days
B13: guest6 books Kwid (Pune), pickup in 1 day

CANCELLED:
B14: guest7 cancelled (reason: "Plans changed") — had been confirmed, 50% refund (< 48h)
B15: guest8 cancelled (pending, no payment, no refund) — booking was never paid
B16: host_cancelled (Priya cancelled B, reason: "Car maintenance") — 100% refund

REJECTED:
B17: Arjun rejected guest9 request, reason: "Dates not available due to maintenance"
B18: Rohit rejected guest10 request, reason: "Guest rating too low"

EXTENSION REQUESTS:
B19: guest1 (from B7) requested extension of +1 day — status=pending
B20: guest2 requested extension on B9 — status=approved, additional ₹1,299

Generate booking_ref as: JPSN + 6 random uppercase chars (ensure unique)
Ensure all completed bookings have odometer_start and odometer_end set

#### 7. Payments (MySQL):
- For all confirmed/active/completed bookings: payment with status='paid'
  simulated_transaction_id = "SIM_TXN_" + 12 random hex chars uppercase
  paid_at = booking creation time + 5 minutes
- For pending/cancelled unpaid: payment with status='created'
- For B16 (host cancelled): payment status='refunded'

#### 8. Wallet Transactions (MySQL):
- Guest debits for each paid booking
- Host credits for each completed booking (host_earnings amount)
- Cancellation refunds as credits for relevant guests
- Initial wallet credits ("Account Welcome Bonus" ₹100 for each user)

#### 9. Coupons (MySQL) — all is_active=True:
1. WELCOME10: 10% off, max ₹200, min ₹500, new users, valid 1 year from now
2. FLAT100: ₹100 flat, min ₹1000, all users, usage_limit=1000, valid 6 months
3. WEEKEND20: 20% off, max ₹500, min ₹800, all users, valid 3 months
4. ZC50: ₹50 flat, min ₹300, all users, usage_limit=5000, valid 3 months
5. LONG15: 15% off, max ₹1000, min ₹2000, all users (for multi-day trips), valid 6 months

#### 10. Reviews (MongoDB) — for each completed booking, create 2 reviews:

B1 (Creta, Bengaluru):
  guest_to_car: rating=5, "Absolutely loved the Creta! AC was ice cold, car was spotless. Priya is a fantastic host.", title="Perfect SUV for our Coorg trip"
  guest_to_host: rating=5, "Priya responded instantly and handover was smooth. Highly recommend!", title="Excellent host"
  host reply on car review: "Thank you so much! Hope to host you again soon 😊"

B2 (Thar, Bengaluru):
  guest_to_car: rating=5, "The Thar is an absolute beast! Perfect for our mountain trail trip. Engine was powerful and everything worked perfectly.", title="Epic off-road experience!"
  host_to_guest: rating=4, "Great guest, took care of the Thar really well. Returned clean and on time."

B3 (Mercedes GLA, Mumbai):
  guest_to_car: rating=5, "Incredible luxury car. Smooth ride, amazing interiors. Worth every rupee for our anniversary trip.", title="Pure luxury on wheels"
  guest_to_host: rating=5, "Sneha was incredibly professional. The car was detailed to perfection.", title="5 star host experience"

#### 11. Notifications (MongoDB) — 4 per user:
For each host:
  - "New booking request from {guest_name}" (type=booking)
  - "KYC verification approved" (type=kyc)
  - "₹{amount} credited for trip completion" (type=payment)
  - "Your car {title} is now live and accepting bookings" (type=system)

For each guest (KYC approved):
  - "Booking JPSN... confirmed!" (type=booking)
  - "Your KYC has been verified ✓" (type=kyc)
  - "Trip reminder: Your trip starts in 2 hours" (type=booking)
  - "Review your recent trip with {car_name}" (type=review)

For pending KYC guests:
  - "KYC document submitted. Under review." (type=kyc)
  - "Welcome to Zoomcar! Complete KYC to start booking." (type=system)

#### 12. Support Tickets + Messages (MySQL + MongoDB):
Create 3 support tickets:
T1: guest2, category=payment, subject="Refund not received for cancelled booking B14"
  status=in_progress, priority=high
  Messages: guest message (complaint) + staff reply ("We're processing your refund within 48h...")
T2: guest5, category=car_issue, subject="AC was not working properly during trip"
  status=open, priority=medium
  Message: guest description of issue
T3: guest1, category=booking, subject="Cannot access booking details page"
  status=resolved, priority=low
  Messages: guest issue + staff fix reply

#### 13. Search Logs (MongoDB analytics):
Insert 20 realistic search log entries spread across cities and dates.
Example: {user_id: "guest1_id", city: "Bengaluru", filters: {category: "suv", transmission: "automatic"}, results_count: 12}

#### 14. Car View Events (MongoDB analytics):
Insert 50 car view events spread across the 25 cars with random user_ids and timestamps over last 30 days.

#### Seed script structure:
async def seed():
    async with AsyncSessionLocal() as db:
        # Phase 1: Create all MySQL data
        admin = await create_admin(db)
        hosts = await create_hosts(db)
        guests = await create_guests(db)
        cars = await create_cars(db, hosts)
        bookings, payments = await create_bookings_and_payments(db, cars, guests, hosts)
        await create_wallet_transactions(db, bookings, guests, hosts)
        await create_coupons(db)
        await db.commit()
        
        # Phase 2: Create all MongoDB data
        await create_reviews_mongodb(bookings, guests, hosts, cars)
        await create_notifications_mongodb(hosts + guests, bookings)
        await create_support_data(db, guests, bookings)
        await create_analytics_data(cars, guests)

if __name__ == "__main__":
    import asyncio
    asyncio.run(seed())
```

---

## PHASE 15 — Final Polish & Production Readiness

### Prompt

```
You are a senior frontend engineer and DevOps engineer. Complete all final polish, responsiveness, and production-readiness tasks.

### 1. Mobile Responsiveness (Audit All Pages)

Apply these patterns to every page:

Breakpoints used: sm=640px, md=768px, lg=1024px, xl=1280px

Critical mobile fixes:
- Navbar: hamburger menu (3-line icon) → slide-out right drawer (Radix Dialog/Sheet)
  Drawer contains: all nav links + auth buttons + notification count
- SearchPage filter sidebar → bottom-sheet drawer on mobile
  Trigger: sticky "Filters (N)" button at bottom of screen when scrolled
  Bottom sheet: Radix Dialog, slides from bottom, 90vh max height
- CarDetailPage booking widget → sticky bottom bar on mobile (price + Book button)
  Tap → full-screen bottom sheet with complete booking widget
- All data tables → card view on mobile (convert table rows to individual cards)
- KYC page → single column layout on mobile
- Admin dashboard → hide sidebar on mobile, show hamburger → drawer
- Host car listing wizard → all steps single column, larger touch targets
- Image galleries → swipe support (Swiper already installed)

Touch-friendly interactions:
- All buttons: min-height 44px (iOS HIG)
- All inputs: min-height 44px, font-size 16px (prevents iOS zoom)
- Tap targets: min 44×44px

### 2. Loading & Error States

Add to EVERY component that fetches data:
a) Skeleton loading (Tailwind animate-pulse):
   - Match shape of actual content (e.g. CarCard skeleton = same dimensions)
   - Show 6 skeleton cards in grid view, 3 in list view
b) Error state:
   - Error illustration (SVG inline, simple, fits the context)
   - Error message (user-friendly, not technical)
   - Retry button (re-triggers the query)
c) Empty state:
   - Contextual illustration
   - Helpful message + CTA
   - e.g. My Bookings empty: "No upcoming trips. Ready to hit the road?" + [Find a Car]

React Query configuration:
  retry: 2 (retry failed requests twice)
  staleTime: 30000 (30s cache for listings)
  refetchOnWindowFocus: false (don't spam API on tab switch)

### 3. Form Validation (Zod schemas for ALL forms)

Create frontend/src/utils/validationSchemas.js with these schemas:

registerSchema:
  full_name: min 2, max 100, no numbers
  email: valid email format
  phone: exactly 10 digits (after stripping +91)
  password: min 8, has uppercase, has digit, has special char
  confirm_password: must equal password
  terms: must be true

loginSchema:
  email: valid format
  password: min 1 char

carListingStepSchemas[] (6 separate schemas, one per step):
  Step1: make required, car_model required, year 2010-2024, registration_number 8-15 chars uppercase
  Step2: description min 50 chars, features (at least one required optional)
  Step3: location_city required, location_lat/lng required (set by map click)
  Step4: price_per_hour min 20, price_per_day min 100, min_trip_hours in valid list
  Step5: images array min length 3
  Step6: no additional validation (review step)

bookingSchema: insurance_plan required, dates valid range

reviewSchema: rating 1-5 integer, body min 30 chars if provided

kycSchema: dl_number min 8 chars, aadhar_number 12 digits, all 4 files required

bankDetailsSchema: 
  bank_name required
  account_number: 9-18 digits
  ifsc: exactly 11 chars, valid format (first 4 alpha, 5th is 0, last 6 alphanumeric)
  account_holder: min 3 chars

supportTicketSchema: subject min 5, description min 20

Show ALL validation errors: red text below field, red border on field, clear on fix

### 4. Toast Notification System

Configure react-hot-toast in App.jsx:
  <Toaster position="bottom-right" toastOptions={{
    success: { duration: 3000, style: { background: '#10B981', color: '#fff' } },
    error: { duration: 5000, style: { background: '#EF4444', color: '#fff' } },
  }} />

Add toast calls throughout:
  Auth: login success, login fail, logout, registration success, email sent
  Booking: booking created, payment success, booking cancelled, extension requested
  Cars: car listed, car image uploaded, availability toggled
  Reviews: review submitted
  KYC: kyc submitted
  Profile: profile saved, password changed
  Wallet: money added, payment processed
  Coupon: "FLAT100 applied! Saving ₹100" (success) | "Invalid or expired coupon" (error)
  Copy actions: "Booking ref copied to clipboard"

### 5. Performance Optimizations

React.lazy for ALL page components (already in App.jsx routes).

Image optimization:
  - All <img> tags: loading="lazy" decoding="async"
  - Use width/height attributes to prevent layout shift
  - CarCard: use object-fit: cover with explicit dimensions

React Query caching:
  - /api/cars?featured → staleTime: 5 minutes
  - /api/cars/{id} → staleTime: 2 minutes
  - /api/notifications/unread-count → refetchInterval: 30000

Debouncing:
  - Search bar city input: 300ms debounce before triggering search
  - Map pan/zoom → re-fetch cars: 500ms debounce
  - Coupon code input → validate preview: 800ms debounce

Memoization:
  - CarCard: React.memo (rerenders only if car.id or wishlist status changes)
  - FilterSidebar: React.memo with custom comparison
  - ReviewCard: React.memo

### 6. SEO & Meta Tags (react-helmet-async)

Add <HelmetProvider> in index.jsx.
Add <Helmet> to each page:

HomePage: title="Zoomcar Clone — Self-Drive Car Rentals", description="Rent self-drive cars across 100+ Indian cities. Verified hosts, comprehensive insurance, instant booking."
SearchPage: title="Search Cars — {city} | Zoomcar Clone"
CarDetailPage: title="{car_title} {year} — ₹{price}/day | Zoomcar Clone"
  og:image = car primary image URL
  og:title = car title + price
LoginPage: title="Login | Zoomcar Clone", noindex
RegisterPage: title="Sign Up | Zoomcar Clone", noindex
DashboardPage: title="Dashboard | Zoomcar Clone", noindex

### 7. Accessibility

- All <img> tags: descriptive alt text (not empty, not "image")
- All icon buttons: aria-label="..."
- All form inputs: properly associated <label> elements
- Modal focus trap: Radix Dialog handles this automatically (verify all dialogs use Radix)
- Color contrast: all text >= 4.5:1 ratio (test with Tailwind default palette — avoid gray-400 on white)
- Skip to main content link at top of every page (visually hidden, shows on focus)

### 8. Dark Mode

Add to tailwind.config.js: darkMode: 'class'

Add dark mode toggle button in Navbar (moon/sun icon).
Store preference in localStorage key 'zoomcar-theme'.
On app mount: read localStorage, apply 'dark' class to <html>.

All components use Tailwind dark: variants:
- Backgrounds: bg-white dark:bg-gray-900, bg-gray-50 dark:bg-gray-800
- Text: text-gray-900 dark:text-gray-100, text-gray-600 dark:text-gray-400
- Borders: border-gray-200 dark:border-gray-700
- Cards: bg-white dark:bg-gray-800 shadow-sm

Primary red stays the same in both modes.

### 9. Environment Variables

frontend/.env:
VITE_API_BASE_URL=http://localhost/api
VITE_APP_NAME=Zoomcar Clone
VITE_MAPS_TILE_URL=https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png
VITE_PAYMENT_SIMULATE=true

### 10. README.md (root level)

# Zoomcar Clone

India's largest self-drive car rental platform — fully cloned with React.js + FastAPI + MySQL + MongoDB.

## 🚀 Quick Start

\`\`\`bash
git clone <your-repo>
cd zoomcar-clone
cp .env.example .env
# Edit .env — set SMTP credentials (use Mailtrap.io free tier)
# All other defaults work for local development
docker-compose up --build
# First boot takes ~3 minutes (DB migration + seeding 25 cars, 10 users, 20 bookings)
# Open http://localhost
\`\`\`

## 🔑 Default Credentials

| Role    | Email                | Password    |
|---------|----------------------|-------------|
| Admin   | admin@zoomcar.com    | Admin@1234  |
| Host 1  | priya@host.com       | Pass@1234   |
| Host 2  | arjun@host.com       | Pass@1234   |
| Guest 1 | guest1@guest.com     | Guest@1234  |
| Guest 2 | guest2@guest.com     | Guest@1234  |

## 🗄️ Database Architecture

| Database | Engine    | Usage |
|----------|-----------|-------|
| MySQL 8  | Relational| Users, cars, bookings, payments, coupons — all transactional/integrity-critical data |
| MongoDB 7| Document  | Reviews, notifications, support messages, analytics events, activity feed |
| Redis 7  | Cache     | JWT blacklist, rate limits, session data, Celery broker |

## 📁 Tech Stack
Frontend: React 18 + Vite + TailwindCSS + React Query + Zustand + Leaflet
Backend: FastAPI + SQLAlchemy (MySQL) + Motor (MongoDB) + Celery
Infrastructure: Docker Compose + Nginx

## 🌐 URLs
- App: http://localhost
- API Docs (Swagger): http://localhost/api/docs
- API Docs (ReDoc): http://localhost/api/redoc

## ✅ Final Checklist

[ ] Register → verify email → login
[ ] Browse cars without login
[ ] Search with city, date, category, price filters
[ ] Map view with markers
[ ] Car detail page with booking widget
[ ] Complete KYC with document upload
[ ] Book a car → Payment dialog → Confirm → Success
[ ] Host: list car (5-step wizard)
[ ] Host: accept booking → start trip → end trip
[ ] Write review after completed trip
[ ] Admin: approve car listing + KYC
[ ] Admin analytics charts render
[ ] Wallet: add money + pay with wallet
[ ] Coupon code application
[ ] Support ticket + chat thread
[ ] Host earnings + payout request
[ ] Forgot/reset password via email
[ ] All pages mobile responsive
[ ] Dark mode toggle works
[ ] docker-compose up → site fully works at localhost
[ ] Seed data: fully populated on first boot
```

---

## Quick Reference: Default Credentials

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@zoomcar.com | Admin@1234 |
| Host 1 (Superhost) | priya@host.com | Pass@1234 |
| Host 2 (Superhost) | arjun@host.com | Pass@1234 |
| Host 3 | kavitha@host.com | Pass@1234 |
| Guest (KYC approved) | guest1@guest.com | Guest@1234 |
| Guest (KYC pending) | guest8@guest.com | Guest@1234 |

---

## Quick Start After Build

```bash
git clone <your-repo>
cd zoomcar-clone
cp .env.example .env
# Edit .env — only SMTP settings needed for email, everything else works by default
# Use Mailtrap.io free account for SMTP (100 emails/month free)
docker-compose up --build
# Wait ~3 minutes on first boot (migrations + seeding 25 cars, 10 users, 20 bookings)
# Open http://localhost
```

---

## Phase Execution Order Summary

| Phase | What It Builds | DB Touched |
|-------|---------------|------------|
| 1 | Docker Compose: MySQL + MongoDB + Redis + Nginx | — |
| 2 | MySQL + MongoDB connection layer, config, main.py | Both |
| 3 | MySQL ORM models (15 tables, complete schema) | MySQL |
| 4 | MongoDB document models + service functions | MongoDB |
| 5 | Auth: register, email verify, login, JWT, reset password | MySQL + Redis |
| 6 | Car listing wizard, image upload, host APIs | MySQL |
| 7 | Search, filters, map view, car detail page | MySQL + MongoDB |
| 8 | Full booking flow + simulated payment dialog | MySQL + MongoDB |
| 9 | User dashboard, KYC, wallet, profile | MySQL |
| 10 | Reviews (MongoDB), notifications (MongoDB), support | Both |
| 11 | Admin dashboard (all sections) | MySQL + MongoDB |
| 12 | Host earnings, payouts, superhost logic | MySQL |
| 13 | Homepage, static pages, routing (all 40+ routes) | MySQL (reads) |
| 14 | Complete seed file: MySQL + MongoDB both | Both |
| 15 | Polish, mobile, dark mode, performance, README | — |

---

## Key Design Decisions

### Why MySQL for transactional data?
Bookings, payments, and wallet operations require ACID compliance — a failed payment must fully rollback. MySQL's foreign key enforcement prevents orphaned bookings. Alembic gives safe, versioned schema migrations.

### Why MongoDB for hierarchical data?
Reviews are nested documents (body + host reply + reviewer snapshot + car snapshot). Notifications are high-write, user-specific, schema-flexible. Support messages are threaded chat logs. Analytics events are append-only, expire via TTL. All of these benefit from MongoDB's flexible schema and embedded documents.

### Why simulated payment (dialog box)?
No Razorpay credentials needed. Works fully offline in Docker. Demonstrates the complete UX flow: booking → payment confirmation → success — without any external dependency. The payment dialog mimics a real payment gateway's confirmation step.
