import asyncio
import random
import string
from datetime import datetime, timedelta
from decimal import Decimal
from secrets import token_hex

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import AsyncSessionLocal, engine
from app.models.booking import Booking, BookingExtension
from app.models.car import Car, CarImage, CarPricingRule
from app.models.coupon import Coupon, CouponUsage
from app.models.host import HostProfile
from app.models.payment import Payment, UserWallet, WalletTransaction
from app.models.support import SupportTicket
from app.models.user import User, UserKYC
from app.mongodb import connect_mongo, disconnect_mongo, get_mongo_db
from app.utils.auth import get_password_hash


SEED_RANDOM = random.Random(14014)


def money(value: int | float | str) -> Decimal:
    return Decimal(str(value)).quantize(Decimal("0.01"))


def now_utc() -> datetime:
    return datetime.utcnow().replace(microsecond=0)


def booking_ref(used: set[str]) -> str:
    while True:
        suffix = "".join(SEED_RANDOM.choice(string.ascii_uppercase) for _ in range(6))
        ref = f"JPSN{suffix}"
        if ref not in used:
            used.add(ref)
            return ref


def sim_txn() -> str:
    return f"SIM_TXN_{token_hex(6).upper()}"


def category_deposit(category: str) -> Decimal:
    return {
        "hatchback": money(500),
        "sedan": money(750),
        "suv": money(1000),
        "muv": money(1000),
        "electric": money(1000),
        "luxury": money(3000),
    }.get(category, money(1000))


def category_extra_km(category: str) -> Decimal:
    return {
        "hatchback": money(8),
        "sedan": money(10),
        "suv": money(12),
        "muv": money(12),
        "electric": money(10),
        "luxury": money(15),
    }.get(category, money(10))


def registration_number(city: str, year: int, index: int) -> str:
    state = {
        "Bengaluru": "KA",
        "Mumbai": "MH",
        "Delhi": "DL",
        "Pune": "MH",
        "Chennai": "TN",
    }.get(city, "KA")
    series = "AB" if state in {"TN", "MH", "DL"} else "MN"
    return f"{state}{str(year)[-2:]}{series}{1000 + index:04d}"


async def has_demo_data(db: AsyncSession) -> bool:
    result = await db.execute(select(func.count(Car.id)))
    return (result.scalar() or 0) > 0


async def create_admin(db: AsyncSession) -> User:
    result = await db.execute(select(User).where(User.email == "admin@sigfleet.com"))
    admin = result.scalar_one_or_none()
    if admin is None:
        admin = User(
            email="admin@sigfleet.com",
            hashed_password=get_password_hash("Admin@1234"),
            full_name="SigFleet Admin",
            phone="9000000000",
            is_active=True,
            is_verified=True,
            is_host=False,
            role="admin",
        )
        db.add(admin)
    else:
        admin.hashed_password = get_password_hash("Admin@1234")
        admin.full_name = "SigFleet Admin"
        admin.phone = admin.phone or "9000000000"
        admin.is_active = True
        admin.is_verified = True
        admin.role = "admin"
    await db.flush()
    wallet = (await db.execute(select(UserWallet).where(UserWallet.user_id == admin.id))).scalar_one_or_none()
    if wallet is None:
        db.add(UserWallet(user_id=admin.id, balance=money(0)))
    profile = (await db.execute(select(HostProfile).where(HostProfile.user_id == admin.id))).scalar_one_or_none()
    if profile is None:
        db.add(
            HostProfile(
                user_id=admin.id,
                bio="Administrative vehicle_manager profile stub for operational tooling.",
                response_time="Instant",
            )
        )
    return admin


async def create_vehicle_managers(db: AsyncSession) -> dict[str, User]:
    host_rows = [
        ("Priya Sharma", "priya@vehicle_manager.com", "Bengaluru", 12500, 95, 68, "4.90", True),
        ("Arjun Mehta", "arjun@vehicle_manager.com", "Mumbai", 9800, 92, 54, "4.80", True),
        ("Kavitha Nair", "kavitha@vehicle_manager.com", "Chennai", 7600, 89, 38, "4.60", False),
        ("Rohit Verma", "rohit@vehicle_manager.com", "Delhi", 11250, 90, 45, "4.70", False),
        ("Sneha Patel", "sneha@vehicle_manager.com", "Pune", 14500, 88, 72, "4.80", False),
    ]
    vehicle_managers: dict[str, User] = {}
    for idx, (name, email, city, balance, acceptance, reviews, rating, superhost) in enumerate(host_rows, start=1):
        vehicle_manager = User(
            email=email,
            hashed_password=get_password_hash("Pass@1234"),
            full_name=name,
            phone=f"91111000{idx:02d}",
            is_active=True,
            is_verified=True,
            is_host=True,
            role="vehicle_manager",
        )
        db.add(vehicle_manager)
        await db.flush()
        vehicle_managers[name.split()[0]] = vehicle_manager
        db.add_all(
            [
                UserWallet(user_id=vehicle_manager.id, balance=money(balance)),
                UserKYC(
                    user_id=vehicle_manager.id,
                    dl_number=f"{city[:2].upper()}-DL-2024-{7200 + idx}",
                    aadhar_number=f"XXXX-XXXX-{4300 + idx}",
                    kyc_status="approved",
                    submitted_at=now_utc() - timedelta(days=45 + idx),
                    reviewed_at=now_utc() - timedelta(days=42 + idx),
                ),
                HostProfile(
                    user_id=vehicle_manager.id,
                    bio=f"{name} manages clean, well-maintained self-drive cars across {city}.",
                    response_time="Within 10 minutes",
                    acceptance_rate=money(acceptance),
                    total_reviews=reviews,
                    average_rating=money(rating),
                    is_superhost=superhost,
                    joined_as_host_at=now_utc() - timedelta(days=260 + idx * 13),
                    payout_bank_name="HDFC Bank",
                    payout_account_number=f"XXXXXX{820000 + idx}",
                    payout_ifsc="HDFC0001234",
                    payout_account_holder=name,
                ),
            ]
        )
    return vehicle_managers


