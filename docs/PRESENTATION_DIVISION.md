# SigFleet — Presentation Division (3 Members)

> Each member owns one primary role + equal share of infrastructure/tech stack.
> Total coverage: all 3 user roles, full backend, full frontend, database, deployment.

---

## Member 1 — Customer Experience & Auth

**Primary Role:** Customer  
**Theme:** "How a user discovers, books, and manages their rental"

### Sections to Present

#### 1. Authentication System
- Registration with OTP email verification
- Login → JWT access + refresh token flow
- Route guards (protected pages redirect to login)
- Password reset flow
- Profile management (avatar upload/delete, personal info, password change)

#### 2. Public Landing & Discovery
- Homepage: hero search, vehicle type tabs (Cars / Bikes / Travellers), category grid, city explorer, live reviews, footer
- Vehicle Listing Page: 20+ filters, grid/list/map views, pagination, type tab bar
- Vehicle Detail Page: photo gallery, booking widget, availability calendar, reviews section, manager info, similar vehicles

#### 3. Booking Flow (End-to-End)
- Selecting dates, insurance plan, rental type (Self Drive vs Chauffeur)
- Pickup address (shown from store) vs chauffeur pickup + drop address inputs
- Coupon code application (max 5% discount)
- Price breakdown (base + insurance + chauffeur fee + platform fee)
- Payment page: Card / UPI / Net Banking / Wallet methods with field validation
- Booking confirmation with QR code

#### 4. Customer Dashboard
- Overview: active trips, upcoming bookings, wallet balance, wishlist count
- My Bookings: Upcoming / Active / History / Cancelled tabs
- Booking Details: QR code, payment info, inspection report, trip reviews, action buttons (Write Review, Contact Support, Download Invoice)
- Cancellation policy display (free vs 10% charge)

#### 5. Supporting Features
- KYC submission (DL + Aadhaar upload, status tracking)
- Wallet (add money, transaction history)
- Wishlist (saved vehicles, synced to backend)
- Reviews (write, view given/received)
- Notifications (filter, mark read, delete, clear all)
- Support ticket creation

#### Tech to Highlight
- `AuthContext.jsx` — Zustand state, token rehydration, refresh logic
- `RouteGuards.jsx` — role-based protection
- `BookingWidget` in `VehicleDetailPage.jsx` — availability check, price calculation
- `PaymentPage.jsx` — simulated payment with validation
- `KYCPage.jsx` — multi-state form (not submitted / under review / approved / rejected)

---

## Member 2 — Vehicle Manager Operations

**Primary Role:** Vehicle Manager  
**Theme:** "How a manager lists vehicles, manages bookings, and earns money"

### Sections to Present

#### 1. Manager Onboarding
- Registration as Vehicle Manager
- KYC submission (same flow as customer)
- Manager profile setup (bio, bank details for payouts)

#### 2. Vehicle Listing (7-Step Wizard)
- **Step 0 — Basic Info**: Vehicle Type selector (🚗 Car / 🏍️ Bike / 🚌 Traveller), adaptive category filter, make/model/year, registration number, color
- **Step 1 — Features**: AC, GPS, sunroof, child seat, etc. + description
- **Step 2 — Location**: City dropdown + area + full address + interactive map pin
- **Step 3 — Pricing**: hourly/daily price, security deposit, KM limits, auto-accept toggle, earnings estimator
- **Step 4 — Photos**: drag-and-drop upload, reorder, set primary
- **Step 5 — Documents**: RC upload (required), insurance (optional), chauffeur details
- **Step 6 — Review**: summary before submit → goes to admin approval queue

#### 3. Booking Management
- Pending bookings: Accept / Reject with reason
- Confirmed bookings: Start Trip (record odometer), End Trip (calculate extra KM charges)
- Active trips: real-time view
- Extension requests: approve/reject
- Manager cancellation: customer gets 100% refund + cancellation fine

#### 4. Fleet Count & Availability
- `total_units` field — how many units of the same vehicle exist
- Availability logic: `active_bookings < total_units` → available
- Manual availability blocks (block specific dates)
- `sync_vehicle_availability()` — auto-updates `is_available` after each booking change

#### 5. Earnings & Payouts
- Earnings dashboard with monthly chart
- Platform fee: 10% taken by SigFleet; manager gets 90%
- Security deposit: held during trip, released on completion
- Payout requests to bank account
- Super Manager badge (≥50 trips, ≥4.5 rating, ≥90% acceptance)

#### 6. Availability Calendar
- Month-by-month view of booked/blocked/available days
- Block specific date ranges manually

