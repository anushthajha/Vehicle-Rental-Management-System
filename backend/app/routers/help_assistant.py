import hashlib
import math
import re
from datetime import datetime, timezone
from pathlib import Path

import httpx
from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel, Field
from sqlalchemy import func, not_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models.booking import Booking
from app.models.payment import Payment
from app.models.user import User
from app.models.vehicle import Vehicle
from app.models.vehicle_category import VehicleType
from app.mongodb import get_mongo_db
from app.utils.auth import verify_token

router = APIRouter(prefix="/help", tags=["help-assistant"])
optional_oauth2 = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)

HELP_DOCS_DIR = Path(__file__).resolve().parents[3] / "docs" / "help"
VECTOR_DIMENSIONS = 384
COLLECTION_NAME = "help_knowledge_chunks"
MIN_CONFIDENCE = 0.45
OUT_OF_SCOPE_ANSWER = "I can only answer questions related to SigFleet."
NO_PERSONAL_DATA_ANSWER = "I do not have access to personal information or account data."
NO_RELIABLE_ANSWER = "I couldn't find a reliable answer in the SigFleet knowledge base."
NO_TOOL_ANSWER = "I couldn't find that information."

SIGFLEET_SCOPE_TERMS = {
    "sigfleet", "sigbot", "vehicle", "vehicles", "car", "cars", "bike", "bikes",
    "traveller", "travellers", "booking", "bookings", "book", "rent", "rental",
    "trip", "trips", "manager",
    "customer", "admin", "kyc", "aadhaar", "aadhar", "licence", "license",
    "document", "documents", "payment", "wallet", "refund", "support", "ticket",
    "coupon", "payout", "payouts", "earning", "earnings", "withdraw", "withdrawal",
    "withdrawals", "dashboard", "notification", "notifications",
    "register", "registration", "account", "login", "profile", "approval",
    "approve", "vehicle_manager", "listing", "availability", "insurance",
    "chauffeur", "review", "reviews", "wishlist", "count", "counts", "total",
    "totals", "revenue", "statistic", "statistics", "stats",
}


class HelpAskRequest(BaseModel):
    question: str = Field(min_length=2, max_length=600)
    role: str = Field(default="guest", pattern="^(guest|customer|vehicle_manager|admin)$")
    conversation_history: list[dict] = Field(default_factory=list, max_length=12)


async def _optional_user(
    token: str | None = Depends(optional_oauth2),
    db: AsyncSession = Depends(get_db),
) -> User | None:
    if not token:
        return None
    try:
        payload = await verify_token(token)
    except HTTPException:
        return None
    if payload.get("type") != "access":
        return None
    return await db.scalar(select(User).where(User.id == payload.get("sub"), User.is_active.is_(True)))


STOPWORDS = {
    "a", "an", "and", "are", "can", "from", "how", "i", "in", "is", "me",
    "my", "of", "on", "or", "the", "to", "what", "where", "with", "you",
}

SYNONYMS = {
    "book": ["booking", "rent", "reserve", "vehicle"],
    "booking": ["book", "rent", "reservation", "trip"],
    "car": ["vehicle", "listing", "automobile"],
    "bike": ["vehicle", "self", "ride", "two wheeler"],
    "vehicle": ["car", "bike", "traveller", "listing"],
    "add": ["create", "list", "upload", "submit"],
    "manager": ["vehicle_manager", "fleet", "owner", "registration", "register", "account"],
    "approve": ["approval", "review", "verify"],
    "payment": ["pay", "wallet", "amount", "transaction"],
    "refund": ["cancel", "cancellation", "wallet"],
    "payout": ["payouts", "earnings", "withdraw", "withdrawal"],
    "payouts": ["payout", "earnings", "withdraw", "withdrawal"],
    "withdraw": ["withdrawal", "payout", "payouts", "earnings"],
    "withdrawal": ["withdraw", "payout", "payouts", "earnings"],
    "earnings": ["earning", "payout", "payouts", "withdrawal"],
    "support": ["ticket", "help", "issue", "reply"],
    "kyc": ["verify", "document", "license", "aadhaar"],
    "admin": ["approval", "review", "dashboard"],
    "sigbot": ["chatbot", "booking", "assistant"],
    "document": ["documents", "kyc", "verification", "aadhaar", "aadhar", "license", "licence"],
    "documents": ["document", "kyc", "verification", "aadhaar", "aadhar", "license", "licence"],
    "needed": ["required", "requirements", "need"],
    "required": ["needed", "requirements", "need"],
    "licence": ["license", "driving", "document", "kyc"],
    "license": ["licence", "driving", "document", "kyc"],
    "aadhaar": ["aadhar", "identity", "document", "kyc"],
    "aadhar": ["aadhaar", "identity", "document", "kyc"],
    "account": ["register", "registration", "signup", "sign", "profile"],
    "register": ["account", "signup", "sign", "profile"],
    "signup": ["register", "registration", "account", "sign"],
    "login": ["signin", "sign", "account"],
    "become": ["register", "registration", "signup", "account"],
}


