# SigFleet Phase Summary

## Phase E - Availability Management Module

Implemented the PRD Availability Management module end to end.

- Added standalone `AvailabilityService` with vehicle availability checks, overlap detection, blocked-date checks, rental duration calculation, monthly availability calendars, next-available lookup, and unavailable-date generation.
- Added `/api/vehicles/{vehicle_id}/availability`, `/availability/check`, `/availability/next-available`, and `/unavailable-dates` routes, including 60-second Redis caching for monthly calendars.
- Strengthened booking creation and preview validation for date ranges, min/max duration, one-hour pickup buffer, vehicle availability, block conflicts, booking overlaps, extension conflicts, and same-customer overlapping rentals.
- Availability check responses now return server-side price breakdowns with duration labels, and booking payloads expose the same duration structure for frontend display.
- Added manager block/unblock support on `/api/vehicles/:id/block-dates`, with cache invalidation and manager/admin delete permissions.
- Updated vehicle detail and booking confirmation date pickers to disable unavailable dates, enforce minimum return time, run live availability checks, show inline errors/next-available hints, and use server price previews.
- Added manager-facing block-date management from the Availability Overview, Edit Vehicle page, and Vehicle card quick action.

Verification:
- `python3 -m py_compile backend/app/services/availability.py backend/app/routers/availability.py backend/app/routers/bookings.py backend/app/routers/cars.py backend/app/main.py` passes.
- `npm run build` from `frontend/` passes with the existing large-chunk warning.

## Phase D - Role-Separated Dashboard Experiences

Implemented the PRD role dashboard separation and final frontend Host-to-Vehicle-Manager rename.

- Reworked customer dashboard at `/customer/dashboard` into a white/red top-nav experience with KYC status, rental stats, active rental cards, upcoming rentals, and recent activity.
- Added dedicated customer rental history at `/customer/bookings/history` with filters, status badges, copyable booking refs, contextual actions, and pagination.
- Added dedicated customer tracking at `/customer/track/:bookingId` with booking header, animated status timeline, trip details, payment state, review CTA, and active-rental emergency contact.
- Renamed frontend manager files and components from Host/host naming to Manager/manager naming, including `ManagerLayout`, `ManagerDashboardPage`, `ManagerVehiclesPage`, `AddVehiclePage`, `EditVehiclePage`, `ManagerBookingsPage`, `ManagerStatisticsPage`, and `managerApi`.
- Added `frontend/src/components/layout/ManagerSidebar.jsx` and kept manager layout separate from customer and admin layouts with a dark-blue sidebar and teal active state.
- Added `/manager/*` route structure for dashboard, vehicles, add/edit, bookings, availability, statistics, profile, earnings, and payouts.
- Added admin sidebar items for Vehicle Categories and Vehicle Managers, admin manager routes, create-manager UI, user-management tabs, and the manager-specific table/actions.
- Added Admin Dashboard revenue statistics widget with all-time/monthly revenue, platform-fee vs manager-payout metrics, sparkline, and donut breakdown.
- Renamed shared vehicle card surface from `CarCard` to `VehicleCard` and updated route aliases for public `/vehicles`, `/categories/:categorySlug`, and `/vehicle-types/:typeSlug`.

Verification:
- `npm run build` from `frontend/` passes with the existing large-chunk warning.

## Phase C - Dynamic Vehicle Categories and Types

Implemented the PRD Admin-managed vehicle taxonomy.

- Added `vehicle_categories` and `vehicle_types` MySQL models with dynamic slugs, active flags, category display order, icons, and vehicle relationships.
- Replaced the hardcoded car category enum with nullable `category_id` and `vehicle_type_id` foreign keys, plus migration data for existing Hatchback/Sedan/SUV/etc. vehicles and default vehicle types.
- Added public cached APIs for `/api/categories`, `/api/categories/{category_id}`, and `/api/vehicle-types`.
- Added admin CRUD APIs for categories and vehicle types, category reorder support, deactivation guards, delete guards, and category reassignment on delete.
- Updated vehicle search to support `category_id`, `vehicle_type_id`, and `q` text search, with `/api/vehicles` as a search alias alongside existing `/api/cars`.
- Updated listing/search/detail/card/admin vehicle UIs to consume dynamic category/type labels and filters.
- Added React Query hooks for vehicle categories and vehicle types.
- Added `/admin/categories` with a two-panel category/type management UI, icon picker, active toggles, delete/reassign flow, and dnd-kit category reordering.

