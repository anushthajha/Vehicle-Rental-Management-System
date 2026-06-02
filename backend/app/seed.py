import asyncio
import random
import string
import sys
from datetime import datetime, timedelta
from decimal import Decimal
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP_DIR = Path(__file__).resolve().parent
if str(APP_DIR) in sys.path:
    sys.path.remove(str(APP_DIR))
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import AsyncSessionLocal, engine
from app.models.booking import Booking
from app.models.coupon import Coupon, CouponUsage
from app.models.manager import ManagerPayoutRequest, ManagerProfile
from app.models.payment import Payment, UserWallet, WalletTransaction
from app.models.support import SupportTicket
from app.models.user import User, UserKYC
from app.models.base import generate_uuid
from app.models.vehicle import Vehicle, VehicleImage
from app.models.vehicle_category import VehicleCategory, VehicleType
from app.mongodb import connect_mongo, disconnect_mongo, get_mongo_db
from app.utils.auth import get_password_hash


NOW = datetime.utcnow().replace(microsecond=0)
PASSWORDS = {"admin": "Admin@123", "vehicle_manager": "Manager@123", "customer": "Customer@123"}
SUMMARY = {}


def money(value) -> Decimal:
    return Decimal(str(value)).quantize(Decimal("0.01"))


def log(section: str, inserted: int | None = None, skipped: bool = False) -> None:
    if skipped:
        print(f"Skipping {section} - already seeded")
    else:
        print(f"Seeding {section}... done ({inserted or 0} inserted)")
    SUMMARY[section] = inserted or 0


async def count_rows(db: AsyncSession, model) -> int:
    return await db.scalar(select(func.count()).select_from(model)) or 0


async def commit_records(db: AsyncSession, section: str, records, factory) -> int:
    inserted = 0
    for record in records:
        try:
            async with db.begin_nested():
                obj = factory(record)
                if isinstance(obj, (list, tuple)):
                    db.add_all(obj)
                else:
                    db.add(obj)
                await db.flush()
            inserted += 1
        except Exception as exc:
            print(f"Seed error in {section}: {record} -> {exc}")
    await db.commit()
    log(section, inserted)
    return inserted


def booking_ref(index: int) -> str:
    return f"SF{NOW.strftime('%m%d')}{index:04d}"


def reg(city: str, index: int) -> str:
    state = {
        "Bengaluru": "KA",
        "Mumbai": "MH",
        "Delhi": "DL",
        "Chennai": "TN",
        "Pune": "MH",
        "Hyderabad": "TS",
        "Goa": "GA",
        "Jaipur": "RJ",
    }.get(city, "KA")
    return f"{state}{index + 10:02d}SF{1000 + index:04d}"


USERS = [
    ("Super Admin", "admin@sigfleet.com", "admin", None, True, None),
    ("Ops Admin", "ops@sigfleet.com", "admin", None, True, None),
    ("Ravi Kumar", "ravi@sigfleet.com", "vehicle_manager", None, True, "Bengaluru"),
    ("Priya Sharma", "priya@sigfleet.com", "vehicle_manager", None, True, "Mumbai"),
    ("Arjun Mehta", "arjun@sigfleet.com", "vehicle_manager", None, True, "Delhi"),
    ("Sneha Iyer", "sneha@sigfleet.com", "vehicle_manager", None, True, "Chennai"),
    ("Karan Patel", "karan@sigfleet.com", "vehicle_manager", None, True, "Pune"),
    ("Anika Reddy", "anika@sigfleet.com", "vehicle_manager", None, True, "Hyderabad"),
    ("Deepak Rathore", "deepak@sigfleet.com", "vehicle_manager", None, True, "Jaipur"),
    ("Amit Singh", "amit@example.com", "customer", "9876543210", True, None),
    ("Divya Nair", "divya@example.com", "customer", "9876543211", True, None),
    ("Rohan Gupta", "rohan@example.com", "customer", "9876543212", True, None),
    ("Meera Joshi", "meera@example.com", "customer", "9876543213", True, None),
    ("Vikram Rao", "vikram@example.com", "customer", "9876543214", True, None),
    ("Pooja Menon", "pooja@example.com", "customer", "9876543215", True, None),
    ("Siddharth Das", "sid@example.com", "customer", "9876543216", True, None),
    ("Lakshmi Pillai", "lakshmi@example.com", "customer", "9876543217", True, None),
    ("Nikhil Verma", "nikhil@example.com", "customer", "9876543218", True, None),
    ("Tanvi Shah", "tanvi@example.com", "customer", "9876543219", True, None),
]