def _tokens(text: str) -> list[str]:
    words = re.findall(r"[a-z0-9]+", text.lower())
    expanded: list[str] = []
    for word in words:
        if word in STOPWORDS or len(word) <= 1:
            continue
        expanded.append(word)
        expanded.extend(SYNONYMS.get(word, []))
    return expanded


def _raw_tokens(text: str) -> set[str]:
    return set(re.findall(r"[a-z0-9]+", text.lower()))


def _is_personal_info_question(question: str) -> bool:
    normalized = question.lower()
    personal_patterns = (
        r"\bmy (password|otp|session)\b",
        r"\bshow me my (password|otp|session)\b",
        r"\bwhat(?:'s| is)? my (password|otp|session)\b",
    )
    return any(re.search(pattern, normalized) for pattern in personal_patterns)


def _is_sigfleet_related_question(question: str) -> bool:
    return bool(_raw_tokens(question) & SIGFLEET_SCOPE_TERMS)


def _is_account_api_question(question: str) -> bool:
    normalized = question.lower()
    return bool(
        re.search(r"\bmy\b", normalized)
        and re.search(r"\b(bookings?|trips?|profile|account|name|email|phone|wallet|kyc)\b", normalized)
    )


def _is_analytics_api_question(question: str) -> bool:
    normalized = question.lower()
    has_metric = re.search(r"\b(how many|count|counts|number of|total|totals|revenue|statistics|stats)\b", normalized)
    has_entity = re.search(r"\b(bookings?|users?|customers?|managers?|vehicles?|cars?|bikes?|revenue|earnings)\b", normalized)
    return bool(has_metric and has_entity)


def _embedding(text: str) -> list[float]:
    """Deterministic local embedding vector for Markdown RAG retrieval."""
    vector = [0.0] * VECTOR_DIMENSIONS
    for token in _tokens(text):
        digest = hashlib.sha256(token.encode("utf-8")).digest()
        index = int.from_bytes(digest[:4], "big") % VECTOR_DIMENSIONS
        sign = 1.0 if digest[4] % 2 == 0 else -1.0
        vector[index] += sign

    norm = math.sqrt(sum(value * value for value in vector))
    if not norm:
        return vector
    return [round(value / norm, 6) for value in vector]


def _cosine(left: list[float], right: list[float]) -> float:
    return sum(a * b for a, b in zip(left, right))


def _lexical_score(question: str, chunk: dict) -> float:
    query_tokens = set(_tokens(question))
    if not query_tokens:
        return 0.0

    title = chunk.get("title") or ""
    content = chunk.get("content") or ""
    title_tokens = set(_tokens(title))
    content_tokens = set(_tokens(content))
    title_overlap = len(query_tokens & title_tokens) / len(query_tokens)
    content_overlap = len(query_tokens & content_tokens) / len(query_tokens)

    score = (title_overlap * 0.45) + (content_overlap * 0.2)
    normalized_question = question.lower()
    normalized_title = title.lower()
    if normalized_title and normalized_title in normalized_question:
        score += 0.3
    return score


def _is_live_inventory_question(question: str) -> bool:
    normalized = question.lower()
    has_count = re.search(r"\b(how many|count|number of|available|availability)\b", normalized)
    has_inventory = re.search(r"\b(cars?|vehicles?|bikes?|travellers?)\b", normalized)
    has_place = re.search(r"\b(blr|bangalore|bengaluru|mumbai|delhi|chennai|hyderabad|pune|goa|jaipur)\b", normalized)
    return bool(has_count and has_inventory and has_place)


def _city_from_question(question: str) -> str | None:
    normalized = question.lower()
    aliases = {
        "blr": "Bengaluru",
        "bangalore": "Bengaluru",
        "bengaluru": "Bengaluru",
        "bombay": "Mumbai",
        "mumbai": "Mumbai",
        "delhi": "Delhi",
        "chennai": "Chennai",
        "madras": "Chennai",
        "hyderabad": "Hyderabad",
        "hyd": "Hyderabad",
        "pune": "Pune",
        "goa": "Goa",
        "jaipur": "Jaipur",
    }
    for alias, city in aliases.items():
        if re.search(rf"\b{re.escape(alias)}\b", normalized):
            return city
    return None


