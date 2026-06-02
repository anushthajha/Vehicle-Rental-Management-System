# SigFleet — Complete Beginner's Guide

> This document explains EVERYTHING in the application from scratch. No prior knowledge assumed.

---

## What is SigFleet?

SigFleet is a **vehicle rental platform** (like Zoomcar) where:
- **Customers** can rent cars, bikes, and travellers (vans/buses) for self-drive or with a chauffeur
- **Vehicle Managers** list their vehicles and earn money when customers book them
- **Admins** control the entire platform — approve vehicles, verify users, manage coupons, handle support

Think of it like Airbnb, but for vehicles instead of houses.

---

## How Does the Application Work? (High Level)

```
┌──────────────┐         ┌──────────────┐         ┌──────────────┐
│   FRONTEND   │ ──API──▶│   BACKEND    │ ──SQL──▶│  DATABASES   │
│  (React App) │◀──JSON──│  (FastAPI)   │◀──Data──│ MySQL/Mongo  │
└──────────────┘         └──────────────┘         └──────────────┘
     Browser              Python Server            Data Storage
```

1. **Frontend** (what the user sees) — a React website running in the browser
2. **Backend** (the brain) — a Python server that processes requests, enforces rules, talks to databases
3. **Databases** (memory) — where all data is permanently stored

When a user clicks "Book Now":
1. Browser sends a request to the backend: "Create a booking for this car"
2. Backend checks: Is the user logged in? Is KYC approved? Is the car available?
3. If all checks pass, backend saves the booking in MySQL and returns success
4. Frontend shows the payment page

---

## The Tech Stack (What Technologies Are Used)

### Frontend (What Users See)

| Technology | What It Does | Analogy |
|---|---|---|
| **React** | Builds the user interface | Like LEGO blocks — each page is made of reusable components |
| **Vite** | Development server + build tool | Like a compiler — turns your code into something browsers understand |
| **Tailwind CSS** | Styling (colors, spacing, fonts) | Like a paint palette — you write `bg-red-500` instead of CSS files |
| **Zustand** | Stores login state | Like a global variable that all components can read |
| **Axios** | Makes API calls to backend | Like a messenger — carries requests to the server and brings back responses |
| **React Router** | Page navigation | Like a GPS — `/vehicles` shows the vehicle page, `/admin` shows admin page |
| **Recharts** | Charts and graphs | Draws the bar charts and pie charts on dashboards |
| **React Leaflet** | Maps | Shows vehicle locations on an interactive map |

### Backend (The Brain)

| Technology | What It Does | Analogy |
|---|---|---|
| **FastAPI** | Web server framework | Like a receptionist — receives requests, routes them to the right handler |
| **SQLAlchemy** | Talks to MySQL database | Like a translator — converts Python objects to SQL queries |
| **Alembic** | Database migrations | Like version control for your database schema — tracks changes |
| **Celery** | Background task queue | Like a postal service — sends emails without making the user wait |
| **Pydantic** | Data validation | Like a bouncer — rejects invalid data before it reaches the database |
| **JWT** | Authentication tokens | Like a wristband at a concert — proves you're allowed in |

### Databases (Where Data Lives)

| Database | What It Stores | Why This One |
|---|---|---|
| **MySQL** | Users, vehicles, bookings, payments, coupons | Structured data with relationships (user HAS bookings, vehicle BELONGS TO manager) |
| **MongoDB** | Reviews, notifications, chat messages, analytics | Flexible documents that don't need strict structure |
| **Redis** | Login tokens, rate limits, cache | Super fast temporary storage (like RAM vs hard drive) |

---

## Project Folder Structure (What's Where)