CATEGORIES = [
    ("Hatchback", "hatchback", "Compact and fuel-efficient city cars", "car"),
    ("Sedan", "sedan", "Comfortable mid-size cars for long drives", "car"),
    ("SUV", "suv", "Spacious vehicles for family and off-road trips", "truck"),
    ("Luxury", "luxury", "Premium vehicles for a premium experience", "star"),
    ("Electric", "electric", "Zero emission electric vehicles", "zap"),
    ("MUV / MPV", "muv", "Multi-utility vehicles for large groups", "users"),
    ("Convertible", "convertible", "Open-top cars for a thrilling drive", "wind"),
]

VEHICLES = [
    ("ravi@sigfleet.com", "Maruti", "Swift", 2023, "Hatchback", 1200, 5, "petrol", "manual", "Bengaluru", ["AC", "Music System", "Power Windows"]),
    ("ravi@sigfleet.com", "Hyundai", "Creta", 2023, "SUV", 2500, 5, "petrol", "automatic", "Bengaluru", ["AC", "Sunroof", "Rear Camera", "Cruise Control"]),
    ("ravi@sigfleet.com", "Tata", "Nexon EV", 2023, "Electric", 2200, 5, "electric", "automatic", "Bengaluru", ["AC", "Fast Charging", "Connected Car Tech"]),
    ("ravi@sigfleet.com", "BMW", "3 Series", 2022, "Luxury", 6000, 5, "petrol", "automatic", "Bengaluru", ["Leather Seats", "Sunroof", "Harman Audio", "360 Camera"]),
    ("ravi@sigfleet.com", "Toyota", "Innova Crysta", 2022, "MUV / MPV", 3000, 7, "diesel", "manual", "Bengaluru", ["AC", "Captain Seats", "Rear AC Vents"]),
    ("priya@sigfleet.com", "Honda", "City", 2023, "Sedan", 1800, 5, "petrol", "automatic", "Mumbai", ["AC", "Sunroof", "Lane Watch Camera"]),
    ("priya@sigfleet.com", "Maruti", "Baleno", 2023, "Hatchback", 1300, 5, "petrol", "automatic", "Mumbai", ["AC", "360 Camera", "HUD Display"]),
    ("priya@sigfleet.com", "Mercedes-Benz", "GLC", 2022, "Luxury", 8000, 5, "petrol", "automatic", "Mumbai", ["Panoramic Roof", "Burmester Audio", "Air Suspension"]),
    ("priya@sigfleet.com", "Tata", "Safari", 2023, "SUV", 2800, 7, "diesel", "automatic", "Mumbai", ["AC", "Panoramic Sunroof", "ADAS"]),
    ("priya@sigfleet.com", "MG", "ZS EV", 2023, "Electric", 2400, 5, "electric", "automatic", "Mumbai", ["AC", "Connected Car", "Fast Charging"]),
    ("arjun@sigfleet.com", "Hyundai", "i20", 2023, "Hatchback", 1100, 5, "petrol", "manual", "Delhi", ["AC", "Apple CarPlay", "Wireless Charging"]),
    ("arjun@sigfleet.com", "Skoda", "Slavia", 2023, "Sedan", 2000, 5, "petrol", "automatic", "Delhi", ["AC", "Ventilated Seats", "Electric Sunroof"]),
    ("arjun@sigfleet.com", "Audi", "Q5", 2022, "Luxury", 7500, 5, "diesel", "automatic", "Delhi", ["Virtual Cockpit", "Bang & Olufsen Audio", "Matrix LED"]),
    ("arjun@sigfleet.com", "Kia", "Seltos", 2023, "SUV", 2300, 5, "petrol", "automatic", "Delhi", ["AC", "Bose Audio", "360 Camera", "ADAS"]),
    ("arjun@sigfleet.com", "Mahindra", "XUV700", 2023, "SUV", 3200, 7, "diesel", "automatic", "Delhi", ["ADAS", "Panoramic Sunroof", "Sony Audio"]),
    ("sneha@sigfleet.com", "Toyota", "Glanza", 2023, "Hatchback", 1150, 5, "petrol", "automatic", "Chennai", ["AC", "Wireless Charger", "Head-Up Display"]),
    ("sneha@sigfleet.com", "Honda", "Amaze", 2023, "Sedan", 1600, 5, "petrol", "automatic", "Chennai", ["AC", "Rear Camera", "Lane Watch"]),
    ("sneha@sigfleet.com", "Volkswagen", "Taigun", 2023, "SUV", 2200, 5, "petrol", "automatic", "Chennai", ["AC", "Ventilated Seats", "Digital Cockpit"]),
    ("sneha@sigfleet.com", "Tata", "Tiago EV", 2023, "Electric", 1500, 5, "electric", "automatic", "Chennai", ["AC", "Fast Charging", "Connected Car"]),
    ("karan@sigfleet.com", "Maruti", "Ertiga", 2023, "MUV / MPV", 2000, 7, "cng", "manual", "Pune", ["AC", "Rear AC Vents", "Wireless Charger"]),
    ("karan@sigfleet.com", "Hyundai", "Verna", 2023, "Sedan", 1900, 5, "petrol", "automatic", "Pune", ["Ventilated Seats", "BOSE Audio", "ADAS"]),
    ("karan@sigfleet.com", "Jeep", "Compass", 2022, "SUV", 3500, 5, "diesel", "automatic", "Pune", ["Leather Seats", "9-inch Infotainment", "4x4"]),
    ("karan@sigfleet.com", "Porsche", "Cayenne", 2022, "Luxury", 12000, 5, "petrol", "automatic", "Pune", ["Air Suspension", "Panoramic Roof", "Sport Chrono"]),
    ("anika@sigfleet.com", "Renault", "Kwid", 2023, "Hatchback", 900, 5, "petrol", "manual", "Hyderabad", ["AC", "Touchscreen", "Rear Parking Sensors"]),
    ("anika@sigfleet.com", "Nissan", "Magnite", 2023, "SUV", 1700, 5, "petrol", "automatic", "Hyderabad", ["AC", "360 Camera", "Wireless Charger"]),
    ("anika@sigfleet.com", "BYD", "Atto 3", 2023, "Electric", 3000, 5, "electric", "automatic", "Hyderabad", ["AC", "Fast Charging", "Rotating Console"]),
    ("anika@sigfleet.com", "Toyota", "Fortuner", 2022, "SUV", 4500, 7, "diesel", "automatic", "Hyderabad", ["4x4", "Leather Seats", "JBL Audio"]),
    ("ravi@sigfleet.com", "Maruti", "Jimny", 2023, "SUV", 2600, 4, "petrol", "manual", "Goa", ["4x4", "AC", "Off-Road Capability"]),
    ("ravi@sigfleet.com", "Mini", "Cooper Convertible", 2022, "Convertible", 9000, 4, "petrol", "automatic", "Goa", ["Open Top", "Harman Audio", "Sport Mode"]),
    ("ravi@sigfleet.com", "Mahindra", "Thar", 2023, "SUV", 3000, 4, "diesel", "manual", "Goa", ["4x4", "Convertible Top", "Off-Road Tyres"]),
    ("deepak@sigfleet.com", "Maruti", "Dzire", 2023, "Sedan", 1400, 5, "cng", "manual", "Jaipur", ["AC", "CNG Kit", "Music System"]),
    ("deepak@sigfleet.com", "Hyundai", "Venue", 2023, "SUV", 1800, 5, "petrol", "automatic", "Jaipur", ["AC", "Sunroof", "Wireless Charger"]),
    ("deepak@sigfleet.com", "Tata", "Punch", 2023, "SUV", 1300, 5, "petrol", "manual", "Jaipur", ["AC", "Terrain Modes", "Rear Camera"]),
]

