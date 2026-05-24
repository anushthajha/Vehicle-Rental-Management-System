"""rename roles and vehicle ownership

Revision ID: a1b2c3d4e5f6
Revises: 9c8b7a6d5e4f
Create Date: 2026-05-24 12:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, None] = "9c8b7a6d5e4f"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column("cars", "host_id", new_column_name="managerId", existing_type=sa.String(36))
    op.execute("UPDATE users SET role = 'customer' WHERE role = 'guest'")
    op.execute("UPDATE users SET role = 'vehicle_manager' WHERE role = 'host'")
    op.execute("ALTER TABLE users MODIFY COLUMN role ENUM('customer', 'vehicle_manager', 'admin') NOT NULL DEFAULT 'customer'")


def downgrade() -> None:
    op.execute("ALTER TABLE users MODIFY COLUMN role ENUM('guest', 'host', 'admin') NOT NULL DEFAULT 'guest'")
    op.execute("UPDATE users SET role = 'guest' WHERE role = 'customer'")
    op.execute("UPDATE users SET role = 'host' WHERE role = 'vehicle_manager'")
    op.alter_column("cars", "managerId", new_column_name="host_id", existing_type=sa.String(36))
