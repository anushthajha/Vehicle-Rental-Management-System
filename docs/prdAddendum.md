# PRD Addendum Prompt — Vehicle Rental Management System
## Additions to the Zoomcar Clone Prompt

> **Context:** This document is a **precise addendum** to the 15-phase Zoomcar Clone prompt. Every instruction here adds, modifies, or replaces something from that prompt to satisfy the attached Vehicle Rental Management PRD exactly. Feed this to your AI coding assistant **after** the base Zoomcar prompt, phase by phase. Where this document contradicts the Zoomcar prompt, **this document wins.**

---

## GAP ANALYSIS — What PRD Adds That Zoomcar Prompt Lacks

| PRD Requirement | Status in Zoomcar Prompt | What This Addendum Does |
|---|---|---|
| 3-role RBA: Customer / Vehicle Manager / Admin | Zoomcar has guest/host/admin — semantics differ, Vehicle Manager is a distinct managed role | Full role rename + distinct permission matrix |
| Vehicle Manager as a platform-managed role (not self-serve host) | Zoomcar hosts self-register and self-serve | Vehicle Manager is created/assigned by Admin, has a dedicated separate dashboard |
| Admin manages Vehicle Managers (create, assign, suspend) | Zoomcar admin cannot create host accounts | Admin user-management extended with CRUD for Vehicle Managers |
| Admin manages vehicle categories (CRUD) | Zoomcar has fixed enum categories | Dynamic vehicle category system managed by Admin |
| Customer role: explicit rental status tracking UI | Partially covered | Dedicated "Track Rental Status" page with live status timeline |
| Vehicle Manager: vehicle CRUD fully owned by manager (not admin-approved listing) | Zoomcar requires admin approval for every car | Manager-owned listings, admin oversees but doesn't gate every listing |
| Revenue statistics in Admin dashboard | Partially covered | Explicit revenue stats widget with breakdown |
| Rental statistics in Vehicle Manager dashboard | Partially covered | Explicit rental stats section on manager dashboard |
| Vehicle availability overview in Vehicle Manager dashboard | Partially in host dashboard | Dedicated availability overview widget |
| Booking history dedicated page for Customer | In Zoomcar as "My Bookings" tab | Explicit "Rental History" page as separate route |
| Proper folder structure + clean code explicitly required | Implied | Explicit folder structure spec + code quality gates |
| Vehicle type as a first-class searchable/filterable field | In Zoomcar as category | Must be a separate filterable field with Admin-managed list |
| Brand as a first-class searchable/filterable field | In Zoomcar as make | Must be a separate filterable field |
| Search by vehicle name/model (text search) | Supported but not highlighted | Explicit text search endpoint and UI |
| managerId on Vehicle table (Vehicle Manager owns vehicles) | Zoomcar has host_id | Must be managerId referencing Vehicle Manager users |
| phoneNumber in User model | In Zoomcar as phone | Explicitly required in User schema |

---

## ADDENDUM PHASE A — Role Architecture Overhaul

### Prompt

```
You are a senior backend architect. The system must implement a STRICT 3-role RBAC system exactly as defined in the PRD. Modify or replace the role system from the base Zoomcar prompt.

=== THE THREE ROLES ===

1. CUSTOMER (was: guest)
   - Self-registers via /auth/register
   - Default role on registration
   - Can: browse vehicles, search/filter, view details, book vehicles, cancel own bookings,
     view booking history, track rental status

2. VEHICLE_MANAGER (was: host — but fundamentally different)
   - CANNOT self-register as Vehicle Manager
   - Account is CREATED BY ADMIN or PROMOTED by Admin from an existing Customer account
   - Can: full CRUD on vehicles they own (managerId = their user id), update availability,
     manage rental pricing, view bookings for their vehicles, approve or reject rental requests
   - Cannot: access admin panel, manage other managers' vehicles, manage users

3. ADMIN (unchanged name, expanded powers)
   - Can: everything
   - Specifically: manage users (Customer + Vehicle Manager), create/promote Vehicle Manager accounts,
     suspend/delete accounts, monitor all bookings, view platform statistics,
     manage vehicle categories (CRUD), access full analytics

=== ROLE ENUM CHANGE ===

In backend/app/models/user.py, change the role Enum:
  FROM: Enum('guest', 'host', 'admin')
  TO:   Enum('customer', 'vehicle_manager', 'admin')

Update ALL references throughout the codebase:
- All SQLAlchemy models
- All Pydantic schemas
- All FastAPI dependencies
- All frontend Zustand store state
- All frontend route guards
- All seed data

=== UPDATED AUTH DEPENDENCIES (backend/app/utils/auth.py) ===

Remove: require_host()
Remove: require_verified_user() (keep for KYC but rename context)

Add these dependencies (all raise HTTPException with clear messages):

async def require_customer(current_user: User = Depends(get_current_active_user)) -> User:
    """Allows only role='customer'. Used for booking actions."""
    if current_user.role not in ('customer', 'admin'):  # admin can impersonate
        raise HTTPException(403, detail="Customer access required.")
    return current_user

async def require_vehicle_manager(current_user: User = Depends(get_current_active_user)) -> User:
    """Allows only role='vehicle_manager'."""
    if current_user.role != 'vehicle_manager' and current_user.role != 'admin':
        raise HTTPException(403, detail="Vehicle Manager access required.")
    return current_user

async def require_admin(current_user: User = Depends(get_current_active_user)) -> User:
    """Allows only role='admin'."""
    if current_user.role != 'admin':
        raise HTTPException(403, detail="Admin access required.")
    return current_user

async def require_any_authenticated(current_user: User = Depends(get_current_active_user)) -> User:
    """Any logged-in user, any role."""
    return current_user

=== PERMISSION MATRIX ===

Implement this permission matrix exactly. Every route must check against it.

| Action | Customer | Vehicle Manager | Admin |
|--------|----------|-----------------|-------|
| Browse vehicles (public) | ✅ | ✅ | ✅ |
| Search/filter vehicles | ✅ | ✅ | ✅ |
| View vehicle details | ✅ | ✅ | ✅ |
| Book a vehicle | ✅ | ❌ | ❌ |
| Cancel own booking | ✅ | ❌ | ❌ |
| View own booking history | ✅ | ❌ | ❌ |
| Track rental status | ✅ | ❌ | ❌ |
| Add vehicle listing | ❌ | ✅ | ✅ |
| Edit own vehicle | ❌ | ✅ (own only) | ✅ (any) |
| Delete own vehicle | ❌ | ✅ (own only, no active bookings) | ✅ (any) |
| Update vehicle availability | ❌ | ✅ (own only) | ✅ |
| View bookings for own vehicles | ❌ | ✅ | ✅ |
| Approve/Reject booking request | ❌ | ✅ (own vehicles) | ✅ |
| Manage all users | ❌ | ❌ | ✅ |
| Create Vehicle Manager account | ❌ | ❌ | ✅ |
| Promote Customer → Vehicle Manager | ❌ | ❌ | ✅ |
| Suspend any account | ❌ | ❌ | ✅ |
| View platform statistics | ❌ | ❌ | ✅ |
| View rental statistics (own) | ❌ | ✅ | ✅ |
| Manage vehicle categories | ❌ | ❌ | ✅ |
| Access Admin Panel | ❌ | ❌ | ✅ |
| Access Manager Dashboard | ❌ | ✅ | ✅ (read-only view) |

=== FRONTEND ROUTE GUARDS ===

Replace host-related guards with:

// frontend/src/components/guards/CustomerRoute.jsx
// Redirects to /auth/login if not logged in
// Redirects to /unauthorized if role != customer

// frontend/src/components/guards/VehicleManagerRoute.jsx
// Redirects to /unauthorized if role != vehicle_manager

// frontend/src/components/guards/AdminRoute.jsx
// Redirects to /unauthorized if role != admin

// frontend/src/components/guards/PrivateRoute.jsx
// Any authenticated user (all roles) — used for profile, settings etc.

// frontend/src/pages/UnauthorizedPage.jsx
// Shows "You don't have permission to access this page."
// Contextual: shows what role is needed and how to get it
// Link back to their appropriate dashboard

=== LOGIN REDIRECT BY ROLE ===

After successful login, redirect based on role:
  customer       → /customer/dashboard
  vehicle_manager → /manager/dashboard
  admin          → /admin/dashboard

In frontend/src/context/AuthContext.jsx:
  const redirectAfterLogin = (role) => {
    const destinations = {
      customer: '/customer/dashboard',
      vehicle_manager: '/manager/dashboard',
      admin: '/admin/dashboard'
    }
    navigate(destinations[role] || '/')
  }

=== NAVBAR ROLE AWARENESS ===

Navbar renders different menus per role:

Customer nav:
  Logo | Browse Vehicles | How It Works  ...  🔔 | [Customer Avatar ▼]
  Avatar dropdown: My Dashboard | My Bookings | Rental History | Track Rental | Wallet | KYC | Support | Logout

Vehicle Manager nav:
  Logo | My Vehicles | Bookings | Availability  ...  🔔 | [Manager Avatar ▼]
  Avatar dropdown: Manager Dashboard | My Vehicles | Booking Requests | Rental Statistics | Profile | Logout
  Manager badge: small "Manager" pill in red beside name

Admin nav:
  Logo | Dashboard | Users | Vehicles | Bookings | Analytics  ...  🔔 | [Admin Avatar ▼]
  Avatar dropdown: Admin Dashboard | User Management | Vehicle Categories | Analytics | Profile | Logout
  Admin badge: "Admin" pill in dark red

Logged-out nav:
  Logo | Browse Vehicles | How It Works | Become a Manager (→ contact page)  ...  [Login] [Register]
```

---

## ADDENDUM PHASE B — Vehicle Manager Role System

### Prompt

