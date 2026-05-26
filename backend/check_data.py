import asyncio
import sys
import os

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import select, func
from app.database import AsyncSessionLocal
from app.models.payment import Payment
from app.models.booking import Booking
from app.models.user import User

async def main():
    async with AsyncSessionLocal() as db:
        user_count = await db.scalar(select(func.count()).select_from(User))
        booking_count = await db.scalar(select(func.count()).select_from(Booking))
        payment_count = await db.scalar(select(func.count()).select_from(Payment))
        print(f"Users: {user_count}, Bookings: {booking_count}, Payments: {payment_count}")

if __name__ == "__main__":
    asyncio.run(main())
