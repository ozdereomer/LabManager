from pydantic import BaseModel, ConfigDict
from typing import Literal

class EquipmentCreate(BaseModel):
    name: str
    serial_number: str
    status: Literal["available", "maintenance", "broken"] = "available"
    laboratory_id: int


class EquipmentResponse(BaseModel):
    id: int
    name: str
    serial_number: str
    status: str
    laboratory_id: int

    model_config = ConfigDict(from_attributes=True)
class EquipmentUpdate(BaseModel):
    name: str
    serial_number: str
    status: Literal["available", "maintenance", "broken"]
    laboratory_id: int
