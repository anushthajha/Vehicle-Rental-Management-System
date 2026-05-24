"""dynamic vehicle categories and types

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-05-24 18:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c3d4e5f6a7b8"
down_revision: Union[str, None] = "b2c3d4e5f6a7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


DEFAULT_CATEGORIES = [
    ("Hatchback", "hatchback", "Compact city-friendly vehicles.", "Car", 10),
    ("Sedan", "sedan", "Comfortable cars for city and highway trips.", "CarFront", 20),
    ("SUV", "suv", "Higher clearance vehicles for family and group trips.", "Truck", 30),
    ("MUV", "muv", "Multi-utility vehicles with extra seating.", "Bus", 40),
    ("Luxury", "luxury", "Premium comfort and executive vehicles.", "BadgeIndianRupee", 50),
    ("Electric", "electric", "EVs and clean mobility options.", "Zap", 60),
    ("Convertible", "convertible", "Open-top and lifestyle vehicles.", "Sun", 70),
    ("Minivan", "minivan", "Spacious people movers.", "Van", 80),
]

DEFAULT_TYPES = [
    ("Car", "car", "Passenger cars and private-use vehicles."),
    ("Bike", "bike", "Motorcycles for short and flexible trips."),
    ("Van", "van", "Vans and people movers."),
    ("Truck", "truck", "Cargo and utility trucks."),
    ("Bus", "bus", "Large passenger vehicles."),
    ("Scooter", "scooter", "Scooters and lightweight two-wheelers."),
]


def upgrade() -> None:
    op.create_table(
        "vehicle_categories",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("slug", sa.String(length=100), nullable=False),
        sa.Column("description", sa.String(length=500), nullable=True),
        sa.Column("icon_name", sa.String(length=100), nullable=True),
        sa.Column("display_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name"),
        sa.UniqueConstraint("slug"),
    )
    op.create_index(op.f("ix_vehicle_categories_slug"), "vehicle_categories", ["slug"], unique=True)
    op.create_table(
        "vehicle_types",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("slug", sa.String(length=100), nullable=False),
        sa.Column("description", sa.String(length=500), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name"),
        sa.UniqueConstraint("slug"),
    )
    op.create_index(op.f("ix_vehicle_types_slug"), "vehicle_types", ["slug"], unique=True)

    for index, (name, slug, description, icon_name, display_order) in enumerate(DEFAULT_CATEGORIES, start=1):
        op.execute(
            sa.text(
                "INSERT INTO vehicle_categories (id, name, slug, description, icon_name, display_order, is_active) "
                "VALUES (:id, :name, :slug, :description, :icon_name, :display_order, true)"
            ).bindparams(id=f"category-{index:02d}", name=name, slug=slug, description=description, icon_name=icon_name, display_order=display_order)
        )
    for index, (name, slug, description) in enumerate(DEFAULT_TYPES, start=1):
        op.execute(
            sa.text(
                "INSERT INTO vehicle_types (id, name, slug, description, is_active) "
                "VALUES (:id, :name, :slug, :description, true)"
            ).bindparams(id=f"type-{index:02d}", name=name, slug=slug, description=description)
        )

    op.add_column("cars", sa.Column("category_id", sa.String(length=36), nullable=True))
    op.add_column("cars", sa.Column("vehicle_type_id", sa.String(length=36), nullable=True))
    op.create_index(op.f("ix_cars_category_id"), "cars", ["category_id"], unique=False)
    op.create_index(op.f("ix_cars_vehicle_type_id"), "cars", ["vehicle_type_id"], unique=False)
    op.create_foreign_key("fk_cars_category_id_vehicle_categories", "cars", "vehicle_categories", ["category_id"], ["id"])
    op.create_foreign_key("fk_cars_vehicle_type_id_vehicle_types", "cars", "vehicle_types", ["vehicle_type_id"], ["id"])
    op.execute("UPDATE cars SET category_id = (SELECT id FROM vehicle_categories WHERE vehicle_categories.slug = cars.category LIMIT 1)")
    op.execute("UPDATE cars SET vehicle_type_id = 'type-01' WHERE vehicle_type_id IS NULL")
    op.drop_column("cars", "category")


def downgrade() -> None:
    op.add_column("cars", sa.Column("category", sa.String(length=100), nullable=True))
    op.execute("UPDATE cars SET category = (SELECT slug FROM vehicle_categories WHERE vehicle_categories.id = cars.category_id LIMIT 1)")
    op.execute("UPDATE cars SET category = 'hatchback' WHERE category IS NULL")
    op.alter_column("cars", "category", nullable=False)
    op.drop_constraint("fk_cars_vehicle_type_id_vehicle_types", "cars", type_="foreignkey")
    op.drop_constraint("fk_cars_category_id_vehicle_categories", "cars", type_="foreignkey")
    op.drop_index(op.f("ix_cars_vehicle_type_id"), table_name="cars")
    op.drop_index(op.f("ix_cars_category_id"), table_name="cars")
    op.drop_column("cars", "vehicle_type_id")
    op.drop_column("cars", "category_id")
    op.drop_index(op.f("ix_vehicle_types_slug"), table_name="vehicle_types")
    op.drop_table("vehicle_types")
    op.drop_index(op.f("ix_vehicle_categories_slug"), table_name="vehicle_categories")
    op.drop_table("vehicle_categories")
