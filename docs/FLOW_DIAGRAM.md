# SigFleet — Flow Diagram (for draw.io)

Use this document to recreate the complete application flow in draw.io. Each section below maps to a separate page/slide in your diagram.

---

## Page 1: High-Level Architecture Flow

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              SIGFLEET PLATFORM                                   │
└─────────────────────────────────────────────────────────────────────────────────┘

                         ┌──────────────┐
                         │   Frontend   │
                         │  React+Vite  │
                         │  :5173/5176  │
                         └──────┬───────┘
                                │ Axios (withCredentials)
                                ▼
                    ┌───────────────────────┐
                    │   Nginx (Docker)      │
                    │   :3001 (prod)        │
                    └───────────┬───────────┘
                                │
                                ▼
                    ┌───────────────────────┐
                    │   FastAPI Backend     │
                    │   :8000 /api/*        │
                    │                       │
                    │  ┌─────────────────┐  │
                    │  │ CORS Middleware │  │
                    │  │ Auth Middleware │  │
                    │  │ Error Handler   │  │
                    │  │ Rate Limiter    │  │
                    │  └─────────────────┘  │
                    └───┬───────┬───────┬───┘
                        │       │       │
              ┌─────────┘       │       └─────────┐
              ▼                 ▼                  ▼
    ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
    │   MySQL 8.0  │  │ MongoDB 7.0  │  │  Redis 8.x   │
    │              │  │              │  │              │
    │ • Users      │  │ • Reviews    │  │ • JWT Black  │
    │ • Vehicles   │  │ • Notifs     │  │ • OTP Store  │
    │ • Bookings   │  │ • Analytics  │  │ • Rate Limit │
    │ • Payments   │  │ • Sessions   │  │ • Cache      │
    │ • Coupons    │  │ • Support    │  │ • Celery     │
    │ • KYC        │  │   Messages   │  │   Broker     │
    └──────────────┘  └──────────────┘  └──────────────┘
                                               │
                                               ▼
                                    ┌──────────────────┐
                                    │  Celery Worker   │
                                    │                  │
                                    │ • Email Tasks    │
                                    │ • Auto-cancel    │
                                    │ • SuperManager   │
                                    │ • Trip Reminders │
                                    └──────────────────┘
                                               │
                                               ▼
                                    ┌──────────────────┐
                                    │   Gmail SMTP     │
                                    │   (Emails)       │
                                    └──────────────────┘
```

---

## Page 2: User Roles & Authentication Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        ENTRY POINT                                       │
│                     User visits website                                  │
└────────────────────────────┬────────────────────────────────────────────┘
                             │
                             ▼
                  ┌─────────────────────┐
                  │   Email/Password    │
                  │   Registration      │
                  └──────────┬──────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
    ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
    │  Customer    │ │   Vehicle    │ │    Admin     │
    │  (default)   │ │   Manager    │ │  (seeded)    │
    └──────┬───────┘ └──────┬───────┘ └──────┬───────┘
           │                │                │
           ▼                ▼                │
    ┌──────────────┐ ┌──────────────┐        │
    │  OTP Email   │ │  Awaits      │        │
    │  Verification│ │  Admin       │        │
    │  (6-digit)   │ │  Approval    │        │
    └──────┬───────┘ └──────┬───────┘        │
           │                │                │
           ▼                ▼                ▼
    ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
    │  JWT Access  │ │  JWT Access  │ │  JWT Access  │
    │  Token       │ │  Token       │ │  Token       │
    │  (memory)    │ │  (memory)    │ │  (memory)    │
    │  +           │ │  +           │ │  +           │
    │  Refresh     │ │  Refresh     │ │  Refresh     │
    │  Token       │ │  Token       │ │  Token       │
    │  (HttpOnly   │ │  (HttpOnly   │ │  (HttpOnly   │
    │   Cookie)    │ │   Cookie)    │ │   Cookie)    │
    └──────┬───────┘ └──────┬───────┘ └──────┬───────┘
           │                │                │
           ▼                ▼                ▼
    ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
    │  /customer/  │ │  /manager/   │ │  /admin/     │
    │  dashboard   │ │  dashboard   │ │  dashboard   │
    └──────────────┘ └──────────────┘ └──────────────┘
```

---

## Page 3: Customer Flow

```
┌──────────────┐
│   Customer   │
│   Login      │
└──────┬───────┘
       │
       ▼
┌──────────────────┐
│ Customer         │
│ Dashboard        │
└──────┬───────────┘
       │
       ├──────────────────────────────────────────────────────────────┐
       │                                                              │
       ▼                                                              ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│ Browse       │    │ KYC          │    │ Wallet       │    │ Support      │
│ Vehicles     │    │ Verification │    │              │    │ Tickets      │
│              │    │              │    │ • Add Money  │    │              │
│ • By City    │    │ • DL Upload  │    │ • Pay Booking│    │ • Create     │
│ • By Category│    │ • Aadhar     │    │ • View Txns  │    │ • Messages   │
│ • By Price   │    │ • Status     │    │ • Refunds    │    │ • Track      │
│ • By Date    │    │   Tracking   │    │              │    │              │
│ • Filters    │    │              │    │              │    │              │
└──────┬───────┘    └──────────────┘    └──────────────┘    └──────────────┘
       │
       ▼
┌──────────────┐
│ Vehicle      │
│ Detail Page  │
│              │
│ • Images     │
│ • Reviews    │
│ • Pricing    │
│ • Manager    │
│ • Features   │
└──────┬───────┘
       │
       ▼
┌──────────────┐         ┌──────────────┐         ┌──────────────┐
│ Booking      │────────▶│ Payment      │────────▶│ Booking      │
│ Confirm      │         │ Page         │         │ Success      │
│              │         │              │         │              │
│ • Dates      │         │ • Card       │         │ • Ref Number │
│ • Insurance  │         │ • UPI        │         │ • Details    │
│ • Chauffeur  │         │ • Net Banking│         │ • Status     │
│ • Coupon     │         │ • Wallet     │         │              │
│ • Preview    │         │              │         │              │
└──────────────┘         └──────────────┘         └──────┬───────┘
                                                         │
                                                         ▼
                                                  ┌──────────────┐
                                                  │ My Bookings  │
                                                  │              │
                                                  │ • Active     │
                                                  │ • Completed  │
                                                  │ • Cancelled  │
                                                  │ • Track Trip │
                                                  │ • Extend     │
                                                  │ • Cancel     │
                                                  │ • Review     │
                                                  └──────────────┘
```

---

## Page 4: Vehicle Manager Flow

```
┌──────────────┐
│   Vehicle    │
│   Manager    │
│   Login      │
└──────┬───────┘
       │
       ▼
┌──────────────────┐
│ Manager          │
│ Dashboard        │
│                  │
│ • Stats Overview │
│ • Recent Bookings│
│ • Revenue Chart  │
└──────┬───────────┘
       │
       ├─────────────┬─────────────┬─────────────┬─────────────┬─────────────┐
       ▼             ▼             ▼             ▼             ▼             ▼
┌────────────┐┌────────────┐┌────────────┐┌────────────┐┌────────────┐┌────────────┐
│ My         ││ Bookings   ││ Active     ││ Earnings   ││ Availability││ Profile    │
│ Vehicles   ││            ││ Trips      ││            ││ Calendar   ││            │
│            ││ • Pending  ││            ││ • Revenue  ││            ││ • Bio      │
│ • Add New  ││ • Accept   ││ • Start    ││ • Monthly  ││ • Block    ││ • Bank     │
│ • Edit     ││ • Reject   ││ • End Trip ││ • Payouts  ││   Dates    ││   Details  │
│ • Images   ││ • Cancel   ││ • Odometer ││ • Request  ││ • View     ││ • Payouts  │
│ • Pricing  ││            ││            ││   Payout   ││   Calendar ││            │
│ • Toggle   ││            ││            ││            ││            ││            │
└────────────┘└────────────┘└──────┬─────┘└────────────┘└────────────┘└────────────┘
                                   │
                                   ▼
                            ┌────────────┐
                            │ Inspection │
                            │            │
                            │ • Condition│
                            │ • Damage   │
                            │   Notes    │
                            │ • Photos   │
                            │ • Penalty  │
                            │   Amount   │
                            └────────────┘
```

---

## Page 5: Admin Flow

```
┌──────────────┐
│    Admin     │
│    Login     │
└──────┬───────┘
       │
       ▼
┌──────────────────┐
│ Admin Dashboard  │
│                  │
│ • Total Users    │
│ • Revenue        │
│ • Active Bookings│
│ • Pending Tasks  │
└──────┬───────────┘
       │
       ├──────────┬──────────┬──────────┬──────────┬──────────┬──────────┐
       ▼          ▼          ▼          ▼          ▼          ▼          ▼
┌──────────┐┌──────────┐┌──────────┐┌──────────┐┌──────────┐┌──────────┐┌──────────┐
│ Users    ││ Vehicle  ││ Vehicles ││ KYC      ││ Support  ││ Coupons  ││ Payouts  │
│          ││ Managers ││          ││ Review   ││ Tickets  ││          ││          │
│ • List   ││          ││ • Pending││          ││          ││ • Create ││ • Pending│
│ • Search ││ • Create ││ • Approve││ • Pending││ • Reply  ││ • Edit   ││ • Process│
│ • Suspend││ • Promote││ • Reject ││ • Approve││ • Status ││ • Delete ││ • Complete│
│ • Delete ││ • Demote ││ • Feature││ • Reject ││ • Priority│ • Toggle ││ • Fail   │
│ • Role   ││ • Suspend││ • Manage ││          ││          ││          ││          │
│   Change ││ • Reactivate│        ││          ││          ││          ││          │
└──────────┘└──────────┘└──────────┘└──────────┘└──────────┘└──────────┘└──────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────────┐
│                        ANALYTICS                                  │
│                                                                  │
│  • Revenue (monthly)      • Bookings (monthly)                   │
│  • New Users (monthly)    • Vehicles by City                     │
│  • Top Vehicles           • Category Distribution                │
│  • City Analytics         • Booking Funnel                       │
│  • Daily Bookings         • Activity Feed                        │
└──────────────────────────────────────────────────────────────────┘
```

---

## Page 6: Booking Lifecycle (State Machine)

```
                    ┌──────────┐
                    │ Customer │
                    │ Creates  │
                    │ Booking  │
                    └────┬─────┘
                         │
              ┌──────────┴──────────┐
              ▼                     ▼
     (auto_accept=true)    (auto_accept=false)
              │                     │
              ▼                     ▼
     ┌──────────────┐      ┌──────────────┐
     │  CONFIRMED   │      │   PENDING    │
     └──────┬───────┘      └──────┬───────┘
            │                     │
            │              ┌──────┼──────┐
            │              ▼      │      ▼
            │      ┌────────┐    │  ┌────────┐
            │      │ Manager│    │  │ Manager│
            │      │ Accepts│    │  │ Rejects│
            │      └───┬────┘    │  └───┬────┘
            │          │         │      │
            │          ▼         │      ▼
            │   ┌──────────┐    │  ┌──────────┐
            │   │ CONFIRMED│    │  │ REJECTED │
            │   └────┬─────┘    │  └──────────┘
            │        │          │
            ├────────┘          │ (pickup time passes)
            │                   ▼
            │           ┌──────────────┐
            │           │  CANCELLED   │
            │           │  (EXPIRED)   │
            │           └──────────────┘
            │
            ▼
    ┌──────────────┐
    │   Customer   │
    │   Pays       │
    │  (Card/UPI/  │
    │   Wallet)    │
    └──────┬───────┘
           │
           ▼
    ┌──────────────┐
    │   Manager    │
    │  Starts Trip │
    │  (Odometer)  │
    └──────┬───────┘
           │
           ▼
    ┌──────────────┐
    │    ACTIVE    │
    │   (Trip in   │
    │   progress)  │
    └──────┬───────┘
           │
           ▼
    ┌──────────────┐
    │   Manager    │
    │  Ends Trip   │
    │  (Odometer)  │
    └──────┬───────┘
           │
           ▼
    ┌──────────────┐         ┌──────────────┐
    │  COMPLETED   │────────▶│  Inspection  │
    │              │         │  (optional)  │
    │ • Security   │         │              │
    │   deposit    │         │ • Good       │
    │   released   │         │ • Minor dmg  │
    │ • Manager    │         │ • Major dmg  │
    │   earnings   │         │ • Total loss │
    │   credited   │         │              │
    └──────────────┘         └──────────────┘
           │
           ▼
    ┌──────────────┐
    │   Customer   │
    │   Review     │
    │  (after 2h)  │
    └──────────────┘
```

---

## Page 7: Payment & Wallet Flow

```
┌──────────────────────────────────────────────────────────────────┐
│                      PAYMENT FLOW                                 │
└──────────────────────────────────────────────────────────────────┘

    ┌──────────────┐
    │ Booking      │
    │ Created      │
    │ (status:     │
    │  confirmed)  │
    └──────┬───────┘
           │
           ▼
    ┌──────────────┐
    │ Payment Page │
    │              │
    │ Choose:      │
    └──┬───┬───┬───┘
       │   │   │
       ▼   ▼   ▼
  ┌─────┐┌─────┐┌─────────┐
  │Card ││UPI  ││Wallet   │
  │     ││     ││         │
  │(sim)││(sim)││(balance │
  │     ││     ││ check)  │
  └──┬──┘└──┬──┘└────┬────┘
     │      │        │
     └──────┼────────┘
            │
            ▼
    ┌──────────────┐
    │ Payment      │
    │ Processed    │
    │              │
    │ • TXN ID     │
    │ • Status:paid│
    └──────┬───────┘
           │
           ├─────────────────────────────────┐
           ▼                                 ▼
    ┌──────────────┐                 ┌──────────────┐
    │ Customer     │                 │ Manager      │
    │ Wallet       │                 │ Wallet       │
    │              │                 │              │
    │ DEBIT:       │                 │ CREDIT:      │
    │ total_amount │                 │ (pending     │
    │              │                 │  earning)    │
    └──────────────┘                 └──────────────┘

┌──────────────────────────────────────────────────────────────────┐
│                    WALLET OPERATIONS                              │
│                                                                  │
│  TOP-UP:     Customer adds ₹100–₹10,000                         │
│  DEBIT:      Booking payment / Damage penalty                    │
│  CREDIT:     Refund / Security deposit release / Manager earning │
│  PAYOUT:     Manager requests withdrawal → Admin processes       │
└──────────────────────────────────────────────────────────────────┘
```

---

## Page 8: Cancellation & Refund Policy

```
┌──────────────────────────────────────────────────────────────────┐
│                   CANCELLATION POLICIES                           │
└──────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ CUSTOMER CANCELS                                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ≥ 24 hours before pickup                                        │
│  ┌──────────────────────────────────────────┐                    │
│  │ 100% REFUND (Free cancellation)          │                    │
│  └──────────────────────────────────────────┘                    │
│                                                                  │
│  < 24 hours before pickup                                        │
│  ┌──────────────────────────────────────────┐                    │
│  │ 90% REFUND (10% cancellation charge)     │                    │
│  └──────────────────────────────────────────┘                    │
│                                                                  │
│  After trip started (active)                                     │
│  ┌──────────────────────────────────────────┐                    │
│  │ NO REFUND (Cannot cancel)                │                    │
│  └──────────────────────────────────────────┘                    │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ MANAGER CANCELS                                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────────────────────────────┐                    │
│  │ 100% REFUND to customer                  │                    │
│  │ + FINE: max(₹500, 10% of booking)        │                    │
│  │ + Acceptance rate -5%                     │                    │
│  └──────────────────────────────────────────┘                    │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ BOOKING EXPIRES (Manager didn't respond)                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Booked ≥ 24h in advance                                         │
│  ┌──────────────────────────────────────────┐                    │
│  │ 100% REFUND + Manager FINE               │                    │
│  │ + Acceptance rate -5%                     │                    │
│  └──────────────────────────────────────────┘                    │
│                                                                  │
│  Booked < 24h in advance                                         │
│  ┌──────────────────────────────────────────┐                    │
│  │ 100% REFUND (no fine)                    │                    │
│  └──────────────────────────────────────────┘                    │
└─────────────────────────────────────────────────────────────────┘
```

---

## Page 9: Notification & Email System

```
┌──────────────────────────────────────────────────────────────────┐
│                   EVENT-DRIVEN NOTIFICATIONS                      │
└──────────────────────────────────────────────────────────────────┘

    ┌─────────────┐         ┌─────────────┐         ┌─────────────┐
    │   EVENT     │────────▶│  MongoDB    │────────▶│  Frontend   │
    │   Trigger   │         │  Notifs     │         │  Bell Icon  │
    └─────────────┘         └─────────────┘         └─────────────┘
           │
           ▼
    ┌─────────────┐         ┌─────────────┐         ┌─────────────┐
    │   Celery    │────────▶│  Gmail SMTP │────────▶│  User Email │
    │   Task      │         │             │         │  Inbox      │
    └─────────────┘         └─────────────┘         └─────────────┘

TRIGGERS:
  • Registration         → OTP email
  • Booking created      → Confirmation email + Manager notification
  • Booking accepted     → Customer notification
  • Payment successful   → Confirmation email + notification
  • Trip starting soon   → Reminder email (2h before)
  • Trip completed       → Review request email (2h after)
  • Booking cancelled    → Refund notification + email
  • KYC approved/rejected→ Email + notification
  • Vehicle approved     → Manager email + notification
  • Damage penalty       → Customer email + notification
  • Payout processed     → Manager email + notification
  • Support reply        → Customer email + notification
  • Manager welcome      → Welcome email with credentials
  • SuperManager status  → Notification
```

---

## Page 10: Data Model Relationships

```
┌──────────────────────────────────────────────────────────────────┐
│                    MYSQL DATA MODEL                               │
└──────────────────────────────────────────────────────────────────┘

┌──────────┐       ┌──────────────┐       ┌──────────────┐
│  User    │──1:1──│  UserKYC     │       │  UserWallet  │
│          │──1:1──│              │       │              │
│ • email  │──1:1──└──────────────┘       └──────────────┘
│ • role   │──1:N──┌──────────────┐
│ • phone  │       │  Vehicle     │──1:N──┌──────────────┐
└──────────┘       │              │       │ VehicleImage │
     │             │ • title      │       └──────────────┘
     │             │ • price      │──1:N──┌──────────────┐
     │             │ • city       │       │ PricingRule  │
     │             └──────┬───────┘       └──────────────┘
     │                    │          ──1:N──┌──────────────┐
     │                    │                 │ Availability │
     │                    │                 │ Block        │
     │                    │                 └──────────────┘
     │                    │
     │             ┌──────┴───────┐
     └─────────────│   Booking    │──1:1──┌──────────────┐
                   │              │       │   Payment    │
                   │ • status     │       └──────────────┘
                   │ • dates      │──1:1──┌──────────────┐
                   │ • amounts    │       │  Inspection  │
                   └──────────────┘       └──────────────┘
                          │
                          │──1:N──┌──────────────┐
                                  │  Extension   │
                                  └──────────────┘

┌──────────┐       ┌──────────────┐
│  Coupon  │──1:N──│ CouponUsage  │
└──────────┘       └──────────────┘

┌──────────┐       ┌──────────────┐
│ Manager  │──1:N──│ PayoutRequest│
│ Profile  │       └──────────────┘
└──────────┘

┌──────────┐       ┌──────────────┐
│ Support  │       │ VehicleCategory│
│ Ticket   │       │ VehicleType    │
└──────────┘       └──────────────┘

┌──────────┐
│ Wishlist │
└──────────┘

┌──────────────────────────────────────────────────────────────────┐
│                   MONGODB COLLECTIONS                             │
│                                                                  │
│  • notifications    (user_id, title, message, type, is_read)     │
│  • reviews          (booking_id, rating, body, manager_reply)    │
│  • support_messages (ticket_id, sender, message)                 │
│  • car_view_events  (vehicle_id, user_id, city) [TTL: 90 days]  │
│  • search_logs      (user_id, city, filters) [TTL: 30 days]     │
│  • activity_feed    (actor_id, action, entity) [TTL: 180 days]  │
│  • user_sessions    (user_id, device, ip) [TTL: 30 days]        │
└──────────────────────────────────────────────────────────────────┘
```

---

## draw.io Tips

1. **Shapes**: Use rounded rectangles for pages/screens, diamonds for decisions, cylinders for databases
2. **Colors**:
   - Customer flow: Green (#10B981)
   - Manager flow: Blue (#3B82F6)
   - Admin flow: Purple (#8B5CF6)
   - Auth/Security: Orange (#F59E0B)
   - Databases: Gray (#6B7280)
   - Background tasks: Red (#E31837)
3. **Connectors**: Use solid arrows for direct flow, dashed for async/background
4. **Grouping**: Use swimlanes to separate Customer / Manager / Admin actions
