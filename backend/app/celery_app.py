from celery import Celery
from celery.schedules import crontab

from app.config import settings


celery_app = Celery(
    "sigfleet",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
)
app = celery_app

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="Asia/Kolkata",
    enable_utc=True,
    imports=("app.tasks.email_tasks", "app.tasks.maintenance_tasks"),
    beat_schedule={
        "auto-cancel-unpaid-bookings": {
            "task": "app.tasks.maintenance.auto_cancel_unpaid_bookings",
            "schedule": 30 * 60,
        },
        "update-manager-status": {
            "task": "app.tasks.maintenance.update_super_manager_status",
            "schedule": crontab(hour=2, minute=0),
        },
    },
)


@celery_app.task(name="app.celery_app.ping")
def ping() -> str:
    return "pong"
