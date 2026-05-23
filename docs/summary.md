# Zoomcar Clone Phase Summary

## Phase 1 - Project Scaffolding & Docker Infrastructure

Created the Docker-based project scaffold for the Zoomcar clone.

Implemented:
- Root `docker-compose.yml` with MySQL 8, MongoDB 7, Redis 7, FastAPI backend, Celery worker, and Nginx on `zoomcar-net`.
- Backend scaffold under `backend/` with Dockerfile, requirements, entrypoint, FastAPI app, Alembic setup, Celery app, uploads folders, and a minimal seed script.
- Frontend scaffold under `frontend/` with Vite, React 18, Tailwind, required dependencies, Dockerfile, and starter UI.
- Nginx scaffold under `nginx/` that serves a placeholder frontend and proxies `/api/` to the backend.
- `.env.example` and working `.env` with MySQL, MongoDB, Redis, auth, email, upload, and simulated payment settings.

Verification:
- `docker compose config --quiet` passes.
- `docker compose up --build -d` builds and starts the stack.
- `http://localhost` serves the scaffold page.
- `http://localhost/api/health` returns a healthy backend response.

Notes:
- MySQL, MongoDB, and backend are exposed internally only to avoid local host port conflicts on `3306` and `8000`.
- Nginx remains the public entry point on `http://localhost`.

## Phase 2 - Dual Database Connection Layer

Set up the database connection layer for MySQL and MongoDB.

Implemented:
- `backend/app/database.py` with SQLAlchemy async engine, `AsyncSessionLocal`, `async_session_maker`, declarative `Base`, `get_db`, and `init_db`.
- `backend/app/mongodb.py` with Motor async client lifecycle, MongoDB connection verification, database accessor, disconnect handling, and startup index creation.
- `backend/app/config.py` with Pydantic settings for MySQL, MongoDB, Redis, auth, SMTP, app URLs, uploads, and simulated payments.
- `backend/app/main.py` with FastAPI lifespan startup that initializes MySQL and MongoDB, CORS, uploads mount, API metadata, health route, and router registration.
- Placeholder router modules under `backend/app/routers/` for auth, users, cars, bookings, payments, reviews, notifications, support, wishlist, host earnings, admin, and KYC.

Verification:
- `python3 -m compileall backend/app` passes.
- `docker compose config --quiet` passes.
- `docker compose up --build -d` starts successfully.
- Backend startup completes MySQL wait, MongoDB wait, Alembic migration check, seed check, and FastAPI startup.
- `http://localhost/api/health` returns `{"status":"ok","service":"zoomcar-backend"}`.

## Phase 3 - MySQL ORM Models & Alembic Schema

Created the complete SQLAlchemy ORM schema for the MySQL side of the Zoomcar clone.

Implemented:
- `backend/app/models/base.py` with `TimestampMixin` and UUID generation helper.
- `backend/app/models/user.py` with `User`, `UserKYC`, `EmailVerification`, and `PasswordReset`.
- `backend/app/models/car.py` with `Car`, `CarImage`, `CarAvailabilityBlock`, and `CarPricingRule`.
- `backend/app/models/booking.py` with `Booking` and `BookingExtension`.
- `backend/app/models/payment.py` with `Payment`, `UserWallet`, and `WalletTransaction`.
- `backend/app/models/coupon.py` with `Coupon` and `CouponUsage`.
- `backend/app/models/host.py` with `HostProfile` and `HostPayoutRequest`.
- `backend/app/models/support.py` with `SupportTicket`.
- `backend/app/models/__init__.py` imports all models so Alembic can discover metadata.
- Alembic revision `444784d636fa_initial_schema.py` generated with autogenerate and applied on Docker startup.

Schema coverage:
- All UUID primary keys use `String(36)`.
- Money fields use `DECIMAL` with appropriate precision.
- Enum fields use SQLAlchemy `Enum` with explicit values.
- Long free-text fields use `Text`.
- Boolean fields use SQLAlchemy `Boolean`, which maps correctly for MySQL.

