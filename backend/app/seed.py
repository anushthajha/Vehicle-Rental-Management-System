import asyncio
from datetime import datetime

from sqlalchemy import select

from app.database import async_session_maker, engine
from app.models.user import User
from app.mongodb import connect_mongo, disconnect_mongo, get_mongo_db


async def seed_mysql() -> User:
    async with async_session_maker() as db:
        result = await db.execute(select(User).where(User.email == "admin@zoomcar.com"))
        admin = result.scalar_one_or_none()
        if admin:
            return admin

        admin = User(
            email="admin@zoomcar.com",
            hashed_password="phase1-placeholder-hash",
            full_name="Zoomcar Admin",
            phone="9999999999",
            is_active=True,
            is_verified=True,
            role="admin",
        )
        db.add(admin)
        await db.commit()
        return admin


async def seed_mongodb(admin: User) -> None:
    await connect_mongo()
    db = get_mongo_db()
    exists = await db.activity_feed.find_one({"action": "initial_seed"})
    if not exists:
        await db.activity_feed.insert_one(
            {
                "actor_id": admin.id,
                "action": "initial_seed",
                "entity_type": "system",
                "entity_id": "docker-scaffold",
                "payload": {"message": "Phase 1 scaffold bootstrapped successfully"},
                "created_at": datetime.utcnow(),
            }
        )
    await disconnect_mongo()


async def seed() -> None:
    try:
        admin = await seed_mysql()
        await seed_mongodb(admin)
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(seed())
