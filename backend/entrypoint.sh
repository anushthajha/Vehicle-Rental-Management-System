#!/bin/bash
set -e

echo ">>> Waiting for MySQL..."
until mysqladmin ping --ssl=0 -h "${MYSQL_HOST:-mysql}" -u "${MYSQL_USER:-zoomuser}" -p"${MYSQL_PASSWORD:-zoompass}" --silent; do
  sleep 2
done
echo ">>> MySQL ready."

echo ">>> Waiting for MongoDB..."
until python -c "
import asyncio
import motor.motor_asyncio

async def main():
    client = motor.motor_asyncio.AsyncIOMotorClient('${MONGODB_URL}', serverSelectionTimeoutMS=2000)
    await client.admin.command('ping')
    client.close()

asyncio.run(main())
" 2>/dev/null; do
  sleep 2
done
echo ">>> MongoDB ready."

echo ">>> Running Alembic migrations..."
alembic upgrade head

echo ">>> Checking if seed is needed..."
SEED_NEEDED=$(python -c "
import asyncio
from app.database import async_session_maker
from app.database import engine
from app.models.user import User
from sqlalchemy import select, func
async def main():
    async with async_session_maker() as s:
        r = await s.execute(select(func.count(User.id)))
        count = r.scalar()
    await engine.dispose()
    return count
count = asyncio.run(main())
print('YES' if count == 0 else 'NO')
")

if [ "$SEED_NEEDED" = "YES" ]; then
  echo ">>> Seeding database..."
  python -m app.seed
  echo ">>> Seed complete."
else
  echo ">>> Database already seeded. Skipping."
fi

echo ">>> Starting FastAPI server..."
exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