async def create_guests(db: AsyncSession) -> dict[str, User]:
    names = [
        "Amit Kumar",
        "Divya Reddy",
        "Rahul Singh",
        "Ananya Das",
        "Karan Mehta",
        "Pooja Iyer",
        "Vivek Sharma",
        "Meera Nair",
        "Siddharth Raj",
        "Lakshmi Pillai",
    ]
    cities = ["Bengaluru", "Mumbai", "Delhi", "Chennai", "Pune", "Bengaluru", "Delhi", "Mumbai", "Pune", "Chennai"]
    balances = [2800, 3000, 2400, 1750, 1300, 2200, 900, 650, 400, 250]
    guests: dict[str, User] = {}
    for idx, (name, city, balance) in enumerate(zip(names, cities, balances, strict=True), start=1):
        status = "approved" if idx <= 7 else "under_review" if idx <= 9 else "pending"
        customer = User(
            email=f"customer{idx}@customer.com",
            hashed_password=get_password_hash("Guest@1234"),
            full_name=name,
            phone=f"92222000{idx:02d}",
            is_active=True,
            is_verified=idx <= 9,
            is_host=False,
            role="customer",
        )
        db.add(customer)
        await db.flush()
        guests[f"guest{idx}"] = customer
        submitted_at = now_utc() - timedelta(days=30 - idx) if status != "pending" else None
        db.add_all(
            [
                UserWallet(user_id=customer.id, balance=money(balance)),
                UserKYC(
                    user_id=customer.id,
                    dl_number=f"{city[:2].upper()}-GUEST-DL-{6100 + idx}",
                    aadhar_number=f"XXXX-XXXX-{5500 + idx}",
                    kyc_status=status,
                    submitted_at=submitted_at,
                    reviewed_at=(submitted_at + timedelta(days=2)) if status == "approved" and submitted_at else None,
                ),
            ]
        )
    return guests


CAR_ROWS = [
    ("Priya", "Maruti", "Swift", 2022, "Hatchback", "manual", "petrol", 5, 50, 599, "Bengaluru", "Koramangala", 12.9716, 77.5946, "4.7", 45, ["AC", "Music"], True, True, False),
    ("Priya", "Hyundai", "Creta", 2023, "SUV", "automatic", "petrol", 5, 80, 999, "Bengaluru", "Indiranagar", 12.9352, 77.6245, "4.8", 62, ["AC", "Sunroof", "Music", "Keyless Entry"], False, False, True),
    ("Arjun", "Tata", "Nexon EV", 2023, "Electric", "automatic", "electric", 5, 70, 850, "Bengaluru", "Whitefield", 12.9698, 77.7500, "4.9", 30, ["AC", "Music", "GPS", "Keyless Entry"], False, True, True),
    ("Arjun", "Honda", "City", 2022, "Sedan", "automatic", "petrol", 5, 65, 750, "Bengaluru", "HSR Layout", 12.9279, 77.6271, "4.6", 38, ["AC", "Music"], False, False, False),
    ("Priya", "Mahindra", "Thar", 2023, "SUV", "manual", "diesel", 4, 100, 1299, "Bengaluru", "Yelahanka", 13.0358, 77.5970, "4.9", 55, ["AC", "Music", "GPS"], False, True, True),
    ("Arjun", "Toyota", "Innova Crysta", 2022, "MUV", "automatic", "diesel", 7, 90, 1100, "Bengaluru", "JP Nagar", 12.9141, 77.6101, "4.7", 28, ["AC", "Music", "Keyless Entry"], False, False, False),
    ("Priya", "Kia", "Seltos", 2023, "SUV", "automatic", "petrol", 5, 85, 1050, "Bengaluru", "Domlur", 12.9784, 77.6408, "4.5", 20, ["AC", "Music", "Keyless Entry"], False, False, False),
    ("Arjun", "BMW", "3 Series", 2022, "Luxury", "automatic", "petrol", 5, 200, 2500, "Bengaluru", "Koramangala", 12.9611, 77.6387, "4.8", 15, ["AC", "Sunroof", "Music", "Keyless Entry", "GPS"], False, True, True),
    ("Arjun", "Maruti", "Baleno", 2023, "Hatchback", "automatic", "petrol", 5, 55, 650, "Mumbai", "Andheri West", 19.0760, 72.8777, "4.4", 33, ["AC", "Music"], False, False, False),
    ("Priya", "Hyundai", "Venue", 2022, "SUV", "manual", "diesel", 5, 70, 850, "Mumbai", "Borivali", 19.1136, 72.8697, "4.6", 18, ["AC", "Music"], False, False, False),
    ("Arjun", "Tata", "Harrier", 2023, "SUV", "automatic", "diesel", 5, 90, 1150, "Mumbai", "Worli", 18.9220, 72.8347, "4.6", 24, ["AC", "Music", "GPS"], False, True, False),
    ("Priya", "MG", "Hector", 2022, "SUV", "automatic", "petrol", 5, 85, 1099, "Mumbai", "Bandra", 19.0544, 72.8400, "4.5", 16, ["AC", "Sunroof", "Music"], False, False, False),
    ("Sneha", "Mercedes", "GLA", 2021, "Luxury", "automatic", "petrol", 5, 250, 3000, "Mumbai", "Lower Parel", 19.0176, 72.8562, "4.9", 22, ["AC", "Sunroof", "Music", "Keyless Entry", "GPS"], False, True, True),
    ("Rohit", "Maruti", "Dzire", 2023, "Sedan", "manual", "cng", 5, 45, 550, "Delhi", "Rohini", 28.6692, 77.2241, "4.3", 48, ["AC", "Music"], False, False, False),
    ("Sneha", "Hyundai", "i20", 2022, "Hatchback", "automatic", "petrol", 5, 55, 650, "Delhi", "Noida Sec-62", 28.5355, 77.3910, "4.5", 29, ["AC", "Music"], False, False, False),
    ("Rohit", "Toyota", "Fortuner", 2022, "SUV", "automatic", "diesel", 7, 120, 1500, "Delhi", "Dwarka", 28.6328, 77.2197, "4.8", 41, ["AC", "Music", "GPS", "Keyless Entry"], False, True, True),
    ("Sneha", "Mahindra", "XUV700", 2023, "SUV", "automatic", "diesel", 7, 100, 1299, "Delhi", "Greater Noida", 28.5672, 77.3210, "4.7", 19, ["AC", "Sunroof", "Music"], False, False, False),
    ("Sneha", "Renault", "Kwid", 2022, "Hatchback", "manual", "petrol", 5, 35, 450, "Pune", "Kothrud", 18.5204, 73.8567, "4.2", 31, ["Music"], False, False, False),
    ("Kavitha", "Kia", "Carens", 2023, "MUV", "automatic", "petrol", 7, 80, 999, "Pune", "Hinjewadi", 18.5911, 73.7384, "4.6", 12, ["AC", "Music", "Keyless Entry"], False, False, False),
    ("Sneha", "Audi", "A4", 2021, "Luxury", "automatic", "petrol", 5, 220, 2800, "Pune", "Camp Area", 18.5018, 73.8636, "4.8", 9, ["AC", "Sunroof", "Music", "Keyless Entry", "GPS"], False, True, True),
    ("Kavitha", "Tata", "Altroz", 2023, "Hatchback", "automatic", "petrol", 5, 48, 580, "Pune", "Hadapsar", 18.4526, 73.8498, "4.4", 22, ["AC", "Music"], False, False, False),
    ("Kavitha", "Hyundai", "Tucson", 2022, "SUV", "automatic", "petrol", 5, 95, 1200, "Chennai", "Anna Nagar", 13.0827, 80.2707, "4.5", 14, ["AC", "Music", "GPS"], False, True, False),
    ("Rohit", "Maruti", "Grand Vitara", 2023, "SUV", "automatic", "hybrid", 5, 85, 1050, "Chennai", "Velachery", 13.0418, 80.2341, "4.7", 27, ["AC", "Music", "Keyless Entry"], False, False, True),
    ("Kavitha", "Honda", "Amaze", 2022, "Sedan", "manual", "petrol", 5, 55, 650, "Chennai", "Porur", 13.0600, 80.2101, "4.4", 19, ["AC", "Music"], False, False, False),
    ("Rohit", "Jeep", "Compass", 2022, "SUV", "automatic", "diesel", 5, 110, 1400, "Chennai", "OMR", 12.9236, 80.1315, "4.6", 11, ["AC", "Music", "GPS"], False, True, False),
]