Verification:
- `python3 -m compileall backend/app/models` passes.
- `docker compose up --build -d` applies migration `0001_initial_schema -> 444784d636fa`.
- `alembic check` reports `No new upgrade operations detected`.
- MySQL contains all expected Phase 3 tables.
- `http://localhost/api/health` remains healthy after migration.

## Phase 4 - MongoDB Document Models & Service Functions

Created the MongoDB document model layer for high-write, document-oriented collections.

Implemented:
- `backend/app/mongo_models/notification.py` with `NotificationDoc` and helpers for create, list, unread count, mark read, mark all read, and delete.
- `backend/app/mongo_models/review.py` with `ReviewDoc` and helpers for create, car review stats, user reviews, host replies, booking reviews, and average rating aggregation.
- `backend/app/mongo_models/support_message.py` with `SupportMessageDoc` and ticket message thread helpers.
- `backend/app/mongo_models/analytics.py` with car view logging/counts, search logs, admin activity feed, and city search trend aggregation.
- `backend/app/mongo_models/session.py` with login session creation and recent session lookup.
- `backend/app/mongo_models/__init__.py` exports the Phase 4 document models and service functions.
- Updated MongoDB review indexes to enforce uniqueness on `(booking_id, review_type)` instead of `booking_id` alone.

Verification:
- `python3 -m compileall backend/app` passes.
- Backend Docker image rebuild passes.
- Import check inside the backend image passes for the new mongo model exports.

## Phase 5 - Email-Only Authentication System

Built the complete email/password authentication foundation across FastAPI, Redis, Celery email tasks, and React auth pages.

Implemented:
- `backend/app/utils/auth.py` with bcrypt password hashing, strength validation, JWT access/refresh token creation, Redis blacklist checks, force-logout support, and reusable auth/role/KYC dependencies.
- `backend/app/utils/email.py` with async HTML email templates for verification, password reset, booking, KYC, reminder, review, and payout emails using Zoomcar red branding.
- `backend/app/tasks/email_tasks.py` and Celery task imports for background email delivery.
- `backend/app/redis.py` for shared async Redis access and FastAPI shutdown cleanup.
- `backend/app/routers/auth.py` with register, verify email, resend verification, login, refresh, logout, forgot password, reset password, me, and change password endpoints.
- Frontend auth shell with `AuthContext`/Zustand storage, Axios auth/refresh interceptors, route guards, and auth pages for login, registration, forgot password, reset password, and email verification.

Security coverage:
- Password policy requires 8+ characters, one uppercase letter, one digit, and one special character from `!@#$%^&*`.
- JWT payloads include `sub`, `email`, `role`, `jti`, `iat`, and `exp`.
- Logout blacklists the current token JTI until expiration.
- Password resets set a per-user force-logout timestamp so older tokens are rejected.
- Resend verification and forgot password endpoints use Redis rate limits.

## Phase 6 - Car Listing & Management System

Built the host-side car listing and management system across FastAPI, SQLAlchemy, MongoDB analytics, Redis view counters, image processing, and React host pages.

Implemented:
- `backend/app/routers/cars.py` with public search/listing, featured cars, city cars, car detail, host car creation, edit, soft delete, image upload/delete/primary/reorder, date blocks, monthly availability, pricing rules, host car stats, and availability toggling.
- Search supports city, category, transmission, fuel type, seats, price range, date overlap exclusion, feature filters, location radius filtering with Haversine distance, recommended sorting, pagination, and MongoDB search logging.
- Car detail responses include images, host profile, pricing rules, 90-day availability blocks, MongoDB review summaries, MongoDB view logging, and Redis `car_views:{car_id}` increments.
- Host listing creation enforces verified KYC and host access, creates host profiles when missing, increments listing counts, notifies admins, and logs activity.
- `backend/app/services/pricing.py` with booking price calculation for hourly/daily rates, pricing-rule discounts/surcharges, insurance plans, coupon discounts, platform fees, security deposit display, and host earnings.
- `frontend/src/pages/host/ListCarPage.jsx` with a six-step persisted Zustand listing wizard covering basic info, features, location map, pricing, photos, and review/submit.
- `frontend/src/pages/host/ManageCarsPage.jsx` with host stats, filter tabs, car rows, availability toggle, edit, bookings, and delete actions.
- `frontend/src/pages/host/EditCarPage.jsx` with prefilled car editing plus date block and pricing rule management.

