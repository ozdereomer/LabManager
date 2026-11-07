from alembic import op
import sqlalchemy as sa


revision = "c877e09e5764"
down_revision = "6d0477b3845b"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "laboratories",
        sa.Column("user_id", sa.Integer(), nullable=True)
    )

    op.execute(
        "UPDATE laboratories SET user_id = 1"
    )

    op.alter_column(
        "laboratories",
        "user_id",
        nullable=False
    )

    op.create_foreign_key(
        "fk_laboratories_user_id_users",
        "laboratories",
        "users",
        ["user_id"],
        ["id"]
    )


def downgrade():
    op.drop_constraint(
        "fk_laboratories_user_id_users",
        "laboratories",
        type_="foreignkey"
    )

    op.drop_column("laboratories", "user_id")