async def create_cars(db: AsyncSession, vehicle_managers: dict[str, User]) -> dict[str, Car]:
    cars: dict[str, Car] = {}
    host_listing_counts: dict[str, int] = {vehicle_manager.id: 0 for vehicle_manager in vehicle_managers.values()}
    for idx, row in enumerate(CAR_ROWS, start=1):
        (
            host_key,
            make,
            model,
            year,
            category_label,
            transmission,
            fuel_type,
            seats,
            hourly,
            daily,
            city,
            area,
            lat,
            lng,
            rating,
            trips,
            features,
            auto_accept,
            gps,
            featured,
        ) = row
        category = category_label.lower()
        title = f"{make} {model} {year}"
        car = Car(
            host_id=vehicle_managers[host_key].id,
            title=title,
            make=make,
            car_model=model,
            year=year,
            color=["White", "Silver", "Red", "Blue", "Black"][idx % 5],
            transmission=transmission,
            fuel_type=fuel_type,
            seats=seats,
            category=category,
            description=f"{title} in {area}, {city}. Clean, regularly serviced, and ready for self-drive trips.",
            registration_number=registration_number(city, year, idx),
            location_city=city,
            location_area=area,
            location_lat=money(lat),
            location_lng=money(lng),
            location_address=f"{area}, {city}",
            price_per_hour=money(hourly),
            price_per_day=money(daily),
            security_deposit=category_deposit(category),
            extra_km_charge=category_extra_km(category),
            included_km_per_day=300,
            is_available=True,
            is_approved=True,
            is_featured=featured,
            has_gps_tracker=gps or "GPS" in features,
            has_keyless_entry="Keyless Entry" in features,
            has_ac="AC" in features,
            has_music_system="Music" in features,
            has_sunroof="Sunroof" in features,
            auto_accept_bookings=auto_accept,
            average_rating=money(rating),
            total_trips=trips,
            total_earnings=money(trips * daily * Decimal("0.72")),
        )
        db.add(car)
        await db.flush()
        cars[model] = car
        cars[title] = car
        host_listing_counts[car.host_id] += 1

        image_count = 4 + (idx % 3)
        images = []
        for order in range(image_count):
            seed = f"{make.replace(' ', '')}{idx}" if order == 0 else f"{make.replace(' ', '')}{model.replace(' ', '')}{idx}{order}"
            images.append(
                CarImage(
                    car_id=car.id,
                    image_url=f"https://picsum.photos/seed/{seed}/800/500",
                    is_primary=order == 0,
                    order_index=order,
                )
            )
        db.add_all(images)

    profiles = await db.execute(select(HostProfile))
    for profile in profiles.scalars():
        if profile.user_id in host_listing_counts:
            profile.total_listings = host_listing_counts[profile.user_id]

    db.add_all(
        [
            CarPricingRule(car_id=cars["Thar"].id, rule_type="long_trip_discount", min_days=3, discount_percent=money(10)),
            CarPricingRule(car_id=cars["3 Series"].id, rule_type="peak_surcharge", applies_on="weekend", surcharge_percent=money(15)),
            CarPricingRule(car_id=cars["Fortuner"].id, rule_type="long_trip_discount", min_days=5, discount_percent=money(15)),
        ]
    )
    return cars