```
You are a senior backend engineer. Implement the complete Vehicle Manager account lifecycle as defined by the PRD. Vehicle Managers are NOT self-registering users — they are created or promoted by the Admin.

=== BACKEND: Admin Creates Vehicle Manager ===

POST /api/admin/vehicle-managers/create
  Requires: admin role
  Body: {full_name, email, phone, password, send_welcome_email: bool}
  
  Logic:
  - Validate email not already used
  - Hash password
  - Create User with role='vehicle_manager', is_verified=True (admin-verified)
  - Create ManagerProfile (see model below)
  - Create UserWallet
  - If send_welcome_email=True: send welcome email with credentials
  - Log activity: "Admin created Vehicle Manager account for {email}"
  Return: {user_id, message: "Vehicle Manager account created successfully."}

POST /api/admin/vehicle-managers/promote/{user_id}
  Requires: admin role
  Body: {confirm: true}
  
  Logic:
  - Verify user exists and role='customer'
  - Change role to 'vehicle_manager'
  - Create ManagerProfile if not exists
  - Send email: "Your account has been upgraded to Vehicle Manager"
  - Log activity
  Return: {message: "User {name} promoted to Vehicle Manager."}

POST /api/admin/vehicle-managers/demote/{user_id}
  Requires: admin role
  Body: {reason}
  
  Logic:
  - Verify role='vehicle_manager'
  - If has active vehicles with active/confirmed bookings: 400 error with list of blocking bookings
  - Set role='customer'
  - Remove ManagerProfile (soft: keep for records, add is_active=False)
  - Send email notification to user
  Return: {message: "Vehicle Manager demoted to Customer."}

GET /api/admin/vehicle-managers
  Query: search, is_active, page, limit
  Return: list of vehicle managers with stats (total_vehicles, active_bookings, total_revenue)

GET /api/admin/vehicle-managers/{user_id}
  Return: full manager profile + vehicles list + booking stats + revenue

PATCH /api/admin/vehicle-managers/{user_id}/suspend
  Body: {reason}
  - Set is_active=False
  - Notify manager via email + notification
  - All manager's vehicles: set is_available=False temporarily

PATCH /api/admin/vehicle-managers/{user_id}/reactivate
  - Set is_active=True
  - Manager must manually re-activate their vehicles

=== NEW MySQL MODEL: manager_profiles ===

Add to backend/app/models/manager.py:

Table: manager_profiles
- id: String(36) PK
- user_id: String(36) FK(users.id) UNIQUE
- assigned_by: String(36) FK(users.id)  — admin who created/promoted
- department: String(100) nullable  — e.g. "Fleet Management Mumbai"
- assigned_at: DateTime default now
- bio: Text nullable
- total_vehicles: Integer default 0
- total_bookings_handled: Integer default 0
- total_revenue_generated: DECIMAL(12,2) default 0
- average_vehicle_rating: DECIMAL(3,2) default 0
- acceptance_rate: DECIMAL(5,2) default 0
- response_time_avg_hours: DECIMAL(5,2) nullable
- is_active: Boolean default True
- payout_bank_name: String(200) nullable
- payout_account_number: String(50) nullable
- payout_ifsc: String(20) nullable
- payout_account_holder: String(200) nullable

Note: Vehicle Manager payout works same as host payout in Zoomcar prompt.
The HostProfile table from the Zoomcar prompt is RENAMED to manager_profiles with these fields.

=== UPDATE Vehicle model: managerId ===

In backend/app/models/car.py:
RENAME field: host_id → manager_id
Update FK reference: FK(users.id) → must reference a user with role='vehicle_manager'
Add DB-level comment or validator: check user role at application layer on insert

In ALL API routes and queries:
- Replace host_id with manager_id
- Replace host-related filters with manager-related

=== BACKEND: Manager Profile APIs ===

GET /api/manager/profile  (vehicle_manager only)
PATCH /api/manager/profile  (vehicle_manager only) — update bio, department, bank details

GET /api/manager/stats  (vehicle_manager only)
Return: {
  total_vehicles: N,
  active_vehicles: N,
  total_bookings: N,
  pending_requests: N,
  active_rentals: N,
  completed_rentals: N,
  total_revenue: X,
  this_month_revenue: X,
  acceptance_rate: X,
  avg_vehicle_rating: X,
  recent_bookings: [...last 5...]
}

=== FRONTEND: Vehicle Manager Dashboard ===

Route: /manager/dashboard
Guard: VehicleManagerRoute

Layout: Dedicated sidebar layout (DIFFERENT from customer layout, DIFFERENT from admin)
Sidebar color scheme: dark blue (#1E3A5F) with white text + red accents

Sidebar navigation items:
  🏠 Dashboard (overview)
  🚗 My Vehicles
  📋 Booking Requests
  📅 Availability Overview
  📊 Rental Statistics
  👤 My Profile
  💰 Earnings & Payouts
  🚪 Logout

=== MANAGER DASHBOARD OVERVIEW PAGE ===
Route: /manager/dashboard

Welcome header: "Welcome back, {name}" + Manager badge chip

Stats row (5 cards):
  Card 1: My Vehicles (total count)
    - Sub: Active: N | Inactive: N
    - Icon: car icon
  
  Card 2: Pending Requests
    - Sub: Awaiting your approval
    - Icon: clock icon, RED if > 0
    - Click → /manager/bookings?tab=pending
  
  Card 3: Active Rentals
    - Sub: Currently on the road
    - Icon: route icon, GREEN
    - Click → /manager/bookings?tab=active
  
  Card 4: This Month Revenue
    - Sub: Net after platform fee
    - Icon: rupee/currency icon
  
  Card 5: Acceptance Rate
    - Sub: Last 30 days
    - Icon: check-circle, color-coded (green ≥85%, yellow 70-84%, red <70%)

Rental Statistics Chart (Recharts):
  - Bar chart: Monthly bookings last 6 months
  - Two bars per month: Approved vs Rejected
  - Toggle: show by bookings count or by revenue

Vehicle Availability Overview Widget:
  - Mini calendar (current month) showing:
    * Each vehicle row + availability cells per day
    * Color coded: 🟢 available, 🔴 booked, 🟡 partially
    * Filter: "All vehicles" or select specific vehicle
    * Click a date → see which booking is occupying that slot

Booking Requests Table (last 5 pending):
  Customer | Vehicle | Dates | Duration | Amount | [Accept] [Reject]
  "View all requests" link

My Vehicles Quick List (top 4):
  Image | Name | Status badge | Rating | This month trips
  "View all vehicles" link

=== MANAGER: MY VEHICLES PAGE ===
Route: /manager/vehicles

Filter tabs: All | Active | Inactive | Pending Admin Review (if approval needed)

Vehicle table/grid (manager can toggle grid or list view):
  Grid view: vehicle card with:
    - Primary image
    - Vehicle name + year + brand
    - Type badge + Fuel badge
    - ₹{price}/day
    - Rating (if any) + trips count
    - Status toggle (Available / Unavailable)
    - Actions: Edit | View Bookings | Delete | Block Dates
  
  List view: compact table with same data + sortable columns

"+ Add New Vehicle" button (prominent, top-right)
  → /manager/vehicles/add

=== MANAGER: BOOKING REQUESTS PAGE ===
Route: /manager/bookings

Tabs: Pending (badge N) | Upcoming | Active | Completed | Cancelled | All

Pending Request Card (full detail, not compact):
  - Customer: avatar + name + "KYC Verified" badge + member since
  - Vehicle: image + name
  - Pickup date → Return date + Duration calculation
  - Total booking amount + Manager earnings highlighted
  - Guest notes (if any)
  - "Request expires in X hours" (24h window from creation)
  - [Accept Request] (green button, full) | [Reject Request] (red outline)
  - Reject → modal with required reason: dropdown + optional custom note
    Reason options: "Dates conflict", "Vehicle maintenance scheduled",
    "Customer requirements not met", "Vehicle no longer available", "Other"

For non-pending bookings: show status badge + view details
For active bookings: [Mark Trip Started] + [Mark Trip Completed] buttons

=== MANAGER: AVAILABILITY OVERVIEW PAGE ===
Route: /manager/availability

Full calendar view (month/week toggle):
  - Multi-vehicle availability grid
  - Left column: vehicle names
  - Right: calendar cells per vehicle per day
  - Color coding: Green (available) | Red (booked, shows customer initials) | Gray (blocked)
  - Click any cell: popup with booking details or "Block this date" option
  - "Block Dates" form: select vehicle, date range, reason
  - "Unblock" on blocked dates

=== MANAGER: RENTAL STATISTICS PAGE ===
Route: /manager/statistics

Date range filter (7d | 30d | 3m | 6m | 1y | custom)

Charts (all Recharts):
  1. Revenue Trend: area chart, monthly, per vehicle breakdown (stacked)
  2. Bookings By Status: donut chart (approved/rejected/cancelled/completed)
  3. Top Performing Vehicles: horizontal bar chart (by trips count + revenue)
  4. Average Rental Duration: bar chart by vehicle (avg days per booking)

Stats summary table:
  Vehicle | Total Bookings | Completed | Cancelled | Revenue | Avg Rating | Avg Duration

Export: [Download CSV Report] button
```

---

## ADDENDUM PHASE C — Dynamic Vehicle Category System (Admin-Managed)

### Prompt

```
You are a senior full-stack engineer. Replace the hardcoded vehicle category enum with a fully dynamic, Admin-managed vehicle category system. This is explicitly required by the PRD: "Admin → Manage vehicle categories."

=== NEW MySQL MODEL: vehicle_categories ===

Add to backend/app/models/vehicle_category.py:

Table: vehicle_categories
- id: String(36) PK
- name: String(100) unique not null  — e.g. "SUV", "Sedan", "Hatchback"
- slug: String(100) unique indexed  — e.g. "suv", "sedan" (auto-generated, lowercase-hyphenated)
- description: String(500) nullable
- icon_name: String(100) nullable  — lucide-react icon name, e.g. "Car", "Truck", "Zap"
- display_order: Integer default 0  — controls order in UI dropdowns and homepage grid
- is_active: Boolean default True
+ TimestampMixin

=== ALSO ADD: vehicle_types table (separate from category) ===

The PRD distinguishes "vehicle type" (physical classification: Bike, Car, Van, Truck, etc.) 
from category (market segment: Hatchback, Sedan, SUV, etc.).

Table: vehicle_types
- id: String(36) PK
- name: String(100) unique not null  — e.g. "Car", "Bike", "Van", "Truck", "Bus", "Scooter"
- slug: String(100) unique indexed
- description: String(500) nullable
- is_active: Boolean default True
+ created_at

=== UPDATE Vehicle model ===

In backend/app/models/car.py, replace:
  REMOVE: category Enum column (hardcoded)
  ADD: 
    category_id: String(36) FK(vehicle_categories.id) nullable
    vehicle_type_id: String(36) FK(vehicle_types.id) nullable

Keep: all other fields unchanged.

Add relationships:
  category = relationship("VehicleCategory", back_populates="vehicles")
  vehicle_type = relationship("VehicleType", back_populates="vehicles")

=== BACKEND: Category & Type CRUD APIs ===

All in backend/app/routers/categories.py

--- VEHICLE CATEGORIES ---

GET /api/categories (public)
  Return: all active categories ordered by display_order
  Include: vehicle count per category
  Cache in Redis: TTL 10 minutes (changes infrequently)

GET /api/categories/{category_id} (public)
  Return: category detail + vehicles in this category (paginated)

POST /api/admin/categories (admin only)
  Body: {name, description, icon_name, display_order}
  - Auto-generate slug from name (lowercase, spaces→hyphens, strip special chars)
  - Check slug uniqueness
  Return: created category

PATCH /api/admin/categories/{category_id} (admin only)
  Body: {name, description, icon_name, display_order, is_active}
  - If deactivating: check no active vehicles use this category, else 400 with vehicle list

DELETE /api/admin/categories/{category_id} (admin only)
  - Hard delete only if 0 vehicles use it
  - If vehicles use it: 400 "Cannot delete — N vehicles use this category. Reassign first."

PATCH /api/admin/categories/reorder (admin only)
  Body: [{category_id, display_order}]
  - Bulk update display_order for drag-and-drop reordering in admin UI

--- VEHICLE TYPES ---

GET /api/vehicle-types (public)
  Return: all active vehicle types
  Cache: Redis TTL 10 minutes

POST /api/admin/vehicle-types (admin only)
PATCH /api/admin/vehicle-types/{type_id} (admin only)
DELETE /api/admin/vehicle-types/{type_id} (admin only)

=== BACKEND: Update Vehicle Search to Use Dynamic Categories ===

In GET /api/vehicles (search endpoint):
  Replace: category Enum filter
  Add: category_id filter (array, multi-select: ?category_id=id1,id2)
  Add: vehicle_type_id filter (array: ?vehicle_type_id=id1,id2)
  
  Also add text search:
  Add: q parameter for full-text search on vehicle_name + brand + model + description
  Implementation: MySQL LIKE '%{q}%' across those fields (or FULLTEXT index if preferred)

=== FRONTEND: Dynamic Categories ===

Replace all hardcoded category arrays with API-fetched data:

frontend/src/hooks/useVehicleCategories.js:
  - React Query hook: GET /api/categories
  - staleTime: 10 minutes (matches backend cache)
  - Returns: {categories, vehicleTypes, isLoading, error}

frontend/src/hooks/useVehicleTypes.js:
  - React Query hook: GET /api/vehicle-types

Update these components to use hooks instead of hardcoded arrays:
  - SearchPage FilterSidebar: category filter checkboxes (dynamic)
  - SearchPage FilterSidebar: vehicle type filter (NEW — add this filter)
  - ListVehiclePage (was ListCarPage): category + vehicle_type selectors
  - HomePage browse-by-category section: fetched from API, not hardcoded
  - CarDetailPage: shows dynamic category + type labels

=== ADMIN: Vehicle Categories Management Page ===

Route: /admin/categories
Add to Admin sidebar: "🏷️ Categories" menu item (between Cars and Coupons)

Frontend page: frontend/src/pages/admin/AdminCategoriesPage.jsx

Layout: two-panel — left side = Categories, right side = Vehicle Types

CATEGORIES PANEL:
  Header: "Vehicle Categories" + [+ Add Category] button

  Category list (drag-and-drop sortable with dnd-kit):
    Each row: 
      ⠿ (drag handle) | Icon preview | Name | Vehicles count | Status toggle | [Edit] [Delete]
    
    Inactive category: grayed out, badge "Inactive"

  Add/Edit Category Modal:
    - Name input (required)
    - Slug preview (auto-generated, read-only, editable if needed)
    - Description textarea (optional)
    - Icon selector:
      * Grid of 20+ lucide-react icons to choose from: Car, Truck, Zap, Ship, Bike, Bus, Navigation...
      * Preview of selected icon in real-time
    - Display order input (number)
    - Active toggle
    [Save Category]

  Delete confirmation modal:
    If has vehicles: show "N vehicles use this category. Delete anyway or reassign?"
    Reassign option: dropdown to pick another category + [Reassign & Delete] button

VEHICLE TYPES PANEL:
  Header: "Vehicle Types" + [+ Add Type] button
  Simple list: Name | Slug | Status toggle | [Edit] [Delete]
  Add/Edit modal: Name, Description, Active toggle

Both panels show last modified date + "Changes reflect immediately across the platform"
```

