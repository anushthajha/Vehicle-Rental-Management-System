"""add wishlists table

Revision ID: 7f0a9d45b8e1
Revises: 444784d636fa
Create Date: 2026-05-22 00:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "7f0a9d45b8e1"
down_revision: Union[str, None] = "444784d636fa"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "wishlists",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("car_id", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["car_id"], ["cars.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "car_id", name="uq_wishlists_user_car"),
    )
    op.create_index(op.f("ix_wishlists_car_id"), "wishlists", ["car_id"], unique=False)
    op.create_index(op.f("ix_wishlists_user_id"), "wishlists", ["user_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_wishlists_user_id"), table_name="wishlists")
    op.drop_index(op.f("ix_wishlists_car_id"), table_name="wishlists")
    op.drop_table("wishlists")
