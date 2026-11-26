from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class MaintenanceCreate(BaseModel):
    equipment_id: int
    maintenance_date: date
    description: str = Field(min_length=1)
    technician: str | None = Field(default=None, max_length=100)
    cost: Decimal | None = Field(default=None, ge=0)


class MaintenanceUpdate(BaseModel):
    equipment_id: int
    maintenance_date: date
    description: str = Field(min_length=1)
    technician: str | None = Field(default=None, max_length=100)
    cost: Decimal | None = Field(default=None, ge=0)


class MaintenanceResponse(BaseModel):
    id: int
    equipment_id: int
    maintenance_date: date
    description: str
    technician: str | None
    cost: Decimal | None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
