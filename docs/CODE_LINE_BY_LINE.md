# SigFleet — Line-by-Line Code Explanation

> Every file, every line, every decision explained. Why SQL? Why MongoDB? Why this pattern?

---

## WHY THREE DATABASES?

### MySQL (Relational/SQL) — For structured, related data
**Used for:** Users, Vehicles, Bookings, Payments, Coupons, KYC, Support Tickets

**Why SQL?**
- Data has FIXED structure (every user has email, name, role — always)
- Data has RELATIONSHIPS (a booking BELONGS TO a customer AND a vehicle)
- Need TRANSACTIONS (if payment fails, booking should also fail — atomic operations)
- Need JOINS (show booking with car details + manager name in one query)
- Need CONSTRAINTS (email must be unique, price must be > 0)

**Example:** "Show me all bookings for customer X with vehicle details and payment status"
→ This requires JOINing 3 tables (bookings + vehicles + payments) — SQL excels at this.

### MongoDB (Document/NoSQL) — For flexible, growing data
**Used for:** Reviews, Notifications, Support Messages, Analytics, Sessions

**Why MongoDB?**
- Data structure VARIES (a review might have a manager_reply or not)
- Data GROWS unboundedly (notifications pile up, no fixed count)
- Don't need JOINs (each document is self-contained)
- Need FAST writes (logging every page view, every action)
- Schema can CHANGE without migrations (add new fields anytime)

**Example:** A review document contains everything needed to display it:
```json
{ "reviewer_name": "Amit", "rating": 5, "body": "Great!", "car_snapshot": {"title": "Creta"} }
```
No need to JOIN with users table or vehicles table — it's all embedded.

### Redis (In-Memory Cache) — For temporary, fast-access data
**Used for:** JWT blacklist, OTP codes, Rate limiting, Notification count cache