Verification:
- `python3 -m compileall backend/app` passes.
- `npm run build` from `frontend/` passes with the existing large-chunk style warning.

## Phase B - Vehicle Manager Account Lifecycle

Implemented the PRD Vehicle Manager lifecycle and manager dashboard surface.

- Added `manager_profiles` as the renamed manager profile model with assignment metadata, KPI fields, active state, and payout bank details, while preserving compatibility for existing host payout/booking code.
- Added Alembic migration for `host_profiles` → `manager_profiles` and the `cars.managerId` application-layer role comment.
- Added admin endpoints for creating, promoting, demoting, listing, viewing, suspending, and reactivating Vehicle Managers.
- Admin-created managers are verified, receive a wallet/profile, optional credential welcome email, notifications, and activity feed logs.
- Added `/api/manager/profile` and `/api/manager/stats` for Vehicle Manager profile editing and dashboard statistics.
- Added manager role update email tasks for welcome, promotion, demotion, and suspension/reactivation flows.
- Updated the manager frontend to use a dedicated dark-blue sidebar with PRD navigation, route aliases for `/manager/vehicles`, `/manager/vehicles/add`, `/manager/availability`, and `/manager/statistics`, plus dashboard stats from the new manager API.

Verification:
- `python3 -m compileall backend/app` passes.
- `npm run build` from `frontend/` passes.

## PRD Addendum Phase A - Role Architecture and SigFleet Rename

Implemented the PRD Phase A role overhaul and application rename.

- Renamed the application branding to SigFleet across backend metadata, emails, package metadata, and visible frontend copy.
- Replaced the user role enum with `customer`, `vehicle_manager`, and `admin`, with registration defaulting to `customer`.
- Added PRD auth dependencies for customer, vehicle manager, admin, and any authenticated user access.
- Moved car ownership to `managerId` with a compatibility `host_id` property for existing booking and payout code.
- Updated booking, vehicle, manager, and admin routes to use customer and vehicle manager permissions.
- Added frontend guard files for `CustomerRoute`, `VehicleManagerRoute`, `AdminRoute`, and `PrivateRoute`, plus an unauthorized page.
- Added `/customer/*` and `/manager/*` route surfaces, role-based login destinations, and role-aware navbar menus.
- Updated admin role controls and demo seed data for Customer and Vehicle Manager roles.

Verification:
- `python3 -m py_compile backend/app/models/user.py backend/app/models/car.py backend/app/utils/auth.py backend/app/routers/auth.py backend/app/routers/bookings.py backend/app/routers/cars.py backend/app/routers/host_earnings.py backend/app/routers/admin.py backend/app/seed.py backend/app/main.py`
- `npm run build` from `frontend/`

## Phase 1 - Project Scaffolding & Docker Infrastructure

Created the Docker-based project scaffold for the SigFleet clone.

Implemented:
- Root `docker-compose.yml` with MySQL 8, MongoDB 7, Redis 7, FastAPI backend, Celery worker, and Nginx on `sigfleet-net`.
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
- MySQL, MongoDB, and backend are exposed internally only to avoid local manager port conflicts on `3306` and `8000`.
- Nginx remains the public entry point on `http://localhost`.

## Phase 2 - Dual Database Connection Layer

Set up the database connection layer for MySQL and MongoDB.

Implemented:
- `backend/app/database.py` with SQLAlchemy async engine, `AsyncSessionLocal`, `async_session_maker`, declarative `Base`, `get_db`, and `init_db`.
- `backend/app/mongodb.py` with Motor async client lifecycle, MongoDB connection verification, database accessor, disconnect handling, and startup index creation.
- `backend/app/config.py` with Pydantic settings for MySQL, MongoDB, Redis, auth, SMTP, app URLs, uploads, and simulated payments.
- `backend/app/main.py` with FastAPI lifespan startup that initializes MySQL and MongoDB, CORS, uploads mount, API metadata, health route, and router registration.
- Placeholder router modules under `backend/app/routers/` for auth, users, cars, bookings, payments, reviews, notifications, support, wishlist, manager earnings, admin, and KYC.

