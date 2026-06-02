# SigFleet — Application Workflow (draw.io Guide)

> Use this document to build the workflow diagram in draw.io.
> Each section = one swimlane or flow group.

---

## How to Set Up in draw.io

1. Open draw.io → New Diagram → **Flowchart** template
2. Use **Swimlane** layout with 4 lanes: `Customer`, `Vehicle Manager`, `Admin`, `System`
3. Color code: Customer = Blue, Manager = Green, Admin = Orange, System = Grey
4. Use **rounded rectangles** for actions, **diamonds** for decisions, **cylinders** for databases, **parallelograms** for data input/output

---

## FLOW 1 — User Registration & Verification

```
[START]
  ↓
[User visits /auth/register]
  ↓
[Fills: name, email, password, role (Customer / Manager)]
  ↓
[POST /auth/register]
  ↓
[System: Hash password → Save to MySQL users table]
  ↓
[System: Generate 6-digit OTP → Send via Gmail SMTP]
  ↓
[User redirected to /auth/verify-otp]
  ↓
[User enters OTP]
  ↓
<OTP correct & not expired?>
  YES → [Mark user.is_verified = True] → [Redirect to Dashboard]
  NO  → [Show error] → [Option to resend OTP] → [Loop back]
```

---

## FLOW 2 — Login & Token Management

```
[User visits /auth/login]
  ↓
[Enters email + password]
  ↓
[POST /auth/login]
  ↓
<Credentials valid?>
  NO  → [Show "Invalid credentials"] → [Loop back]
  YES ↓
[System: Generate JWT access token (60 min) + refresh token (30 days)]
  ↓
[Store tokens in localStorage]
  ↓
[GET /auth/me → Load user profile]
  ↓
<Role?>
  customer        → [Redirect to /customer/dashboard]
  vehicle_manager → [Redirect to /manager/dashboard]
  admin           → [Redirect to /admin/dashboard]

--- TOKEN REFRESH FLOW ---
[Any API call returns 401]
  ↓
[Axios interceptor catches it]
  ↓
[POST /auth/refresh with refresh token]
  ↓
<Refresh valid?>
  YES → [New access token stored] → [Retry original request]
  NO  → [Logout] → [Redirect to /auth/login]
```

---

## FLOW 3 — KYC Submission & Approval

```
CUSTOMER SIDE:
[Customer visits /customer/kyc]
  ↓
<KYC status?>
  not_submitted → [Show upload form]
  under_review  → [Show "Under Review" status card]
  approved      → [Show "Verified ✓" card]
  rejected      → [Show rejection reason + resubmit form]

[Customer fills: DL number, Aadhaar number]
[Customer uploads: DL front, DL back, Aadhaar front, Aadhaar back]
  ↓
[POST /kyc/submit]
  ↓
[System: Save files to /uploads/kyc/{user_id}/]
[System: Set kyc_status = "under_review"]
[System: Notify all admins via MongoDB notification]
  ↓
[Customer sees "Under Review" state]

ADMIN SIDE:
[Admin visits /admin/kyc]
  ↓
[Sees pending KYC queue]
  ↓
[Reviews uploaded documents]
  ↓
<Decision?>
  APPROVE → [POST /admin/kyc/{id}/approve]
           → [kyc_status = "approved"]
           → [user.is_verified = True]
           → [Send approval email to customer]
           → [Customer can now book vehicles]

  REJECT  → [POST /admin/kyc/{id}/reject with reason]
           → [kyc_status = "rejected"]
           → [Send rejection email with reason]
           → [Customer can resubmit]
```

---

## FLOW 4 — Vehicle Listing & Approval

```
MANAGER SIDE:
[Manager visits /manager/vehicles/add]
  ↓
[7-Step Wizard:]
  Step 1: Select Vehicle Type (Car/Bike/Traveller) → Category → Make/Model/Year/Reg No
  Step 2: Features (AC, GPS, etc.) + Description
  Step 3: Location (City + Area + Address + Map Pin)
  Step 4: Pricing (hourly/daily/deposit/KM limits) + Auto-accept toggle
  Step 5: Upload photos (drag-drop, set primary)
  Step 6: Upload RC document (required) + Insurance (optional)
  Step 7: Review summary → Submit
  ↓
[POST /vehicles/]
  ↓
[System: Save vehicle with is_approved=False, is_available=False]
[System: Notify all admins]
  ↓
[Manager sees vehicle in "Pending Approval" state]

ADMIN SIDE:
[Admin visits /admin/vehicles/manage]
  ↓
[Sees pending vehicles queue]
  ↓
<Decision?>
  APPROVE → [PATCH /admin/vehicles/{id}/approve]
           → [is_approved=True, is_available=True]
           → [Vehicle appears in search results]

  REJECT  → [PATCH /admin/vehicles/{id}/reject with reason]
           → [Manager notified]
```