**Why Redis?**
- Data is TEMPORARY (OTP expires in 10 minutes, rate limit resets every 60 seconds)
- Need EXTREME speed (checking "is this token blacklisted?" on every single request)
- Data can be LOST on restart (it's just cache — can be regenerated)
- Simple key-value operations (SET, GET, INCREMENT, EXPIRE)

**Example:** `email_otp:amit@example.com` → `{"otp":"847291","attempts":0}` (expires in 600 seconds)

---

## BACKEND CORE FILES


### `backend/app/config.py` — Environment Configuration

```python
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    # Each field reads from .env file automatically
    # If .env has MYSQL_URL=mysql+aiomysql://..., this field gets that value
    
    MYSQL_URL: str                    # Connection string for MySQL database
    MONGODB_URL: str                  # Connection string for MongoDB
    MONGODB_DB_NAME: str = "zoomcar_docs"  # Default value if not in .env
    REDIS_URL: str                    # Connection string for Redis
    
    SECRET_KEY: str                   # Used to SIGN JWT tokens (if leaked, anyone can forge tokens)
    ALGORITHM: str = "HS256"          # JWT signing algorithm (HMAC-SHA256)
    
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60   # Access token lives 1 hour
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30     # Refresh token lives 30 days
    
    SMTP_HOST: str                    # Email server hostname (smtp.gmail.com)
    SMTP_PORT: int = 587              # Email server port (587 = TLS)
    SMTP_USER: str                    # Email account username
    SMTP_PASSWORD: str                # Email account password (App Password for Gmail)
    SMTP_FROM: str                    # "From" address on sent emails
    SMTP_FROM_NAME: str = "SigFleet"  # Display name in emails
    SMTP_USE_TLS: bool = True         # Use encryption for email
    
    FRONTEND_URL: str = "http://localhost"
    BACKEND_URL: str = "http://localhost/api"
    UPLOAD_DIR: str = "uploads"       # Where uploaded files are saved on disk
    MAX_UPLOAD_SIZE_MB: int = 10
    PAYMENT_SIMULATE: bool = True     # No real payment gateway — all payments are simulated
    CHAUFFEUR_FEE_PER_DAY: int = 800  # ₹800/day for chauffeur service
    
    model_config = SettingsConfigDict(
        env_file=".env",              # Read from .env file in current directory
        case_sensitive=True,          # MYSQL_URL ≠ mysql_url
        extra="ignore"               # Ignore extra variables in .env that aren't defined here
    )

settings = Settings()  # Single instance used everywhere via: from app.config import settings
```

**Why Pydantic Settings?**
- Validates all env vars on startup (if MYSQL_URL is missing, app crashes immediately with clear error)
- Type conversion (SMTP_PORT string "587" → integer 587)
- Default values (don't need to set every variable)

---

### `backend/app/database.py` — MySQL Connection

```python
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase

from app.config import settings

# Create the database engine (connection pool)
# echo=False means don't print every SQL query to console
engine = create_async_engine(settings.MYSQL_URL, echo=False, pool_size=10, max_overflow=20)
```

**What is a connection pool?**
Opening a database connection is expensive (network handshake, authentication). A pool keeps 10 connections open and reuses them. `max_overflow=20` means up to 30 total if all 10 are busy.

```python
# Session factory — creates database sessions on demand
AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
```

**What is a session?**
A session is like a "conversation" with the database. You make queries, add objects, then `commit()` to save everything at once (or `rollback()` to undo).

```python
# Base class for all models (tables)
class Base(DeclarativeBase):
    pass

# FastAPI dependency — gives each request its own database session
async def get_db():
    async with AsyncSessionLocal() as session:
        yield session  # Request uses the session
        # Session automatically closed after request finishes
```

**Why `yield`?**
`yield` makes this a "generator" — FastAPI calls it, gets the session, processes the request, then the code after `yield` runs (cleanup). This ensures the session is always closed, even if the request crashes.

---

### `backend/app/mongodb.py` — MongoDB Connection

```python
import motor.motor_asyncio
from app.config import settings

_mongo_client = None  # Global client (reused across requests)
_mongo_db = None      # Global database reference

async def connect_mongo():
    global _mongo_client, _mongo_db
    _mongo_client = motor.motor_asyncio.AsyncIOMotorClient(settings.MONGODB_URL)
    _mongo_db = _mongo_client[settings.MONGODB_DB_NAME]
    await _mongo_client.admin.command("ping")  # Verify connection works

async def disconnect_mongo():
    global _mongo_client
    if _mongo_client:
        _mongo_client.close()

def get_mongo_db():
    return _mongo_db  # Returns the database object for queries
```

**Why Motor?**
Motor is the async MongoDB driver. Regular `pymongo` blocks the event loop (freezes the server while waiting for DB). Motor uses `await` so other requests can be processed while waiting.

---

### `backend/app/redis.py` — Redis Connection

```python
import redis.asyncio as aioredis
from app.config import settings

_redis = None

def get_redis():
    global _redis
    if _redis is None:
        _redis = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    return _redis
```

**Why `decode_responses=True`?**
Redis stores everything as bytes. This flag auto-converts to strings so we don't need `.decode()` everywhere.

---


### `backend/app/main.py` — Application Entry Point

```python
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

@asynccontextmanager
async def lifespan(app: FastAPI):
    # STARTUP: runs once when server starts
    await init_db()        # Create MySQL tables if they don't exist
    await connect_mongo()  # Connect to MongoDB
    yield                  # Server is now running and handling requests
    # SHUTDOWN: runs once when server stops
    await close_redis()
    await disconnect_mongo()
```

**What is `lifespan`?**
It's FastAPI's way of running code on startup/shutdown. The `yield` separates startup (before) from shutdown (after).

```python
app = FastAPI(
    title="SigFleet API",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/api/docs",      # Swagger UI at /api/docs
    redoc_url="/api/redoc",    # Alternative docs at /api/redoc
    openapi_url="/api/openapi.json",  # OpenAPI schema
)
```

```python
# CORS — Cross-Origin Resource Sharing
# Without this, browsers block requests from localhost:5175 to localhost:8000
# (different ports = different "origins")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5175", ...],
    allow_credentials=True,   # Allow cookies to be sent
    allow_methods=["*"],      # Allow GET, POST, PATCH, DELETE, etc.
    allow_headers=["*"],      # Allow Authorization header, Content-Type, etc.
)
```

**Why CORS?**
Browsers have a security rule: JavaScript on `localhost:5175` cannot call `localhost:8000` unless the server explicitly says "I allow requests from that origin." CORS headers are that permission.

```python
# Serve uploaded files (profile photos, KYC documents) as static files
app.mount("/uploads", StaticFiles(directory=settings.UPLOAD_DIR), name="uploads")
```

This means `http://localhost:8000/uploads/avatars/user-id.webp` serves the actual file from disk.

```python
# Register all API routers with /api prefix
for router in [auth.router, users.router, vehicles.router, bookings.router, ...]:
    app.include_router(router, prefix="/api")
```

Each router handles a group of related endpoints. `prefix="/api"` means all URLs start with `/api/`.

---

## BACKEND MODELS (Database Tables)

### `backend/app/models/user.py` — User Table

```python
class User(TimestampMixin, Base):
    __tablename__ = "users"  # Actual MySQL table name
    
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
```

**Why UUID for ID?**
- Auto-increment integers (1, 2, 3) reveal how many users exist
- UUIDs are random (e.g., "a1b2c3d4-...") — can't guess other user IDs
- Safe to expose in URLs without information leakage

```python
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
```

- `unique=True` — no two users can have the same email (database enforces this)
- `index=True` — creates a B-tree index for fast lookups by email (O(log n) instead of O(n))

```python
    hashed_password: Mapped[str] = mapped_column(String(255))
```

**Why hashed?**
We NEVER store plain passwords. If the database is leaked, attackers can't read passwords. We store `bcrypt($2b$12$...)` — a one-way hash. To verify login, we hash the input and compare hashes.

```python
    role: Mapped[str] = mapped_column(
        Enum("admin", "vehicle_manager", "customer", name="user_role")
    )
```

`Enum` restricts the column to only these 3 values. If code tries to set `role = "hacker"`, MySQL rejects it.

```python
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False)
```

- `is_active=False` → account suspended (can't login)
- `is_verified=False` → email not verified yet (can't book)

---

### `backend/app/models/vehicle.py` — Vehicle Table

```python
class Vehicle(TimestampMixin, Base):
    __tablename__ = "vehicles"
    
    manager_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"))
```

**What is a Foreign Key?**
It's a reference to another table. `manager_id` MUST be a valid `id` from the `users` table. If you try to create a vehicle with a non-existent manager_id, MySQL rejects it. This ensures data integrity.

```python
    price_per_day: Mapped[Decimal] = mapped_column(DECIMAL(10, 2))
```

**Why Decimal, not Float?**
Floats have precision errors: `0.1 + 0.2 = 0.30000000000000004`. For money, we need EXACT values. `DECIMAL(10, 2)` means up to 10 digits total, 2 after decimal point (max ₹99,99,99,999.99).

```python
    total_units: Mapped[int] = mapped_column(Integer, default=1)
```

This is the fleet count — how many physical units of this vehicle the manager has. If `total_units=2`, two customers can book the same vehicle for overlapping dates.

```python
    is_available: Mapped[bool] = mapped_column(Boolean, default=True)
    is_approved: Mapped[bool] = mapped_column(Boolean, default=False)
    auto_accept_bookings: Mapped[bool] = mapped_column(Boolean, default=False)
```

- `is_available` — dynamically set by `sync_vehicle_availability()` based on active bookings vs total_units
- `is_approved` — admin must approve before vehicle appears in search
- `auto_accept_bookings` — if True, bookings are instantly confirmed (no manager approval needed)

---

### `backend/app/models/booking.py` — Booking Table

```python
class Booking(TimestampMixin, Base):
    __tablename__ = "bookings"
    
    booking_ref: Mapped[str] = mapped_column(String(12), unique=True, index=True)
```

Human-readable reference like "JPSNABC123" — shown to customers instead of the UUID.

```python
    status: Mapped[str] = mapped_column(
        Enum("pending", "confirmed", "active", "completed", "cancelled", "rejected")
    )
```

Booking lifecycle: pending → confirmed → active → completed (or cancelled/rejected at any point).

```python
    platform_fee: Mapped[Decimal] = mapped_column(DECIMAL(10, 2), default=Decimal("0.00"))
    manager_earnings: Mapped[Decimal] = mapped_column(DECIMAL(10, 2), default=Decimal("0.00"))
```

SigFleet takes 10% as platform fee. Manager gets 90%. These are calculated at booking creation time.

---

## BACKEND SERVICES (Business Logic)

### `backend/app/services/availability.py`

```python
class AvailabilityService:
    @staticmethod
    async def check_vehicle_available(vehicle_id, pickup_date, return_date, db, exclude_booking_id=None):
        vehicle = await db.scalar(select(Vehicle).where(Vehicle.id == vehicle_id))
        if vehicle is None or not vehicle.is_available:
            return False, "Vehicle not available"
        if not vehicle.is_approved:
            return False, "Vehicle pending approval"
```

First check: does the vehicle exist, is it available, is it approved?

```python
        # Count overlapping bookings
        booking_query = select(func.count()).select_from(Booking).where(
            Booking.vehicle_id == vehicle_id,
            Booking.status.in_(BLOCKING_BOOKING_STATUSES),  # pending, confirmed, active
            Booking.pickup_datetime < return_date,   # existing booking starts before our end
            Booking.return_datetime > pickup_date,   # existing booking ends after our start
        )
        active_count = await db.scalar(booking_query) or 0
        total_units = vehicle.total_units or 1
        
        if active_count >= total_units:
            return False, f"All {total_units} units are booked during this period"
```

**The overlap logic:**
Two time ranges overlap if: `start1 < end2 AND start2 < end1`

If I want June 1-3, and there's a booking for June 2-4:
- June 2 < June 3? YES (existing starts before my end)
- June 4 > June 1? YES (existing ends after my start)
→ OVERLAP! Vehicle is booked.

---

### `backend/app/services/pricing.py`

Calculates the full price breakdown:
```
base_amount = price_per_day × number_of_days
+ insurance (5%/8%/12% of base for basic/standard/platinum)
+ chauffeur fee (₹800/day if selected)
- coupon discount (capped at max_discount)
+ platform_fee (10% of base)
= total_amount

manager_earnings = base_amount - platform_fee
```

---

## FRONTEND CORE FILES

### `frontend/src/services/api.js` — HTTP Client

```javascript
import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  withCredentials: true,  // Send cookies (refresh token) with every request
})
```

`withCredentials: true` is critical — without it, the browser won't send the HttpOnly refresh token cookie to the backend.

```javascript
api.interceptors.response.use(
  (response) => response,  // Success: pass through unchanged
  (error) => {
    // Error: extract a friendly message from the response
    const message = error.response?.data?.detail || error.message
    error.message = message
    return Promise.reject(error)
  },
)
```

**What is an interceptor?**
It's middleware for HTTP requests. Every response passes through this function. If it's an error, we extract the backend's error message so components can show it to the user.

---

### `frontend/src/context/AuthContext.jsx` — Authentication State

```javascript
export const useAuthStore = create((set, get) => ({
  user: null,           // Current user object (null = not logged in)
  accessToken: null,    // JWT access token (memory only — never persisted)
  isLoading: true,      // True while checking if user is logged in on page load
```

**Why Zustand?**
React's built-in state (`useState`) is local to one component. Zustand creates GLOBAL state that any component can read. The Navbar needs to know if you're logged in. The Sidebar needs your role. The BookingWidget needs your KYC status. All read from the same store.

```javascript
  setAccessToken: (accessToken) => set({ accessToken }),
  
  setUser: (user) => {
    if (user) sessionStorage.setItem(SESSION_USER_KEY, JSON.stringify(user))
    else sessionStorage.removeItem(SESSION_USER_KEY)
    set({ user })
  },
```

**Why sessionStorage (not localStorage)?**
- `localStorage` is shared across ALL tabs → logging in as User B in Tab 2 overwrites Tab 1
- `sessionStorage` is per-tab → each tab has its own session (you can be admin in one tab, customer in another)

```javascript
  logout: () => {
    sessionStorage.removeItem(SESSION_USER_KEY)
    set({ user: null, accessToken: null, isLoading: false })
    api.post('/auth/logout', {}).catch(() => {})  // Tell backend to clear cookie
  },
```

Logout is synchronous (instant UI update) + fire-and-forget backend call (clears the HttpOnly cookie).

---

### `frontend/src/components/RouteGuards.jsx` — Page Protection

```javascript
export function CustomerRoute() {
  const { user, isLoading } = useAuth()
  const location = useLocation()
  
  if (isLoading) return <PageLoader />  // Show spinner while checking auth
  if (!user) return <Navigate to="/auth/login" state={{ from: location.pathname }} replace />
  if (user.role !== 'customer') return <Navigate to="/unauthorized" replace />
  return <Outlet />  // Render the child route
}
```

**How it works:**
1. `isLoading=true` → show spinner (prevents flash of login page while token is being verified)
2. `user=null` → not logged in → redirect to login (with `from` so we can redirect back after login)
3. `user.role !== 'customer'` → wrong role → show "Unauthorized" page
4. All checks pass → render the actual page (`<Outlet />`)

**Why `state={{ from: location.pathname }}`?**
After login, we read this `from` value and redirect the user back to where they were trying to go. So if you paste `/customer/bookings` without being logged in, you'll end up there after logging in.

---

## HOW THE BOOKING WIDGET WORKS

### `frontend/src/pages/VehicleDetailPage.jsx` — BookingWidget

```javascript
function BookingWidget({ car, user }) {
  const [pickup, setPickup] = useState(addHours(new Date(), 24))      // Default: tomorrow
  const [returnAt, setReturnAt] = useState(addHours(new Date(), 52))  // Default: day after tomorrow
  const [insurance, setInsurance] = useState('standard')
  const [withChauffeur, setWithChauffeur] = useState(false)
  const [availability, setAvailability] = useState({ available: true })
```

```javascript
  // Debounced availability check — fires 600ms after user stops changing dates
  useEffect(() => {
    const timer = window.setTimeout(() => {
      api.get(`/vehicles/${car.id}/availability/check`, {
        params: { pickup_date: pickup.toISOString(), return_date: returnAt.toISOString() }
      }).then(res => setAvailability(res.data))
    }, 600)
    return () => window.clearTimeout(timer)  // Cancel previous timer if dates change again
  }, [car.id, insurance, pickup, returnAt])
```

**Why debounce?**
Without it, changing the date picker fires an API call on every millisecond of interaction. With 600ms debounce, it waits until the user stops clicking, then fires ONE request.

```javascript
  const handleRentClick = async () => {
    if (!user) { navigate('/auth/login'); return }  // Must be logged in
    if (!availability.available) return              // Must be available
    
    // Validate chauffeur locations
    if (withChauffeur && !pickupLocation.trim()) {
      setBookingError('Please enter your pickup address')
      return
    }
    
    // Create the booking
    const response = await api.post('/bookings/', {
      vehicle_id: car.id,
      pickup_datetime: pickup.toISOString(),
      return_datetime: returnAt.toISOString(),
      insurance_plan: insurance,
      with_chauffeur: withChauffeur,
      pickup_location: pickupLocation || undefined,
      drop_location: withChauffeur ? dropLocation : undefined,
    })
    
    // Always go to payment page
    navigate(`/booking/pay/${response.data.booking_id}`)
  }
```

---

## HOW PAYMENT WORKS

### `frontend/src/pages/booking/PaymentPage.jsx`

The payment page shows 4 methods: Card, UPI, Net Banking, Wallet.

**All payments are SIMULATED** — no real money is charged. The backend just marks the payment as "paid" and generates a fake transaction ID.

```javascript
  async function confirmPay() {
    setDialogState('processing')
    await new Promise(resolve => setTimeout(resolve, 1500))  // Fake 1.5s processing delay
    
    if (method === 'wallet') {
      response = await api.post('/payments/wallet/pay-booking', { booking_id: bookingId })
    } else {
      // Card, UPI, Net Banking all use the same endpoint
      response = await api.post(`/bookings/${bookingId}/simulate-payment`)
    }
    
    setDialogState('success')
    navigate(`/booking/success?ref=${response.data.booking_ref}`)
  }
```

The 1.5-second delay is purely cosmetic — makes it feel like a real payment is being processed.

---

## ALEMBIC MIGRATIONS

### What are migrations?

When you change a model (add a column, create a table), the database doesn't automatically update. Migrations are scripts that ALTER the database schema.

```python
# alembic/versions/a1b2c3d4e5f6_vehicle_total_units.py

def upgrade():
    # This runs when you do: alembic upgrade head
    op.add_column("vehicles", sa.Column("total_units", sa.Integer(), server_default="1"))

def downgrade():
    # This runs when you do: alembic downgrade -1 (undo)
    op.drop_column("vehicles", "total_units")
```

**Why not just change the model and restart?**
- In production, you can't drop and recreate tables (you'd lose all data)
- Migrations apply INCREMENTAL changes (add column, rename column, add index)
- They're versioned — you can see the history of all schema changes
- They're reversible — `downgrade()` undoes the change

---

## CELERY TASKS (Background Jobs)

### `backend/app/tasks/email_tasks.py`

```python
from app.celery_app import celery_app

@celery_app.task
def send_booking_confirmation_email(to_email, payload):
    # This runs in a SEPARATE PROCESS (Celery worker)
    # The main server doesn't wait for this to finish
    send_email(to_email, "Booking Confirmed", template, payload)
```

**Why Celery?**
Sending an email takes 2-5 seconds (SMTP connection, authentication, delivery). If we did this in the request handler, the user would wait 5 seconds after clicking "Book Now." With Celery, we queue the task and respond immediately. The email is sent in the background.

---

## DOCKER COMPOSE

### `docker-compose.yml` explained:

```yaml
services:
  mysql:
    image: mysql:8.0                    # Use official MySQL 8.0 image
    environment:
      MYSQL_ROOT_PASSWORD: rootpass     # Root password
      MYSQL_DATABASE: zoomcar           # Create this database on first boot
    volumes:
      - mysql_data:/var/lib/mysql       # Persist data across container restarts
    healthcheck:
      test: mysqladmin ping             # Docker checks if MySQL is ready
      interval: 10s                     # Check every 10 seconds
```

**What is a volume?**
Without volumes, all data inside a container is lost when it stops. A volume maps a container path to persistent storage on the host machine.

```yaml
  backend:
    build: ./backend                    # Build from backend/Dockerfile
    depends_on:
      mysql:
        condition: service_healthy      # Don't start until MySQL is ready
    env_file: .env                      # Load environment variables
    environment:
      MYSQL_URL: mysql+aiomysql://zoomuser:zoompass@mysql:3306/zoomcar
```

**Why `@mysql:3306` not `@localhost:3306`?**
Inside Docker, each container has its own network. `mysql` is the hostname of the MySQL container (defined by the service name). `localhost` would refer to the backend container itself.

```yaml
  nginx:
    build: ./nginx
    ports:
      - "3001:80"                       # Map host port 3001 → container port 80
    depends_on:
      - backend
```

Only Nginx is exposed to the outside world. All other services communicate internally.

---

## SUMMARY: Data Flow for a Complete Booking

```
1. User opens http://localhost:3001/vehicles
   → Nginx serves index.html (React app)
   → React loads, calls GET /api/vehicles/
   → Nginx proxies to backend:8000/api/vehicles/
   → Backend queries MySQL: SELECT * FROM vehicles WHERE is_approved=1
   → Returns JSON array of vehicles
   → React renders VehicleCards

2. User clicks "Rent Now" on Hyundai Creta
   → React navigates to /vehicles/car-001
   → Calls GET /api/vehicles/car-001
   → Backend returns full details + images + reviews

3. User selects dates, clicks "Book Now"
   → React calls POST /api/bookings/
   → Backend validates (auth, KYC, availability, pricing)
   → Inserts into MySQL: bookings table + payments table
   → Inserts into MongoDB: notification for manager
   → Queues Celery task: send confirmation email
   → Returns { booking_id, booking_ref }
   → React navigates to /booking/pay/booking-id

4. User enters card details, clicks "Pay"
   → React calls POST /api/bookings/booking-id/simulate-payment
   → Backend marks payment as "paid"
   → Credits manager wallet (pending earnings)
   → Updates vehicle availability
   → Returns { transaction_id }
   → React navigates to /booking/success

5. Manager sees notification, starts trip
   → PATCH /api/bookings/booking-id/start-trip
   → booking.status = "active"

6. Manager ends trip
   → PATCH /api/bookings/booking-id/end-trip
   → booking.status = "completed"
   → Security deposit → customer wallet
   → Manager earnings → manager wallet
   → vehicle.total_trips += 1
```

Every step involves: Frontend → Nginx → Backend → Database → Response → Frontend update.


---

## FILE: `backend/app/routers/auth.py` — Authentication (Line by Line)

This is the MOST IMPORTANT backend file. It handles registration, login, OTP verification, token refresh, logout, password reset.

```python
from datetime import datetime, timedelta          # For token expiry calculations
from decimal import Decimal                       # For wallet balance (exact money)
import json                                       # For serializing OTP data to Redis
import re                                         # Regular expressions for name validation
import secrets                                    # Cryptographically secure random numbers (for OTP)
from uuid import uuid4                            # Generate unique IDs for password reset tokens

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
# APIRouter — groups related endpoints together
# Depends — dependency injection (auto-provides db session, current user, etc.)
# HTTPException — returns error responses (401, 403, 404, etc.)
# Request — access to raw HTTP request (headers, IP, cookies)
# status — HTTP status code constants (200, 201, 400, 401, etc.)

from pydantic import BaseModel, EmailStr, Field, field_validator
# BaseModel — defines the shape of request/response data
# EmailStr — validates that a string is a valid email format
# Field — adds constraints (min_length, max_length, pattern)
# field_validator — custom validation logic for a field

from sqlalchemy import select                     # SQL SELECT query builder
from sqlalchemy.ext.asyncio import AsyncSession   # Async database session type

# Internal imports
from app.database import get_db                   # FastAPI dependency that provides DB session
from app.middleware.rate_limiter import rate_limit # Prevents brute-force attacks
from app.models.payment import UserWallet         # To create wallet on registration
from app.models.manager import ManagerProfile     # To create manager profile on registration
from app.models.user import PasswordReset, User, UserKYC  # Database models
from app.mongo_models.analytics import log_activity       # Log actions to MongoDB
from app.mongo_models.session import create_session       # Track login sessions
from app.redis import get_redis                           # Redis for OTP storage
from app.utils import email as email_utils                # Send emails
from app.utils.auth import (
    create_access_token,          # Generate JWT access token
    create_refresh_token,         # Generate JWT refresh token
    get_current_user,             # Dependency: extract user from JWT
    get_password_hash,            # bcrypt hash a password
    get_token_ttl_seconds,        # Calculate remaining token lifetime
    oauth2_scheme,                # Extract Bearer token from header
    validate_password_strength,   # Check password has uppercase, lowercase, number, special
    verify_password,              # Compare plain password against bcrypt hash
    verify_token,                 # Decode and validate a JWT token
)
from app.utils.validators import validate_phone   # Validate Indian phone number format

router = APIRouter(prefix="/auth", tags=["auth"])
# prefix="/auth" means all endpoints in this file start with /auth
# tags=["auth"] groups them in Swagger UI documentation

NAME_RE = re.compile(r"^[A-Za-z][A-Za-z .'-]*$")
# Regex: name must start with a letter, then only letters/spaces/dots/apostrophes/hyphens
# Valid: "Ravi Kumar", "O'Brien", "M.S. Dhoni"
# Invalid: "123abc", "@ravi", ""
```

### OTP Helper Functions

```python
OTP_TTL = 600          # OTP expires after 600 seconds (10 minutes)
OTP_MAX_ATTEMPTS = 5   # Max wrong attempts before OTP is invalidated
RESEND_COOLDOWN = 60   # Must wait 60 seconds between resend requests

def _generate_otp() -> str:
    """Generate a cryptographically random 6-digit OTP."""
    return str(secrets.randbelow(900000) + 100000)
    # secrets.randbelow(900000) → random number 0 to 899999
    # + 100000 → shifts range to 100000 to 999999 (always 6 digits)
    # secrets module is crypto-safe (unlike random module which is predictable)

async def _store_otp(email: str, otp: str) -> None:
    """Store OTP in Redis with expiry."""
    redis = get_redis()
    data = json.dumps({"otp": otp, "attempts": 0, "sent_at": int(datetime.utcnow().timestamp())})
    # Store as JSON string with attempt counter and timestamp
    await redis.setex(f"email_otp:{email.lower()}", OTP_TTL, data)
    # setex = SET with EXpiry — auto-deletes after OTP_TTL seconds
    # Key format: "email_otp:amit@example.com"

async def _verify_otp(email: str, entered_otp: str) -> dict:
    """Verify an OTP. Returns {valid: True/False, reason: str}."""
    redis = get_redis()
    raw = await redis.get(f"email_otp:{email.lower()}")
    
    if not raw:
        # Key doesn't exist — either never sent or expired (>10 min)
        return {"valid": False, "reason": "OTP expired or not found. Please request a new one."}
    
    data = json.loads(raw)  # Parse JSON string back to dict
    
    if data["attempts"] >= OTP_MAX_ATTEMPTS:
        # Too many wrong guesses — delete OTP and force re-request
        await redis.delete(f"email_otp:{email.lower()}")
        return {"valid": False, "reason": "Too many incorrect attempts. Please request a new OTP."}
    
    if data["otp"] != entered_otp:
        # Wrong OTP — increment attempt counter
        data["attempts"] += 1
        await redis.setex(f"email_otp:{email.lower()}", OTP_TTL, json.dumps(data))
        remaining = OTP_MAX_ATTEMPTS - data["attempts"]
        return {"valid": False, "reason": f"Incorrect code. {remaining} attempts left."}
    
    # Correct OTP — delete from Redis (one-time use)
    await redis.delete(f"email_otp:{email.lower()}")
    return {"valid": True}
```

### Request Schemas (Input Validation)

```python
class RegisterRequest(BaseModel):
    email: EmailStr                    # Must be valid email format
    password: str
    confirm_password: str
    full_name: str = Field(min_length=4, max_length=200)  # 4-200 chars
    phone: str | None = None           # Optional
    role: str = Field(default="customer", pattern="^(customer|vehicle_manager)$")
    # pattern regex: only "customer" or "vehicle_manager" allowed
    # Can't register as "admin" — admins are created manually

    @field_validator("password")
    @classmethod
    def password_is_strong(cls, value: str) -> str:
        if not validate_password_strength(value):
            raise ValueError("Password must be 8+ chars with uppercase, lowercase, number, special char")
        return value
    # This runs BEFORE the endpoint — if password is weak, request is rejected with 422

    @field_validator("confirm_password")
    @classmethod
    def passwords_match(cls, value: str, info) -> str:
        if value != info.data.get("password"):
            raise ValueError("Passwords do not match")
        return value
    # info.data contains previously validated fields — so we can compare
```

### Registration Endpoint

```python
@router.post(
    "/register",
    status_code=status.HTTP_201_CREATED,  # Return 201 (Created) on success
    dependencies=[Depends(rate_limit("auth_register", 3, 60, "ip"))],
    # Rate limit: max 3 registrations per IP per 60 seconds
    # Prevents automated account creation attacks
)
async def register(payload: RegisterRequest, db: AsyncSession = Depends(get_db)):
    # payload is auto-validated by Pydantic — if email is invalid, this never runs
    # db is auto-provided by FastAPI's dependency injection
    
    existing = await _find_user_by_email(db, payload.email)
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")
    # 409 Conflict — the resource (email) already exists

    user = User(
        email=payload.email.lower(),                    # Always store lowercase
        hashed_password=get_password_hash(payload.password),  # bcrypt hash
        full_name=payload.full_name.strip(),
        phone=payload.phone,
        role=payload.role,
        is_active=payload.role != "vehicle_manager",    # Managers need admin approval
        is_verified=False,                              # Must verify email via OTP
    )
    db.add(user)          # Stage for insertion (not yet saved)
    await db.flush()      # Execute INSERT, get the generated ID
    
    db.add(UserWallet(user_id=user.id))  # Every user gets a wallet (₹0 balance)
    
    if payload.role == "vehicle_manager":
        db.add(ManagerProfile(user_id=user.id, is_active=False))
        # Manager profile created but inactive until admin approves
    
    await db.commit()     # Save everything to database permanently
    
    # Generate and send OTP
    otp = _generate_otp()
    await _store_otp(user.email, otp)
    print(f"[DEV OTP] {user.email}: {otp}")  # Print to console for easy testing
    
    await email_utils.send_otp_email(user.email, user.full_name, otp)
    # Sends actual email via Gmail SMTP
    
    return {"message": "OTP sent to your email.", "email": user.email}
```

### Login Endpoint

```python
@router.post("/login", dependencies=[Depends(rate_limit("auth_login", 5, 60, "ip"))])
# Max 5 login attempts per IP per minute (prevents brute-force password guessing)
async def login(payload: LoginRequest, request: Request, db: AsyncSession = Depends(get_db)):
    from fastapi.responses import JSONResponse
    
    user = await _find_user_by_email(db, payload.email)
    if user is None or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    # IMPORTANT: same error for wrong email AND wrong password
    # If we said "email not found" vs "wrong password", attackers could enumerate valid emails
    
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account suspended")
    
    if not user.is_verified:
        # Account exists but email not verified — send fresh OTP
        otp = _generate_otp()
        await _store_otp(user.email, otp)
        await email_utils.send_otp_email(user.email, user.full_name, otp)
        raise HTTPException(status_code=403, detail={
            "requires_otp": True, "email": user.email
        })
        # Frontend catches this and redirects to OTP verification page
    
    # Generate tokens
    access_token = create_access_token(_token_subject(user))   # 60-min token
    refresh_token = create_refresh_token(_token_subject(user)) # 30-day token
    
    user.last_login = datetime.utcnow()
    await db.commit()
    
    # Create response with access token in body
    response = JSONResponse(content={
        "access_token": access_token,
        "token_type": "bearer",
        "user": await _serialize_user(db, user),  # Full user object for frontend
    })
    
    # Set refresh token as HttpOnly cookie
    response.set_cookie(
        key="sf_refresh_token",
        value=refresh_token,
        httponly=True,       # JavaScript CANNOT read this cookie (XSS protection)
        secure=False,        # Set True in production (requires HTTPS)
        samesite="strict",   # Cookie only sent to same site (CSRF protection)
        max_age=30*24*3600,  # 30 days in seconds
        path="/api/auth",    # Only sent to /api/auth/* endpoints (not every request)
    )
    return response
```

### Token Refresh Endpoint

```python
@router.post("/refresh")
async def refresh(request: Request, db: AsyncSession = Depends(get_db)):
    from fastapi.responses import JSONResponse
    
    # Read refresh token from HttpOnly cookie (browser sends it automatically)
    cookie_token = request.cookies.get("sf_refresh_token")
    # Fallback: also check request body (for old clients)
    body_token = None
    try:
        body = await request.json()
        body_token = body.get("refresh_token")
    except:
        pass
    
    token_str = cookie_token or body_token
    if not token_str:
        raise HTTPException(status_code=401, detail="No refresh token provided")
    
    # Verify the token is valid and not expired
    token_payload = await verify_token(token_str)
    if token_payload.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Invalid refresh token")
    
    # Look up the user
    user = await db.scalar(select(User).where(User.id == token_payload["sub"]))
    if user is None or not user.is_active:
        raise HTTPException(status_code=401, detail="Invalid refresh token")
    
    # Issue new access token
    access_token = create_access_token(_token_subject(user))
    # Rotate refresh token (old one becomes invalid)
    new_refresh_token = create_refresh_token(_token_subject(user))
    
    response = JSONResponse(content={"access_token": access_token, "token_type": "bearer"})
    response.set_cookie(
        key="sf_refresh_token", value=new_refresh_token,
        httponly=True, secure=False, samesite="strict",
        max_age=30*24*3600, path="/api/auth",
    )
    return response
```

**Why rotate refresh tokens?**
If an attacker steals a refresh token, they can use it forever. By rotating (issuing a new one on each use), the stolen token becomes invalid after the legitimate user refreshes once.

---


## FILE: `backend/app/routers/bookings.py` — Booking System (Key Parts)

### Booking Creation (The Core Business Logic)

```python
@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_booking(
    payload: BookingCreateRequest,
    _: None = Depends(rate_limit("bookings_create", 5, 60, "user_or_ip")),
    # Max 5 bookings per user per minute
    current_user: User = Depends(require_kyc_user),
    # require_kyc_user = must be logged in + KYC approved
    # If KYC not approved, returns 403 before this function even runs
    db: AsyncSession = Depends(get_db),
):
    # Step 1: Only customers can book
    if current_user.role in {"vehicle_manager", "admin"}:
        raise HTTPException(status_code=403, detail="Only customers can make bookings.")
    
    # Step 2: Load the vehicle
    car = await _load_car(db, payload.vehicle_id)
    # _load_car does: SELECT * FROM vehicles WHERE id = ? — raises 404 if not found
    
    # Step 3: Validate dates
    await _validate_dates(car, payload.pickup_datetime, payload.return_datetime)
    # Checks: return > pickup, pickup > now+1hour, duration >= min_trip_hours, duration <= max_trip_days
    
    # Step 4: Check availability (the fleet count logic)
    await _ensure_available(db, car, payload.pickup_datetime, payload.return_datetime, current_user.id)
    # Counts active bookings for this vehicle in this date range
    # If count >= total_units → raises 400 "Vehicle is booked during this period"
    # Also checks: customer doesn't have another booking at the same time
    
    # Step 5: Calculate price
    breakdown, coupon, coupon_error = await _price_breakdown(db, car, payload, current_user)
    if coupon_error:
        raise HTTPException(status_code=400, detail=coupon_error)
    
    # Step 6: Generate unique booking reference
    ref = await _booking_ref(db)
    # Generates random "JPSN" + 6 alphanumeric chars, checks it doesn't exist already
    
    # Step 7: Create the booking record
    booking = Booking(
        booking_ref=ref,
        vehicle_id=car.id,
        customer_id=current_user.id,
        manager_id=car.manager_id,
        status="confirmed" if car.auto_accept_bookings else "pending",
        # auto_accept=True → instantly confirmed (no manager approval needed)
        # auto_accept=False → pending until manager clicks "Accept"
        pickup_datetime=payload.pickup_datetime,
        return_datetime=payload.return_datetime,
        pickup_location=payload.pickup_location or car.location_address,
        drop_location=payload.drop_location if payload.with_chauffeur else None,
        total_hours=Decimal(str(breakdown["duration_hours"])),
        base_amount=Decimal(str(breakdown["base_amount"])),
        discount_amount=...,
        insurance_amount=...,
        with_chauffeur=payload.with_chauffeur,
        chauffeur_fee=Decimal(str(breakdown.get("chauffeur_fee", 0))),
        total_amount=Decimal(str(breakdown["total_amount"])),
        platform_fee=Decimal(str(breakdown["platform_fee"])),      # 10% for SigFleet
        manager_earnings=Decimal(str(breakdown["manager_earnings"])), # 90% for manager
    )
    db.add(booking)
    await db.flush()  # Get booking.id
    
    # Step 8: Record coupon usage (if applied)
    if coupon:
        db.add(CouponUsage(coupon_id=coupon.id, user_id=current_user.id, booking_id=booking.id))
        coupon.used_count += 1
    
    # Step 9: Create payment record (status="created" — not yet paid)
    payment = Payment(
        booking_id=booking.id,
        user_id=current_user.id,
        amount=booking.total_amount,
        payment_method="simulated",
        status="created",  # Will become "paid" after customer pays on payment page
    )
    db.add(payment)
    
    # Step 10: Save everything
    await db.commit()
    await sync_vehicle_availability(db, car.id)  # Recalculate is_available
    await db.commit()
    
    # Step 11: Send notifications
    await create_notification(manager.id, "New booking request", ...)
    await create_notification(current_user.id, "Booking request submitted", ...)
    send_booking_confirmation_email.delay(current_user.email, ...)  # Celery background task
    
    return {
        "booking_id": booking.id,
        "booking_ref": booking.booking_ref,
        "status": booking.status,
        "price_breakdown": breakdown,
    }
```

### Customer Cancellation

```python
@router.post("/{booking_id}/cancel")
async def cancel_booking(booking_id, payload: CancelRequest, current_user, db):
    booking = await _booking_with_access(booking_id, current_user, db)
    # Verifies: booking exists + current_user is the customer or manager or admin
    
    if booking.customer_id != current_user.id:
        raise HTTPException(403, "Only the customer can cancel their own booking")
    
    if booking.status in {"cancelled", "completed", "rejected"}:
        raise HTTPException(400, "Booking cannot be cancelled")
    
    if booking.status == "active":
        raise HTTPException(400, "Cannot cancel a trip that has already started")
    
    # Calculate refund based on cancellation policy
    payment = await db.scalar(select(Payment).where(Payment.booking_id == booking.id))
    
    if payment and payment.status == "paid":
        hours_to_pickup = (booking.pickup_datetime - datetime.utcnow()).total_seconds() / 3600
        paid_amount = Decimal(str(payment.amount))
        
        if hours_to_pickup >= 24:
            # FREE cancellation — full refund
            refund = paid_amount
            policy_applied = "full_refund"
        else:
            # LATE cancellation — 10% charge
            cancellation_charge = (paid_amount * Decimal("0.10")).quantize(Decimal("0.01"))
            refund = paid_amount - cancellation_charge
            policy_applied = "late_cancellation_10pct"
    
    # Update booking status
    booking.status = "cancelled"
    booking.cancellation_reason = payload.reason
    booking.cancelled_at = datetime.utcnow()
    booking.refund_amount = refund
    
    # Credit refund to customer's wallet
    if refund > 0:
        wallet = await get_or_create_wallet(db, booking.customer_id)
        wallet.balance += refund
        add_wallet_transaction(db, booking.customer_id, "credit", refund, wallet.balance,
            f"Refund for cancelled booking {booking.booking_ref}", booking.id)
    
    await db.commit()
    await sync_vehicle_availability(db, car.id)  # Vehicle may become available again
    await db.commit()
```

### Auto-Expiry of Pending Bookings

```python
async def _process_expired_pending_bookings(db, booking_ids):
    """
    Called when customer fetches their bookings.
    Checks: any pending bookings where pickup time has already passed?
    If yes → auto-cancel them (manager never responded).
    """
    now = datetime.utcnow()
    for booking_id in booking_ids:
        booking = await db.scalar(select(Booking).where(
            Booking.id == booking_id, Booking.status == "pending"
        ))
        if booking is None or booking.pickup_datetime >= now:
            continue  # Not expired yet
        
        # This booking's pickup time passed and manager never accepted
        refund = paid_amount  # Always full refund for expired
        
        # Fine the manager if booking was made ≥24h before pickup
        hours_advance = (booking.pickup_datetime - booking.created_at).total_seconds() / 3600
        if hours_advance >= 24:
            fine = max(Decimal("500.00"), paid_amount * Decimal("0.10"))
            # Fine = max(₹500, 10% of booking) — credited to customer
        
        booking.status = "cancelled"
        booking.cancellation_reason = "[EXPIRED] Manager did not accept"
        # ... credit refund + fine to customer wallet
```

---

## FILE: `backend/app/services/booking_flow.py` — Shared Booking Helpers

```python
BLOCKING_STATUSES = ("pending", "confirmed", "active")
# These statuses "block" a vehicle's availability slot

async def sync_vehicle_availability(db, vehicle_id):
    """
    Called after ANY booking status change.
    Recalculates whether the vehicle should show as available.
    """
    car = await db.scalar(select(Vehicle).where(Vehicle.id == vehicle_id))
    if car is None:
        return
    
    total_units = car.total_units or 1
    
    # Count ALL active bookings for this vehicle (regardless of date range)
    active_count = await db.scalar(
        select(func.count()).select_from(Booking).where(
            Booking.vehicle_id == vehicle_id,
            Booking.status.in_(BLOCKING_STATUSES),
        )
    ) or 0
    
    should_be_available = active_count < total_units
    
    if car.is_available != should_be_available:
        car.is_available = should_be_available
    # No commit here — caller must commit
```

```python
async def mark_payment_paid(db, booking, payment, car, customer, manager, payment_method="simulated"):
    """Called when customer completes payment."""
    txn_id = f"SIM_TXN_{uuid4().hex[:12].upper()}"  # Fake transaction ID
    
    payment.status = "paid"
    payment.payment_method = payment_method
    payment.paid_at = datetime.utcnow()
    payment.simulated_transaction_id = txn_id
    
    # If booking was pending and car auto-accepts, confirm it now
    if booking.status == "pending" and car.auto_accept_bookings:
        booking.status = "confirmed"
    
    # Send confirmation emails (via Celery — non-blocking)
    send_booking_confirmation_email.delay(customer.email, payload)
    send_booking_confirmation_email.delay(manager.email, payload)
    
    # Schedule trip reminder (2 hours before pickup)
    reminder_at = booking.pickup_datetime - timedelta(hours=2)
    countdown = max(int((reminder_at - datetime.utcnow()).total_seconds()), 0)
    send_trip_reminder_task.apply_async(args=[booking.id], countdown=countdown)
    
    return txn_id
```

---

## FILE: `frontend/src/App.jsx` — Application Router

```javascript
// lazyWithDelay wraps React.lazy with a minimum 1.5s delay
// This shows the loading spinner on every page navigation
function lazyWithDelay(importFn, delayMs = 1500) {
  return lazy(() =>
    Promise.all([
      importFn(),                                    // Load the actual component
      new Promise((resolve) => setTimeout(resolve, delayMs)),  // Wait minimum time
    ]).then(([module]) => module)  // Return the component after both complete
  )
}

// Every page is lazy-loaded — only downloaded when the user navigates to it
const HomePage = lazyWithDelay(() => import('./pages/HomePage'))
const LoginPage = lazyWithDelay(() => import('./pages/auth/LoginPage'))
// ... 60+ more pages
```

```jsx
export default function App() {
  return (
    <ErrorBoundary>          {/* Catches React crashes, shows fallback UI */}
      <BrowserRouter>        {/* Enables URL-based routing */}
        <AuthProvider>       {/* Provides auth state to all children */}
          <Suspense fallback={<PageLoader />}>  {/* Shows spinner while lazy component loads */}
            <Routes>
              {/* PUBLIC — anyone can access */}
              <Route path="/" element={<HomePage />} />
              <Route path="/vehicles" element={<VehicleListingPage />} />
              
              {/* AUTH — only logged-OUT users (redirects logged-in away) */}
              <Route element={<LoggedOutRoute />}>
                <Route path="/auth/login" element={<LoginPage />} />
                <Route path="/auth/register" element={<RegisterPage />} />
              </Route>
              
              {/* PRIVATE — any logged-in user */}
              <Route element={<PrivateRoute />}>
                <Route path="/booking/pay/:bookingId" element={<PaymentPage />} />
              </Route>
              
              {/* CUSTOMER ONLY */}
              <Route element={<CustomerRoute />}>
                <Route path="/customer/dashboard" element={<DashboardPage />} />
                <Route path="/customer/bookings" element={<MyBookingsPage />} />
              </Route>
              
              {/* MANAGER ONLY */}
              <Route element={<VehicleManagerRoute />}>
                <Route path="/manager" element={<ManagerLayout />}>
                  <Route path="dashboard" element={<ManagerDashboardPage />} />
                  <Route path="vehicles/add" element={<AddVehiclePage />} />
                </Route>
              </Route>
              
              {/* ADMIN ONLY */}
              <Route element={<AdminRoute />}>
                <Route path="/admin" element={<AdminLayout />}>
                  <Route path="dashboard" element={<AdminDashboardPage />} />
                  <Route path="users" element={<AdminUsersPage />} />
                </Route>
              </Route>
            </Routes>
          </Suspense>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  )
}
```

**How routing works:**
- URL changes → React Router finds matching `<Route>`
- If wrapped in a guard (`CustomerRoute`), guard checks auth first
- If guard passes, the page component renders
- If page is lazy-loaded, `Suspense` shows the spinner until it downloads

---

## FILE: `frontend/src/pages/booking/PaymentPage.jsx` — Payment Flow

```javascript
export default function PaymentPage() {
  const { bookingId } = useParams()  // Extract booking ID from URL: /booking/pay/:bookingId
  const [booking, setBooking] = useState(null)
  const [walletData, setWalletData] = useState({ balance: 0 })
  const [method, setMethod] = useState('card')  // Selected payment method
  
  // Card form fields
  const [card, setCard] = useState({ number: '', expiry: '', cvv: '', name: '' })
  const [cardErrors, setCardErrors] = useState({})  // Inline validation errors
  
  // Load booking details + wallet balance on mount
  useEffect(() => {
    async function load() {
      const [bookingRes, walletRes] = await Promise.all([
        api.get(`/bookings/${bookingId}`),
        api.get('/payments/wallet'),
      ])
      setBooking(bookingRes.data)
      setWalletData(walletRes.data)
    }
    load()
  }, [bookingId])
```

```javascript
  function validateAndPay() {
    let valid = true
    
    if (method === 'card') {
      const errors = {}
      const digits = card.number.replace(/\D/g, '')  // Strip spaces/dashes
      if (digits.length < 16) { errors.number = 'Enter a valid 16-digit card number'; valid = false }
      
      // Expiry validation
      if (!card.expiry.match(/^\d{2}\/\d{2}$/)) {
        errors.expiry = 'Enter expiry as MM/YY'; valid = false
      } else {
        const [mm, yy] = card.expiry.split('/').map(Number)
        const expDate = new Date(2000 + yy, mm, 1)  // First day of NEXT month
        if (expDate <= new Date()) { errors.expiry = 'Card has expired'; valid = false }
      }
      
      if (card.cvv.length < 3) { errors.cvv = 'CVV must be 3-4 digits'; valid = false }
      if (!card.name.trim()) { errors.name = 'Cardholder name is required'; valid = false }
      setCardErrors(errors)
    }
    
    if (method === 'upi') {
      if (!upiId.includes('@')) { setUpiError('Enter a valid UPI ID'); valid = false }
    }
    
    if (valid) {
      setDialogOpen(true)  // Show confirmation dialog
    }
  }
```

```javascript
  async function confirmPay() {
    setDialogState('processing')
    
    // Fake 1.5s delay to simulate real payment processing
    await new Promise(resolve => setTimeout(resolve, 1500))
    
    let response
    if (method === 'wallet') {
      // Wallet payment — deducts from user's SigFleet wallet
      response = await api.post('/payments/wallet/pay-booking', { booking_id: bookingId })
    } else {
      // Card/UPI/Net Banking — all use the same simulated endpoint
      response = await api.post(`/bookings/${bookingId}/simulate-payment`)
    }
    
    // Payment successful — navigate to success page
    setDialogState('success')
    navigate(`/booking/success?ref=${response.data.booking_ref}`)
  }
```

---

## FILE: `backend/app/middleware/rate_limiter.py` — Rate Limiting

```python
def rate_limit(key: str, max_requests: int, window_seconds: int, scope: str):
    """
    Returns a FastAPI dependency that enforces rate limits.
    
    key: identifier for this limit (e.g., "auth_login")
    max_requests: max allowed in the window (e.g., 5)
    window_seconds: time window (e.g., 60 = per minute)
    scope: "ip" or "user_or_ip" — what to count against
    """
    async def _limiter(request: Request):
        redis = get_redis()
        
        # Determine the identifier (IP address or user ID)
        if scope == "ip":
            identifier = request.client.host
        else:
            # Try to get user ID from token, fall back to IP
            identifier = extract_user_id(request) or request.client.host
        
        redis_key = f"ratelimit:{key}:{identifier}"
        
        # Increment counter
        current = await redis.incr(redis_key)
        
        if current == 1:
            # First request — set expiry
            await redis.expire(redis_key, window_seconds)
        
        if current > max_requests:
            raise HTTPException(
                status_code=429,
                detail=f"Too many requests. Try again in {window_seconds} seconds."
            )
    
    return Depends(_limiter)
```

**How it works:**
1. First request: Redis key `ratelimit:auth_login:192.168.1.1` = 1, expires in 60s
2. Second request: key = 2
3. ...
4. Sixth request: key = 6 > 5 → HTTP 429 "Too Many Requests"
5. After 60 seconds: key expires, counter resets to 0

---

## FILE: `backend/app/utils/auth.py` — JWT Token Utilities

```python
from jose import jwt, JWTError
from passlib.context import CryptContext

# Password hashing setup
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
# bcrypt: industry-standard password hashing algorithm
# "auto" means it auto-upgrades old hashes to newer bcrypt versions

def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)
    # Input: "Customer@123"
    # Output: "$2b$12$LJ3m4..." (60-char hash — irreversible)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)
    # Hashes the input and compares with stored hash
    # Returns True if they match, False otherwise

def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire, "type": "access", "jti": str(uuid4())})
    # exp: when token expires (Unix timestamp)
    # type: "access" vs "refresh" — so we can't use a refresh token as access
    # jti: unique ID — used for blacklisting on logout
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)

async def verify_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
    
    # Check if token was blacklisted (user logged out)
    jti = payload.get("jti")
    if jti:
        blacklisted = await get_redis().get(f"blacklist:{jti}")
        if blacklisted:
            raise HTTPException(status_code=401, detail="Token has been revoked")
    
    return payload
```

**Why blacklist instead of just deleting the token?**
JWTs are stateless — the server doesn't store them. Once issued, they're valid until expiry. The only way to "invalidate" a JWT before expiry is to maintain a blacklist of revoked token IDs (jti) in Redis.

---

## NGINX CONFIGURATION

### `nginx/nginx.conf`

```nginx
server {
    listen 80;                          # Listen on port 80 (HTTP)
    client_max_body_size 20M;           # Allow uploads up to 20MB
    
    gzip on;                            # Compress responses (saves bandwidth)
    gzip_types text/plain text/css application/json application/javascript;
    
    # Frontend: serve React SPA (Single Page Application)
    location / {
        root /usr/share/nginx/html;     # Where built frontend files live
        index index.html;
        try_files $uri $uri/ /index.html;
        # try_files: try the exact file → try as directory → fall back to index.html
        # This is critical for SPA routing:
        # /customer/dashboard doesn't exist as a file — serve index.html
        # React Router then reads the URL and renders the right page
    }
    
    # Backend API: proxy to FastAPI
    location /api/ {
        proxy_pass http://backend:8000/api/;  # Forward to backend container
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;  # Pass real client IP
        proxy_read_timeout 120s;                   # Wait up to 2 min for response
    }
    
    # Uploaded files: proxy to backend's static file server
    location /uploads/ {
        proxy_pass http://backend:8000/uploads/;
        expires 7d;                     # Browser caches images for 7 days
        add_header Cache-Control "public";
    }
}
```

**Why Nginx in front of FastAPI?**
- Serves static files (HTML, CSS, JS) much faster than Python
- Handles SSL/TLS termination
- Load balancing (if you have multiple backend instances)
- Gzip compression
- Request buffering (protects backend from slow clients)

---

## END OF LINE-BY-LINE EXPLANATION

This covers the 10 most critical files that represent 80% of the application logic:
1. `config.py` — how settings are loaded
2. `database.py` — how MySQL connection works
3. `mongodb.py` — how MongoDB connection works
4. `main.py` — how the server starts and routes are registered
5. `routers/auth.py` — complete auth flow (register, login, OTP, refresh, logout)
6. `routers/bookings.py` — booking creation, cancellation, auto-expiry
7. `services/booking_flow.py` — availability sync, payment marking
8. `App.jsx` — frontend routing and lazy loading
9. `PaymentPage.jsx` — payment validation and processing
10. `middleware/rate_limiter.py` — how rate limiting prevents abuse
11. `utils/auth.py` — JWT creation, verification, password hashing
12. `nginx.conf` — how traffic is routed in production

For the remaining 40+ files, the patterns are the same:
- Routers follow the same pattern as `auth.py` (validate → query → respond)
- Models follow the same pattern as `User` (columns + types + constraints)
- Frontend pages follow the same pattern as `PaymentPage` (state → useEffect → render)