Verification:
- `python3 -m compileall backend/app` passes.
- `docker compose config --quiet` passes.
- `docker compose up --build -d` starts successfully.
- Backend startup completes MySQL wait, MongoDB wait, Alembic migration check, seed check, and FastAPI startup.
- `http://localhost/api/health` returns `{"status":"ok","service":"sigfleet-backend"}`.

## Phase 3 - MySQL ORM Models & Alembic Schema

Created the complete SQLAlchemy ORM schema for the MySQL side of the SigFleet clone.

Implemented:
- `backend/app/models/base.py` with `TimestampMixin` and UUID generation helper.
- `backend/app/models/user.py` with `User`, `UserKYC`, `EmailVerification`, and `PasswordReset`.
- `backend/app/models/car.py` with `Car`, `CarImage`, `CarAvailabilityBlock`, and `CarPricingRule`.
- `backend/app/models/booking.py` with `Booking` and `BookingExtension`.
- `backend/app/models/payment.py` with `Payment`, `UserWallet`, and `WalletTransaction`.
- `backend/app/models/coupon.py` with `Coupon` and `CouponUsage`.
- `backend/app/models/manager.py` with `HostProfile` and `HostPayoutRequest`.
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
- `backend/app/mongo_models/review.py` with `ReviewDoc` and helpers for create, car review stats, user reviews, manager replies, booking reviews, and average rating aggregation.
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
- `backend/app/utils/email.py` with async HTML email templates for verification, password reset, booking, KYC, reminder, review, and payout emails using SigFleet red branding.
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

Built the manager-side car listing and management system across FastAPI, SQLAlchemy, MongoDB analytics, Redis view counters, image processing, and React manager pages.

Implemented:
- `backend/app/routers/cars.py` with public search/listing, featured cars, city cars, car detail, manager car creation, edit, soft delete, image upload/delete/primary/reorder, date blocks, monthly availability, pricing rules, manager car stats, and availability toggling.
- Search supports city, category, transmission, fuel type, seats, price range, date overlap exclusion, feature filters, location radius filtering with Haversine distance, recommended sorting, pagination, and MongoDB search logging.
- Car detail responses include images, manager profile, pricing rules, 90-day availability blocks, MongoDB review summaries, MongoDB view logging, and Redis `car_views:{car_id}` increments.
- Manager listing creation enforces verified KYC and manager access, creates manager profiles when missing, increments listing counts, notifies admins, and logs activity.
- `backend/app/services/pricing.py` with booking price calculation for hourly/daily rates, pricing-rule discounts/surcharges, insurance plans, coupon discounts, platform fees, security deposit display, and manager earnings.
- `frontend/src/pages/manager/ListCarPage.jsx` with a six-step persisted Zustand listing wizard covering basic info, features, location map, pricing, photos, and review/submit.
- `frontend/src/pages/manager/ManageCarsPage.jsx` with manager stats, filter tabs, car rows, availability toggle, edit, bookings, and delete actions.
- `frontend/src/pages/manager/EditCarPage.jsx` with prefilled car editing plus date block and pricing rule management.

Verification:
- `python3 -m compileall backend/app` passes.
- Backend Docker image rebuild passes.
- Docker import check confirms the car router and pricing service load.
- `docker build -f frontend/Dockerfile frontend` passes with the expected large-chunk warning from the manager wizard and Leaflet map bundle.

## Phase 7 - Car Search, Discovery, Detail, and Wishlist Experience

Built the guest-facing car discovery experience across React and FastAPI.

Implemented:
- `frontend/src/components/search/SearchBar.jsx` reusable home/search search bar with 50-city combobox, top-city chips, pickup/return date-time pickers, duration preview, URL prefill, and `/search` query-string navigation.
- `frontend/src/components/search/FilterSidebar.jsx` with price slider and histogram, category cards, transmission radios, fuel/seats/features/rating filters, mobile sort, active filter count, clear/apply actions, and mobile bottom-sheet support.
- `frontend/src/components/car/CarCard.jsx` with grid/list variants, lazy image treatment, wishlist heart, category badges, feature metadata, rating/new-trip display, price, location, hover lift, and local/backend wishlist sync.
- `frontend/src/pages/SearchPage.jsx` with desktop sidebar, mobile filter drawer, grid/list/map view toggles, result counts, infinite scroll, skeleton loading, empty state, Leaflet map markers, selected-car panel, and debounced map-bound search.
- `frontend/src/pages/CarDetailPage.jsx` with sticky scroll header, hero gallery/lightbox, car header, desktop/mobile booking widget, insurance/coupon/price breakdown, feature grid, expandable description, custom availability calendar, manager profile, reviews, fuzzy pickup map, and similar cars.
- `frontend/src/pages/WishlistPage.jsx` with saved-car grid, localStorage fallback for logged-out users, backend sync for logged-in users, empty state, and fade-out removal.
- Backend wishlist support with `Wishlist` SQLAlchemy model, Alembic migration, and protected `GET /api/wishlist`, `POST /api/wishlist`, and `DELETE /api/wishlist/{car_id}` endpoints.
- Backend review listing via `GET /api/reviews/car/{car_id}` with rating filters and pagination.
- Search API extensions for multi-select categories/fuel types, minimum rating, manager filtering, exclusion for similar cars, newest sorting, and richer result payloads for list cards.