---

## FLOW 5 — Vehicle Search & Discovery

```
[User visits /vehicles (public — no login required)]
  ↓
[SearchBar: Select City + Pickup Date + Return Date]
  ↓
[GET /vehicles/ with filters]
  ↓
[System: Query MySQL with conditions:]
  - is_approved = True
  - is_available = True
  - If dates provided: active_bookings < total_units for those dates
  - Apply city/category/type/brand/price/feature filters
  ↓
[Display vehicle cards in grid/list/map view]
  ↓
[Vehicle Type Tab Bar: All / 🚗 Cars / 🏍️ Bikes / 🚌 Travellers]
  ↓
[User clicks vehicle card → /vehicles/:id]
  ↓
[Full detail page: gallery, specs, features, availability calendar, reviews, manager info]
```

---

## FLOW 6 — Booking Creation (Core Flow)

```
[Customer on /vehicles/:id]
  ↓
[BookingWidget: Select pickup/return dates]
  ↓
[System: GET /vehicles/{id}/availability/check]
  ↓
<Available?>
  NO  → [Show "Not available" with next available date]
  YES → [Show "Available" + price breakdown]
  ↓
[Customer selects:]
  - Rental Type: Self Drive (shows store address) OR With Chauffeur (enter pickup + drop address)
  - Insurance: Basic / Standard / Platinum
  - Coupon code (optional, max 5% discount)
  ↓
[Customer clicks "Book Now"]
  ↓
<Logged in?>
  NO  → [Redirect to /auth/login with return URL]
  YES ↓
<KYC approved?>
  NO  → [Show "Complete KYC" prompt]
  YES ↓
[POST /bookings/]
  ↓
[System: Re-validate availability]
[System: Calculate final price]
[System: Create Booking record]
[System: Create Payment record (status=created)]
  ↓
<auto_accept_bookings = True?>
  YES → [booking.status = "confirmed"]
      → [Redirect to /booking/pay/:id]
  NO  → [booking.status = "pending"]
      → [Notify manager]
      → [Wait for manager to accept]
      → [On accept: Redirect customer to /booking/pay/:id]
```

---

## FLOW 7 — Payment Processing

```
[Customer on /booking/pay/:id]
  ↓
[Shows booking summary + total amount]
  ↓
[Customer selects payment method:]

  CARD → Enter card number (16 digits) + expiry (MM/YY) + CVV + name
  UPI  → Enter UPI ID (e.g. name@paytm)
  NET BANKING → Select bank from dropdown
  WALLET → Shows balance; if insufficient → "Add Money" option
  ↓
[Validate fields]
  ↓
[Show confirmation dialog]
  ↓
[Customer confirms]
  ↓
[System: 1.5 second simulated processing]
  ↓
[POST /bookings/{id}/simulate-payment  OR  POST /payments/wallet/pay-booking]
  ↓
[System: mark_payment_paid()]
  - payment.status = "paid"
  - booking.status = "confirmed"
  - Credit manager wallet (pending earnings)
  - sync_vehicle_availability() → update is_available
  - Send confirmation emails to customer + manager
  ↓
[Redirect to /booking/success?ref=BOOKING_REF]
```

---

## FLOW 8 — Trip Lifecycle (Manager Side)

```
[Booking status: confirmed]
  ↓
[Manager visits /manager/bookings]
  ↓
[Sees confirmed booking]
  ↓
[Manager clicks "Start Trip"]
  ↓
[PATCH /bookings/{id}/start-trip with odometer_start]
  ↓
[booking.status = "active"]
[booking.actual_pickup_time = now]
  ↓
[Trip in progress...]
  ↓
[Manager clicks "End Trip"]
  ↓
[PATCH /bookings/{id}/end-trip with odometer_end + condition_notes]
  ↓
[System:]
  - Calculate extra KM charges (if odometer_end - odometer_start > included_km_per_day × days)
  - booking.status = "completed"
  - Release security deposit → credit to customer wallet
  - Credit manager earnings → manager wallet
  - car.total_trips += 1
  - sync_vehicle_availability()
  - Check Super Manager qualification
  - Schedule review request email (2 hours later)
  ↓
[Customer can now write a review]
```

---

## FLOW 9 — Cancellation Flows

