"""add token version to users

Revision ID: a71c92e4b605
Revises: e05928f3d7f3
"""

from alembic import op
import sqlalchemy as sa


revision = "a71c92e4b605"
down_revision = "e05928f3d7f3"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "users",
        sa.Column(
            "token_version",
            sa.Integer(),
            server_default=sa.text("0"),
            nullable=False
        )
    )


def downgrade():
    op.drop_column("users", "token_version")
