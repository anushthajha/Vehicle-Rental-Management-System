# Vehicle Rental Management System

A full-stack vehicle rental management system for customers, vehicle managers, and administrators. The platform supports vehicle discovery, rentals, KYC, wallet payments, manager operations, admin-controlled vehicle taxonomy, analytics, notifications, and support workflows.

## Quick Start

```bash
git clone <your-repo>
cd vehicle-rental-management-system
cp .env.example .env
# Edit .env and set SMTP credentials. Mailtrap.io works well for local email testing.
docker-compose up --build
# First boot takes about 3 minutes for migrations and demo seeding.
# Open http://localhost
```

## Default Credentials

| Role | Email | Password |
|---|---|---|
| Admin | admin@sigfleet.com | Admin@1234 |
| Vehicle Manager 1 | priya@manager.com | Pass@1234 |
| Vehicle Manager 2 | arjun@manager.com | Pass@1234 |
| Customer 1 | customer1@test.com | Customer@1234 |
| Customer 2 | customer2@test.com | Customer@1234 |

## Database Architecture

| Database | Engine | Usage |
|---|---|---|
| MySQL 8 | Relational | Users, vehicles, rentals, payments, coupons, manager profiles, and transactional data |
| MongoDB 7 | Document | Reviews, notifications, support messages, analytics events, and activity feed |
| Redis 7 | Cache | JWT blacklist, rate limits, session data, and Celery broker |

## Application Architecture

The app has three distinct dashboard experiences:

- Customer dashboard for rentals, KYC, wallet, rental history, tracking, wishlist, notifications, and support.
- Vehicle Manager dashboard for vehicle inventory, availability, bookings, earnings, payouts, statistics, and profile management.
- Admin dashboard for users, vehicle managers, vehicles, categories, bookings, payments, support, coupons, analytics, and payouts.

## Tech Stack

Frontend: React 18, Vite, Tailwind CSS, React Query, Zustand, Leaflet  
Backend: FastAPI, SQLAlchemy, MySQL, Motor, MongoDB, Celery  
Infrastructure: Docker Compose, Nginx

## URLs

- App: http://localhost
- API Docs: http://localhost/api/docs
- ReDoc: http://localhost/api/redoc

## Final Checklist

- [ ] Register, verify email, and login
- [ ] Browse vehicles without login
- [ ] Search with city, date, category, and price filters
- [ ] Map view with markers
- [ ] Vehicle detail page with rental widget
- [ ] Complete KYC with document upload
- [ ] Rent a vehicle, pay, confirm, and reach success page
- [ ] Vehicle Manager adds a vehicle
- [ ] Vehicle Manager accepts booking, starts trip, and ends trip
- [ ] Write review after completed trip
- [ ] Admin approves vehicle listing and KYC
- [ ] Admin analytics charts render
- [ ] Wallet add money and wallet payment
- [ ] Coupon code application
- [ ] Support ticket and chat thread
- [ ] Vehicle Manager earnings and payout request
- [ ] Forgot/reset password via email
- [ ] All pages mobile responsive
- [ ] Dark mode toggle works
- [ ] `docker-compose up --build` serves the site at localhost
- [ ] Seed data is populated on first boot

## Phase Execution Summary

| Phase | What It Builds | DB Touched |
|---|---|---|
| 1 | Docker Compose infrastructure | - |
| 2 | MySQL and MongoDB connection layer | Both |
| 3 | MySQL ORM models | MySQL |
| 4 | MongoDB document models | MongoDB |
| 5 | Authentication | MySQL, Redis |
| 6 | Vehicle listing and manager APIs | MySQL |
| 7 | Search, filters, map, detail, wishlist | MySQL, MongoDB |
| 8 | Rental, payment, wallet flow | MySQL, MongoDB |
| 9 | Customer dashboard, KYC, wallet, profile | MySQL |
| 10 | Reviews, notifications, support | Both |
| 11 | Admin dashboard | Both |
| 12 | Vehicle Manager earnings and payouts | MySQL |
| 13 | Homepage and static routing | MySQL reads |
| 14 | Complete seed file | Both |
| 15 | Polish, mobile, dark mode, performance, README | - |
