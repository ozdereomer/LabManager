from datetime import datetime

from pydantic import BaseModel, EmailStr, Field, ConfigDict


class UserProfileResponse(BaseModel):
    id: int
    email: EmailStr
    is_active: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class UserEmailUpdate(BaseModel):
    new_email: EmailStr
    current_password: str = Field(
        min_length=1,
        max_length=128
    )


class UserPasswordUpdate(BaseModel):
    current_password: str = Field(
        min_length=1,
        max_length=128
    )

    new_password: str = Field(
        min_length=8,
        max_length=128
    )


class UserSettingsResponse(BaseModel):
    message: str
