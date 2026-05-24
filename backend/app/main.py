from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.database import init_db
from app.middleware.auth_middleware import OptionalAuthMiddleware
from app.middleware.error_handler import register_error_handlers
from app.mongodb import connect_mongo, disconnect_mongo
from app.redis import close_redis
from app.routers import (
    admin,
    auth,
    availability,
    bookings,
    vehicles,
    categories,
    manager_earnings,
    kyc,
    manager,
    notifications,
    payments,
    reviews,
    support,
    users,
    wishlist,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    await connect_mongo()
    yield
    await close_redis()
    await disconnect_mongo()


app = FastAPI(
    title="SigFleet API",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost", "http://localhost:3000", "http://localhost:5173", "http://localhost:5174", "http://localhost:5175"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(OptionalAuthMiddleware)
register_error_handlers(app)

app.mount("/uploads", StaticFiles(directory=settings.UPLOAD_DIR), name="uploads")


@app.get("/api/health")
async def health_check():
    return {"status": "ok", "service": "sigfleet-backend"}


@app.get("/api")
async def api_root():
    return {
        "name": "SigFleet API",
        "version": "1.0.0",
        "docs": "/api/docs",
    }


for router in [
    auth.router,
    users.router,
    vehicles.router,
    availability.router,
    categories.router,
    bookings.router,
    payments.router,
    reviews.router,
    notifications.router,
    support.router,
    wishlist.router,
    manager_earnings.router,
    manager.router,
    admin.router,
    kyc.router,
    kyc.admin_router,
]:
    app.include_router(router, prefix="/api")
