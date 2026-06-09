"""add vehicle document urls

Revision ID: c3d4e5f6a7b8
Revises: a1b2c3d4e5f6
Create Date: 2026-06-09 12:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c3d4e5f6a7b8"
down_revision: Union[str, None] = "a1b2c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("vehicles", sa.Column("rc_document_url", sa.String(length=500), nullable=True))
    op.add_column("vehicles", sa.Column("insurance_document_url", sa.String(length=500), nullable=True))


def downgrade() -> None:
    op.drop_column("vehicles", "insurance_document_url")
    op.drop_column("vehicles", "rc_document_url")
