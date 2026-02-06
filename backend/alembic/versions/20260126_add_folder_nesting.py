"""Add folder nesting support with parent_id and depth columns.

Revision ID: 20260126_folder_nesting
Revises:
Create Date: 2026-01-26

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '20260126_folder_nesting'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add parent_id column with foreign key to self
    op.add_column('folders', sa.Column('parent_id', postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column('folders', sa.Column('depth', sa.Integer(), nullable=False, server_default='0'))

    # Create index on parent_id for efficient tree queries
    op.create_index('ix_folders_parent_id', 'folders', ['parent_id'], unique=False)

    # Create foreign key constraint for self-referential relationship
    # CASCADE delete ensures children are deleted when parent is deleted
    op.create_foreign_key(
        'fk_folders_parent_id',
        'folders',
        'folders',
        ['parent_id'],
        ['id'],
        ondelete='CASCADE'
    )


def downgrade() -> None:
    # Remove foreign key constraint
    op.drop_constraint('fk_folders_parent_id', 'folders', type_='foreignkey')

    # Remove index
    op.drop_index('ix_folders_parent_id', table_name='folders')

    # Remove columns
    op.drop_column('folders', 'depth')
    op.drop_column('folders', 'parent_id')
