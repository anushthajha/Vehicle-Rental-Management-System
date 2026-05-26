import asyncio
import sys
import os

# Add the current directory to python path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import select, func
from app.database import AsyncSessionLocal
from app.models.payment import Payment
from app.models.booking import Booking
from app.models.user import User
from app.utils.auth import verify_password

async def main():
    async with AsyncSessionLocal() as db:
        try:
            admin = await db.scalar(select(User).where(User.email == "admin@sigfleet.com"))
            if admin:
                print("Admin password matches 'Admin@1234':", verify_password("Admin@1234", admin.hashed_password))
            
            customer1 = await db.scalar(select(User).where(User.email == "customer1@test.com"))
            if customer1:
                print("Customer 1 password matches 'Customer@1234':", verify_password("Customer@1234", customer1.hashed_password))
        except Exception as e:
            print("ERROR:")
            import traceback
            traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(main())
