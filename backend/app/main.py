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
    agent,
    admin,
    auth,
    availability,
    bookings,
    chatbot,
    coupons,
    help_assistant,
    inspections,
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
    if settings.OPENROUTER_API_KEY:
        masked = "*" * 20 + settings.OPENROUTER_API_KEY[-6:]
        print(f"✅ OpenRouter API key configured ({masked})")
    else:
        print("⚠️  WARNING: OPENROUTER_API_KEY not set — chatbot will not work")
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
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)
app.add_middleware(OptionalAuthMiddleware)
register_error_handlers(app)

app.mount("/uploads", StaticFiles(directory=settings.UPLOAD_DIR), name="uploads")

@app.get("/")
async def root():
    return {
        "message": "SigFleet Backend Running",
        "docs": "/api/docs",
        "health": "/api/health"
    }
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
    agent.router,
    auth.router,
    chatbot.router,
    help_assistant.router,
    users.router,
    vehicles.router,
    vehicles.vehicles_router,
    availability.router,
    categories.router,
    bookings.router,
    coupons.router,
    inspections.router,
    inspections.admin_router,
    payments.router,
    payments.wallet_router,
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