Verification:
- `python3 -m compileall backend/app` passes.
- Backend Docker image rebuild passes.
- Docker import check confirms the car router and pricing service load.
- `docker build -f frontend/Dockerfile frontend` passes with the expected large-chunk warning from the host wizard and Leaflet map bundle.

## Phase 7 - Car Search, Discovery, Detail, and Wishlist Experience

Built the guest-facing car discovery experience across React and FastAPI.

Implemented:
- `frontend/src/components/search/SearchBar.jsx` reusable home/search search bar with 50-city combobox, top-city chips, pickup/return date-time pickers, duration preview, URL prefill, and `/search` query-string navigation.
- `frontend/src/components/search/FilterSidebar.jsx` with price slider and histogram, category cards, transmission radios, fuel/seats/features/rating filters, mobile sort, active filter count, clear/apply actions, and mobile bottom-sheet support.
- `frontend/src/components/car/CarCard.jsx` with grid/list variants, lazy image treatment, wishlist heart, category badges, feature metadata, rating/new-trip display, price, location, hover lift, and local/backend wishlist sync.
- `frontend/src/pages/SearchPage.jsx` with desktop sidebar, mobile filter drawer, grid/list/map view toggles, result counts, infinite scroll, skeleton loading, empty state, Leaflet map markers, selected-car panel, and debounced map-bound search.
- `frontend/src/pages/CarDetailPage.jsx` with sticky scroll header, hero gallery/lightbox, car header, desktop/mobile booking widget, insurance/coupon/price breakdown, feature grid, expandable description, custom availability calendar, host profile, reviews, fuzzy pickup map, and similar cars.
- `frontend/src/pages/WishlistPage.jsx` with saved-car grid, localStorage fallback for logged-out users, backend sync for logged-in users, empty state, and fade-out removal.
- Backend wishlist support with `Wishlist` SQLAlchemy model, Alembic migration, and protected `GET /api/wishlist`, `POST /api/wishlist`, and `DELETE /api/wishlist/{car_id}` endpoints.
- Backend review listing via `GET /api/reviews/car/{car_id}` with rating filters and pagination.
- Search API extensions for multi-select categories/fuel types, minimum rating, host filtering, exclusion for similar cars, newest sorting, and richer result payloads for list cards.

Verification:
- `python3 -m compileall backend/app` passes.
- `npm install` completed successfully with 0 vulnerabilities.
- `npm run build` passes with the expected large chunk warning from map/gallery bundles.
- Vite dev server runs at `http://localhost:5175/` in this environment because ports 5173 and 5174 were already in use.
- `curl -I http://localhost:5175/` returns HTTP 200 from the running frontend server.

## Phase 8 - Complete Simulated Booking, Payment, Wallet, and Host Trip Flow

Built the end-to-end booking lifecycle with simulated payments only; no Razorpay or external payment gateway calls are used.