def _inventory_type_from_question(question: str) -> str:
    normalized = question.lower()
    if re.search(r"\b(bikes?|motorcycles?|scooters?)\b", normalized):
        return "bike"
    if re.search(r"\b(travellers?|travelers?|tempo)\b", normalized):
        return "traveller"
    if re.search(r"\b(cars?)\b", normalized):
        return "car"
    return "vehicle"


def _is_live_user_count_question(question: str) -> bool:
    normalized = question.lower()
    has_count = re.search(r"\b(how many|count|number of|total)\b", normalized)
    has_user_entity = re.search(
        r"\b(users?|customers?|admins?|managers?|vehicle managers?|fleet managers?)\b",
        normalized,
    )
    return bool(has_count and has_user_entity)


def _user_role_from_question(question: str) -> str | None:
    normalized = question.lower()
    if re.search(r"\b(customers?)\b", normalized):
        return "customer"
    if re.search(r"\b(admins?)\b", normalized):
        return "admin"
    if re.search(r"\b(vehicle managers?|fleet managers?|managers?)\b", normalized):
        return "vehicle_manager"
    return None


def _user_status_from_question(question: str) -> str | None:
    normalized = question.lower()
    if re.search(r"\b(pending|inactive|not approved|unapproved|waiting)\b", normalized):
        return "pending"
    if re.search(r"\b(active|approved|enabled)\b", normalized):
        return "active"
    return None


def _history_messages(history: list[dict]) -> list[dict]:
    messages = []
    for message in history:
        if not isinstance(message, dict):
            continue
        role = message.get("role")
        text = message.get("text")
        if role in {"user", "assistant"} and isinstance(text, str) and text.strip():
            messages.append({"role": role, "text": text.strip()[:1000]})
    return messages[-12:]


def _last_history_text(history: list[dict], role: str) -> str | None:
    for message in reversed(_history_messages(history)):
        if message["role"] == role:
            return message["text"]
    return None


def _is_repeat_request(question: str) -> bool:
    normalized = question.lower().strip()
    return bool(
        re.search(
            r"\b(check again|recheck|refresh|again|same question|same thing|tell again|check once more)\b",
            normalized,
        )
    ) or normalized in {"check", "again", "tell me again"}


def _is_date_followup(question: str) -> bool:
    normalized = question.lower()
    return bool(
        re.search(
            r"\b(why.*dates?|what dates?|which dates?|tell.*dates?|show.*dates?|available dates?|date availability|for dates?)\b",
            normalized,
        )
    )


def _references_previous_context(question: str) -> bool:
    normalized = question.lower()
    return bool(re.search(r"\b(it|this|that|there|those|them|previous|last answer|dates?)\b", normalized))


def _resolve_question(question: str, history: list[dict]) -> str:
    if _is_live_inventory_question(question) or _is_live_user_count_question(question):
        return question

    previous_user_question = _last_history_text(history, "user")
    if not previous_user_question:
        return question

    if _is_repeat_request(question):
        return previous_user_question
    if _references_previous_context(question):
        return f"{previous_user_question}. Follow-up: {question}"
    return question


def _split_compound_questions(question: str) -> list[str]:
    normalized = question.lower()
    if _is_live_inventory_question(question) or _is_live_user_count_question(question):
        return [question]

    intents: list[tuple[str, str]] = [
        (
            r"\b(create|open|make|register|sign up|signup)\b.{0,60}\b(account|profile)\b|\b(account|profile)\b.{0,60}\b(create|open|make|register|sign up|signup)\b",
            "How can I create an account?",
        ),
        (
            r"\b(complete|submit|upload|verify)\b.{0,50}\b(kyc|documents?|aadhaar|aadhar|licen[cs]e)\b|\b(kyc|documents?|aadhaar|aadhar|licen[cs]e)\b.{0,50}\b(complete|submit|upload|verify|required|needed)\b",
            "How can I complete KYC?",
        ),
        (
            r"\b(book|booking|rent|reserve)\b",
            "How can I book a vehicle?",
        ),
        (
            r"\b(cancel|cancellation)\b",
            "How can I cancel a booking?",
        ),
        (
            r"\b(pay|payment|wallet)\b",
            "How can I complete payment?",
        ),
        (
            r"\b(support|ticket|help)\b",
            "How can I get support?",
        ),
    ]

    matched: list[str] = []
    for pattern, canonical_question in intents:
        if re.search(pattern, normalized) and canonical_question not in matched:
            matched.append(canonical_question)

    is_probably_compound = bool(re.search(r"\b(and|also|then|after that|plus)\b", normalized)) or question.count("?") > 1
    if is_probably_compound and len(matched) > 1:
        return matched[:4]
    return [question]


