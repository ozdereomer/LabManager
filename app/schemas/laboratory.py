from pydantic import BaseModel, ConfigDict


class LaboratoryCreate(BaseModel):
    name: str
    location: str | None = None


class LaboratoryResponse(BaseModel):
    id: int
    name: str
    location: str | None

    model_config = ConfigDict(from_attributes=True)
class LaboratoryUpdate(BaseModel):
    name: str
    location: str | None = None