Verification:
- `python3 -m compileall backend/app` passes.
- `npm install` completed successfully with 0 vulnerabilities.
- `npm run build` passes with the expected large chunk warning from map/gallery bundles.
- Vite dev server runs at `http://localhost:5175/` in this environment because ports 5173 and 5174 were already in use.
- `curl -I http://localhost:5175/` returns HTTP 200 from the running frontend server.

## Phase 8 - Complete Simulated Booking, Payment, Wallet, and Manager Trip Flow

Built the end-to-end booking lifecycle with simulated payments only; no Razorpay or external payment gateway calls are used.

Implemented:
- `backend/app/routers/bookings.py` with booking preview, booking creation, simulated payment completion, manager accept/reject, guest/manager cancellation with refund policy, start trip, end trip, booking list/detail, extension request, and extension response endpoints.
- `backend/app/routers/payments.py` with wallet balance/history, simulated wallet top-up, wallet booking payment, and booking payment lookup endpoints.
- `backend/app/services/booking_flow.py` shared helpers for simulated transaction IDs, wallet creation, wallet transaction records, payment completion, notifications, and booking confirmation email dispatch.
- Coupon validation for preview/create without consuming coupons during preview, then `CouponUsage` creation and `used_count` increment during booking creation.
- Booking validation for approval/availability, conflicting bookings, manager availability blocks, pickup lead time, minimum duration, max trip days, guest overlap, and coupon applicability.
- Simulated accounting for wallet debits, instant wallet refunds, security deposit release, manager earning credit, manager pending earning records, and payment records with `SIM_TXN_*` transaction IDs.
- `frontend/src/pages/booking/BookingConfirmPage.jsx` with car/trip summary, insurance selection, coupon apply states, previewed price breakdown, guest notes, KYC warning, and cancellation policy.
- `frontend/src/pages/booking/PaymentPage.jsx` with simulated card/UPI/net banking UI, wallet payment with balance/deficit handling, add-money modal, Radix confirmation dialog, processing state, success state, and simulated payment API calls.
- `frontend/src/pages/booking/BookingSuccessPage.jsx` with animated success state, booking reference copy, trip summary, and navigation CTAs.
- `frontend/src/pages/booking/BookingDetailsPage.jsx` with status timeline, booking/payment cards, SVG QR code generation via `qrcode`, contextual actions, cancellation dialog, and print-ready invoice generation.
- `frontend/src/pages/booking/MyBookingsPage.jsx` with guest booking tabs, date/status filters, cards, cancellation, empty states, and detail navigation.
- `frontend/src/pages/manager/BookingRequestsPage.jsx` and `frontend/src/pages/manager/ActiveTripsPage.jsx` with pending request management, reject modal, accept/start/end trip actions, manager earnings display, active-trip end modal, and manager booking tabs.
- Router wiring for `/booking/confirm/:carId`, `/booking/pay/:bookingId`, `/booking/success`, `/dashboard/bookings`, `/dashboard/bookings/:bookingId`, `/manager/bookings`, and `/manager/active-trips`.
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
- `curl http://localhost:5175/api/health` returns `{"status":"ok","service":"sigfleet-backend"}` through the Vite proxy.

## Phase 10 - Reviews, Notifications Routing, Support, and Celery Maintenance

Built the MongoDB-backed reviews system, completed notification route parity, added customer support tickets/chat, and wired scheduled Celery maintenance tasks.

