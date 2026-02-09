"""Add auth provider flags for Supabase identities.

Revision ID: 20260206_auth_provider_flags
Revises: 20260206_supabase_user_id
Create Date: 2026-02-06
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "20260206_auth_provider_flags"
down_revision: Union[str, None] = "20260206_supabase_user_id"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("auth_apple", sa.Boolean(), nullable=False, server_default=sa.text("false")))
    op.add_column("users", sa.Column("auth_google", sa.Boolean(), nullable=False, server_default=sa.text("false")))
    op.add_column("users", sa.Column("auth_microsoft", sa.Boolean(), nullable=False, server_default=sa.text("false")))


def downgrade() -> None:
    op.drop_column("users", "auth_microsoft")
    op.drop_column("users", "auth_google")
    op.drop_column("users", "auth_apple")