def booking_amounts(total: int | float, insurance: int | float = 0, discount: int | float = 0) -> dict[str, Decimal]:
    total_amount = money(total)
    discount_amount = money(discount)
    insurance_amount = money(insurance)
    base = total_amount - insurance_amount + discount_amount
    platform_fee = (total_amount * Decimal("0.10")).quantize(Decimal("0.01"))
    return {
        "base_amount": base,
        "discount_amount": discount_amount,
        "insurance_amount": insurance_amount,
        "total_amount": total_amount,
        "platform_fee": platform_fee,
        "host_earnings": (base * Decimal("0.80")).quantize(Decimal("0.01")),
    }


async def add_booking(
    db: AsyncSession,
    refs: set[str],
    car: Car,
    customer: User,
    status: str,
    pickup: datetime,
    return_at: datetime,
    total: int | float,
    insurance_plan: str | None = "standard",
    insurance_amount: int | float = 0,
    coupon_code: str | None = None,
    discount: int | float = 0,
    actual_pickup: datetime | None = None,
    actual_return: datetime | None = None,
    odometer_start: int | None = None,
    odometer_end: int | None = None,
    cancellation_reason: str | None = None,
    cancelled_by: str | None = None,
    cancelled_at: datetime | None = None,
    refund_amount: int | float = 0,
    refund_status: str = "not_applicable",
    guest_notes: str | None = None,
    created_at: datetime | None = None,
) -> Booking:
    amounts = booking_amounts(total, insurance_amount, discount)
    total_hours = money((return_at - pickup).total_seconds() / 3600)
    booking = Booking(
        booking_ref=booking_ref(refs),
        car_id=car.id,
        guest_id=customer.id,
        host_id=car.host_id,
        status=status,
        pickup_datetime=pickup,
        return_datetime=return_at,
        actual_pickup_time=actual_pickup,
        actual_return_time=actual_return,
        pickup_location=f"{car.location_area}, {car.location_city}",
        total_hours=total_hours,
        base_amount=amounts["base_amount"],
        discount_amount=amounts["discount_amount"],
        coupon_code=coupon_code,
        insurance_amount=amounts["insurance_amount"],
        insurance_plan=insurance_plan,
        security_deposit_amount=car.security_deposit,
        total_amount=amounts["total_amount"],
        platform_fee=amounts["platform_fee"],
        host_earnings=amounts["host_earnings"],
        odometer_start=odometer_start,
        odometer_end=odometer_end,
        cancellation_reason=cancellation_reason,
        cancelled_by=cancelled_by,
        cancelled_at=cancelled_at,
        refund_amount=money(refund_amount),
        refund_status=refund_status,
        host_accepted_at=(created_at or now_utc()) + timedelta(hours=2) if status in {"confirmed", "active", "completed", "cancelled"} else None,
        guest_notes=guest_notes,
    )
    if created_at:
        booking.created_at = created_at
        booking.updated_at = created_at
    db.add(booking)
    await db.flush()
    return booking


