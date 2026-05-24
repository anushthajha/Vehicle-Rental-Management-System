"""prd terminology rename

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-05-24 23:45:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "d4e5f6a7b8c9"
down_revision: Union[str, None] = "c3d4e5f6a7b8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.rename_table("cars", "vehicles")
    op.rename_table("host_payout_requests", "manager_payout_requests")

    op.alter_column("users", "is_host", new_column_name="is_vehicle_manager", existing_type=sa.Boolean())
    op.alter_column("vehicles", "managerId", new_column_name="manager_id", existing_type=sa.String(36))
    op.alter_column("bookings", "car_id", new_column_name="vehicle_id", existing_type=sa.String(36))
    op.alter_column("bookings", "guest_id", new_column_name="customer_id", existing_type=sa.String(36))
    op.alter_column("bookings", "host_id", new_column_name="manager_id", existing_type=sa.String(36))
    op.alter_column("bookings", "host_earnings", new_column_name="manager_earnings", existing_type=sa.DECIMAL(10, 2))
    op.alter_column("bookings", "guest_notes", new_column_name="customer_notes", existing_type=sa.Text())
    op.alter_column("bookings", "host_accepted_at", new_column_name="manager_accepted_at", existing_type=sa.DateTime())

    op.alter_column("car_images", "car_id", new_column_name="vehicle_id", existing_type=sa.String(36))
    op.alter_column("car_availability_blocks", "car_id", new_column_name="vehicle_id", existing_type=sa.String(36))
    op.alter_column("car_pricing_rules", "car_id", new_column_name="vehicle_id", existing_type=sa.String(36))
    op.alter_column("wishlists", "car_id", new_column_name="vehicle_id", existing_type=sa.String(36))
    op.alter_column("manager_payout_requests", "host_id", new_column_name="manager_id", existing_type=sa.String(36))
    op.alter_column("manager_profiles", "is_superhost", new_column_name="is_super_manager", existing_type=sa.Boolean())


def downgrade() -> None:
    op.alter_column("manager_profiles", "is_super_manager", new_column_name="is_superhost", existing_type=sa.Boolean())
    op.alter_column("manager_payout_requests", "manager_id", new_column_name="host_id", existing_type=sa.String(36))
    op.alter_column("wishlists", "vehicle_id", new_column_name="car_id", existing_type=sa.String(36))
    op.alter_column("car_pricing_rules", "vehicle_id", new_column_name="car_id", existing_type=sa.String(36))
    op.alter_column("car_availability_blocks", "vehicle_id", new_column_name="car_id", existing_type=sa.String(36))
    op.alter_column("car_images", "vehicle_id", new_column_name="car_id", existing_type=sa.String(36))

    op.alter_column("bookings", "manager_accepted_at", new_column_name="host_accepted_at", existing_type=sa.DateTime())
    op.alter_column("bookings", "customer_notes", new_column_name="guest_notes", existing_type=sa.Text())
    op.alter_column("bookings", "manager_earnings", new_column_name="host_earnings", existing_type=sa.DECIMAL(10, 2))
    op.alter_column("bookings", "manager_id", new_column_name="host_id", existing_type=sa.String(36))
    op.alter_column("bookings", "customer_id", new_column_name="guest_id", existing_type=sa.String(36))
    op.alter_column("bookings", "vehicle_id", new_column_name="car_id", existing_type=sa.String(36))
    op.alter_column("vehicles", "manager_id", new_column_name="managerId", existing_type=sa.String(36))
    op.alter_column("users", "is_vehicle_manager", new_column_name="is_host", existing_type=sa.Boolean())

    op.rename_table("manager_payout_requests", "host_payout_requests")
    op.rename_table("vehicles", "cars")