Implemented:
- `backend/app/routers/bookings.py` with booking preview, booking creation, simulated payment completion, host accept/reject, guest/host cancellation with refund policy, start trip, end trip, booking list/detail, extension request, and extension response endpoints.
- `backend/app/routers/payments.py` with wallet balance/history, simulated wallet top-up, wallet booking payment, and booking payment lookup endpoints.
- `backend/app/services/booking_flow.py` shared helpers for simulated transaction IDs, wallet creation, wallet transaction records, payment completion, notifications, and booking confirmation email dispatch.
- Coupon validation for preview/create without consuming coupons during preview, then `CouponUsage` creation and `used_count` increment during booking creation.
- Booking validation for approval/availability, conflicting bookings, host availability blocks, pickup lead time, minimum duration, max trip days, guest overlap, and coupon applicability.
- Simulated accounting for wallet debits, instant wallet refunds, security deposit release, host earning credit, host pending earning records, and payment records with `SIM_TXN_*` transaction IDs.
- `frontend/src/pages/booking/BookingConfirmPage.jsx` with car/trip summary, insurance selection, coupon apply states, previewed price breakdown, guest notes, KYC warning, and cancellation policy.
- `frontend/src/pages/booking/PaymentPage.jsx` with simulated card/UPI/net banking UI, wallet payment with balance/deficit handling, add-money modal, Radix confirmation dialog, processing state, success state, and simulated payment API calls.
- `frontend/src/pages/booking/BookingSuccessPage.jsx` with animated success state, booking reference copy, trip summary, and navigation CTAs.
- `frontend/src/pages/booking/BookingDetailsPage.jsx` with status timeline, booking/payment cards, SVG QR code generation via `qrcode`, contextual actions, cancellation dialog, and print-ready invoice generation.
- `frontend/src/pages/booking/MyBookingsPage.jsx` with guest booking tabs, date/status filters, cards, cancellation, empty states, and detail navigation.
- `frontend/src/pages/host/BookingRequestsPage.jsx` and `frontend/src/pages/host/ActiveTripsPage.jsx` with pending request management, reject modal, accept/start/end trip actions, host earnings display, active-trip end modal, and host booking tabs.
- Router wiring for `/booking/confirm/:carId`, `/booking/pay/:bookingId`, `/booking/success`, `/dashboard/bookings`, `/dashboard/bookings/:bookingId`, `/host/bookings`, and `/host/active-trips`.
- Car detail booking CTA now routes into booking confirmation with selected dates and insurance.

Verification:
- `python3 -m compileall backend/app` passes.
- `npm install qrcode` completed successfully with 0 vulnerabilities.
- `npm run build` passes with the expected large chunk warning from maps/gallery/QR and dashboard bundles.

## Phase 9 - User Dashboard, Profile, KYC, Wallet, and Notifications

Built the complete user-facing dashboard foundation across FastAPI, MongoDB notifications, file uploads, and React dashboard pages.

Implemented:
- `backend/app/routers/users.py` with protected profile summary, profile update, avatar upload/processing, and public user profile endpoints.
- `backend/app/routers/kyc.py` with protected KYC status, submit, resubmit, file validation/compression, admin listing, approve, and reject endpoints.
- Admin KYC approval/rejection updates user verification, sends email tasks, creates MongoDB notifications, and logs activity.
- `backend/app/routers/notifications.py` with notification listing, read, and mark-all-read endpoints.
- `backend/app/routers/payments.py` wallet history filters and pagination for dashboard wallet transaction views.
- KYC submission confirmation email support in `backend/app/utils/email.py` and `backend/app/tasks/email_tasks.py`.
- `frontend/src/pages/user/DashboardShell.jsx` shared desktop sidebar and mobile bottom nav.
- `frontend/src/pages/user/DashboardPage.jsx` overview with profile stats, KYC banner, upcoming trips, recent notifications, and quick actions.
- `frontend/src/pages/user/ProfilePage.jsx` profile photo upload, personal info editing, password change UI, notification preference controls, and delete-account confirmation modal.
- `frontend/src/pages/user/KYCPage.jsx` full KYC state machine for not submitted, under review, approved, and rejected/resubmit flows with drag/drop upload previews.
- `frontend/src/pages/user/WalletPage.jsx` wallet balance, simulated top-up modal, transaction filters, date range filtering, and CSV export.
- `frontend/src/pages/user/NotificationsPage.jsx` full notification inbox with filters, mark-all-read, read-on-click, and infinite scroll.
- Router wiring for `/dashboard`, `/dashboard/kyc`, `/dashboard/wallet`, `/dashboard/notifications`, `/dashboard/profile`, and dashboard-shell integration for My Bookings.
- Vite local proxy for `/api` and `/uploads` so dashboard pages work through the dev server.

