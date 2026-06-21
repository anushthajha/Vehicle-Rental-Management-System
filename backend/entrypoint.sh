#!/bin/bash
set -e

# On Render, external DBs (Aiven MySQL, MongoDB Atlas) are always reachable
# immediately — no Docker networking delay. Skip the local wait loops if
# SKIP_DB_WAIT=true (set this in Render's env vars).

if [ "${SKIP_DB_WAIT:-false}" != "true" ]; then

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
import os

async def main():
    client = motor.motor_asyncio.AsyncIOMotorClient(os.environ['MONGODB_URL'], serverSelectionTimeoutMS=5000)
    await client.admin.command('ping')
    client.close()

asyncio.run(main())
" 2>/dev/null; do
    sleep 2
  done
  echo ">>> MongoDB ready."

fi

echo ">>> Running Alembic migrations..."
alembic upgrade head

if [ "${RUN_SEED:-false}" = "true" ]; then
  echo ">>> Running seed..."
  python -m app.seed
else
  echo ">>> Skipping seed. Set RUN_SEED=true to seed demo data."
fi

echo ">>> Starting FastAPI server on port ${PORT:-8000}..."
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