def _date_followup_answer(question: str, history: list[dict]) -> dict | None:
    previous_user_question = _last_history_text(history, "user") or ""
    previous_assistant_answer = _last_history_text(history, "assistant") or ""
    was_inventory_context = (
        _is_live_inventory_question(previous_user_question)
        or "generally available" in previous_assistant_answer.lower()
        or "live vehicle inventory" in previous_assistant_answer.lower()
    )
    if not (_is_date_followup(question) and was_inventory_context):
        return None

    city = _city_from_question(previous_user_question)
    city_text = f" in {city}" if city else ""
    return {
        "answer": (
            f"I can count generally available listings{city_text}, but exact date availability needs a pickup and return date/time. "
            "The same vehicle may be free today and booked on another date range, so tell me both dates or use Browse Vehicles/SigBot with dates."
        ),
        "sources": [{"id": "conversation_context", "title": "Previous inventory answer", "source_path": "Conversation context", "score": 1}],
        "role": "guest",
        "retrieval": "conversation_followup",
        "confidence": "high",
    }


async def _live_inventory_answer(question: str, db: AsyncSession) -> dict | None:
    if not _is_live_inventory_question(question):
        return None
    city = _city_from_question(question)
    if not city:
        return None

    inventory_type = _inventory_type_from_question(question)
    conditions = [
        Vehicle.is_approved.is_(True),
        Vehicle.is_available.is_(True),
        func.lower(Vehicle.location_city) == city.lower(),
    ]

    if inventory_type in {"bike", "traveller"}:
        conditions.append(Vehicle.vehicle_type.has(func.lower(VehicleType.slug) == inventory_type))
    elif inventory_type == "car":
        conditions.append(
            not_(Vehicle.vehicle_type.has(func.lower(VehicleType.slug).in_(["bike", "traveller"])))
        )

    count = await db.scalar(select(func.count()).select_from(Vehicle).where(*conditions)) or 0
    label = {
        "bike": "bike listing",
        "traveller": "traveller listing",
        "car": "car listing",
        "vehicle": "vehicle listing",
    }[inventory_type]
    plural = "" if count == 1 else "s"
    return {
        "answer": (
            f"There are currently {count} approved and generally available {label}{plural} in {city}. "
            "For exact trip availability, choose pickup and return dates in Browse Vehicles or ask SigBot to search for those dates."
        ),
        "sources": [{"id": "live_inventory", "title": "Live vehicle inventory", "source_path": "SQL vehicles table", "score": 1}],
        "role": "guest",
        "retrieval": "live_sql_inventory",
        "confidence": "high",
    }


async def _live_user_count_answer(question: str, requester_role: str, db: AsyncSession) -> dict | None:
    if not _is_live_user_count_question(question):
        return None
    if requester_role != "admin":
        return {
            "answer": "I can only show live user counts and user role totals to admins.",
            "sources": [],
            "role": requester_role,
            "retrieval": "role_restricted_live_sql_users",
            "confidence": "high",
        }

    role = _user_role_from_question(question)
    status = _user_status_from_question(question)
    conditions = []
    if role:
        conditions.append(User.role == role)
    else:
        conditions.append(User.role.in_(["customer", "vehicle_manager"]))
    if status == "active":
        conditions.append(User.is_active.is_(True))
    elif status == "pending":
        conditions.append(User.is_active.is_(False))

    count = await db.scalar(select(func.count()).select_from(User).where(*conditions)) or 0

    role_labels = {
        "customer": "customer",
        "vehicle_manager": "vehicle manager",
        "admin": "admin",
        None: "customer/vehicle manager user",
    }
    label = role_labels[role]
    status_text = ""
    if status == "active":
        status_text = " active"
    elif status == "pending":
        status_text = " pending/inactive"

    details = ""
    if role == "vehicle_manager" and status is None:
        active_count = await db.scalar(
            select(func.count()).select_from(User).where(
                User.role == "vehicle_manager",
                User.is_active.is_(True),
            )
        ) or 0
        pending_count = await db.scalar(
            select(func.count()).select_from(User).where(
                User.role == "vehicle_manager",
                User.is_active.is_(False),
            )
        ) or 0
        details = f" That includes {active_count} active and {pending_count} pending/inactive manager(s)."
    elif role is None:
        customer_count = await db.scalar(
            select(func.count()).select_from(User).where(User.role == "customer")
        ) or 0
        manager_count = await db.scalar(
            select(func.count()).select_from(User).where(User.role == "vehicle_manager")
        ) or 0
        details = f" That means {customer_count} customer(s) + {manager_count} vehicle manager(s). Admins are not included in this user count."

    plural = "" if count == 1 else "s"
    return {
        "answer": f"There are currently {count}{status_text} {label}{plural} in SigFleet.{details}",
        "sources": [{"id": "live_user_records", "title": "Live user records", "source_path": "SQL users table", "score": 1}],
        "role": requester_role,
        "retrieval": "live_sql_users",
        "confidence": "high",
    }


