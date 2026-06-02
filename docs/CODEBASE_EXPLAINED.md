# SigFleet — Complete Codebase Explanation

> A full-stack self-drive vehicle rental platform. Three user roles: **Customer**, **Vehicle Manager**, **Admin**.

---

## Table of Contents
1. [Project Structure](#1-project-structure)
2. [Tech Stack](#2-tech-stack)
3. [Backend — Core Files](#3-backend--core-files)
4. [Backend — Models (Database Tables)](#4-backend--models-database-tables)
5. [Backend — Routers (API Endpoints)](#5-backend--routers-api-endpoints)
6. [Backend — Services](#6-backend--services)
7. [Backend — Middleware](#7-backend--middleware)
8. [Backend — Tasks (Celery)](#8-backend--tasks-celery)
9. [Frontend — Entry & Config](#9-frontend--entry--config)
10. [Frontend — Auth & State](#10-frontend--auth--state)
11. [Frontend — Pages by Role](#11-frontend--pages-by-role)
12. [Frontend — Shared Components](#12-frontend--shared-components)
13. [Database Schema Summary](#13-database-schema-summary)
14. [Key Business Logic](#14-key-business-logic)

---

## 1. Project Structure

```
sigFleet/
├── backend/                  # FastAPI Python backend
│   ├── app/
│   │   ├── main.py           # App entry point, router registration
│   │   ├── config.py         # Environment variable settings
│   │   ├── database.py       # MySQL async SQLAlchemy engine
│   │   ├── mongodb.py        # MongoDB Motor async client
│   │   ├── redis.py          # Redis async client
│   │   ├── celery_app.py     # Celery task queue setup
│   │   ├── seed.py           # Demo data seeder
│   │   ├── models/           # SQLAlchemy ORM models (MySQL)
│   │   ├── mongo_models/     # MongoDB document helpers
│   │   ├── routers/          # FastAPI route handlers
│   │   ├── services/         # Business logic layer
│   │   ├── middleware/       # Auth, error handling, rate limiting
│   │   ├── tasks/            # Celery async tasks (email, etc.)
│   │   └── utils/            # Auth helpers, validators
│   ├── alembic/              # Database migrations
│   └── uploads/              # Uploaded files (avatars, KYC, vehicles)
├── frontend/                 # React + Vite frontend
│   └── src/
│       ├── App.jsx           # Root router with all routes
│       ├── main.jsx          # React DOM entry point
│       ├── context/          # Auth state (Zustand)
│       ├── services/         # Axios API client
│       ├── pages/            # All page components by role
│       ├── components/       # Reusable UI components
│       ├── hooks/            # Custom React hooks
│       └── utils/            # Formatting, search helpers
└── docs/                     # Documentation
```

---

## 2. Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| Frontend | React 18 + Vite | UI framework and build tool |
| Styling | Tailwind CSS | Utility-first CSS |
| State | Zustand | Global auth state |
| Data fetching | Axios + TanStack Query | API calls and caching |
| Charts | Recharts | Analytics dashboards |
| Maps | React Leaflet | Vehicle location maps |
| Backend | FastAPI (Python) | REST API server |
| ORM | SQLAlchemy (async) | MySQL database access |
| Migrations | Alembic | Database schema versioning |
| Primary DB | MySQL 8 | Users, vehicles, bookings, payments |
| Document DB | MongoDB | Reviews, notifications, sessions |
| Cache/Queue | Redis | JWT blacklist, rate limits, Celery |
| Task Queue | Celery | Background email sending |
| Email | Gmail SMTP | OTP, booking confirmations |

---

## 3. Backend — Core Files

### `app/main.py`
The FastAPI application entry point. It:
- Creates the FastAPI app with lifespan hooks (connects/disconnects MongoDB on startup/shutdown)
- Registers CORS middleware (allows frontend origins)
- Mounts `/uploads` as a static file directory (serves uploaded images)
- Registers all routers with the `/api` prefix
- Exposes `/api/health` and `/api/docs` (Swagger UI)

### `app/config.py`
Uses `pydantic-settings` to load all environment variables from `.env`. Contains settings for MySQL URL, MongoDB URL, Redis URL, JWT secret, SMTP credentials, upload limits, and payment simulation flag.

### `app/database.py`
Sets up the async SQLAlchemy engine for MySQL using `aiomysql`. Provides:
- `AsyncSessionLocal` — async session factory
- `get_db()` — FastAPI dependency that yields a database session per request
- `init_db()` — creates all tables on startup

### `app/mongodb.py`
Sets up the Motor async MongoDB client. Provides:
- `connect_mongo()` / `disconnect_mongo()` — lifecycle hooks
- `get_mongo_db()` — returns the active database instance

### `app/redis.py`
Sets up the aioredis async Redis client. Used for caching unread notification counts, rate limiting, and as the Celery broker.

### `app/seed.py`
Populates the database with demo data: 2 admins, 7 managers, 10 customers, 33 vehicles, 5 coupons, 25 bookings, 10 reviews, 24 notifications, KYC records, wallets, and support tickets.

---

## 4. Backend — Models (Database Tables)

### `models/user.py` — `User`, `UserKYC`
- **User**: stores all users regardless of role (`admin`, `vehicle_manager`, `customer`). Fields: `id`, `email`, `hashed_password`, `full_name`, `phone`, `role`, `is_active`, `is_verified`, `profile_picture`.
- **UserKYC**: stores KYC document info per user. Fields: `dl_number`, `aadhar_number`, image paths, `kyc_status` (not_submitted / under_review / approved / rejected), `rejection_reason`.

### `models/vehicle.py` — `Vehicle`, `VehicleImage`, `VehicleAvailabilityBlock`, `VehiclePricingRule`
- **Vehicle**: the core listing. Fields: `title`, `make`, `car_model`, `year`, `transmission`, `fuel_type`, `seats`, `price_per_day`, `price_per_hour`, `location_city`, `is_available`, `is_approved`, `auto_accept_bookings`, `total_units` (fleet count), `average_rating`, `total_trips`.
- **VehicleImage**: multiple images per vehicle, one marked `is_primary`.
- **VehicleAvailabilityBlock**: date ranges manually blocked by the manager.
- **VehiclePricingRule**: weekend discounts, long-trip discounts, peak surcharges.

### `models/vehicle_category.py` — `VehicleCategory`, `VehicleType`
- **VehicleCategory**: Hatchback, Sedan, SUV, Luxury, Electric, MUV/MPV, Convertible, Sport Bike, Cruiser, Scooter, Adventure, Tempo Traveller, Mini Bus.
- **VehicleType**: Car, Bike, Traveller — the top-level type grouping.

### `models/booking.py` — `Booking`, `BookingExtension`
- **Booking**: the central transaction record. Fields: `booking_ref`, `vehicle_id`, `customer_id`, `manager_id`, `status` (pending/confirmed/active/completed/cancelled/rejected), `pickup_datetime`, `return_datetime`, `pickup_location`, `drop_location`, `with_chauffeur`, `chauffeur_fee`, `total_amount`, `insurance_plan`, `refund_amount`, `refund_status`, `cancellation_reason`.
- **BookingExtension**: customer requests to extend an active trip.

### `models/payment.py` — `Payment`, `UserWallet`, `WalletTransaction`
- **Payment**: one payment record per booking. Tracks `payment_method`, `status` (created/paid), `simulated_transaction_id`.
- **UserWallet**: each user's wallet balance.
- **WalletTransaction**: every credit/debit to a wallet with description and balance snapshot.

### `models/coupon.py` — `Coupon`, `CouponUsage`
- **Coupon**: discount codes. Fields: `code`, `discount_type` (percent/flat), `discount_value` (max 5% for percent), `min_booking_amount`, `max_discount`, `valid_from`, `valid_until`, `usage_limit`.
- **CouponUsage**: tracks which user used which coupon on which booking.

### `models/manager.py` — `ManagerProfile`, `ManagerPayoutRequest`
- **ManagerProfile**: extended info for vehicle managers — bio, bank details, `acceptance_rate`, `average_vehicle_rating`, `is_super_manager`.
- **ManagerPayoutRequest**: payout requests from managers to withdraw earnings.

### `models/support.py` — `SupportTicket`
Support tickets raised by customers. Fields: `subject`, `description`, `status` (open/in_progress/resolved), `category`, `priority`.

### `models/inspection.py` — `VehicleInspection`
Post-trip inspection reports filed by managers. Fields: `condition` (good/minor_damage/major_damage/total_loss), `damage_notes`, `penalty_amount`.

---

## 5. Backend — Routers (API Endpoints)

### `routers/auth.py` — `/api/auth/*`
Handles all authentication:
- `POST /auth/register` — creates user, sends OTP email
- `POST /auth/verify-otp` — verifies 6-digit OTP, marks user as verified
- `POST /auth/login` — returns JWT access + refresh tokens
- `POST /auth/refresh` — exchanges refresh token for new access token
- `POST /auth/logout` — blacklists refresh token in Redis
- `GET /auth/me` — returns current user profile
- `PATCH /auth/change-password` — changes password (requires current password)
- `POST /auth/forgot-password` / `POST /auth/reset-password` — password reset flow

### `routers/users.py` — `/api/users/*`
- `GET /users/profile` — full profile with KYC status, wallet balance, trip stats
- `PATCH /users/profile` — update name and phone
- `POST /users/profile/avatar` — upload profile photo (resized to 400×400 WebP)
- `DELETE /users/profile/avatar` — remove profile photo
- `GET /users/{id}/public` — public profile (for manager cards)

### `routers/vehicles.py` — `/api/vehicles/*`
The largest router. Key endpoints:
- `GET /vehicles/` — search with 20+ filters (city, category, type, brand, price, dates, features, GPS distance)
- `GET /vehicles/{id}` — full vehicle detail with images, reviews, manager profile
- `POST /vehicles/` — manager creates a listing (goes to pending approval)
- `PATCH /vehicles/{id}` — manager edits listing
- `GET /vehicles/manager/my-vehicles` — manager's own listings with earnings
- `PATCH /vehicles/manager/{id}/toggle-availability` — toggle on/off
- `GET /vehicles/{id}/availability/check` — check if available for given dates
- `GET /vehicles/city-counts` — vehicle count per city (used on homepage)

### `routers/bookings.py` — `/api/bookings/*`
- `POST /bookings/` — create booking (validates availability, calculates price, creates payment record)
- `GET /bookings/` — list bookings for current user (auto-expires overdue pending bookings)
- `GET /bookings/{id}` — single booking detail
- `PATCH /bookings/{id}/accept` — manager accepts pending booking
- `PATCH /bookings/{id}/reject` — manager rejects with reason
- `POST /bookings/{id}/cancel` — customer cancels (free if >24h before pickup, 10% charge if <24h)
- `POST /bookings/{id}/manager-cancel` — manager cancels confirmed booking (customer gets 100% refund + fine)
- `PATCH /bookings/{id}/start-trip` — manager starts trip (records odometer)
- `PATCH /bookings/{id}/end-trip` — manager ends trip (calculates extra KM charges)
- `POST /bookings/{id}/extend` — customer requests extension
- `PATCH /extensions/{id}/respond` — manager approves/rejects extension

### `routers/payments.py` — `/api/payments/*`
- `GET /payments/wallet` — get wallet balance
- `POST /payments/wallet/add` — add money to wallet
- `POST /payments/wallet/pay-booking` — pay for booking using wallet balance
- `GET /payments/history` — transaction history

### `routers/reviews.py` — `/api/reviews/*`
- `POST /reviews` — submit a review (customer_to_vehicle, customer_to_manager, manager_to_customer)
- `GET /reviews/recent` — latest published reviews (public, used on homepage)
- `GET /reviews/car/{id}` — all reviews for a vehicle with rating breakdown
- `GET /reviews/booking/{id}` — reviews for a specific booking
- `POST /reviews/{id}/manager-reply` — manager replies to a review

### `routers/kyc.py` — `/api/kyc/*`
- `GET /kyc/status` — current KYC status for logged-in user
- `POST /kyc/submit` — submit KYC documents (DL + Aadhaar images)
- `POST /kyc/resubmit` — resubmit after rejection
- `POST /admin/kyc/{id}/approve` — admin approves KYC
- `POST /admin/kyc/{id}/reject` — admin rejects with reason

### `routers/notifications.py` — `/api/notifications/*`
- `GET /notifications` — paginated list with type filter
- `PATCH /notifications/{id}/read` — mark one as read
- `PATCH /notifications/mark-all-read` — mark all as read
- `DELETE /notifications/{id}` — delete one notification
- `DELETE /notifications/all` — delete all notifications for user

### `routers/coupons.py` — `/api/coupons/*`
- `GET /coupons` — list active coupons
- `POST /coupons/validate` — validate a coupon code for a booking amount
- `POST /coupons` (admin) — create coupon
- `PATCH /coupons/{id}` (admin) — edit coupon
- `DELETE /coupons/{id}` (admin) — delete coupon

### `routers/admin.py` — `/api/admin/*`
- `GET /admin/stats/overview` — dashboard stats (users, vehicles, bookings, revenue)
- `GET /admin/users` — list customers with filters
- `GET /admin/vehicle-managers` — list managers
- `PATCH /admin/users/{id}` — suspend/reactivate user
- `GET /admin/vehicles` — all vehicles with approval status
- `PATCH /admin/vehicles/{id}/approve` — approve vehicle listing
- `PATCH /admin/vehicles/{id}/reject` — reject with reason
- `GET /admin/analytics/*` — revenue charts, booking trends, city distribution

### `routers/manager.py` — `/api/manager/*`
- `GET /manager/profile` — manager's own profile + stats
- `GET /manager/stats` — dashboard stats (active rentals, earnings, pending bookings)
- `PATCH /manager/profile` — update bio, bank details

### `routers/support.py` — `/api/support/*`
- `POST /support/tickets` — customer raises a support ticket
- `GET /support/tickets` — list user's own tickets
- `GET /admin/support/tickets` — admin views all tickets
- `PATCH /admin/support/tickets/{id}` — admin updates status, adds reply

---

## 6. Backend — Services

### `services/availability.py` — `AvailabilityService`
The availability engine. Key method: `check_vehicle_available()` — counts active bookings (pending/confirmed/active) overlapping the requested date range and compares against `vehicle.total_units`. If `active_count >= total_units`, the vehicle is unavailable. Also checks manually blocked date ranges.

### `services/pricing.py` — `calculate_booking_price()`
Calculates the full price breakdown for a booking:
- Base amount = `price_per_day × days`
- Applies pricing rules (weekend discount, long-trip discount, peak surcharge)
- Adds insurance amount (5%/8%/12% of base for basic/standard/platinum)
- Applies coupon discount (capped at `max_discount`)
- Adds chauffeur fee (₹800/day if selected)
- Adds security deposit
- Calculates platform fee (10%) and manager earnings (90%)

### `services/booking_flow.py`
Helper functions used across booking endpoints:
- `mark_payment_paid()` — marks payment as paid, credits manager wallet, sends confirmation emails
- `sync_vehicle_availability()` — after any booking status change, recalculates `is_available` based on active booking count vs `total_units`
- `get_or_create_wallet()` — ensures a wallet exists for a user
- `add_wallet_transaction()` — records a wallet debit/credit

### `services/super_manager.py`
After each trip completion, checks if the manager qualifies as a "Super Manager" (≥50 trips, ≥4.5 rating, ≥90% acceptance rate, ≤2 cancellations in 90 days). Updates `is_super_manager` flag.

---

## 7. Backend — Middleware

### `middleware/auth_middleware.py` — `OptionalAuthMiddleware`
Runs on every request. If an `Authorization: Bearer <token>` header is present, decodes the JWT and attaches the user ID to the request state. Does not block unauthenticated requests — that's handled by route dependencies.

### `middleware/error_handler.py`
Registers global exception handlers for `RequestValidationError` (422), `HTTPException`, and unhandled `Exception`. Returns consistent JSON error shapes.

### `middleware/rate_limiter.py` — `rate_limit()`
A FastAPI dependency factory. Uses Redis to count requests per user/IP per time window. Used on booking creation (5 per minute) and vehicle search (60 per minute).

---

## 8. Backend — Tasks (Celery)

### `tasks/email_tasks.py`
Celery tasks for sending emails asynchronously:
- `send_booking_confirmation_email` — sent to customer and manager on booking
- `send_booking_cancelled_email` — sent on cancellation
- `send_kyc_approved_email` / `send_kyc_rejected_email` — KYC status updates
- `send_kyc_submission_confirmation` — acknowledgement on KYC submit

### `tasks/maintenance_tasks.py`
- `send_review_request_task` — sent 2 hours after trip completion asking customer to review
- `send_trip_reminder_task` — sent 2 hours before pickup

---

## 9. Frontend — Entry & Config

### `src/main.jsx`
React DOM entry point. Wraps the app in `QueryClientProvider` (TanStack Query), `HelmetProvider` (SEO meta tags), and `ErrorBoundary`.

### `src/App.jsx`
The root router. Defines all routes grouped by role:
- Public routes: `/`, `/vehicles`, `/vehicles/:id`, `/cities/:city`, `/contact`, static pages
- `LoggedOutRoute`: `/auth/login`, `/auth/register`, etc. (redirects logged-in users away)
- `PrivateRoute`: any logged-in user — `/dashboard/*`, `/booking/*`
- `CustomerRoute`: `/customer/*` — only role=customer
- `VehicleManagerRoute`: `/manager/*` — only role=vehicle_manager
- `AdminRoute`: `/admin/*` — only role=admin

### `vite.config.js`
Vite dev server config. Proxies `/api` and `/uploads` to `http://localhost:8000` so the frontend can call the backend without CORS issues during development.

### `src/services/api.js`
The Axios instance. Base URL is `/api` (proxied by Vite). Has a response interceptor that:
- Passes successful responses through unchanged
- On 401 errors, attempts token refresh using the stored refresh token
- If refresh fails, logs the user out and redirects to `/auth/login`

---

## 10. Frontend — Auth & State

### `src/context/AuthContext.jsx`
The authentication brain. Uses Zustand for global state. On app mount:
1. Reads tokens from `localStorage`
2. Calls `GET /auth/me` to rehydrate the user object
3. On 401, tries refresh token before clearing state
4. On network errors (backend down), keeps tokens intact — does not log out
5. Sets up proactive token refresh 5 minutes before expiry

### `src/components/RouteGuards.jsx`
Four guard components:
- `PrivateRoute` — any logged-in user; blocks booking-flow pages for non-customers
- `CustomerRoute` — role=customer only
- `VehicleManagerRoute` — role=vehicle_manager only
- `AdminRoute` — role=admin only
- `LoggedOutRoute` — redirects logged-in users to their dashboard

All guards show a spinner while `isLoading=true` (during rehydration) to prevent flash of protected content.

---

## 11. Frontend — Pages by Role

### Public Pages
- **`HomePage.jsx`** — landing page with hero search, vehicle type tabs (Cars/Bikes/Travellers), category grid, featured vehicles, city explorer, earnings calculator, live reviews scroll, FAQ, footer
- **`VehicleListingPage.jsx`** — search results with 20+ filters, grid/list/map views, pagination, vehicle type tab bar
- **`VehicleDetailPage.jsx`** — full vehicle detail with gallery, booking widget, availability calendar, reviews, manager info, similar vehicles

### Auth Pages (`pages/auth/`)
- **`LoginPage.jsx`** — email/password login
- **`RegisterPage.jsx`** — registration with role selection
- **`VerifyOtpPage.jsx`** — 6-digit OTP verification
- **`ForgotPasswordPage.jsx`** / **`ResetPasswordPage.jsx`** — password reset flow

### Customer Pages (`pages/user/`, `pages/booking/`)
- **`DashboardPage.jsx`** — overview with active bookings, upcoming trips, wallet balance, wishlist count, notifications
- **`MyBookingsPage.jsx`** — bookings with tabs: Upcoming / Active / History / Cancelled; cancellation modal with policy display
- **`BookingDetailsPage.jsx`** — full booking detail with QR code, payment info, inspection report, trip reviews, action buttons
- **`PaymentPage.jsx`** — payment with Card / UPI / Net Banking / Wallet methods; simulated processing
- **`KYCPage.jsx`** — KYC submission form with DL + Aadhaar upload; shows status (not submitted / under review / approved / rejected)
- **`ProfilePage.jsx`** — profile card with avatar (upload/change/remove via camera button dropdown), personal info edit, password change, notification preferences, danger zone (delete account)
- **`WalletPage.jsx`** — wallet balance, add money, transaction history
- **`ReviewsPage.jsx`** — reviews given and received
- **`NotificationsPage.jsx`** — notifications with type filters, mark read, delete individual, clear all
- **`WishlistPage.jsx`** — saved vehicles (synced to backend for logged-in users, localStorage for guests)

### Vehicle Manager Pages (`pages/manager/`)
- **`ManagerDashboardPage.jsx`** — stats, monthly booking chart, trips per vehicle pie chart, super manager badge
- **`ManagerVehiclesPage.jsx`** — vehicle listings with status, earnings, pending bookings count
- **`AddVehiclePage.jsx`** — 7-step wizard: Basic Info (with vehicle type selector — Car/Bike/Traveller, filtered categories, adaptive seat/fuel options) → Features → Location (map picker) → Pricing → Photos → Documents → Review
- **`ManagerBookingsPage.jsx`** — booking management with accept/reject/start-trip/end-trip actions
- **`ManagerEarningsPage.jsx`** — earnings breakdown with monthly chart
- **`PayoutsPage.jsx`** — payout request management

### Admin Pages (`pages/admin/`)
- **`AdminDashboardPage.jsx`** — platform overview: users, vehicles, bookings, revenue, charts
- **`AdminUsersPage.jsx`** — unified users page with Customers / Vehicle Managers tab switcher; suspend/reactivate actions
- **`AdminVehiclesPage.jsx`** / **`AdminManageVehiclesPage.jsx`** — vehicle approval workflow
- **`AdminKYCPage.jsx`** — KYC review queue with approve/reject
- **`AdminSupportPage.jsx`** — support ticket management
- **`AdminCouponsPage.jsx`** — coupon CRUD (max 5% discount enforced)
- **`AdminDataPages.jsx`** — bookings, payments, payouts data tables

---

## 12. Frontend — Shared Components

### `components/layout/Sidebar.jsx`
Role-aware navigation sidebar. Shows different links for admin, vehicle_manager, customer. The user card at the top is clickable and navigates to the profile page. No dropdowns — all links are flat.

### `components/layout/Navbar.jsx`
Public-facing top navigation. Sticky on vehicle listing/detail pages. Shows login/register for guests, dashboard link for logged-in users.

### `components/layout/NotificationBell.jsx`
Bell icon in the dashboard header. Shows unread count badge. Clicking opens a dropdown with recent notifications.

### `components/vehicle/VehicleCard.jsx`
Reusable vehicle card used in search results, homepage, wishlist. Shows image, title, price, rating, city, features. "Rent Now" navigates to the vehicle detail page.

### `components/search/FilterSidebar.jsx`
Left sidebar on the vehicle listing page. Contains all search filters: price range slider, categories, vehicle types, brands, transmission, fuel type, seats, features, rating.

### `components/search/SearchBar.jsx`
The main search bar (city dropdown, pickup/return datetime pickers, search button). Used on homepage hero and as a compact sticky bar on the listing page.

### `components/reviews/ReviewCard.jsx`
Displays a single review with reviewer avatar, star rating, title, body (collapsible), and manager reply.

### `components/common/Pagination.jsx`
Reusable pagination component with items-per-page selector.

---

## 13. Database Schema Summary

### MySQL Tables (via SQLAlchemy + Alembic)
| Table | Purpose |
|---|---|
| `users` | All users (admin, manager, customer) |
| `user_kyc` | KYC documents and status |
| `vehicles` | Vehicle listings |
| `vehicle_categories` | Hatchback, SUV, Sport Bike, etc. |
| `vehicle_types` | Car, Bike, Traveller |
| `car_images` | Vehicle photos |
| `car_availability_blocks` | Manually blocked date ranges |
| `car_pricing_rules` | Discount/surcharge rules |
| `bookings` | All booking transactions |
| `booking_extensions` | Trip extension requests |
| `payments` | Payment records per booking |
| `user_wallet` | Wallet balances |
| `wallet_transactions` | Wallet credit/debit history |
| `coupons` | Discount codes |
| `coupon_usages` | Which user used which coupon |
| `manager_profiles` | Manager bio, bank, ratings |
| `manager_payout_requests` | Payout requests |
| `support_tickets` | Customer support tickets |
| `vehicle_inspections` | Post-trip inspection reports |
| `wishlists` | Saved vehicles per user |

### MongoDB Collections
| Collection | Purpose |
|---|---|
| `reviews` | Vehicle and manager reviews |
| `notifications` | In-app notifications |
| `sessions` | Refresh token sessions |
| `analytics` | Activity logs for admin charts |
| `support_messages` | Support ticket message threads |

---

## 14. Key Business Logic

### Booking Flow
1. Customer selects dates on vehicle detail page
2. `AvailabilityService` checks: `active_bookings < total_units` AND no manual blocks
3. `calculate_booking_price()` computes full breakdown
4. Booking created with `status=confirmed` (if `auto_accept_bookings=True`) or `status=pending`
5. Payment record created with `status=created`
6. Customer goes to `/booking/pay/:id` and pays via Card/UPI/Net Banking/Wallet
7. On payment: `mark_payment_paid()` runs, `sync_vehicle_availability()` updates `is_available`
8. Manager starts trip → `status=active`; ends trip → `status=completed`

### Cancellation Policy
- Customer cancels ≥24h before pickup → full refund to wallet
- Customer cancels <24h before pickup → 10% charge, 90% refund
- Manager cancels confirmed booking → customer gets 100% refund + fine: `max(₹500, 10% of booking)`
- Pending booking expires (pickup passed, manager never accepted) → auto-cancelled, full refund + fine if booking was made ≥24h in advance

### Fleet Count (`total_units`)
Each vehicle has a `total_units` field (default 1). Availability is checked by counting active bookings for that vehicle. If `active_count >= total_units`, the vehicle shows as unavailable. When a booking is cancelled or completed, `sync_vehicle_availability()` recalculates and may restore availability.

### KYC Gate
Customers must have `kyc_status=approved` to create bookings. The `require_kyc_user` dependency on `POST /bookings/` enforces this.

### Token Security
- Access tokens expire in 60 minutes
- Refresh tokens expire in 30 days
- On logout, refresh token is blacklisted in Redis
- The frontend proactively refreshes the access token 5 minutes before expiry
