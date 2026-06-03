import traceback
from datetime import datetime, timezone
from decimal import Decimal
from zoneinfo import ZoneInfo

import httpx
from pymongo.errors import DuplicateKeyError
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.booking import Booking
from app.models.payment import Payment, UserWallet
from app.models.user import User, UserKYC
from app.models.vehicle import Vehicle
from app.mongodb import get_mongo_db

IST = ZoneInfo("Asia/Kolkata")


def get_ist_today() -> str:
    return datetime.now(IST).strftime("%Y-%m-%d")


def get_ist_greeting() -> str:
    hour = datetime.now(IST).hour
    if hour < 12:
        return "Good morning"
    if hour < 17:
        return "Good afternoon"
    return "Good evening"


def _as_ist(value: datetime) -> datetime:
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(IST)


def _first_name(user: User | None) -> str:
    return (user.full_name.split()[0] if user and user.full_name else "there")


def _trim_summary(text: str, max_words: int = 55) -> str:
    cleaned = " ".join(str(text or "").strip().split())
    if not cleaned:
        return ""
    words = cleaned.split()
    if len(words) <= max_words:
        return cleaned
    return " ".join(words[:max_words]).rstrip(".,;:") + "."


async def call_llm_for_brief(prompt: str) -> str:
    if not settings.OPENROUTER_API_KEY:
        print("[AGENT] OPENROUTER_API_KEY not set - returning fallback brief")
        return ""

    payload = {
        "model": "google/gemini-2.0-flash-exp:free",
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": 120,
        "temperature": 0.85,
    }
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {settings.OPENROUTER_API_KEY}",
        "HTTP-Referer": "http://localhost:5175",
        "X-Title": "SigFleet Daily Brief Agent",
    }

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post("https://openrouter.ai/api/v1/chat/completions", json=payload, headers=headers)
            response.raise_for_status()
        text = response.json()["choices"][0]["message"]["content"].strip()
        print(f"[AGENT] Brief generated: {text[:60]}...")
        return _trim_summary(text)
    except httpx.TimeoutException:
        print("[AGENT] LLM timeout - using fallback")
    except Exception as exc:
        print(f"[AGENT] LLM error: {exc}")
    return ""


async def collect_customer_data(user: User, db: AsyncSession) -> dict:
    now = datetime.utcnow()
    next_booking = await db.scalar(
        select(Booking)
        .where(
            Booking.customer_id == user.id,
            Booking.status == "confirmed",
            Booking.pickup_datetime > now,
        )
        .order_by(Booking.pickup_datetime.asc())
        .limit(1)
    )
    active_booking = await db.scalar(
        select(Booking)
        .where(Booking.customer_id == user.id, Booking.status == "active")
        .limit(1)
    )
    wallet = await db.scalar(select(UserWallet).where(UserWallet.user_id == user.id))
    kyc = await db.scalar(select(UserKYC).where(UserKYC.user_id == user.id))
    total_trips = await db.scalar(
        select(func.count(Booking.id)).where(
            Booking.customer_id == user.id,
            Booking.status == "completed",
        )
    ) or 0

    next_trip = None
    if next_booking:
        vehicle = await db.get(Vehicle, next_booking.vehicle_id)
        pickup_ist = _as_ist(next_booking.pickup_datetime)
        days_away = (pickup_ist.date() - datetime.now(IST).date()).days
        next_trip = {
            "vehicle": vehicle.title if vehicle else "your booked car",
            "city": vehicle.location_city if vehicle else "",
            "pickup_str": pickup_ist.strftime("%d %b at %I:%M %p"),
            "days_away": days_away,
            "when": "today" if days_away == 0 else "tomorrow" if days_away == 1 else f"in {days_away} days",
            "with_chauffeur": bool(next_booking.with_chauffeur),
        }

    active_trip = None
    if active_booking:
        vehicle = await db.get(Vehicle, active_booking.vehicle_id)
        active_trip = {
            "vehicle": vehicle.title if vehicle else "your car",
            "return_str": _as_ist(active_booking.return_datetime).strftime("%I:%M %p"),
        }

    return {
        "first_name": _first_name(user),
        "greeting": get_ist_greeting(),
        "total_trips": int(total_trips),
        "wallet_balance": float(wallet.balance) if wallet else 0.0,
        "kyc_verified": bool(kyc and kyc.kyc_status == "approved"),
        "next_trip": next_trip,
        "active_trip": active_trip,
    }