def _source(source_id: str, title: str) -> dict:
    return {"id": source_id, "title": title, "source_path": "Authenticated application API", "score": 1}


def _format_money(value) -> str:
    return f"Rs. {float(value or 0):,.2f}"


def _format_datetime(value: datetime | None) -> str:
    return value.strftime("%d %b %Y, %I:%M %p") if value else "-"


async def _booking_status_summary(db: AsyncSession, conditions: list) -> str:
    rows = (await db.execute(select(Booking.status, func.count()).where(*conditions).group_by(Booking.status))).all()
    if not rows:
        return ""
    ordered = sorted((status, int(count or 0)) for status, count in rows)
    return " Status breakdown: " + ", ".join(f"{status} {count}" for status, count in ordered) + "."


async def _account_api_answer(question: str, current_user: User | None, db: AsyncSession) -> dict | None:
    if not _is_account_api_question(question):
        return None
    if current_user is None:
        return {
            "answer": NO_TOOL_ANSWER,
            "sources": [],
            "role": "guest",
            "retrieval": "account_api",
            "confidence": "high",
        }

    normalized = question.lower()
    if re.search(r"\b(next|upcoming)\b", normalized) and re.search(r"\b(trip|booking|rental)\b", normalized):
        owner_condition = Booking.manager_id == current_user.id if current_user.role == "vehicle_manager" else Booking.customer_id == current_user.id
        booking = await db.scalar(
            select(Booking)
            .where(
                owner_condition,
                Booking.status.in_(("pending", "confirmed", "active")),
                Booking.return_datetime >= datetime.utcnow(),
            )
            .order_by(Booking.pickup_datetime.asc())
            .limit(1)
        )
        if not booking:
            return {
                "answer": "I couldn't find an upcoming trip for your account.",
                "sources": [_source("account_bookings_api", "Account bookings API")],
                "role": current_user.role,
                "retrieval": "account_api",
                "confidence": "high",
            }
        vehicle = await db.scalar(select(Vehicle).where(Vehicle.id == booking.vehicle_id))
        vehicle_title = vehicle.title if vehicle else "Vehicle rental"
        return {
            "answer": (
                f"Your next trip is {vehicle_title}. Status: {booking.status}. "
                f"Pickup: {_format_datetime(booking.pickup_datetime)}. "
                f"Return: {_format_datetime(booking.return_datetime)}."
            ),
            "sources": [_source("account_bookings_api", "Account bookings API")],
            "role": current_user.role,
            "retrieval": "account_api",
            "confidence": "high",
        }

    if re.search(r"\bbookings?\b", normalized):
        if current_user.role == "vehicle_manager":
            conditions = [Booking.manager_id == current_user.id]
            total = await db.scalar(select(func.count()).select_from(Booking).where(*conditions)) or 0
            detail = await _booking_status_summary(db, conditions)
            answer = f"You have {total} managed booking(s) in SigFleet.{detail}"
        else:
            conditions = [Booking.customer_id == current_user.id]
            total = await db.scalar(select(func.count()).select_from(Booking).where(*conditions)) or 0
            detail = await _booking_status_summary(db, conditions)
            answer = f"You have {total} booking(s) in SigFleet.{detail}"
        return {
            "answer": answer,
            "sources": [_source("account_bookings_api", "Account bookings API")],
            "role": current_user.role,
            "retrieval": "account_api",
            "confidence": "high",
        }

    if re.search(r"\b(profile|account|name|email|phone)\b", normalized):
        parts = [f"Name: {current_user.full_name}", f"Role: {current_user.role}"]
        if current_user.email:
            parts.append(f"Email: {current_user.email}")
        if current_user.phone:
            parts.append(f"Phone: {current_user.phone}")
        return {
            "answer": "Your SigFleet account details are: " + "; ".join(parts) + ".",
            "sources": [_source("account_profile_api", "Account profile API")],
            "role": current_user.role,
            "retrieval": "account_api",
            "confidence": "high",
        }

    return {
        "answer": NO_TOOL_ANSWER,
        "sources": [],
        "role": current_user.role,
        "retrieval": "account_api",
        "confidence": "high",
    }