---

## ADDENDUM PHASE D — Three Separate, Fully Distinct Dashboards

### Prompt

```
You are a senior frontend engineer. Build THREE completely distinct dashboard experiences — one per role. They must be visually and functionally different. No shared layout between roles. Each has its own sidebar, color scheme, navigation, and data.

=== IMPORTANT: RENAME ALL "HOST" REFERENCES ===

The PRD uses "Vehicle Manager" not "Host". In ALL frontend files:
- Replace "host" → "manager" in variable names, component names, file names
- Replace "Host Dashboard" → "Manager Dashboard"  
- Replace "List Your Car" → "Add Vehicle"
- Replace "/host/*" routes → "/manager/*"
- Replace "HostRoute" → "VehicleManagerRoute"
- Replace "become-a-host" → "become-a-manager" (or remove if not needed)

=== DASHBOARD 1: CUSTOMER DASHBOARD ===
Route: /customer/dashboard
Guard: CustomerRoute (role='customer' only)
Color scheme: White + Zoomcar Red (#E31837) accents + light gray backgrounds
Layout: Top navigation bar (no sidebar on desktop, bottom tab bar on mobile)

Top nav (desktop, within dashboard): 
  Logo | [Overview] [My Bookings] [Rental History] [Track Rental] [Wallet] [KYC]

Overview section content:

WELCOME BANNER:
  "Hello, {name}! 👋" 
  KYC status inline: 
  - Not done → amber banner "Complete KYC to start booking vehicles → [Complete KYC]"
  - Approved → small green badge "✓ KYC Verified"
  - Under review → blue badge "KYC Under Review"

STATS ROW (4 cards, horizontal):
  1. Active Rentals — count with car icon
  2. Upcoming Rentals — count with calendar icon  
  3. Completed Trips — lifetime count
  4. Wallet Balance — ₹X,XXX with quick "Add Money" link

ACTIVE RENTALS SECTION:
  If any bookings with status='active':
    Show rental cards (not just a list):
    Card content:
      - Vehicle image (left) + vehicle name + type + manager name
      - Status: "🟢 In Progress"
      - Pickup date + Return date + "X days remaining" countdown chip
      - [Track Status] button → opens /customer/track/{booking_id}
      - [Get Help] button
    
  If no active rentals:
    Illustration + "No active rentals. Ready for your next trip?" + [Browse Vehicles]

UPCOMING RENTALS SECTION:
  Show next 3 confirmed/pending bookings:
  Each card:
    - Vehicle image + name
    - Dates + Duration
    - Status badge (Pending Approval / Confirmed)
    - "Starts in X days" chip
    - [View Details] | [Cancel] buttons
  
  Empty state: "No upcoming bookings."

RECENT ACTIVITY FEED:
  Last 5 booking events (created, status changes, payments):
  Each: icon + description + time ago
  e.g. "✅ Booking JPSN... confirmed" — 2 hours ago
  e.g. "💳 Payment ₹1,250 processed" — 2 hours ago

=== CUSTOMER: BOOKING HISTORY PAGE ===
Route: /customer/bookings/history
(This is the PRD's explicit "Rental History" — a dedicated route, not just a tab)

Page title: "My Rental History"
Subtitle: "All your past and present vehicle rentals"

Filter bar:
  - Status filter: All | Pending | Approved | Active | Completed | Cancelled
  - Date range: From → To (date pickers)
  - Vehicle type: dropdown (fetched from /api/vehicle-types)
  - Sort: Newest First | Oldest First

Booking history card (each):
  - Vehicle image (thumbnail, 80×80)
  - Vehicle name + brand + type
  - Booking Ref: JPSN... (copyable)
  - Dates: 📅 {pickup} → {return} + "{N} days"
  - Total Amount: ₹X,XXX
  - Status badge (colored):
    * Pending: yellow
    * Approved/Confirmed: blue
    * Active: green (pulsing dot)
    * Completed: gray
    * Cancelled: red
  - [View Details] button
  - [Track Status] button (only for active/approved)
  - [Write Review] button (only for completed, not yet reviewed)
  - [Book Again] button (only for completed — re-fills booking form with same vehicle)

Pagination: 10 per page with numbered pages

=== CUSTOMER: TRACK RENTAL STATUS PAGE ===
Route: /customer/track/:bookingId
(PRD explicitly requires "Track rental status" as a customer feature)

This is a DEDICATED TRACKING PAGE — not just the booking details page.

TRACKING HEADER:
  - Booking Ref: JPSNABC123 (large, copyable)
  - Vehicle: [image] Honda City 2022
  - Manager: {manager_name} (with avatar)

STATUS TIMELINE (vertical stepper, animated):

  Step 1: 🔵 Booking Submitted
    - Timestamp: {created_at}
    - "Your rental request has been sent to the vehicle manager."
  
  Step 2: ⏳/✅/❌ Manager Review
    - If pending: "Awaiting manager approval" (with spinner)
    - If approved: ✅ "Approved by {manager_name}" + {approved_at}
    - If rejected: ❌ "Rejected by manager" + reason shown + "Book another vehicle" CTA
  
  Step 3: 💳 Payment
    - If approved but not paid: "Complete payment to confirm your booking" + [Pay Now] button
    - If paid: ✅ "Payment of ₹{amount} confirmed" + transaction ID
  
  Step 4: 🚗 Trip Active
    - If not yet: grayed out
    - If active: ✅ "Trip started" + actual_pickup_time
      Show: "Return by: {return_datetime}" + countdown timer (days:hours:minutes)
  
  Step 5: 🏁 Trip Completed
    - If not yet: grayed out
    - If completed: ✅ "Trip completed" + {actual_return_time}
      Show: [Write a Review] CTA if no review yet

TRIP DETAILS CARD (below timeline):
  - Vehicle: image + full details
  - Dates: Pickup → Return + duration
  - Pickup location
  - Total paid + breakdown

EMERGENCY CONTACT (during active rental):
  - Manager phone number (shown only during active rental)
  - "Contact Support" button → opens support ticket pre-filled with booking_ref

=== DASHBOARD 2: VEHICLE MANAGER DASHBOARD ===
(Already specified in Addendum Phase B — add these specifics)

Color scheme: Dark blue sidebar (#1E3A5F), white content, teal/green accents for stats

Route structure:
  /manager/dashboard        → ManagerDashboardPage (overview)
  /manager/vehicles         → ManagerVehiclesPage
  /manager/vehicles/add     → AddVehiclePage
  /manager/vehicles/:id/edit → EditVehiclePage
  /manager/bookings         → ManagerBookingsPage
  /manager/availability     → ManagerAvailabilityPage
  /manager/statistics       → ManagerStatisticsPage
  /manager/profile          → ManagerProfilePage
  /manager/earnings         → ManagerEarningsPage
  /manager/payouts          → ManagerPayoutsPage

Sidebar component: frontend/src/components/layout/ManagerSidebar.jsx
  - Logo (white version on dark sidebar)
  - User avatar + name + "Vehicle Manager" role badge
  - Navigation links (with active state highlight in teal)
  - "Help & Support" link at bottom
  - Version/build info at very bottom

All manager pages must use ManagerLayout.jsx which wraps with this sidebar.
ManagerLayout is completely separate from CustomerLayout and AdminLayout — no shared code.

=== DASHBOARD 3: ADMIN DASHBOARD ===
(Already specified in Zoomcar Addendum Phase 11 — add these specifics)

Color scheme: Dark gray sidebar (#111827), white content, red accents
Route: /admin/dashboard (prefix /admin/* for all admin routes)

Add to Admin sidebar (NEW items from PRD):
  🏷️ Vehicle Categories (NEW — between Vehicles and Bookings)
  👥 Vehicle Managers (NEW — between Users and Analytics, shows manager list)

Admin User Management MUST show separate tabs:
  Tabs: Customers | Vehicle Managers | All Users

The "Vehicle Managers" tab shows:
  - Manager name | Email | Assigned by | Vehicles Count | Active Bookings | Revenue | Status
  - Actions: View Details | Suspend | Demote to Customer
  - [+ Create Vehicle Manager] button (top right of this tab)

Add "Revenue Statistics" widget to Admin Dashboard Overview:
  Revenue card (new, prominent):
  - Total platform revenue (all time)
  - This month's revenue  
  - Platform fee collected vs host payouts
  - Revenue trend mini-chart (Recharts sparkline)
  - Revenue breakdown donut: Platform fees / Manager payouts / Refunds issued

=== SHARED COMPONENTS — DO NOT SHARE LAYOUTS ===

These CAN be shared (UI components only, no layout):
  - VehicleCard (CarCard renamed)
  - StarRating
  - StatusBadge
  - DateRangePicker
  - FileUpload
  - Toast notifications
  - Modal/Dialog wrappers

These MUST NOT be shared:
  - Sidebar components (each role has its own)
  - Dashboard layout wrappers
  - Navigation components
  - Dashboard overview pages

=== ROUTE ARCHITECTURE (Complete, Role-separated) ===

// PUBLIC (no auth)
/                          → HomePage
/vehicles                  → VehicleListingPage (was SearchPage)
/vehicles/:vehicleId       → VehicleDetailPage
/categories/:categorySlug  → CategoryPage (dynamic, from DB)
/vehicle-types/:typeSlug   → VehicleTypePage
/auth/login                → LoginPage
/auth/register             → RegisterPage
/auth/verify-email         → EmailVerificationPage
/auth/forgot-password      → ForgotPasswordPage
/auth/reset-password       → ResetPasswordPage
/how-it-works              → HowItWorksPage
/safety                    → SafetyPage
/insurance                 → InsurancePage
/about                     → AboutPage
/contact                   → ContactPage
/terms                     → TermsPage
/privacy                   → PrivacyPage
/refund-policy             → RefundPage
/unauthorized              → UnauthorizedPage

// CUSTOMER (role='customer' required)
/customer/dashboard        → CustomerDashboard
/customer/bookings         → CustomerBookingsPage (active + upcoming)
/customer/bookings/history → RentalHistoryPage ← PRD EXPLICIT REQUIREMENT
/customer/bookings/:id     → CustomerBookingDetailPage
/customer/track/:bookingId → TrackRentalPage ← PRD EXPLICIT REQUIREMENT
/customer/wallet           → WalletPage
/customer/kyc              → KYCPage
/customer/profile          → CustomerProfilePage
/customer/notifications    → NotificationsPage
/customer/support          → SupportPage
/customer/wishlist         → WishlistPage
/booking/confirm/:vehicleId → BookingConfirmPage
/booking/pay/:bookingId    → PaymentPage
/booking/success           → BookingSuccessPage
/booking/review/:bookingId → WriteReviewPage

// VEHICLE MANAGER (role='vehicle_manager' required)
/manager/dashboard         → ManagerDashboard
/manager/vehicles          → ManagerVehiclesPage
/manager/vehicles/add      → AddVehiclePage
/manager/vehicles/:id      → ManagerVehicleDetailPage
/manager/vehicles/:id/edit → EditVehiclePage
/manager/bookings          → ManagerBookingsPage
/manager/availability      → ManagerAvailabilityPage
/manager/statistics        → ManagerStatisticsPage
/manager/earnings          → ManagerEarningsPage
/manager/payouts           → ManagerPayoutsPage
/manager/profile           → ManagerProfilePage

// ADMIN (role='admin' required)
/admin/dashboard           → AdminDashboard
/admin/users               → AdminUsersPage (with Customer/Manager tabs)
/admin/users/managers      → AdminVehicleManagersPage ← NEW
/admin/users/managers/create → CreateManagerPage ← NEW
/admin/vehicles            → AdminVehiclesPage
/admin/categories          → AdminCategoriesPage ← NEW (PRD explicit)
/admin/bookings            → AdminBookingsPage
/admin/payments            → AdminPaymentsPage
/admin/support             → AdminSupportPage
/admin/coupons             → AdminCouponsPage
/admin/analytics           → AdminAnalyticsPage
/admin/payouts             → AdminPayoutsPage
*                          → NotFoundPage
```