Verification:
- `python3 -m compileall backend/app` passes.
- `npm run build` passes with the expected large chunk warning.
- Vite dev server runs at `http://localhost:5175/` in this environment because ports 5173 and 5174 were already in use.
- `curl http://localhost:5175/api/health` returns `{"status":"ok","service":"zoomcar-backend"}` through the Vite proxy.

## Phase 10 - Reviews, Notifications Routing, Support, and Celery Maintenance

Built the MongoDB-backed reviews system, completed notification route parity, added customer support tickets/chat, and wired scheduled Celery maintenance tasks.

Implemented:
- `backend/app/routers/reviews.py` with protected review creation, role/window/duplicate validations, car/host/guest review types, host replies, car review aggregation, user review listing, my-given reviews, and booking review lookup.
- Review creation stores reviewer, car, and trip snapshots in MongoDB, updates MySQL car/host ratings, creates review notifications, and logs activity.
- `backend/app/routers/notifications.py` now supports paginated filtering, unread-count with Redis 30-second cache, PATCH read/mark-all-read routes, delete, and legacy POST aliases for existing UI calls.
- `backend/app/routers/support.py` with authenticated or anonymous ticket creation, user/admin ticket listing, ticket detail with MongoDB messages, replies with optional attachments, close-ticket flow, and anonymous contact requests.
- `backend/app/models/support.py` and Alembic revision `9c8b7a6d5e4f_extend_support_tickets.py` add anonymous contact fields, nullable `user_id`, and optional assigned admin support.
- `backend/app/mongo_models/review.py` returns `has_more` for review pagination; `support_message.py` supports system messages.
- `backend/app/tasks/maintenance_tasks.py` adds generic email routing, review request scheduling, pending booking auto-cancel, daily superhost refresh, and trip reminder tasks.
- `backend/app/celery_app.py` imports maintenance tasks and configures Celery beat for 30-minute booking auto-cancel and daily 2am superhost status updates.
- Booking completion now queues the review-request task, and payment confirmation queues trip reminders two hours before pickup.
- `frontend/src/pages/booking/WriteReviewPage.jsx` adds interactive star-review submission for car, host, or guest review flows.
- `frontend/src/components/reviews/ReviewCard.jsx` renders verified-trip review cards with stars, expandable body text, and host replies.
- `frontend/src/pages/user/ReviewsPage.jsx` adds dashboard tabs for reviews given and received.
- `frontend/src/pages/user/SupportPage.jsx` adds dashboard support ticket list, filters, new-ticket modal, chat thread, attachments, replies, and close-ticket action.
- `frontend/src/components/layout/NotificationBell.jsx` adds polling unread badge, dropdown notifications, mark-all-read, read-on-click navigation, and toast alerts for new notifications.

Verification:
- `python3 -m compileall backend/app` passes.
- `python3 -m compileall backend/alembic` passes.
- `docker compose exec backend alembic upgrade head` applies the support-ticket migration.
- `docker compose exec backend python -m compileall app` passes inside the backend container.
- `npm run build` passes with the expected large chunk warning.

## Phase 11 - Complete Admin Dashboard

Built the admin operations dashboard as a separate React layout and added the protected FastAPI admin API surface.

Implemented:
- `backend/app/routers/admin.py` with role-protected `/api/admin/*` routes for overview stats, revenue/city/top-car analytics, activity feed, users, cars, bookings, KYC, payments/refunds, support, coupons, and host payouts.
- Admin stats aggregate users, hosts, cars, bookings, revenue, pending queues, booking status distribution, daily bookings, monthly revenue, user growth, category distribution, and booking funnel data.
- Admin actions for user suspension/role change, car approval/rejection/feature toggles, KYC approval/rejection, manual wallet refunds, support replies/status/priority, coupon CRUD, and payout process/complete/fail workflows.
- MongoDB notifications and activity-feed logging for major admin actions, with Redis caching for active-booking counts.
- `frontend/src/pages/admin/` with a standalone admin layout, dark collapsible sidebar, red accents, admin header, and routes under `/admin/*`.
- Admin pages for dashboard, users, cars, KYC review, analytics with Recharts and PNG export, coupons, support split view, bookings, payments, payouts, and settings.
- `html2canvas` added for chart export.