BOOKINGS = [
    ("amit@example.com", "Maruti Swift", -30, -28, "completed"),
    ("divya@example.com", "Hyundai Creta", -25, -22, "completed"),
    ("meera@example.com", "Honda City", -20, -18, "completed"),
    ("pooja@example.com", "Kia Seltos", -18, -15, "completed"),
    ("sid@example.com", "Hyundai Verna", -15, -13, "completed"),
    ("nikhil@example.com", "Mahindra Thar", -12, -10, "completed"),
    ("tanvi@example.com", "Tata Nexon EV", -10, -8, "completed"),
    ("amit@example.com", "Toyota Fortuner", -8, -5, "completed"),
    ("rohan@example.com", "Toyota Glanza", -7, -6, "completed"),
    ("lakshmi@example.com", "Jeep Compass", -6, -4, "completed"),
    ("meera@example.com", "BMW 3 Series", -35, -33, "completed"),
    ("divya@example.com", "Mini Cooper Convertible", -40, -37, "completed"),
    ("pooja@example.com", "Audi Q5", -45, -43, "completed"),
    ("nikhil@example.com", "Tata Safari", -50, -47, "completed"),
    ("tanvi@example.com", "Toyota Innova Crysta", -55, -52, "completed"),
    ("amit@example.com", "Hyundai Creta", 3, 5, "confirmed"),
    ("divya@example.com", "Kia Seltos", 5, 7, "confirmed"),
    ("meera@example.com", "BYD Atto 3", 7, 9, "confirmed"),
    ("sid@example.com", "Volkswagen Taigun", 4, 6, "confirmed"),
    ("rohan@example.com", "Maruti Baleno", 6, 8, "confirmed"),
    ("pooja@example.com", "Maruti Jimny", -1, 2, "active"),
    ("vikram@example.com", "Nissan Magnite", 0, 3, "active"),
    ("tanvi@example.com", "Maruti Ertiga", -1, 1, "active"),
    ("lakshmi@example.com", "Renault Kwid", -5, -3, "cancelled"),
    ("nikhil@example.com", "Hyundai i20", -3, -2, "cancelled"),
]