```
sigFleet/
│
├── frontend/                    ← THE WEBSITE (React)
│   ├── src/
│   │   ├── App.jsx             ← Main file — defines all page routes
│   │   ├── main.jsx            ← Entry point — starts React
│   │   ├── context/
│   │   │   └── AuthContext.jsx ← Login/logout logic, token management
│   │   ├── services/
│   │   │   └── api.js          ← Axios setup — how frontend talks to backend
│   │   ├── pages/              ← Each page of the website
│   │   │   ├── auth/           ← Login, Register, Forgot Password, OTP
│   │   │   ├── user/           ← Customer dashboard, profile, wallet, KYC
│   │   │   ├── booking/        ← Booking details, payment, success
│   │   │   ├── manager/        ← Manager dashboard, vehicles, bookings
│   │   │   └── admin/          ← Admin dashboard, users, vehicles, coupons
│   │   ├── components/         ← Reusable UI pieces (Navbar, Sidebar, Cards)
│   │   ├── hooks/              ← Custom React hooks (data fetching helpers)
│   │   └── utils/              ← Helper functions (formatting, validation)
│   ├── vite.config.js          ← Build configuration
│   ├── tailwind.config.js      ← Styling configuration
│   └── package.json            ← Dependencies list (like requirements.txt for JS)
│
├── backend/                     ← THE SERVER (Python)
│   ├── app/
│   │   ├── main.py             ← Server entry point — starts FastAPI
│   │   ├── config.py           ← Reads environment variables (.env file)
│   │   ├── database.py         ← MySQL connection setup
│   │   ├── mongodb.py          ← MongoDB connection setup
│   │   ├── redis.py            ← Redis connection setup
│   │   ├── seed.py             ← Creates demo data (users, vehicles, bookings)
│   │   ├── models/             ← Database table definitions (what columns exist)
│   │   ├── routers/            ← API endpoints (what URLs the backend responds to)
│   │   ├── services/           ← Business logic (pricing, availability, etc.)
│   │   ├── middleware/         ← Request processing (auth check, rate limiting)
│   │   ├── tasks/              ← Background jobs (sending emails)
│   │   └── utils/              ← Helper functions (password hashing, validators)
│   ├── alembic/                ← Database migration files
│   ├── uploads/                ← Uploaded files (profile photos, KYC documents)
│   ├── requirements.txt        ← Python dependencies list
│   └── .env                    ← Secret configuration (passwords, API keys)
│
├── nginx/                       ← WEB SERVER (for production)
│   ├── nginx.conf              ← Routes traffic: / → frontend, /api → backend
│   └── html/                   ← Built frontend files (served to browsers)
│
├── docker-compose.yml           ← Runs everything together in containers
├── .env                         ← Environment variables for Docker
└── docs/                        ← Documentation (you're reading this!)
```

---

## How Authentication Works (Login System)

### The Problem
HTTP is "stateless" — the server doesn't remember who you are between requests. So we need a way to prove identity on every request.

### The Solution: JWT Tokens

```
1. User logs in with email + password
2. Backend verifies credentials against the database
3. Backend creates a JWT token (a signed string containing user ID + role + expiry)
4. Frontend stores the token in memory
5. Every future request includes this token in the header
6. Backend reads the token, knows who's making the request
```

**JWT Token looks like:** `eyJhbGciOiJIUzI1NiIs...` (encoded JSON)
**Decoded it contains:** `{ "sub": "user-id-123", "role": "customer", "exp": 1700000000 }`

### Token Types
- **Access Token** (60 minutes) — used for every API call
- **Refresh Token** (30 days) — stored as HttpOnly cookie, used to get a new access token when the old one expires

### Why HttpOnly Cookie?
- JavaScript can't read it (prevents XSS attacks from stealing tokens)
- Sent automatically with every request to `/api/auth/*`
- Each browser tab has its own session (you can be logged in as different users in different tabs)

---

## How the Database Works

### MySQL Tables (Relational Data)

Think of MySQL like Excel spreadsheets with relationships between them.

**Users table:**
| id | email | full_name | role | hashed_password |
|---|---|---|---|---|
| abc-123 | amit@example.com | Amit Singh | customer | $2b$12... |
| def-456 | ravi@sigfleet.com | Ravi Kumar | vehicle_manager | $2b$12... |

**Vehicles table:**
| id | manager_id | title | price_per_day | is_available |
|---|---|---|---|---|
| car-001 | def-456 | Hyundai Creta | 2500 | true |