#### Tech to Highlight
- `AddVehiclePage.jsx` — 7-step wizard with Zustand persistence, Zod validation, Leaflet map
- `ManagerBookingsPage.jsx` — booking lifecycle management
- `services/availability.py` — `AvailabilityService.check_vehicle_available()`
- `services/pricing.py` — `calculate_booking_price()`
- `services/booking_flow.py` — `sync_vehicle_availability()`, `mark_payment_paid()`
- `services/super_manager.py` — Super Manager qualification check

---

## Member 3 — Admin Control & Infrastructure

**Primary Role:** Admin  
**Theme:** "Platform governance, analytics, and the technical architecture"

### Sections to Present

#### 1. Admin Dashboard & Analytics
- Platform overview: total users, vehicles, bookings, revenue
- Revenue charts (monthly, weekly, growth %)
- Booking status distribution
- City-wise vehicle distribution
- Top vehicles by trips
- New user trends

#### 2. User Management
- Customers tab: view all customers, KYC status, booking count, suspend/reactivate
- Vehicle Managers tab: view all managers, acceptance rate, total listings, create new manager
- Bulk suspend selected users

#### 3. Vehicle Approval Workflow
- New listings arrive in "Pending Approval" queue
- Admin reviews: approve (makes vehicle live) or reject with reason
- Feature/unfeature vehicles on homepage
- Manage vehicle categories and types

#### 4. KYC Review
- Queue of pending KYC submissions
- View uploaded DL and Aadhaar images
- Approve → user can now book; Reject → user gets email with reason and can resubmit

#### 5. Coupon Management
- Create coupons: code, type (percent/flat), value (max 5% for percent), min booking amount, max discount, validity, usage limit
- Activate/deactivate coupons
- Track usage count
- Focus-safe form (Field component defined outside modal — no focus loss bug)

#### 6. Support Ticket Management
- View all tickets with status (open/in_progress/resolved)
- Update status, add admin reply
- Priority levels (high/medium/low)

#### 7. Technical Architecture (Deep Dive)
- **Database design**: MySQL (relational data) + MongoDB (documents) + Redis (cache/queue)
- **Alembic migrations**: versioned schema changes (`total_units`, `drop_location`, etc.)
- **Celery task queue**: async email sending (booking confirmations, KYC updates, trip reminders)
- **Rate limiting**: Redis-based per-user/IP limits on booking creation and search
- **JWT security**: access token (60 min) + refresh token (30 days) + Redis blacklist on logout
- **File uploads**: Pillow image processing, WebP conversion, served as static files
- **CORS**: configured for all frontend dev ports (5173–5177)
- **Docker Compose**: full stack deployment with Nginx reverse proxy

#### 8. Seed Data & Demo Setup
- 2 admins, 7 managers (one per city), 10 customers
- 33 vehicles across 8 cities, all approved + auto-accept
- 5 coupons (FIRST5, FLEET5, EV5, WEEKEND5, CITY5)
- 25 bookings (15 completed, 5 confirmed, 3 active, 2 cancelled)
- KYC: 7 approved, 3 pending (rohan, vikram, lakshmi)

#### Tech to Highlight
- `app/main.py` — app setup, middleware, router registration
- `routers/admin.py` — stats, analytics, user/vehicle management
- `middleware/rate_limiter.py` — Redis-based rate limiting
- `middleware/auth_middleware.py` — optional JWT extraction
- `alembic/versions/` — migration history
- `celery_app.py` + `tasks/email_tasks.py` — async task queue
- `docker-compose.yml` — full stack orchestration

---

## Shared Talking Points (All 3 Members)

| Topic | Who Covers |
|---|---|
| Tech stack overview | Member 3 |
| Database schema | Member 3 |
| Auth flow | Member 1 |
| Booking lifecycle | Member 1 (customer side) + Member 2 (manager side) |
| Cancellation policy | Member 1 |
| Fleet count logic | Member 2 |
| Payment simulation | Member 1 |
| Review system | Member 1 (write) + Member 2 (reply) |
| Notifications | Member 1 |
| KYC flow | Member 1 (submit) + Member 3 (approve) |
| Vehicle listing | Member 2 |
| Earnings/payouts | Member 2 |
| Admin analytics | Member 3 |
| Coupon system | Member 3 |
| Infrastructure | Member 3 |

---

## Demo Credentials

| Role | Email | Password |
|---|---|---|
| Admin | admin@sigfleet.com | Admin@123 |
| Manager (Bengaluru) | ravi@sigfleet.com | Manager@123 |
| Customer (KYC approved) | amit@example.com | Customer@123 |
| Customer (KYC pending) | rohan@example.com | Customer@123 |