async def create_bookings_and_payments(
    db: AsyncSession,
    cars: dict[str, Car],
    guests: dict[str, User],
) -> tuple[dict[str, Booking], dict[str, Payment]]:
    base = now_utc()
    refs: set[str] = set()
    bookings: dict[str, Booking] = {}
    bookings["B1"] = await add_booking(db, refs, cars["Creta"], guests["guest1"], "completed", base - timedelta(days=7), base - timedelta(days=5), 1998, "standard", 199, "FLAT100", 100, base - timedelta(days=7), base - timedelta(days=5, hours=-1), 18420, 19065, created_at=base - timedelta(days=8))
    bookings["B2"] = await add_booking(db, refs, cars["Thar"], guests["guest2"], "completed", base - timedelta(days=10), base - timedelta(days=8), 2598, "platinum", 350, actual_pickup=base - timedelta(days=10), actual_return=base - timedelta(days=8, hours=-2), odometer_start=28110, odometer_end=28780, created_at=base - timedelta(days=11))
    bookings["B3"] = await add_booking(db, refs, cars["GLA"], guests["guest3"], "completed", base - timedelta(days=15), base - timedelta(days=12), 9000, "platinum", 750, actual_pickup=base - timedelta(days=15), actual_return=base - timedelta(days=12), odometer_start=12340, odometer_end=12910, created_at=base - timedelta(days=16))
    bookings["B4"] = await add_booking(db, refs, cars["Fortuner"], guests["guest4"], "active", base - timedelta(days=1), base + timedelta(days=2), 3000, "standard", 300, actual_pickup=base - timedelta(days=1), created_at=base - timedelta(days=2))
    bookings["B5"] = await add_booking(db, refs, cars["Innova Crysta"], guests["guest5"], "active", base.replace(hour=8, minute=0, second=0), base.replace(hour=22, minute=0, second=0), 1100, "basic", 100, actual_pickup=base.replace(hour=8, minute=3, second=0), created_at=base - timedelta(days=1))
    bookings["B6"] = await add_booking(db, refs, cars["Harrier"], guests["guest6"], "active", base - timedelta(days=2), base + timedelta(days=1), 2300, "standard", 250, actual_pickup=base - timedelta(days=2), created_at=base - timedelta(days=3))
    bookings["B7"] = await add_booking(db, refs, cars["Seltos"], guests["guest7"], "confirmed", base + timedelta(days=3), base + timedelta(days=5), 2100, "standard", 250, created_at=base - timedelta(hours=12))
    bookings["B8"] = await add_booking(db, refs, cars["Baleno"], guests["guest1"], "confirmed", base + timedelta(days=5), base + timedelta(days=6), 650, "basic", 50, created_at=base - timedelta(hours=10))
    bookings["B9"] = await add_booking(db, refs, cars["XUV700"], guests["guest2"], "confirmed", base + timedelta(days=7), base + timedelta(days=10), 3897, "standard", 300, created_at=base - timedelta(hours=8))
    bookings["B10"] = await add_booking(db, refs, cars["Grand Vitara"], guests["guest3"], "confirmed", base + timedelta(days=10), base + timedelta(days=12), 2100, "standard", 250, created_at=base - timedelta(hours=7))
    bookings["B11"] = await add_booking(db, refs, cars["City"], guests["guest4"], "pending", base + timedelta(days=2), base + timedelta(days=4), 1500, None, 0, guest_notes="Need pickup around noon.", created_at=base - timedelta(hours=5))
    bookings["B12"] = await add_booking(db, refs, cars["Dzire"], guests["guest5"], "pending", base + timedelta(days=3), base + timedelta(days=4), 550, None, 0, created_at=base - timedelta(hours=4))
    bookings["B13"] = await add_booking(db, refs, cars["Kwid"], guests["guest6"], "pending", base + timedelta(days=1), base + timedelta(days=2), 450, None, 0, created_at=base - timedelta(hours=3))
    bookings["B14"] = await add_booking(db, refs, cars["Tucson"], guests["guest7"], "cancelled", base + timedelta(days=1), base + timedelta(days=3), 2400, "standard", 250, cancellation_reason="Plans changed", cancelled_by=guests["guest7"].id, cancelled_at=base - timedelta(hours=20), refund_amount=1200, refund_status="processed", created_at=base - timedelta(days=2))
    bookings["B15"] = await add_booking(db, refs, cars["i20"], guests["guest8"], "cancelled", base + timedelta(days=2), base + timedelta(days=3), 650, None, 0, cancellation_reason="Booking was never paid", cancelled_by=guests["guest8"].id, cancelled_at=base - timedelta(hours=15), created_at=base - timedelta(days=1))
    bookings["B16"] = await add_booking(db, refs, cars["Swift"], guests["guest4"], "cancelled", base + timedelta(days=4), base + timedelta(days=6), 1198, "standard", 150, cancellation_reason="Car maintenance", cancelled_by=cars["Swift"].host_id, cancelled_at=base - timedelta(hours=6), refund_amount=1198, refund_status="processed", created_at=base - timedelta(days=2))
    bookings["B17"] = await add_booking(db, refs, cars["Venue"], guests["guest9"], "rejected", base + timedelta(days=6), base + timedelta(days=8), 1700, None, 0, cancellation_reason="Dates not available due to maintenance", cancelled_by=cars["Venue"].host_id, cancelled_at=base - timedelta(hours=2), created_at=base - timedelta(days=1))
    bookings["B18"] = await add_booking(db, refs, cars["Compass"], guests["guest10"], "rejected", base + timedelta(days=8), base + timedelta(days=10), 2800, None, 0, cancellation_reason="Guest rating too low", cancelled_by=cars["Compass"].host_id, cancelled_at=base - timedelta(hours=1), created_at=base - timedelta(hours=20))

    db.add_all(
        [
            BookingExtension(
                booking_id=bookings["B7"].id,
                extended_return_datetime=bookings["B7"].return_datetime + timedelta(days=1),
                additional_amount=money(1050),
                status="pending",
                requested_at=base - timedelta(hours=2),
            ),
            BookingExtension(
                booking_id=bookings["B9"].id,
                extended_return_datetime=bookings["B9"].return_datetime + timedelta(days=1),
                additional_amount=money(1299),
                status="approved",
                requested_at=base - timedelta(hours=6),
                responded_at=base - timedelta(hours=4),
            ),
        ]
    )

    payments: dict[str, Payment] = {}
    paid_keys = {"B1", "B2", "B3", "B4", "B5", "B6", "B7", "B8", "B9", "B10", "B14"}
    for key, booking in bookings.items():
        status = "paid" if key in paid_keys else "created"
        paid_at = None
        txn_id = None
        if status == "paid":
            paid_at = booking.created_at + timedelta(minutes=5)
            txn_id = sim_txn()
        if key == "B16":
            status = "refunded"
            paid_at = booking.created_at + timedelta(minutes=5)
            txn_id = sim_txn()
        payment = Payment(
            booking_id=booking.id,
            user_id=booking.guest_id,
            amount=booking.total_amount,
            payment_method="simulated",
            simulated_transaction_id=txn_id,
            status=status,
            paid_at=paid_at,
            created_at=booking.created_at + timedelta(minutes=1),
        )
        db.add(payment)
        payments[key] = payment
    await db.flush()
    return bookings, payments