---

## ADDENDUM PHASE E — Availability Management (PRD Specific)

### Prompt

```
You are a senior full-stack engineer. The PRD specifically calls out "Availability Management" as a named module. Implement it fully with these exact requirements.

=== PRD Availability Requirements ===
- Vehicle availability tracking
- Booking date validation  
- Prevent overlapping bookings
- Rental duration calculation

=== BACKEND: Availability Service ===

Create backend/app/services/availability.py

This is a STANDALONE SERVICE used by multiple routers. All availability logic lives here.

class AvailabilityService:

  @staticmethod
  async def check_vehicle_available(
      vehicle_id: str,
      pickup_date: datetime,
      return_date: datetime,
      db: AsyncSession,
      exclude_booking_id: str = None  # for extension requests
  ) -> tuple[bool, str]:
      """
      Returns: (is_available: bool, reason: str)
      
      Checks in order:
      1. Vehicle exists and is_available=True → else False, "Vehicle not available"
      2. Vehicle is_approved=True → else False, "Vehicle pending approval"
      3. No existing confirmed/active/pending booking overlaps:
         EXISTS (SELECT 1 FROM bookings WHERE vehicle_id=? 
                 AND status IN ('pending','approved','active')
                 AND id != exclude_booking_id
                 AND pickup_date < :return_date 
                 AND return_date > :pickup_date)
         → if exists: False, "Vehicle is booked during this period"
      4. No availability_block overlaps
         → if exists: False, "Vehicle blocked during this period"
      5. All checks pass → True, "Available"
      """

  @staticmethod
  async def get_vehicle_availability_calendar(
      vehicle_id: str,
      year: int,
      month: int,
      db: AsyncSession
  ) -> list[dict]:
      """
      Returns list of {date, status, booking_id, customer_name} for every day in month.
      status options: 'available' | 'booked' | 'blocked' | 'pending'
      booked/pending: include booking reference
      """

  @staticmethod
  def calculate_rental_duration(
      pickup_date: datetime,
      return_date: datetime
  ) -> dict:
      """
      Returns:
      {
        total_hours: float,
        total_days: int,          # ceiling of hours/24
        full_days: int,           # integer days
        remaining_hours: float,   # hours beyond full_days
        duration_label: str       # "2 days 4 hours" human readable
      }
      """

  @staticmethod
  async def get_next_available_date(
      vehicle_id: str,
      from_date: datetime,
      db: AsyncSession
  ) -> datetime:
      """
      Find the next date this vehicle is available (for UX hints).
      Look at bookings ordered by return_date DESC, find gaps.
      """

  @staticmethod
  async def get_vehicle_unavailable_dates(
      vehicle_id: str,
      months_ahead: int = 3,
      db: AsyncSession
  ) -> list[str]:
      """
      Returns list of date strings (YYYY-MM-DD) that are unavailable.
      Used by frontend calendar to disable date selection.
      """

=== BACKEND: Availability API Routes ===

Add to backend/app/routers/availability.py:

GET /api/vehicles/{vehicle_id}/availability
  Query: year (int), month (int, 1-12)
  Uses: AvailabilityService.get_vehicle_availability_calendar()
  Return: {vehicle_id, year, month, days: [{date, status, booking_ref}]}
  Cache: Redis TTL 60s (short, changes with bookings)

GET /api/vehicles/{vehicle_id}/availability/check
  Query: pickup_date (ISO8601), return_date (ISO8601)
  Uses: AvailabilityService.check_vehicle_available()
  Return: {available: bool, reason: str, price_breakdown: {...} (if available)}
  Use case: real-time check as user selects dates in booking widget

GET /api/vehicles/{vehicle_id}/availability/next-available
  Query: from_date (ISO8601, default=today)
  Return: {next_available_date: str, message: str}
  Use case: "Next available from {date}" hint on vehicle cards

GET /api/vehicles/{vehicle_id}/unavailable-dates
  Query: from_date, to_date (default: today + 90 days)
  Return: {unavailable_dates: ["2024-12-25", ...]}
  Use case: Calendar date picker disabling

=== BOOKING CREATION: STRENGTHEN DATE VALIDATION ===

In POST /api/bookings, add these validations in order (return specific 400 errors):

1. pickup_date must be datetime, not just date — validate ISO8601 with time component
2. return_date must be after pickup_date
3. Duration minimum: pickup → return must be >= vehicle.min_trip_hours (default 4)
4. Duration maximum: <= vehicle.max_trip_days * 24 hours
5. pickup_date must be >= now + 1 hour (not in the past, with 1hr buffer)
6. Call AvailabilityService.check_vehicle_available() — return specific reason on failure
7. Cross-customer validation: same customer cannot have two overlapping bookings on any vehicle

Each validation failure returns:
  {
    "detail": "VALIDATION_ERROR",
    "field": "pickup_date",  // or relevant field
    "message": "Human readable message",
    "code": "OVERLAP_CONFLICT" | "PAST_DATE" | "TOO_SHORT" | etc.
  }

=== RENTAL DURATION DISPLAY: Use AvailabilityService.calculate_rental_duration ===

Everywhere a duration is shown, use the service's calculation:
- Booking confirm page: "Total duration: 2 days 4 hours"
- Booking details: same
- Manager booking requests: duration in the card
- Search results booking widget: live update as dates change

=== FRONTEND: Date Picker Integration ===

In VehicleDetailPage and BookingConfirmPage date pickers:

1. On vehicle detail page load: fetch /api/vehicles/:id/unavailable-dates
   → Disable those dates in the react-datepicker (using excludeDates prop or highlightDates)

2. As user selects pickup date:
   → Re-fetch unavailable dates relative to pickup_date
   → Minimum return date = pickup + 4 hours

3. As user selects both dates:
   → Call GET /api/vehicles/:id/availability/check?pickup_date=...&return_date=...
   → If not available: show error inline "This vehicle is booked from {date} to {date}"
   → If available: show price preview from response

4. In the calendar on VehicleDetailPage:
   → Color coding:
     🟢 Available (white/light green)
     🔴 Booked (light red with "Booked" tooltip)
     🟡 Pending booking (light yellow)
     ⬜ Past date (gray, disabled)
   → "Next available: {date}" shown below calendar if selected range is unavailable

=== MANAGER: AVAILABILITY MANAGEMENT ===

Managers can block/unblock dates from:
  a) The Availability Overview page (/manager/availability)
  b) The Edit Vehicle page (blocked dates section)
  c) Quick action from the Vehicle card ("Block Dates" button)

Block Dates form (available in all 3 places):
  - Vehicle selector (if accessed from overview; pre-selected if from vehicle card)
  - Date range: From → To (date pickers)
  - Reason: Select (Maintenance | Personal Use | Repair | Inspection | Other) + optional note
  - [Block These Dates] button → POST /api/vehicles/:id/block-dates

Existing blocks listed below form:
  Each: From → To | Reason | [Remove Block] button

On [Remove Block]: DELETE /api/vehicles/:id/block-dates/:blockId
  → Validate: only manager who owns the vehicle OR admin
  → Remove block
  → If previously unavailable dates are now free, update Redis availability cache
```

---

## ADDENDUM PHASE F — Explicit Search & Filter (PRD-Specified Fields)

### Prompt

