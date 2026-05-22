import uuid

from sqlalchemy import Column, DateTime, String, func


class TimestampMixin:
    created_at = Column(DateTime, default=func.now(), nullable=False)
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now(), nullable=False)


def generate_uuid() -> str:
    return str(uuid.uuid4())