async def create_coupons(db: AsyncSession, bookings: dict[str, Booking], guests: dict[str, User]) -> None:
    base = now_utc()
    coupon_rows = [
        ("WELCOME10", "10% off for new users", "percent", 10, 200, 500, None, 365, "new_users"),
        ("FLAT100", "Flat INR 100 off on trips above INR 1000", "flat", 100, None, 1000, 1000, 180, "all"),
        ("WEEKEND20", "20% weekend discount up to INR 500", "percent", 20, 500, 800, None, 90, "all"),
        ("ZC50", "Flat INR 50 off on quick city rides", "flat", 50, None, 300, 5000, 90, "all"),
        ("LONG15", "15% off on multi-day trips", "percent", 15, 1000, 2000, None, 180, "all"),
    ]
    coupons: dict[str, Coupon] = {}
    for code, description, discount_type, value, max_discount, min_amount, usage_limit, days, applicable in coupon_rows:
        coupon = Coupon(
            code=code,
            description=description,
            discount_type=discount_type,
            discount_value=money(value),
            max_discount=money(max_discount) if max_discount is not None else None,
            min_booking_amount=money(min_amount),
            usage_limit=usage_limit,
            used_count=1 if code == "FLAT100" else 0,
            valid_from=base - timedelta(days=1),
            valid_until=base + timedelta(days=days),
            is_active=True,
            applicable_for=applicable,
        )
        db.add(coupon)
        coupons[code] = coupon
    await db.flush()
    db.add(CouponUsage(coupon_id=coupons["FLAT100"].id, user_id=guests["guest1"].id, booking_id=bookings["B1"].id))


async def create_wallet_transactions(
    db: AsyncSession,
    all_users: list[User],
    bookings: dict[str, Booking],
) -> None:
    wallet_rows = await db.execute(select(UserWallet))
    balances = {wallet.user_id: money(wallet.balance) for wallet in wallet_rows.scalars()}
    transactions: list[WalletTransaction] = []

    def add_tx(user_id: str, tx_type: str, amount: Decimal, description: str, reference_id: str | None = None) -> None:
        if tx_type == "credit":
            balances[user_id] = balances.get(user_id, money(0)) + amount
        else:
            balances[user_id] = balances.get(user_id, money(0)) - amount
        transactions.append(
            WalletTransaction(
                user_id=user_id,
                transaction_type=tx_type,
                amount=amount,
                balance_after=balances[user_id],
                description=description,
                reference_id=reference_id,
            )
        )

    for user in all_users:
        add_tx(user.id, "credit", money(100), "Account Welcome Bonus")

    paid_keys = ["B1", "B2", "B3", "B4", "B5", "B6", "B7", "B8", "B9", "B10", "B14", "B16"]
    for key in paid_keys:
        booking = bookings[key]
        add_tx(booking.guest_id, "debit", booking.total_amount, f"Booking payment for {booking.booking_ref}", booking.id)

    for key in ["B1", "B2", "B3"]:
        booking = bookings[key]
        add_tx(booking.host_id, "credit", booking.host_earnings, f"Vehicle Manager earnings for completed trip {booking.booking_ref}", booking.id)

    for key in ["B14", "B16"]:
        booking = bookings[key]
        add_tx(booking.guest_id, "credit", booking.refund_amount, f"Cancellation refund for {booking.booking_ref}", booking.id)

    db.add_all(transactions)
    for wallet in (await db.execute(select(UserWallet))).scalars():
        wallet.balance = balances[wallet.user_id]


async def create_reviews_mongodb(bookings: dict[str, Booking], guests: dict[str, User], vehicle_managers: dict[str, User], cars: dict[str, Car]) -> None:
    db = get_mongo_db()

    def car_snapshot(car: Car) -> dict:
        return {"car_id": car.id, "title": car.title, "city": car.location_city, "area": car.location_area}

    def trip_snapshot(booking: Booking) -> dict:
        return {"booking_ref": booking.booking_ref, "pickup": booking.pickup_datetime, "return": booking.return_datetime}

    reviews = [
        {
            "booking_id": bookings["B1"].id,
            "reviewer_id": guests["guest1"].id,
            "reviewer_name": guests["guest1"].full_name,
            "reviewee_id": cars["Creta"].host_id,
            "car_id": cars["Creta"].id,
            "rating": 5,
            "title": "Perfect SUV for our Coorg trip",
            "body": "Absolutely loved the Creta! AC was ice cold, car was spotless. Priya is a fantastic vehicle_manager.",
            "review_type": "guest_to_car",
            "host_reply": "Thank you so much! Hope to see you again soon.",
            "host_replied_at": now_utc() - timedelta(days=4),
            "created_at": now_utc() - timedelta(days=5),
            "car_snapshot": car_snapshot(cars["Creta"]),
            "trip_snapshot": trip_snapshot(bookings["B1"]),
        },
        {
            "booking_id": bookings["B1"].id,
            "reviewer_id": guests["guest1"].id,
            "reviewer_name": guests["guest1"].full_name,
            "reviewee_id": vehicle_managers["Priya"].id,
            "rating": 5,
            "title": "Excellent vehicle_manager",
            "body": "Priya responded instantly and handover was smooth. Highly recommend!",
            "review_type": "guest_to_host",
            "created_at": now_utc() - timedelta(days=5),
            "car_snapshot": car_snapshot(cars["Creta"]),
            "trip_snapshot": trip_snapshot(bookings["B1"]),
        },
        {
            "booking_id": bookings["B2"].id,
            "reviewer_id": guests["guest2"].id,
            "reviewer_name": guests["guest2"].full_name,
            "reviewee_id": cars["Thar"].host_id,
            "car_id": cars["Thar"].id,
            "rating": 5,
            "title": "Epic off-road experience!",
            "body": "The Thar is an absolute beast! Perfect for our mountain trail trip. Engine was powerful and everything worked perfectly.",
            "review_type": "guest_to_car",
            "created_at": now_utc() - timedelta(days=8),
            "car_snapshot": car_snapshot(cars["Thar"]),
            "trip_snapshot": trip_snapshot(bookings["B2"]),
        },
        {
            "booking_id": bookings["B2"].id,
            "reviewer_id": vehicle_managers["Priya"].id,
            "reviewer_name": vehicle_managers["Priya"].full_name,
            "reviewee_id": guests["guest2"].id,
            "rating": 4,
            "body": "Great customer, took care of the Thar really well. Returned clean and on time.",
            "review_type": "host_to_guest",
            "created_at": now_utc() - timedelta(days=8),
            "car_snapshot": car_snapshot(cars["Thar"]),
            "trip_snapshot": trip_snapshot(bookings["B2"]),
        },
        {
            "booking_id": bookings["B3"].id,
            "reviewer_id": guests["guest3"].id,
            "reviewer_name": guests["guest3"].full_name,
            "reviewee_id": cars["GLA"].host_id,
            "car_id": cars["GLA"].id,
            "rating": 5,
            "title": "Pure luxury on wheels",
            "body": "Incredible luxury car. Smooth ride, amazing interiors. Worth every rupee for our anniversary trip.",
            "review_type": "guest_to_car",
            "created_at": now_utc() - timedelta(days=12),
            "car_snapshot": car_snapshot(cars["GLA"]),
            "trip_snapshot": trip_snapshot(bookings["B3"]),
        },
        {
            "booking_id": bookings["B3"].id,
            "reviewer_id": guests["guest3"].id,
            "reviewer_name": guests["guest3"].full_name,
            "reviewee_id": vehicle_managers["Sneha"].id,
            "rating": 5,
            "title": "5 star vehicle_manager experience",
            "body": "Sneha was incredibly professional. The car was detailed to perfection.",
            "review_type": "guest_to_host",
            "created_at": now_utc() - timedelta(days=12),
            "car_snapshot": car_snapshot(cars["GLA"]),
            "trip_snapshot": trip_snapshot(bookings["B3"]),
        },
    ]
    await db.reviews.insert_many(reviews)