```
You are a senior full-stack engineer. The PRD explicitly lists the exact search and filter fields required. Implement them precisely.

=== PRD SEARCH REQUIREMENTS ===
1. Search by vehicle name/model (text search)
2. Filter by: Vehicle type, Brand, Price range, Fuel type, Availability
3. Pagination for listings

These are IN ADDITION TO the Zoomcar prompt's existing filters (city, seats, transmission, features, rating, distance).

=== BACKEND: Enhanced Vehicle Search API ===

GET /api/vehicles (completely replace the search endpoint from Zoomcar prompt)

Query parameters (ALL optional, combinable):

TEXT SEARCH:
  q: string — search in vehicle_name, brand, model, description (MySQL LIKE or FULLTEXT)
  
PRD-REQUIRED FILTERS:
  vehicle_type: string[] — vehicle_type_id values (comma-separated)
  brand: string[] — brand values (comma-separated, e.g. "Honda,Toyota")
  fuel_type: string[] — petrol|diesel|electric|hybrid|cng
  availability: bool — if true, only show is_available=True vehicles
  min_price: number — minimum price_per_day (₹)
  max_price: number — maximum price_per_day (₹)

ADDITIONAL FILTERS (from Zoomcar prompt, keep these):
  city: string
  category_id: string[] — vehicle_categories.id values
  transmission: string[] — manual|automatic
  seats: number[]
  features: string[] — ac,sunroof,gps,keyless,child_seat
  rating_min: number — minimum average_rating (3 or 4)
  lat, lng, radius_km: number — proximity filter

SORTING:
  sort_by: recommended|price_asc|price_desc|rating|most_booked|newest

DATE-BASED AVAILABILITY:
  pickup_date: ISO8601 datetime
  return_date: ISO8601 datetime
  (if provided, filter out vehicles with conflicting bookings)

PAGINATION:
  page: int (default 1)
  limit: int (default 12, max 50)

IMPLEMENTATION NOTES:
- Build query dynamically: start with base WHERE is_approved=True
- Apply each filter only if its parameter is present
- Text search: WHERE (vehicle_name LIKE '%{q}%' OR brand LIKE '%{q}%' OR model LIKE '%{q}%' OR description LIKE '%{q}%')
- Brand filter: case-insensitive exact match (normalize to lowercase for comparison)
- For vehicle_type and category: JOIN vehicle_types/vehicle_categories tables
- Availability filter: if availability=true, add AND is_available=True
- Date availability: add NOT EXISTS subquery (same as Zoomcar prompt)
- Log every search to MongoDB: log_search(user_id, params, result_count)

Return structure:
{
  vehicles: [...],
  total: N,
  page: N,
  pages: N,
  has_next: bool,
  has_prev: bool,
  applied_filters: {...},  // echo back what was applied
  brands_available: ["Honda", "Toyota", ...],  // for filter UI
  price_range: {min: X, max: X}  // from current result set
}

=== NEW ENDPOINT: Get All Brands ===

GET /api/vehicles/brands (public)
  Returns distinct brand values from vehicles table (is_approved=True only)
  Cache: Redis TTL 5 minutes
  Return: {brands: ["Honda", "Hyundai", "Maruti", ...]}
  Sorted alphabetically

This powers the Brand filter dropdown in the UI.

=== FRONTEND: Search & Filter Overhaul ===

Rename SearchPage → VehicleListingPage
Route: /vehicles (was /search)

Update FilterSidebar with ALL PRD-required filters:

FILTER SECTION ORDER (reordered to match PRD priority):

1. TEXT SEARCH (new — move search bar INTO filter sidebar, above all filters)
   - Search input: "Search by name, brand, or model..."
   - Debounced 300ms
   - Shows result count below input as user types

2. Availability (PRD explicit filter)
   - Single toggle: "Show Available Only" (default: ON)
   - When ON: only is_available=True vehicles shown
   - When OFF: all vehicles shown (with availability badges)

3. Vehicle Type (PRD explicit, now dynamic from API)
   - Checkbox group, fetched from GET /api/vehicle-types
   - e.g. Car ☐ | Bike ☐ | Van ☐ | Truck ☐ | Scooter ☐
   - Show vehicle count per type in parentheses

4. Brand (PRD explicit, dynamic from API)
   - Searchable checkbox list (input at top to filter brand names)
   - Fetch from GET /api/vehicles/brands
   - Show top 10, "Show more (+N)" to expand
   - e.g. ☐ Honda (24) | ☐ Hyundai (18) | ☐ Maruti (31)...

5. Category (dynamic from vehicle_categories API)
   - Icon grid (dynamic icons per category from category.icon_name)
   - Multi-select toggles

6. Price Range (₹/day)
   - Dual-handle slider
   - From API: use price_range.min and price_range.max from search response
     (so slider adapts to current result set)

7. Fuel Type (PRD explicit)
   - Checkboxes: Petrol | Diesel | Electric | Hybrid | CNG

8. Transmission
   - Radio: Any | Manual | Automatic

9. Seating Capacity
   - Checkboxes: 2 | 4 | 5 | 6 | 7 | 8+

10. Features
    - Checkboxes: AC | Sunroof | GPS Tracker | Keyless Entry | Child Seat | Music System

11. Rating
    - Radio: Any | 3+ Stars | 4+ Stars

12. Location (if lat/lng available from browser)
    - Distance slider: 5–50km

Filter state management:
  - ALL filter values live in URL search params (useSearchParams hook)
  - Changing any filter updates URL + re-fetches vehicles
  - Share URL = exact same results
  - "Active filter count" badge on mobile filter button updates live

=== VEHICLE LISTING PAGE: Additional PRD Requirements ===

PAGINATION:
  Implement BOTH infinite scroll AND numbered pagination:
  - Desktop: numbered pagination (1, 2, 3... Next →) at bottom
  - Mobile: "Load More" button (simpler for mobile UX)
  - Show: "Showing 1–12 of 142 vehicles"

AVAILABILITY BADGE ON VEHICLE CARD:
  Add to VehicleCard component:
  - If is_available=True: small green dot + "Available Now"
  - If is_available=False: small red dot + "Not Available"
  - If dates selected and vehicle conflicts: red overlay + "Not available for selected dates"

BRAND DISPLAY ON VEHICLE CARD:
  Show brand prominently on vehicle card:
  - Below vehicle name: "{Brand} · {Vehicle Type}"
  - e.g. "Honda · Sedan" or "Maruti · Hatchback"

SEARCH BAR (top of listing page, outside sidebar):
  Large search bar above results:
  - Text input: "Search vehicles, brands, models..."
  - City selector
  - Date pickers (optional, can search without dates)
  - [Search] button
  This syncs with the q parameter in sidebar too (bidirectional)
```

---

## ADDENDUM PHASE G — Complete Updated Seed Data (PRD-Aligned)

### Prompt

```
You are a backend engineer. Update backend/app/seed.py to reflect all PRD changes: 3 roles, Vehicle Managers (not self-serve hosts), dynamic categories, vehicle types, and Vehicle Manager-created vehicles.

=== STEP 1: Seed Vehicle Categories (MySQL, vehicle_categories table) ===

Create these 8 categories with icons:
1. name="Hatchback", slug="hatchback", icon_name="Car", display_order=1
2. name="Sedan", slug="sedan", icon_name="Car", display_order=2
3. name="SUV", slug="suv", icon_name="Truck", display_order=3
4. name="MUV", slug="muv", icon_name="Users", display_order=4
5. name="Luxury", slug="luxury", icon_name="Gem", display_order=5
6. name="Electric", slug="electric", icon_name="Zap", display_order=6
7. name="Convertible", slug="convertible", icon_name="Navigation", display_order=7
8. name="Minivan", slug="minivan", icon_name="Bus", display_order=8

=== STEP 2: Seed Vehicle Types (MySQL, vehicle_types table) ===

Create these vehicle types:
1. name="Car", slug="car"
2. name="Bike", slug="bike"  
3. name="Van", slug="van"
4. name="Truck", slug="truck"
5. name="Scooter", slug="scooter"
6. name="Bus", slug="bus"

Note: Most vehicles in seed data will use vehicle_type "Car"

=== STEP 3: Create Admin (same as before) ===
email: admin@zoomcar.com | password: Admin@1234 | role: admin

=== STEP 4: Create Vehicle Managers (NOT self-registered — Admin-created) ===

Create 5 Vehicle Manager accounts:
All with: role='vehicle_manager', is_verified=True, is_active=True
All with: manager_profile record (assigned_by = admin.id)

- Priya Sharma | priya@manager.com | Pass@1234 | Bengaluru | dept: "Fleet South"
  manager_profile: acceptance_rate=92%, avg_vehicle_rating=4.8, is_active=True
  
- Arjun Mehta | arjun@manager.com | Pass@1234 | Mumbai | dept: "Fleet West"
  manager_profile: acceptance_rate=88%, avg_vehicle_rating=4.7, is_active=True

- Kavitha Nair | kavitha@manager.com | Pass@1234 | Chennai | dept: "Fleet South-East"
  manager_profile: acceptance_rate=95%, avg_vehicle_rating=4.9, is_active=True

- Rohit Verma | rohit@manager.com | Pass@1234 | Delhi | dept: "Fleet North"
  manager_profile: acceptance_rate=85%, avg_vehicle_rating=4.5, is_active=True

- Sneha Patel | sneha@manager.com | Pass@1234 | Pune | dept: "Fleet West-Central"
  manager_profile: acceptance_rate=90%, avg_vehicle_rating=4.6, is_active=True

For each manager: create user_wallet (₹5000–₹15000), create user_kyc (status=approved)

=== STEP 5: Create Customer accounts ===

10 customers with role='customer' (not 'guest'):
All with: is_verified=True
email pattern: customer1@test.com through customer10@test.com
password: Customer@1234 for all
(NOT Guest@1234 — rename to match role)

Names: Amit Kumar, Divya Reddy, Rahul Singh, Ananya Das, Karan Mehta,
       Pooja Iyer, Vivek Sharma, Meera Nair, Siddharth Raj, Lakshmi Pillai

KYC: customer1-customer7 = approved, customer8-customer9 = under_review, customer10 = pending
Wallets: ₹200–₹3000

=== STEP 6: Create Vehicles (manager_id instead of host_id) ===

Use same 25 vehicles as Zoomcar prompt but:
- Replace host_id with manager_id
- Add category_id (FK to vehicle_categories seeded above)
- Add vehicle_type_id (FK to vehicle_types, all = "Car" type for these)
- Brand field: already exists in Zoomcar prompt as "make" — keep but also populate brand separately

Vehicle assignments by manager:
Priya → vehicles in Bengaluru (8 vehicles)
Arjun → vehicles in Mumbai (5 vehicles)
Kavitha → vehicles in Chennai (4 vehicles)  
Rohit → vehicles in Delhi (4 vehicles)
Sneha → vehicles in Pune (4 vehicles)

For each vehicle, map to category:
Swift → Hatchback category | Creta → SUV | Nexon EV → Electric | City → Sedan
Thar → SUV | Innova → MUV | Seltos → SUV | BMW 3 Series → Luxury
Baleno → Hatchback | Venue → SUV | Harrier → SUV | Hector → SUV
Mercedes GLA → Luxury | Dzire → Sedan | i20 → Hatchback | Fortuner → SUV
XUV700 → SUV | Kwid → Hatchback | Carens → MUV | Audi A4 → Luxury
Altroz → Hatchback | Tucson → SUV | Grand Vitara → SUV | Amaze → Sedan | Compass → SUV

=== STEP 7: Bookings — Update role references ===

Replace guest_id with customer_id in booking records.
Replace all "guest" terminology with "customer" in booking description fields.

Use customer1-customer7 (KYC approved) for all bookings.

Create same 20 bookings as Zoomcar prompt with corrected terminology.

=== STEP 8: Seed Default Credentials Table ===

Log all seeded credentials to a file at /app/seed_credentials.txt (only in development):

=== VEHICLE RENTAL MANAGEMENT SYSTEM — SEED CREDENTIALS ===
Generated: {timestamp}

ADMIN:
  Email: admin@zoomcar.com | Password: Admin@1234

VEHICLE MANAGERS:
  Email: priya@manager.com  | Password: Pass@1234 | City: Bengaluru
  Email: arjun@manager.com  | Password: Pass@1234 | City: Mumbai
  Email: kavitha@manager.com| Password: Pass@1234 | City: Chennai
  Email: rohit@manager.com  | Password: Pass@1234 | City: Delhi
  Email: sneha@manager.com  | Password: Pass@1234 | City: Pune

CUSTOMERS:
  Email: customer1@test.com | Password: Customer@1234 | KYC: Approved
  Email: customer2@test.com | Password: Customer@1234 | KYC: Approved
  ...
  Email: customer8@test.com | Password: Customer@1234 | KYC: Under Review
  Email: customer10@test.com| Password: Customer@1234 | KYC: Pending

VEHICLE CATEGORIES SEEDED: 8 (Hatchback, Sedan, SUV, MUV, Luxury, Electric, Convertible, Minivan)
VEHICLE TYPES SEEDED: 6 (Car, Bike, Van, Truck, Scooter, Bus)
VEHICLES SEEDED: 25 (across 5 cities)
BOOKINGS SEEDED: 20 (various statuses)
```

