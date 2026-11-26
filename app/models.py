from datetime import datetime, date
from decimal import Decimal

from sqlalchemy import (
    String,
    Integer,
    ForeignKey,
    Boolean,
    DateTime,
    Date,
    Text,
    Numeric,
    func
)

from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class Laboratory(Base):
    __tablename__ = "laboratories"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    name: Mapped[str] = mapped_column(String(100), nullable=False)

    location: Mapped[str | None] = mapped_column(String(150), nullable=True)

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"),
        nullable=False
    )

class Equipment(Base):
    __tablename__ = "equipment"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    serial_number: Mapped[str] = mapped_column(String(100), unique=True)
    status: Mapped[str] = mapped_column(String(30), default="available")

    laboratory_id: Mapped[int] = mapped_column(
        ForeignKey("laboratories.id")
    )
class MaintenanceRecord(Base):
    __tablename__ = "maintenance_records"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    equipment_id: Mapped[int] = mapped_column(
        ForeignKey("equipment.id"),
        nullable=False
    )

    maintenance_date: Mapped[date] = mapped_column(
        Date,
        nullable=False
    )

    description: Mapped[str] = mapped_column(
        Text,
        nullable=False
    )

    technician: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True
    )

    cost: Mapped[Decimal | None] = mapped_column(
        Numeric(10, 2),
        nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False
    )

class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    email: Mapped[str] = mapped_column(
        String(255),
        unique=True,
        nullable=False,
        index=True
    )

    hashed_password: Mapped[str] = mapped_column(
        String(255),
        nullable=False
    )

    is_active: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False
    )