Implemented:
- `backend/app/routers/reviews.py` with protected review creation, role/window/duplicate validations, car/manager/guest review types, manager replies, car review aggregation, user review listing, my-given reviews, and booking review lookup.
- Review creation stores reviewer, car, and trip snapshots in MongoDB, updates MySQL car/manager ratings, creates review notifications, and logs activity.
- `backend/app/routers/notifications.py` now supports paginated filtering, unread-count with Redis 30-second cache, PATCH read/mark-all-read routes, delete, and legacy POST aliases for existing UI calls.
- `backend/app/routers/support.py` with authenticated or anonymous ticket creation, user/admin ticket listing, ticket detail with MongoDB messages, replies with optional attachments, close-ticket flow, and anonymous contact requests.
- `backend/app/models/support.py` and Alembic revision `9c8b7a6d5e4f_extend_support_tickets.py` add anonymous contact fields, nullable `user_id`, and optional assigned admin support.
- `backend/app/mongo_models/review.py` returns `has_more` for review pagination; `support_message.py` supports system messages.
- `backend/app/tasks/maintenance_tasks.py` adds generic email routing, review request scheduling, pending booking auto-cancel, daily supermanager refresh, and trip reminder tasks.
- `backend/app/celery_app.py` imports maintenance tasks and configures Celery beat for 30-minute booking auto-cancel and daily 2am supermanager status updates.
- Booking completion now queues the review-request task, and payment confirmation queues trip reminders two hours before pickup.
- `frontend/src/pages/booking/WriteReviewPage.jsx` adds interactive star-review submission for car, manager, or guest review flows.
- `frontend/src/components/reviews/ReviewCard.jsx` renders verified-trip review cards with stars, expandable body text, and manager replies.
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
- `backend/app/routers/admin.py` with role-protected `/api/admin/*` routes for overview stats, revenue/city/top-car analytics, activity feed, users, cars, bookings, KYC, payments/refunds, support, coupons, and manager payouts.
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

## Phase 12 - Manager Earnings, Payouts, and Supermanager System

Built the manager finance and reputation workflow across FastAPI, wallet accounting, payout requests, supermanager criteria, and React manager pages.

Implemented:
- `backend/app/routers/host_earnings.py` with manager-only `/api/manager/*` routes for earnings summary, monthly earnings, per-car earnings, credit transactions, payout requests/history, bank details, and manager profile stats.
- Payout request validation for minimum ₹500, wallet balance, bank details, duplicate pending/processing payouts, immediate wallet hold, payout request creation, and admin notification.
- Bank account update flow with IFSC validation and masked account summary responses.
- `backend/app/services/supermanager.py` with criteria-based supermanager evaluation: 10+ completed trips, 4.7+ manager rating, 85%+ acceptance rate, and no manager-initiated cancellation in the last 90 days.
- Booking completion now refreshes supermanager status, and scheduled maintenance reuses the shared supermanager service.
- `frontend/src/pages/manager/HostLayout.jsx` adds a manager-specific sidebar shell.
- `HostDashboardPage.jsx` adds animated summary counters, supermanager banner, earnings/trips charts, active listings, recent bookings, and quick actions.
- `HostEarningsPage.jsx` adds summary cards, per-car earnings table, monthly stacked area chart, transaction history filters, and CSV export.
- `PayoutsPage.jsx` adds wallet balance, bank account side panel, payout request confirmation, and payout history with status badges.
- `HostProfilePage.jsx` adds manager stats, supermanager badge, bio/response-time editing, notification preferences, and verification status.
- React manager routes are now nested under `/manager/*` with the new manager console layout.

Verification:
- `python3 -m compileall backend/app` passes.
- Backend Docker image builds successfully.
- Docker import check confirms the manager earnings router registers 9 routes and the supermanager service imports.
- `npm run build` passes with the expected large chunk warning.

## Phase 13 - Homepage, Navbar, Static Pages, and Lazy Routing

Built the public marketing and informational layer for the SigFleet clone.