---

## ADDENDUM PHASE H — Terminology & Naming Overhaul (Entire Codebase)

### Prompt

```
You are a senior full-stack engineer doing a complete terminology audit. The PRD uses specific terms that must be reflected uniformly throughout the codebase. Do a global find-and-replace across all files.

=== MANDATORY TERMINOLOGY CHANGES ===

These are not optional — the PRD uses these exact terms and so must the UI, API, DB, and code.

| Old Term (Zoomcar prompt) | New Term (PRD) | Apply To |
|---------------------------|----------------|----------|
| Guest | Customer | UI labels, API response fields, DB column comments, email templates |
| Host | Vehicle Manager | UI labels, route names, component names, email templates |
| guest_id | customer_id | DB column names, API params, Pydantic schemas |
| host_id | manager_id | DB column names, API params, Pydantic schemas |
| List your car | Add Vehicle | UI button text, page titles |
| My Cars | My Vehicles | Page titles, nav items |
| Car | Vehicle | All user-facing strings (not code variable names where "car" is fine) |
| Booking ref | Rental ID | User-facing UI (the JPSN... reference shown to users) |
| Book Now | Rent Now | Button text on vehicle cards and detail page |
| Booking confirmation | Rental confirmation | Email subject lines, page titles |
| CarCard | VehicleCard | React component name and file name |
| CarDetailPage | VehicleDetailPage | React component and route |
| SearchPage | VehicleListingPage | React component and route |
| /search | /vehicles | URL route |
| /cars | /vehicles | URL route |
| /host/* | /manager/* | URL routes |
| is_host | is_vehicle_manager | DB boolean field on users table |
| host_profile | manager_profile | Variable names in code (table stays manager_profiles) |

=== WHAT NOT TO CHANGE ===

Keep "car" in:
- Internal Python variable names where it aids readability (e.g. car = await db.get(Vehicle, id))
- SQLAlchemy model class name (can rename to Vehicle if clean)
- Database column types (internal only)

=== APPLY CHANGES TO THESE FILES ===

Backend:
- All files in backend/app/models/
- All files in backend/app/schemas/
- All files in backend/app/routers/
- All files in backend/app/services/
- All email templates in backend/app/utils/email.py
- backend/app/seed.py

Frontend:
- All component names and file names
- All page titles (h1, h2, <title> tags via Helmet)
- All button text
- All nav item labels
- All empty state messages
- All toast notification messages
- All email content (from email templates)

=== ADDITIONAL NAMING CONVENTIONS ===

API response field rename (affects Pydantic schemas):
  In any response containing booking data, rename:
  - "host_name" → "manager_name"
  - "host_photo" → "manager_photo"
  - "host_rating" → "manager_rating"
  - "guest_name" → "customer_name"
  - "car_title" → "vehicle_name"
  - "car_id" → "vehicle_id"
  - "car_category" → "vehicle_category"

Note: Frontend must consume these renamed fields — update all Axios response handling.

=== README UPDATE ===

Update README.md:
- Title: "Vehicle Rental Management System" (not "Zoomcar Clone")
- Description: Use PRD language
- Credentials table: use new emails (priya@manager.com not priya@host.com, customer1@test.com not guest1@guest.com)
- Architecture section: mention 3 distinct dashboards
- Feature list: use PRD feature terms

=== FOLDER STRUCTURE (final, per PRD requirement) ===

The PRD explicitly requires "proper folder structure". Enforce this:

backend/app/
├── main.py
├── config.py
├── database.py          # MySQL
├── mongodb.py           # MongoDB
├── celery_app.py        # Celery config
├── models/
│   ├── __init__.py
│   ├── user.py          # User, UserKYC, EmailVerification, PasswordReset
│   ├── vehicle.py       # Vehicle (renamed from car.py), VehicleImage, AvailabilityBlock, PricingRule
│   ├── vehicle_category.py  # NEW: VehicleCategory, VehicleType
│   ├── booking.py       # Booking, BookingExtension
│   ├── payment.py       # Payment, UserWallet, WalletTransaction
│   ├── coupon.py        # Coupon, CouponUsage
│   ├── manager.py       # ManagerProfile (renamed from host.py)
│   ├── support.py       # SupportTicket
│   └── wishlist.py      # Wishlist
├── schemas/
│   ├── __init__.py
│   ├── auth.py          # RegisterSchema, LoginSchema, TokenSchema
│   ├── user.py          # UserResponse, ProfileUpdate
│   ├── vehicle.py       # VehicleCreate, VehicleUpdate, VehicleResponse, VehicleSearchParams
│   ├── category.py      # CategoryCreate, CategoryResponse, VehicleTypeResponse
│   ├── booking.py       # BookingCreate, BookingResponse, BookingStatusUpdate
│   ├── payment.py       # PaymentResponse, WalletResponse
│   ├── review.py        # ReviewCreate, ReviewResponse
│   ├── manager.py       # ManagerProfileResponse, ManagerStatsResponse
│   └── admin.py         # AdminUserResponse, AdminStatsResponse
├── routers/
│   ├── __init__.py
│   ├── auth.py
│   ├── users.py
│   ├── vehicles.py      # (renamed from cars.py)
│   ├── categories.py    # NEW
│   ├── availability.py  # NEW (standalone)
│   ├── bookings.py
│   ├── payments.py
│   ├── reviews.py
│   ├── notifications.py
│   ├── support.py
│   ├── wishlist.py
│   ├── manager.py       # Manager-specific routes
│   ├── kyc.py
│   └── admin.py
├── services/
│   ├── __init__.py
│   ├── availability.py  # NEW: AvailabilityService
│   ├── pricing.py       # Pricing calculation
│   ├── superhost.py     # Renamed: superManager.py
│   └── notifications.py # Notification dispatch service
├── mongo_models/
│   ├── __init__.py
│   ├── notification.py
│   ├── review.py
│   ├── support_message.py
│   ├── analytics.py
│   └── session.py
├── utils/
│   ├── __init__.py
│   ├── auth.py          # JWT, password hashing, role dependencies
│   ├── email.py         # All email templates and send functions
│   └── helpers.py       # generate_booking_ref, generate_slug, etc.
├── middleware/          # NEW folder — PRD requires explicit middleware
│   ├── __init__.py
│   ├── auth_middleware.py    # Attach user to request if token present
│   ├── error_handler.py     # Global exception handler → consistent error format
│   └── rate_limiter.py      # Redis-based rate limiting middleware
├── tasks.py             # Celery tasks
└── seed.py

frontend/src/
├── components/
│   ├── layout/
│   │   ├── Navbar.jsx           # Role-aware navbar
│   │   ├── Footer.jsx
│   │   ├── CustomerLayout.jsx   # Layout for customer pages
│   │   ├── ManagerLayout.jsx    # Layout for manager pages (own sidebar)
│   │   ├── AdminLayout.jsx      # Layout for admin pages (own sidebar)
│   │   ├── CustomerSidebar.jsx  # Customer dashboard sidebar (desktop)
│   │   ├── ManagerSidebar.jsx   # Manager sidebar (blue)
│   │   └── AdminSidebar.jsx     # Admin sidebar (dark)
│   ├── guards/
│   │   ├── PrivateRoute.jsx
│   │   ├── CustomerRoute.jsx    # role='customer' only
│   │   ├── VehicleManagerRoute.jsx  # role='vehicle_manager' only
│   │   ├── AdminRoute.jsx       # role='admin' only
│   │   └── GuestRoute.jsx       # logged-out only
│   ├── vehicle/
│   │   ├── VehicleCard.jsx      # Renamed from CarCard
│   │   ├── VehicleGrid.jsx
│   │   ├── VehicleSkeletonCard.jsx
│   │   └── VehicleImageGallery.jsx
│   ├── booking/
│   │   ├── BookingWidget.jsx
│   │   ├── PriceBreakdown.jsx
│   │   ├── BookingCard.jsx
│   │   └── StatusTimeline.jsx   # Used in TrackRentalPage
│   ├── search/
│   │   ├── SearchBar.jsx
│   │   └── FilterSidebar.jsx
│   ├── reviews/
│   │   └── ReviewCard.jsx
│   ├── notifications/
│   │   └── NotificationBell.jsx
│   └── ui/                      # Generic UI primitives
│       ├── StatusBadge.jsx
│       ├── StarRating.jsx
│       └── FileUpload.jsx
├── pages/
│   ├── public/                  # No auth required
│   │   ├── HomePage.jsx
│   │   ├── VehicleListingPage.jsx   # Renamed from SearchPage
│   │   ├── VehicleDetailPage.jsx    # Renamed from CarDetailPage
│   │   ├── CategoryPage.jsx
│   │   ├── HowItWorksPage.jsx
│   │   ├── AboutPage.jsx
│   │   ├── ContactPage.jsx
│   │   ├── TermsPage.jsx
│   │   ├── PrivacyPage.jsx
│   │   ├── RefundPage.jsx
│   │   └── NotFoundPage.jsx
│   ├── auth/
│   │   ├── LoginPage.jsx
│   │   ├── RegisterPage.jsx
│   │   ├── EmailVerificationPage.jsx
│   │   ├── ForgotPasswordPage.jsx
│   │   └── ResetPasswordPage.jsx
│   ├── customer/                # role='customer' only
│   │   ├── CustomerDashboard.jsx
│   │   ├── CustomerBookingsPage.jsx
│   │   ├── RentalHistoryPage.jsx    # PRD explicit
│   │   ├── TrackRentalPage.jsx      # PRD explicit
│   │   ├── CustomerBookingDetail.jsx
│   │   ├── WalletPage.jsx
│   │   ├── KYCPage.jsx
│   │   ├── CustomerProfilePage.jsx
│   │   ├── NotificationsPage.jsx
│   │   ├── SupportPage.jsx
│   │   └── WishlistPage.jsx
│   ├── booking/                 # Protected, accessible by customers
│   │   ├── BookingConfirmPage.jsx
│   │   ├── PaymentPage.jsx
│   │   ├── BookingSuccessPage.jsx
│   │   └── WriteReviewPage.jsx
│   ├── manager/                 # role='vehicle_manager' only
│   │   ├── ManagerDashboard.jsx
│   │   ├── ManagerVehiclesPage.jsx
│   │   ├── AddVehiclePage.jsx
│   │   ├── EditVehiclePage.jsx
│   │   ├── ManagerBookingsPage.jsx
│   │   ├── ManagerAvailabilityPage.jsx
│   │   ├── ManagerStatisticsPage.jsx
│   │   ├── ManagerEarningsPage.jsx
│   │   ├── ManagerPayoutsPage.jsx
│   │   └── ManagerProfilePage.jsx
│   └── admin/                   # role='admin' only
│       ├── AdminDashboard.jsx
│       ├── AdminUsersPage.jsx
│       ├── AdminVehicleManagersPage.jsx  # NEW
│       ├── CreateManagerPage.jsx         # NEW
│       ├── AdminVehiclesPage.jsx
│       ├── AdminCategoriesPage.jsx       # NEW (PRD explicit)
│       ├── AdminBookingsPage.jsx
│       ├── AdminPaymentsPage.jsx
│       ├── AdminSupportPage.jsx
│       ├── AdminCouponsPage.jsx
│       ├── AdminAnalyticsPage.jsx
│       └── AdminPayoutsPage.jsx
├── context/
│   └── AuthContext.jsx          # Zustand store + Axios interceptors
├── hooks/
│   ├── useVehicles.js           # React Query hook for vehicle search
│   ├── useVehicleCategories.js  # Dynamic categories
│   ├── useVehicleTypes.js       # Dynamic vehicle types
│   ├── useBrands.js             # Dynamic brand list
│   ├── useBookings.js
│   ├── useAvailability.js       # Availability checking hooks
│   ├── useNotifications.js
│   └── useWallet.js
├── services/
│   ├── api.js                   # Axios instance + interceptors
│   ├── authService.js
│   ├── vehicleService.js        # Renamed from carService
│   ├── bookingService.js
│   ├── paymentService.js
│   ├── reviewService.js
│   └── notificationService.js
└── utils/
    ├── validationSchemas.js     # All Zod schemas
    ├── formatters.js            # Currency, date, duration formatters
    ├── constants.js             # App-wide constants
    └── helpers.js               # Misc helpers
```

