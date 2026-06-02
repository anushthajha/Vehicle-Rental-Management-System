"""fix minimum customer rating column name

Revision ID: e5f6a7b8c9d0
Revises: edbb130e31f6
Create Date: 2026-05-25 11:30:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "e5f6a7b8c9d0"
down_revision: Union[str, None] = "edbb130e31f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Column was already created with correct name in init migration
    # This rename is only needed if upgrading from an older schema
    try:
        op.alter_column("vehicles", "minimum_guest_rating", new_column_name="minimum_customer_rating", existing_type=sa.DECIMAL(precision=3, scale=2))
    except Exception:
        pass  # Column already has the correct name


def downgrade() -> None:
    pass
