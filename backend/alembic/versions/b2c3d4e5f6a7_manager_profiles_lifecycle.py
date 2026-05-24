"""manager profiles lifecycle

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-05-24 15:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b2c3d4e5f6a7"
down_revision: Union[str, None] = "a1b2c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column("cars", "managerId", existing_type=sa.String(36), comment="Application layer requires users.role='vehicle_manager'.")
    op.rename_table("host_profiles", "manager_profiles")
    op.add_column("manager_profiles", sa.Column("assigned_by", sa.String(length=36), nullable=True))
    op.add_column("manager_profiles", sa.Column("department", sa.String(length=100), nullable=True))
    op.add_column("manager_profiles", sa.Column("assigned_at", sa.DateTime(), nullable=True))
    op.add_column("manager_profiles", sa.Column("total_vehicles", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("manager_profiles", sa.Column("total_bookings_handled", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("manager_profiles", sa.Column("total_revenue_generated", sa.DECIMAL(12, 2), nullable=False, server_default="0.00"))
    op.add_column("manager_profiles", sa.Column("average_vehicle_rating", sa.DECIMAL(3, 2), nullable=False, server_default="0.00"))
    op.add_column("manager_profiles", sa.Column("response_time_avg_hours", sa.DECIMAL(5, 2), nullable=True))
    op.add_column("manager_profiles", sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()))
    op.execute("UPDATE manager_profiles SET assigned_at = COALESCE(joined_as_host_at, NOW())")
    op.execute("UPDATE manager_profiles SET total_vehicles = COALESCE(total_listings, 0)")
    op.execute("UPDATE manager_profiles SET average_vehicle_rating = COALESCE(average_rating, 0)")
    op.execute(
        "UPDATE manager_profiles SET response_time_avg_hours = CASE "
        "WHEN LOWER(COALESCE(response_time, '')) LIKE '%1 hour%' THEN 1.00 "
        "WHEN LOWER(COALESCE(response_time, '')) LIKE '%day%' THEN 24.00 "
        "WHEN response_time IS NOT NULL THEN 4.00 ELSE NULL END"
    )
    op.alter_column("manager_profiles", "assigned_at", nullable=False)
    op.create_foreign_key("fk_manager_profiles_assigned_by_users", "manager_profiles", "users", ["assigned_by"], ["id"])
    op.drop_column("manager_profiles", "response_time")
    op.drop_column("manager_profiles", "total_listings")
    op.drop_column("manager_profiles", "average_rating")
    op.drop_column("manager_profiles", "joined_as_host_at")


def downgrade() -> None:
    op.alter_column("cars", "managerId", existing_type=sa.String(36), comment=None)
    op.add_column("manager_profiles", sa.Column("joined_as_host_at", sa.DateTime(), nullable=True))
    op.add_column("manager_profiles", sa.Column("average_rating", sa.DECIMAL(3, 2), nullable=False, server_default="0.00"))
    op.add_column("manager_profiles", sa.Column("total_listings", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("manager_profiles", sa.Column("response_time", sa.String(length=100), nullable=True))
    op.execute("UPDATE manager_profiles SET joined_as_host_at = assigned_at")
    op.execute("UPDATE manager_profiles SET average_rating = average_vehicle_rating")
    op.execute("UPDATE manager_profiles SET total_listings = total_vehicles")
    op.execute(
        "UPDATE manager_profiles SET response_time = CASE "
        "WHEN response_time_avg_hours <= 1 THEN 'Within 1 hour' "
        "WHEN response_time_avg_hours <= 24 THEN CONCAT('Within ', ROUND(response_time_avg_hours), ' hours') "
        "ELSE NULL END"
    )
    op.alter_column("manager_profiles", "joined_as_host_at", nullable=False)
    op.drop_constraint("fk_manager_profiles_assigned_by_users", "manager_profiles", type_="foreignkey")
    op.drop_column("manager_profiles", "is_active")
    op.drop_column("manager_profiles", "response_time_avg_hours")
    op.drop_column("manager_profiles", "average_vehicle_rating")
    op.drop_column("manager_profiles", "total_revenue_generated")
    op.drop_column("manager_profiles", "total_bookings_handled")
    op.drop_column("manager_profiles", "total_vehicles")
    op.drop_column("manager_profiles", "assigned_at")
    op.drop_column("manager_profiles", "department")
    op.drop_column("manager_profiles", "assigned_by")
    op.rename_table("manager_profiles", "host_profiles")