async def collect_manager_data(user: User, db: AsyncSession) -> dict:
    now = datetime.utcnow()
    vehicles = (await db.execute(select(Vehicle).where(Vehicle.manager_id == user.id))).scalars().all()
    vehicle_ids = [vehicle.id for vehicle in vehicles]

    active_count = 0
    active_booking_detail = None
    next_booking_detail = None
    month_rev = Decimal("0.00")

    if vehicle_ids:
        active_count = await db.scalar(
            select(func.count(Booking.id)).where(
                Booking.vehicle_id.in_(vehicle_ids),
                Booking.status == "active",
            )
        ) or 0
        active_bookings = (
            await db.execute(
                select(Booking)
                .where(Booking.vehicle_id.in_(vehicle_ids), Booking.status == "active")
                .order_by(Booking.return_datetime.asc())
                .limit(1)
            )
        ).scalars().all()
        if active_bookings:
            booking = active_bookings[0]
            vehicle = await db.get(Vehicle, booking.vehicle_id)
            customer = await db.get(User, booking.customer_id)
            active_booking_detail = {
                "vehicle": vehicle.title if vehicle else "a vehicle",
                "customer": _first_name(customer),
                "return_str": _as_ist(booking.return_datetime).strftime("%d %b at %I:%M %p"),
            }

        next_booking = await db.scalar(
            select(Booking)
            .where(
                Booking.vehicle_id.in_(vehicle_ids),
                Booking.status == "confirmed",
                Booking.pickup_datetime > now,
            )
            .order_by(Booking.pickup_datetime.asc())
            .limit(1)
        )
        if next_booking:
            vehicle = await db.get(Vehicle, next_booking.vehicle_id)
            customer = await db.get(User, next_booking.customer_id)
            pickup_ist = _as_ist(next_booking.pickup_datetime)
            diff_days = (pickup_ist.date() - datetime.now(IST).date()).days
            next_booking_detail = {
                "vehicle": vehicle.title if vehicle else "your vehicle",
                "customer": _first_name(customer),
                "when": "today" if diff_days == 0 else "tomorrow" if diff_days == 1 else f"in {diff_days} days",
                "pickup_str": pickup_ist.strftime("%d %b at %I:%M %p"),
            }

        month_start = datetime.utcnow().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        month_rev = await db.scalar(
            select(func.coalesce(func.sum(Booking.manager_earnings), 0))
            .join(Payment, Payment.booking_id == Booking.id)
            .where(
                Booking.vehicle_id.in_(vehicle_ids),
                Payment.status.in_(("paid", "refunded")),
                Payment.created_at >= month_start,
            )
        ) or Decimal("0.00")

    pending = len([vehicle for vehicle in vehicles if not vehicle.is_approved and vehicle.is_available])

    return {
        "first_name": _first_name(user),
        "greeting": get_ist_greeting(),
        "total_vehicles": len(vehicles),
        "active_count": active_count,
        "active_booking": active_booking_detail,
        "next_booking": next_booking_detail,
        "month_revenue": float(month_rev),
        "pending_approvals": pending,
    }


async def collect_admin_data(db: AsyncSession) -> dict:
    now = datetime.utcnow()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    active_trips = await db.scalar(select(func.count(Booking.id)).where(Booking.status == "active")) or 0
    new_users_today = await db.scalar(select(func.count(User.id)).where(User.created_at >= today_start)) or 0
    pending_vehicles = await db.scalar(
        select(func.count(Vehicle.id)).where(Vehicle.is_approved.is_(False), Vehicle.is_available.is_(True))
    ) or 0
    pending_kyc = await db.scalar(select(func.count(UserKYC.id)).where(UserKYC.kyc_status.in_(("pending", "under_review")))) or 0
    pending_managers = await db.scalar(
        select(func.count(User.id)).where(
            or_(User.role == "vehicle_manager", User.is_vehicle_manager.is_(True)),
            User.is_active.is_(False),
        )
    ) or 0
    month_rev = await db.scalar(
        select(func.coalesce(func.sum(Payment.amount), 0)).where(
            Payment.status.in_(("paid", "refunded")),
            Payment.created_at >= month_start,
        )
    ) or Decimal("0.00")
    total_users = await db.scalar(select(func.count(User.id)).where(User.role == "customer")) or 0

    return {
        "greeting": get_ist_greeting(),
        "active_trips": int(active_trips),
        "new_users_today": int(new_users_today),
        "pending_vehicles": int(pending_vehicles),
        "pending_kyc": int(pending_kyc),
        "pending_managers": int(pending_managers),
        "month_revenue": float(month_rev),
        "total_users": int(total_users),
    }