async def _analytics_api_answer(question: str, current_user: User | None, db: AsyncSession) -> dict | None:
    if not _is_analytics_api_question(question):
        return None
    if current_user is None:
        return {
            "answer": NO_TOOL_ANSWER,
            "sources": [],
            "role": "guest",
            "retrieval": "analytics_api",
            "confidence": "high",
        }

    normalized = question.lower()
    asks_bookings = re.search(r"\bbookings?\b", normalized)
    asks_revenue = re.search(r"\b(revenue|earnings)\b", normalized)
    asks_users = re.search(r"\b(users?|customers?|managers?)\b", normalized)

    if asks_bookings:
        if current_user.role == "admin":
            conditions = []
            total = await db.scalar(select(func.count()).select_from(Booking)) or 0
            detail = await _booking_status_summary(db, conditions)
            answer = f"SigFleet has {total} total booking(s).{detail}"
        elif current_user.role == "vehicle_manager":
            conditions = [Booking.manager_id == current_user.id]
            total = await db.scalar(select(func.count()).select_from(Booking).where(*conditions)) or 0
            detail = await _booking_status_summary(db, conditions)
            answer = f"You have {total} total managed booking(s).{detail}"
        else:
            conditions = [Booking.customer_id == current_user.id]
            total = await db.scalar(select(func.count()).select_from(Booking).where(*conditions)) or 0
            detail = await _booking_status_summary(db, conditions)
            answer = f"You have {total} total booking(s).{detail}"
        return {
            "answer": answer,
            "sources": [_source("booking_analytics_api", "Booking analytics API")],
            "role": current_user.role,
            "retrieval": "analytics_api",
            "confidence": "high",
        }

    if asks_revenue:
        if current_user.role == "admin":
            total = await db.scalar(
                select(func.coalesce(func.sum(Payment.amount), 0)).where(Payment.status.in_(("paid", "refunded")))
            ) or 0
            answer = f"SigFleet total revenue is {_format_money(total)}."
        elif current_user.role == "vehicle_manager":
            total = await db.scalar(
                select(func.coalesce(func.sum(Booking.manager_earnings), 0)).where(
                    Booking.manager_id == current_user.id,
                    Booking.status == "completed",
                )
            ) or 0
            answer = f"Your total manager earnings are {_format_money(total)}."
        else:
            total = await db.scalar(
                select(func.coalesce(func.sum(Payment.amount), 0)).where(
                    Payment.user_id == current_user.id,
                    Payment.status.in_(("paid", "refunded")),
                )
            ) or 0
            answer = f"Your total paid booking amount is {_format_money(total)}."
        return {
            "answer": answer,
            "sources": [_source("revenue_analytics_api", "Revenue analytics API")],
            "role": current_user.role,
            "retrieval": "analytics_api",
            "confidence": "high",
        }

    if asks_users and current_user.role == "admin":
        total = await db.scalar(select(func.count()).select_from(User)) or 0
        return {
            "answer": f"SigFleet has {total} total user account(s).",
            "sources": [_source("user_analytics_api", "User analytics API")],
            "role": current_user.role,
            "retrieval": "analytics_api",
            "confidence": "high",
        }

    return {
        "answer": NO_TOOL_ANSWER,
        "sources": [],
        "role": current_user.role,
        "retrieval": "analytics_api",
        "confidence": "high",
    }


def _low_confidence_answer(question: str) -> str:
    return NO_RELIABLE_ANSWER


def _parse_frontmatter(text: str) -> tuple[dict, str]:
    if not text.startswith("---"):
        return {}, text
    parts = text.split("---", 2)
    if len(parts) < 3:
        return {}, text
    meta = {}
    for line in parts[1].splitlines():
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        meta[key.strip()] = value.strip()
    return meta, parts[2].strip()


def _roles_from_meta(value: str | None) -> list[str]:
    if not value:
        return ["guest"]
    return [role.strip() for role in value.split(",") if role.strip()]


