#!/bin/bash
set -e

echo ">>> Waiting for MySQL..."
until python -c "
import asyncio
from sqlalchemy import text
from app.database import engine

async def main():
    async with engine.connect() as conn:
        await conn.execute(text('SELECT 1'))
    await engine.dispose()

asyncio.run(main())
" 2>/dev/null; do
  sleep 2
done
echo ">>> MySQL ready."

echo ">>> Waiting for MongoDB..."
until python -c "
import asyncio
import motor.motor_asyncio

async def main():
    client = motor.motor_asyncio.AsyncIOMotorClient('${MONGODB_URL}', serverSelectionTimeoutMS=5000)
    await client.admin.command('ping')
    client.close()

asyncio.run(main())
" 2>/dev/null; do
  sleep 2
done
echo ">>> MongoDB ready."

echo ">>> Running Alembic migrations..."
alembic upgrade head

if [ "${RUN_SEED:-false}" = "true" ]; then
  echo ">>> Running seed check..."
  python app/seed.py
else
  echo ">>> Skipping seed check. Set RUN_SEED=true to seed demo data."
fi

echo ">>> Starting FastAPI server..."
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