def build_customer_prompt(data: dict) -> str:
    context_parts = []
    if data["active_trip"]:
        trip = data["active_trip"]
        context_parts.append(f"Currently on an active trip with {trip['vehicle']}, due back at {trip['return_str']} today.")
    elif data["next_trip"]:
        trip = data["next_trip"]
        drive_type = "With chauffeur." if trip["with_chauffeur"] else "Self drive."
        context_parts.append(f"Next trip: {trip['vehicle']} in {trip['city']} {trip['when']} ({trip['pickup_str']}). {drive_type}")
    else:
        context_parts.append("No upcoming trips booked.")
    context_parts.append(f"Wallet balance: INR {data['wallet_balance']:,.0f}.")
    context_parts.append(f"Total trips completed: {data['total_trips']}.")
    if not data["kyc_verified"]:
        context_parts.append("KYC verification is pending.")

    return f"""
Write a warm, personalised one-to-two sentence greeting for a SigFleet car rental customer. Use Indian English.
Maximum 40 words. No bullet points. No lists. Include 1-2 relevant emojis.
Start directly with the greeting.

Customer name: {data['first_name']}
Greeting time: {data['greeting']}
Context: {" ".join(context_parts)}
Pick only the 1-2 most relevant points. Sound human, warm, never robotic.
"""


def build_manager_prompt(data: dict) -> str:
    context_parts = []
    if data["active_booking"]:
        booking = data["active_booking"]
        context_parts.append(f"{booking['vehicle']} is currently out with {booking['customer']}, due back {booking['return_str']}.")
    elif data["next_booking"]:
        booking = data["next_booking"]
        context_parts.append(f"Next booking: {booking['vehicle']} for {booking['customer']} {booking['when']} ({booking['pickup_str']}).")
    else:
        context_parts.append("No active or upcoming bookings.")
    context_parts.append(f"Fleet size: {data['total_vehicles']} vehicles.")
    context_parts.append(f"This month's earnings: INR {data['month_revenue']:,.0f}.")
    if data["pending_approvals"] > 0:
        context_parts.append(f"{data['pending_approvals']} vehicle(s) pending admin approval.")

    return f"""
Write a warm, professional one-to-two sentence greeting for a SigFleet vehicle fleet manager. Indian English.
Maximum 45 words. No bullet points. No lists. Include 1-2 relevant emojis.
Start directly with the greeting.

Manager name: {data['first_name']}
Greeting time: {data['greeting']}
Context: {" ".join(context_parts)}
Always mention monthly earnings encouragingly. Pick only the 1-2 most business-relevant points.
"""


def build_admin_prompt(data: dict) -> str:
    urgent = []
    if data["pending_managers"] > 0:
        urgent.append(f"{data['pending_managers']} manager approval(s) pending")
    if data["pending_vehicles"] > 0:
        urgent.append(f"{data['pending_vehicles']} vehicle approval(s) pending")
    if data["pending_kyc"] > 0:
        urgent.append(f"{data['pending_kyc']} KYC review(s) pending")

    context_parts = [
        f"Active trips right now: {data['active_trips']}.",
        f"New users today: {data['new_users_today']}.",
        f"Monthly revenue: INR {data['month_revenue']:,.0f}.",
        f"Total customers: {data['total_users']}.",
    ]
    if urgent:
        context_parts.append("Urgent items: " + ", ".join(urgent) + ".")

    return f"""
Write a crisp, professional one-to-two sentence executive briefing for the SigFleet platform admin. Indian English.
Maximum 50 words. No bullet points. No lists. Use 1 emoji max.
Start directly with the greeting.

Greeting time: {data['greeting']}
Context: {" ".join(context_parts)}
Lead with urgent action if any exists, otherwise give a positive platform health summary.
"""


