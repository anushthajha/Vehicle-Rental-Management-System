# Zoomcar Clone

India's largest self-drive car rental platform, cloned with React.js, FastAPI, MySQL, MongoDB, Redis, and Docker Compose.

## Quick Start

```bash
git clone <your-repo>
cd zoomcar-clone
cp .env.example .env
# Edit .env and set SMTP credentials. Mailtrap.io works well for local email testing.
docker-compose up --build
# First boot takes about 3 minutes for migrations and demo seeding.
# Open http://localhost
```

## Default Credentials

| Role | Email | Password |
|---|---|---|
| Admin | admin@zoomcar.com | Admin@1234 |
| Host 1 | priya@host.com | Pass@1234 |
| Host 2 | arjun@host.com | Pass@1234 |
| Guest 1 | guest1@guest.com | Guest@1234 |
| Guest 2 | guest2@guest.com | Guest@1234 |

## Database Architecture

| Database | Engine | Usage |
|---|---|---|
| MySQL 8 | Relational | Users, cars, bookings, payments, coupons, and transactional data |
| MongoDB 7 | Document | Reviews, notifications, support messages, analytics events, and activity feed |
| Redis 7 | Cache | JWT blacklist, rate limits, session data, and Celery broker |

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
- [ ] Browse cars without login
- [ ] Search with city, date, category, and price filters
- [ ] Map view with markers
- [ ] Car detail page with booking widget
- [ ] Complete KYC with document upload
- [ ] Book a car, pay, confirm, and reach success page
- [ ] Host lists a car
- [ ] Host accepts booking, starts trip, and ends trip
- [ ] Write review after completed trip
- [ ] Admin approves car listing and KYC
- [ ] Admin analytics charts render
- [ ] Wallet add money and wallet payment
- [ ] Coupon code application
- [ ] Support ticket and chat thread
- [ ] Host earnings and payout request
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
| 6 | Car listing and host APIs | MySQL |
| 7 | Search, filters, map, detail, wishlist | MySQL, MongoDB |
| 8 | Booking, payment, wallet flow | MySQL, MongoDB |
| 9 | Dashboard, KYC, wallet, profile | MySQL |
| 10 | Reviews, notifications, support | Both |
| 11 | Admin dashboard | Both |
| 12 | Host earnings and payouts | MySQL |
| 13 | Homepage and static routing | MySQL reads |
| 14 | Complete seed file | Both |
| 15 | Polish, mobile, dark mode, performance, README | - |
