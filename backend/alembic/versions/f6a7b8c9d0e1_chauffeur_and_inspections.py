"""chauffeur and vehicle inspections

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
Create Date: 2026-05-26 15:30:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f6a7b8c9d0e1"
down_revision: Union[str, None] = "e5f6a7b8c9d0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


inspection_condition = sa.Enum("good", "minor_damage", "major_damage", "total_loss", name="vehicle_inspection_condition")


def upgrade() -> None:
    op.add_column("bookings", sa.Column("with_chauffeur", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("bookings", sa.Column("chauffeur_fee", sa.DECIMAL(10, 2), nullable=False, server_default="0.00"))
    op.alter_column("bookings", "with_chauffeur", server_default=None)
    op.alter_column("bookings", "chauffeur_fee", server_default=None)

    inspection_condition.create(op.get_bind(), checkfirst=True)
    op.create_table(
        "vehicle_inspections",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("booking_id", sa.String(length=36), nullable=False),
        sa.Column("inspected_by", sa.String(length=36), nullable=False),
        sa.Column("inspection_time", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("condition", inspection_condition, nullable=False),
        sa.Column("damage_notes", sa.Text(), nullable=True),
        sa.Column("damage_images", sa.JSON(), nullable=True),
        sa.Column("penalty_amount", sa.DECIMAL(10, 2), nullable=False, server_default="0.00"),
        sa.Column("penalty_charged", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("penalty_reason", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["booking_id"], ["bookings.id"]),
        sa.ForeignKeyConstraint(["inspected_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("booking_id"),
    )
    op.create_index(op.f("ix_vehicle_inspections_booking_id"), "vehicle_inspections", ["booking_id"], unique=True)


def downgrade() -> None:
    op.drop_index(op.f("ix_vehicle_inspections_booking_id"), table_name="vehicle_inspections")
    op.drop_table("vehicle_inspections")
    inspection_condition.drop(op.get_bind(), checkfirst=True)
    op.drop_column("bookings", "chauffeur_fee")
    op.drop_column("bookings", "with_chauffeur")