Implemented:
- `frontend/src/components/layout/Navbar.jsx` with sticky blur behavior, desktop navigation, logged-in avatar dropdown, wallet display, notification bell, login/register controls, and mobile slide-out drawer.
- `frontend/src/pages/HomePage.jsx` with full hero image, glass search widget, popular city chips, animated stats strip, guest/manager how-it-works tabs, category browsing, featured cars, popular city photo cards, manager earnings calculator, trust cards, Swiper testimonials, Radix FAQ, and app download banner.
- Google Fonts wired in `frontend/src/styles.css` for `Syne` display headings and `DM Sans` body copy, plus small CSS micro-animations.
- Static public pages for how it works, insurance, become a manager, safety, about, contact, legal terms, privacy, refund policy, dynamic city pages, and 404.
- Shared static-page primitives in `frontend/src/pages/static/StaticShell.jsx` for consistent heroes, sections, flows, feature grids, FAQ blocks, CTA bands, and footer.
- Contact form posts to `/api/support/contact` and shows the required success state.
- Dynamic `/cities/:city` page fetches city cars and renders city-specific hero, area chips, travel tips, and route ideas.
- `frontend/src/App.jsx` now uses `React.lazy`, `Suspense`, and a page loader for all route components, with complete public, private, manager, booking, and admin route coverage.
- Manager route paths were aligned to `/manager/cars`, `/manager/cars/new`, and `/manager/trips/active`, with compatibility redirects from older manager URLs.

Verification:
- `npm run build` passes successfully with route-level chunks generated by lazy loading.

## Phase 14 - Rich First-Boot Demo Seed

Replaced the placeholder seed with a full MySQL + MongoDB demo dataset for the SigFleet clone.

Implemented:
- `backend/app/seed.py` now creates the admin account, 5 approved hosts, 10 guests with varied KYC states, wallets, manager profiles, and KYC records.
- Seeded 25 approved cars across Bengaluru, Mumbai, Delhi, Pune, and Chennai with realistic pricing, locations, features, registration numbers, deposits, extra-km charges, 4-6 Picsum gallery images each, featured flags, and pricing rules.
- Seeded booking lifecycle data covering completed, active, confirmed, pending, cancelled, rejected, and extension-request scenarios, with simulated payments, coupon usage, wallet transactions, refunds, and manager earnings.
- Seeded active coupons, MongoDB reviews, notifications, support ticket messages, search logs, car view events, and an activity-feed marker.
- Updated `backend/entrypoint.sh` to always run the seed module on boot; the seed itself skips when demo cars already exist, so it remains idempotent and also repairs the earlier admin-only seed state.
- Pinned `bcrypt==4.0.1` and `PyMySQL==1.1.1` so Passlib password hashing and SQLAlchemy/aiomysql pre-ping remain compatible during Docker builds.

Verification:
- `python3 -m compileall backend/app` passes.
- `docker compose build backend` passes.
- Fresh isolated Docker verification with project `seedverify` ran Alembic migrations and `python -m app.seed` successfully.
- Fresh seed counts: 16 users, 25 cars, 125 car images, 3 pricing rules, 18 bookings, 2 booking extensions, 18 payments, 33 wallet transactions, 5 coupons, 3 support tickets, 6 reviews, 54 notifications, 5 support messages, 20 search logs, and 50 car view events.
- Re-running the seed reports `Demo data already exists; skipping seed.`

## Phase 15 - Final Polish, Responsiveness, and Production Readiness

Completed a broad frontend and DevOps polish pass focused on shared foundations and the highest-traffic user flows.

Implemented:
- Added React Query defaults, Helmet provider, bottom-right toast configuration, skip-to-content link, global touch target sizing, iOS-safe form input sizing, and Tailwind class-based dark mode.
- Added dark mode support controls to the public navbar with persisted `sigfleet-theme` preference, plus a Radix mobile drawer containing nav links, auth actions, wallet, and notification count.
- Added `frontend/src/utils/validationSchemas.js` with Zod schemas for auth, car listing steps, booking, review, KYC, bank details, and support tickets.
- Wired validation and toast feedback into login/register, and added SEO/noindex Helmet tags for public and dashboard entry pages.
- Improved Search page mobile filter bottom sheet, retryable error state, contextual empty state illustration, SEO metadata, and map debounce behavior.
- Improved Car detail page with mobile booking sheet, retryable error handling, SEO/OG tags, coupon debounce/toasts, copy toast, and optimized/accessible image tags.
- Memoized `CarCard`, `FilterSidebar`, and shared `ReviewCard`, and added lazy/async image attributes with stable dimensions for major car/review imagery.
- Added mobile admin navigation drawer and root `README.md` with quick start, credentials, architecture, URLs, checklist, and phase summary.

Verification:
- `npm run build` passes.
