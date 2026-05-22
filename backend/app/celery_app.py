from celery import Celery

from app.config import settings


celery_app = Celery(
    "zoomcar",
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
    imports=("app.tasks.email_tasks",),
)


@celery_app.task(name="app.celery_app.ping")
def ping() -> str:
    return "pong"
