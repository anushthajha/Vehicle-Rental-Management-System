# SigFleet — Technology Stack

---

## Frontend

| Technology | Purpose | Version |
|---|---|---|
| React | UI Library | 18.x |
| Vite | Build Tool & Dev Server | 5.x |
| Tailwind CSS | Utility-first CSS Framework | 3.x |
| Zustand | State Management (Auth Store) | 4.x |
| TanStack Query | Server State & Caching | 5.x |
| React Router DOM | Client-side Routing | 6.x |
| Axios | HTTP Client (with interceptors) | 1.x |
| Recharts | Charts & Analytics Visualization | 2.x |
| Leaflet | Maps Integration | 1.x |
| React Hot Toast | Toast Notifications | 2.x |
| Lucide React | Icon Library | — |

---

## Backend

| Technology | Purpose | Version |
|---|---|---|
| Python | Programming Language | 3.11+ |
| FastAPI | Web Framework (async) | 0.100+ |
| SQLAlchemy | ORM (async mode) | 2.x |
| Alembic | Database Migrations | 1.x |
| Pydantic | Data Validation & Settings | 2.x |
| Celery | Background Task Queue | 5.x |
| Motor | Async MongoDB Driver | 3.x |
| redis-py | Async Redis Client | 5.x |
| Pillow (PIL) | Image Processing (WebP conversion) | 10.x |
| python-jose | JWT Token Handling | 3.x |
| passlib + bcrypt | Password Hashing | — |
| aiosmtplib | Async Email Sending | — |
| aiomysql | Async MySQL Driver | — |

---

## Databases

| Database | Purpose | Version |
|---|---|---|
| MySQL | Primary relational DB (Users, Vehicles, Bookings, Payments, Coupons, KYC) | 8.0 |
| MongoDB | Document store (Reviews, Notifications, Analytics, Sessions, Support Messages) | 7.0 |
| Redis | Cache, JWT blacklist, OTP storage, Rate limiting, Celery broker/backend | 8.x |

---

## Infrastructure

| Technology | Purpose |
|---|---|
| Docker | Containerization |
| Docker Compose | Multi-container orchestration |
| Nginx | Reverse proxy & static file serving (production) |
| Gmail SMTP | Transactional email delivery |
| Celery Beat | Periodic task scheduler |

---

## Development Tools

| Tool | Purpose |
|---|---|
| Uvicorn | ASGI server (development with --reload) |
| Vite Dev Server | Frontend hot module replacement |
| Swagger UI | API documentation (/api/docs) |
| ReDoc | Alternative API docs (/api/redoc) |

---

## Architecture Patterns

| Pattern | Implementation |
|---|---|
| JWT Authentication | Access token (memory) + Refresh token (HttpOnly cookie) |
| Token Rotation | New refresh token issued on each /auth/refresh call |
| Tab Isolation | sessionStorage for user state (each tab independent) |
| Rate Limiting | Redis-backed per-IP and per-user rate limits |
| Background Jobs | Celery workers for emails, auto-cancellation, status updates |
| Event Notifications | MongoDB-stored + Celery email dispatch |
| File Uploads | Local disk with WebP conversion + thumbnail generation |
| Multi-unit Vehicles | `total_units` field with concurrent booking count checks |
| Soft Delete | Vehicles set `is_available=false` instead of hard delete |
| Optimistic Locking | Availability checked at booking creation time |

---

## Security

| Feature | Implementation |
|---|---|
| Password Hashing | bcrypt via passlib |
| Password Policy | 8+ chars, uppercase, lowercase, number, special char |
| OTP Verification | 6-digit, 10-min TTL, max 5 attempts, 60s cooldown |
| CORS | Whitelisted origins only |
| HttpOnly Cookies | Refresh token never accessible to JavaScript |
| Token Blacklisting | Redis-stored JTI on logout |
| Force Logout | Redis flag on password change invalidates all sessions |
| Rate Limiting | Per-endpoint limits (login: 5/min, register: 3/min) |
| Input Validation | Pydantic models with field validators |
| File Validation | Size limit (5MB), type check (jpg/png/webp only) |

---

## Ports (Development)

| Service | Port |
|---|---|
| Frontend (Vite) | 5173–5177 |
| Backend (Uvicorn) | 8000 |
| MySQL | 3306 |
| MongoDB | 27017 |
| Redis | 6379 |
| Nginx (Docker prod) | 3001 |

---

## Environment Variables

| Variable | Description |
|---|---|
| `MYSQL_URL` | MySQL connection string (aiomysql) |
| `MONGODB_URL` | MongoDB connection string |
| `REDIS_URL` | Redis connection string |
| `SECRET_KEY` | JWT signing key (min 32 chars) |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Access token TTL (default: 60) |
| `REFRESH_TOKEN_EXPIRE_DAYS` | Refresh token TTL (default: 30) |
| `SMTP_HOST` | Email server host |
| `SMTP_PORT` | Email server port (587) |
| `SMTP_USER` | Email account username |
| `SMTP_PASSWORD` | Email account password/app password |
| `SMTP_FROM` | Sender email address |
| `FRONTEND_URL` | Frontend base URL for email links |
| `CHAUFFEUR_FEE_PER_DAY` | Chauffeur daily rate (₹800) |
| `MINOR_DAMAGE_FEE` | Minor damage penalty (₹2,000) |
| `MAJOR_DAMAGE_FEE` | Major damage penalty (₹10,000) |
| `TOTAL_LOSS_FEE` | Total loss penalty (₹50,000) |
