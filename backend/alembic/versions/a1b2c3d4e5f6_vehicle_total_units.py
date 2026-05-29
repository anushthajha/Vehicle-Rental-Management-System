"""add total_units to vehicles

Revision ID: a1b2c3d4e5f6
Revises: f6a7b8c9d0e1
Create Date: 2026-05-29 12:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, None] = "f6a7b8c9d0e1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "vehicles",
        sa.Column("total_units", sa.Integer(), nullable=False, server_default="1"),
    )
    # Remove server default so SQLAlchemy model controls it going forward
    op.alter_column("vehicles", "total_units", server_default=None)


def downgrade() -> None:
    op.drop_column("vehicles", "total_units")