async def create_notifications_mongodb(vehicle_managers: dict[str, User], guests: dict[str, User], bookings: dict[str, Booking], cars: dict[str, Car]) -> None:
    db = get_mongo_db()
    docs = []
    host_booking = {"Priya": "B11", "Arjun": "B17", "Kavitha": "B13", "Rohit": "B18", "Sneha": "B9"}
    host_car = {"Priya": "Swift", "Arjun": "Creta", "Kavitha": "Tucson", "Rohit": "Fortuner", "Sneha": "A4"}
    for key, vehicle_manager in vehicle_managers.items():
        booking = bookings[host_booking[key]]
        docs.extend(
            [
                {"user_id": vehicle_manager.id, "title": "New booking request", "message": f"New booking request from {guests['guest4'].full_name}", "notification_type": "booking", "is_read": False, "action_url": f"/manager/bookings/{booking.id}", "meta": {"booking_id": booking.id}, "created_at": now_utc() - timedelta(hours=3)},
                {"user_id": vehicle_manager.id, "title": "KYC approved", "message": "KYC verification approved", "notification_type": "kyc", "is_read": True, "meta": {}, "created_at": now_utc() - timedelta(days=20)},
                {"user_id": vehicle_manager.id, "title": "Trip earning credited", "message": f"INR {money(booking.host_earnings)} credited for trip completion", "notification_type": "payment", "is_read": False, "meta": {"amount": float(booking.host_earnings)}, "created_at": now_utc() - timedelta(days=2)},
                {"user_id": vehicle_manager.id, "title": "Car listing live", "message": f"Your car {cars[host_car[key]].title} is now live and accepting bookings", "notification_type": "system", "is_read": True, "meta": {"car_id": cars[host_car[key]].id}, "created_at": now_utc() - timedelta(days=18)},
            ]
        )

    guest_confirmed = ["B1", "B2", "B3", "B4", "B5", "B6", "B7"]
    for idx in range(1, 8):
        customer = guests[f"guest{idx}"]
        booking = bookings[guest_confirmed[idx - 1]]
        car = next(car for car in cars.values() if isinstance(car, Car) and car.id == booking.car_id)
        docs.extend(
            [
                {"user_id": customer.id, "title": "Booking confirmed", "message": f"Booking {booking.booking_ref} confirmed!", "notification_type": "booking", "is_read": False, "action_url": f"/dashboard/bookings/{booking.id}", "meta": {"booking_id": booking.id}, "created_at": now_utc() - timedelta(hours=idx)},
                {"user_id": customer.id, "title": "KYC verified", "message": "Your KYC has been verified", "notification_type": "kyc", "is_read": True, "meta": {}, "created_at": now_utc() - timedelta(days=15 + idx)},
                {"user_id": customer.id, "title": "Trip reminder", "message": "Trip reminder: Your trip starts in 2 hours", "notification_type": "booking", "is_read": False, "meta": {"booking_id": booking.id}, "created_at": now_utc() - timedelta(minutes=30 + idx)},
                {"user_id": customer.id, "title": "Review your trip", "message": f"Review your recent trip with {car.title}", "notification_type": "review", "is_read": False, "action_url": f"/dashboard/bookings/{booking.id}/review", "meta": {"car_id": car.id}, "created_at": now_utc() - timedelta(days=1 + idx)},
            ]
        )

    for idx in [8, 9, 10]:
        customer = guests[f"guest{idx}"]
        docs.extend(
            [
                {"user_id": customer.id, "title": "KYC under review", "message": "KYC document submitted. Under review.", "notification_type": "kyc", "is_read": False, "meta": {}, "created_at": now_utc() - timedelta(hours=idx)},
                {"user_id": customer.id, "title": "Welcome to SigFleet", "message": "Welcome to SigFleet! Complete KYC to start booking.", "notification_type": "system", "is_read": False, "meta": {}, "created_at": now_utc() - timedelta(days=idx)},
            ]
        )
    await db.notifications.insert_many(docs)