**Bookings table:**
| id | vehicle_id | customer_id | manager_id | status | total_amount |
|---|---|---|---|---|---|
| book-001 | car-001 | abc-123 | def-456 | confirmed | 5000 |

The `manager_id` in bookings REFERENCES the `id` in users — this is a **foreign key relationship**.

### MongoDB Collections (Flexible Documents)

MongoDB stores data as JSON-like documents. No fixed columns.

**Reviews collection:**
```json
{
  "_id": "64a...",
  "booking_id": "book-001",
  "reviewer_name": "Amit Singh",
  "rating": 5,
  "body": "Great car, smooth drive!",
  "car_snapshot": { "title": "Hyundai Creta" }
}
```

### Redis (Fast Cache)

Redis stores temporary data in memory (RAM) — extremely fast but lost on restart.

Used for:
- `blacklist:token-id` → logged out tokens (so they can't be reused)
- `email_otp:amit@example.com` → `{"otp": "123456", "attempts": 0}`
- `notifications:unread:user-id` → `5` (cached count)

---

## How a Booking Works (Step by Step)

### 1. Customer Searches for a Vehicle
```
Frontend: GET /api/vehicles/?city=Bengaluru&pickup_date=2026-06-01&return_date=2026-06-03
Backend: Queries MySQL → filters by city, checks availability, returns list
Frontend: Shows vehicle cards
```

### 2. Customer Views Vehicle Details
```
Frontend: GET /api/vehicles/car-001
Backend: Returns full details + images + reviews + manager info
Frontend: Shows detail page with booking widget
```

### 3. Customer Selects Dates and Clicks "Book Now"
```
Frontend: POST /api/bookings/
Body: { vehicle_id, pickup_datetime, return_datetime, insurance_plan, with_chauffeur }

Backend checks:
  ✓ User is logged in (JWT token valid)
  ✓ User has KYC approved
  ✓ Vehicle exists and is approved
  ✓ Dates are valid (pickup > now, return > pickup)
  ✓ Vehicle is available (active_bookings < total_units for those dates)
  ✓ No date overlap with existing bookings
  ✓ Coupon is valid (if provided)

Backend creates:
  - Booking record (status = "confirmed" because auto_accept = true)
  - Payment record (status = "created")
  - Sends notification to manager

Frontend: Redirects to /booking/pay/:id
```

### 4. Customer Pays
```
Frontend: POST /api/bookings/:id/simulate-payment
Backend:
  - Marks payment as "paid"
  - Sends confirmation emails to customer + manager
  - Updates vehicle availability (sync_vehicle_availability)
Frontend: Shows success page with booking reference
```

### 5. Manager Starts the Trip
```
Manager Frontend: PATCH /api/bookings/:id/start-trip
Body: { odometer_start: 45000 }
Backend: booking.status = "active", records pickup time
```

### 6. Manager Ends the Trip
```
Manager Frontend: PATCH /api/bookings/:id/end-trip
Body: { odometer_end: 45600 }
Backend:
  - Calculates extra KM charges (if driven > included_km_per_day × days)
  - booking.status = "completed"
  - Releases security deposit → customer wallet
  - Credits manager earnings → manager wallet
  - Increments vehicle.total_trips
  - Checks if manager qualifies as "Super Manager"
```

---

## How Availability Works

Each vehicle has `total_units` (e.g., 2 = the manager has 2 of the same car).

```python
# When checking if a vehicle is available for June 1-3:
active_bookings = COUNT bookings WHERE
    vehicle_id = this_vehicle AND
    status IN ('pending', 'confirmed', 'active') AND
    pickup_datetime < June 3 AND    # booking starts before our end
    return_datetime > June 1         # booking ends after our start

if active_bookings >= vehicle.total_units:
    return "Not available"
else:
    return "Available"
```

After every booking creation/cancellation/completion, `sync_vehicle_availability()` runs:
- If `active_bookings >= total_units` → set `is_available = False`
- If `active_bookings < total_units` → set `is_available = True`

---

## How Cancellation Policy Works

### Customer Cancels
```
hours_to_pickup = (pickup_datetime - now) in hours

if hours_to_pickup >= 24:
    → Full refund (free cancellation)
elif hours_to_pickup < 24:
    → 10% charge, 90% refund (late cancellation)
```

### Manager Cancels
```
→ Customer gets 100% refund
→ Customer also gets a FINE: max(₹500, 10% of booking amount)
→ Manager's acceptance_rate decreases by 5%
```

### Auto-Expiry (Manager Never Responds)
```
if booking.status == "pending" AND pickup_datetime has passed:
    → Auto-cancel with reason "[EXPIRED]"
    → Customer gets full refund
    → If booking was made ≥24h before pickup: manager gets fined too
```

---

## How the Frontend Routes Work

React Router maps URLs to page components:

```jsx
// Public (anyone can see)
/                    → HomePage
/vehicles            → VehicleListingPage
/vehicles/:id        → VehicleDetailPage

// Auth (only logged-out users)
/auth/login          → LoginPage
/auth/register       → RegisterPage
/auth/forgot-password → ForgotPasswordPage (3-step OTP)

// Customer only
/customer/dashboard  → DashboardPage
/customer/bookings   → MyBookingsPage
/customer/kyc        → KYCPage
/customer/profile    → ProfilePage

// Manager only
/manager/dashboard   → ManagerDashboardPage
/manager/vehicles    → ManagerVehiclesPage
/manager/vehicles/add → AddVehiclePage (7-step wizard)
/manager/bookings    → ManagerBookingsPage

// Admin only
/admin/dashboard     → AdminDashboardPage
/admin/users         → AdminUsersPage
/admin/kyc           → AdminKYCPage
/admin/coupons       → AdminCouponsPage
```

**Route Guards** prevent unauthorized access:
- `PrivateRoute` — must be logged in
- `CustomerRoute` — must be role=customer
- `VehicleManagerRoute` — must be role=vehicle_manager
- `AdminRoute` — must be role=admin

If you paste `/admin/dashboard` in a new tab without being logged in → redirected to `/auth/login`.

---

## How the API Endpoints Work

The backend exposes REST API endpoints. Each endpoint:
1. Has a **URL** (e.g., `/api/bookings/`)
2. Has a **method** (GET = read, POST = create, PATCH = update, DELETE = remove)
3. May require **authentication** (JWT token in header)
4. Accepts **input** (JSON body or query parameters)
5. Returns **output** (JSON response)

Example:
```
POST /api/bookings/
Headers: { Authorization: "Bearer eyJ..." }
Body: { "vehicle_id": "car-001", "pickup_datetime": "2026-06-01T10:00:00" }
Response: { "booking_id": "book-001", "booking_ref": "JPSNABC123", "status": "confirmed" }
```

---

## How Email OTP Works

### Registration:
1. User submits registration form
2. Backend creates user with `is_verified = false`
3. Backend generates 6-digit OTP: `secrets.randbelow(900000) + 100000` → e.g., `847291`
4. Stores in Redis: `email_otp:user@email.com` → `{"otp": "847291", "attempts": 0}` (expires in 10 min)
5. Sends email via Gmail SMTP with the OTP
6. User enters OTP on the verify page
7. Backend checks Redis → if matches, sets `is_verified = true`

### Forgot Password:
Same flow but:
1. Sends OTP to existing email
2. After OTP verified, allows setting new password
3. Deletes OTP from Redis so it can't be reused

---

## How File Uploads Work

### Profile Photo:
1. User selects image file
2. Frontend sends as `FormData` (multipart/form-data)
3. Backend receives the file, validates (JPG/PNG/WebP, max 2MB)
4. Resizes to 400×400 pixels using Pillow (Python image library)
5. Saves as WebP format to `uploads/avatars/{user_id}.webp`
6. Updates `user.profile_picture = "/uploads/avatars/{user_id}.webp"`
7. Nginx serves `/uploads/` as static files

### KYC Documents:
Same flow but saves to `uploads/kyc/{user_id}/dl_front.jpg`, etc.

---

## How the Wallet Works

Every user has a wallet (balance starts at ₹500 from seed).

**Credits (money in):**
- Signup bonus
- Booking refunds (cancellation)
- Manager cancellation fines
- Security deposit release (after trip)
- Manual top-up

**Debits (money out):**
- Paying for a booking with wallet

Every transaction is recorded in `wallet_transactions` table with:
- Amount, type (credit/debit), balance_after, description, timestamp

---

## How Reviews Work

After a trip is completed:
1. Customer can write 2 reviews:
   - `customer_to_vehicle` — rates the car (shown on vehicle detail page)
   - `customer_to_manager` — rates the manager (updates manager's average rating)
2. Manager can write 1 review:
   - `manager_to_customer` — rates the customer

Reviews are stored in **MongoDB** (flexible schema, easy to query by vehicle/user).

The vehicle's `average_rating` in MySQL is updated every time a new review is added (calculated from all `customer_to_vehicle` reviews for that vehicle).

---

## How the Admin Dashboard Works

The admin sees platform-wide statistics:
- **Total users, vehicles, bookings, revenue** — SQL COUNT/SUM queries
- **Revenue charts** — GROUP BY month, SUM(platform_fee)
- **Booking status distribution** — GROUP BY status, COUNT
- **Activity feed** — recent actions from MongoDB analytics collection

Admin actions:
- **Approve/reject vehicles** — sets `is_approved = true/false`
- **Approve/reject KYC** — sets `kyc_status = approved/rejected`
- **Suspend users** — sets `is_active = false` (can't login)
- **Manage coupons** — CRUD with max 5% discount rule
- **Handle support tickets** — read customer messages, reply, change status

---

## How Docker Deployment Works

Docker packages each service into an isolated "container" (like a mini virtual machine):

```
┌─────────────────────────────────────────────────────┐
│                  Docker Compose                       │
│                                                      │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐            │
│  │  MySQL  │  │ MongoDB │  │  Redis  │  ← Databases│
│  └────┬────┘  └────┬────┘  └────┬────┘            │
│       │             │            │                   │
│  ┌────┴─────────────┴────────────┴────┐            │
│  │           Backend (FastAPI)         │            │
│  └────────────────┬───────────────────┘            │
│                   │                                  │
│  ┌────────────────┴───────────────────┐            │
│  │         Nginx (Web Server)          │            │
│  │   / → Frontend    /api → Backend   │            │
│  └────────────────────────────────────┘            │
│                   │                                  │
└───────────────────┼──────────────────────────────────┘
                    │
              Port 3001
              (Internet)
```

`docker-compose up` starts ALL services together. They communicate via an internal network (`zoomcar-net`). Only Nginx is exposed to the internet on port 3001.

---

## How Notifications Work

When something important happens (booking confirmed, KYC approved, etc.):
1. Backend calls `create_notification(user_id, title, message, type)`
2. This inserts a document into MongoDB `notifications` collection
3. Frontend's `NotificationBell` component polls `GET /notifications/unread-count` every 60 seconds
4. When user opens the bell dropdown, it fetches the latest 8 notifications
5. Clicking a notification marks it as read and navigates to the relevant page

---

## How Rate Limiting Works

To prevent abuse (someone creating 1000 bookings per second):

```python
@router.post("/bookings/", dependencies=[Depends(rate_limit("bookings_create", 5, 60, "user_or_ip"))])
```

This means: max 5 booking creation requests per 60 seconds per user (or per IP if not logged in).

Implementation:
1. On each request, increment a Redis counter: `ratelimit:bookings_create:user-123`
2. Set expiry to 60 seconds
3. If counter > 5, return HTTP 429 "Too Many Requests"

---

## How the Coupon System Works

Coupons have:
- `code` — e.g., "FLEET5"
- `discount_type` — "percent" or "flat"
- `discount_value` — e.g., 5 (means 5%)
- `max_discount` — e.g., ₹200 (caps the discount)
- `min_booking_amount` — e.g., ₹2000 (minimum booking to use this coupon)
- `valid_from` / `valid_until` — date range
- `usage_limit` — max uses per user (null = unlimited)

Validation:
```
1. Is the code active and within date range?
2. Is the booking amount >= min_booking_amount?
3. Has this user already used it (usage_limit check)?
4. Calculate discount: min(booking × discount_value%, max_discount)
```

Rule: **Maximum 5% discount** — enforced in both backend validation and frontend coupon creation form.

---

## How the Support Ticket System Works

### Flow:
1. **Customer** raises a ticket (subject + description + category)
2. **Admin/Manager** sees it in their Support queue
3. **Admin/Manager** replies → customer gets notification
4. **Admin/Manager** sets status to "Resolved"
5. **Customer** sees "Satisfied?" prompt:
   - ✓ Satisfied → ticket **Closed** (final)
   - ✗ Not Satisfied → ticket reopens to "In Progress"

Only the customer can close a ticket. Staff can only mark it "Resolved" (meaning "we think it's fixed").

---

## Environment Variables Explained

The `.env` file contains secrets that should never be in code:

```env
# Database connection strings (how to connect)
MYSQL_URL=mysql+aiomysql://user:password@host:3306/database
MONGODB_URL=mongodb://user:password@host:27017/database
REDIS_URL=redis://host:6379/0

# JWT secret (used to sign tokens — if someone knows this, they can forge tokens)
SECRET_KEY=random-64-character-string

# Email credentials (for sending OTPs and notifications)
SMTP_HOST=smtp.gmail.com
SMTP_USER=your@gmail.com
SMTP_PASSWORD=your-app-password  # NOT your Gmail password — use App Password

# Token expiry
ACCESS_TOKEN_EXPIRE_MINUTES=60   # Access token lives 1 hour
REFRESH_TOKEN_EXPIRE_DAYS=30     # Refresh token lives 30 days
```

---

## Common Patterns in the Code

### Backend: Router → Service → Model

```python
# Router (receives HTTP request)
@router.post("/bookings/")
async def create_booking(payload, db):
    car = await load_car(db, payload.vehicle_id)          # Model layer
    available = await check_available(car, dates, db)      # Service layer
    booking = Booking(...)                                  # Create model instance
    db.add(booking)                                        # Save to database
    await db.commit()
    return {"booking_id": booking.id}
```

### Frontend: Page → API call → State → Render

```jsx
function MyBookingsPage() {
  const [bookings, setBookings] = useState([])     // State
  
  useEffect(() => {
    api.get('/bookings/').then(res => {             // API call
      setBookings(res.data.bookings)               // Update state
    })
  }, [])
  
  return (
    <div>
      {bookings.map(b => <BookingCard booking={b} />)}  {/* Render */}
    </div>
  )
}
```

---

## Glossary

| Term | Meaning |
|---|---|
| **API** | Application Programming Interface — how frontend talks to backend |
| **JWT** | JSON Web Token — a signed string proving who you are |
| **ORM** | Object-Relational Mapping — converts Python objects to SQL |
| **CRUD** | Create, Read, Update, Delete — the 4 basic database operations |
| **REST** | Representational State Transfer — a style of API design using HTTP methods |
| **Middleware** | Code that runs on every request before reaching the endpoint |
| **Migration** | A versioned change to the database schema (add column, create table) |
| **Seed** | Pre-populating the database with demo data |
| **Docker** | Packages applications into isolated containers |
| **Nginx** | A web server that routes traffic and serves static files |
| **Redis** | An in-memory database used for caching and temporary data |
| **Celery** | A task queue that runs background jobs (like sending emails) |
| **WebP** | An image format that's smaller than JPEG/PNG |
| **Zustand** | A lightweight state management library for React |
| **Tailwind** | A CSS framework where you style using class names like `bg-red-500` |
| **Vite** | A fast build tool for modern web applications |
| **Alembic** | Database migration tool for SQLAlchemy |
| **Pydantic** | Data validation library — ensures API inputs are correct |
| **Motor** | Async MongoDB driver for Python |
| **aiomysql** | Async MySQL driver for Python |