Verification:
- `python3 -m compileall backend/app` passes.
- Backend Docker image builds successfully.
- Docker import check confirms the admin router registers 35 routes.
- `npm run build` passes with the expected large chunk warning.

## Phase 12 - Host Earnings, Payouts, and Superhost System

Built the host finance and reputation workflow across FastAPI, wallet accounting, payout requests, superhost criteria, and React host pages.

Implemented:
- `backend/app/routers/host_earnings.py` with host-only `/api/host/*` routes for earnings summary, monthly earnings, per-car earnings, credit transactions, payout requests/history, bank details, and host profile stats.
- Payout request validation for minimum ₹500, wallet balance, bank details, duplicate pending/processing payouts, immediate wallet hold, payout request creation, and admin notification.
- Bank account update flow with IFSC validation and masked account summary responses.
- `backend/app/services/superhost.py` with criteria-based superhost evaluation: 10+ completed trips, 4.7+ host rating, 85%+ acceptance rate, and no host-initiated cancellation in the last 90 days.
- Booking completion now refreshes superhost status, and scheduled maintenance reuses the shared superhost service.
- `frontend/src/pages/host/HostLayout.jsx` adds a host-specific sidebar shell.
- `HostDashboardPage.jsx` adds animated summary counters, superhost banner, earnings/trips charts, active listings, recent bookings, and quick actions.
- `HostEarningsPage.jsx` adds summary cards, per-car earnings table, monthly stacked area chart, transaction history filters, and CSV export.
- `PayoutsPage.jsx` adds wallet balance, bank account side panel, payout request confirmation, and payout history with status badges.
- `HostProfilePage.jsx` adds host stats, superhost badge, bio/response-time editing, notification preferences, and verification status.
- React host routes are now nested under `/host/*` with the new host console layout.

Verification:
- `python3 -m compileall backend/app` passes.
- Backend Docker image builds successfully.
- Docker import check confirms the host earnings router registers 9 routes and the superhost service imports.
- `npm run build` passes with the expected large chunk warning.

## Phase 13 - Homepage, Navbar, Static Pages, and Lazy Routing

Built the public marketing and informational layer for the Zoomcar clone.

Implemented:
- `frontend/src/components/layout/Navbar.jsx` with sticky blur behavior, desktop navigation, logged-in avatar dropdown, wallet display, notification bell, login/register controls, and mobile slide-out drawer.
- `frontend/src/pages/HomePage.jsx` with full hero image, glass search widget, popular city chips, animated stats strip, guest/host how-it-works tabs, category browsing, featured cars, popular city photo cards, host earnings calculator, trust cards, Swiper testimonials, Radix FAQ, and app download banner.
- Google Fonts wired in `frontend/src/styles.css` for `Syne` display headings and `DM Sans` body copy, plus small CSS micro-animations.
- Static public pages for how it works, insurance, become a host, safety, about, contact, legal terms, privacy, refund policy, dynamic city pages, and 404.
- Shared static-page primitives in `frontend/src/pages/static/StaticShell.jsx` for consistent heroes, sections, flows, feature grids, FAQ blocks, CTA bands, and footer.
- Contact form posts to `/api/support/contact` and shows the required success state.
- Dynamic `/cities/:city` page fetches city cars and renders city-specific hero, area chips, travel tips, and route ideas.
- `frontend/src/App.jsx` now uses `React.lazy`, `Suspense`, and a page loader for all route components, with complete public, private, host, booking, and admin route coverage.
- Host route paths were aligned to `/host/cars`, `/host/cars/new`, and `/host/trips/active`, with compatibility redirects from older host URLs.

Verification:
- `npm run build` passes successfully with route-level chunks generated by lazy loading.