---

## ADDENDUM PHASE I — Error Handling & Middleware (PRD Explicit)

### Prompt

```
You are a senior backend engineer. The PRD explicitly requires "Middleware (auth, validation, error handling)". Implement all three properly.

=== 1. Auth Middleware (backend/app/middleware/auth_middleware.py) ===

class OptionalAuthMiddleware(BaseHTTPMiddleware):
    """
    Runs on EVERY request.
    If Authorization header present: validate token, attach user to request.state.user
    If no token or invalid: request.state.user = None (not 401 — let route handlers decide)
    
    This allows public routes to optionally know who's calling
    (e.g. search results can check wishlist status if logged in).
    """
    
    async def dispatch(self, request: Request, call_next):
        token = request.headers.get("Authorization", "").replace("Bearer ", "")
        request.state.user = None
        if token:
            try:
                payload = verify_token(token)
                user_id = payload.get("sub")
                # Attach minimal user info without DB hit (use JWT claims)
                request.state.user = {
                    "id": user_id,
                    "role": payload.get("role"),
                    "email": payload.get("email")
                }
            except:
                pass  # Invalid token → treat as unauthenticated
        response = await call_next(request)
        return response

=== 2. Error Handler Middleware (backend/app/middleware/error_handler.py) ===

Implement a global exception handler that returns CONSISTENT JSON error responses.

ALL errors must return this exact format:
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",        // e.g. "VALIDATION_ERROR", "NOT_FOUND", "UNAUTHORIZED"
    "message": "Human readable", // Safe to show to user
    "details": {...}             // Optional: field-level errors for validation
  },
  "request_id": "uuid"           // For debugging, generated per request
}

Map these exceptions to HTTP codes and error codes:
  ValueError → 400 VALIDATION_ERROR
  HTTPException(400) → 400 BAD_REQUEST
  HTTPException(401) → 401 UNAUTHORIZED
  HTTPException(403) → 403 FORBIDDEN
  HTTPException(404) → 404 NOT_FOUND
  HTTPException(409) → 409 CONFLICT
  SQLAlchemyError → 500 DATABASE_ERROR (log full error, return generic message)
  RequestValidationError (Pydantic) → 422 VALIDATION_ERROR with field details
  Exception (unhandled) → 500 INTERNAL_ERROR (log full traceback, return generic)

NEVER expose stack traces in production responses.
Log all 5xx errors with: request_id, path, method, user_id, error type, traceback.

=== 3. Rate Limiter Middleware (backend/app/middleware/rate_limiter.py) ===

Redis-based rate limiting. Apply per-endpoint:

Rate limit configs:
  POST /api/auth/login → 5 attempts per minute per IP
  POST /api/auth/register → 3 per minute per IP
  POST /api/auth/forgot-password → 2 per 5 minutes per email
  POST /api/auth/resend-verification → 1 per minute per email
  GET /api/vehicles (search) → 60 per minute per user/IP
  POST /api/bookings → 5 per minute per user

Implementation:
  Key pattern: "rate:{endpoint_identifier}:{identifier}" 
  (identifier = user_id if authenticated, else IP)
  INCR key in Redis, EXPIRE = window in seconds
  If count > limit: return 429 Too Many Requests with Retry-After header

=== 4. Validation Middleware (backend/app/middleware/) ===

FastAPI handles Pydantic validation automatically, but add custom validators:

In backend/app/utils/validators.py:
  validate_phone(phone: str) → str:
    Strip +91 prefix, must be 10 digits, raise ValueError if not
  
  validate_registration_number(reg: str) → str:
    Indian format: 2 letters + 2 digits + 1-2 letters + 4 digits (e.g. KA01MN1234)
    Raise ValueError if format doesn't match
  
  validate_ifsc(ifsc: str) → str:
    Exactly 11 chars, first 4 alpha, 5th is '0', last 6 alphanumeric
    Raise ValueError if invalid
  
  validate_aadhar(aadhar: str) → str:
    Strip spaces, must be exactly 12 digits
    Raise ValueError if invalid
  
  validate_booking_dates(pickup: datetime, return_dt: datetime) → None:
    Raises ValueError with specific message for each rule violation

Register these validators as Pydantic field validators in relevant schemas.

=== 5. Register All Middleware in main.py ===

In app/main.py, register middleware IN THIS ORDER (order matters):
  1. CORSMiddleware (first, always)
  2. OptionalAuthMiddleware (runs on every request)  
  3. Error handler (via @app.exception_handler decorators)
  
Rate limiting: apply via FastAPI Depends on specific routes, not as global middleware
(cleaner than middleware for per-route configs).

=== 6. Frontend Error Handling ===

Update frontend/src/services/api.js Axios instance:

Add response interceptor that handles the new error format:
  
  axios.interceptors.response.use(
    (response) => response.data,  // Auto-unwrap .data
    (error) => {
      const errorData = error.response?.data
      
      // Extract message from new error format
      const message = errorData?.error?.message || 
                       errorData?.detail || 
                       "Something went wrong. Please try again."
      
      const code = errorData?.error?.code
      const details = errorData?.error?.details
      
      // Handle specific codes
      if (code === 'UNAUTHORIZED' || error.response?.status === 401) {
        // Trigger token refresh (already handled by auth interceptor)
      }
      if (code === 'FORBIDDEN') {
        // Navigate to /unauthorized
      }
      
      // Throw enriched error for React Query / components to catch
      throw { message, code, details, status: error.response?.status }
    }
  )

In React Query setup (frontend/src/main.jsx):
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: (failureCount, error) => {
          // Don't retry on 400/401/403/404
          if ([400, 401, 403, 404].includes(error.status)) return false
          return failureCount < 2
        },
        onError: (error) => {
          toast.error(error.message)  // Global error toast
        }
      }
    }
  })
```

---

## Quick Reference: Updated Credentials (PRD-Aligned)

| Role | Email | Password | Notes |
|------|-------|----------|-------|
| Admin | admin@zoomcar.com | Admin@1234 | Full access, all dashboards |
| Vehicle Manager 1 | priya@manager.com | Pass@1234 | Bengaluru, 8 vehicles |
| Vehicle Manager 2 | arjun@manager.com | Pass@1234 | Mumbai, 5 vehicles |
| Vehicle Manager 3 | kavitha@manager.com | Pass@1234 | Chennai, 4 vehicles |
| Vehicle Manager 4 | rohit@manager.com | Pass@1234 | Delhi, 4 vehicles |
| Vehicle Manager 5 | sneha@manager.com | Pass@1234 | Pune, 4 vehicles |
| Customer 1 (KYC ✓) | customer1@test.com | Customer@1234 | Can book vehicles |
| Customer 2 (KYC ✓) | customer2@test.com | Customer@1234 | Has active bookings |
| Customer 8 (KYC pending) | customer8@test.com | Customer@1234 | Cannot book |

---

## Addendum Execution Order

Feed these phases to your AI assistant IN THIS ORDER, after completing all 15 phases of the base Zoomcar prompt:

| Addendum Phase | What It Changes | Priority |
|---|---|---|
| A | 3-role RBAC, role enum, dependencies, login redirect | 🔴 CRITICAL — do first |
| B | Vehicle Manager role system, ManagerProfile model, Manager Dashboard | 🔴 CRITICAL |
| C | Dynamic vehicle categories + vehicle types (Admin-managed) | 🔴 CRITICAL |
| D | Three separate dashboards, route architecture, Track Rental page | 🔴 CRITICAL |
| E | Availability management module (PRD named feature) | 🟡 HIGH |
| F | PRD-specified search fields: brand, vehicle type, availability filter | 🟡 HIGH |
| G | Updated seed data (3 roles, manager-created vehicles, dynamic categories) | 🟡 HIGH |
| H | Terminology overhaul: Customer/Vehicle Manager/Vehicle throughout | 🟡 HIGH |
| I | Middleware: auth + error handling + rate limiting + validation | 🟠 MEDIUM |

---

## Final Checklist (PRD Requirements Verification)

After building, verify every PRD requirement is met:

### Authentication & Roles
- [ ] 3-role system: Customer / Vehicle Manager / Admin — all in DB
- [ ] JWT login returns role in token payload
- [ ] Each role redirected to their own dashboard after login
- [ ] Vehicle Manager cannot self-register — only Admin can create
- [ ] Admin can promote Customer → Vehicle Manager
- [ ] Admin can demote Vehicle Manager → Customer
- [ ] Admin can suspend any account

### Customer Features (PRD Section: "Customer Features")
- [ ] Browse available vehicles (public page)
- [ ] Search by vehicle name/model (text search with q param)
- [ ] Filter by: vehicle type, brand, price range, fuel type, availability
- [ ] View vehicle details page
- [ ] Book/rent vehicles (requires KYC)
- [ ] Cancel bookings (with policy)
- [ ] View booking history (/customer/bookings/history)
- [ ] Track rental status (/customer/track/:bookingId — with live timeline)

### Vehicle Manager Features (PRD Section: "Vehicle Manager Features")
- [ ] Add vehicle listings (full CRUD — Create, Read, Update, Delete)
- [ ] Update vehicle availability (toggle + block dates)
- [ ] Manage rental pricing (price per day + pricing rules)
- [ ] View bookings for their vehicles (Manager Bookings page)
- [ ] Approve or reject rental requests (with reason)

### Admin Features (PRD Section: "Admin Features")
- [ ] Manage users: Customers (suspend/activate)
- [ ] Manage Vehicle Managers (create, promote, demote, suspend)
- [ ] Monitor all bookings and rentals
- [ ] View platform statistics (revenue, bookings, users, vehicles)
- [ ] Manage vehicle categories (CRUD with drag-and-drop reorder)