def get_fallback_brief(role: str, data: dict) -> str:
    name = data.get("first_name", "there")
    greeting = data.get("greeting", "Hello")

    if role == "customer":
        if data.get("active_trip"):
            trip = data["active_trip"]
            return f"{greeting}, {name}! You're currently on a trip with {trip['vehicle']}, due back at {trip['return_str']}. Enjoy the ride and drive safe."
        if data.get("next_trip"):
            trip = data["next_trip"]
            return f"{greeting}, {name}! Your upcoming trip with {trip['vehicle']} in {trip['city']} is {trip['when']}. Have a wonderful journey."
        kyc_note = " Complete your KYC to start booking smoothly." if not data.get("kyc_verified") else ""
        wallet_note = " Your wallet is running low." if data.get("wallet_balance", 0) < 500 else ""
        return f"{greeting}, {name}! Welcome to SigFleet.{wallet_note}{kyc_note} Ready to plan your next drive?"

    if role == "vehicle_manager":
        if data.get("active_booking"):
            booking = data["active_booking"]
            return f"{greeting}, {name}! {booking['vehicle']} is currently out with {booking['customer']}, returning {booking['return_str']}. This month's earnings are INR {data.get('month_revenue', 0):,.0f}."
        approval_note = f" {data['pending_approvals']} vehicle approval(s) are pending." if data.get("pending_approvals", 0) else ""
        return f"{greeting}, {name}! Your fleet of {data.get('total_vehicles', 0)} vehicles is ready. This month's earnings are INR {data.get('month_revenue', 0):,.0f}.{approval_note}"

    urgent = []
    if data.get("pending_managers", 0) > 0:
        urgent.append(f"{data['pending_managers']} manager approval(s)")
    if data.get("pending_vehicles", 0) > 0:
        urgent.append(f"{data['pending_vehicles']} vehicle approval(s)")
    if data.get("pending_kyc", 0) > 0:
        urgent.append(f"{data['pending_kyc']} KYC review(s)")
    if urgent:
        return f"{greeting}! Pending today: {', '.join(urgent)}. Active trips: {data.get('active_trips', 0)}. Monthly revenue: INR {data.get('month_revenue', 0):,.0f}."
    return f"{greeting}! Platform health looks steady with {data.get('active_trips', 0)} active trips and {data.get('new_users_today', 0)} new users today. Monthly revenue is INR {data.get('month_revenue', 0):,.0f}."


async def get_or_generate_daily_brief(user: User, db: AsyncSession) -> dict | None:
    today = get_ist_today()
    collection = get_mongo_db().agent_daily_briefs
    existing = await collection.find_one({"user_id": str(user.id), "date": today})

    if existing:
        return {
            "summary": existing["summary"],
            "generated_at": existing["generated_at"],
            "role": existing["role"],
            "date": existing["date"],
        }

    try:
        if user.role == "customer":
            data = await collect_customer_data(user, db)
            prompt = build_customer_prompt(data)
        elif user.role == "vehicle_manager":
            data = await collect_manager_data(user, db)
            prompt = build_manager_prompt(data)
        else:
            data = await collect_admin_data(db)
            prompt = build_admin_prompt(data)

        summary = await call_llm_for_brief(prompt)
        if not summary:
            summary = get_fallback_brief(user.role, data)
        summary = _trim_summary(summary)

        doc = {
            "user_id": str(user.id),
            "role": user.role,
            "date": today,
            "summary": summary,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "seen": False,
            "seen_at": None,
        }
        try:
            await collection.insert_one(doc)
        except DuplicateKeyError:
            existing = await collection.find_one({"user_id": str(user.id), "date": today})
            if not existing or existing.get("seen"):
                return None
            doc = existing

        return {
            "summary": doc["summary"],
            "generated_at": doc["generated_at"],
            "role": doc["role"],
            "date": doc["date"],
        }
    except Exception as exc:
        print(f"[AGENT] Brief generation failed for {user.id}: {exc}")
        traceback.print_exc()
        return None