def _slug(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-") or "section"


def _chunk_markdown(path: Path) -> list[dict]:
    raw = path.read_text(encoding="utf-8")
    meta, body = _parse_frontmatter(raw)
    roles = _roles_from_meta(meta.get("roles"))
    doc_title = meta.get("title") or path.stem.replace("-", " ").title()

    sections: list[tuple[str, list[str]]] = []
    current_title = doc_title
    current_lines: list[str] = []
    for line in body.splitlines():
        heading = re.match(r"^##\s+(.+)$", line)
        if heading:
            if current_lines:
                sections.append((current_title, current_lines))
            current_title = heading.group(1).strip()
            current_lines = [line]
        else:
            current_lines.append(line)
    if current_lines:
        sections.append((current_title, current_lines))

    chunks = []
    for index, (section_title, lines) in enumerate(sections):
        content = "\n".join(lines).strip()
        if len(content) < 40:
            continue
        chunk_id = f"{path.stem}:{index}:{_slug(section_title)}"
        chunks.append(
            {
                "chunk_id": chunk_id,
                "doc_id": path.stem,
                "source_path": str(path.relative_to(Path(__file__).resolve().parents[3])),
                "title": section_title,
                "doc_title": doc_title,
                "roles": roles,
                "content": content,
                "embedding": _embedding(f"{doc_title}\n{section_title}\n{content}"),
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
        )
    return chunks


def _load_markdown_chunks() -> list[dict]:
    if not HELP_DOCS_DIR.exists():
        return []
    chunks: list[dict] = []
    for path in sorted(HELP_DOCS_DIR.glob("*.md")):
        chunks.extend(_chunk_markdown(path))
    return chunks


async def _sync_knowledge_base() -> None:
    """Upsert Markdown chunks and embeddings into MongoDB."""
    chunks = _load_markdown_chunks()
    if not chunks:
        return
    db = get_mongo_db()
    collection = db[COLLECTION_NAME]
    chunk_ids = [chunk["chunk_id"] for chunk in chunks]

    for chunk in chunks:
        await collection.update_one(
            {"chunk_id": chunk["chunk_id"]},
            {"$set": chunk},
            upsert=True,
        )
    await collection.delete_many({"chunk_id": {"$nin": chunk_ids}})


async def _retrieve(question: str, role: str, limit: int = 4) -> list[dict]:
    await _sync_knowledge_base()
    query_vector = _embedding(question)
    db = get_mongo_db()
    collection = db[COLLECTION_NAME]
    allowed_roles = [role]
    if role != "guest":
        allowed_roles.append("guest")

    candidates = await collection.find({"roles": {"$in": allowed_roles}}).to_list(length=200)
    scored = []
    for chunk in candidates:
        score = _cosine(query_vector, chunk.get("embedding") or []) + _lexical_score(question, chunk)
        if score > 0:
            scored.append((score, chunk))
    scored.sort(key=lambda item: item[0], reverse=True)
    return [chunk | {"score": round(score, 4)} for score, chunk in scored[:limit]]


def _fallback_answer(role: str, chunks: list[dict]) -> str:
    if not chunks:
        return NO_RELIABLE_ANSWER
    top = chunks[0]
    content = re.sub(r"^##\s+", "", top["content"], flags=re.MULTILINE).strip()
    content = re.sub(r"\n{3,}", "\n\n", content)
    return content


async def _llm_answer(question: str, role: str, chunks: list[dict]) -> str:
    if not settings.OPENROUTER_API_KEY or not chunks:
        return ""
    top_score = chunks[0].get("score", 0)
    if top_score < MIN_CONFIDENCE:
        return ""
    context = "\n\n---\n\n".join(
        f"Source: {chunk['source_path']} > {chunk['title']}\n{chunk['content']}"
        for chunk in chunks
    )
    prompt = f"""
You are the official SigFleet Knowledge Assistant.

Your purpose is to answer questions ONLY using the retrieved SigFleet knowledge base documents provided in the context.
You are not a general-purpose AI assistant.

Role: {role}

Rules:
- Answer only if the question is related to SigFleet.
- Answer only if the retrieved context directly supports the answer.
- Use only the retrieved context. Do not use general knowledge, prior knowledge, assumptions, or external information.
- Do not invent features, screens, buttons, APIs, policies, permissions, workflows, pricing, or booking rules.
- You do not have access to personal information, account data, session data, or database records.
- If the question asks for personal information, respond exactly: "{NO_PERSONAL_DATA_ANSWER}"
- If the question is out of scope, respond exactly: "{OUT_OF_SCOPE_ANSWER}"
- If the retrieved context does not directly answer the question, respond exactly: "{NO_RELIABLE_ANSWER}"

Response format for valid answers:
Answer:
<answer>

Source:
<document title>

Retrieved context:
{context}

Question: {question}
"""
    payload = {
        "model": "google/gemini-2.0-flash-exp:free",
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": 280,
        "temperature": 0.25,
    }
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {settings.OPENROUTER_API_KEY}",
        "HTTP-Referer": settings.FRONTEND_URL or "http://localhost:5175",
        "X-Title": "SigFleet RAG Help Assistant",
    }
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post("https://openrouter.ai/api/v1/chat/completions", json=payload, headers=headers)
            response.raise_for_status()
            return response.json()["choices"][0]["message"]["content"].strip()
    except Exception as exc:
        print(f"[HELP_ASSISTANT] LLM fallback used: {exc}")
        return ""


async def _knowledge_answer(question: str, role: str) -> dict:
    chunks = await _retrieve(question, role)
    top_score = chunks[0].get("score", 0) if chunks else 0
    confidence = "high" if top_score >= MIN_CONFIDENCE else "low"
    if confidence == "low":
        answer = _low_confidence_answer(question)
        chunks = []
    else:
        answer = await _llm_answer(question, role, chunks)
    if not answer and confidence != "low":
        answer = _fallback_answer(role, chunks)
    return {
        "answer": answer,
        "chunks": chunks,
        "retrieval": "mongodb_vector_similarity",
        "confidence": confidence,
    }


async def _answer_one_question(question: str, role: str, db: AsyncSession) -> dict:
    knowledge_answer = await _knowledge_answer(question, role)
    chunks = knowledge_answer.pop("chunks")
    return {
        **knowledge_answer,
        "sources": [
            {
                "id": chunk["chunk_id"],
                "title": chunk["title"],
                "source_path": chunk["source_path"],
                "score": chunk.get("score", 0),
            }
            for chunk in chunks
        ],
        "role": role,
        "resolved_question": question,
    }


def _dedupe_sources(sources: list[dict]) -> list[dict]:
    seen = set()
    unique_sources = []
    for source in sources:
        source_id = source.get("id") or source.get("source_path") or source.get("title")
        if source_id in seen:
            continue
        seen.add(source_id)
        unique_sources.append(source)
    return unique_sources


def _compound_heading(question: str) -> str:
    normalized = question.lower()
    if "account" in normalized or "register" in normalized:
        return "Create An Account"
    if "kyc" in normalized or "document" in normalized:
        return "Complete KYC"
    if "book" in normalized or "rent" in normalized or "reserve" in normalized:
        return "Book A Vehicle"
    if "cancel" in normalized:
        return "Cancel A Booking"
    if "pay" in normalized or "wallet" in normalized:
        return "Payment"
    if "support" in normalized or "ticket" in normalized:
        return "Support"
    return "Answer"


@router.post("/ask")
async def ask_help(
    payload: HelpAskRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(_optional_user),
):
    effective_role = current_user.role if current_user else "guest"

    if _is_personal_info_question(payload.question):
        return {
            "answer": NO_PERSONAL_DATA_ANSWER,
            "sources": [],
            "role": effective_role,
            "retrieval": "scope_guard",
            "confidence": "high",
            "resolved_question": payload.question,
        }

    account_answer = await _account_api_answer(payload.question, current_user, db)
    if account_answer:
        account_answer["resolved_question"] = payload.question
        return account_answer

    analytics_answer = await _analytics_api_answer(payload.question, current_user, db)
    if analytics_answer:
        analytics_answer["resolved_question"] = payload.question
        return analytics_answer

    if not _is_sigfleet_related_question(payload.question):
        return {
            "answer": OUT_OF_SCOPE_ANSWER,
            "sources": [],
            "role": effective_role,
            "retrieval": "scope_guard",
            "confidence": "high",
            "resolved_question": payload.question,
        }

    followup_answer = _date_followup_answer(payload.question, payload.conversation_history)
    if followup_answer:
        followup_answer["role"] = effective_role
        followup_answer["resolved_question"] = payload.question
        return followup_answer

    effective_question = _resolve_question(payload.question, payload.conversation_history)
    subquestions = _split_compound_questions(effective_question)
    if len(subquestions) > 1:
        answers = []
        sources = []
        confidence = "high"
        retrievals = []
        for subquestion in subquestions:
            result = await _answer_one_question(subquestion, effective_role, db)
            answers.append(f"{_compound_heading(subquestion)}\n{result['answer']}")
            sources.extend(result.get("sources") or [])
            retrievals.append(result.get("retrieval", "unknown"))
            if result.get("confidence") == "low":
                confidence = "low"
        return {
            "answer": "\n\n".join(answers),
            "sources": _dedupe_sources(sources),
            "role": effective_role,
            "retrieval": "compound:" + ",".join(retrievals),
            "confidence": confidence,
            "resolved_question": effective_question,
            "subquestions": subquestions,
        }

    return await _answer_one_question(effective_question, effective_role, db)


@router.post("/reindex")
async def reindex_help():
    await _sync_knowledge_base()
    db = get_mongo_db()
    count = await db[COLLECTION_NAME].count_documents({})
    return {"success": True, "chunks": count}