async def create_support_data(db: AsyncSession, admin: User, guests: dict[str, User], bookings: dict[str, Booking]) -> None:
    tickets = [
        SupportTicket(
            booking_ref=bookings["B14"].booking_ref,
            user_id=guests["guest2"].id,
            assigned_admin_id=admin.id,
            subject="Refund not received for cancelled booking B14",
            description="I cancelled within the policy window but the refund is not visible yet.",
            category="payment",
            status="in_progress",
            priority="high",
        ),
        SupportTicket(
            booking_ref=bookings["B5"].booking_ref,
            user_id=guests["guest5"].id,
            subject="AC was not working properly during trip",
            description="The AC cooling dropped after one hour and made the trip uncomfortable.",
            category="car_issue",
            status="open",
            priority="medium",
        ),
        SupportTicket(
            booking_ref=bookings["B1"].booking_ref,
            user_id=guests["guest1"].id,
            assigned_admin_id=admin.id,
            subject="Cannot access booking details page",
            description="The booking details page was failing to load from my dashboard.",
            category="booking",
            status="resolved",
            priority="low",
        ),
    ]
    db.add_all(tickets)
    await db.flush()
    await db.commit()

    mongo = get_mongo_db()
    await mongo.support_messages.insert_many(
        [
            {"ticket_id": tickets[0].id, "sender_id": guests["guest2"].id, "sender_name": guests["guest2"].full_name, "sender_role": "user", "message": "I still have not received the refund for my cancelled trip. Please check urgently.", "is_staff_reply": False, "created_at": now_utc() - timedelta(hours=8)},
            {"ticket_id": tickets[0].id, "sender_id": admin.id, "sender_name": admin.full_name, "sender_role": "staff", "message": "We're processing your refund within 48h. You will receive a confirmation once the bank reference is generated.", "is_staff_reply": True, "created_at": now_utc() - timedelta(hours=7)},
            {"ticket_id": tickets[1].id, "sender_id": guests["guest5"].id, "sender_name": guests["guest5"].full_name, "sender_role": "user", "message": "The AC was not cooling properly during the afternoon drive. Please inspect the car before the next booking.", "is_staff_reply": False, "created_at": now_utc() - timedelta(hours=5)},
            {"ticket_id": tickets[2].id, "sender_id": guests["guest1"].id, "sender_name": guests["guest1"].full_name, "sender_role": "user", "message": "I cannot access my booking details page from the dashboard.", "is_staff_reply": False, "created_at": now_utc() - timedelta(days=1)},
            {"ticket_id": tickets[2].id, "sender_id": admin.id, "sender_name": admin.full_name, "sender_role": "staff", "message": "We fixed the booking details link. Please refresh your dashboard and try again.", "is_staff_reply": True, "created_at": now_utc() - timedelta(hours=20)},
        ]
    )


async def create_analytics_data(cars: dict[str, Car], guests: dict[str, User]) -> None:
    db = get_mongo_db()
    real_cars = [car for car in cars.values() if isinstance(car, Car)]
    unique_cars = list({car.id: car for car in real_cars}.values())
    guest_list = list(guests.values())
    cities = ["Bengaluru", "Mumbai", "Delhi", "Pune", "Chennai"]
    categories = ["suv", "hatchback", "sedan", "luxury", "muv", "electric"]
    search_docs = []
    for idx in range(20):
        city = cities[idx % len(cities)]
        search_docs.append(
            {
                "user_id": guest_list[idx % len(guest_list)].id,
                "city": city,
                "filters": {
                    "category": categories[idx % len(categories)],
                    "transmission": "automatic" if idx % 3 else "manual",
                    "fuel_type": ["petrol", "diesel", "electric", "hybrid"][idx % 4],
                    "price_max": [700, 1000, 1500, 3000][idx % 4],
                },
                "results_count": SEED_RANDOM.randint(3, 18),
                "created_at": now_utc() - timedelta(days=idx, hours=idx % 6),
            }
        )
    await db.search_logs.insert_many(search_docs)

    view_docs = []
    for idx in range(50):
        car = unique_cars[idx % len(unique_cars)]
        user = guest_list[idx % len(guest_list)]
        view_docs.append(
            {
                "car_id": car.id,
                "user_id": user.id,
                "city": car.location_city,
                "source": ["home", "search", "city_page", "wishlist"][idx % 4],
                "created_at": now_utc() - timedelta(days=SEED_RANDOM.randint(0, 30), hours=idx % 24),
            }
        )
    await db.car_view_events.insert_many(view_docs)
    await db.activity_feed.insert_one(
        {
            "actor_id": "system",
            "action": "phase_14_demo_seed",
            "entity_type": "system",
            "entity_id": "seed",
            "payload": {"users": 16, "cars": 25, "bookings": 18, "extensions": 2},
            "created_at": now_utc(),
        }
    )


async def seed() -> None:
    await connect_mongo()
    try:
        async with AsyncSessionLocal() as db:
            if await has_demo_data(db):
                print("Demo data already exists; skipping seed.")
                return

            admin = await create_admin(db)
            vehicle_managers = await create_vehicle_managers(db)
            guests = await create_guests(db)
            cars = await create_cars(db, vehicle_managers)
            bookings, _payments = await create_bookings_and_payments(db, cars, guests)
            await create_coupons(db, bookings, guests)
            await create_wallet_transactions(db, [admin, *vehicle_managers.values(), *guests.values()], bookings)
            await db.commit()

            mongo = get_mongo_db()
            if await mongo.activity_feed.find_one({"action": "phase_14_demo_seed"}):
                print("MongoDB demo seed marker already exists; skipping MongoDB seed.")
                return

            await create_reviews_mongodb(bookings, guests, vehicle_managers, cars)
            await create_notifications_mongodb(vehicle_managers, guests, bookings, cars)
            await create_support_data(db, admin, guests, bookings)
            await create_analytics_data(cars, guests)
            print("Demo seed complete.")
    finally:
        await disconnect_mongo()
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(seed())