async def seed_users(db: AsyncSession):
    existing = set((await db.execute(select(User.email))).scalars().all())
    missing = [row for row in USERS if row[1] not in existing]
    if not missing:
        log("users", skipped=True)
        return

    def factory(row):
        name, email, role, phone, verified, _city = row
        return User(
            full_name=name,
            email=email,
            hashed_password=get_password_hash(PASSWORDS[role]),
            phone=phone,
            role=role,
            is_active=True,
            is_verified=verified,
            is_vehicle_manager=role == "vehicle_manager",
            created_at=NOW - timedelta(days=90),
        )

    await commit_records(db, "users", missing, factory)


async def seed_categories(db: AsyncSession):
    existing = set((await db.execute(select(VehicleCategory.slug))).scalars().all())
    missing = [row for row in CATEGORIES if row[1] not in existing]
    if not missing:
        log("vehicle categories", skipped=True)
    else:
        records = list(enumerate(missing, start=1))

        def factory(row):
            order, (name, slug, description, icon) = row
            return VehicleCategory(name=name, slug=slug, description=description, icon_name=icon, display_order=order, is_active=True)

        await commit_records(db, "vehicle categories", records, factory)

    if not await db.scalar(select(VehicleType.id).where(VehicleType.slug == "car")):
        db.add(VehicleType(name="Car", slug="car", description="Cars and SUVs", is_active=True))
        await db.commit()


async def lookups(db: AsyncSession):
    users = {user.email: user for user in (await db.execute(select(User))).scalars().all()}
    category_rows = (await db.execute(select(VehicleCategory))).scalars().all()
    categories = {category.name: category for category in category_rows}
    categories_by_slug = {category.slug: category for category in category_rows}
    categories["MUV"] = categories.get("MUV / MPV") or categories_by_slug.get("muv")
    categories["MUV / MPV"] = categories.get("MUV / MPV") or categories_by_slug.get("muv")
    car_type = await db.scalar(select(VehicleType).where(VehicleType.slug == "car"))
    vehicles = {vehicle.title: vehicle for vehicle in (await db.execute(select(Vehicle))).scalars().all()}
    return users, categories, car_type, vehicles


async def seed_manager_profiles(db: AsyncSession):
    users, _, _, _ = await lookups(db)
    existing = set((await db.execute(select(ManagerProfile.user_id))).scalars().all())
    managers = [user for user in users.values() if user.role == "vehicle_manager" and user.id not in existing]
    if not managers:
        log("manager profiles", skipped=True)
        return

    def factory(manager):
        return ManagerProfile(
            user_id=manager.id,
            bio=f"{manager.full_name} manages verified SigFleet vehicles.",
            department="Fleet Operations",
            acceptance_rate=money(92),
            average_vehicle_rating=money(4.7),
            total_reviews=12,
            is_active=True,
            payout_bank_name="HDFC Bank",
            payout_account_number=f"XXXXXX{random.randint(1000, 9999)}",
            payout_ifsc="HDFC0001234",
            payout_account_holder=manager.full_name,
        )

    await commit_records(db, "manager profiles", managers, factory)