### Vehicle Module (PRD Section: "Vehicle Module")
- [ ] vehicle name/model field
- [ ] brand field (searchable/filterable)
- [ ] vehicle type field (dynamic, Admin-managed, filterable)
- [ ] registration number
- [ ] rental price per day
- [ ] fuel type
- [ ] seating capacity
- [ ] availability status
- [ ] vehicle images (multi-image upload)
- [ ] description

### Booking Module (PRD Section: "Booking Module")
- [ ] customer details in booking
- [ ] vehicle details in booking
- [ ] pickup date
- [ ] return date
- [ ] booking status
- [ ] total rental amount
- [ ] All 5 statuses: Pending / Approved / Active / Completed / Cancelled

### Availability Management (PRD Section: "Availability Management")
- [ ] Vehicle availability tracking (is_available + calendar)
- [ ] Booking date validation (pickup < return, no past dates)
- [ ] Prevent overlapping bookings (DB-level check + service layer)
- [ ] Rental duration calculation (hours + days breakdown)

### Search & Filters (PRD Section: "Search & Filters")
- [ ] Search by vehicle name/model (q param)
- [ ] Filter by vehicle type (dynamic)
- [ ] Filter by brand (dynamic from DB)
- [ ] Filter by price range
- [ ] Filter by fuel type
- [ ] Filter by availability (show only available)
- [ ] Pagination for listings

### Dashboards (PRD Section: "Dashboard")
- [ ] Customer Dashboard: active rentals, booking history, upcoming rentals, rental status tracking
- [ ] Vehicle Manager Dashboard: listed vehicles, booking requests, rental statistics, vehicle availability overview
- [ ] Admin Dashboard: total users, total vehicles, active bookings, revenue statistics

### Backend Requirements (PRD Section: "Backend Requirements")
- [ ] Auth APIs: signup, login, profile
- [ ] Vehicle APIs: full CRUD
- [ ] Booking APIs: create, list, update status, cancel
- [ ] Availability APIs: check, calendar, block/unblock
- [ ] User management APIs: admin CRUD on all users
- [ ] Auth middleware (JWT validation on protected routes)
- [ ] Validation middleware (Pydantic + custom validators)
- [ ] Error handling middleware (consistent JSON format)
- [ ] Proper folder structure (per Addendum Phase H)
- [ ] Environment variables (.env.example complete)

### Database Design (PRD Section: "Database Design")
- [ ] User: name, email, password (hashed), role, phoneNumber ✓
- [ ] Vehicle: managerId, vehicleName, brand, vehicleType, registrationNumber, rentalPricePerDay, fuelType, seatingCapacity, availabilityStatus, images, description ✓
- [ ] Booking: customerId, vehicleId, pickupDate, returnDate, totalAmount, status, createdAt ✓

### Frontend Requirements (PRD Section: "Frontend Requirements")
- [ ] Responsive UI (mobile + desktop) ✓
- [ ] React components (functional components + hooks) ✓
- [ ] React Router v6 routing ✓
- [ ] State management (Zustand) ✓
- [ ] Login/Register pages ✓
- [ ] Dashboard (3 separate dashboards) ✓
- [ ] Vehicle Listings page ✓
- [ ] Vehicle Details page ✓
- [ ] Booking Management ✓
- [ ] Rental History (dedicated page) ✓
- [ ] Admin Panel ✓

### Deployment (PRD Section: "Deployment")
- [ ] Docker for frontend ✓
- [ ] Docker for backend ✓
- [ ] docker-compose up --build starts everything ✓

### Code Quality (PRD Section: "Expectations")
- [ ] Clean, readable, modular code
- [ ] Proper folder structure (enforced in Addendum Phase H)
- [ ] Proper validation and error handling (Addendum Phase I)
- [ ] Prevent overlapping vehicle bookings (Addendum Phase E)
- [ ] REST API best practices (proper HTTP verbs, status codes, error format)




directly open the dashboard when a user logins, if the user is customer->customer dashboard,if vehicle manager->vehicle manager dashboard, if admin->admin dashboard, the landing page should only be visible when someone opens the website and has not logined/registered,after that that user's dashboard, and there the navbar of all the other things opened for that particular user,only left side navbar,remove the top navbar,and everywhere make the name of the application as SigFleet, design a logo for the same in red and grey colour,keep the colour of dashboard and navbar uniform in every user's login

Task Progress — SigFleet Route Resolution & Overhaul
[ ] Fix Broken Routes
[ ] Admin Payments page: search, status filter, and refund modal
[ ] Manager Statistics page: handle promise rejection, dynamic range query, and backend filter
[ ] Admin Sidebar Cleanup
[ ] Group "Customers" and "Vehicle Managers" under expandable "Users" submenu in Sidebar.jsx
[ ] Remove duplicate standalone "Vehicle Managers" top-level link
[ ] Customer Sidebar Persistence
[ ] Wrap /vehicles (VehicleListingPage) inside DashboardShell for logged-in Customers
[ ] Audit details /vehicles/:carId and /wishlist to persist sidebar layout for Customers
[ ] Confirm Manager and Admin layouts never lose sidebar on navigation
[ ] Landing Page Search Box Styling
[ ] Make search box span full width of the hero section in HomePage.jsx
[ ] Align inputs and search button on a responsive single row (stack vertically on mobile)
[ ] Animated Car Logo
[ ] Implement animated SVG car in SigFleetLogo.jsx with spinning wheels and speed lines
[ ] Verify consistent rendering across landing, sidebars, and dashboards
[ ] Real Car Images Seeding
[ ] Update seed.py with matched high-quality Unsplash URLs for all 25 models
[ ] Add database cleaning routine in seed.py and run a fresh seed to populate
[ ] Final Verification
[ ] Run frontend build to ensure zero compiling errors
[ ] Verify all routes end-to-end under each role login

# Implementation Plan — SigFleet Overhaul & Route Resolution

This plan details a systematic approach to resolve routing failures, structural sidebar duplication, layout wrapping persistence, landing page visual clipping, logo animation, and database car image seeding.

---

## User Review Required

> [!IMPORTANT]
> The database seed script `app/seed.py` will be modified to support a `--force` or automatic database cleaning phase. This ensures that the newly mapped high-quality, exact-match Unsplash car images are populated correctly without duplicate primary key conflicts.

---

## Proposed Changes

### 1. Fix Broken Routes

#### `/admin/payments` (Admin Payments Page)
- **Problem:** Currently, the page renders a static table with no search or filter controls. The user request specifies that "filters work".
- **Proposed Solution:** 
  - Add search and status filter inputs to the [AdminPaymentsPage](file:///Users/as-mac-1196/Desktop/gen%20AI/sigFleet/frontend/src/pages/admin/AdminDataPages.jsx).
  - Implement a search text field (filters client-side by booking reference or user name).
  - Implement a status dropdown (filters backend queries by selected payment status: Paid, Refunded, Failed, Created).
  - Ensure the "Manual Refund" action and modal function correctly.

#### `/manager/statistics` (Manager Statistics Page)
- **Problem:** Page gets stuck in a perpetual loading spinner if any of the API calls fail, and date range filters are static.
- **Proposed Solution:** 
  - Update `ManagerStatisticsPage.jsx` to load stats using a robust `Promise.all` with individual catch blocks for stats and car-level earnings.
  - Pass the active `range` filter value (e.g. `7d`, `30d`, `3m`, `6m`, `1y`) as a query parameter (`?range=30d`) to the backend `/manager/stats` endpoint.
  - Update `backend/app/routers/manager.py` to parse the `range` query parameter and compute dynamic totals and revenue based on the selected period (e.g. 7 days, 30 days, etc.).

---

### 2. Admin Sidebar Restructuring
- **Problem:** "Vehicle Managers" is duplicated inside the Admin sidebar (listed both under "Users" and as a standalone item at the top level).
- **Proposed Solution:** 
  - Modify [Sidebar.jsx](file:///Users/as-mac-1196/Desktop/gen%20AI/sigFleet/frontend/src/components/layout/Sidebar.jsx).
  - Group "Customers" (`/admin/users`) and "Vehicle Managers" (`/admin/users/managers`) under a single, expandable "Users" sub-navigation menu.
  - Remove the top-level standalone link for "Vehicle Managers".
  - Use simple React state (`usersExpanded`) initialized to `true` if the current path starts with `/admin/users` to handle smooth expansion/collapsing.

---

### 3. Sidebar Layout Wrapper Audits
- **Problem:** Customer sidebar disappears when navigating to `/vehicles` (VehicleListingPage), `/vehicles/:carId` (VehicleDetailPage), and other customer-facing pages.
- **Proposed Solution:** 
  - Wrap the pages dynamically inside `DashboardShell` if the logged-in user is a customer.
  - Audit `ManagerLayout` and `AdminLayout` to ensure no manager or admin views ever lose their respective sidebars.

---

### 4. Hero Search Box Layout
- **Problem:** Search container is constrained in width, causing the search button to clip on desktop and overflow.
- **Proposed Solution:** 
  - Modify [HomePage.jsx](file:///Users/as-mac-1196/Desktop/gen%20AI/sigFleet/frontend/src/pages/HomePage.jsx).
  - Expand the search box container to full width of the hero section (`max-w-5xl` or `w-full` container).
  - Style the input fields and search button as a grid: 1-column on mobile, 2x2 grid on medium viewports, and 4-column row on large desktop monitors.
  - Give the search button uniform padding and height.

---

### 5. Animated Car Logo
- **Problem:** Replace static logo with a looping animated car logo in brand colors (red `#E31837` and grey).
- **Proposed Solution:** 
  - Update [SigFleetLogo.jsx](file:///Users/as-mac-1196/Desktop/gen%20AI/sigFleet/frontend/src/components/layout/SigFleetLogo.jsx).
  - Implement a highly-polished, self-contained SVG side-profile car with:
    - Wheel spokes that spin continuously via keyframes.
    - Subtle speed lines/motion trails that drift backward.
    - A gentle bouncing/vibration effect on the car body to simulate a running engine.
  - Since all headers/footers share this component, the logo will animate consistently everywhere.

---

### 6. Real Car Images Seeding
- **Problem:** Vehicle cards show placeholder Picsum images instead of actual model matches.
- **Proposed Solution:** 
  - Map each of the 25 seeded vehicle models in `seed.py` to a matching high-quality, free stock Unsplash image of that exact car (Swift, Thar, Creta, BMW 3 Series, Fortuner, etc.).
  - Crop all images to a consistent 8:5 aspect ratio (`800x500`) via Unsplash CDN parameters.
  - Implement automatic database table truncation in `seed.py` when running with `--force` to re-seed and verify cleanly.

---

## Verification Plan

### Automated & Manual Tests
1. **Compiling:** Run `npm run build` to verify the frontend compiles with zero typescript/react/bundling warnings.
2. **Dashboard Navigation:** Verify customer, manager, and admin logins and confirm their sidebars stay visible when navigating to `/vehicles` or sub-pages.
3. **Route Actions:** Verify payments `/admin/payments` filters/refund modal and manager `/manager/statistics` range adjustments with mock/real data.
4. **Logo & Styling:** Visually inspect the animated car logo in the navbar/sidebars and the full-width search block responsiveness on mobile.
