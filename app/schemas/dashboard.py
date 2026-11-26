from datetime import date
from decimal import Decimal

from pydantic import BaseModel


class DashboardStats(BaseModel):
    total_laboratories: int
    total_equipment: int
    available_equipment: int
    maintenance_equipment: int
    broken_equipment: int
    total_maintenance_records: int
    total_maintenance_cost: Decimal


class DashboardLaboratory(BaseModel):
    id: int
    name: str
    location: str | None
    equipment_count: int


class DashboardMaintenance(BaseModel):
    id: int
    equipment_id: int
    equipment_name: str
    maintenance_date: date
    description: str
    technician: str | None
    cost: Decimal | None


class DashboardResponse(BaseModel):
    user_email: str
    stats: DashboardStats
    laboratories: list[DashboardLaboratory]
    recent_maintenance: list[DashboardMaintenance]