async def seed_vehicles(db: AsyncSession):
    users, categories, car_type, _ = await lookups(db)
    existing = set((await db.execute(select(Vehicle.title, Vehicle.location_city))).all())
    missing = [row for row in VEHICLES if (f"{row[1]} {row[2]}", row[9]) not in existing]
    if not missing:
        log("vehicles", skipped=True)
        return
    image_base = "https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?auto=format&fit=crop&w=900&q=80"
    # Vehicle-specific images mapped by model name
    VEHICLE_IMAGES = {
        "Swift": "https://images.unsplash.com/photo-1609521263047-f8f205293f24?w=800",
        "Creta": "https://images.unsplash.com/photo-1619767886558-efdc259cde1a?w=800",
        "Nexon EV": "https://images.unsplash.com/photo-1560958089-b8a1929cea89?w=800",
        "3 Series": "https://images.unsplash.com/photo-1555215695-3004980ad54e?w=800",
        "Innova Crysta": "https://images.unsplash.com/photo-1549317661-bd32c8ce0afa?w=800",
        "City": "https://images.unsplash.com/photo-1606611013016-969c19ba27bb?w=800",
        "Baleno": "https://images.unsplash.com/photo-1541899481282-d53bffe3c35d?w=800",
        "GLC": "https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8?w=800",
        "Safari": "https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=800",
        "ZS EV": "https://images.unsplash.com/photo-1593941707882-a5bba14938c7?w=800",
        "i20": "https://images.unsplash.com/photo-1552519507-da3b142c6e3d?w=800",
        "Slavia": "https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=800",
        "Q5": "https://images.unsplash.com/photo-1606664515524-ed2f786a0bd6?w=800",
        "Seltos": "https://images.unsplash.com/photo-1619767886558-efdc259cde1a?w=800",
        "XUV700": "https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=800",
        "Glanza": "https://images.unsplash.com/photo-1541899481282-d53bffe3c35d?w=800",
        "Amaze": "https://images.unsplash.com/photo-1606611013016-969c19ba27bb?w=800",
        "Taigun": "https://images.unsplash.com/photo-1549317661-bd32c8ce0afa?w=800",
        "Tiago EV": "https://images.unsplash.com/photo-1560958089-b8a1929cea89?w=800",
        "Ertiga": "https://images.unsplash.com/photo-1549317661-bd32c8ce0afa?w=800",
        "Verna": "https://images.unsplash.com/photo-1552519507-da3b142c6e3d?w=800",
        "Compass": "https://images.unsplash.com/photo-1519641471654-76ce0107ad1b?w=800",
        "Cayenne": "https://images.unsplash.com/photo-1503736334956-4c8f8e92946d?w=800",
        "Kwid": "https://images.unsplash.com/photo-1609521263047-f8f205293f24?w=800",
        "Magnite": "https://images.unsplash.com/photo-1541899481282-d53bffe3c35d?w=800",
        "Atto 3": "https://images.unsplash.com/photo-1593941707882-a5bba14938c7?w=800",
        "Fortuner": "https://images.unsplash.com/photo-1519641471654-76ce0107ad1b?w=800",
        "Jimny": "https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=800",
        "Cooper Convertible": "https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=800",
        "Thar": "https://images.unsplash.com/photo-1519641471654-76ce0107ad1b?w=800",
        "Dzire": "https://images.unsplash.com/photo-1606611013016-969c19ba27bb?w=800",
        "Venue": "https://images.unsplash.com/photo-1552519507-da3b142c6e3d?w=800",
        "Punch": "https://images.unsplash.com/photo-1541899481282-d53bffe3c35d?w=800",
    }

    def get_vehicle_image(model_name):
        for key, url in VEHICLE_IMAGES.items():
            if key in model_name:
                return url
        return image_base
    records = list(enumerate(missing, start=(await count_rows(db, Vehicle)) + 1))

    def factory(row):
        index, (owner_email, brand, model, year, category, price, seats, fuel, transmission, city, features) = row
        title = f"{brand} {model}"
        vehicle_id = generate_uuid()
        vehicle = Vehicle(
            id=vehicle_id,
            manager_id=users[owner_email].id,
            title=title,
            make=brand,
            car_model=model,
            year=year,
            color="White",
            transmission=transmission,
            fuel_type=fuel,
            seats=seats,
            category_id=categories[category].id,
            vehicle_type_id=car_type.id if car_type else None,
            description=f"{title} in {city}. Features: {', '.join(features)}.",
            registration_number=reg(city, index),
            location_city=city,
            location_area="Central",
            location_address=f"SigFleet {city} Hub",
            price_per_hour=money(int(price) / 24),
            price_per_day=money(price),
            security_deposit=money(max(500, int(price) // 2)),
            extra_km_charge=money(10),
            is_available=True,
            is_approved=True,
            auto_accept_bookings=True,
            is_featured=index <= 8,
            has_ac="AC" in features,
            has_music_system=True,
            has_sunroof=any("Sunroof" in item or "Roof" in item for item in features),
            has_keyless_entry="Keyless Entry" in features,
            has_gps_tracker=True,
            average_rating=money(4.2 + (index % 7) / 10),
            total_trips=0,
            created_at=NOW - timedelta(days=80 - index),
        )
        image = VehicleImage(vehicle_id=vehicle_id, image_url=get_vehicle_image(model), is_primary=True, order_index=0)
        return [vehicle, image]

    await commit_records(db, "vehicles", records, factory)


async def seed_coupons(db: AsyncSession):
    await db.execute(CouponUsage.__table__.delete())
    await db.execute(Coupon.__table__.delete())
    rows = [
        ("FIRST5", "percent", 5, 500, 150, 180, "5% off for first-time users", "new_users", 1),
        ("FLEET5", "percent", 5, 2000, 200, 90, "5% off on bookings above Rs 2000", "all", None),
        ("EV5", "percent", 5, 1000, 150, 120, "5% off on electric vehicle bookings", "all", None),
        ("WEEKEND5", "percent", 5, 1500, 175, 60, "5% off on weekend bookings", "all", None),
        ("CITY5", "percent", 5, 800, 120, 150, "5% off on outstation bookings", "all", None),
    ]
    if not rows:
        log("coupons", skipped=True)
        return

    def factory(row):
        code, discount_type, value, minimum, max_discount, days, description, applicable_for, usage_limit = row
        return Coupon(code=code, discount_type=discount_type, discount_value=money(value), min_booking_amount=money(minimum), max_discount=money(max_discount), valid_from=NOW - timedelta(days=1), valid_until=NOW + timedelta(days=days), is_active=True, description=description, applicable_for=applicable_for, usage_limit=usage_limit)

    await commit_records(db, "coupons", rows, factory)


async def seed_bookings(db: AsyncSession):
    users, _, _, vehicles = await lookups(db)
    existing = set((await db.execute(select(Booking.booking_ref))).scalars().all())
    records = [(index, row) for index, row in enumerate(BOOKINGS, start=1) if booking_ref(index) not in existing]
    if not records:
        log("bookings", skipped=True)
        return

    def factory(row):
        index, (customer_email, vehicle_title, start_offset, end_offset, status) = row
        vehicle = vehicles[vehicle_title]
        start = NOW + timedelta(days=start_offset)
        end = NOW + timedelta(days=end_offset)
        days = max((end.date() - start.date()).days, 1)
        total = money(vehicle.price_per_day * days)
        platform = money(total * Decimal("0.10"))
        return Booking(
            booking_ref=booking_ref(index),
            vehicle_id=vehicle.id,
            customer_id=users[customer_email].id,
            manager_id=vehicle.manager_id,
            status=status,
            pickup_datetime=start,
            return_datetime=end,
            actual_pickup_time=start if status in {"active", "completed"} else None,
            actual_return_time=end if status == "completed" else None,
            pickup_location=vehicle.location_address,
            total_hours=money(days * 24),
            base_amount=total,
            discount_amount=money(0),
            insurance_amount=money(0),
            insurance_plan="basic",
            security_deposit_amount=vehicle.security_deposit,
            with_chauffeur=index % 5 == 0,
            chauffeur_fee=money(800 * days) if index % 5 == 0 else money(0),
            total_amount=total + (money(800 * days) if index % 5 == 0 else money(0)),
            platform_fee=platform,
            manager_earnings=total - platform,
            refund_status="processed" if status == "cancelled" else "not_applicable",
            refund_amount=total if status == "cancelled" else money(0),
            cancelled_at=NOW + timedelta(days=end_offset) if status == "cancelled" else None,
            cancellation_reason="Customer cancelled" if status == "cancelled" else None,
            created_at=start - timedelta(days=2),
        )

    await commit_records(db, "bookings", records, factory)


async def seed_payments(db: AsyncSession):
    existing = set((await db.execute(select(Payment.booking_id))).scalars().all())
    bookings = (await db.execute(select(Booking).where(Booking.status != "cancelled").order_by(Booking.created_at))).scalars().all()
    bookings = [booking for booking in bookings if booking.id not in existing]
    if not bookings:
        log("payments", skipped=True)
        return
    methods = ["upi", "card", "wallet"]

    def factory(row):
        index, booking = row
        return Payment(booking_id=booking.id, user_id=booking.customer_id, amount=booking.total_amount, payment_method=methods[index % 3], status="paid", paid_at=booking.pickup_datetime, created_at=booking.pickup_datetime, simulated_transaction_id=f"SIM-{booking.booking_ref}")

    await commit_records(db, "payments", list(enumerate(bookings, start=1)), factory)


async def seed_kyc(db: AsyncSession):
    users, _, _, _ = await lookups(db)
    existing = set((await db.execute(select(UserKYC.user_id))).scalars().all())
    pending = {"rohan@example.com", "vikram@example.com", "lakshmi@example.com"}
    rows = [user for user in users.values() if user.role in {"customer", "vehicle_manager"} and user.id not in existing]
    if not rows:
        log("kyc documents", skipped=True)
        return

    def factory(user):
        is_pending = user.email in pending
        return UserKYC(
            user_id=user.id,
            dl_number=None if is_pending else f"DL-{user.id[:8].upper()}",
            aadhar_number=f"XXXX-XXXX-{random.randint(1000, 9999)}",
            aadhar_front_image="/uploads/kyc/aadhaar-front-demo.png",
            aadhar_back_image="/uploads/kyc/aadhaar-back-demo.png",
            kyc_status="pending" if is_pending else "approved",
            submitted_at=NOW - timedelta(days=2 if is_pending else 60),
            reviewed_at=None if is_pending else NOW - timedelta(days=58),
        )

    await commit_records(db, "kyc documents", rows, factory)


async def seed_support(db: AsyncSession):
    users, _, _, _ = await lookups(db)
    rows = [
        ("amit@example.com", "Booking cancellation refund", "I cancelled my booking 3 days ago but have not received the refund yet.", "open", "payment", 5),
        ("divya@example.com", "Car was not clean on pickup", "The Creta had dirty interiors at pickup.", "resolved", "car_issue", 10),
        ("rohan@example.com", "Unable to complete KYC", "The KYC upload keeps failing.", "in_progress", "account", 3),
        ("meera@example.com", "Wrong amount charged", "I was charged Rs 500 extra on my last booking.", "open", "payment", 2),
        ("vikram@example.com", "App login issue", "Cannot log in after password reset.", "resolved", "account", 15),
        ("pooja@example.com", "Vehicle breakdown during trip", "The Safari broke down on the highway.", "in_progress", "car_issue", 1),
        ("sid@example.com", "Coupon not applied", "Used FLEET20 but discount was not applied.", "open", "booking", 4),
        ("lakshmi@example.com", "Request for invoice", "Please send the GST invoice for booking #21.", "resolved", "booking", 8),
    ]

    existing = set((await db.execute(select(SupportTicket.subject))).scalars().all())
    rows = [row for row in rows if row[1] not in existing]
    if not rows:
        log("support tickets", skipped=True)
        return

    def factory(row):
        email, subject, description, status, category, days = row
        return SupportTicket(user_id=users[email].id, contact_name=users[email].full_name, contact_email=email, subject=subject, description=description, status=status, category=category, priority="high" if status == "open" else "medium", created_at=NOW - timedelta(days=days))

    await commit_records(db, "support tickets", rows, factory)


async def seed_wallets(db: AsyncSession):
    users, _, _, _ = await lookups(db)
    existing = set((await db.execute(select(UserWallet.user_id))).scalars().all())
    balances = {"amit@example.com": 1500, "divya@example.com": 800, "meera@example.com": 2200}
    customers = [user for user in users.values() if user.role == "customer" and user.id not in existing]
    if not customers:
        log("wallets", skipped=True)
        return

    def factory(user):
        balance = money(balances.get(user.email, 500))
        wallet = UserWallet(user_id=user.id, balance=balance)
        txns = [WalletTransaction(user_id=user.id, transaction_type="credit", amount=money(500), balance_after=money(500), description="Signup bonus", created_at=NOW - timedelta(days=70))]
        extra = balance - money(500)
        if extra > 0:
            txns.append(WalletTransaction(user_id=user.id, transaction_type="credit", amount=extra, balance_after=balance, description="Refund or cashback credit", created_at=NOW - timedelta(days=20)))
        return [wallet, *txns]

    await commit_records(db, "wallets", customers, factory)


async def seed_payouts(db: AsyncSession):
    if await count_rows(db, ManagerPayoutRequest):
        log("manager payouts", skipped=True)
        return
    users, _, _, _ = await lookups(db)
    managers = [user for user in users.values() if user.role == "vehicle_manager"]
    rows = []
    for manager in managers:
        total = await db.scalar(select(func.coalesce(func.sum(Booking.manager_earnings), 0)).where(Booking.manager_id == manager.id, Booking.status == "completed")) or Decimal("0")
        if total <= 0:
            total = money(1000)
        rows.append((manager.id, money(total) * Decimal("0.60"), "paid", NOW - timedelta(days=30), NOW - timedelta(days=29)))
        rows.append((manager.id, money(total) * Decimal("0.40"), "pending", NOW - timedelta(days=1), None))

    def factory(row):
        manager_id, amount, status, requested_at, processed_at = row
        return ManagerPayoutRequest(manager_id=manager_id, amount=money(amount), status=status, requested_at=requested_at, processed_at=processed_at)

    await commit_records(db, "manager payouts", rows, factory)


async def seed_mongo(db: AsyncSession):
    await connect_mongo()
    mongo = get_mongo_db()
    users, _, _, vehicles = await lookups(db)
    bookings = (await db.execute(select(Booking).order_by(Booking.created_at))).scalars().all()

    if await mongo.reviews.count_documents({}) == 0:
        comments = [
            (5, "Great car, very smooth drive. Well maintained!"),
            (5, "Excellent condition, pickup was easy. Highly recommend."),
            (4, "Good experience overall, AC could be better."),
            (5, "Loved the Creta. Perfect for our trip."),
            (5, "BMW was absolutely worth it. Fantastic experience."),
            (4, "Clean vehicle and quick handover."),
            (4, "Comfortable ride and fair pricing."),
            (3, "Good vehicle, pickup took a little longer."),
            (5, "Excellent SUV for a family trip."),
            (4, "Smooth booking and return experience."),
        ]
        docs = []
        completed = [booking for booking in bookings if booking.status == "completed"][:10]
        for booking, (rating, body) in zip(completed, comments, strict=False):
            customer = next(user for user in users.values() if user.id == booking.customer_id)
            vehicle = next(vehicle for vehicle in vehicles.values() if vehicle.id == booking.vehicle_id)
            docs.append({"booking_id": booking.id, "reviewer_id": customer.id, "reviewer_name": customer.full_name, "reviewee_id": booking.manager_id, "vehicle_id": vehicle.id, "rating": rating, "title": "Great rental", "body": body, "review_type": "customer_to_vehicle", "is_published": True, "created_at": booking.return_datetime + timedelta(days=1), "car_snapshot": {"title": vehicle.title}, "trip_snapshot": {"booking_ref": booking.booking_ref}})
        if docs:
            await mongo.reviews.insert_many(docs, ordered=False)
        log("reviews", len(docs))
    else:
        log("reviews", skipped=True)

    if await mongo.notifications.count_documents({}) == 0:
        notification_rows = [
            ("amit@example.com", "Your booking has been confirmed!", "Booking 16 is confirmed.", "booking", False),
            ("pooja@example.com", "Trip started. Enjoy your ride!", "Your Goa trip has started.", "booking", True),
            ("amit@example.com", "Your KYC has been approved.", "You can now book vehicles.", "kyc", False),
            ("lakshmi@example.com", "Booking cancelled successfully.", "Your cancellation was recorded.", "booking", True),
            ("ravi@sigfleet.com", "Your vehicle Creta has been approved.", "Hyundai Creta is live.", "manager", True),
            ("ravi@sigfleet.com", "New booking received for Swift.", "Amit booked your Swift.", "booking", False),
            ("ravi@sigfleet.com", "Payment of Rs 7500 received.", "Payment settled for Creta.", "payment", True),
            ("rohan@example.com", "Your KYC is pending review.", "We are reviewing your documents.", "kyc", False),
            ("amit@example.com", "Booking reminder: Trip starts tomorrow!", "Your trip begins soon.", "booking", False),
            ("divya@example.com", "Review your last trip!", "Tell us about your Honda City rental.", "review", False),
            ("meera@example.com", "Wallet credited Rs 200 cashback.", "Cashback has been added.", "payment", True),
            ("pooja@example.com", "Support ticket is being processed.", "Our team is working on it.", "system", False),
            ("divya@example.com", "New vehicle registered in your city.", "Check out new Mumbai vehicles.", "promotion", True),
            ("tanvi@example.com", "Your account has been verified.", "Welcome to SigFleet.", "system", True),
        ]
        customers = [user for user in users.values() if user.role == "customer"]
        docs = [{"user_id": customer.id, "title": "New coupon available: WEEKEND25", "message": "Use WEEKEND25 on your next booking.", "notification_type": "promotion", "is_read": False, "created_at": NOW - timedelta(days=3)} for customer in customers]
        docs.extend({"user_id": users[email].id, "title": title, "message": message, "notification_type": typ, "is_read": is_read, "created_at": NOW - timedelta(days=random.randint(1, 15))} for email, title, message, typ, is_read in notification_rows)
        await mongo.notifications.insert_many(docs, ordered=False)
        log("notifications", len(docs))
    else:
        log("notifications", skipped=True)
    await disconnect_mongo()


async def refresh_manager_totals(db: AsyncSession):
    users, _, _, _ = await lookups(db)
    for manager in [user for user in users.values() if user.role == "vehicle_manager"]:
        profile = await db.scalar(select(ManagerProfile).where(ManagerProfile.user_id == manager.id))
        if not profile:
            continue
        profile.total_vehicles = await db.scalar(select(func.count()).select_from(Vehicle).where(Vehicle.manager_id == manager.id)) or 0
        profile.total_bookings_handled = await db.scalar(select(func.count()).select_from(Booking).where(Booking.manager_id == manager.id)) or 0
        profile.total_revenue_generated = await db.scalar(select(func.coalesce(func.sum(Booking.manager_earnings), 0)).where(Booking.manager_id == manager.id, Booking.status == "completed")) or Decimal("0")
    await db.commit()


async def main():
    try:
        async with AsyncSessionLocal() as db:
            await seed_users(db)
            await seed_categories(db)
            await seed_manager_profiles(db)
            await seed_vehicles(db)
            await seed_coupons(db)
            await seed_bookings(db)
            await seed_payments(db)
            await seed_kyc(db)
            await seed_support(db)
            await seed_wallets(db)
            await seed_payouts(db)
            await refresh_manager_totals(db)
            await seed_mongo(db)
        print(
            "Seed complete. "
            f"Users: {SUMMARY.get('users', 0)}, Vehicles: {SUMMARY.get('vehicles', 0)}, "
            f"Bookings: {SUMMARY.get('bookings', 0)}, Payments: {SUMMARY.get('payments', 0)}, "
            f"Reviews: {SUMMARY.get('reviews', 0)}, Coupons: {SUMMARY.get('coupons', 0)}, "
            f"Tickets: {SUMMARY.get('support tickets', 0)}, Notifications: {SUMMARY.get('notifications', 0)}"
        )
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
