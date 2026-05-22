"""extend support tickets for anonymous contact

Revision ID: 9c8b7a6d5e4f
Revises: 7f0a9d45b8e1
Create Date: 2026-05-23 00:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "9c8b7a6d5e4f"
down_revision: Union[str, None] = "7f0a9d45b8e1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column("support_tickets", "user_id", existing_type=sa.String(length=36), nullable=True)
    op.add_column("support_tickets", sa.Column("contact_name", sa.String(length=200), nullable=True))
    op.add_column("support_tickets", sa.Column("contact_email", sa.String(length=255), nullable=True))
    op.add_column("support_tickets", sa.Column("contact_phone", sa.String(length=20), nullable=True))
    op.add_column("support_tickets", sa.Column("assigned_admin_id", sa.String(length=36), nullable=True))
    op.create_foreign_key("fk_support_tickets_assigned_admin_id_users", "support_tickets", "users", ["assigned_admin_id"], ["id"])


def downgrade() -> None:
    op.drop_constraint("fk_support_tickets_assigned_admin_id_users", "support_tickets", type_="foreignkey")
    op.drop_column("support_tickets", "assigned_admin_id")
    op.drop_column("support_tickets", "contact_phone")
    op.drop_column("support_tickets", "contact_email")
    op.drop_column("support_tickets", "contact_name")
    op.alter_column("support_tickets", "user_id", existing_type=sa.String(length=36), nullable=False)