```
CUSTOMER CANCELLATION:
[Customer on /customer/bookings]
  ↓
[Clicks "Cancel" on pending/confirmed booking]
  ↓
[Modal shows cancellation policy:]
  ≥24h before pickup → "Free cancellation — full refund"
  <24h before pickup → "10% charge — 90% refund"
  ↓
[Customer enters reason → Confirms]
  ↓
[POST /bookings/{id}/cancel]
  ↓
[System:]
  - booking.status = "cancelled"
  - Calculate refund based on hours to pickup
  - Credit refund to customer wallet
  - sync_vehicle_availability()
  - Notify customer + manager

MANAGER CANCELLATION:
[Manager cancels a confirmed booking]
  ↓
[POST /bookings/{id}/manager-cancel]
  ↓
[System:]
  - booking.status = "cancelled"
  - Customer gets 100% refund
  - Customer gets fine: max(₹500, 10% of booking amount)
  - Manager acceptance_rate -= 5%
  - Notify both parties

AUTO-EXPIRY (Pending booking, pickup passed):
[Customer calls GET /bookings/]
  ↓
[System checks: any pending bookings where pickup_datetime < now?]
  ↓
[For each expired pending booking:]
  - booking.status = "cancelled" with reason "[EXPIRED]"
  - Customer gets full refund
  - If booking was made ≥24h before pickup: manager gets fine too
  - Notify customer
```

---

## FLOW 10 — Review System

```
[Trip completed]
  ↓
[2 hours later: Celery sends review request email]
  ↓
[Customer visits /booking/review/:id]
  ↓
[Can write 2 reviews:]
  1. customer_to_vehicle (shown on vehicle detail page)
  2. customer_to_manager (updates manager's average_rating)
  ↓
[POST /reviews]
  ↓
[System: Save to MongoDB reviews collection]
[System: Update vehicle.average_rating in MySQL]
[System: Update manager_profile.average_rating in MySQL]
[System: Notify manager of new review]
  ↓
[Manager can reply: POST /reviews/{booking_id}/manager-reply]
  ↓
[Review visible on:]
  - Vehicle detail page (customer_to_vehicle reviews)
  - Homepage live reviews scroll (recent customer_to_vehicle)
  - Booking details page (all reviews for that booking)
  - Customer's /dashboard/reviews page
```

---

## FLOW 11 — Notification System

```
[Any significant event occurs:]
  - Booking created/accepted/rejected/cancelled/completed
  - KYC approved/rejected
  - Payment received
  - Review received
  - Manager reply to review
  ↓
[System: create_notification() → Insert into MongoDB notifications collection]
  ↓
[NotificationBell in dashboard header:]
  - Polls GET /notifications/unread-count (cached in Redis for 30s)
  - Shows badge with unread count
  ↓
[User clicks bell → Dropdown with recent notifications]
[User visits /customer/notifications → Full list with filters]
  ↓
[Actions:]
  - Click notification → Mark as read + navigate to action_url
  - Click ✕ → DELETE /notifications/{id} → Remove from list
  - "Mark all read" → PATCH /notifications/mark-all-read
  - "Clear all" → DELETE /notifications/all
```

---

## FLOW 12 — Admin Platform Management

```
[Admin logs in → /admin/dashboard]
  ↓
[Dashboard shows:]
  - Total users, vehicles, bookings, revenue
  - Active bookings count
  - Pending KYC count
  - Open support tickets
  - Revenue charts (monthly/weekly)
  ↓
[Admin actions:]

  USERS:
  /admin/users → Customers tab / Vehicle Managers tab
  → Suspend / Reactivate users
  → Create new Vehicle Manager account

  VEHICLES:
  /admin/vehicles/manage → Pending approval queue
  → Approve → vehicle goes live
  → Reject with reason → manager notified

  KYC:
  /admin/kyc → Pending KYC queue
  → Approve / Reject with reason

  COUPONS:
  /admin/coupons → Create / Edit / Activate / Deactivate
  → Max 5% discount enforced

  SUPPORT:
  /admin/support → All tickets
  → Update status (open → in_progress → resolved)
  → Add admin reply

  ANALYTICS:
  Revenue by month, bookings by status, new users trend,
  city distribution, top vehicles by trips
```

---

## Summary Diagram Structure for draw.io

**Recommended layout: Left-to-right swimlane**

```
┌─────────────────────────────────────────────────────────────────┐
│ CUSTOMER    │ Register → Verify OTP → Login → Browse → Book → Pay → Track → Review │
├─────────────────────────────────────────────────────────────────┤
│ MANAGER     │ Register → List Vehicle → Accept Booking → Start Trip → End Trip → Payout │
├─────────────────────────────────────────────────────────────────┤
│ ADMIN       │ Approve KYC → Approve Vehicle → Manage Users → Analytics → Coupons │
├─────────────────────────────────────────────────────────────────┤
│ SYSTEM      │ MySQL ←→ MongoDB ←→ Redis ←→ Celery (Email) ←→ File Storage │
└─────────────────────────────────────────────────────────────────┘
```

**Key decision diamonds to include:**
- Is user logged in? (booking flow)
- Is KYC approved? (booking gate)
- Is vehicle available? (availability check)
- Is auto_accept enabled? (booking status)
- Hours to pickup ≥ 24? (cancellation policy)
- active_bookings < total_units? (fleet availability)
- Is OTP correct? (registration)
- Is refresh token valid? (auth flow)
